// Lunar Landing Site Navigator UI: explore one site or compare 2-3 sites over a time window.
// Talks to the Rust server (HANDOFF §5): GET /api/sites, GET /api/track.
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const state = {
  api: '',          // base URL of the server; '' = same origin
  demo: false,      // use web/mock.js instead of the server
  sites: [],
  view: 'explore',
  data: null,       // explore: one /api/track response
  cmp: [],          // compare: [{ site, data }]
  idx: 0,           // current point index (float while playing)
  playing: false,
  req: 0,           // request counter, drops stale responses
};

// ---------- server / demo ----------

function initServer() {
  const q = new URLSearchParams(location.search);
  state.demo = q.get('demo') === '1';
  // Deep link from the 3D view: index.html?lat=..&lon=..
  if (q.has('lat') && q.has('lon')) { $('lat').value = q.get('lat'); $('lon').value = q.get('lon'); }
  state.api = (q.get('api') ?? localStorage.getItem('navApi') ?? '').replace(/\/$/, '');
  $('api').value = state.api;
  showServer();
  $('server-form').onsubmit = e => {
    e.preventDefault();
    state.api = $('api').value.trim().replace(/\/$/, '');
    state.demo = false;
    localStorage.setItem('navApi', state.api);
    start();
  };
  $('use-demo').onclick = () => { state.demo = true; start(); };
}

function showServer() {
  $('server-label').textContent = state.demo ? 'demo data' : (state.api || 'this page\'s server');
  $('demo-banner').hidden = !state.demo;
}

