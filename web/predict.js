// Moon position predictor panel (learned model vs JPL DE440s), self-contained.
// Calls GET /api/moon_predict (W2/L2). The panel mounts into #predict-mount if the page has one
// (otherwise at the end of <main>) and stays hidden when the endpoint is missing (404) or unreachable.
// Field names are mapped in ONE place (adapt() below) so backend naming changes are a one-line fix.
'use strict';

(() => {
  const DAY_MS = 864e5;
  const LABEL = 'learned model — validation/demo; mission numbers use JPL DE440s';
  const q = new URLSearchParams(location.search);
  const API = (q.get('api') ?? localStorage.getItem('navApi') ?? '').replace(/\/$/, '');
  const isOffline = q.get('demo') === '1' || q.get('recorded') === '1';

  // ---------- backend contract (adjust here only) ----------
  function query({ startIso, daysAhead, model }) {
    return '/api/moon_predict?' + new URLSearchParams({ start: startIso, days: daysAhead, model });
  }
  const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null) return o[k]; return null; };
  function adapt(r) {
    const pred = pick(r, ['predicted', 'pred', 'model', 'learned']) || {};
    const ref = pick(r, ['de440', 'de440s', 'reference', 'ref', 'truth']) || {};
    const body = o => ({
      dist: pick(o, ['distance_km', 'dist_km', 'r_km']),
      ra: pick(o, ['ra_deg', 'ra']),
      dec: pick(o, ['dec_deg', 'dec']),
      lon: pick(o, ['ecl_lon_deg', 'lon_deg', 'lambda_deg']),
      lat: pick(o, ['ecl_lat_deg', 'lat_deg', 'beta_deg']),
    });
    const P = body(pred), R = body(ref);
    let errKm = pick(r, ['error_km', 'err_km', 'pos_err_km', 'position_error_km']);
    let errDeg = pick(r, ['error_deg', 'err_deg', 'ang_err_deg', 'angular_error_deg']);
    if (errDeg == null && P.ra != null && R.ra != null) errDeg = angSep(P.ra, P.dec, R.ra, R.dec);
    if (errKm == null && P.dist != null && R.dist != null && errDeg != null) {
      // Chord between the two position vectors (law of cosines).
      const a = errDeg * Math.PI / 180;
      errKm = Math.sqrt(P.dist ** 2 + R.dist ** 2 - 2 * P.dist * R.dist * Math.cos(a));
    }
    return { P, R, errKm, errDeg, t: pick(r, ['t', 'time', 'epoch', 't_utc']), model: pick(r, ['model_name', 'model_id']) };
  }
  function angSep(ra1, de1, ra2, de2) {
    const d = Math.PI / 180;
    const c = Math.sin(de1 * d) * Math.sin(de2 * d) + Math.cos(de1 * d) * Math.cos(de2 * d) * Math.cos((ra1 - ra2) * d);
    return Math.acos(Math.max(-1, Math.min(1, c))) / d;
  }

  // ---------- UI ----------
  const CSS = `
  #predict-panel { margin-top: 16px; }
  #predict-panel .pr-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  #predict-panel .pr-tag { font-size: 11px; color: var(--muted, #8b93a7); letter-spacing: .04em; }
  #predict-panel .pr-controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: end; margin: 10px 0; }
  #predict-panel .pr-controls label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted, #8b93a7); }
  #predict-panel input[type=range] { width: min(360px, 70vw); }
  #predict-panel input[type=number] { width: 90px; }
  #predict-panel .pr-seg { display: inline-flex; border: 1px solid #2c3548; border-radius: 999px; padding: 2px; }
  #predict-panel .pr-seg button { border: 0; background: transparent; color: var(--muted, #8b93a7); border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
  #predict-panel .pr-seg button[aria-checked="true"] { background: #1f2937; color: var(--text, #e6e9ef); }
  #predict-panel table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 13px; }
  #predict-panel th, #predict-panel td { padding: 5px 8px; border-bottom: 1px solid var(--line, #222a3a); text-align: right; }
  #predict-panel th:first-child, #predict-panel td:first-child { text-align: left; color: var(--muted, #8b93a7); font-weight: normal; }
  #predict-panel .pr-err { color: #ffb000; }
  #predict-panel .pr-sum { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 10px; font-size: 13px; }
  #predict-panel .pr-sum b { font-size: 18px; font-variant-numeric: tabular-nums; }
  #predict-panel .pr-msg { color: var(--muted, #8b93a7); font-size: 12px; min-height: 1em; }
  #predict-panel .pr-wrap { overflow-x: auto; }`;

  const fmt = (v, d) => (v == null || Number.isNaN(+v) ? '—' : (+v).toFixed(d));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function build() {
    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    const sec = document.createElement('section');
    sec.className = 'panel'; sec.id = 'predict-panel'; sec.hidden = true;
    sec.innerHTML = `
      <div class="pr-head"><h2>Moon position predictor (neural network)</h2><span class="pr-tag">${esc(LABEL)}</span></div>
      <div class="pr-controls">
        <label>Time ahead: <span id="pr-days-lbl">7 days</span>
          <input id="pr-range" type="range" min="0" max="120" step="0.25" value="7"></label>
        <label>Days <input id="pr-days" type="number" min="0" max="120" step="any" value="7"></label>
        <div><div class="pr-tag" style="margin-bottom:4px">Model</div>
          <div class="pr-seg" role="radiogroup" aria-label="Model">
            <button type="button" role="radio" data-model="ppo" aria-checked="true">PPO 30-day</button>
            <button type="button" role="radio" data-model="base" aria-checked="false">Base</button>
          </div></div>
      </div>
      <div class="pr-msg" id="pr-msg"></div>
      <div class="pr-wrap"><table id="pr-table"></table></div>
      <div class="pr-sum" id="pr-sum"></div>`;
    const mount = document.getElementById('predict-mount') || document.querySelector('main') || document.body;
    mount.append(sec);
    return sec;
  }

  let model = 'ppo', reqId = 0, timer = 0;

  function startIso() {
    const v = document.getElementById('start')?.value; // the page's analysis start, else now
    const ms = v ? Date.parse(v + 'Z') : Date.now();
    return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString().slice(0, 16);
  }

  async function fetchPrediction(daysAhead) {
    const r = await fetch(API + query({ startIso: startIso(), daysAhead, model }));
    if (r.status === 404) return { missing: true };
    const body = await r.json().catch(() => null);
    if (!r.ok || !body) throw new Error((body && body.error) || `HTTP ${r.status}`);
    return { data: adapt(body) };
  }

  function render(a, daysAhead) {
    const rows = [
      ['Distance (km)', a.P.dist, a.R.dist, 0],
      ['Right ascension (°)', a.P.ra, a.R.ra, 3],
      ['Declination (°)', a.P.dec, a.R.dec, 3],
      ['Ecliptic longitude (°)', a.P.lon, a.R.lon, 3],
      ['Ecliptic latitude (°)', a.P.lat, a.R.lat, 3],
    ];
    document.getElementById('pr-table').innerHTML =
      '<tr><th></th><th>Learned model</th><th>JPL DE440s</th><th>Difference</th></tr>' +
      rows.map(([n, p, r, d]) => `<tr><td>${n}</td><td>${fmt(p, d)}</td><td>${fmt(r, d)}</td><td class="pr-err">${p == null || r == null ? '—' : ((p - r > 0 ? '+' : '') + fmt(p - r, d))}</td></tr>`).join('');
    const t = a.t || new Date(Date.parse(startIso() + 'Z') + daysAhead * DAY_MS).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    document.getElementById('pr-sum').innerHTML =
      `<span>Position error <b class="pr-err">${fmt(a.errKm, 0)} km</b></span>` +
      `<span>Direction error <b class="pr-err">${fmt(a.errDeg, 3)}°</b></span>` +
      `<span class="pr-tag">at ${esc(t)}${a.model ? ' · ' + esc(a.model) : ''}</span>`;
  }

  async function update(daysAhead) {
    const id = ++reqId;
    document.getElementById('pr-msg').textContent = 'Computing…';
    try {
      const res = await fetchPrediction(daysAhead);
      if (id !== reqId) return;
      if (res.missing) { document.getElementById('predict-panel').hidden = true; return; }
      render(res.data, daysAhead);
      document.getElementById('pr-msg').textContent = '';
    } catch (e) {
      if (id === reqId) document.getElementById('pr-msg').textContent = `Predictor unavailable: ${e.message}`;
    }
  }

  function setDays(v, from) {
    const d = Math.max(0, Math.min(120, +v || 0));
    if (from !== 'range') document.getElementById('pr-range').value = d;
    if (from !== 'num') document.getElementById('pr-days').value = d;
    document.getElementById('pr-days-lbl').textContent = d < 2 ? `${Math.round(d * 24)} hours` : `${+d.toFixed(2)} days`;
    clearTimeout(timer); timer = setTimeout(() => update(d), 200); // debounce slider drags
  }

  async function init() {
    if (isOffline) return; // needs the live server
    const sec = build();
    try {
      const probe = await fetchPrediction(0);
      if (probe.missing) return; // endpoint not deployed: keep the panel hidden
      sec.hidden = false;
    } catch { return; }
    document.getElementById('pr-range').addEventListener('input', e => setDays(e.target.value, 'range'));
    document.getElementById('pr-days').addEventListener('input', e => setDays(e.target.value, 'num'));
    sec.querySelectorAll('[data-model]').forEach(b => b.addEventListener('click', () => {
      model = b.dataset.model;
      sec.querySelectorAll('[data-model]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      setDays(document.getElementById('pr-days').value);
    }));
    document.getElementById('start')?.addEventListener('change', () => setDays(document.getElementById('pr-days').value));
    setDays(7);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
