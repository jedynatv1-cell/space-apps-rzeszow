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
use crate::horizon::{self, HorizonMask};
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
        .route("/api/best_nearby", get(best_nearby))
        .route("/api/compare", get(compare))
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
    // LOLA terrain mask when a loaded DEM covers the site, else the smooth sphere (cached).
    let horizon = horizon::for_site(&site).as_ref().clone();
    let points = metrics::track(&s.ephem, &horizon, &req).map_err(|e| e.to_string())?;
    let summary = metrics::summarize(&points, q.step_min / 60.0, req.dte_margin_deg);
    Ok(TrackResponse {
        site,
        horizon,
        summary,
        points,
    })
}

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    /// Search radius around (lat, lon), metres (<= 3000).
    #[serde(default = "default_radius")]
    pub radius_m: f64,
    /// Candidate grid spacing, metres (>= 40, the DEM resolution).
    #[serde(default = "default_grid")]
    pub grid_m: f64,
}

fn default_radius() -> f64 {
    500.0
}
fn default_grid() -> f64 {
    100.0
}

/// Most candidates per search (each costs one terrain mask).
pub const MAX_CANDIDATES: usize = 400;

#[derive(Debug, Clone, Serialize)]
pub struct Candidate {
    pub lat_deg: f64,
    pub lon_deg: f64,
    /// Distance from the requested point, metres.
    pub distance_m: f64,
    pub ground_m: Option<f64>,
    pub sun_visible_pct: f64,
    pub sun_mean_fraction: f64,
    pub earth_visible_pct: f64,
    pub longest_night_hours: f64,
}

#[derive(Serialize)]
pub struct BestNearbyResponse {
    pub center: Candidate,
    /// Highest sun_mean_fraction in the search area.
    pub best: Candidate,
    /// Top 5 by sun_mean_fraction.
    pub top: Vec<Candidate>,
    pub candidates_evaluated: usize,
    pub radius_m: f64,
    pub grid_m: f64,
}

