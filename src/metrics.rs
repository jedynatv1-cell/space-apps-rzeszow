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
