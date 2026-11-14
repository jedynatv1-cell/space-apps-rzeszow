//! LOLA polar DEM reader (see docs/RESEARCH.md section 3).
//!
//! Products: `data/raw/dem/ldem_80s_40m.img` (+ `.lbl`), `ldem_75s_120m.img` (+ `.lbl`).
//! Format: raw little-endian int16, no header, square grid, polar stereographic
//! projection on a 1737.4 km sphere. Height [m] = DN * SCALING_FACTOR relative to 1737.4 km.
//! All grid parameters are read from the `.lbl` file.
//!
//! Orientation (verified by the `orientation_*` tests against Shackleton and Malapert):
//! see `SAMPLE_SIGN` / `LINE_SIGN`.

use std::fs::File;
use std::path::Path;

use memmap2::Mmap;

/// Grid parameters parsed from a PDS3 `.lbl` file.
#[derive(Debug, Clone, PartialEq)]
pub struct DemLabel {
    pub lines: usize,
    pub samples: usize,
    pub map_scale_m: f64,
    pub scaling_factor: f64,
    /// 0-based pixel coordinate of the projection centre (the pole).
    pub line_offset: f64,
    pub sample_offset: f64,
    pub radius_m: f64,
    /// -90 for south polar products, +90 for north.
    pub center_lat: f64,
}

impl DemLabel {
    pub fn parse(text: &str) -> Result<Self, String> {
        let get = |key: &str| -> Result<f64, String> {
            text.lines()
                .filter_map(|l| l.split_once('='))
                .find(|(k, _)| k.trim() == key)
                .and_then(|(_, v)| {
                    v.trim()
                        .trim_matches('"')
                        .split(|c: char| c.is_whitespace() || c == '<')
                        .next()
                        .and_then(|s| s.parse::<f64>().ok())
                })
                .ok_or_else(|| format!("label: missing or bad {key}"))
        };
        if get("SAMPLE_BITS")? != 16.0 || !text.contains("LSB_INTEGER") {
            return Err("label: only 16-bit LSB_INTEGER products are supported".into());
        }
        let radius = get("A_AXIS_RADIUS")?;
        Ok(Self {
            lines: get("LINES")? as usize,
            samples: get("LINE_SAMPLES")? as usize,
            map_scale_m: get("MAP_SCALE")?,
            scaling_factor: get("SCALING_FACTOR")?,
            line_offset: get("LINE_PROJECTION_OFFSET")?,
            sample_offset: get("SAMPLE_PROJECTION_OFFSET")?,
            // The label gives km; accept metres too.
            radius_m: if radius < 100_000.0 {
                radius * 1000.0
            } else {
                radius
            },
            center_lat: get("CENTER_LATITUDE")?,
        })
    }
}

/// Image axes relative to projection x = rho*sin(lon), y = rho*cos(lon):
/// sample = sample_offset + SAMPLE_SIGN * x / scale; line = line_offset + LINE_SIGN * y / scale.
const SAMPLE_SIGN: f64 = 1.0;
const LINE_SIGN: f64 = -1.0;

/// A memory-mapped LOLA polar DEM.
pub struct Dem {
    /// Product name, e.g. `ldem_80s_40m` (reported as `lola:<name>` in the API).
    pub name: String,
    pub label: DemLabel,
    mmap: Mmap,
}

impl Dem {
    /// Opens `<dir>/<product>.img` with its `.lbl`.
    pub fn open(dir: &str, product: &str) -> Result<Self, String> {
        let lbl = format!("{dir}/{product}.lbl");
        let img = format!("{dir}/{product}.img");
        let text = std::fs::read_to_string(&lbl).map_err(|e| format!("{lbl}: {e}"))?;
        let label = DemLabel::parse(&text)?;
        let file = File::open(&img).map_err(|e| format!("{img}: {e}"))?;
        // SAFETY: read-only mapping of a data file nobody writes while the server runs.
        let mmap = unsafe { Mmap::map(&file) }.map_err(|e| format!("{img}: {e}"))?;
        let want = label.lines * label.samples * 2;
        if mmap.len() != want {
            return Err(format!("{img}: {} bytes, label says {want}", mmap.len()));
        }
        Ok(Self {
            name: product.to_string(),
            label,
            mmap,
        })
    }

