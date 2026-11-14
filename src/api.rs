//! HTTP API (owner: person C). JSON over `axum`; the frontend lives in `web/`.
//!
//! GET /api/health
//! GET /api/sites
//! GET /api/track?lat=-89.45&lon=-129.78&start=2026-11-14&days=30&step_min=60[&alt_m=2][&dte_margin_deg=0]

use std::str::FromStr;
use std::sync::Arc;

use anise::prelude::*;
use axum::extract::{FromRequestParts, Query, State};
use axum::http::request::Parts;
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::ephem::Ephem;
use crate::horizon::{self, HorizonMask};
use crate::metrics::{self, Summary, TrackPoint, TrackRequest};
use crate::site::{NamedSite, Site};

/// Upper bound on samples per request, to keep responses small and the server responsive.
pub const MAX_POINTS: usize = 20_000;

/// Query-string extractor that reports bad parameters as `{"error": ...}` JSON (400),
/// like every other API error, instead of axum's plain-text rejection.
pub struct Q<T>(pub T);

impl<T, S> FromRequestParts<S> for Q<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match Query::<T>::from_request_parts(parts, state).await {
            Ok(Query(v)) => Ok(Q(v)),
            Err(e) => Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": e.body_text() })),
            )
                .into_response()),
        }
    }
}

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

/// Output format of `/api/track`: `json` (default) or `csv`.
#[derive(Debug, Deserialize)]
pub struct FormatParam {
    #[serde(default)]
    pub format: Option<String>,
}

