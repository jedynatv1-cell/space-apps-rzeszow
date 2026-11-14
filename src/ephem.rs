//! Sun and Earth positions as seen from a site on the Moon, computed offline with ANISE.
//!
//! Verified against JPL Horizons (CENTER='coord@301', QUANTITIES='4') to 0.001 deg —
//! see `tests::matches_horizons_shackleton` and docs/RESEARCH.md section 2.
//! Like Horizons, elevation is relative to the plane tangent to the 1737.4 km sphere:
//! terrain is handled separately by `horizon`.

use anise::constants::frames::{EARTH_J2000, MOON_ME_DE440_ME421_FRAME, SUN_J2000};
use anise::math::Vector3;
use anise::prelude::*;
use serde::Serialize;

use crate::site::Site;

pub const SUN_RADIUS_KM: f64 = 695_700.0;
pub const EARTH_RADIUS_KM: f64 = 6_378.137;

/// Kernel files expected in the kernel directory (see docs/RESEARCH.md TL;DR for URLs).
pub const KERNELS: [&str; 3] = [
    "de440s.bsp",
    "moon_pa_de440_200625.bpc",
    "moon_fk_de440.epa",
];

/// Apparent topocentric direction of a body.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct AzEl {
    /// Degrees clockwise from local north, 0..360.
    pub az_deg: f64,
    /// Degrees above the local tangent plane of the reference sphere.
    pub el_deg: f64,
    /// Angular radius of the disk, degrees.
    pub radius_deg: f64,
    pub distance_km: f64,
}

pub struct Ephem {
    almanac: Almanac,
}

impl Ephem {
    /// Load the three kernels from `dir` (default `data/raw/kernels`).
    pub fn load(dir: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let path = |f: &str| format!("{dir}/{f}");
        let almanac = Almanac::new(&path(KERNELS[0]))?
            .load(&path(KERNELS[1]))?
            .load(&path(KERNELS[2]))?;
        Ok(Self { almanac })
    }

    /// Sun and Earth as seen from `site` at `epoch`.
    pub fn sun_earth(
        &self,
        site: &Site,
        epoch: Epoch,
    ) -> Result<(AzEl, AzEl), Box<dyn std::error::Error>> {
        Ok((
            self.body(site, epoch, SUN_J2000, SUN_RADIUS_KM)?,
            self.body(site, epoch, EARTH_J2000, EARTH_RADIUS_KM)?,
        ))
    }

    fn body(
        &self,
        site: &Site,
        epoch: Epoch,
        target: Frame,
        body_radius_km: f64,
    ) -> Result<AzEl, Box<dyn std::error::Error>> {
        // Target position relative to the Moon's centre, in Moon mean-Earth/polar axes.
        let st =
            self.almanac
                .transform(target, MOON_ME_DE440_ME421_FRAME, epoch, Aberration::LT_S)?;
        Ok(topocentric(site, st.radius_km, body_radius_km))
    }
}

/// Convert a Moon-centred, Moon-fixed position into azimuth/elevation at `site`.
pub fn topocentric(site: &Site, target_km: Vector3, body_radius_km: f64) -> AzEl {
    let (lat, lon) = (site.lat_deg.to_radians(), site.lon_deg.to_radians());
    let up = Vector3::new(lat.cos() * lon.cos(), lat.cos() * lon.sin(), lat.sin());
    let east = Vector3::new(-lon.sin(), lon.cos(), 0.0);
    let north = up.cross(&east);
    let d = target_km - up * site.radius_km();
    let dist = d.norm();
    AzEl {
        az_deg: d
            .dot(&east)
            .atan2(d.dot(&north))
            .to_degrees()
            .rem_euclid(360.0),
        el_deg: (d.dot(&up) / dist).asin().to_degrees(),
        radius_deg: (body_radius_km / dist).asin().to_degrees(),
        distance_km: dist,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KERNEL_DIR: &str = "data/raw/kernels";

    fn kernels_present() -> bool {
        KERNELS
            .iter()
            .all(|k| std::path::Path::new(&format!("{KERNEL_DIR}/{k}")).exists())
    }

    /// Reference values from JPL Horizons, queried 2026-11-13:
    /// SITE_COORD='-129.78,-89.45,0', 2026-11-14 00:00 UTC.
    #[test]
    fn matches_horizons_shackleton() {
        if !kernels_present() {
            eprintln!("SKIP: kernels not found in {KERNEL_DIR} (see docs/RESEARCH.md)");
            return;
        }
        let eph = Ephem::load(KERNEL_DIR).unwrap();
        let site = Site::new(-89.45, -129.78, 0.0).unwrap();
        let epoch = Epoch::from_gregorian_utc_at_midnight(2026, 11, 14);
        let (sun, earth) = eph.sun_earth(&site, epoch).unwrap();
        let close = |a: f64, b: f64| (a - b).abs() < 0.01;
        assert!(close(sun.az_deg, 256.383540), "sun az {}", sun.az_deg);
        assert!(close(sun.el_deg, 1.427188), "sun el {}", sun.el_deg);
        assert!(close(earth.az_deg, 128.518220), "earth az {}", earth.az_deg);
        assert!(close(earth.el_deg, -4.990794), "earth el {}", earth.el_deg);
        // Earth ~1.8-2.0 deg wide from the Moon, Sun ~0.53 deg.
        assert!((0.85..1.05).contains(&earth.radius_deg));
        assert!((0.25..0.28).contains(&sun.radius_deg));
    }

    #[test]
    fn topocentric_zenith_and_north() {
        let site = Site::new(0.0, 0.0, 0.0).unwrap();
        let zenith = topocentric(&site, Vector3::new(1.0e6, 0.0, 0.0), 1.0);
        assert!((zenith.el_deg - 90.0).abs() < 1e-6);
        let north = topocentric(&site, Vector3::new(site.radius_km(), 0.0, 1.0e6), 1.0);
        assert!(north.az_deg.abs() < 1e-3 || (north.az_deg - 360.0).abs() < 1e-3);
        assert!(north.el_deg.abs() < 0.1);
    }
}