    /// Projection-plane coordinates (metres) of a lat/lon (degrees, east-positive).
    pub fn latlon_to_xy(&self, lat_deg: f64, lon_deg: f64) -> (f64, f64) {
        let colat = (90.0 - lat_deg * self.label.center_lat.signum()).to_radians();
        let rho = 2.0 * self.label.radius_m * (colat / 2.0).tan();
        let lon = lon_deg.to_radians();
        (rho * lon.sin(), rho * lon.cos())
    }

    /// Inverse of [`Dem::latlon_to_xy`].
    pub fn xy_to_latlon(&self, x: f64, y: f64) -> (f64, f64) {
        let colat = 2.0 * (x.hypot(y) / (2.0 * self.label.radius_m)).atan();
        let lat = (90.0 - colat.to_degrees()) * self.label.center_lat.signum();
        (lat, x.atan2(y).to_degrees())
    }

    /// Fractional 0-based (line, sample) of a projection-plane point.
    pub fn xy_to_pixel(&self, x: f64, y: f64) -> (f64, f64) {
        let s = self.label.map_scale_m;
        (
            self.label.line_offset + LINE_SIGN * y / s,
            self.label.sample_offset + SAMPLE_SIGN * x / s,
        )
    }

    /// Height (m above 1737.4 km) of a raw pixel, `None` outside the grid.
    pub fn pixel(&self, line: usize, sample: usize) -> Option<f64> {
        if line >= self.label.lines || sample >= self.label.samples {
            return None;
        }
        let i = 2 * (line * self.label.samples + sample);
        let dn = i16::from_le_bytes([self.mmap[i], self.mmap[i + 1]]);
        Some(dn as f64 * self.label.scaling_factor)
    }

    /// Bilinearly interpolated height at a projection-plane point (metres).
    pub fn height_xy(&self, x: f64, y: f64) -> Option<f64> {
        let (l, s) = self.xy_to_pixel(x, y);
        if l < 0.0 || s < 0.0 {
            return None;
        }
        let (l0, s0) = (l.floor() as usize, s.floor() as usize);
        let (tl, ts) = (l - l0 as f64, s - s0 as f64);
        let h00 = self.pixel(l0, s0)?;
        let h01 = self.pixel(l0, s0 + 1)?;
        let h10 = self.pixel(l0 + 1, s0)?;
        let h11 = self.pixel(l0 + 1, s0 + 1)?;
        Some((h00 * (1.0 - ts) + h01 * ts) * (1.0 - tl) + (h10 * (1.0 - ts) + h11 * ts) * tl)
    }

    /// Height (m above 1737.4 km) at lat/lon, `None` outside the product.
    pub fn height_m(&self, lat_deg: f64, lon_deg: f64) -> Option<f64> {
        let (x, y) = self.latlon_to_xy(lat_deg, lon_deg);
        self.height_xy(x, y)
    }
}

