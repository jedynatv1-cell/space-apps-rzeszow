// 3D view: the Moon at the centre of a true-scale Solar System, landing sites, trails, time control.
// Rendering is unlit (no light sources, no shadow maps). The Moon uses one cheap dot product with
// the real Sun direction and a LOLA-derived normal map for day/night and relief.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as E from './ephem.js';
import { LANDING_DATES } from './landing-dates.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MOON_R = E.BODIES.moon.radius;
const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const TRAIL_DAYS = 365, TRAIL_N = 366;

const state = {
  t: Date.now(),
  playing: false,
  span: 30,                 // timeline width in days
  center: Date.now(),       // timeline centre
  theme: localStorage.getItem('navTheme') || 'dark',
};

// ---------- renderer, camera, controls ----------

const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
view.prepend(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.style.position = 'absolute';
labels.domElement.style.inset = '0';
labels.domElement.style.pointerEvents = 'none';
view.append(labels.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1e11);
camera.up.set(0, 0, 1); // ecliptic north is up
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;            // the Moon stays the centre
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.zoomSpeed = 1.6;
controls.minDistance = MOON_R + 12;
controls.maxDistance = 3e10;

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  labels.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

// ---------- textures ----------

const loader = new THREE.TextureLoader();
const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
const ASSET = 'assets/moon/';

// ---------- Moon ----------

/** Lat/lon sphere in the Moon body frame: x -> 0°E, y -> 90°E, z -> north pole. uv matches the SVS maps. */
function moonGeometry(nLon, nLat) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nLat; j++) {
    const lat = -Math.PI / 2 + Math.PI * j / nLat;
    for (let i = 0; i <= nLon; i++) {
      const lon = -Math.PI + 2 * Math.PI * i / nLon;
      pos.push(MOON_R * Math.cos(lat) * Math.cos(lon), MOON_R * Math.cos(lat) * Math.sin(lon), MOON_R * Math.sin(lat));
      uv.push(i / nLon, j / nLat);
    }
  }
  for (let j = 0; j < nLat; j++) for (let i = 0; i < nLon; i++) {
    const a = j * (nLon + 1) + i, b = a + nLon + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const moonUniforms = {
  colorMap: { value: null }, normalMap: { value: null }, heightMap: { value: null },
  sunDir: { value: new THREE.Vector3(1, 0, 0) }, shade: { value: 1 }, relief: { value: 1 }, exag: { value: 1 },
};
const moonMaterial = new THREE.ShaderMaterial({
  uniforms: moonUniforms,
  vertexShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    uniform sampler2D heightMap; uniform float exag;
    varying vec2 vUv; varying vec3 vE; varying vec3 vN; varying vec3 vU;
    void main() {
      vUv = uv;
      vec3 u = normalize(position);
      float lon = atan(u.y, u.x), lat = asin(clamp(u.z, -1.0, 1.0));
      vec3 e = vec3(-sin(lon), cos(lon), 0.0);
      vec3 n = vec3(-sin(lat) * cos(lon), -sin(lat) * sin(lon), cos(lat));
      vec3 h = texture2D(heightMap, uv).rgb;                       // 16-bit packed: R high byte, G low byte
      float metres = (floor(h.r * 255.0 + 0.5) * 256.0 + floor(h.g * 255.0 + 0.5) - 20000.0) * 0.5;
      vec3 p = u * (${MOON_R.toFixed(1)} + exag * metres / 1000.0);
      mat3 m = mat3(modelMatrix);
      vE = m * e; vN = m * n; vU = m * u;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform sampler2D colorMap; uniform sampler2D normalMap;
    uniform vec3 sunDir; uniform float shade; uniform float relief;
    varying vec2 vUv; varying vec3 vE; varying vec3 vN; varying vec3 vU;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 c = texture2D(colorMap, vUv).rgb;
      vec3 t = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
      vec3 up = normalize(vU);
      vec3 nrm = normalize(normalize(vE) * t.x * relief + normalize(vN) * t.y * relief + up * t.z);
      float lit = max(dot(nrm, sunDir), 0.0) * smoothstep(-0.01, 0.03, dot(up, sunDir));
      float b = mix(1.0, 0.07 + 1.1 * lit, shade); // 0.07 ~ earthshine on the night side
      gl_FragColor = vec4(c * b, 1.0);
    }`,
});

const moonFrame = new THREE.Group();     // Moon body frame, oriented each frame (Cassini's laws)
moonFrame.matrixAutoUpdate = false;
scene.add(moonFrame);
const moonMesh = new THREE.Mesh(moonGeometry(720, 360), moonMaterial);
moonMesh.visible = false;
moonFrame.add(moonMesh);

async function loadMoon() {
  const tex = (t, nearest) => {
    if (nearest) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
    else t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
    return t;
  };
  const [c1, n, h] = await Promise.all([load(ASSET + 'moon_color_1k.jpg'), load(ASSET + 'moon_normal.png'), load(ASSET + 'moon_height_rg.png')]);
  moonUniforms.colorMap.value = tex(c1); moonUniforms.normalMap.value = tex(n); moonUniforms.heightMap.value = tex(h, true);
  moonMesh.visible = true;
  $('loading').hidden = true;
  load(ASSET + 'moon_color_4k.jpg').then(c4 => { moonUniforms.colorMap.value = tex(c4); c1.dispose(); });
}

// ---------- Sun and planets ----------

function eqToEcl([x, y, z]) { // equatorial J2000 -> ecliptic J2000
  const e = 23.4392911 * Math.PI / 180;
  return new THREE.Vector3(x, y * Math.cos(e) + z * Math.sin(e), -y * Math.sin(e) + z * Math.cos(e));
}
function poleFromRaDec(ra, dec) {
  const r = ra * Math.PI / 180, d = dec * Math.PI / 180;
  return eqToEcl([Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)]).normalize();
}
// IAU pole directions (RA, Dec), used to tilt planets and Saturn's rings.
const POLES = { mercury: [281.01, 61.41], venus: [272.76, 67.16], earth: [0, 90], mars: [317.68, 52.89],
  jupiter: [268.06, 64.50], saturn: [40.59, 83.54], uranus: [257.31, -15.18], neptune: [299.36, 43.46] };

/** Simple procedural texture: bands for gas giants, rough continents for Earth. */
function planetTexture(key, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'), base = new THREE.Color(color);
  let seed = key.length * 9973;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = color; g.fillRect(0, 0, 256, 128);
  if (['jupiter', 'saturn', 'uranus', 'neptune'].includes(key)) {
    for (let y = 0; y < 128; y += 4) {
      const k = 0.8 + 0.4 * rnd();
      g.fillStyle = `#${base.clone().multiplyScalar(k).getHexString()}`;
      g.fillRect(0, y, 256, 4);
    }
    if (key === 'jupiter') { g.fillStyle = '#c4563a'; g.beginPath(); g.ellipse(170, 80, 14, 7, 0, 0, 7); g.fill(); }
  } else if (key === 'earth') {
    g.fillStyle = '#3f7d3a';
    for (let k = 0; k < 40; k++) { g.beginPath(); g.ellipse(rnd() * 256, 20 + rnd() * 88, 6 + rnd() * 22, 4 + rnd() * 12, rnd() * 3, 0, 7); g.fill(); }
    g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, 256, 9); g.fillRect(0, 119, 256, 9);
  } else {
    for (let k = 0; k < 120; k++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + 0.1 * rnd()})`;
      g.beginPath(); g.arc(rnd() * 256, rnd() * 128, 1 + rnd() * 5, 0, 7); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Unlit material with a cheap day/night split towards the Sun (one dot product). */
function planetMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, sunPos: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D map; uniform vec3 sunPos; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main() {
        #include <logdepthbuf_fragment>
        float l = max(dot(normalize(vN), normalize(sunPos - vW)), 0.0);
        gl_FragColor = vec4(texture2D(map, vUv).rgb * (0.12 + 0.95 * l), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

const bodies = {};
const MOON_ORBIT_N = 180, MOON_SIDEREAL = 27.3217;
let moonOrbit = null;
function makeLabel(text, color) {
  const el = document.createElement('div');
  el.className = 'plabel';
  el.innerHTML = `<i style="background:${color}"></i>${esc(text)}`;
  return new CSS2DObject(el);
}

function buildBodies() {
  // Sun: a plain bright sphere plus a soft additive glow sprite.
  const sun = new THREE.Mesh(new THREE.SphereGeometry(E.BODIES.sun.radius, 64, 32), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gg = gc.getContext('2d'), grad = gg.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,220,140,0.9)'); grad.addColorStop(0.3, 'rgba(255,190,80,0.35)'); grad.addColorStop(1, 'rgba(255,160,40,0)');
  gg.fillStyle = grad; gg.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(E.BODIES.sun.radius * 8);
  sun.add(glow);
  const sunLabel = makeLabel('Sun', '#ffd36b'); sun.add(sunLabel);
  scene.add(sun);
  bodies.sun = { obj: sun, label: sunLabel };

  const moonLabel = makeLabel('Moon', '#d9d9d9'); scene.add(moonLabel);
  bodies.moon = { label: moonLabel };
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOON_ORBIT_N * 3), 3));
  moonOrbit = new THREE.Line(mg, new THREE.LineBasicMaterial({ color: 0xbfc5d2, transparent: true, opacity: 0.5, depthWrite: false }));
  moonOrbit.frustumCulled = false;
  scene.add(moonOrbit);

  for (const key of PLANETS) {
    const b = E.BODIES[key];
    const mat = planetMaterial(planetTexture(key, b.color));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 64, 32), mat);
    // Tilt: SphereGeometry poles are on +y; rotate +y onto the planet's pole.
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleFromRaDec(...POLES[key]));
    if (key === 'saturn') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(74500, 136780, 128),
        new THREE.MeshBasicMaterial({ color: 0xcdbb94, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }));
      ring.rotation.x = Math.PI / 2; // ring plane = planet equator (xz of the sphere)
      mesh.add(ring);
    }
    const label = makeLabel(b.name, b.color);
    mesh.add(label);
    scene.add(mesh);
    bodies[key] = { obj: mesh, label, mat };
  }
}

// ---------- trails and orbits (heliocentric, inside a group shifted by -Moon) ----------

const helio = new THREE.Group();
scene.add(helio);
const trailLines = {}, orbitLines = {};

function makeTrail(key) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
  const col = new Float32Array(TRAIL_N * 4), c = new THREE.Color(E.BODIES[key].color);
  for (let i = 0; i < TRAIL_N; i++) { col.set([c.r, c.g, c.b, (i / (TRAIL_N - 1)) ** 1.5 * 0.95], i * 4); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  line.frustumCulled = false;
  helio.add(line);
  trailLines[key] = line;
}

function updateTrails(d) {
  for (const key of PLANETS) {
    const arr = trailLines[key].geometry.attributes.position;
    for (let i = 0; i < TRAIL_N; i++) {
      const p = E.bodyHelio(key, d - TRAIL_DAYS + i * TRAIL_DAYS / (TRAIL_N - 1));
      arr.setXYZ(i, p[0], p[1], p[2]);
    }
    arr.needsUpdate = true;
  }
}

let orbitsFor = null;
function updateOrbits(d) {
  if (orbitsFor !== null && Math.abs(d - orbitsFor) < 30) return; // elements change slowly
  orbitsFor = d;
  for (const key of PLANETS) {
    const n = 360, per = E.BODIES[key].periodDays, pts = new Float32Array((n + 1) * 3);
    for (let i = 0; i <= n; i++) {
      const p = E.planetHelio(key === 'earth' ? 'emb' : key, d - per * i / n);
      pts.set(p, i * 3);
    }
    if (!orbitLines[key]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x7a8396, transparent: true, opacity: 0.35, depthWrite: false }));
      line.frustumCulled = false;
      helio.add(line);
      orbitLines[key] = line;
    } else {
      orbitLines[key].geometry.attributes.position.array.set(pts);
      orbitLines[key].geometry.attributes.position.needsUpdate = true;
    }
  }
}

// ---------- landing sites ----------

const siteMarkers = [];
async function loadSites() {
  const tries = ['/api/sites'];
  const saved = localStorage.getItem('navApi');
  if (saved) tries.push(saved.replace(/\/$/, '') + '/api/sites');
  tries.push('../data/sites.json');
  for (const url of tries) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* next */ }
  }
  return [];
}

function siteClass(s) {
  if (s.status === 'crashed') return 'lost';
  if (s.status === 'planned' || s.status === 'candidate_region') return 'planned';
  return '';
}

function addSites(sites) {
  for (const s of sites) {
    const lat = s.lat_deg * Math.PI / 180, lon = s.lon_deg * Math.PI / 180;
    const n = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
    const el = document.createElement('div');
    el.className = `site ${siteClass(s)}`;
    el.title = s.name;
    el.innerHTML = `<span class="site-name">${esc(s.name)}</span>`;
    const obj = new CSS2DObject(el);
    obj.position.copy(n).multiplyScalar(MOON_R + 2);
    moonFrame.add(obj);
    const m = { site: s, obj, el, normal: n };
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => { e.stopPropagation(); openSite(m); });
    siteMarkers.push(m);
  }
}

function openSite(m) {
  siteMarkers.forEach(x => x.el.classList.toggle('active', x === m));
  const s = m.site, date = LANDING_DATES[s.mission];
  const status = { landed: 'Landed', crashed: 'Crashed / lost', planned: 'Planned', candidate_region: 'Candidate landing region' }[s.status] || s.status;
  $('popup').innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <h3 id="popup-title">${esc(s.name)}</h3>
    <dl>
      <dt>Mission</dt><dd>${esc(s.mission)}</dd>
      ${s.country_or_agency ? `<dt>Agency</dt><dd>${esc(s.country_or_agency)}</dd>` : ''}
      <dt>Status</dt><dd>${esc(status)}</dd>
      <dt>Date</dt><dd>${date ? esc(date) + ' UTC' : (s.status === 'candidate_region' || s.status === 'planned' ? 'not yet' : '—')}</dd>
      <dt>Location</dt><dd>${s.lat_deg.toFixed(3)}°, ${s.lon_deg.toFixed(3)}°E${s.south_polar ? ' · south polar' : ''}</dd>
    </dl>
    ${s.coord_note ? `<p class="note">${esc(s.coord_note)}</p>` : ''}
    <p><button id="fly">Fly to site</button> <a href="index.html?lat=${s.lat_deg}&lon=${s.lon_deg}">Sun &amp; Earth from here →</a></p>
    ${s.source_url ? `<p class="note"><a href="${esc(s.source_url)}" target="_blank" rel="noopener">Source</a></p>` : ''}`;
  $('popup').hidden = false;
  $('popup').querySelector('.close').onclick = closePopup;
  $('fly').onclick = () => flyTo(m.normal.clone().applyMatrix4(new THREE.Matrix4().extractRotation(moonFrame.matrix)), Math.min(camera.position.length(), MOON_R * 2.2));
}
function closePopup() { $('popup').hidden = true; siteMarkers.forEach(x => x.el.classList.remove('active')); }

