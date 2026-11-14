//! Time series and mission metrics: sunlight, Earth visibility (DTE), next sunset/Earthset.

use anise::prelude::*;
use serde::Serialize;

use crate::ephem::{AzEl, Ephem};
use crate::horizon::{HorizonMask, disk_fraction_above};
use crate::site::Site;

#[derive(Debug, Clone, Serialize)]
pub struct TrackPoint {
    /// ISO 8601 UTC.
    pub t: String,
    pub sun: AzEl,
    pub earth: AzEl,
    /// Skyline elevation in the direction of the Sun / Earth.
    pub sun_horizon_deg: f64,
    pub earth_horizon_deg: f64,
    /// Fraction of the solar disk above the skyline, 0..1.
    pub sun_vis: f64,
    /// Fraction of Earth's disk above the skyline, 0..1.
    pub earth_vis: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Window {
    pub start: String,
    pub end: String,
    pub hours: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Summary {
    /// Time-averaged fraction of the solar disk visible (≈ relative solar energy).
    pub sun_mean_fraction: f64,
    /// % of time with any part of the Sun visible.
    pub sun_visible_pct: f64,
    /// % of time with Earth's centre above the skyline + DTE margin.
    pub earth_visible_pct: f64,
    pub longest_night_hours: f64,
    pub longest_dte_gap_hours: f64,
    /// First time after the start when the Sun fully sets / Earth's centre drops below margin.
    pub next_sunset: Option<String>,
    pub next_earthset: Option<String>,
    pub hours_to_sunset: Option<f64>,
    pub hours_to_earthset: Option<f64>,
    pub sunlight_windows: Vec<Window>,
    pub dte_windows: Vec<Window>,
}

pub struct TrackRequest {
    pub site: Site,
    pub start: Epoch,
    pub end: Epoch,
    pub step: Duration,
    /// Earth's centre must be this many degrees above the skyline for DTE.
    pub dte_margin_deg: f64,
}

pub fn track(
    eph: &Ephem,
    mask: &HorizonMask,
    req: &TrackRequest,
) -> Result<Vec<TrackPoint>, Box<dyn std::error::Error>> {
    let mut out = Vec::new();
    let mut t = req.start;
    while t <= req.end {
        let (sun, earth) = eph.sun_earth(&req.site, t)?;
        let sh = mask.at(sun.az_deg);
        let eh = mask.at(earth.az_deg);
        out.push(TrackPoint {
            t: iso(t),
            sun,
            earth,
            sun_horizon_deg: sh,
            earth_horizon_deg: eh,
            sun_vis: disk_fraction_above(sun.el_deg, sun.radius_deg, sh),
            earth_vis: disk_fraction_above(earth.el_deg, earth.radius_deg, eh),
        });
        t += req.step;
    }
    Ok(out)
}

/// Local east/north/up unit vectors (Moon-fixed) at a site.
fn enu(site: &Site) -> [[f64; 3]; 3] {
    let (sp, cp) = site.lat_deg.to_radians().sin_cos();
    let (sl, cl) = site.lon_deg.to_radians().sin_cos();
    [
        [-sl, cl, 0.0],
        [-sp * cl, -sp * sl, cp],
        [cp * cl, cp * sl, sp],
    ]
}

/// Re-express a direction seen from `from` in the local frame of `to`. Near the pole a
/// few hundred metres rotate local north by degrees, so azimuths must be transformed;
/// the parallax of the shift itself (< 0.02 deg for 500 m) is neglected.
fn transfer(d: &AzEl, from: &[[f64; 3]; 3], to: &[[f64; 3]; 3]) -> AzEl {
    let (sa, ca) = d.az_deg.to_radians().sin_cos();
    let (se, ce) = d.el_deg.to_radians().sin_cos();
    let local = [ce * sa, ce * ca, se];
    let v: [f64; 3] = std::array::from_fn(|k| (0..3).map(|i| local[i] * from[i][k]).sum());
    let dot = |b: &[f64; 3]| v[0] * b[0] + v[1] * b[1] + v[2] * b[2];
    let (e, n, u) = (dot(&to[0]), dot(&to[1]), dot(&to[2]));
    AzEl {
        az_deg: e.atan2(n).to_degrees().rem_euclid(360.0),
        el_deg: u.clamp(-1.0, 1.0).asin().to_degrees(),
        ..*d
    }
}

/// Re-evaluate a track computed at `from` for a nearby site `to` with its own mask,
/// without re-running the ephemeris (used by the best-nearby search).
pub fn remask(
    points: &[TrackPoint],
    from: &Site,
    to: &Site,
    mask: &HorizonMask,
) -> Vec<TrackPoint> {
    let (bf, bt) = (enu(from), enu(to));
    points
        .iter()
        .map(|p| {
            let (sun, earth) = (transfer(&p.sun, &bf, &bt), transfer(&p.earth, &bf, &bt));
            let (sh, eh) = (mask.at(sun.az_deg), mask.at(earth.az_deg));
            TrackPoint {
                t: p.t.clone(),
                sun,
                earth,
                sun_horizon_deg: sh,
                earth_horizon_deg: eh,
                sun_vis: disk_fraction_above(sun.el_deg, sun.radius_deg, sh),
                earth_vis: disk_fraction_above(earth.el_deg, earth.radius_deg, eh),
            }
        })
        .collect()
}

pub fn summarize(points: &[TrackPoint], step_hours: f64, dte_margin_deg: f64) -> Summary {
    let n = points.len().max(1) as f64;
    let sun_on: Vec<bool> = points.iter().map(|p| p.sun_vis > 0.0).collect();
    let dte_on: Vec<bool> = points
        .iter()
        .map(|p| p.earth.el_deg - p.earth_horizon_deg >= dte_margin_deg)
        .collect();

    let sunlight_windows = windows(points, &sun_on, step_hours);
    let dte_windows = windows(points, &dte_on, step_hours);
    let first_off = |on: &[bool]| {
        // Only a "set" if it was up at some point before going down.
        let up = on.iter().position(|&b| b)?;
        on[up..].iter().position(|&b| !b).map(|i| i + up)
    };
    let next_sunset = first_off(&sun_on);
    let next_earthset = first_off(&dte_on);

    Summary {
        sun_mean_fraction: points.iter().map(|p| p.sun_vis).sum::<f64>() / n,
        sun_visible_pct: 100.0 * sun_on.iter().filter(|&&b| b).count() as f64 / n,
        earth_visible_pct: 100.0 * dte_on.iter().filter(|&&b| b).count() as f64 / n,
        longest_night_hours: longest_run(&sun_on, false) as f64 * step_hours,
        longest_dte_gap_hours: longest_run(&dte_on, false) as f64 * step_hours,
        next_sunset: next_sunset.map(|i| points[i].t.clone()),
        next_earthset: next_earthset.map(|i| points[i].t.clone()),
        hours_to_sunset: next_sunset.map(|i| i as f64 * step_hours),
        hours_to_earthset: next_earthset.map(|i| i as f64 * step_hours),
        sunlight_windows,
        dte_windows,
    }
}

fn longest_run(on: &[bool], value: bool) -> usize {
    let (mut best, mut cur) = (0, 0);
    for &b in on {
        cur = if b == value { cur + 1 } else { 0 };
        best = best.max(cur);
    }
    best
}

fn windows(points: &[TrackPoint], on: &[bool], step_hours: f64) -> Vec<Window> {
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    for (i, &b) in on.iter().enumerate() {
        match (b, start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                out.push(window(points, s, i - 1, step_hours));
                start = None;
            }
            _ => {}
        }
    }
    if let Some(s) = start {
        out.push(window(points, s, on.len() - 1, step_hours));
    }
    out
}

fn window(points: &[TrackPoint], s: usize, e: usize, step_hours: f64) -> Window {
    Window {
        start: points[s].t.clone(),
        end: points[e].t.clone(),
        hours: (e - s + 1) as f64 * step_hours,
    }
}

pub fn iso(t: Epoch) -> String {
    let (y, mo, d, h, mi, s, _) = t.to_gregorian_utc();
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_and_windows() {
        assert_eq!(longest_run(&[true, false, false, true, false], false), 2);
        assert_eq!(longest_run(&[], true), 0);
    }

    #[test]
    fn iso_format() {
        let t = Epoch::from_gregorian_utc(2026, 11, 14, 9, 5, 7, 0);
        assert_eq!(iso(t), "2026-11-14T09:05:07Z");
    }
}

#[cfg(test)]
mod remask_tests {
    use super::*;

