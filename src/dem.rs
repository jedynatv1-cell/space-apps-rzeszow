//! LOLA polar DEM reader (owner: person B — see docs/RESEARCH.md section 3).
//!
//! Products: `data/raw/dem/ldem_80s_40m.img` (+ `.lbl`), `ldem_75s_120m.img` (+ `.lbl`).
//! Format: raw little-endian int16, no header, square grid, polar stereographic
//! projection on a 1737.4 km sphere. Height [m] = DN * SCALING_FACTOR (read from `.lbl`)
//! relative to 1737.4 km.
//!
//! TODO(B):
//! 1. Parse `LINES`, `LINE_SAMPLES`, `MAP_SCALE`, `SCALING_FACTOR`, `LINE_PROJECTION_OFFSET`,
//!    `SAMPLE_PROJECTION_OFFSET` from the `.lbl` file (don't hard-code).
//! 2. Memory-map the `.img` (add `memmap2`), implement `height_m(lat, lon)` with bilinear
//!    interpolation via the polar stereographic formulas from the label.
//! 3. FIRST sanity check: Shackleton (-89.67, 129.2) must come out as a deep pit, the
//!    sign conventions in the PDS formulas look inconsistent (RESEARCH.md, unverified list).
//! 4. Then `horizon::from_dem` ray-marches this DEM per azimuth.

use std::path::Path;

/// Placeholder until the real reader lands; lets the API report what is available.
pub fn available_products(dir: &str) -> Vec<String> {
    ["ldem_80s_40m", "ldem_75s_120m", "ldem_85s_20m"]
        .iter()
        .filter(|p| Path::new(&format!("{dir}/{p}.img")).exists())
        .map(|p| p.to_string())
        .collect()
}