// ---------- camera moves ----------

let fly = null;
function flyTo(dir, dist, ms = 1200) {
  const from = camera.position.clone(), to = dir.clone().normalize().multiplyScalar(dist);
  fly = { from, to, t0: performance.now(), ms };
}
function stepFly(now) {
  if (!fly) return;
  const k = Math.min(1, (now - fly.t0) / fly.ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  // Interpolate direction on the sphere and distance logarithmically.
  const d0 = fly.from.length(), d1 = fly.to.length();
  const dir = fly.from.clone().normalize().lerp(fly.to.clone().normalize(), e).normalize();
  camera.position.copy(dir.multiplyScalar(d0 * (d1 / d0) ** e));
  if (k >= 1) fly = null;
}

function cameraPreset(name, pos) {
  const toEarth = new THREE.Vector3(...sub(pos.earth, pos.moon)).normalize();
  const side = new THREE.Vector3().crossVectors(toEarth, new THREE.Vector3(0, 0, 1)).normalize();
  if (name === 'moon') flyTo(toEarth.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 0, -0.85)), 6500);
  if (name === 'earth') flyTo(side.clone().multiplyScalar(-1).add(toEarth.clone().multiplyScalar(-0.5)).add(new THREE.Vector3(0, 0, 0.35)), 9.5e5);
  if (name === 'inner') flyTo(new THREE.Vector3(0.15, -0.35, 1), 6.5e8);
  if (name === 'all') flyTo(new THREE.Vector3(0.1, -0.4, 1), 1.1e10);
}