async fn track(
    State(s): State<Arc<AppState>>,
    Q(q): Q<TrackQuery>,
    Q(f): Q<FormatParam>,
) -> Response {
    let csv = match f.format.as_deref() {
        None | Some("json") => false,
        Some("csv") => true,
        Some(other) => {
            let msg = format!("unknown format '{other}', use json or csv");
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response();
        }
    };
    // Ephemeris loops are CPU-bound: keep them off the async executor.
    match tokio::task::spawn_blocking(move || compute_track(&s, &q)).await {
        Ok(Ok(resp)) if csv => {
            let name = csv_filename(&resp);
            (
                [
                    (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_string()),
                    (
                        header::CONTENT_DISPOSITION,
                        format!("attachment; filename=\"{name}\""),
                    ),
                ],
                track_csv(&resp),
            )
                .into_response()
        }
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
    Q(track): Q<TrackQuery>,
    Q(p): Q<SearchParams>,
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
    // One terrain mask per candidate: spread whole candidates over the cores.
    let eval = |&(e, n): &(f64, f64)| -> Option<Candidate> {
        let dist = e.hypot(n);
        let (lat, lon) = horizon::move_by(track.lat, track.lon, e.atan2(n).to_degrees(), dist);
        let site = Site::new(lat, lon, track.alt_m).ok()?;
        let mask = horizon::terrain_mask(&site)?;
        let pts = metrics::remask(&centre.points, &centre.site, &site, &mask);
        Some(candidate(&site, dist, mask.ground_m, &pts))
    };
    let chunk = offsets.len().div_ceil(horizon::cpu_threads()).max(1);
    let mut all: Vec<Candidate> = std::thread::scope(|scope| {
        let handles: Vec<_> = offsets
            .chunks(chunk)
            .map(|c| scope.spawn(move || c.iter().filter_map(eval).collect::<Vec<_>>()))
            .collect();
        handles
            .into_iter()
            .flat_map(|h| h.join().unwrap_or_default())
            .collect()
    });
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
    /// Start of the period (required unless `starts` is given).
    #[serde(default)]
    pub start: Option<String>,
    /// Date-slip mode: several starts for ONE site, e.g. `2026-11-14,2026-11-21`.
    #[serde(default)]
    pub starts: Option<String>,
    /// Date-slip mode: day offsets from `start` for ONE site, e.g. `0,1,7,30`.
    #[serde(default)]
    pub offsets_days: Option<String>,
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

/// Most dates per date-slip comparison.
pub const MAX_DATES: usize = 12;

#[derive(Serialize)]
pub struct CompareEntry {
    /// Index into `/api/sites` (for `ids`), else null.
    pub id: Option<usize>,
    pub name: Option<String>,
    pub site: Site,
    pub horizon_source: String,
    pub ground_m: Option<f64>,
    /// Start of this entry's period (ISO UTC).
    pub start: String,
    pub summary: Summary,
}

#[derive(Serialize)]
pub struct CompareResponse {
    /// "sites" (several sites, one period) or "dates" (one site, several starts).
    pub mode: &'static str,
    pub entries: Vec<CompareEntry>,
    /// Indices into `entries`, best first by `summary.sun_mean_fraction`.
    pub rank_by_sun: Vec<usize>,
    /// Indices into `entries`, best first by `summary.earth_visible_pct`.
    pub rank_by_earth: Vec<usize>,
}

async fn compare(State(s): State<Arc<AppState>>, Q(q): Q<CompareQuery>) -> Response {
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
    let starts = compare_starts(q)?;
    let dates_mode = q.starts.is_some() || q.offsets_days.is_some();
    if dates_mode && targets.len() != 1 {
        return Err("starts/offsets_days compare dates for exactly one site".into());
    }
    let jobs: Vec<_> = starts
        .iter()
        .flat_map(|st| targets.iter().map(move |t| (t.clone(), st.clone())))
        .collect();
    // Entries are independent: one thread each (at most MAX_COMPARE or MAX_DATES).
    let entries = std::thread::scope(|scope| {
        let handles: Vec<_> = jobs
            .into_iter()
            .map(|(t, st)| scope.spawn(move || compare_one(s, q, t, st)))
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
        mode: if dates_mode { "dates" } else { "sites" },
        rank_by_sun: rank(|s| s.sun_mean_fraction),
        rank_by_earth: rank(|s| s.earth_visible_pct),
        entries,
    })
}

fn compare_one(
    s: &AppState,
    q: &CompareQuery,
    (id, name, lat, lon): (Option<usize>, Option<String>, f64, f64),
    start: String,
) -> Result<CompareEntry, String> {
    let tq = TrackQuery {
        lat,
        lon,
        alt_m: q.alt_m,
        start: start.clone(),
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
        start,
        summary: r.summary,
    })
}

/// Start times of a comparison (ISO UTC): `starts`, or `start` + each of
/// `offsets_days`, or just `start`.
fn compare_starts(q: &CompareQuery) -> Result<Vec<String>, String> {
    let list = |v: &str| -> Vec<String> {
        v.split(',')
            .map(str::trim)
            .filter(|x| !x.is_empty())
            .map(String::from)
            .collect()
    };
    let epochs: Vec<Epoch> = if let Some(v) = &q.starts {
        list(v)
            .iter()
            .map(|x| parse_utc(x))
            .collect::<Result<_, _>>()?
    } else {
        let base = parse_utc(q.start.as_deref().ok_or("missing start (or starts)")?)?;
        match &q.offsets_days {
            Some(v) => list(v)
                .iter()
                .map(|x| {
                    let d: f64 = x.parse().map_err(|_| format!("bad offset '{x}'"))?;
                    if d.abs() > 3660.0 {
                        return Err(format!("offset {d} days out of range"));
                    }
                    Ok(base + Unit::Day * d)
                })
                .collect::<Result<_, String>>()?,
            None => vec![base],
        }
    };
    if epochs.is_empty() || epochs.len() > MAX_DATES {
        return Err(format!("need 1..={MAX_DATES} starts"));
    }
    Ok(epochs.into_iter().map(metrics::iso).collect())
}

/// CSV header of `/api/track?format=csv`; one row per sample point.
pub const CSV_HEADER: &str = "t_utc,sun_az_deg,sun_el_deg,sun_horizon_deg,sun_vis,earth_az_deg,earth_el_deg,earth_horizon_deg,earth_vis,sun_distance_km,earth_distance_km";

/// The track as CSV for mission planners (angles in degrees, visibility 0..1).
pub fn track_csv(r: &TrackResponse) -> String {
    let mut out = String::with_capacity(96 * (r.points.len() + 2));
    out.push_str(CSV_HEADER);
    out.push('\n');
    for p in &r.points {
        out.push_str(&format!(
            "{},{:.4},{:.4},{:.4},{:.4},{:.4},{:.4},{:.4},{:.4},{:.0},{:.0}\n",
            p.t,
            p.sun.az_deg,
            p.sun.el_deg,
            p.sun_horizon_deg,
            p.sun_vis,
            p.earth.az_deg,
            p.earth.el_deg,
            p.earth_horizon_deg,
            p.earth_vis,
            p.sun.distance_km,
            p.earth.distance_km
        ));
    }
    out
}

/// e.g. `track_-89.4500_-129.7800_2026-11-14.csv`.
pub fn csv_filename(r: &TrackResponse) -> String {
    let date = r
        .points
        .first()
        .map_or("start", |p| p.t.get(..10).unwrap_or("start"));
    format!(
        "track_{:.4}_{:.4}_{date}.csv",
        r.site.lat_deg, r.site.lon_deg
    )
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

    fn cq(start: Option<&str>, starts: Option<&str>, offsets: Option<&str>) -> CompareQuery {
        CompareQuery {
            ids: None,
            sites: None,
            start: start.map(String::from),
            starts: starts.map(String::from),
            offsets_days: offsets.map(String::from),
            days: 30.0,
            step_min: 60.0,
            alt_m: 0.0,
            dte_margin_deg: 0.0,
        }
    }

    #[test]
    fn track_csv_rows_and_filename() {
        use crate::ephem::AzEl;
        let d = |az: f64, el: f64| AzEl {
            az_deg: az,
            el_deg: el,
            radius_deg: 0.27,
            distance_km: 1.5e8,
        };
        let points: Vec<TrackPoint> = (0..3)
            .map(|i| TrackPoint {
                t: format!("2026-11-14T0{i}:00:00Z"),
                sun: d(10.0 * i as f64, 1.5),
                earth: d(355.0, 4.25),
                sun_horizon_deg: 0.5,
                earth_horizon_deg: -0.1,
                sun_vis: 1.0,
                earth_vis: 1.0,
            })
            .collect();
        let site = Site::new(-89.45, -129.78, 0.0).unwrap();
        let r = TrackResponse {
            site,
            horizon: HorizonMask::sphere(&site, 4),
            summary: metrics::summarize(&points, 1.0, 0.0),
            points,
        };
        let csv = track_csv(&r);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0], CSV_HEADER);
        let cols = CSV_HEADER.split(',').count();
        assert!(lines.iter().all(|l| l.split(',').count() == cols));
        assert_eq!(
            lines[2],
            "2026-11-14T01:00:00Z,10.0000,1.5000,0.5000,1.0000,355.0000,4.2500,-0.1000,1.0000,150000000,150000000"
        );
        assert_eq!(csv_filename(&r), "track_-89.4500_-129.7800_2026-11-14.csv");
    }

    #[tokio::test]
    async fn bad_query_is_json_400() {
        let (mut parts, _) = axum::http::Request::builder()
            .uri("/api/track?lat=abc&lon=0&start=2026-11-14")
            .body(())
            .unwrap()
            .into_parts();
        let Err(resp) = Q::<TrackQuery>::from_request_parts(&mut parts, &()).await else {
            panic!("lat=abc must be rejected");
        };
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        assert_eq!(resp.headers()[header::CONTENT_TYPE], "application/json");
        let (mut ok, _) = axum::http::Request::builder()
            .uri("/api/track?lat=-89.5&lon=0&start=2026-11-14")
            .body(())
            .unwrap()
            .into_parts();
        assert!(
            Q::<TrackQuery>::from_request_parts(&mut ok, &())
                .await
                .is_ok()
        );
    }

    #[test]
    fn compare_start_lists() {
        let one = compare_starts(&cq(Some("2026-11-14"), None, None)).unwrap();
        assert_eq!(one, ["2026-11-14T00:00:00Z"]);
        let off = compare_starts(&cq(Some("2026-11-14T06:00"), None, Some("0, 1,7,30"))).unwrap();
        assert_eq!(off[1], "2026-11-15T06:00:00Z");
        assert_eq!(off[3], "2026-12-14T06:00:00Z");
        let st = compare_starts(&cq(None, Some("2026-11-14,2026-12-14"), None)).unwrap();
        assert_eq!(st.len(), 2);
        assert!(compare_starts(&cq(None, None, Some("0,1"))).is_err());
        assert!(compare_starts(&cq(Some("2026-11-14"), None, Some("x"))).is_err());
    }
}