async fn best_nearby(
    State(s): State<Arc<AppState>>,
    Query(track): Query<TrackQuery>,
    Query(p): Query<SearchParams>,
) -> Response {
    match tokio::task::spawn_blocking(move || compute_best_nearby(&s, &track, &p)).await {
        Ok(Ok(resp)) => Json(resp).into_response(),
        Ok(Err(msg)) => (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

/// Searches a grid around the site for the best-lit spot: one ephemeris run at the
/// centre, then each candidate gets its own terrain mask and re-evaluated track.
pub fn compute_best_nearby(
    s: &AppState,
    track: &TrackQuery,
    q: &SearchParams,
) -> Result<BestNearbyResponse, String> {
    if !(q.radius_m > 0.0 && q.radius_m <= 3000.0 && q.grid_m >= 40.0) {
        return Err("need 0 < radius_m <= 3000 and grid_m >= 40".into());
    }
    let k = (q.radius_m / q.grid_m).floor() as i64;
    let offsets: Vec<(f64, f64)> = (-k..=k)
        .flat_map(|i| (-k..=k).map(move |j| (i as f64 * q.grid_m, j as f64 * q.grid_m)))
        .filter(|(e, n)| e.hypot(*n) <= q.radius_m + 1e-9)
        .collect();
    if offsets.len() > MAX_CANDIDATES {
        return Err(format!(
            "{} candidates, max {MAX_CANDIDATES}: increase grid_m",
            offsets.len()
        ));
    }
    let centre = compute_track(s, track)?;
    if !centre.horizon.source.starts_with("lola:") {
        return Err("site is outside the loaded DEM: no terrain to search".into());
    }
    let step_h = track.step_min / 60.0;
    let margin = track.dte_margin_deg;
    let candidate = |site: &Site, dist: f64, ground: Option<f64>, pts: &[TrackPoint]| {
        let sm = metrics::summarize(pts, step_h, margin);
        Candidate {
            lat_deg: site.lat_deg,
            lon_deg: site.lon_deg,
            distance_m: dist,
            ground_m: ground,
            sun_visible_pct: sm.sun_visible_pct,
            sun_mean_fraction: sm.sun_mean_fraction,
            earth_visible_pct: sm.earth_visible_pct,
            longest_night_hours: sm.longest_night_hours,
        }
    };
    let mut all: Vec<Candidate> = offsets
        .iter()
        .filter_map(|&(e, n)| {
            let dist = e.hypot(n);
            let (lat, lon) = horizon::move_by(track.lat, track.lon, e.atan2(n).to_degrees(), dist);
            let site = Site::new(lat, lon, track.alt_m).ok()?;
            let mask = horizon::terrain_mask(&site)?;
            let pts = metrics::remask(&centre.points, &centre.site, &site, &mask);
            Some(candidate(&site, dist, mask.ground_m, &pts))
        })
        .collect();
    let centre_c = candidate(&centre.site, 0.0, centre.horizon.ground_m, &centre.points);
    all.sort_by(|a, b| b.sun_mean_fraction.total_cmp(&a.sun_mean_fraction));
    let best = all.first().cloned().unwrap_or_else(|| centre_c.clone());
    Ok(BestNearbyResponse {
        center: centre_c,
        best,
        candidates_evaluated: all.len(),
        top: all.into_iter().take(5).collect(),
        radius_m: q.radius_m,
        grid_m: q.grid_m,
    })
}

/// Sites and options for `/api/compare`; time and observer options come from `TrackQuery`
/// fields (`start`, `days`, `step_min`, `alt_m`, `dte_margin_deg`).
#[derive(Debug, Deserialize)]
pub struct CompareQuery {
    /// Comma-separated 0-based indices into `/api/sites`, e.g. `0,5,7`.
    #[serde(default)]
    pub ids: Option<String>,
    /// Custom points `lat,lon;lat,lon` (east-positive longitude).
    #[serde(default)]
    pub sites: Option<String>,
    pub start: String,
    #[serde(default = "default_days")]
    pub days: f64,
    #[serde(default = "default_step")]
    pub step_min: f64,
    #[serde(default)]
    pub alt_m: f64,
    #[serde(default)]
    pub dte_margin_deg: f64,
}

/// Most sites per comparison.
pub const MAX_COMPARE: usize = 6;

#[derive(Serialize)]
pub struct CompareEntry {
    /// Index into `/api/sites` (for `ids`), else null.
    pub id: Option<usize>,
    pub name: Option<String>,
    pub site: Site,
    pub horizon_source: String,
    pub ground_m: Option<f64>,
    pub summary: Summary,
}

#[derive(Serialize)]
pub struct CompareResponse {
    pub entries: Vec<CompareEntry>,
    /// Indices into `entries`, best first by `summary.sun_mean_fraction`.
    pub rank_by_sun: Vec<usize>,
    /// Indices into `entries`, best first by `summary.earth_visible_pct`.
    pub rank_by_earth: Vec<usize>,
}

async fn compare(State(s): State<Arc<AppState>>, Query(q): Query<CompareQuery>) -> Response {
    match tokio::task::spawn_blocking(move || compute_compare(&s, &q)).await {
        Ok(Ok(resp)) => Json(resp).into_response(),
        Ok(Err(msg)) => (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

/// Summaries for several sites over the same period, plus rankings.
pub fn compute_compare(s: &AppState, q: &CompareQuery) -> Result<CompareResponse, String> {
    let mut targets: Vec<(Option<usize>, Option<String>, f64, f64)> = Vec::new();
    for id in q.ids.iter().flat_map(|v| v.split(',')).map(str::trim) {
        if id.is_empty() {
            continue;
        }
        let i: usize = id.parse().map_err(|_| format!("bad id '{id}'"))?;
        let n = s
            .sites
            .get(i)
            .ok_or_else(|| format!("id {i} out of range (0..{})", s.sites.len()))?;
        targets.push((Some(i), Some(n.name.clone()), n.lat_deg, n.lon_deg));
    }
    for p in q.sites.iter().flat_map(|v| v.split(';')).map(str::trim) {
        if p.is_empty() {
            continue;
        }
        let (a, b) = p
            .split_once(',')
            .ok_or_else(|| format!("bad site '{p}', want lat,lon"))?;
        let lat = a.trim().parse().map_err(|_| format!("bad lat in '{p}'"))?;
        let lon = b.trim().parse().map_err(|_| format!("bad lon in '{p}'"))?;
        targets.push((None, None, lat, lon));
    }
    if targets.is_empty() || targets.len() > MAX_COMPARE {
        return Err(format!(
            "need 1..={MAX_COMPARE} sites via ids=0,5 and/or sites=lat,lon;lat,lon"
        ));
    }
    // Sites are independent: one thread each (at most MAX_COMPARE).
    let entries = std::thread::scope(|scope| {
        let handles: Vec<_> = targets
            .into_iter()
            .map(|t| scope.spawn(move || compare_one(s, q, t)))
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().map_err(|_| "worker panicked".to_string())?)
            .collect::<Result<Vec<_>, String>>()
    })?;
    let rank = |key: fn(&Summary) -> f64| {
        let mut idx: Vec<usize> = (0..entries.len()).collect();
        idx.sort_by(|&a, &b| key(&entries[b].summary).total_cmp(&key(&entries[a].summary)));
        idx
    };
    Ok(CompareResponse {
        rank_by_sun: rank(|s| s.sun_mean_fraction),
        rank_by_earth: rank(|s| s.earth_visible_pct),
        entries,
    })
}

fn compare_one(
    s: &AppState,
    q: &CompareQuery,
    (id, name, lat, lon): (Option<usize>, Option<String>, f64, f64),
) -> Result<CompareEntry, String> {
    let tq = TrackQuery {
        lat,
        lon,
        alt_m: q.alt_m,
        start: q.start.clone(),
        days: q.days,
        step_min: q.step_min,
        dte_margin_deg: q.dte_margin_deg,
    };
    let r = compute_track(s, &tq)?;
    Ok(CompareEntry {
        id,
        name,
        site: r.site,
        horizon_source: r.horizon.source,
        ground_m: r.horizon.ground_m,
        summary: r.summary,
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