// ---------- per-frame scene update ----------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
let lastTrailT = null, lastPos = null;

function updateScene() {
  const d = E.daysSinceJ2000(state.t);
  const pos = E.allHelio(d); lastPos = pos;
  const moon = pos.moon;
  for (const key of ['sun', ...PLANETS]) bodies[key].obj.position.set(...sub(pos[key], moon));
  helio.position.set(-moon[0], -moon[1], -moon[2]);
  const sunRel = bodies.sun.obj.position;
  moonUniforms.sunDir.value.copy(sunRel).normalize();
  for (const key of PLANETS) bodies[key].mat.uniforms.sunPos.value.copy(sunRel);

  const o = E.moonOrientation(d);
  moonFrame.matrix.makeRotationZ(o.node).multiply(new THREE.Matrix4().makeRotationX(o.incl)).multiply(new THREE.Matrix4().makeRotationZ(o.w));
  moonFrame.matrixWorldNeedsUpdate = true;

  // Moon's orbit around Earth over the last sidereal month, in the Moon-centred frame.
  const mo = moonOrbit.geometry.attributes.position, em = sub(pos.earth, moon);
  for (let i = 0; i < MOON_ORBIT_N; i++) {
    const g = E.moonGeo(d - MOON_SIDEREAL * i / (MOON_ORBIT_N - 1));
    mo.setXYZ(i, em[0] + g[0], em[1] + g[1], em[2] + g[2]);
  }
  mo.needsUpdate = true;

  if (lastTrailT === null || Math.abs(state.t - lastTrailT) > 36e5) { updateTrails(d); lastTrailT = state.t; }
  updateOrbits(d);
}