/// Products found in `dir`, finest first.
pub fn available_products(dir: &str) -> Vec<String> {
    ["ldem_85s_20m", "ldem_80s_40m", "ldem_75s_120m"]
        .iter()
        .filter(|p| Path::new(&format!("{dir}/{p}.img")).exists())
        .map(|p| p.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIR: &str = "data/raw/dem";

    /// DEM tests auto-skip when the data is missing (as in CI).
    fn dem(product: &str) -> Option<Dem> {
        Dem::open(DIR, product)
            .map_err(|e| eprintln!("skipping: {e}"))
            .ok()
    }

    /// Mean height of a ring of radius `r_m` around (lat, lon).
    fn ring_mean(d: &Dem, lat: f64, lon: f64, r_m: f64) -> f64 {
        let (cx, cy) = d.latlon_to_xy(lat, lon);
        (0..36)
            .map(|k| {
                let a = (k as f64 * 10.0).to_radians();
                d.height_xy(cx + r_m * a.sin(), cy + r_m * a.cos()).unwrap()
            })
            .sum::<f64>()
            / 36.0
    }

    #[test]
    fn label_parses() {
        let text = "LINES = 15200\nLINE_SAMPLES = 15200\nSAMPLE_TYPE = LSB_INTEGER\n\
                    SAMPLE_BITS = 16\nSCALING_FACTOR = 0.5\nA_AXIS_RADIUS = 1737.4 <km>\n\
                    CENTER_LATITUDE = -90 <deg>\nMAP_SCALE = 40 <m/pix>\n\
                    LINE_PROJECTION_OFFSET = 7599.5 <pix>\nSAMPLE_PROJECTION_OFFSET = 7599.5 <pix>\n";
        let l = DemLabel::parse(text).unwrap();
        assert_eq!(l.lines, 15200);
        assert_eq!(l.map_scale_m, 40.0);
        assert_eq!(l.radius_m, 1_737_400.0);
        assert_eq!(l.line_offset, 7599.5);
        assert_eq!(l.center_lat, -90.0);
    }

    #[test]
    fn projection_round_trip() {
        let Some(d) = dem("ldem_80s_40m") else { return };
        for &(lat, lon) in &[(-89.67, 129.2), (-85.98, -1.67), (-81.0, 170.0)] {
            let (x, y) = d.latlon_to_xy(lat, lon);
            let (la, lo) = d.xy_to_latlon(x, y);
            assert!((la - lat).abs() < 1e-9 && (lo - lon).abs() < 1e-9);
        }
    }

    /// Shackleton crater (-89.67, 129.2E, ~21 km wide, ~4 km deep) must be a deep pit.
    #[test]
    fn orientation_shackleton_is_a_pit() {
        let Some(d) = dem("ldem_80s_40m") else { return };
        let floor = d.height_m(-89.67, 129.2).unwrap();
        let rim = ring_mean(&d, -89.67, 129.2, 10_500.0);
        eprintln!("Shackleton floor {floor:.0} m, rim mean {rim:.0} m");
        assert!(rim - floor > 2500.0, "floor {floor}, rim {rim}");
        // The three wrong axis-sign choices map Shackleton to these longitudes; none may
        // look like a pit, so the test really pins the orientation.
        for wrong in [-129.2, 50.8, -50.8] {
            let depth = ring_mean(&d, -89.67, wrong, 10_500.0) - d.height_m(-89.67, wrong).unwrap();
            assert!(
                depth < 1000.0,
                "lon {wrong} also looks like a pit ({depth:.0} m)"
            );
        }
    }

    /// Mons Malapert (-85.98, -1.67E) is a ~5 km massif, far above the terrain around it.
    #[test]
    fn orientation_malapert_is_a_peak() {
        let Some(d) = dem("ldem_80s_40m") else { return };
        let top = d.height_m(-85.98, -1.67).unwrap();
        let around = ring_mean(&d, -85.98, -1.67, 30_000.0);
        eprintln!("Malapert top {top:.0} m, ring mean {around:.0} m");
        assert!(top - around > 1500.0, "top {top}, around {around}");
    }

    /// Both products must agree where they overlap (catches per-product offset bugs).
    #[test]
    fn products_agree() {
        let (Some(a), Some(b)) = (dem("ldem_80s_40m"), dem("ldem_75s_120m")) else {
            return;
        };
        for &(lat, lon) in &[(-89.67, 129.2), (-85.98, -1.67), (-84.0, 60.0)] {
            let (ha, hb) = (a.height_m(lat, lon).unwrap(), b.height_m(lat, lon).unwrap());
            assert!((ha - hb).abs() < 250.0, "({lat},{lon}): {ha} vs {hb}");
        }
    }
}
