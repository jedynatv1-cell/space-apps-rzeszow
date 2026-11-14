//! Landing sites: curated list from `data/sites.json` and custom coordinates.

use serde::{Deserialize, Serialize};

/// Mean lunar radius used by LOLA products and by JPL Horizons (MOON_ME sphere).
pub const MOON_RADIUS_KM: f64 = 1737.4;

/// A point on the Moon in selenographic coordinates (MOON_ME frame).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Site {
    /// Latitude in degrees, -90..90.
    pub lat_deg: f64,
    /// East-positive longitude in degrees, -180..180.
    pub lon_deg: f64,
    /// Height of the observer (e.g. solar panel / antenna) above the reference sphere, metres.
    #[serde(default)]
    pub alt_m: f64,
}

impl Site {
    pub fn new(lat_deg: f64, lon_deg: f64, alt_m: f64) -> Result<Self, String> {
        if !(-90.0..=90.0).contains(&lat_deg) {
            return Err(format!("lat_deg out of range: {lat_deg}"));
        }
        if !(-180.0..=360.0).contains(&lon_deg) {
            return Err(format!("lon_deg out of range: {lon_deg}"));
        }
        if !(-20_000.0..=20_000.0).contains(&alt_m) {
            return Err(format!("alt_m out of range: {alt_m}"));
        }
        Ok(Self {
            lat_deg,
            lon_deg,
            alt_m,
        })
    }

    /// Distance from the Moon's centre, km.
    pub fn radius_km(&self) -> f64 {
        MOON_RADIUS_KM + self.alt_m / 1000.0
    }
}

/// One entry of `data/sites.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamedSite {
    pub name: String,
    pub mission: String,
    pub country_or_agency: String,
    pub lat_deg: f64,
    pub lon_deg: f64,
    pub south_polar: bool,
    pub status: String,
    pub source_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coord_note: Option<String>,
}

pub fn load_sites(path: &str) -> Result<Vec<NamedSite>, Box<dyn std::error::Error>> {
    let text = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&text)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sites_json_parses() {
        let sites = load_sites("data/sites.json").expect("data/sites.json must parse");
        assert!(sites.len() >= 20);
        for s in &sites {
            Site::new(s.lat_deg, s.lon_deg, 0.0).unwrap_or_else(|e| panic!("{}: {e}", s.name));
        }
    }

    #[test]
    fn rejects_bad_latitude() {
        assert!(Site::new(91.0, 0.0, 0.0).is_err());
    }
}
