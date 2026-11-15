// Lunar Landing Site Navigator UI: explore one site or compare 2-3 sites over a time window.
// Talks to the Rust server (HANDOFF §5): GET /api/sites, GET /api/track.
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const state = {
  api: '',          // base URL of the server; '' = same origin
  demo: false,      // use web/mock.js instead of the server
  recorded: false,  // replay real L1 responses from web/samples/
  mode: localStorage.getItem('navMode') || 'expert', // 'public' | 'expert'
  sites: [],
  view: 'explore',
  skyView: 'pano',  // 'pano' (default 360° panorama) | 'polar' (polar radar dome)
  cmpView: 'pano',  // 'pano' (stacked 360° panoramas) | 'polar' (side-by-side polar radar)
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
  state.recorded = q.get('recorded') === '1';
  // Deep link from the 3D view: index.html?lat=..&lon=..
  if (q.has('lat') && q.has('lon')) { $('lat').value = q.get('lat'); $('lon').value = q.get('lon'); }
  // Demo deep links: ?start=2026-11-14&days=14&step=60&mode=public&view=compare&cmp=Haworth,Malapert&site=Shackleton&focus=slips|pano|sky
  if (q.has('start')) { const v = q.get('start'); $('start').value = v.length <= 10 ? `${v}T00:00` : v.slice(0, 16); }
  if (q.has('days')) $('days').value = q.get('days');
  if (q.has('step')) $('step').value = q.get('step');
  if (q.has('mode')) state.mode = q.get('mode');
  state.link = q;
  state.api = (q.get('api') ?? localStorage.getItem('navApi') ?? '').replace(/\/$/, '');
  $('api').value = state.api;
  showServer();
  $('server-form').onsubmit = e => {
    e.preventDefault();
    state.api = $('api').value.trim().replace(/\/$/, '');
    state.demo = false; state.recorded = false;
    localStorage.setItem('navApi', state.api);
    start();
  };
  $('use-demo').onclick = () => { state.demo = true; state.recorded = false; start(); };
  $('use-recorded').onclick = () => { state.recorded = true; state.demo = false; start(); };
}

function showServer() {
  $('server-label').textContent = state.recorded ? 'RECORDED L1' : state.demo ? 'SYNTHETIC' : (state.api || 'LIVE LOCAL');
  $('demo-banner').hidden = !state.demo && !state.recorded;
  $('demo-banner').textContent = state.recorded
    ? 'RECORDED L1 TELEMETRY: validated server responses for 4 reference sites (window: 2026-11-14 + 30 d, 60 min step). Connect to live server for custom coordinates.'
    : 'SYNTHETIC MODE: approximate analytical ephemeris and procedural terrain. Connect to live server for JPL DE440s + LRO LOLA DEM telemetry.';
  if (state.recorded) { $('start').value = '2026-11-14T00:00'; $('days').value = 30; $('step').value = 60; }
}

// Real /api/track responses captured on L1 (web/samples/README.md): file, name, lat, lon.
const RECORDED = [
  ['track_shackleton_rim.json', 'Shackleton rim (recorded)', -89.45, -129.78],
  ['track_malapert.json', 'Mons Malapert (recorded)', -85.98, -1.67],
  ['track_de_gerlache_area.json', 'de Gerlache area (recorded)', -88.5, -87.0],
  ['track_apollo11.json', 'Apollo 11 (recorded)', 0.67416, 23.47314],
];

async function recorded(path) {
  const [p, qs] = path.split('?');
  if (p === '/api/sites') {
    return RECORDED.map(([, name, lat_deg, lon_deg]) => ({ name, mission: 'recorded on L1', country_or_agency: '',
      lat_deg, lon_deg, south_polar: lat_deg < -60, status: 'recorded', source_url: '', coord_note: null }));
  }
  if (p === '/api/track') {
    const q = new URLSearchParams(qs), lat = +q.get('lat'), lon = +q.get('lon');
    const hit = RECORDED.find(([, , a, b]) => Math.abs(a - lat) < 0.02 && Math.abs(b - lon) < 0.02);
    if (!hit) throw new Error(`Recorded data covers only: ${RECORDED.map(r => r[1]).join(', ')}. Other places need the live server.`);
    const r = await fetch('samples/' + hit[0]);
    if (!r.ok) throw new Error(`Missing web/samples/${hit[0]} (HTTP ${r.status}).`);
    return r.json();
  }
  throw new Error(`Recorded data has no ${p}`);
}