function updateMarkers() {
  const rot = new THREE.Matrix4().extractRotation(moonFrame.matrix);
  const camDir = camera.position.clone();
  const dist = camera.position.length();
  const show = $('opt-sites').checked && dist < MOON_R * 40;
  for (const m of siteMarkers) {
    const wn = m.normal.clone().applyMatrix4(rot);
    const p = wn.clone().multiplyScalar(MOON_R);
    m.obj.visible = show && wn.dot(camDir.clone().sub(p)) > 0; // hide sites on the far side
  }
  const labelsOn = $('opt-labels').checked;
  for (const key of ['sun', ...PLANETS]) bodies[key].label.visible = labelsOn;
  bodies.moon.label.visible = labelsOn && dist > MOON_R * 40;
  moonOrbit.visible = $('opt-orbits').checked;
}

// ---------- time UI ----------

const pad = n => String(n).padStart(2, '0');
const fmtUTC = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; };

function setTime(ms, recenter = false) {
  state.t = ms;
  const half = state.span * 864e5 / 2;
  if (recenter || ms < state.center - half || ms > state.center + half) state.center = ms;
  syncTimeInputs();
}

function syncTimeInputs() {
  const d = new Date(state.t);
  if (document.activeElement !== $('date')) $('date').value = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (document.activeElement !== $('time')) $('time').value = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  let extra = '';
  if (lastPos) extra = ` · Earth–Moon ${Math.round(Math.hypot(...sub(lastPos.earth, lastPos.moon))).toLocaleString('en')} km`;
  $('time-summary').textContent = fmtUTC(state.t) + (state.playing ? ' ▶' : '') + extra;
}

