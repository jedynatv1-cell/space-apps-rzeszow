//! Horizon mask: the elevation of the local skyline for every azimuth.
//!
//! Without terrain the horizon of an observer at height h above a sphere of radius R
//! dips below the tangent plane by acos(R / (R + h)). Terrain from LOLA (`dem`) raises it.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use serde::Serialize;

use crate::dem::{self, Dem};
use crate::site::{MOON_RADIUS_KM, Site};

/// Azimuth samples of every mask the API returns (0.5 deg).
pub const MASK_SAMPLES: usize = 720;

/// Farthest terrain considered by the ray march, metres. A 5 km massif seen from
/// another 5 km massif is visible out to ~2 * sqrt(2 R h) ~ 260 km.
const MAX_RANGE_M: f64 = 300_000.0;

#[derive(Debug, Clone, Serialize)]
pub struct HorizonMask {
    /// Azimuth spacing, degrees. `elev_deg[i]` is the skyline at azimuth `i * az_step_deg`.
    pub az_step_deg: f64,
    pub elev_deg: Vec<f64>,
    /// "sphere" (no terrain) or "lola:<product>".
    pub source: String,
    /// Terrain height under the observer, metres above the 1737.4 km sphere
    /// (only for terrain masks; the observer sits `alt_m` above this ground).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ground_m: Option<f64>,
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
            ground_m: None,
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

/// Upper bound on terrain height in the polar DEMs (m above 1737.4 km), used to stop
/// a ray once no farther terrain can rise above the skyline found so far.
const MAX_TERRAIN_M: f64 = 11_000.0;

/// Height (m) at lat/lon from the first (finest) product that covers it.
fn height(dems: &[Dem], lat: f64, lon: f64) -> Option<f64> {
    dems.iter().find_map(|d| d.height_m(lat, lon))
}

/// Point reached from (`lat0`, `lon0`) along azimuth `az` (radians, clockwise from
/// north) after a central angle `theta` (radians). Returns degrees.
fn destination(sin_lat0: f64, cos_lat0: f64, lon0: f64, az: f64, theta: f64) -> (f64, f64) {
    let (st, ct) = theta.sin_cos();
    let sin_lat = (sin_lat0 * ct + cos_lat0 * st * az.cos()).clamp(-1.0, 1.0);
    let lon = lon0.to_radians() + (az.sin() * st * cos_lat0).atan2(ct - sin_lat0 * sin_lat);
    (sin_lat.asin().to_degrees(), lon.to_degrees())
}

/// Elevation (radians) of a point at radius `rt`, central angle `theta` away, seen from
/// radius `ro`, relative to the observer's tangent plane (exact curvature correction).
fn elevation(ro: f64, rt: f64, theta: f64) -> f64 {
    (rt * theta.cos() - ro).atan2(rt * theta.sin())
}

/// Skyline elevation (degrees) along one azimuth: march outwards over the DEM and keep
/// the highest terrain elevation angle.
fn skyline(dems: &[Dem], site: &Site, ro: f64, min_step_m: f64, az: f64) -> f64 {
    let r = MOON_RADIUS_KM * 1000.0;
    let (sin_lat0, cos_lat0) = site.lat_deg.to_radians().sin_cos();
    let mut best = f64::NEG_INFINITY;
    let mut d = min_step_m;
    let mut left_dem = false;
    while d <= MAX_RANGE_M {
        let theta = d / r;
        if elevation(ro, r + MAX_TERRAIN_M, theta) < best {
            break; // nothing farther can rise above the current skyline
        }
        let (lat, lon) = destination(sin_lat0, cos_lat0, site.lon_deg, az, theta);
        match height(dems, lat, lon) {
            Some(h) => best = best.max(elevation(ro, r + h, theta)),
            None => {
                left_dem = true;
                break;
            }
        }
        // Full DEM resolution nearby, then 0.4 % of the range (~1.2 km at 300 km).
        d += (d * 0.004).max(min_step_m);
    }
    if left_dem || best == f64::NEG_INFINITY {
        // Beyond the DEM, assume terrain at the reference sphere.
        best = best.max(-(r / ro).min(1.0).acos());
    }
    best.to_degrees()
}

/// Terrain horizon from LOLA DEMs (`dems` finest first), `n` azimuth samples.
/// The observer stands `site.alt_m` (clamped to >= 0) above the DEM ground.
/// Returns `None` when no product covers the site.
pub fn from_dem(dems: &[Dem], site: &Site, n: usize) -> Option<HorizonMask> {
    let (dem, ground) = dems
        .iter()
        .find_map(|d| d.height_m(site.lat_deg, site.lon_deg).map(|h| (d, h)))?;
    let ro = MOON_RADIUS_KM * 1000.0 + ground + site.alt_m.max(0.0);
    let min_step = dem.label.map_scale_m;
    let az_step = 360.0 / n as f64;

    // Azimuths are independent: split them across threads.
    let mut elev = vec![0.0; n];
    let threads = std::thread::available_parallelism().map_or(4, |p| p.get().min(16));
    let chunk = n.div_ceil(threads).max(1);
    std::thread::scope(|scope| {
        for (c, out) in elev.chunks_mut(chunk).enumerate() {
            scope.spawn(move || {
                for (k, e) in out.iter_mut().enumerate() {
                    let az = ((c * chunk + k) as f64 * az_step).to_radians();
                    *e = skyline(dems, site, ro, min_step, az);
                }
            });
        }
    });

    Some(HorizonMask {
        az_step_deg: az_step,
        elev_deg: elev,
        source: format!("lola:{}", dem.name),
        ground_m: Some(ground),
    })
}

/// LOLA products from `DEM_DIR` (default `data/raw/dem`), opened once, plus the
/// per-site mask cache.
struct Terrain {
    dems: Vec<Dem>,
    cache: Mutex<HashMap<(i64, i64, i64), Arc<HorizonMask>>>,
}

/// Bound on cached masks (~6 KB each); the cache is cleared when it fills up.
const CACHE_MAX: usize = 1024;

fn terrain() -> &'static Terrain {
    static TERRAIN: OnceLock<Terrain> = OnceLock::new();
    TERRAIN.get_or_init(|| {
        let dir = std::env::var("DEM_DIR").unwrap_or_else(|_| "data/raw/dem".into());
        let dems = dem::available_products(&dir)
            .iter()
            .filter_map(|p| {
                Dem::open(&dir, p)
                    .map_err(|e| eprintln!("DEM {p} not used: {e}"))
                    .ok()
            })
            .collect();
        Terrain {
            dems,
            cache: Mutex::new(HashMap::new()),
        }
    })
}