async function api(path) {
  if (state.recorded) return recorded(path);
  if (state.demo) return Mock.handle(path);
  let r;
  try { r = await fetch(state.api + path); } catch {
    throw new Error(`Cannot reach the server at ${state.api || location.origin}. Set the L1 address under "LINK" (top right) or use synthetic demo data.`);
  }
  const body = await r.json().catch(() => null);
  if (body === null) throw new Error(`No navigator API at ${state.api || location.origin} (HTTP ${r.status}). Set the L1 address under "LINK" (top right) or use synthetic demo data.`);
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status} for ${path}`);
  return body;
}

// ---------- sites ----------

// Short, readable site labels: "Haworth (Artemis region)", "Tranquility Base (Statio Tranquillitatis) (Apollo 11)".
const shortMission = s => (s.status === 'candidate_region' ? 'Artemis region' : String(s.mission).replace(/\s*\(.*\)$/, ''));
const siteLabel = s => `${String(s.name).replace(/\s*\(candidate region\)$/, '')} (${shortMission(s)})`;

async function loadSites() {
  state.sites = await api('/api/sites');
  const opts = state.sites.map((s, i) =>
    `<option value="${i}">${s.south_polar ? '[Polar] ' : ''}${esc(siteLabel(s))}</option>`).join('');
  $('site').innerHTML = '<option value="">— custom coordinates —</option>' + opts;
  // Compare defaults: the first three south-polar sites (falls back to the first three).
  const polar = state.sites.map((s, i) => [s, i]).filter(([s]) => s.south_polar).map(([, i]) => i);
  const picks = (polar.length >= 3 ? polar : state.sites.map((_, i) => i)).slice(0, 3);
  document.querySelectorAll('.cmp-site').forEach((sel, k) => {
    sel.innerHTML = (k === 2 ? '<option value="">— none —</option>' : '') + opts;
    if (picks[k] !== undefined) sel.value = picks[k];
  });
  // Deep-link site choices by (part of) the site name, so links survive changes to the site list order.
  const byName = t => {
    const k = t.trim().toLowerCase(), names = state.sites.map(s => s.name.toLowerCase());
    const starts = names.findIndex(n => n.startsWith(k));
    return starts >= 0 ? starts : names.findIndex(n => n.includes(k));
  };
  const link = state.link;
  if (link?.has('cmp')) {
    const ids = link.get('cmp').split(',').map(byName).filter(i => i >= 0);
    document.querySelectorAll('.cmp-site').forEach((sel, k) => { sel.value = ids[k] !== undefined ? ids[k] : (k === 2 ? '' : sel.value); });
  }
  if (link?.has('site')) {
    const i = byName(link.get('site'));
    if (i >= 0) { $('lat').value = state.sites[i].lat_deg; $('lon').value = state.sites[i].lon_deg; }
  }
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

const BUSY_DEFAULT = 'Computing topocentric ephemeris & ray-marching LOLA DEM…';
function setBusy(on, msg = BUSY_DEFAULT) {
  $('busy').hidden = !on;
  $('busy').lastChild.textContent = ' ' + msg;
  $('best').disabled = on;
  if ($('splice-run-btn')) $('splice-run-btn').disabled = on;
  if ($('csv')) $('csv').disabled = on;
  document.querySelector('main').classList.toggle('loading', on);
  $('f').querySelector('button[type=submit]').disabled = on;
}

function downloadCsv() {
  if (state.demo || state.recorded) { $('err').textContent = 'CSV export requires the live server.'; return; }
  const problem = validate();
  if (problem) { $('err').textContent = problem; return; }
  location.href = (state.api || '') + trackQuery($('lat').value, $('lon').value) + '&format=csv';
}

/** Check the form before asking the server; returns a plain-language problem or null. */
function validate() {
  const days = +$('days').value, step = +$('step').value, start = Date.parse($('start').value + 'Z');
  if (!Number.isFinite(start)) return 'Pick a start date and time.';
  if (!(days > 0 && days <= 400)) return 'Days must be between 1 and 400.';
  if (!(step >= 1)) return 'Step must be at least 1 minute.';
  const n = Math.floor(days * 1440 / step) + 1;
  if (n > 20000) return `That is ${n.toLocaleString('en')} time steps; the limit is 20,000. Use fewer days or a larger step (at least ${Math.ceil(days * 1440 / 19999)} min for ${days} days).`;
  if (state.view === 'explore') {
    const lat = +$('lat').value, lon = +$('lon').value;
    if ($('lat').value === '' || !(lat >= -90 && lat <= 90)) return 'Latitude must be between −90 and 90.';
    if ($('lon').value === '' || !(lon >= -180 && lon <= 180)) return 'Longitude must be between −180 and 180 (east positive).';
  }
  return null;
}

async function run() {
  const req = ++state.req;
  $('err').textContent = '';
  const problem = validate();
  if (problem) {
    $('err').textContent = problem;
    document.querySelector('main').classList.add('stale');
    ['slips', 'best-panel'].forEach(id => { $(id).hidden = true; });
    return;
  }
  document.querySelector('main').classList.remove('stale');
  $('best-panel').hidden = true;
  const busyTimer = setTimeout(() => { if (req === state.req) setBusy(true); }, 250);
  try {
    if (state.view === 'explore') {
      const data = await api(trackQuery($('lat').value, $('lon').value));
      if (req !== state.req) return;
      state.data = data;
      loadSlips(req);
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
    requestAnimationFrame(render);
  } catch (e) {
    if (req === state.req) $('err').textContent = e.message;
  } finally {
    clearTimeout(busyTimer);
    if (req === state.req) setBusy(false);
  }
}

function pointCount() {
  if (state.view === 'explore') return state.data ? state.data.points.length : 0;
  return state.cmp.length ? Math.min(...state.cmp.map(c => c.data.points.length)) : 0;
}

// ---------- rendering ----------

const fmt = (v, digits = 1, unit = '') => (v == null || Number.isNaN(v) ? '—' : `${(+v).toFixed(digits)}${unit}`);
const fmtTime = t => (t ? t.replace('T', ' ').replace(/(:\d\d)(\.\d+)?Z$/, ' UTC').replace(/:00 UTC$/, ' UTC') : '—');
const visWord = v => (v >= 0.999 ? 'fully visible' : v > 0 ? `${Math.round(v * 100)}% visible` : 'occluded');

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
  const isPolar = state.skyView === 'polar';
  $('pano').hidden = isPolar;
  $('sky').hidden = !isPolar;
  const fullSkyLabel = $('full-sky-label');
  if (fullSkyLabel) fullSkyLabel.hidden = !isPolar;

  if (isPolar) {
    drawSky($('sky'), d, state.idx, { full: $('full-sky').checked });
    $('pano-note').textContent = `POLAR RADAR: Zenith at center · Horizon at outer ring · LOLA DEM: ${d.horizon.source}${d.horizon.ground_m != null ? ` (${Math.round(d.horizon.ground_m)} m)` : ''}`;
  } else {
    state.pano = drawPanorama($('pano'), d, state.idx);
    $('pano-note').textContent = `LOLA DEM: ${d.horizon.source}${d.horizon.ground_m != null ? ` (alt ${Math.round(d.horizon.ground_m)} m)` : ''} · VERT EXAG ×${Math.max(1, Math.round(state.pano.exaggeration))}`;
  }
  drawTimeline($('timeline'), d, state.idx);
  $('hz-source').textContent = d.horizon.source;

  // Update SPLICE live telemetry readouts
  const trnEl = $('splice-trn-readout'), hdlEl = $('splice-hdl-readout'), dqgEl = $('splice-dqg-readout');
  if (trnEl) trnEl.textContent = `FIX: ${fmt(+$('lat').value, 3)}°N, ${fmt(+$('lon').value, 3)}°E · ALT ${d.horizon.ground_m != null ? Math.round(d.horizon.ground_m) + ' m' : 'REF'}`;
  if (hdlEl) hdlEl.textContent = `DEM: ${d.horizon.source} · Sunlit ${fmt(d.summary.sun_visible_pct, 1)}% · DTE ${fmt(d.summary.earth_visible_pct, 1)}%`;
  if (dqgEl && $('best-panel').hidden) dqgEl.textContent = `READY: click "Best spot within 500 m" to evaluate 81-point grid`;

  const count = (key, cls, setWord, riseWord) => {
    const c = nextChange(d.points, i, key);
    const up = isUp(key, p[key]);
    const word = c ? (c.kind === 'set' ? setWord : riseWord) : (up ? setWord : riseWord);
    return `<div class="count ${cls}"><small>${word} in</small><b>${c ? fmtDur(c.hours) : '—'}</b>` +
      `<span>${c ? fmtTime(c.t) : (up ? 'continuous to window end' : 'occluded to window end')}</span></div>`;
  };
  const row = (name, cls, b, hz, v) =>
    `<dt class="${cls}">${name}</dt><dd>AZ ${fmt(b.az_deg)}° · EL ${fmt(b.el_deg, 2)}°</dd><dd>${visWord(v)} <small>(ridge ${fmt(hz, 2)}°)</small></dd>`;
  $('readout').innerHTML = `<div class="readout-head"><span class="inst-code">EPOCH</span><h2>${fmtTime(p.t)}</h2></div>
    <div class="counts">${count('sun_vis', 'sun', 'Sunset', 'Sunrise')}${count('earth_vis', 'earth', 'Earthset', 'Earthrise')}</div><dl class="expert">
    ${row('Sun', 'sun', p.sun, p.sun_horizon_deg, p.sun_vis)}
    ${row('Earth', 'earth', p.earth, p.earth_horizon_deg, p.earth_vis)}</dl>`;

  // Metrics are computed once per request; render only when the data object changes.
  if ($('metrics').dataset.for !== String(state.req)) {
    $('metrics').dataset.for = state.req;
    renderVerdict(d.summary);
    $('metrics').innerHTML = METRICS.filter(m => !m.compareOnly).map(m =>
      `<div class="metric${mClass(m)}"><small>${mLabel(m)}</small><b>${m.show(d.summary)}</b><small>${m.note(d.summary)}</small></div>`).join('');
  }
}

/** From point i: when does the body next change state (set if visible now, rise if hidden)? */
const isUp = (key, v) => (key === 'earth_vis' ? v >= 0.5 : v > 0);
function nextChange(points, i, key) {
  const up = isUp(key, points[i][key]), t0 = Date.parse(points[i].t);
  for (let k = i + 1; k < points.length; k++) {
    if (isUp(key, points[k][key]) !== up) return { kind: up ? 'set' : 'rise', t: points[k].t, hours: (Date.parse(points[k].t) - t0) / 36e5 };
  }
  return null;
}
function fmtDur(h) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const d = Math.floor(h / 24), r = Math.round(h - d * 24);
  return d ? `${d} d ${r} h` : `${r} h`;
}
// Server summary counts from the window start: show sunset if the body starts up, sunrise if it starts down.
const startEvent = (s, setH, setT, riseH, riseT, setW, riseW) => {
  const startsUp = s[riseH] == null && s[setH] != null || (s[setH] != null && s[riseH] != null && s[setH] < s[riseH]);
  return startsUp ? { w: setW, h: s[setH], t: s[setT] } : { w: riseW, h: s[riseH], t: s[riseT] };
};
const sunEvt = s => startEvent(s, 'hours_to_sunset', 'next_sunset', 'hours_to_sunrise', 'next_sunrise', 'Sunset', 'Sunrise');
const earthEvt = s => startEvent(s, 'hours_to_earthset', 'next_earthset', 'hours_to_earthrise', 'next_earthrise', 'Earthset', 'Earthrise');

// Traffic-light thresholds from docs/RESEARCH.md §9.1 (team synthesis from Barker 2021, VIPER, Gläser 2014).
const VERDICT = [
  { name: 'Solar Illumination', pub: 'Sunlight', v: s => s.sun_visible_pct, pct: s => s.sun_visible_pct, good: v => v >= 70, ok: v => v >= 50, show: v => fmt(v, 1, '%') },
  { name: 'Earth Link (DTE)', pub: 'Can talk to Earth', v: s => s.earth_visible_pct, pct: s => s.earth_visible_pct, good: v => v >= 50, ok: v => v >= 30, show: v => fmt(v, 1, '%') },
  { name: 'Longest Eclipse', pub: 'Longest darkness', v: s => s.longest_night_hours, pct: (s, totH) => (s.longest_night_hours / totH) * 100, info: true, show: v => fmt(v, 0, ' h') },
  { name: 'Max DTE Comms Gap', pub: 'Longest Earth-link gap', v: s => s.longest_dte_gap_hours, pct: (s, totH) => (s.longest_dte_gap_hours / totH) * 100, info: true, show: v => fmt(v, 0, ' h') },
];
const RANK = { good: 0, marginal: 1, poor: 2 };
const VERDICT_WORD = { good: 'Good site', marginal: 'Marginal site', poor: 'Poor site' };
const VERDICT_CODE = { good: 'GO // NOMINAL', marginal: 'CAUTION // MARGINAL', poor: 'NO-GO // SHADOWED' };
// Plain-language facts for public mode (docs/RESEARCH.md §9.2).
const FACTS = [
  'The Moon’s axis tilts just 1.54°, so at the poles the Sun always skims the horizon.',
  'One lunar day-night cycle lasts 29.53 Earth days.',
  'The Moon’s monthly wobble lifts Earth a few degrees above the south-pole horizon, then hides it for about two weeks.',
  'From the Moon, Earth looks nearly four times wider than the Sun.',
  'Craters that never see sunlight sit near −240 °C, among the coldest places measured in the Solar System.',
  'With no air there’s no twilight: sunlight switches on and off as the Sun’s disk crosses the horizon.',
  'An equator site sees the Sun half the time; the best south-pole ridges see it over 90% of the time.',
];

function renderVerdict(s) {
  const totH = Math.max(24, (+$('days').value || 30) * 24);
  const rows = VERDICT.map(c => {
    const v = c.v(s), cls = c.info ? 'info' : v == null ? 'marginal' : c.good(v) ? 'good' : c.ok(v) ? 'marginal' : 'poor';
    const barW = Math.max(0, Math.min(100, c.pct(s, totH) || 0));
    return { c, v, cls, barW };
  });
  const worst = rows.filter(r => !r.c.info).reduce((a, r) => (RANK[r.cls] > RANK[a] ? r.cls : a), 'good');
  const factIdx = Math.abs(Math.round(+$('lat').value * 1000 + +$('lon').value * 7)) % FACTS.length;
  const pub = state.mode === 'public';
  $('verdict').innerHTML = `<div class="v-head ${worst}"><span class="dot"></span><b>${VERDICT_WORD[worst]}</b><span class="v-code">${VERDICT_CODE[worst]}</span></div>
    <ul>${rows.map(r => `<li class="${r.cls}"><span class="dot"></span><span class="v-lbl">${pub ? r.c.pub : r.c.name}</span><span class="v-bar-track"><span class="v-bar-fill" style="width:${r.barW.toFixed(1)}%"></span></span><span class="v-val">${r.c.show(r.v)}</span></li>`).join('')}</ul>
    ${pub ? `<p class="fact">${FACTS[factIdx]}</p>` : ''}`;
  $('verdict').hidden = false;
}

const mLabel = m => (state.mode === 'public' && m.pub ? m.pub : m.label);
const mClass = m => (m.expert ? ' expert' : '');

const METRICS = [
  { label: 'Sun visible', pub: 'Sunlit time', key: s => s.sun_visible_pct, better: 'hi', show: s => fmt(s.sun_visible_pct, 1, '%'), note: () => 'window duty cycle' },
  { label: 'Mean solar disk', pub: 'Solar power (rel.)', key: s => s.sun_mean_fraction, better: 'hi', show: s => fmt(s.sun_mean_fraction * 100, 1, '%'), note: () => 'relative solar flux' },
  { label: 'Earth visible (DTE)', pub: 'Can talk to Earth', key: s => s.earth_visible_pct, better: 'hi', show: s => fmt(s.earth_visible_pct, 1, '%'), note: () => 'direct-to-Earth link' },
  { label: 'Longest night', pub: 'Longest darkness', key: s => s.longest_night_hours, better: 'lo', show: s => fmt(s.longest_night_hours, 0, ' h'), note: () => 'max eclipse duration' },
  { label: 'Longest DTE gap', expert: true, key: s => s.longest_dte_gap_hours, better: 'lo', show: s => fmt(s.longest_dte_gap_hours, 0, ' h'), note: () => 'max comms blackout' },
  { label: 'From start: Sun', expert: true, compareOnly: true, key: s => sunEvt(s).h, better: null, show: s => { const e = sunEvt(s); return e.h == null ? '—' : `<span class="ev">${e.w}</span>${fmtDur(e.h)}`; }, note: s => { const e = sunEvt(s); return e.t ? fmtTime(e.t) : 'no change in window'; } },
  { label: 'From start: Earth', expert: true, compareOnly: true, key: s => earthEvt(s).h, better: null, show: s => { const e = earthEvt(s); return e.h == null ? '—' : `<span class="ev">${e.w}</span>${fmtDur(e.h)}`; }, note: s => { const e = earthEvt(s); return e.t ? fmtTime(e.t) : 'no change in window'; } },
  { label: 'Sunlight windows', expert: true, key: s => s.sunlight_windows.length, better: null, show: s => String(s.sunlight_windows.length), note: s => `max ${fmt(Math.max(0, ...s.sunlight_windows.map(w => w.hours)), 0, ' h')}` },
];

// ---------- launch slips (GET /api/compare, dates mode) ----------

const SLIP_OFFSETS = [0, 1, 7, 30];

async function loadSlips(req) {
  const panel = $('slips');
  if (state.demo || state.recorded) { panel.hidden = true; return; }
  const q = new URLSearchParams({ sites: `${$('lat').value},${$('lon').value}`, start: $('start').value,
    days: $('days').value, step_min: $('step').value, offsets_days: SLIP_OFFSETS.join(',') });
  try {
    const r = await api('/api/compare?' + q);
    if (req !== state.req) return;
    renderSlips(r);
  } catch {
    panel.hidden = true;
  }
}

function renderSlips(r) {
  const es = r.entries;
  if (!es || es.length < 2) { $('slips').hidden = true; return; }
  const base = es[0].summary;
  const cols = [
    ['Sun visible', s => s.sun_visible_pct, v => fmt(v, 1, '%'), 1, 'pts', 'Sunlit time'],
    ['Mean solar disk', s => s.sun_mean_fraction * 100, v => fmt(v, 1, '%'), 1, 'pts', 'Solar power'],
    ['Earth visible', s => s.earth_visible_pct, v => fmt(v, 1, '%'), 1, 'pts', 'Can talk to Earth'],
    ['Longest night', s => s.longest_night_hours, v => fmt(v, 0, ' h'), -1, 'h', 'Longest darkness'],
    ['Longest DTE gap', s => s.longest_dte_gap_hours, v => fmt(v, 0, ' h'), -1, 'h', 'Longest Earth-link gap'],
  ];
  const best = cols.map(([, f, , dir]) => { const v = es.map(e => f(e.summary)); return dir > 0 ? Math.max(...v) : Math.min(...v); });
  const pubL = state.mode === 'public';
  const head = `<tr><th>Epoch Slip</th>${cols.map(c => `<th>${pubL ? c[5] : c[0]}</th>`).join('')}<th>Next Sun Transition</th><th></th></tr>`;
  const rows = es.map((e, k) => {
    const s = e.summary, off = SLIP_OFFSETS[k];
    const label = `${off ? `+${off} d` : 'Nominal (T0)'}<small>${fmtTime(e.start).replace(/ 00 UTC$| UTC$/, '')}</small>`;
    const cells = cols.map(([, f, show, dir, unit], j) => {
      const v = f(s), d = v - f(base), isBest = v === best[j] && new Set(es.map(x => f(x.summary))).size > 1;
      const cls = k && Math.abs(d) > 0.05 ? ((d > 0) === (dir > 0) ? 'up' : 'down') : '';
      const bar = j === 0 ? `<span class="bar" style="width:${Math.round(v * 0.55)}px"></span>` : '';
      const delta = k ? `<small>${d > 0 ? '+' : ''}${fmt(d, unit === 'h' ? 0 : 1)} ${unit}</small>` : '';
      return `<td class="${cls}">${bar}${show(v)}${isBest ? '<span class="opt-tag">OPT</span>' : ''}${delta}</td>`;
    }).join('');
    const ev = sunEvt(s);
    const evTxt = ev.h == null ? '—' : `${ev.w} in ${fmtDur(ev.h)}`;
    return `<tr class="${k ? '' : 'on'}"><td>${label}</td>${cells}<td>${evTxt}</td>` +
      `<td>${k ? `<button type="button" class="secondary" data-start="${e.start}">Load</button>` : ''}</td></tr>`;
  }).join('');
  $('slips-table').innerHTML = head + rows;
  $('slips-note').textContent = `${$('days').value}-DAY WINDOW PER EPOCH`;
  $('slips').hidden = false;
  $('slips-table').querySelectorAll('[data-start]').forEach(b => (b.onclick = () => {
    $('start').value = b.dataset.start.slice(0, 16);
    run();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}

// ---------- best spot nearby (GET /api/best_nearby — NASA SPLICE 500m HDA) ----------

async function findBest() {
  if (state.demo || state.recorded) { $('err').textContent = 'The SPLICE 500 m search requires the live server.'; return; }
  const lat = +$('lat').value, lon = +$('lon').value;
  const q = new URLSearchParams({ lat, lon, start: $('start').value, days: $('days').value, step_min: $('step').value, radius_m: 500, grid_m: 100 });
  $('err').textContent = '';
  setBusy(true, 'SPLICE HDA: evaluating 100 m grid within 500 m radius…');
  try {
    const r = await api('/api/best_nearby?' + q);
    renderBest(r);
  } catch (e) {
    $('err').textContent = e.message;
  } finally {
    setBusy(false);
  }
}

function bearing(a, b) {
  const dN = b.lat_deg - a.lat_deg, dE = (b.lon_deg - a.lon_deg) * Math.cos(a.lat_deg * Math.PI / 180);
  const deg = (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

function renderBest(r) {
  const c = r.center, b = r.best, el = $('best-panel');
  const same = !b || b.distance_m < 1;
  const rows = [
    ['Sun visible', 'sun_visible_pct', v => fmt(v, 1, '%'), 1],
    ['Mean solar disk', 'sun_mean_fraction', v => fmt(v * 100, 1, '%'), 1],
    ['Earth visible', 'earth_visible_pct', v => fmt(v, 1, '%'), 1],
    ['Longest night', 'longest_night_hours', v => fmt(v, 0, ' h'), -1],
    ['Ground height', 'ground_m', v => fmt(v, 0, ' m'), 0],
  ];
  const dqgEl = $('splice-dqg-readout');
  if (dqgEl) {
    dqgEl.textContent = same
      ? `NOMINAL: target is optimal across ${r.candidates_evaluated} grid points`
      : `DIVERT: ${fmt(b.distance_m, 0)} m ${bearing(c, b)} → ${fmt(b.sun_visible_pct, 1)}% Sun (${fmt(b.lat_deg, 4)}°, ${fmt(b.lon_deg, 4)}°E)`;
  }
  el.innerHTML = `<div class="bp-head"><h2>SPLICE 500 m Divert Solution</h2><small>${r.candidates_evaluated} CANDIDATES</small></div>
    ${same ? '<p>Nominal touchdown target is already the highest-illumination coordinate within 500 m.</p>' : `
    <p>DIVERT VECTOR: <b>${fmt(b.distance_m, 0)} m ${bearing(c, b)}</b> → ${fmt(b.lat_deg, 4)}°N, ${fmt(b.lon_deg, 4)}°E</p>
    <table><tr><th>Metric</th><th>Nominal</th><th>Divert</th><th>Delta</th></tr>
    ${rows.map(([name, k, f, dir]) => {
      const d = b[k] - c[k], cls = dir && Math.abs(d) > 1e-9 ? ((d > 0) === (dir > 0) ? 'up' : 'down') : '';
      const dTxt = k === 'sun_mean_fraction' ? fmt(d * 100, 1, ' pts') : k.endsWith('pct') ? fmt(d, 1, ' pts') : fmt(d, 0, k === 'ground_m' ? ' m' : ' h');
      return `<tr><td>${name}</td><td>${f(c[k])}</td><td>${f(b[k])}</td><td class="${cls}">${d > 0 ? '+' : ''}${dTxt}</td></tr>`;
    }).join('')}</table>
    <div class="bp-actions"><button type="button" id="use-best">Commit Divert Coordinates</button></div>`}`;
  el.hidden = false;
  const use = $('use-best');
  if (use) use.onclick = () => { $('lat').value = +b.lat_deg.toFixed(5); $('lon').value = +b.lon_deg.toFixed(5); $('site').value = ''; el.hidden = true; run(); };
}

function renderCompare(i) {
  const cols = $('cmp-cols'), bands = $('cmp-bands');
  const isPolar = state.cmpView === 'polar';
  cols.classList.toggle('pano-stack', !isPolar);
  cols.classList.toggle('polar-grid', isPolar);
  const key = state.cmp.map(c => c.site.name).join('|') + '|' + state.cmpView + '|' + state.req;
  if (cols.dataset.for !== key) {
    cols.dataset.for = key;
    cols.innerHTML = state.cmp.map((c, k) => `<div class="panel cmp-col">
        <div class="cmp-col-head">
          <div>
            <h3>${esc(siteLabel(c.site))}</h3>
            <div class="sub">${esc(shortMission(c.site))} · ${fmt(c.site.lat_deg, 3)}°N, ${fmt(c.site.lon_deg, 3)}°E</div>
          </div>
          <div class="now"></div>
        </div>
        <canvas data-k="${k}"></canvas></div>`).join('');
    bands.innerHTML = state.cmp.map((c, k) =>
      `<div class="cmp-band"><span title="${esc(c.site.name)}">${esc(siteLabel(c.site))}</span><canvas data-k="${k}"></canvas></div>`).join('');
    bands.querySelectorAll('canvas').forEach(attachScrub);
    cols.querySelectorAll('canvas').forEach(cv => {
      cv.addEventListener('pointermove', e => {
        if (state.cmpView !== 'pano' || !state.cmpPano) return;
        const r = cv.getBoundingClientRect(), L = state.cmpPano;
        const az = (e.clientX - r.left - L.left) / L.xs;
        if (az < 0 || az > 360) return;
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const parts = state.cmp.map(c => `${c.site.name.split(' ')[0]} ${horizonAt(c.data.horizon, az).toFixed(1)}°`);
        const readEl = $('cmp-read');
        if (readEl) readEl.textContent = `AZ ${az.toFixed(1)}° (${dirs[Math.round(az / 45) % 8]}) · RIDGE: ${parts.join(' / ')}`;
      });
    });
    renderCmpTable();
  }
  const p0 = state.cmp[0].data.points[i];
  $('now').textContent = fmtTime(p0.t);
  const range = skyRange(state.cmp.map(c => c.data), false);
  const sharedMaxEl = Math.min(90, Math.max(12, Math.ceil((range.maxEl + 2) / 5) * 5));
  cols.querySelectorAll('.cmp-col').forEach((el, k) => {
    const d = state.cmp[k].data, p = d.points[i], cv = el.querySelector('canvas');
    if (isPolar) {
      drawSky(cv, d, state.idx, { range, compact: true });
    } else {
      state.cmpPano = drawPanorama(cv, d, state.idx, { maxEl: sharedMaxEl });
    }
    el.querySelector('.now').innerHTML =
      `<span style="color:var(--sun)">SUN</span> ${fmt(p.sun.el_deg, 2)}° (${visWord(p.sun_vis)}) · ` +
      `<span style="color:var(--earth)">DTE</span> ${fmt(p.earth.el_deg, 2)}° (${visWord(p.earth_vis)})`;
  });
  bands.querySelectorAll('canvas').forEach(c => drawTimeline(c, state.cmp[+c.dataset.k].data, state.idx, { bandsOnly: true }));
  $('hz-source').textContent = [...new Set(state.cmp.map(c => c.data.horizon.source))].join(', ');
}

function renderCmpTable() {
  const head = '<tr><th>Telemetry Parameter</th>' + state.cmp.map(c => `<th>${esc(siteLabel(c.site))}</th>`).join('') + '</tr>';
  const rows = METRICS.map(m => {
    const vals = state.cmp.map(c => m.key(c.data.summary));
    const valid = vals.filter(v => v != null && !Number.isNaN(v));
    const best = m.better && valid.length > 1 ? (m.better === 'hi' ? Math.max(...valid) : Math.min(...valid)) : null;
    const allSame = valid.every(v => v === valid[0]);
    return `<tr class="${mClass(m).trim()}"><td>${mLabel(m)}</td>` + state.cmp.map((c, k) => {
      const isBest = best !== null && !allSame && vals[k] === best;
      return `<td class="${isBest ? 'best' : ''}">${m.show(c.data.summary)}${isBest ? '<span class="opt-tag">OPT</span>' : ''}</td>`;
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
  const perSec = (+$('speed').value * 1440) / +$('step').value;
  let v = state.idx + dt * perSec;
  if (v >= pointCount() - 1) v = 0;
  setIdx(v);
  requestAnimationFrame(tick);
}
function play() { if (!pointCount()) return; state.playing = true; last = 0; $('play').textContent = '❚❚'; $('play').setAttribute('aria-label', 'Pause'); requestAnimationFrame(tick); }
function pause() { state.playing = false; $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Play'); }

// ---------- wiring ----------

function setMode(mode) {
  state.mode = mode === 'public' ? 'public' : 'expert';
  localStorage.setItem('navMode', state.mode);
  document.body.dataset.mode = state.mode;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === state.mode)));
  $('metrics').dataset.for = ''; $('cmp-cols').dataset.for = '';
  render();
}

function setSkyView(v) {
  state.skyView = v === 'polar' ? 'polar' : 'pano';
  document.querySelectorAll('#sky-switch [data-sky-view]').forEach(b =>
    b.setAttribute('aria-checked', String(b.dataset.skyView === state.skyView)));
  render();
  requestAnimationFrame(render);
}

function setCmpView(v) {
  state.cmpView = v === 'polar' ? 'polar' : 'pano';
  document.querySelectorAll('#cmp-switch [data-cmp-view]').forEach(b =>
    b.setAttribute('aria-checked', String(b.dataset.cmpView === state.cmpView)));
  render();
  requestAnimationFrame(render);
}

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
    const link = state.link;
    if (link?.get('view') === 'compare' && state.view !== 'compare') {
      state.view = 'compare';
      document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === 'compare')));
      document.querySelectorAll('[data-only]').forEach(el => { el.hidden = el.dataset.only !== 'compare'; });
    }
    if (link?.get('focus') === 'sky') setSkyView('polar');
    await run();
    const focus = { slips: 'slips', pano: 'pano-panel', sky: 'pano-panel' }[link?.get('focus')];
    if (focus) {
      const t0 = Date.now(), tick = () => {
        if ($(focus).offsetParent) $(focus).scrollIntoView({ block: 'start' });
        else if (Date.now() - t0 < 8000) setTimeout(tick, 150);
      };
      tick();
    }
  } catch (e) {
    $('err').textContent = e.message;
    $('server').open = true;
  }
}

function wire() {
  $('f').onsubmit = e => { e.preventDefault(); run(); };
  $('best').onclick = findBest;
  if ($('splice-run-btn')) $('splice-run-btn').onclick = () => {
    findBest().then(() => {
      if (!$('best-panel').hidden) $('best-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };
  if ($('csv')) $('csv').onclick = downloadCsv;
  document.querySelectorAll('[data-mode]').forEach(b => (b.onclick = () => setMode(b.dataset.mode)));
  document.querySelectorAll('#sky-switch [data-sky-view]').forEach(b => (b.onclick = () => setSkyView(b.dataset.skyView)));
  document.querySelectorAll('#cmp-switch [data-cmp-view]').forEach(b => (b.onclick = () => setCmpView(b.dataset.cmpView)));
  setMode(state.mode);
  const syncCustom = () => document.body.classList.toggle('custom', $('site').value === '');
  $('site').addEventListener('change', syncCustom);
  ['lat', 'lon'].forEach(id => $(id).addEventListener('input', syncCustom));
  setTimeout(syncCustom, 0);
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
  $('pano').addEventListener('pointermove', e => {
    const d = state.data, L = state.pano;
    if (!d || !L) return;
    const r = $('pano').getBoundingClientRect(), az = (e.clientX - r.left - L.left) / L.xs;
    if (az < 0 || az > 360) return;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    $('pano-read').textContent = `AZ ${az.toFixed(1)}° (${dirs[Math.round(az / 45) % 8]}) · RIDGE ${horizonAt(d.horizon, az).toFixed(2)}°`;
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
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