function timelineLayout() { const c = $('timeline'); return { c, w: c.clientWidth, h: c.clientHeight, l: 8, r: 8 }; }

/** Blender-like timeline: ticks with labels, a 'now' marker and the blue playhead. */
function drawTimeline() {
  const { c, w, h, l, r } = timelineLayout();
  if (!w) return;
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  g.fillStyle = css.getPropertyValue('--input'); g.fillRect(0, 0, w, h);
  const t0 = state.center - state.span * 432e5, t1 = state.center + state.span * 432e5;
  const x = t => l + (w - l - r) * (t - t0) / (t1 - t0);
  const dayMs = 864e5;
  const step = state.span <= 2 ? 36e5 * 3 : state.span <= 30 ? dayMs : state.span <= 365 ? dayMs * 7 : dayMs * 30;
  const minor = state.span <= 2 ? 36e5 : state.span <= 30 ? dayMs / 4 : dayMs;
  g.strokeStyle = css.getPropertyValue('--line'); g.lineWidth = 1;
  for (let t = Math.ceil(t0 / minor) * minor; t <= t1; t += minor) {
    g.beginPath(); g.moveTo(x(t) + 0.5, h - 10); g.lineTo(x(t) + 0.5, h); g.stroke();
  }
  g.fillStyle = css.getPropertyValue('--muted'); g.font = '11px system-ui';
  const first = Math.ceil(t0 / step) * step;
  for (let t = first; t <= t1; t += step) {
    g.beginPath(); g.moveTo(x(t) + 0.5, 18); g.lineTo(x(t) + 0.5, h); g.stroke();
    const d = new Date(t);
    const lab = step < dayMs ? `${pad(d.getUTCHours())}:00` : `${d.getUTCDate()}.${d.getUTCMonth() + 1}${step >= dayMs * 30 ? '.' + String(d.getUTCFullYear()).slice(2) : ''}`;
    g.fillText(lab, x(t) + 3, 13);
  }
  const now = Date.now();
  if (now >= t0 && now <= t1) { g.fillStyle = '#39d98a'; g.fillRect(x(now) - 1, 18, 2, h - 18); }
  const px = x(state.t);
  g.fillStyle = css.getPropertyValue('--accent');
  g.fillRect(px - 1, 0, 2, h);
  g.beginPath(); g.moveTo(px - 6, 0); g.lineTo(px + 6, 0); g.lineTo(px, 8); g.fill();
}

