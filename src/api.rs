//! HTTP API (owner: person C). JSON over `axum`; the frontend lives in `web/`.
//!
//! GET /api/health
//! GET /api/sites
//! GET /api/track?lat=-89.45&lon=-129.78&start=2026-11-14&days=30&step_min=60[&alt_m=2][&dte_margin_deg=0]

use std::str::FromStr;
use std::sync::Arc;

use anise::prelude::*;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::ephem::Ephem;
use crate::horizon::HorizonMask;
use crate::metrics::{self, Summary, TrackPoint, TrackRequest};
use crate::site::{NamedSite, Site};

/// Upper bound on samples per request, to keep responses small and the server responsive.
pub const MAX_POINTS: usize = 20_000;

pub struct AppState {
    pub ephem: Ephem,
    pub sites: Vec<NamedSite>,
    pub dem_products: Vec<String>,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/sites", get(sites))
        .route("/api/track", get(track))
        .with_state(state)
}

async fn health(State(s): State<Arc<AppState>>) -> Json<serde_json::Value> {
    Json(json!({ "ok": true, "sites": s.sites.len(), "dem_products": s.dem_products }))
}

async fn sites(State(s): State<Arc<AppState>>) -> Json<Vec<NamedSite>> {
    Json(s.sites.clone())
}

#[derive(Debug, Deserialize)]
pub struct TrackQuery {
    pub lat: f64,
    pub lon: f64,
    #[serde(default)]
    pub alt_m: f64,
    /// "2026-11-14", "2026-11-14T06:30" or "2026-11-14T06:30:00Z" (UTC).
    pub start: String,
    #[serde(default = "default_days")]
    pub days: f64,
    #[serde(default = "default_step")]
    pub step_min: f64,
    #[serde(default)]
    pub dte_margin_deg: f64,
}

fn default_days() -> f64 {
    30.0
}
fn default_step() -> f64 {
    60.0
}

#[derive(Serialize)]
pub struct TrackResponse {
    pub site: Site,
    pub horizon: HorizonMask,
    pub summary: Summary,
    pub points: Vec<TrackPoint>,
}

async fn track(State(s): State<Arc<AppState>>, Query(q): Query<TrackQuery>) -> Response {
    // Ephemeris loops are CPU-bound: keep them off the async executor.
    match tokio::task::spawn_blocking(move || compute_track(&s, &q)).await {
        Ok(Ok(resp)) => Json(resp).into_response(),
        Ok(Err(msg)) => (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub fn compute_track(s: &AppState, q: &TrackQuery) -> Result<TrackResponse, String> {
    let site = Site::new(q.lat, q.lon, q.alt_m)?;
    let start = parse_utc(&q.start)?;
    if !(q.step_min >= 1.0 && q.days > 0.0 && q.days <= 400.0) {
        return Err("need step_min >= 1 and 0 < days <= 400".into());
    }
    let n = (q.days * 24.0 * 60.0 / q.step_min).floor() as usize + 1;
    if n > MAX_POINTS {
        return Err(format!(
            "{n} points requested, max {MAX_POINTS}: increase step_min"
        ));
    }
    let req = TrackRequest {
        site,
        start,
        end: start + Unit::Day * q.days,
        step: Unit::Minute * q.step_min,
        dte_margin_deg: q.dte_margin_deg,
    };
    // TODO(B): use a LOLA terrain mask when the site is inside a loaded DEM.
    let horizon = HorizonMask::sphere(&site, 720);
    let points = metrics::track(&s.ephem, &horizon, &req).map_err(|e| e.to_string())?;
    let summary = metrics::summarize(&points, q.step_min / 60.0, req.dte_margin_deg);
    Ok(TrackResponse {
        site,
        horizon,
        summary,
        points,
    })
}

/// Parse a UTC timestamp, accepting date-only and minute-precision forms.
pub fn parse_utc(s: &str) -> Result<Epoch, String> {
    let mut t = s.trim().trim_end_matches('Z').replace(' ', "T");
    match t.len() {
        10 => t.push_str("T00:00:00"),
        16 => t.push_str(":00"),
        _ => {}
    }
    Epoch::from_str(&format!("{t} UTC")).map_err(|e| format!("bad start '{s}': {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_time_forms() {
        let want = Epoch::from_gregorian_utc(2026, 11, 14, 6, 30, 0, 0);
        assert_eq!(parse_utc("2026-11-14T06:30").unwrap(), want);
        assert_eq!(parse_utc("2026-11-14T06:30:00Z").unwrap(), want);
        assert_eq!(parse_utc("2026-11-14 06:30").unwrap(), want);
        assert_eq!(
            parse_utc("2026-11-14").unwrap(),
            Epoch::from_gregorian_utc_at_midnight(2026, 11, 14)
        );
        assert!(parse_utc("yesterday").is_err());
    }
}
