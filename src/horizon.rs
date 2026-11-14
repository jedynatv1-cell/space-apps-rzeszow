//! Horizon mask: the elevation of the local skyline for every azimuth.
//!
//! Without terrain the horizon of an observer at height h above a sphere of radius R
//! dips below the tangent plane by acos(R / (R + h)). Terrain from LOLA (`dem`) raises it.

use serde::Serialize;

use crate::site::{MOON_RADIUS_KM, Site};

#[derive(Debug, Clone, Serialize)]
pub struct HorizonMask {
    /// Azimuth spacing, degrees. `elev_deg[i]` is the skyline at azimuth `i * az_step_deg`.
    pub az_step_deg: f64,
    pub elev_deg: Vec<f64>,
    /// "sphere" (no terrain) or "lola:<product>".
    pub source: String,
}

impl HorizonMask {
    /// Smooth-sphere horizon (no terrain), `n` azimuth samples.
    pub fn sphere(site: &Site, n: usize) -> Self {
        let r = MOON_RADIUS_KM;
        let h = site.radius_km() - r;
        let dip = if h > 0.0 {
            -(r / (r + h)).acos().to_degrees()
        } else {
            0.0
        };
        Self {
            az_step_deg: 360.0 / n as f64,
            elev_deg: vec![dip; n],
            source: "sphere".into(),
        }
    }

    /// Skyline elevation at an arbitrary azimuth (linear interpolation, wraps at 360).
    pub fn at(&self, az_deg: f64) -> f64 {
        let n = self.elev_deg.len();
        let x = az_deg.rem_euclid(360.0) / self.az_step_deg;
        let i = x.floor() as usize % n;
        let j = (i + 1) % n;
        let t = x - x.floor();
        self.elev_deg[i] * (1.0 - t) + self.elev_deg[j] * t
    }
}

/// Fraction (0..1) of a disk of angular radius `r` centred at elevation `el` that is
/// above a locally flat skyline at elevation `h`.
pub fn disk_fraction_above(el: f64, r: f64, h: f64) -> f64 {
    let x = (el - h) / r;
    if x >= 1.0 {
        1.0
    } else if x <= -1.0 {
        0.0
    } else {
        1.0 - (x.acos() - x * (1.0 - x * x).sqrt()) / std::f64::consts::PI
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disk_fraction_limits() {
        assert_eq!(disk_fraction_above(1.0, 0.25, 0.0), 1.0);
        assert_eq!(disk_fraction_above(-1.0, 0.25, 0.0), 0.0);
        assert!((disk_fraction_above(0.0, 0.25, 0.0) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn sphere_dip_for_mast() {
        // 10 m mast: dip = acos(1737.4 / 1737.41) ~ 0.19 deg
        let site = Site::new(-89.0, 0.0, 10.0).unwrap();
        let m = HorizonMask::sphere(&site, 360);
        assert!((m.at(123.4) + 0.1945).abs() < 0.01, "{}", m.at(123.4));
    }

    #[test]
    fn interpolation_wraps() {
        let m = HorizonMask {
            az_step_deg: 90.0,
            elev_deg: vec![0.0, 1.0, 2.0, 3.0],
            source: "test".into(),
        };
        assert!((m.at(45.0) - 0.5).abs() < 1e-12);
        assert!((m.at(315.0) - 1.5).abs() < 1e-12);
        assert!((m.at(-45.0) - 1.5).abs() < 1e-12);
    }
}