/// Uncached terrain mask from the loaded DEMs, `None` outside them (for searches over
/// many nearby points that should not flood the per-site cache).
pub fn terrain_mask(site: &Site) -> Option<HorizonMask> {
    from_dem(&terrain().dems, site, MASK_SAMPLES)
}

/// Point `dist_m` metres from (`lat`, `lon`) along azimuth `az_deg` (clockwise from
/// north) on the reference sphere. Returns (lat, lon) in degrees, lon in -180..180.
pub fn move_by(lat: f64, lon: f64, az_deg: f64, dist_m: f64) -> (f64, f64) {
    let (s, c) = lat.to_radians().sin_cos();
    let theta = dist_m / (MOON_RADIUS_KM * 1000.0);
    let (la, lo) = destination(s, c, lon, az_deg.to_radians(), theta);
    (la, (lo + 180.0).rem_euclid(360.0) - 180.0)
}

/// Horizon for a site: LOLA terrain when a loaded DEM covers it, otherwise the smooth
/// sphere. Cached per (lat, lon, alt), so repeated requests for a site are instant.
pub fn for_site(site: &Site) -> Arc<HorizonMask> {
    let t = terrain();
    let key = (
        (site.lat_deg * 1e6).round() as i64,
        (site.lon_deg.rem_euclid(360.0) * 1e6).round() as i64,
        (site.alt_m * 100.0).round() as i64,
    );
    let lock = || t.cache.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(m) = lock().get(&key) {
        return m.clone();
    }
    // Computed outside the lock: two concurrent first requests may both compute; harmless.
    let mask = Arc::new(
        from_dem(&t.dems, site, MASK_SAMPLES)
            .unwrap_or_else(|| HorizonMask::sphere(site, MASK_SAMPLES)),
    );
    let mut cache = lock();
    if cache.len() >= CACHE_MAX {
        cache.clear();
    }
    cache.insert(key, mask.clone());
    mask
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
            ground_m: None,
        };
        assert!((m.at(45.0) - 0.5).abs() < 1e-12);
        assert!((m.at(315.0) - 1.5).abs() < 1e-12);
        assert!((m.at(-45.0) - 1.5).abs() < 1e-12);
    }

    #[test]
    fn destination_crosses_the_pole() {
        let lat0 = -89.5_f64.to_radians();
        let (s, c) = lat0.sin_cos();
        // Due north (away from the south pole) along the meridian.
        let (lat, lon) = destination(s, c, 30.0, 0.0, 1.0_f64.to_radians());
        assert!((lat + 88.5).abs() < 1e-9 && (lon - 30.0).abs() < 1e-9);
        // Due south: over the pole onto the opposite meridian.
        let (lat, lon) = destination(s, c, 30.0, std::f64::consts::PI, 1.0_f64.to_radians());
        assert!((lat + 89.5).abs() < 1e-9, "{lat}");
        assert!(((lon - 210.0).rem_euclid(360.0)).min((210.0 - lon).rem_euclid(360.0)) < 1e-6);
    }

    #[test]
    fn elevation_matches_sphere_dip() {
        // A grazing ray to the bare sphere from a 10 m mast is the sphere dip.
        let r = MOON_RADIUS_KM * 1000.0;
        let ro = r + 10.0;
        let theta = (r / ro).acos();
        let el = elevation(ro, r, theta).to_degrees();
        let site = Site::new(-89.0, 0.0, 10.0).unwrap();
        assert!((el - HorizonMask::sphere(&site, 4).elev_deg[0]).abs() < 1e-9);
    }

    #[test]
    fn off_dem_site_falls_back_to_sphere() {
        let site = Site::new(0.0, 0.0, 2.0).unwrap();
        let m = for_site(&site);
        assert_eq!(m.source, "sphere");
        assert_eq!(m.elev_deg.len(), MASK_SAMPLES);
    }

    /// Terrain tests auto-skip when the DEM is missing (as in CI).
    fn dems() -> Option<Vec<Dem>> {
        let d: Vec<Dem> = dem::available_products("data/raw/dem")
            .iter()
            .filter_map(|p| Dem::open("data/raw/dem", p).ok())
            .collect();
        if d.is_empty() {
            eprintln!("skipping: no DEM in data/raw/dem");
            None
        } else {
            Some(d)
        }
    }

    /// From Shackleton's floor (~4 km deep, rim ~10 km away) the walls fill the sky
    /// to roughly 15-25 deg all around.
    #[test]
    fn shackleton_floor_is_walled_in() {
        let Some(d) = dems() else { return };
        let site = Site::new(-89.67, 129.2, 2.0).unwrap();
        let m = from_dem(&d, &site, MASK_SAMPLES).unwrap();
        let min = m.elev_deg.iter().cloned().fold(f64::INFINITY, f64::min);
        let mean = m.elev_deg.iter().sum::<f64>() / m.elev_deg.len() as f64;
        eprintln!(
            "Shackleton floor: ground {:?} m, skyline min {min:.1}, mean {mean:.1} deg",
            m.ground_m
        );
        assert!(m.source.starts_with("lola:"));
        assert!(
            min > 8.0 && (12.0..35.0).contains(&mean),
            "min {min}, mean {mean}"
        );
    }

    /// From the summit of Mons Malapert (DEM maximum, 1.6 km from the commonly quoted
    /// -85.98, -1.67 which sits 74 m lower on the flank) most of the skyline lies below
    /// the tangent plane.
    #[test]
    fn malapert_top_looks_down() {
        let Some(d) = dems() else { return };
        let site = Site::new(-85.9624, -2.3929, 2.0).unwrap();
        let m = from_dem(&d, &site, MASK_SAMPLES).unwrap();
        let mut e = m.elev_deg.clone();
        e.sort_by(f64::total_cmp);
        let median = e[e.len() / 2];
        eprintln!(
            "Malapert top: ground {:?} m, skyline median {median:.2}, max {:.2} deg",
            m.ground_m,
            e[e.len() - 1]
        );
        assert!(median < 0.0, "median {median}");
    }
}
