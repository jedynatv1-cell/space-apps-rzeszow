// DEMO DATA ONLY: a rough analytic stand-in for /api/sites and /api/track, used when the L1
// server is unreachable so the UI can still be developed and demoed. Not ephemeris-accurate
// (simple circular orbits + libration sines) and the terrain is synthetic. The UI labels it.
'use strict';

const Mock = (() => {
  const D = Math.PI / 180;
  const SITES = [
    ['Shackleton rim peak (planned)', 'Chang\'e 7', -88.8, 123.4, true],
    ['Haworth (candidate region)', 'Artemis', -87.45, -5.17, true],
    ['Malapert Massif (candidate region)', 'Artemis', -85.98, -1.67, true],
    ['Nobile Rim 1 (candidate region)', 'Artemis', -85.2752, 53.2725, true],
    ['de Gerlache Rim 2 (candidate region)', 'Artemis', -88.4849, -88.3447, true],
    ['Athena on Mons Mouton', 'IM-2', -84.79056, 29.19583, true],
    ['Statio Shiv Shakti', 'Chandrayaan-3', -69.3734, 32.3198, false],
    ['Tranquility Base', 'Apollo 11', 0.67416, 23.47314, false],
  ].map(([name, mission, lat_deg, lon_deg, south_polar]) => ({
    name, mission, country_or_agency: '', lat_deg, lon_deg, south_polar,
    status: 'demo', source_url: '', coord_note: 'demo data',
  }));

  function azel(latDeg, lonDeg, decDeg, subLonDeg) {
    const φ = latDeg * D, λ = lonDeg * D, δ = decDeg * D, λb = subLonDeg * D;
    const d = [Math.cos(δ) * Math.cos(λb), Math.cos(δ) * Math.sin(λb), Math.sin(δ)];
    const U = [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
    const E = [-Math.sin(λ), Math.cos(λ), 0];
    const N = [-Math.sin(φ) * Math.cos(λ), -Math.sin(φ) * Math.sin(λ), Math.cos(φ)];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const el = Math.asin(dot(d, U)) / D;
    const az = ((Math.atan2(dot(d, E), dot(d, N)) / D) + 360) % 360;
    return { az, el };
  }

  function horizon(lat, lon) {
    const polar = Math.max(0, (-lat - 60) / 30); // bumpier near the pole
    const seed = lat * 13.1 + lon * 7.7;
    const elev = [];
    for (let i = 0; i < 720; i++) {
      const a = i * 0.5 * D;
      elev.push(polar * (0.9 * Math.sin(3 * a + seed) + 0.6 * Math.sin(7 * a + 2 * seed)
        + 0.35 * Math.sin(17 * a + 3 * seed)) - 0.15);
    }
    return { az_step_deg: 0.5, elev_deg: elev, source: 'demo (synthetic terrain)' };
  }

  const vis = (el, hz, r) => Math.max(0, Math.min(1, (el - hz + r) / (2 * r)));

  function windows(points, key, stepH) {
    const out = []; let s = null;
    points.forEach((p, i) => {
      if (p[key] > 0 && s === null) s = i;
      if ((p[key] <= 0 || i === points.length - 1) && s !== null) {
        const e = p[key] > 0 ? i : i - 1;
        out.push({ start: points[s].t, end: points[e].t, hours: (e - s + 1) * stepH });
        s = null;
      }
    });
    return out;
  }

  function longestGap(points, key, stepH) {
    let best = 0, run = 0;
    for (const p of points) { run = p[key] > 0 ? 0 : run + 1; best = Math.max(best, run); }
    return best * stepH;
  }

  function nextSet(points, key, stepH) {
    let seen = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i][key] > 0) seen = true;
      else if (seen) return [points[i].t, i * stepH];
    }
    return [null, null];
  }

  function track(q) {
    const lat = +q.get('lat'), lon = +q.get('lon');
    const days = +(q.get('days') || 30), step = +(q.get('step_min') || 60);
    let start = q.get('start') || '2026-11-14';
    if (!/Z$/.test(start)) start += start.length <= 10 ? 'T00:00:00Z' : (start.length === 16 ? ':00Z' : 'Z');
    const t0 = Date.parse(start);
    if (!isFinite(lat) || !isFinite(lon) || !isFinite(t0)) throw new Error('bad query');
    const n = Math.min(20000, Math.floor(days * 1440 / step) + 1);
    const hz = horizon(lat, lon), stepH = step / 60;
    const points = [];
    for (let i = 0; i < n; i++) {
      const t = t0 + i * step * 6e4, dd = (t - Date.UTC(2026, 0, 1)) / 864e5;
      const sunDec = 1.54 * Math.sin(2 * Math.PI * dd / 346.6);
      const sunLon = 180 - 360 * dd / 29.5306;
      const earthDec = 6.7 * Math.sin(2 * Math.PI * dd / 27.212);
      const earthLon = 7.9 * Math.sin(2 * Math.PI * dd / 27.555);
      const s = azel(lat, lon, sunDec, sunLon), e = azel(lat, lon, earthDec, earthLon);
      const sh = horizonAt(hz, s.az), eh = horizonAt(hz, e.az);
      const sun = { az_deg: s.az, el_deg: s.el, radius_deg: 0.2666, distance_km: 1.496e8 };
      const earth = { az_deg: e.az, el_deg: e.el, radius_deg: 0.95, distance_km: 384400 };
      points.push({
        t: new Date(t).toISOString().replace('.000', ''), sun, earth,
        sun_horizon_deg: sh, earth_horizon_deg: eh,
        sun_vis: vis(s.el, sh, sun.radius_deg), earth_vis: vis(e.el, eh, earth.radius_deg),
      });
    }
    const mean = k => points.reduce((a, p) => a + p[k], 0) / n;
    const pct = k => 100 * points.filter(p => p[k] > 0).length / n;
    const [next_sunset, hours_to_sunset] = nextSet(points, 'sun_vis', stepH);
    const [next_earthset, hours_to_earthset] = nextSet(points, 'earth_vis', stepH);
    return {
      site: { lat_deg: lat, lon_deg: lon, alt_m: 0 }, horizon: hz,
      summary: {
        sun_mean_fraction: mean('sun_vis'), sun_visible_pct: pct('sun_vis'),
        earth_visible_pct: pct('earth_vis'),
        longest_night_hours: longestGap(points, 'sun_vis', stepH),
        longest_dte_gap_hours: longestGap(points, 'earth_vis', stepH),
        next_sunset, next_earthset, hours_to_sunset, hours_to_earthset,
        sunlight_windows: windows(points, 'sun_vis', stepH),
        dte_windows: windows(points, 'earth_vis', stepH),
      },
      points,
    };
  }

  /** Answer an API path like the real server would. */
  function handle(path) {
    const [p, qs] = path.split('?');
    if (p === '/api/sites') return SITES;
    if (p === '/api/health') return { ok: true, demo: true };
    if (p === '/api/track') return track(new URLSearchParams(qs));
    throw new Error(`demo data has no ${p}`);
  }

  return { handle };
})();
