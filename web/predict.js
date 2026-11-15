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
  #predict-panel { margin-top: 8px; }
  #predict-panel .pr-controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; margin: 8px 0; }
  #predict-panel .pr-controls label { display: flex; flex-direction: column; gap: 4px; font: 600 9.5px/1 var(--mono); color: var(--muted, #8b9bb4); text-transform: uppercase; letter-spacing: 0.08em; }
  #predict-panel input[type=range] { width: min(340px, 65vw); height: 5px; padding: 0; appearance: none; -webkit-appearance: none; background: #182235; border: 1px solid var(--line-strong, #2a3752); border-radius: 2px; cursor: pointer; }
  #predict-panel input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 16px; background: var(--earth, #38bdf8); border: 1px solid #fff; border-radius: 1px; }
  #predict-panel input[type=number] { width: 84px; }
  #predict-panel .pr-err { color: var(--warn, #f59e0b); font-weight: 600; }
  #predict-panel .pr-sum { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line, #1b2436); font: 500 11.5px/1.3 var(--mono); }
  #predict-panel .pr-sum b { font-size: 16px; font-variant-numeric: tabular-nums; margin-left: 4px; }
  #predict-panel .pr-msg { color: var(--muted, #8b9bb4); font: 500 11px/1.3 var(--mono); min-height: 1em; }
  #predict-panel .pr-wrap { overflow-x: auto; }`;

  const fmt = (v, d) => (v == null || Number.isNaN(+v) ? '—' : (+v).toFixed(d));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function build() {
    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    const sec = document.createElement('section');
    sec.className = 'panel'; sec.id = 'predict-panel'; sec.hidden = true;
    sec.innerHTML = `
      <div class="inst-bar">
        <div class="inst-title">
          <span class="inst-code">INST-NN</span>
          <h2>Moon Position Predictor (Neural Network vs JPL DE440s)</h2>
          <span class="inst-readout">${esc(LABEL)}</span>
        </div>
        <div class="chart-switch pr-seg" role="radiogroup" aria-label="Model">
          <button type="button" role="radio" data-model="ppo" aria-checked="true">PPO 30-Day</button>
          <button type="button" role="radio" data-model="base" aria-checked="false">Base RK4+MLP</button>
        </div>
      </div>
      <div class="pr-controls">
        <label>Propagation Horizon: <span id="pr-days-lbl">7 days</span>
          <input id="pr-range" type="range" min="0" max="120" step="0.25" value="7"></label>
        <label>Days <input id="pr-days" type="number" min="0" max="120" step="any" value="7"></label>
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