function wireTime() {
  $('top-toggle').onclick = () => {
    const open = $('time-panel').hidden;
    $('time-panel').hidden = !open;
    $('top-toggle').setAttribute('aria-expanded', String(open));
    drawTimeline();
  };
  const fromInputs = () => {
    const ms = Date.parse(`${$('date').value}T${$('time').value || '00:00'}:00Z`);
    if (Number.isFinite(ms)) setTime(ms, true);
  };
  $('date').onchange = fromInputs; $('time').onchange = fromInputs;
  $('now').onclick = () => setTime(Date.now(), true);
  $('play').onclick = () => setPlaying(!state.playing);
  $('span').onchange = () => { state.span = +$('span').value; state.center = state.t; drawTimeline(); };
  const c = $('timeline');
  const scrub = e => {
    const { w, l, r } = timelineLayout(), rect = c.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left - l) / (w - l - r)));
    state.t = state.center + (f - 0.5) * state.span * 864e5;
    syncTimeInputs();
  };
  c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); setPlaying(false); scrub(e); });
  c.addEventListener('pointermove', e => { if (e.buttons) scrub(e); });
}

function setPlaying(on) {
  state.playing = on;
  $('play').textContent = on ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  syncTimeInputs();
}

// ---------- panels, theme, toggles ----------

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('navTheme', theme);
  scene.background = new THREE.Color(theme === 'light' ? 0xdde2ea : 0x02030a);
  const orbitCol = theme === 'light' ? 0x6b7486 : 0x7a8396;
  Object.values(orbitLines).forEach(l => l.material.color.setHex(orbitCol));
  document.querySelectorAll('input[name=theme]').forEach(r => { r.checked = r.value === theme; });
  drawTimeline();
}

