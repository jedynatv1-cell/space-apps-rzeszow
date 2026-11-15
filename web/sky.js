// Canvas drawing: polar sky plot, timeline, and 360° horizon panorama. No dependencies.
// Conventions (HANDOFF §5): azimuth clockwise from north, elevation vs the local tangent plane.
'use strict';

const COLORS = {
  sun: '#f59e0b',
  sunFill: 'rgba(245, 158, 11, 0.08)',
  earth: '#38bdf8',
  earthFill: 'rgba(56, 189, 248, 0.07)',
  terrain: '#263044',
  terrainDeep: '#0d121d',
  terrainEdge: '#94a3b8',
  terrainHatch: 'rgba(148, 163, 184, 0.055)',
  grid: 'rgba(148, 163, 184, 0.11)',
  zero: 'rgba(148, 163, 184, 0.45)',
  frame: 'rgba(148, 163, 184, 0.22)',
  label: '#8b95a9',
  cardinal: '#cbd5e1',
  sky: '#0c1426',
  skyEdge: '#050811',
  cursor: '#f8fafc',
};
const MONO = '"JetBrains Mono", "SFMono-Regular", ui-monospace, monospace';
const DIRS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Size a canvas for the device pixel ratio and return a 2D context in CSS pixels. */
function setupCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

/** Horizon elevation (deg) at an azimuth, linearly interpolated from the 720-sample mask. */
function horizonAt(mask, az) {
  const n = mask.elev_deg.length;
  const x = (((az % 360) + 360) % 360) / mask.az_step_deg;
  const i = Math.floor(x) % n, j = (i + 1) % n, f = x - Math.floor(x);
  return mask.elev_deg[i] * (1 - f) + mask.elev_deg[j] * f;
}

/**
 * Elevation range shown by the sky plot: [lo at the rim, hi at the centre].
 * Sized around the Sun and Earth, not the tallest mountain: near a crater wall the terrain can
 * reach +15..25° while the bodies stay within a few degrees of 0°, and scaling to the mountain
 * squeezes the sky into a tiny ring. Terrain higher than `hi` is clamped to the centre (occluded).
 */
function skyRange(datas, full) {
  if (full) return { lo: -5, hi: 90 };
  let lo = -1, hi = 2, tMin = 0;
  for (const d of datas) {
    for (const e of d.horizon.elev_deg) tMin = Math.min(tMin, e);
    for (const p of d.points) {
      if (p.sun.el_deg > -3) hi = Math.max(hi, p.sun.el_deg + p.sun.radius_deg);
      if (p.earth.el_deg > -3) hi = Math.max(hi, p.earth.el_deg + p.earth.radius_deg);
    }
  }
  lo = Math.max(-6, Math.min(lo, tMin));
  return { lo: Math.floor(lo) - 1, hi: Math.min(90, Math.ceil(hi) + 2) };
}

/** Shared elevation range for one or more panorama strips. */
function panoRange(datas) {
  let tMin = Infinity, tMax = -Infinity, bMax = 2;
  for (const d of datas) {
    for (const e of d.horizon.elev_deg) { tMin = Math.min(tMin, e); tMax = Math.max(tMax, e); }
    for (const p of d.points) {
      for (const b of [p.sun, p.earth]) {
        if (b.el_deg > tMin - 3) bMax = Math.max(bMax, b.el_deg + b.radius_deg);
      }
    }
  }
  const lo = Math.max(-10, Math.floor(Math.min(tMin, -1)) - 0.5);
  const hi = Math.min(90, Math.ceil(Math.max(tMax, bMax)) + 1);
  return { lo, hi };
}

function niceStep(span) {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30]) if (span / s <= 6) return s;
  return 30;
}

/**
 * Polar sky plot seen from above: zenith side at the centre, north up, east right.
 * The radial scale is linear in elevation between range.hi (centre) and range.lo (rim), so
 * near-horizon geometry at the pole (Sun within ~±2°) is readable. Body disks use their true
 * angular radius on that scale; terrain is drawn after the bodies so it occludes them.
 */