async function api(path) {
  if (state.demo) return Mock.handle(path);
  let r;
  try { r = await fetch(state.api + path); } catch {
    throw new Error(`Cannot reach the server at ${state.api || location.origin}. Set the L1 address under "Server" (top right) or use demo data.`);
  }
  const body = await r.json().catch(() => null);
  if (body === null) throw new Error(`No navigator API at ${state.api || location.origin} (HTTP ${r.status}). Set the L1 address under "Server" (top right) or use demo data.`);
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status} for ${path}`);
  return body;
}

// ---------- sites ----------

async function loadSites() {
  state.sites = await api('/api/sites');
  const opts = state.sites.map((s, i) =>
    `<option value="${i}">${s.south_polar ? '❄ ' : ''}${esc(s.name)} (${esc(s.mission)})</option>`).join('');
  $('site').innerHTML = '<option value="">— custom coordinates —</option>' + opts;
  // Compare defaults: the first three south-polar sites (falls back to the first three).
  const polar = state.sites.map((s, i) => [s, i]).filter(([s]) => s.south_polar).map(([, i]) => i);
  const picks = (polar.length >= 3 ? polar : state.sites.map((_, i) => i)).slice(0, 3);
  document.querySelectorAll('.cmp-site').forEach((sel, k) => {
    sel.innerHTML = (k === 2 ? '<option value="">— none —</option>' : '') + opts;
    if (picks[k] !== undefined) sel.value = picks[k];
  });
  // Keep the explore selection in sync with typed coordinates.
  const match = state.sites.findIndex(s => Math.abs(s.lat_deg - +$('lat').value) < 1e-6 && Math.abs(s.lon_deg - +$('lon').value) < 1e-6);
  $('site').value = match >= 0 ? match : '';
}

// ---------- requests ----------

function trackQuery(lat, lon) {
  return '/api/track?' + new URLSearchParams({
    lat, lon, start: $('start').value, days: $('days').value, step_min: $('step').value,
  });
}

async function run() {
  const req = ++state.req;
  $('err').textContent = '';
  try {
    if (state.view === 'explore') {
      const data = await api(trackQuery($('lat').value, $('lon').value));
      if (req !== state.req) return;
      state.data = data;
    } else {
      const picks = [...document.querySelectorAll('.cmp-site')].map(s => s.value).filter(v => v !== '');
      const uniq = [...new Set(picks)].map(i => state.sites[+i]);
      if (uniq.length < 2) throw new Error('Pick at least two different sites to compare.');
      const datas = await Promise.all(uniq.map(s => api(trackQuery(s.lat_deg, s.lon_deg))));
      if (req !== state.req) return;
      state.cmp = uniq.map((site, k) => ({ site, data: datas[k] }));
    }
    const n = pointCount();
    state.idx = Math.min(state.idx, Math.max(0, n - 1));
    $('scrub').max = Math.max(0, n - 1);
    render();
  } catch (e) {
    if (req === state.req) $('err').textContent = e.message;
  }
}

function pointCount() {
  if (state.view === 'explore') return state.data ? state.data.points.length : 0;
  return state.cmp.length ? Math.min(...state.cmp.map(c => c.data.points.length)) : 0;
}

// ---------- rendering ----------

const fmt = (v, digits = 1, unit = '') => (v == null || Number.isNaN(v) ? '—' : `${(+v).toFixed(digits)}${unit}`);
const fmtTime = t => (t ? t.replace('T', ' ').replace(/(:\d\d)(\.\d+)?Z$/, ' UTC').replace(/:00 UTC$/, ' UTC') : '—');
const visWord = v => (v >= 0.999 ? 'fully visible' : v > 0 ? `${Math.round(v * 100)}% visible` : 'hidden');

function render() {
  const n = pointCount();
  if (!n) return;
  const i = Math.round(state.idx);
  $('scrub').value = state.idx;
  if (state.view === 'explore') renderExplore(i); else renderCompare(i);
}

function renderExplore(i) {
  const d = state.data, p = d.points[i];
  $('now').textContent = fmtTime(p.t);
  drawSky($('sky'), d, state.idx, { full: $('full-sky').checked });
  drawTimeline($('timeline'), d, state.idx);
  $('hz-source').textContent = d.horizon.source;

  const row = (name, cls, b, hz, v) =>
    `<dt class="${cls}">${name}</dt><dd>az ${fmt(b.az_deg)}° · el ${fmt(b.el_deg, 2)}°</dd><dd>${visWord(v)} <small>(terrain ${fmt(hz, 2)}°)</small></dd>`;
  $('readout').innerHTML = `<h2>${fmtTime(p.t)}</h2><dl>
    ${row('Sun', 'sun', p.sun, p.sun_horizon_deg, p.sun_vis)}
    ${row('Earth', 'earth', p.earth, p.earth_horizon_deg, p.earth_vis)}</dl>`;

  // Metrics are computed once per request; render only when the data object changes.
  if ($('metrics').dataset.for !== String(state.req)) {
    $('metrics').dataset.for = state.req;
    $('metrics').innerHTML = METRICS.map(m =>
      `<div class="metric"><small>${m.label}</small><b>${m.show(d.summary)}</b><small>${m.note(d.summary)}</small></div>`).join('');
  }
}

const METRICS = [
  { label: 'Sun visible', key: s => s.sun_visible_pct, better: 'hi', show: s => fmt(s.sun_visible_pct, 1, '%'), note: () => 'of the time' },
  { label: 'Mean solar disk', key: s => s.sun_mean_fraction, better: 'hi', show: s => fmt(s.sun_mean_fraction * 100, 1, '%'), note: () => '≈ relative solar energy' },
  { label: 'Earth visible (DTE)', key: s => s.earth_visible_pct, better: 'hi', show: s => fmt(s.earth_visible_pct, 1, '%'), note: () => 'direct-to-Earth link possible' },
  { label: 'Longest night', key: s => s.longest_night_hours, better: 'lo', show: s => fmt(s.longest_night_hours, 0, ' h'), note: () => 'continuous darkness' },
  { label: 'Longest DTE gap', key: s => s.longest_dte_gap_hours, better: 'lo', show: s => fmt(s.longest_dte_gap_hours, 0, ' h'), note: () => 'no direct link' },
  { label: 'Hours to sunset', key: s => s.hours_to_sunset, better: 'hi', show: s => fmt(s.hours_to_sunset, 0, ' h'), note: s => (s.next_sunset ? fmtTime(s.next_sunset) : 'no sunset in window') },
  { label: 'Hours to Earthset', key: s => s.hours_to_earthset, better: 'hi', show: s => fmt(s.hours_to_earthset, 0, ' h'), note: s => (s.next_earthset ? fmtTime(s.next_earthset) : 'no Earthset in window') },
  { label: 'Sunlight windows', key: s => s.sunlight_windows.length, better: null, show: s => String(s.sunlight_windows.length), note: s => `longest ${fmt(Math.max(0, ...s.sunlight_windows.map(w => w.hours)), 0, ' h')}` },
];

function renderCompare(i) {
  const cols = $('cmp-cols'), bands = $('cmp-bands');
  const key = state.cmp.map(c => c.site.name).join('|') + state.req;
  if (cols.dataset.for !== key) {
    cols.dataset.for = key;
    cols.innerHTML = state.cmp.map((c, k) => `<div class="panel cmp-col">
        <h3>${esc(c.site.name)}</h3>
        <div class="sub">${esc(c.site.mission)} · ${fmt(c.site.lat_deg, 3)}°, ${fmt(c.site.lon_deg, 3)}°E</div>
        <canvas data-k="${k}"></canvas><div class="now"></div></div>`).join('');
    bands.innerHTML = state.cmp.map((c, k) =>
      `<div class="cmp-band"><span title="${esc(c.site.name)}">${esc(c.site.name)}</span><canvas data-k="${k}"></canvas></div>`).join('');
    bands.querySelectorAll('canvas').forEach(attachScrub);
    renderCmpTable();
  }
  const p0 = state.cmp[0].data.points[i];
  $('now').textContent = fmtTime(p0.t);
  // One shared radial scale so the sites are visually comparable.
  const range = skyRange(state.cmp.map(c => c.data), false);
  cols.querySelectorAll('.cmp-col').forEach((el, k) => {
    const d = state.cmp[k].data, p = d.points[i];
    drawSky(el.querySelector('canvas'), d, state.idx, { range, compact: true });
    el.querySelector('.now').innerHTML =
      `<span style="color:var(--sun)">Sun</span> ${fmt(p.sun.el_deg, 2)}°, ${visWord(p.sun_vis)} · ` +
      `<span style="color:var(--earth)">Earth</span> ${fmt(p.earth.el_deg, 2)}°, ${visWord(p.earth_vis)}`;
  });
  bands.querySelectorAll('canvas').forEach(c => drawTimeline(c, state.cmp[+c.dataset.k].data, state.idx, { bandsOnly: true }));
  $('hz-source').textContent = [...new Set(state.cmp.map(c => c.data.horizon.source))].join(', ');
}

function renderCmpTable() {
  const head = '<tr><th></th>' + state.cmp.map(c => `<th>${esc(c.site.name)}</th>`).join('') + '</tr>';
  const rows = METRICS.map(m => {
    const vals = state.cmp.map(c => m.key(c.data.summary));
    const valid = vals.filter(v => v != null && !Number.isNaN(v));
    const best = m.better && valid.length > 1 ? (m.better === 'hi' ? Math.max(...valid) : Math.min(...valid)) : null;
    const allSame = valid.every(v => v === valid[0]);
    return `<tr><td>${m.label}</td>` + state.cmp.map((c, k) => {
      const isBest = best !== null && !allSame && vals[k] === best;
      return `<td class="${isBest ? 'best' : ''}">${m.show(c.data.summary)}${isBest ? ' ★' : ''}</td>`;
    }).join('') + '</tr>';
  }).join('');
  $('cmp-table').innerHTML = head + rows;
}

// ---------- time control ----------

function setIdx(v) {
  state.idx = Math.max(0, Math.min(pointCount() - 1, v));
  render();
}

function attachScrub(canvas) {
  const go = e => setIdx(timelineIndexAt(canvas, pointCount(), e.clientX));
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pause(); go(e); });
  canvas.addEventListener('pointermove', e => { if (e.buttons) go(e); });
}

let last = 0;
function tick(ts) {
  if (!state.playing) return;
  const dt = last ? (ts - last) / 1000 : 0; last = ts;
  const perSec = (+$('speed').value * 1440) / +$('step').value; // points per second
  let v = state.idx + dt * perSec;
  if (v >= pointCount() - 1) v = 0;
  setIdx(v);
  requestAnimationFrame(tick);
}
function play() { if (!pointCount()) return; state.playing = true; last = 0; $('play').textContent = '❚❚'; $('play').setAttribute('aria-label', 'Pause'); requestAnimationFrame(tick); }
function pause() { state.playing = false; $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Play'); }

// ---------- wiring ----------

function setView(view) {
  state.view = view;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === view)));
  document.querySelectorAll('[data-only]').forEach(el => { el.hidden = el.dataset.only !== view; });
  run();
}

function shiftStart(days) {
  const d = new Date($('start').value + 'Z');
  d.setUTCDate(d.getUTCDate() + days);
  $('start').value = d.toISOString().slice(0, 16);
  run();
}

async function start() {
  showServer();
  $('err').textContent = '';
  try {
    await loadSites();
    await run();
  } catch (e) {
    $('err').textContent = e.message;
    $('server').open = true;
  }
}

function wire() {
  $('f').onsubmit = e => { e.preventDefault(); run(); };
  $('site').onchange = () => {
    const s = state.sites[$('site').value];
    if (s) { $('lat').value = s.lat_deg; $('lon').value = s.lon_deg; run(); }
  };
  ['lat', 'lon'].forEach(id => $(id).addEventListener('input', () => { $('site').value = ''; }));
  document.querySelectorAll('.cmp-site').forEach(s => (s.onchange = run));
  document.querySelectorAll('.slips button').forEach(b => (b.onclick = () => shiftStart(+b.dataset.d)));
  document.querySelectorAll('.tabs button').forEach(b => (b.onclick = () => setView(b.dataset.tab)));
  $('full-sky').onchange = render;
  $('play').onclick = () => (state.playing ? pause() : play());
  $('scrub').oninput = () => { pause(); setIdx(+$('scrub').value); };
  attachScrub($('timeline'));
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    // A focused button would also "click" on Space/Enter; drop focus so only our shortcut runs.
    if (e.target.matches('button')) e.target.blur();
    if (e.key === ' ') { e.preventDefault(); state.playing ? pause() : play(); }
    if (e.key === 'ArrowRight') setIdx(Math.round(state.idx) + (e.shiftKey ? 24 : 1));
    if (e.key === 'ArrowLeft') setIdx(Math.round(state.idx) - (e.shiftKey ? 24 : 1));
  });
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(render, 100); });
}

initServer();
wire();
start();