function wirePanels() {
  document.querySelectorAll('input[name=theme]').forEach(r => (r.onchange = () => applyTheme(r.value)));
  $('left-toggle').onclick = () => $('left').classList.toggle('collapsed');
  $('bottom-toggle').onclick = () => {
    const open = $('bottom-body').hidden;
    $('bottom-body').hidden = !open;
    $('bottom-toggle').setAttribute('aria-expanded', String(open));
    $('bottom-toggle').textContent = (open ? '▾' : '▴') + ' Panel';
  };
  $('opt-trails').onchange = () => Object.values(trailLines).forEach(l => (l.visible = $('opt-trails').checked));
  $('opt-orbits').onchange = () => Object.values(orbitLines).forEach(l => (l.visible = $('opt-orbits').checked));
  $('opt-shade').onchange = () => (moonUniforms.shade.value = $('opt-shade').checked ? 1 : 0);
  document.querySelectorAll('[data-cam]').forEach(b => (b.onclick = () => cameraPreset(b.dataset.cam, lastPos)));
  renderer.domElement.addEventListener('click', closePopup);
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); if (e.target.matches('button')) e.target.blur(); setPlaying(!state.playing); }
    if (e.key === 'Escape') closePopup();
  });
}

// ---------- main loop ----------

let lastFrame = performance.now(), lastUi = 0;
function frame(now) {
  const dt = (now - lastFrame) / 1000; lastFrame = now;
  if (state.playing) setTime(state.t + dt * +$('speed').value * 864e5);
  stepFly(now);
  controls.update();
  updateScene();
  updateMarkers();
  const alt = camera.position.length() - MOON_R;
  $('dist').textContent = alt < 1e6 ? `altitude above the Moon: ${Math.round(alt).toLocaleString('en')} km` : `distance: ${(camera.position.length() / E.AU_KM).toFixed(3)} AU`;
  if (now - lastUi > 100) { lastUi = now; if (!$('time-panel').hidden) drawTimeline(); if (state.playing) syncTimeInputs(); }
  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- start ----------

buildBodies();
PLANETS.forEach(makeTrail);
setTime(Date.now(), true);
updateScene();
applyTheme(state.theme);
wireTime();
wirePanels();
resize();
// Initial view: close to the Moon, looking at the south pole with Earth's direction in mind.
{
  const toEarth = new THREE.Vector3(...sub(lastPos.earth, lastPos.moon)).normalize();
  camera.position.copy(toEarth.multiplyScalar(0.55).add(new THREE.Vector3(0, 0, -0.85)).normalize().multiplyScalar(6500));
}
syncTimeInputs();
requestAnimationFrame(frame);
loadMoon().catch(e => { $('loading').textContent = `Could not load Moon textures: ${e.message || e}`; });
loadSites().then(addSites);