function drawSky(canvas, data, idx, opts = {}) {
  const { g, w, h } = setupCanvas(canvas);
  const range = opts.range || skyRange([data], opts.full);
  const compact = !!opts.compact;
  const margin = compact ? 18 : 26;
  const R = Math.min(w, h) / 2 - margin, cx = w / 2, cy = h / 2;
  // Before layout settles the canvas can be 0 px wide: R < 0 makes createRadialGradient throw and
  // aborts the whole render. Skip this frame; the page redraws on resize and on the next update.
  if (!(R > 4)) return range;
  const span = range.hi - range.lo;
  const clampEl = el => Math.max(range.lo, Math.min(range.hi, el));
  const rOf = el => R * (range.hi - clampEl(el)) / span;
  const xy = (az, el) => {
    const r = rOf(el), a = az * Math.PI / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  };

  // Sky disk.
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  grad.addColorStop(0, COLORS.sky); grad.addColorStop(1, COLORS.skyEdge);
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill();

  // Elevation rings + azimuth spokes.
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.clip();
  g.strokeStyle = COLORS.grid; g.lineWidth = 1; g.fillStyle = COLORS.label;
  g.font = `${compact ? 9.5 : 10.5}px ${MONO}`;
  const step = niceStep(span);
  for (let el = Math.ceil(range.lo / step) * step; el < range.hi; el += step) {
    const r = rOf(el);
    g.setLineDash(el === 0 ? [4, 4] : []);
    g.strokeStyle = el === 0 ? COLORS.zero : COLORS.grid;
    g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.stroke();
    if (!compact || el === 0) g.fillText(`${+el.toFixed(1)}°`, cx + 4, cy - r - 3);
  }
  g.setLineDash([]); g.strokeStyle = COLORS.grid;
  for (let az = 0; az < 360; az += 30) {
    const [x, y] = xy(az, range.lo);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke();
  }

  const pts = data.points;
  // Paths over the whole window, broken where the body leaves the plotted range.
  const track = (key, color) => {
    g.strokeStyle = color; g.globalAlpha = 0.42; g.lineWidth = compact ? 1.15 : 1.5;
    g.beginPath(); let pen = false, prevAz = null;
    for (const p of pts) {
      const b = p[key];
      if (b.el_deg < range.lo || (prevAz !== null && Math.abs(b.az_deg - prevAz) > 180)) pen = false;
      prevAz = b.az_deg;
      if (b.el_deg < range.lo) continue;
      const [x, y] = xy(b.az_deg, b.el_deg);
      pen ? g.lineTo(x, y) : g.moveTo(x, y); pen = true;
    }
    g.stroke(); g.globalAlpha = 1;
  };
  track('sun', COLORS.sun);
  track('earth', COLORS.earth);

  // Bodies at the current time, true angular size on this scale (min 2.5 px so they stay visible).
  const p = pts[Math.max(0, Math.min(pts.length - 1, Math.round(idx)))];
  const body = (b, color, glow) => {
    if (b.el_deg + b.radius_deg < range.lo) return;
    const [x, y] = xy(b.az_deg, b.el_deg);
    const r = Math.max(2.6, b.radius_deg * R / span);
    if (glow) {
      const gg = g.createRadialGradient(x, y, r * 0.3, x, y, r * 2.8 + 5);
      gg.addColorStop(0, 'rgba(245, 158, 11, 0.34)'); gg.addColorStop(1, 'rgba(245, 158, 11, 0)');
      g.fillStyle = gg; g.beginPath(); g.arc(x, y, r * 2.8 + 5, 0, 2 * Math.PI); g.fill();
    }
    g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
  };
  if (p) { body(p.earth, COLORS.earth, false); body(p.sun, COLORS.sun, true); }

  // Terrain: everything between the horizon line and the rim.
  const mask = data.horizon, n = mask.elev_deg.length;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const az = (i % n) * mask.az_step_deg;
    const [x, y] = xy(az, mask.elev_deg[i % n]);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.moveTo(cx + R + 2, cy); g.arc(cx, cy, R + 2, 0, 2 * Math.PI, true);
  const tGrad = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
  tGrad.addColorStop(0, COLORS.terrain);
  tGrad.addColorStop(1, COLORS.terrainDeep);
  g.fillStyle = tGrad; g.fill('evenodd');
  g.strokeStyle = COLORS.terrainEdge; g.lineWidth = 1.25;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const az = (i % n) * mask.az_step_deg;
    const [x, y] = xy(az, mask.elev_deg[i % n]);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();

  // Shared azimuth cursor ray if hovered.
  if (opts.hoverAz != null && Number.isFinite(opts.hoverAz)) {
    const hz = horizonAt(mask, opts.hoverAz);
    const [rx, ry] = xy(opts.hoverAz, range.lo);
    const [hx, hy] = xy(opts.hoverAz, hz);
    g.strokeStyle = 'rgba(248, 250, 252, 0.65)';
    g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(rx, ry); g.stroke();
    g.setLineDash([]);
    g.fillStyle = COLORS.cursor;
    g.beginPath(); g.arc(hx, hy, 3, 0, 2 * Math.PI); g.fill();
  }
  g.restore();

  // Rim + compass labels.
  g.strokeStyle = COLORS.frame; g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.stroke();
  g.font = `600 ${compact ? 10 : 11}px ${MONO}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const labels = compact ? [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]
    : [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
  for (const [az, t] of labels) {
    const a = az * Math.PI / 180, r = R + margin / 2 + 1;
    g.fillStyle = t.length === 1 ? COLORS.cardinal : COLORS.label;
    g.fillText(t, cx + r * Math.sin(a), cy - r * Math.cos(a));
  }
  g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  return range;
}

/** Map a canvas x coordinate to a point index for a timeline drawn with the same layout. */
function timelineIndexAt(canvas, n, clientX) {
  const rect = canvas.getBoundingClientRect();
  const { left, right } = timelineLayout(rect.width);
  const f = (clientX - rect.left - left) / (rect.width - left - right);
  return Math.max(0, Math.min(n - 1, f * (n - 1)));
}

function timelineLayout(w) { return { left: 46, right: 10, w }; }

/**
 * Timeline: elevation chart (Sun, Earth, horizon under each) above two visibility bands.
 * opts.bandsOnly draws just the bands (used per site in the compare view).
 */
function drawTimeline(canvas, data, idx, opts = {}) {
  const { g, w, h } = setupCanvas(canvas);
  const { left, right } = timelineLayout(w);
  const pts = data.points, n = pts.length;
  const W = w - left - right;
  if (!(W > 10 && h > 10)) return;
  const x = i => left + W * i / Math.max(1, n - 1);
  const bandH = opts.bandsOnly ? Math.floor((h - 6) / 2) : 13;
  const axisH = opts.bandsOnly ? 0 : 18;
  const chartTop = 6, chartBot = opts.bandsOnly ? 0 : h - axisH - 2 * bandH - 12;
  g.font = `10.5px ${MONO}`;

  let yOf = null;
  if (!opts.bandsOnly) {
    // Background well for elevation plot.
    g.fillStyle = COLORS.skyEdge;
    g.fillRect(left, chartTop, W, chartBot - chartTop);

    let lo = Infinity, hi = -Infinity;
    for (const p of pts) {
      for (const v of [p.sun.el_deg, p.earth.el_deg, p.sun_horizon_deg, p.earth_horizon_deg]) {
        lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
    }
    lo = Math.floor(Math.min(lo, -1)) - 0.5; hi = Math.ceil(Math.max(hi, 1)) + 0.5;
    const y = v => chartTop + (chartBot - chartTop) * (hi - v) / (hi - lo);
    yOf = y;
    const step = niceStep(hi - lo);
    g.fillStyle = COLORS.label;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      g.strokeStyle = v === 0 ? COLORS.zero : COLORS.grid;
      g.setLineDash(v === 0 ? [4, 4] : []);
      g.beginPath(); g.moveTo(left, y(v)); g.lineTo(w - right, y(v)); g.stroke();
      g.setLineDash([]);
      g.fillText(`${+v.toFixed(1)}°`, 4, y(v) + 3.5);
    }

    // Subtle sunlit & DTE area shading between body elevation and local terrain horizon when visible.
    g.save();
    g.beginPath(); g.rect(left, chartTop, W, chartBot - chartTop); g.clip();
    const fillVis = (bodyKey, hzKey, visPred, fillStyle) => {
      g.fillStyle = fillStyle;
      let startIdx = null;
      for (let i = 0; i <= n; i++) {
        const active = i < n && visPred(pts[i]);
        if (active && startIdx === null) startIdx = i;
        else if (!active && startIdx !== null) {
          const endIdx = i - 1;
          g.beginPath();
          for (let k = startIdx; k <= endIdx; k++) {
            const px = x(k), py = y(pts[k][bodyKey].el_deg);
            k === startIdx ? g.moveTo(px, py) : g.lineTo(px, py);
          }
          for (let k = endIdx; k >= startIdx; k--) {
            g.lineTo(x(k), y(pts[k][hzKey]));
          }
          g.closePath();
          g.fill();
          startIdx = null;
        }
      }
    };
    fillVis('sun', 'sun_horizon_deg', p => p.sun_vis > 0, COLORS.sunFill);
    fillVis('earth', 'earth_horizon_deg', p => p.earth_vis >= 0.5, COLORS.earthFill);

    const line = (f, color, width = 1.6, dash = []) => {
      g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(x(i), y(f(p))) : g.moveTo(x(i), y(f(p)))));
      g.stroke(); g.setLineDash([]);
    };
    line(p => p.sun_horizon_deg, '#64748b', 1.25);
    line(p => p.earth_horizon_deg, '#475569', 1.15, [4, 3]);
    line(p => p.sun.el_deg, COLORS.sun, 1.75);
    line(p => p.earth.el_deg, COLORS.earth, 1.75);
    g.restore();

    g.strokeStyle = COLORS.frame; g.lineWidth = 1;
    g.strokeRect(left, chartTop, W, chartBot - chartTop);
  }

  // Visibility bands: brightness = visible fraction of the disk.
  const bandTop = opts.bandsOnly ? 2 : chartBot + 6;
  const band = (row, key, rgb) => {
    const top = bandTop + row * (bandH + 2);
    g.fillStyle = '#060911'; g.fillRect(left, top, W, bandH);
    for (let i = 0; i < n; i++) {
      const v = pts[i][key];
      if (v <= 0) continue;
      g.fillStyle = `rgba(${rgb},${0.25 + 0.75 * v})`;
      const x0 = x(i - 0.5), x1 = x(i + 0.5);
      g.fillRect(Math.max(left, x0), top, Math.min(w - right, x1) - Math.max(left, x0) + 0.5, bandH);
    }
    g.strokeStyle = 'rgba(148, 163, 184, 0.14)'; g.lineWidth = 1;
    g.strokeRect(left, top, W, bandH);
    g.fillStyle = row === 0 ? COLORS.sun : COLORS.earth;
    g.fillText(key === 'sun_vis' ? 'SUN' : 'DTE', 4, top + bandH - 2.5);
  };
  band(0, 'sun_vis', '245,158,11');
  band(1, 'earth_vis', '56,189,248');

  // Day ticks.
  if (!opts.bandsOnly && n > 1) {
    const t0 = Date.parse(pts[0].t), t1 = Date.parse(pts[n - 1].t);
    const days = (t1 - t0) / 864e5;
    const every = days > 120 ? 30 : days > 45 ? 7 : days > 10 ? 2 : 1;
    g.fillStyle = COLORS.label; g.strokeStyle = COLORS.grid;
    const first = new Date(t0); first.setUTCHours(0, 0, 0, 0);
    for (let t = first.getTime(), k = 0; t <= t1; t += 864e5, k++) {
      if (t < t0 || k % every) continue;
      const xi = left + W * (t - t0) / (t1 - t0);
      g.beginPath(); g.moveTo(xi, chartTop); g.lineTo(xi, h - axisH); g.stroke();
      const d = new Date(t);
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      g.fillText(`${dd}.${mm}`, xi - 14, h - 4);
    }
  }

  // Cursor + active point markers.
  const cx = x(idx);
  const p = pts[Math.max(0, Math.min(n - 1, Math.round(idx)))];
  g.strokeStyle = COLORS.cursor; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(cx, 2); g.lineTo(cx, h - axisH); g.stroke();
  if (!opts.bandsOnly && p && yOf) {
    // Playhead cap triangle
    g.fillStyle = COLORS.cursor;
    g.beginPath(); g.moveTo(cx - 4, 2); g.lineTo(cx + 4, 2); g.lineTo(cx, 7); g.closePath(); g.fill();
    // Active elevation dots on Sun & Earth curves
    for (const [b, col] of [[p.sun, COLORS.sun], [p.earth, COLORS.earth]]) {
      const py = yOf(b.el_deg);
      if (py >= chartTop && py <= chartBot) {
        g.fillStyle = col;
        g.beginPath(); g.arc(cx, py, 3.2, 0, 2 * Math.PI); g.fill();
        g.strokeStyle = '#050811'; g.lineWidth = 1; g.stroke();
      }
    }
  }
}

/**
 * 360° horizon panorama: azimuth on x (N-E-S-W-N), elevation on y. LOLA skyline as terrain,
 * Sun/Earth paths over the window, and both disks at the cursor time (true angular size, drawn as
 * ellipses because the vertical scale is stretched). Terrain is drawn last so it hides the bodies.
 * Returns the layout so callers can map the mouse back to azimuth.
 */
function drawPanorama(canvas, data, idx, opts = {}) {
  const { g, w, h } = setupCanvas(canvas);
  const compact = !!opts.compact;
  const left = 42, right = 10, top = compact ? 6 : 10, bottom = compact ? 18 : 22;
  const mask = data.horizon, pts = data.points, n = mask.elev_deg.length;
  const range = opts.range || panoRange([data]);
  const lo = range.lo, hi = range.hi;
  const W = w - left - right, H = h - top - bottom;
  const xs = W / 360, ys = H / (hi - lo);
  if (!(W > 10 && H > 10)) return { left, W: Math.max(W, 1), xs: Math.max(xs, 1e-3), ys, exaggeration: 1 };
  const x = az => left + (((az % 360) + 360) % 360) * xs;
  const y = el => top + (hi - el) * ys;

  // Sky background gradient.
  const grad = g.createLinearGradient(0, top, 0, top + H);
  grad.addColorStop(0, COLORS.skyEdge); grad.addColorStop(1, COLORS.sky);
  g.fillStyle = grad; g.fillRect(left, top, W, H);

  // Elevation grid + labels.
  g.font = `${compact ? 10 : 10.5}px ${MONO}`; g.fillStyle = COLORS.label; g.lineWidth = 1;
  const step = niceStep(hi - lo);
  for (let el = Math.ceil(lo / step) * step; el <= hi; el += step) {
    g.strokeStyle = el === 0 ? COLORS.zero : COLORS.grid;
    g.setLineDash(el === 0 ? [4, 4] : []);
    g.beginPath(); g.moveTo(left, y(el)); g.lineTo(left + W, y(el)); g.stroke();
    g.fillText(`${+el.toFixed(1)}°`, 3, y(el) + 3.5);
  }
  g.setLineDash([]);

  // Azimuth grid + compass labels.
  g.textAlign = 'center';
  const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
  for (let az = 0; az <= 360; az += 45) {
    g.strokeStyle = az % 90 === 0 ? 'rgba(148, 163, 184, 0.16)' : COLORS.grid;
    g.beginPath(); g.moveTo(left + az * xs, top); g.lineTo(left + az * xs, top + H); g.stroke();
    const lbl = compass[az / 45];
    g.fillStyle = lbl.length === 1 ? COLORS.cardinal : COLORS.label;
    g.font = `${lbl.length === 1 ? '600 ' : ''}${compact ? 10 : 10.5}px ${MONO}`;
    g.fillText(lbl, left + az * xs, h - 5);
  }
  g.textAlign = 'start';

  g.save(); g.beginPath(); g.rect(left, top, W, H); g.clip();

  // Sun & Earth paths over the window.
  const path = (key, color) => {
    g.strokeStyle = color; g.globalAlpha = 0.45; g.lineWidth = compact ? 1.3 : 1.55; g.beginPath();
    let prev = null;
    for (const p of pts) {
      const b = p[key];
      const jump = prev && Math.abs(b.az_deg - prev.az_deg) > 180;
      if (!prev || jump) g.moveTo(x(b.az_deg), y(b.el_deg)); else g.lineTo(x(b.az_deg), y(b.el_deg));
      prev = b;
    }
    g.stroke(); g.globalAlpha = 1;
  };
  path('sun', COLORS.sun);
  path('earth', COLORS.earth);

  // Current Sun & Earth disks (drawn before terrain so terrain occludes them).
  const p = pts[Math.max(0, Math.min(pts.length - 1, Math.round(idx)))];
  const disk = (b, color, glow) => {
    const rx = Math.max(2.6, b.radius_deg * xs), ry = Math.max(2.6, b.radius_deg * ys);
    for (const off of [0, -360, 360]) { // draw wrapped copies near the N edge
      const cx = left + (((b.az_deg % 360) + 360) % 360 + off) * xs, cy = y(b.el_deg);
      if (cx < left - rx || cx > left + W + rx) continue;
      if (glow) {
        const gg = g.createRadialGradient(cx, cy, 0, cx, cy, ry * 2.4 + 6);
        gg.addColorStop(0, 'rgba(245, 158, 11, 0.35)'); gg.addColorStop(1, 'rgba(245, 158, 11, 0)');
        g.fillStyle = gg; g.beginPath(); g.arc(cx, cy, ry * 2.4 + 6, 0, 2 * Math.PI); g.fill();
      }
      g.fillStyle = color; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); g.fill();
    }
  };
  if (p) { disk(p.earth, COLORS.earth, false); disk(p.sun, COLORS.sun, true); }

  // LOLA Terrain silhouette polygon + vertical topographic scanlines + ridge crest stroke.
  g.beginPath(); g.moveTo(left, top + H);
  for (let i = 0; i <= n; i++) g.lineTo(left + i * mask.az_step_deg * xs, y(mask.elev_deg[i % n]));
  g.lineTo(left + W, top + H); g.closePath();
  const pGrad = g.createLinearGradient(0, top, 0, top + H);
  pGrad.addColorStop(0, COLORS.terrain);
  pGrad.addColorStop(1, COLORS.terrainDeep);
  g.fillStyle = pGrad; g.fill();

  // Subtle vertical topographic scanlines inside terrain polygon.
  g.save();
  g.clip();
  g.strokeStyle = COLORS.terrainHatch; g.lineWidth = 1;
  g.beginPath();
  for (let az = 0; az <= 360; az += 6) {
    const sx = left + az * xs;
    g.moveTo(sx, top); g.lineTo(sx, top + H);
  }
  g.stroke();
  g.restore();

  // Crisp terrain ridge crest line.
  g.strokeStyle = COLORS.terrainEdge; g.lineWidth = 1.3; g.beginPath();
  for (let i = 0; i <= n; i++) {
    const X = left + i * mask.az_step_deg * xs, Y = y(mask.elev_deg[i % n]);
    i ? g.lineTo(X, Y) : g.moveTo(X, Y);
  }
  g.stroke();

  // Subtle current-time azimuth ticks at top of frame for Sun & Earth.
  if (p) {
    for (const [b, col] of [[p.sun, COLORS.sun], [p.earth, COLORS.earth]]) {
      const bx = x(b.az_deg);
      g.strokeStyle = col; g.globalAlpha = 0.55; g.lineWidth = 1;
      g.beginPath(); g.moveTo(bx, top); g.lineTo(bx, top + 5); g.stroke();
      g.globalAlpha = 1;
    }
  }

  // Shared interactive azimuth cursor (when hovering Panorama or Compare strips).
  if (opts.hoverAz != null && Number.isFinite(opts.hoverAz)) {
    const az = ((opts.hoverAz % 360) + 360) % 360;
    const cx = left + az * xs;
    const hz = horizonAt(mask, az);
    const cy = y(hz);
    g.strokeStyle = 'rgba(248, 250, 252, 0.78)';
    g.lineWidth = 1.2;
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(cx, top); g.lineTo(cx, top + H); g.stroke();
    g.setLineDash([]);
    g.fillStyle = COLORS.cursor;
    g.beginPath(); g.arc(cx, cy, 3.2, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = '#050811'; g.lineWidth = 1; g.stroke();

    const dir = DIRS8[Math.round(az / 45) % 8];
    const tag = `AZ ${az.toFixed(1)}° (${dir}) · RIDGE ${hz >= 0 ? '+' : ''}${hz.toFixed(2)}°`;
    g.font = `600 10px ${MONO}`;
    const tw = g.measureText(tag).width + 10;
    const tx = Math.min(left + W - tw - 4, Math.max(left + 4, cx + 6));
    const ty = top + 6;
    g.fillStyle = 'rgba(5, 8, 17, 0.88)';
    g.fillRect(tx, ty, tw, 17);
    g.strokeStyle = 'rgba(248, 250, 252, 0.28)';
    g.strokeRect(tx, ty, tw, 17);
    g.fillStyle = COLORS.cursor;
    g.fillText(tag, tx + 5, ty + 12);
  }

  g.restore();

  // Outer plot frame.
  g.strokeStyle = COLORS.frame; g.lineWidth = 1;
  g.strokeRect(left, top, W, H);

  return { left, W, xs, ys, exaggeration: ys / xs };
}
