// NASA SPLICE Glide-Slope Trajectory & Descent Kinematics Diagrams (#ld-box)
// Self-contained mission-control widget mounted inside #splice-workflow below .splice-rail.
'use strict';

(() => {
  const TOTAL_SEC = 240;
  const MAX_ALT_KM = 18;
  const MAX_RANGE_KM = 42;
  const MAX_VH = 420;
  const MAX_VV = 36;
  const MIN_VV = 0.8;
  const DEFAULT_U = 0.58;
  const PLAY_DURATION_SEC = 12;

  const PHASES = [
    { id: 0, code: '01 TRN', name: 'TRN', start: 0.00, end: 0.30, jump: 0.14, color: '#38bdf8' },
    { id: 1, code: '02 NDL', name: 'NDL', start: 0.30, end: 0.56, jump: 0.42, color: '#f59e0b' },
    { id: 2, code: '03 HDL', name: 'HDL', start: 0.56, end: 0.80, jump: 0.64, color: '#a855f7' },
    { id: 3, code: '04 DQG', name: 'DQG', start: 0.80, end: 1.00, jump: 0.88, color: '#22c55e' },
  ];

  const MONO = '"JetBrains Mono", "SFMono-Regular", ui-monospace, "Cascadia Code", monospace';

  const CSS = `
  #splice-workflow .splice-step {
    cursor: pointer;
    transition: background-color 0.14s ease, box-shadow 0.14s ease;
  }
  #splice-workflow .splice-step.ld-active {
    background: rgba(56, 189, 248, 0.07);
    box-shadow: inset 0 2px 0 var(--ld-step-accent, #38bdf8);
  }
  #ld-box {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line, rgba(255, 255, 255, 0.08));
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  #ld-box * { box-sizing: border-box; }
  #ld-box .ld-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
  }
  #ld-box .ld-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
    max-width: 100%;
  }
  #ld-box .ld-badge {
    font: 600 10.5px/1 var(--mono, ${MONO});
    letter-spacing: 0.08em;
    color: var(--text, #f1f5f9);
    background: var(--well, #070a10);
    border: 1px solid var(--line-strong, rgba(255, 255, 255, 0.14));
    border-radius: var(--r-sm, 4px);
    padding: 5px 8px;
    white-space: nowrap;
  }
  #ld-box .ld-site-pill {
    font: 500 11px/1.2 var(--mono, ${MONO});
    font-variant-numeric: tabular-nums;
    color: var(--earth, #38bdf8);
    background: rgba(56, 189, 248, 0.09);
    border: 1px solid rgba(56, 189, 248, 0.28);
    border-radius: var(--r-sm, 4px);
    padding: 4px 8px;
    max-width: min(360px, 100%);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #ld-box .ld-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  #ld-box .ld-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-sm, 4px);
    border: 1px solid var(--line-strong, rgba(255, 255, 255, 0.14));
    background: var(--well, #070a10);
    color: var(--text, #f1f5f9);
    font: 500 11px/1 var(--sans, system-ui, sans-serif);
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.12s, background-color 0.12s, color 0.12s;
  }
  #ld-box .ld-btn:hover {
    background: var(--panel-elev, #111622);
    border-color: var(--earth, #38bdf8);
    color: #fff;
  }
  #ld-box .ld-btn-link {
    color: var(--earth, #38bdf8);
  }
  #ld-box .ld-ctrl-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 7px 10px;
    background: var(--well, #070a10);
    border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
    border-radius: var(--r-sm, 4px);
    min-width: 0;
  }
  #ld-box .ld-play-btn {
    width: 26px;
    height: 26px;
    padding: 0;
    display: inline-grid;
    place-items: center;
    border-radius: var(--r-sm, 4px);
    border: 1px solid var(--line-strong, rgba(255, 255, 255, 0.14));
    background: var(--panel-elev, #111622);
    color: var(--text, #f1f5f9);
    font: 600 11px/1 var(--mono, ${MONO});
    cursor: pointer;
    flex: none;
  }
  #ld-box .ld-play-btn:hover,
  #ld-box .ld-play-btn[aria-pressed="true"] {
    border-color: var(--earth, #38bdf8);
    color: var(--earth, #38bdf8);
  }
  #ld-box .ld-phases {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    min-width: 0;
  }
  #ld-box .ld-phase-btn {
    height: 24px;
    padding: 0 7px;
    border-radius: 3px;
    border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
    background: transparent;
    color: var(--muted, #8b9bb4);
    font: 600 10.5px/1 var(--mono, ${MONO});
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.12s, border-color 0.12s, background-color 0.12s;
  }
  #ld-box .ld-phase-btn:hover {
    color: var(--text, #f1f5f9);
    border-color: var(--line-strong, rgba(255, 255, 255, 0.14));
  }
  #ld-box .ld-phase-btn.active {
    color: var(--text, #f1f5f9);
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--pc, #38bdf8);
    box-shadow: inset 0 -2px 0 var(--pc, #38bdf8);
  }
  #ld-box .ld-scrub-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 200px;
    min-width: 0;
  }
  #ld-box #ld-scrub {
    flex: 1 1 100px;
    min-width: 60px;
    width: auto;
    max-width: 100%;
    height: 4px;
    padding: 0;
    margin: 0;
    border: 0;
    border-radius: 2px;
    background: var(--line-strong, rgba(255, 255, 255, 0.18));
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }
  #ld-box #ld-scrub::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--earth, #38bdf8);
    border: 2px solid var(--bg, #07090d);
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.6);
    cursor: pointer;
  }
  #ld-box #ld-scrub::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--earth, #38bdf8);
    border: 2px solid var(--bg, #07090d);
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.6);
    cursor: pointer;
  }
  #ld-box .ld-time {
    font: 600 11px/1 var(--mono, ${MONO});
    font-variant-numeric: tabular-nums;
    color: var(--text, #f1f5f9);
    white-space: nowrap;
    flex: none;
  }
  #ld-box .ld-grid {
    display: grid;
    grid-template-columns: 1.25fr 1fr;
    gap: 12px;
    min-width: 0;
  }
  #ld-box .ld-grid > * { min-width: 0; }
  #ld-box .ld-card {
    background: var(--well, #070a10);
    border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
    border-radius: var(--r-sm, 4px);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  #ld-box .ld-card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }
  #ld-box .ld-card-head h3 {
    margin: 0;
    font: 600 12px/1.25 var(--sans, system-ui, sans-serif);
    letter-spacing: -0.01em;
    color: var(--text, #f1f5f9);
  }
  #ld-box .ld-sub {
    font: 500 10px/1.2 var(--mono, ${MONO});
    color: var(--muted, #8b9bb4);
  }
  #ld-box .ld-canvas-wrap {
    position: relative;
    width: 100%;
    min-width: 0;
  }
  #ld-box canvas {
    display: block;
    width: 100%;
    cursor: crosshair;
    touch-action: none;
  }
  #ld-box #ld-glide { height: 248px; }
  #ld-box #ld-kinematics { height: 194px; }
  #ld-box .ld-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    font: 500 10.5px/1.2 var(--mono, ${MONO});
    color: var(--muted, #8b9bb4);
  }
  #ld-box .ld-leg {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  #ld-box .ld-leg i {
    display: inline-block;
    width: 11px;
    height: 2px;
    background: var(--c, #94a3b8);
    flex: none;
  }
  #ld-box .ld-leg i.dash {
    background: transparent;
    height: 0;
    border-top: 2px dashed var(--c, #94a3b8);
  }
  #ld-box .ld-tlm {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 1px;
    background: var(--line, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
    border-radius: 3px;
    overflow: hidden;
  }
  #ld-box .ld-tlm-cell {
    background: var(--panel, #0c1018);
    padding: 6px 7px;
    min-width: 0;
  }
  #ld-box .ld-tlm-cell small {
    display: block;
    font: 600 9.5px/1.1 var(--sans, system-ui, sans-serif);
    letter-spacing: 0.08em;
    color: var(--muted, #8b9bb4);
    text-transform: uppercase;
  }
  #ld-box .ld-tlm-cell b {
    display: block;
    margin-top: 3px;
    font: 600 12px/1.2 var(--mono, ${MONO});
    font-variant-numeric: tabular-nums;
    color: var(--text, #f1f5f9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (max-width: 860px) {
    #ld-box .ld-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) {
    #ld-box .ld-head { align-items: stretch; }
    #ld-box .ld-actions { width: 100%; }
    #ld-box .ld-btn { flex: 1 1 auto; }
    #ld-box .ld-phases {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      width: 100%;
    }
    #ld-box .ld-phase-btn { padding: 0 4px; text-align: center; }
    #ld-box .ld-scrub-wrap { flex: 1 1 100%; }
    #ld-box #ld-glide { height: 215px; }
    #ld-box #ld-kinematics { height: 175px; }
    #ld-box .ld-tlm { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    #ld-box #ld-cell-phase { grid-column: span 2; }
  }`;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function phaseIndexAt(u) {
    for (let i = PHASES.length - 1; i >= 0; i--) {
      if (u >= PHASES[i].start) return i;
    }
    return 0;
  }

  // Smooth descent physics model over normalized progress u in [0, 1] (0..240 s).
  function downrangeKm(u) {
    return MAX_RANGE_KM * Math.pow(1 - u, 2.0);
  }

  function altitudeKm(u) {
    return MAX_ALT_KM * Math.pow(1 - u, 1.65);
  }

  function hSpeedMs(u) {
    return MAX_VH * Math.pow(1 - Math.pow(u, 1.35), 1.85);
  }

  function vSpeedMs(u) {
    return MIN_VV + (MAX_VV - MIN_VV) * Math.pow(1 - Math.pow(u, 1.25), 1.75);
  }

  function throttlePct(u) {
    const base = 26 + 16 * (1 - u);
    const brakeBump = 52 * Math.exp(-Math.pow((u - 0.38) / 0.24, 2));
    const divertBump = 8 * Math.exp(-Math.pow((u - 0.84) / 0.08, 2));
    return clamp(base + brakeBump + divertBump, 0, 100);
  }

  function pitchDeg(u) {
    return 68 * Math.pow(1 - u, 1.25);
  }

  // Precompute propellant remaining table by integrating throttle rate across 0..1.
  const PROP_STEPS = 200;
  const PROP_TABLE = (() => {
    const raw = [0];
    let acc = 0;
    for (let i = 1; i <= PROP_STEPS; i++) {
      const u0 = (i - 1) / PROP_STEPS;
      const u1 = i / PROP_STEPS;
      acc += 0.5 * (throttlePct(u0) + throttlePct(u1)) * (u1 - u0);
      raw.push(acc);
    }
    const total = raw[PROP_STEPS] || 1;
    // Start descent with 100% of landing propellant budget, finishing with 8.6% hover reserve.
    return raw.map(v => 100 - 91.4 * (v / total));
  })();

  function propRemainingPct(u) {
    const f = clamp(u, 0, 1) * PROP_STEPS;
    const i = Math.min(PROP_STEPS - 1, Math.floor(f));
    const frac = f - i;
    return PROP_TABLE[i] * (1 - frac) + PROP_TABLE[i + 1] * frac;
  }

  // South pole crater relief profile (km) vs downrange x (0..42 km).
  function terrainKm(x) {
    const rimMain = 2.45 * Math.exp(-Math.pow((x - 18.2) / 4.2, 2));
    const rimNear = 1.38 * Math.exp(-Math.pow((x - 6.6) / 2.3, 2));
    const rimFar = 1.65 * Math.exp(-Math.pow((x - 33.5) / 5.0, 2));
    const craterDip = -0.35 * Math.exp(-Math.pow((x - 11.8) / 2.8, 2));
    const micro = 0.14 * Math.sin(x * 0.9) + 0.07 * Math.cos(x * 2.1);
    const padBlend = clamp(x / 2.4, 0, 1);
    return padBlend * (0.28 + rimMain + rimNear + rimFar + craterDip + micro);
  }

  // Safe ridge-clearance floor envelope above south pole crater peaks.
  function clearanceRefKm(x) {
    return terrainKm(x) + 0.72 + 0.45 * clamp(x / MAX_RANGE_KM, 0, 1);
  }

  function stateAt(u) {
    const uc = clamp(u, 0, 1);
    const x = downrangeKm(uc);
    const alt = altitudeKm(uc);
    const vh = hSpeedMs(uc);
    const vv = vSpeedMs(uc);
    const speed = Math.hypot(vh, vv);
    const thr = throttlePct(uc);
    const pitch = pitchDeg(uc);
    const prop = propRemainingPct(uc);
    const clr = Math.max(0, alt - terrainKm(x));
    const pIdx = phaseIndexAt(uc);
    return { u: uc, t: uc * TOTAL_SEC, x, alt, vh, vv, speed, thr, pitch, prop, clr, pIdx };
  }

  // Extract clean active site name from #site <select> or #lat/#lon.
  function cleanSelectText(raw) {
    let s = String(raw || '').trim();
    s = s.replace(/^(?:\u2744\s*|\[[^\]]*\]\s*)/, '').trim();
    if (s.endsWith(')')) {
      let depth = 0;
      let idx = -1;
      for (let i = s.length - 1; i >= 0; i--) {
        if (s[i] === ')') depth++;
        else if (s[i] === '(') {
          depth--;
          if (depth === 0) { idx = i; break; }
        }
      }
      if (idx > 0) {
        const head = s.slice(0, idx).trim();
        if (head) s = head;
      }
    }
    return s;
  }

  function readActiveSite() {
    const siteEl = document.getElementById('site');
    const latEl = document.getElementById('lat');
    const lonEl = document.getElementById('lon');
    const lat = latEl ? parseFloat(latEl.value) : NaN;
    const lon = lonEl ? parseFloat(lonEl.value) : NaN;
    const coordStr = Number.isFinite(lat) && Number.isFinite(lon)
      ? `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`
      : '—';

    let name = '';
    if (siteEl && siteEl.value !== '' && siteEl.selectedIndex >= 0) {
      const opt = siteEl.options[siteEl.selectedIndex];
      if (opt) name = cleanSelectText(opt.textContent);
    }
    if (!name) {
      name = coordStr !== '—' ? coordStr : 'Lunar South Pole';
    }
    const polar = Number.isFinite(lat) ? lat <= -75 : true;
    return {
      name,
      pill: name === coordStr ? coordStr : `${name} · ${coordStr}`,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      polar,
    };
  }

  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w <= 0 || h <= 0) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function init() {
    const host = document.getElementById('splice-workflow');
    if (!host || document.getElementById('ld-box')) return;

    const style = document.createElement('style');
    style.id = 'ld-styles';
    style.textContent = CSS;
    document.head.append(style);

    const box = document.createElement('div');
    box.id = 'ld-box';
    box.innerHTML = `
      <div class="ld-head">
        <div class="ld-title-group">
          <span class="ld-badge">GLIDE-SLOPE &amp; DESCENT DIAGRAMS</span>
          <span id="ld-site-pill" class="ld-site-pill">—</span>
        </div>
        <div class="ld-actions">
          <button type="button" id="ld-sim-embed" class="ld-btn" title="Scroll to 3D panel and run landing simulation">Run in 3D Panel ↑</button>
          <a id="ld-sim-full" class="ld-btn ld-btn-link" href="solar.html?sim=1" target="_blank" rel="noopener" title="Open full 3D globe descent simulation">Full 3D Sim ↗</a>
        </div>
      </div>
      <div class="ld-ctrl-bar">
        <button type="button" id="ld-play" class="ld-play-btn" aria-label="Play descent" aria-pressed="false" title="Play / Pause descent profile">▶</button>
        <div class="ld-phases" role="group" aria-label="SPLICE descent phase jump">
          ${PHASES.map(p => `<button type="button" class="ld-phase-btn" data-phase="${p.id}" data-u="${p.jump}" style="--pc:${p.color}">${p.code}</button>`).join('')}
        </div>
        <div class="ld-scrub-wrap">
          <input id="ld-scrub" type="range" min="0" max="1" step="0.002" value="${DEFAULT_U}" aria-label="Descent progression scrubber">
          <output id="ld-time" class="ld-time" for="ld-scrub">T+139.2 s / 240 s</output>
        </div>
      </div>
      <div class="ld-grid">
        <div class="ld-card">
          <div class="ld-card-head">
            <h3>Descent Trajectory &amp; SPLICE Gates</h3>
            <span class="ld-sub">Alt 18→0 km · Range 42→0 km</span>
          </div>
          <div class="ld-canvas-wrap">
            <canvas id="ld-glide" aria-label="Descent trajectory and SPLICE gates diagram"></canvas>
          </div>
          <div class="ld-legend">
            <span class="ld-leg"><i style="--c:#38bdf8"></i>01 TRN</span>
            <span class="ld-leg"><i style="--c:#f59e0b"></i>02 NDL</span>
            <span class="ld-leg"><i style="--c:#a855f7"></i>03 HDL</span>
            <span class="ld-leg"><i style="--c:#22c55e"></i>04 DQG</span>
            <span class="ld-leg"><i class="dash" style="--c:#a855f7"></i>500 m divert</span>
            <span class="ld-leg"><i class="dash" style="--c:#94a3b8"></i>Ridge margin</span>
          </div>
        </div>
        <div class="ld-card">
          <div class="ld-card-head">
            <h3>Descent Speed, Throttle &amp; Pitch Budget</h3>
            <span class="ld-sub">0–240 s Terminal Descent</span>
          </div>
          <div class="ld-canvas-wrap">
            <canvas id="ld-kinematics" aria-label="Descent speed, throttle and pitch budget diagram"></canvas>
          </div>
          <div class="ld-legend">
            <span class="ld-leg"><i style="--c:#38bdf8"></i>Vh (420→0 m/s)</span>
            <span class="ld-leg"><i style="--c:#22c55e"></i>Vv (36→0.8 m/s)</span>
            <span class="ld-leg"><i style="--c:#f59e0b"></i>Throttle (%)</span>
          </div>
          <div class="ld-tlm" aria-live="polite">
            <div class="ld-tlm-cell" id="ld-cell-phase"><small>PHASE</small><b id="ld-v-phase">03 HDL</b></div>
            <div class="ld-tlm-cell"><small>ALT</small><b id="ld-v-alt">—</b></div>
            <div class="ld-tlm-cell"><small>SPEED</small><b id="ld-v-speed">—</b></div>
            <div class="ld-tlm-cell"><small>PITCH</small><b id="ld-v-pitch">—</b></div>
            <div class="ld-tlm-cell"><small>PROP</small><b id="ld-v-prop">—</b></div>
          </div>
        </div>
      </div>`;
    host.append(box);

    const els = {
      sitePill: document.getElementById('ld-site-pill'),
      simEmbed: document.getElementById('ld-sim-embed'),
      simFull: document.getElementById('ld-sim-full'),
      play: document.getElementById('ld-play'),
      scrub: document.getElementById('ld-scrub'),
      time: document.getElementById('ld-time'),
      glide: document.getElementById('ld-glide'),
      kinematics: document.getElementById('ld-kinematics'),
      phaseBtns: [...box.querySelectorAll('.ld-phase-btn')],
      steps: [...host.querySelectorAll('.splice-rail .splice-step')],
      vPhase: document.getElementById('ld-v-phase'),
      vAlt: document.getElementById('ld-v-alt'),
      vSpeed: document.getElementById('ld-v-speed'),
      vPitch: document.getElementById('ld-v-pitch'),
      vProp: document.getElementById('ld-v-prop'),
    };

    const ui = {
      u: DEFAULT_U,
      playing: false,
      hoverU: null,
      hoverPhase: null,
      lastTlmUpdate: 0,
      rafId: 0,
      lastFrameTs: 0,
      site: readActiveSite(),
      divertActive: false,
      glideLayout: null,
      kinLayout: null,
    };

    function isBestVisible() {
      const bp = document.getElementById('best-panel');
      return !!(bp && !bp.hidden);
    }

    function syncSite() {
      ui.site = readActiveSite();
      els.sitePill.textContent = ui.site.pill;
      els.sitePill.title = ui.site.pill;
      els.simFull.href = `solar.html?sim=1&site=${encodeURIComponent(ui.site.name)}`;
      drawAll();
    }

    function syncStepHighlight() {
      const stPhase = phaseIndexAt(ui.u);
      const activePhase = ui.hoverPhase != null ? ui.hoverPhase : stPhase;
      const accent = PHASES[activePhase]?.color || '#38bdf8';
      els.steps.forEach((step, idx) => {
        const on = idx === activePhase;
        step.classList.toggle('ld-active', on);
        if (on) step.style.setProperty('--ld-step-accent', accent);
      });
      els.phaseBtns.forEach(btn => {
        const idx = +btn.dataset.phase;
        btn.classList.toggle('active', idx === stPhase);
        btn.setAttribute('aria-pressed', String(idx === stPhase));
      });
    }

    function updateTelemetry(force) {
      const now = performance.now();
      if (!force && now - ui.lastTlmUpdate < 33) return;
      ui.lastTlmUpdate = now;

      const uShow = ui.hoverU != null && !ui.playing ? ui.hoverU : ui.u;
      const s = stateAt(uShow);
      const ph = PHASES[s.pIdx];
      els.time.textContent = `T+${s.t.toFixed(1)} s / ${TOTAL_SEC} s`;
      els.vPhase.textContent = ph.code;
      els.vPhase.style.color = ph.color;
      els.vAlt.textContent = s.alt < 1.0 ? `${Math.round(s.alt * 1000)} m` : `${s.alt.toFixed(2)} km`;
      els.vSpeed.textContent = `${s.speed < 10 ? s.speed.toFixed(1) : Math.round(s.speed)} m/s`;
      els.vPitch.textContent = `${s.pitch.toFixed(1)}°`;
      els.vProp.textContent = `${s.prop.toFixed(1)}%`;
    }

    function drawGlide() {
      const setup = setupCanvas(els.glide);
      if (!setup) return;
      const { ctx, w, h } = setup;
      const pad = w < 420
        ? { left: 36, right: 10, top: 18, bottom: 24 }
        : { left: 44, right: 16, top: 20, bottom: 26 };
      const pw = Math.max(10, w - pad.left - pad.right);
      const ph = Math.max(10, h - pad.top - pad.bottom);
      const yMinKm = -0.35;
      const yMaxKm = 18.8;
      const toX = xKm => pad.left + (1 - clamp(xKm, 0, MAX_RANGE_KM) / MAX_RANGE_KM) * pw;
      const toY = yKm => pad.top + (1 - (yKm - yMinKm) / (yMaxKm - yMinKm)) * ph;
      ui.glideLayout = { pad, pw, ph, toX, toY };

      // Background subtle glow
      const bgGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
      bgGrad.addColorStop(0, '#070c16');
      bgGrad.addColorStop(1, '#05070c');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(pad.left, pad.top, pw, ph);

      // Grid & axes
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.font = `500 9.5px ${MONO}`;
      ctx.fillStyle = '#7c8ba4';

      const yTicks = [0, 5, 10, 15, 18];
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const yv of yTicks) {
        const py = Math.round(toY(yv)) + 0.5;
        ctx.beginPath();
        if (yv === 0) {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        }
        ctx.moveTo(pad.left, py);
        ctx.lineTo(pad.left + pw, py);
        ctx.stroke();
        ctx.fillText(`${yv} km`, pad.left - 5, py);
      }

      const xTicks = [42, 30, 20, 10, 0];
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const xv of xTicks) {
        const px = Math.round(toX(xv)) + 0.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.moveTo(px, pad.top);
        ctx.lineTo(px, pad.top + ph);
        ctx.stroke();
        const lbl = xv === 42 || xv === 0 ? `${xv} km` : `${xv}`;
        ctx.fillText(lbl, px, pad.top + ph + 6);
      }

      // South pole crater relief terrain polygon
      const nTerrain = 120;
      const baseBottom = pad.top + ph;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(toX(MAX_RANGE_KM), baseBottom);
      for (let i = 0; i <= nTerrain; i++) {
        const xk = MAX_RANGE_KM * (1 - i / nTerrain);
        ctx.lineTo(toX(xk), toY(terrainKm(xk)));
      }
      ctx.lineTo(toX(0), baseBottom);
      ctx.closePath();
      const tGrad = ctx.createLinearGradient(0, toY(3), 0, baseBottom);
      tGrad.addColorStop(0, '#1e293b');
      tGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = tGrad;
      ctx.fill();

      // Subtle diagonal terrain hatch
      ctx.clip();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      for (let hx = pad.left - ph; hx < pad.left + pw + ph; hx += 8) {
        ctx.beginPath();
        ctx.moveTo(hx, baseBottom);
        ctx.lineTo(hx + 36, baseBottom - 36);
        ctx.stroke();
      }
      ctx.restore();

      // Terrain ridge outline
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i <= nTerrain; i++) {
        const xk = MAX_RANGE_KM * (1 - i / nTerrain);
        const px = toX(xk);
        const py = toY(terrainKm(xk));
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Dashed ridge-clearance reference line
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.72)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= nTerrain; i++) {
        const xk = MAX_RANGE_KM * (1 - i / nTerrain);
        const px = toX(xk);
        const py = toY(clearanceRefKm(xk));
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.font = `500 8.5px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const reliefTag = ui.site.polar ? 'SOUTH POLE CRATER RELIEF MARGIN' : 'CRATER RELIEF CLEARANCE MARGIN';
      ctx.fillText(reliefTag, pad.left + 6, toY(clearanceRefKm(39)) - 3);
      ctx.restore();

      // Highlight hovered phase band if any
      if (ui.hoverPhase != null) {
        const hp = PHASES[ui.hoverPhase];
        const hx0 = toX(downrangeKm(hp.start));
        const hx1 = toX(downrangeKm(hp.end));
        ctx.fillStyle = hp.color + '14';
        ctx.fillRect(hx0, pad.top, Math.max(2, hx1 - hx0), ph);
      }

      // Color-coded SPLICE glide slope segments
      const cur = stateAt(ui.u);
      for (const p of PHASES) {
        const steps = 36;
        // Full dashed future path
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = ui.hoverPhase === p.id ? 0.85 : 0.42;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (let k = 0; k <= steps; k++) {
          const uu = p.start + (p.end - p.start) * (k / steps);
          const px = toX(downrangeKm(uu));
          const py = toY(altitudeKm(uu));
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();

        // Solid flown path up to ui.u
        if (ui.u > p.start) {
          const endU = Math.min(ui.u, p.end);
          ctx.save();
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          for (let k = 0; k <= steps; k++) {
            const uu = p.start + (endU - p.start) * (k / steps);
            const px = toX(downrangeKm(uu));
            const py = toY(altitudeKm(uu));
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.restore();
        }

        // Gate boundary node
        if (p.start > 0) {
          const gx = toX(downrangeKm(p.start));
          const gy = toY(altitudeKm(p.start));
          ctx.fillStyle = '#07090d';
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(gx, gy, 3.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = p.color;
          ctx.font = `600 9px ${MONO}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(p.name, gx + 5, gy - 4);
        }
      }

      // 500 m divert branch (highlighted when #best-panel is visible, else faint envelope)
      const divertActive = ui.divertActive;
      const divStartU = 0.68;
      const divX0 = downrangeKm(divStartU);
      const divY0 = altitudeKm(divStartU);
      const divTargetKm = 0.5;
      ctx.save();
      ctx.setLineDash(divertActive ? [5, 3] : [3, 4]);
      ctx.strokeStyle = divertActive ? '#c084fc' : 'rgba(168, 85, 247, 0.45)';
      ctx.lineWidth = divertActive ? 2.1 : 1.3;
      ctx.beginPath();
      const dSteps = 28;
      for (let k = 0; k <= dSteps; k++) {
        const f = k / dSteps;
        const xk = divX0 * (1 - f) + divTargetKm * f;
        // Arch slightly above nominal descent over the near ridge for 500 m safe spot divert
        const yNom = divY0 * Math.pow(1 - f, 1.55);
        const arch = 0.72 * Math.sin(Math.PI * f);
        const px = toX(xk);
        const py = toY(yNom + arch);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Divert target pad marker at 0.5 km
      const dxPad = toX(divTargetKm);
      const dyPad = toY(0);
      ctx.fillStyle = divertActive ? '#c084fc' : 'rgba(168, 85, 247, 0.55)';
      ctx.beginPath();
      ctx.arc(dxPad, dyPad, divertActive ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (divertActive) {
        ctx.font = `600 9px ${MONO}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('500m DIVERT', dxPad - 6, toY(1.4));
      }
      ctx.restore();

      // Target nominal landing pad marker at (0 km, 0 km)
      const padX = toX(0);
      const padY = toY(0);
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padX - 8, padY);
      ctx.lineTo(padX + 4, padY);
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(padX, padY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `600 9px ${MONO}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('PAD', padX - 6, padY - 4);
      ctx.restore();

      // Spacecraft silhouette + lidar scan cone + thruster vector at cur
      const scX = toX(cur.x);
      const scY = toY(cur.alt);
      const curPhase = PHASES[cur.pIdx];
      const groundY = toY(terrainKm(cur.x));

      // Vertical terrain clearance hairline under craft
      if (groundY - scY > 14) {
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(scX, scY + 6);
        ctx.lineTo(scX, groundY);
        ctx.stroke();
        ctx.restore();
      }

      // Lidar scan cone toward lunar terrain ahead
      ctx.save();
      const coneSpanY = Math.max(18, Math.min(82, groundY - scY));
      const beamColor = curPhase.color;
      if (cur.pIdx === 1) {
        // 4-beam NDL Doppler lidar fan
        ctx.strokeStyle = beamColor;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.1;
        for (const offset of [-0.34, -0.11, 0.14, 0.38]) {
          ctx.beginPath();
          ctx.moveTo(scX, scY);
          ctx.lineTo(scX + coneSpanY * offset + 12, Math.min(groundY, scY + coneSpanY));
          ctx.stroke();
        }
      } else {
        const halfW = cur.pIdx === 2 ? 0.52 : cur.pIdx === 0 ? 0.34 : 0.22;
        const coneGrad = ctx.createLinearGradient(scX, scY, scX, Math.min(groundY, scY + coneSpanY));
        coneGrad.addColorStop(0, beamColor + '48');
        coneGrad.addColorStop(1, beamColor + '04');
        ctx.fillStyle = coneGrad;
        ctx.beginPath();
        ctx.moveTo(scX, scY);
        ctx.lineTo(scX - coneSpanY * halfW + 8, Math.min(groundY, scY + coneSpanY));
        ctx.lineTo(scX + coneSpanY * halfW + 14, Math.min(groundY, scY + coneSpanY));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Craft rotated by -pitch (retrograde braking attitude -> upright landing)
      ctx.save();
      ctx.translate(scX, scY);
      ctx.rotate(-(cur.pitch * Math.PI) / 180);

      // Thruster exhaust vector scaled by throttle
      const plumeLen = 6 + (cur.thr / 100) * 18;
      const plumeGrad = ctx.createLinearGradient(0, 5, 0, 5 + plumeLen);
      plumeGrad.addColorStop(0, '#fef08a');
      plumeGrad.addColorStop(0.55, '#f59e0b');
      plumeGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = plumeGrad;
      ctx.beginPath();
      ctx.moveTo(-2.4, 5);
      ctx.lineTo(2.4, 5);
      ctx.lineTo(0, 5 + plumeLen);
      ctx.closePath();
      ctx.fill();

      // Thruster vector arrow stem
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 5 + plumeLen * 0.4);
      ctx.lineTo(0, 8 + plumeLen);
      ctx.stroke();

      // Landing legs
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-4, 2); ctx.lineTo(-7, 6);
      ctx.moveTo(4, 2); ctx.lineTo(7, 6);
      ctx.stroke();

      // Descent stage & crew dome silhouette
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#07090d';
      ctx.lineWidth = 0.8;
      ctx.fillRect(-5, -2.5, 10, 5.5);
      ctx.strokeRect(-5, -2.5, 10, 5.5);
      ctx.fillStyle = curPhase.color;
      ctx.beginPath();
      ctx.arc(0, -3.5, 3, Math.PI, 0);
      ctx.fill();
      ctx.restore();

      // Crisp HUD callout near craft
      const altTxt = cur.alt < 1 ? `${Math.round(cur.alt * 1000)} m` : `${cur.alt.toFixed(2)} km`;
      const clrTxt = cur.clr < 1 ? `${Math.round(cur.clr * 1000)} m` : `${cur.clr.toFixed(1)} km`;
      const hudText = `ALT ${altTxt} · CLR ${clrTxt}`;
      ctx.font = `600 9.5px ${MONO}`;
      const tw = ctx.measureText(hudText).width + 10;
      const hx = clamp(scX + 12, pad.left + 4, pad.left + pw - tw - 4);
      const hy = clamp(scY - 22, pad.top + 4, pad.top + ph - 22);
      ctx.fillStyle = 'rgba(7, 10, 16, 0.86)';
      ctx.strokeStyle = curPhase.color;
      ctx.lineWidth = 1;
      ctx.fillRect(hx, hy, tw, 17);
      ctx.strokeRect(hx, hy, tw, 17);
      ctx.fillStyle = '#f1f5f9';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(hudText, hx + 5, hy + 8.5);

      // Border frame
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pad.left, pad.top, pw, ph);
    }

    function drawKinematics() {
      const setup = setupCanvas(els.kinematics);
      if (!setup) return;
      const { ctx, w, h } = setup;
      const pad = w < 380
        ? { left: 34, right: 32, top: 18, bottom: 24 }
        : { left: 40, right: 36, top: 18, bottom: 24 };
      const pw = Math.max(10, w - pad.left - pad.right);
      const ph = Math.max(10, h - pad.top - pad.bottom);

      const toX = u => pad.left + clamp(u, 0, 1) * pw;
      const toYv = v => pad.top + (1 - clamp(v, 0, 450) / 450) * ph;
      const toYp = pct => pad.top + (1 - clamp(pct, 0, 100) / 100) * ph;
      ui.kinLayout = { pad, pw, ph, toX, toYv, toYp };

      ctx.fillStyle = '#060911';
      ctx.fillRect(pad.left, pad.top, pw, ph);

      // Gate background regions & dividers
      ctx.font = `600 9px ${MONO}`;
      ctx.textBaseline = 'top';
      for (const p of PHASES) {
        const x0 = toX(p.start);
        const x1 = toX(p.end);
        const active = ui.hoverPhase === p.id;
        ctx.fillStyle = p.color + (active ? '1c' : '0c');
        ctx.fillRect(x0, pad.top, x1 - x0, ph);

        if (p.start > 0) {
          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x0, pad.top);
          ctx.lineTo(x0, pad.top + ph);
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = p.color;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, (x0 + x1) * 0.5, pad.top + 4);
      }

      // Horizontal & vertical gridlines
      ctx.font = `500 9.5px ${MONO}`;
      for (const sv of [0, 100, 200, 300, 400]) {
        const py = Math.round(toYv(sv)) + 0.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.moveTo(pad.left, py);
        ctx.lineTo(pad.left + pw, py);
        ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${sv}`, pad.left - 5, py);
      }
      for (const tp of [0, 25, 50, 75, 100]) {
        const py = Math.round(toYp(tp)) + 0.5;
        ctx.fillStyle = '#f59e0b';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${tp}%`, pad.left + pw + 5, py);
      }
      for (const sec of [0, 60, 120, 180, 240]) {
        const px = Math.round(toX(sec / TOTAL_SEC)) + 0.5;
        ctx.fillStyle = '#7c8ba4';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${sec}s`, px, pad.top + ph + 6);
      }

      // Plot curves: Vh (cyan), Vv scaled x10 on 0..450 axis (emerald), Throttle (amber)
      const samples = 120;
      const plotCurve = (fnY, color, width, dash, fillAlpha) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        for (let i = 0; i <= samples; i++) {
          const uu = i / samples;
          const px = toX(uu);
          const py = fnY(uu);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        if (fillAlpha) {
          ctx.lineTo(toX(1), pad.top + ph);
          ctx.lineTo(toX(0), pad.top + ph);
          ctx.closePath();
          ctx.fillStyle = fillAlpha;
          ctx.fill();
        }
        ctx.restore();
      };

      plotCurve(u => toYv(hSpeedMs(u)), '#38bdf8', 2.0, null, 'rgba(56, 189, 248, 0.08)');
      plotCurve(u => toYv(vSpeedMs(u) * 10), '#22c55e', 1.8, null, null);
      plotCurve(u => toYp(throttlePct(u)), '#f59e0b', 1.8, null, null);

      // Hover preview rule (when hovering without scrubbing)
      if (ui.hoverU != null && !ui.playing) {
        const hx = toX(ui.hoverU);
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.42)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, pad.top);
        ctx.lineTo(hx, pad.top + ph);
        ctx.stroke();
        ctx.restore();
      }

      // Active bright cursor vertical rule at ui.u
      const cur = stateAt(ui.u);
      const cx = toX(cur.u);
      ctx.save();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, pad.top);
      ctx.lineTo(cx, pad.top + ph);
      ctx.stroke();

      const dots = [
        [toYv(cur.vh), '#38bdf8'],
        [toYv(cur.vv * 10), '#22c55e'],
        [toYp(cur.thr), '#f59e0b'],
      ];
      for (const [dy, col] of dots) {
        ctx.fillStyle = col;
        ctx.strokeStyle = '#07090d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, dy, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Live readout tag on cursor
      const tag = `Vh ${Math.round(cur.vh)} · Vv ${cur.vv.toFixed(1)} m/s · THR ${Math.round(cur.thr)}%`;
      ctx.font = `600 9px ${MONO}`;
      const tw = ctx.measureText(tag).width + 10;
      const tx = cx + tw + 10 > pad.left + pw ? cx - tw - 6 : cx + 6;
      const ty = pad.top + 18;
      ctx.fillStyle = 'rgba(7, 10, 16, 0.88)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1;
      ctx.fillRect(tx, ty, tw, 16);
      ctx.strokeRect(tx, ty, tw, 16);
      ctx.fillStyle = '#f1f5f9';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, tx + 5, ty + 8);
      ctx.restore();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pad.left, pad.top, pw, ph);
    }

    function drawAll() {
      ui.divertActive = isBestVisible();
      drawGlide();
      drawKinematics();
      syncStepHighlight();
      updateTelemetry(true);
    }

    function setU(nextU, fromPlay) {
      ui.u = clamp(nextU, 0, 1);
      els.scrub.value = ui.u.toFixed(3);
      drawGlide();
      drawKinematics();
      syncStepHighlight();
      updateTelemetry(!fromPlay);
    }

    function stopPlay() {
      ui.playing = false;
      if (ui.rafId) cancelAnimationFrame(ui.rafId);
      ui.rafId = 0;
      els.play.textContent = '▶';
      els.play.setAttribute('aria-label', 'Play descent');
      els.play.setAttribute('aria-pressed', 'false');
    }

    function tick(ts) {
      if (!ui.playing) return;
      if (!ui.lastFrameTs) ui.lastFrameTs = ts;
      const dt = Math.min(0.1, (ts - ui.lastFrameTs) / 1000);
      ui.lastFrameTs = ts;
      const next = ui.u + dt / PLAY_DURATION_SEC;
      if (next >= 1) {
        setU(1, false);
        stopPlay();
        return;
      }
      setU(next, true);
      ui.rafId = requestAnimationFrame(tick);
    }

    function startPlay() {
      if (ui.u >= 0.998) ui.u = 0;
      ui.playing = true;
      ui.lastFrameTs = 0;
      els.play.textContent = '❚❚';
      els.play.setAttribute('aria-label', 'Pause descent');
      els.play.setAttribute('aria-pressed', 'true');
      ui.rafId = requestAnimationFrame(tick);
    }

    // Scrubber & playback controls
    els.play.addEventListener('click', () => (ui.playing ? stopPlay() : startPlay()));
    els.scrub.addEventListener('input', () => {
      stopPlay();
      setU(parseFloat(els.scrub.value), false);
    });
    els.phaseBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        stopPlay();
        setU(parseFloat(btn.dataset.u), false);
      });
    });

    // Interactive highlight + click/drag scrub on both canvases
    function uFromKinPointer(clientX) {
      const L = ui.kinLayout;
      if (!L) return null;
      const rect = els.kinematics.getBoundingClientRect();
      return clamp((clientX - rect.left - L.pad.left) / L.pw, 0, 1);
    }

    function uFromGlidePointer(clientX) {
      const L = ui.glideLayout;
      if (!L) return null;
      const rect = els.glide.getBoundingClientRect();
      const frac = clamp((clientX - rect.left - L.pad.left) / L.pw, 0, 1);
      // Invert xKm(u) = MAX_RANGE_KM * (1 - u)^2 -> u = 1 - sqrt(1 - frac)
      return clamp(1 - Math.sqrt(Math.max(0, 1 - frac)), 0, 1);
    }

    function attachCanvasPointer(canvas, getU) {
      let dragging = false;
      canvas.addEventListener('pointerdown', e => {
        dragging = true;
        canvas.setPointerCapture?.(e.pointerId);
        stopPlay();
        const u = getU(e.clientX);
        if (u != null) setU(u, false);
      });
      canvas.addEventListener('pointermove', e => {
        const u = getU(e.clientX);
        if (u == null) return;
        if (dragging) {
          setU(u, false);
          return;
        }
        ui.hoverU = u;
        ui.hoverPhase = phaseIndexAt(u);
        drawGlide();
        drawKinematics();
        syncStepHighlight();
        updateTelemetry(false);
      });
      const endDrag = () => { dragging = false; };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('pointerleave', () => {
        dragging = false;
        ui.hoverU = null;
        ui.hoverPhase = null;
        drawGlide();
        drawKinematics();
        syncStepHighlight();
        updateTelemetry(true);
      });
    }

    attachCanvasPointer(els.glide, uFromGlidePointer);
    attachCanvasPointer(els.kinematics, uFromKinPointer);

    // Highlight .splice-step on hover & jump to phase on click (preserving .resolved)
    els.steps.forEach((step, idx) => {
      step.addEventListener('mouseenter', () => {
        ui.hoverPhase = idx;
        drawGlide();
        drawKinematics();
        syncStepHighlight();
      });
      step.addEventListener('mouseleave', () => {
        ui.hoverPhase = null;
        drawGlide();
        drawKinematics();
        syncStepHighlight();
      });
      step.addEventListener('click', () => {
        stopPlay();
        setU(PHASES[idx].jump, false);
      });
    });

    // 3D integration button: scroll to #moon3d-panel and post lunar-nav:sim
    els.simEmbed.addEventListener('click', () => {
      const panel = document.getElementById('moon3d-panel') || document.getElementById('moon3d-mount');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const iframe = document.querySelector('#moon3d-panel iframe');
      if (iframe && iframe.contentWindow) {
        const origin = location.origin && location.origin !== 'null' ? location.origin : '*';
        try {
          iframe.contentWindow.postMessage({
            type: 'lunar-nav:sim',
            name: ui.site.name,
            lat: ui.site.lat,
            lon: ui.site.lon,
          }, origin);
        } catch (_) {}
      }
    });

    // ResizeObserver with non-zero width guard
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            drawAll();
            break;
          }
        }
      });
      ro.observe(els.glide);
      ro.observe(els.kinematics);
    } else {
      window.addEventListener('resize', drawAll);
    }

    // Sync active site name on DOM changes and user edits
    const siteEl = document.getElementById('site');
    const latEl = document.getElementById('lat');
    const lonEl = document.getElementById('lon');
    const formEl = document.getElementById('f');
    const trnEl = document.getElementById('splice-trn-readout');
    const bestEl = document.getElementById('best-panel');

    if (siteEl) {
      siteEl.addEventListener('change', syncSite);
      new MutationObserver(() => {
        queueMicrotask(syncSite);
        requestAnimationFrame(syncSite);
      }).observe(siteEl, { childList: true });
    }
    if (latEl) {
      latEl.addEventListener('input', syncSite);
      latEl.addEventListener('change', syncSite);
    }
    if (lonEl) {
      lonEl.addEventListener('input', syncSite);
      lonEl.addEventListener('change', syncSite);
    }
    if (formEl) formEl.addEventListener('submit', () => queueMicrotask(syncSite));
    if (trnEl) {
      new MutationObserver(() => syncSite()).observe(trnEl, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    if (bestEl) {
      new MutationObserver(() => drawAll()).observe(bestEl, {
        attributes: true,
        attributeFilter: ['hidden'],
        childList: true,
      });
    }

    syncSite();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