    fn d(az: f64, el: f64) -> AzEl {
        AzEl {
            az_deg: az,
            el_deg: el,
            radius_deg: 0.27,
            distance_km: 1.5e8,
        }
    }

    #[test]
    fn transfer_identity_and_meridian_convergence() {
        let a = Site::new(-89.68, -166.0, 0.0).unwrap();
        let ba = enu(&a);
        let same = transfer(&d(123.0, 1.5), &ba, &ba);
        assert!((same.az_deg - 123.0).abs() < 1e-9 && (same.el_deg - 1.5).abs() < 1e-9);
        // 500 m east of a point 10 km from the pole: local north turns by ~2.9 deg,
        // matching the ephemeris run directly at the shifted site (checked when kernels exist).
        let (lat, lon) = crate::horizon::move_by(a.lat_deg, a.lon_deg, 90.0, 500.0);
        let b = Site::new(lat, lon, 0.0).unwrap();
        let moved = transfer(&d(123.0, 1.5), &ba, &enu(&b));
        let turn = (moved.az_deg - 123.0).abs();
        assert!((2.0..4.0).contains(&turn), "turn {turn}");
        let Ok(eph) = Ephem::load("data/raw/kernels") else {
            return;
        };
        let t = Epoch::from_gregorian_utc_at_midnight(2026, 11, 20);
        let (sa, ea) = eph.sun_earth(&a, t).unwrap();
        let (sb, eb) = eph.sun_earth(&b, t).unwrap();
        for (x, y) in [
            (transfer(&sa, &ba, &enu(&b)), sb),
            (transfer(&ea, &ba, &enu(&b)), eb),
        ] {
            assert!(
                (x.az_deg - y.az_deg).abs() < 0.05,
                "{} vs {}",
                x.az_deg,
                y.az_deg
            );
            assert!(
                (x.el_deg - y.el_deg).abs() < 0.05,
                "{} vs {}",
                x.el_deg,
                y.el_deg
            );
        }
    }
}
