// 3D view: the Moon at the centre of a true-scale Solar System, landing sites, trails, time control.
// Rendering is unlit (no light sources, no shadow maps). The Moon uses one cheap dot product with
// the real Sun direction and a LOLA-derived normal map for day/night and relief.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as E from './ephem.js?v=20261115k';
import { SITE_INFO } from './site-info.js?v=20261115k';

const $ = id => document.getElementById(id);
// Embed mode (solar.html?embed=1): shown inside a panel on index.html. Settings start collapsed and
// "Horizon" sends the site to the parent page instead of navigating away.
const EMBED = new URLSearchParams(location.search).get('embed') === '1';
// Only candidate regions show on load; ?show=all (for the demo video) switches every category on.
if (new URLSearchParams(location.search).get('show') === 'all') {
  for (const id of ['cat-hist', 'cat-planned', 'cat-cand']) { const el = document.getElementById(id); if (el) el.checked = true; }
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MOON_R = E.BODIES.moon.radius;
const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const TRAIL_DAYS = 365, TRAIL_N = 366;

const state = {
  t: Date.now(),
  playing: false,
  theme: 'dark',
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
labels.domElement.style.zIndex = '1'; // own stacking context: marker z-indices stay below the card and panels
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
      float b = mix(1.0, 0.16 + 1.0 * lit, shade); // night-side floor: faint earthshine, raised for legibility near the pole
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
// Rocket marker (inline SVG, coloured through currentColor = the category colour).
const ROCKET_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="r-body" d="M12 1.8c3.3 2.3 5 6.2 5 10.4l-1.6 3.3H8.6L7 12.2c0-4.2 1.7-8.1 5-10.4z"/><path class="r-fin" d="M7.3 11.4 4 14.6l.9 3.6 3.4-2.4zM16.7 11.4l3.3 3.2-.9 3.6-3.4-2.4z"/><circle class="r-win" cx="12" cy="9" r="1.9"/><path class="r-flame" d="M9.6 16.6h4.8L12 22z"/></svg>';

// CPU copy of the packed LOLA height map (R = high byte, G = low byte, half-metres + 20000).
let heightPx = null, heightW = 0, heightH = 0;
async function loadHeights() {
  const img = new Image();
  img.src = ASSET + 'moon_height_rg.png';
  await img.decode();
  const c = document.createElement('canvas'); c.width = heightW = img.width; c.height = heightH = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  heightPx = g.getImageData(0, 0, heightW, heightH).data;
}
function heightKm(lat, lon) {
  if (!heightPx) return 0;
  const x = Math.min(heightW - 1, Math.floor((lon + 180) / 360 * heightW));
  const y = Math.min(heightH - 1, Math.floor((90 - lat) / 180 * heightH));
  const k = (y * heightW + x) * 4;
  return ((heightPx[k] * 256 + heightPx[k + 1]) - 20000) * 0.5 / 1000;
}
async function loadSites() {
  const tries = ['/api/sites'];
  const saved = localStorage.getItem('navApi');
  if (saved) tries.push(saved.replace(/\/$/, '') + '/api/sites');
  tries.push('../data/sites.json', 'samples/sites.json');
  for (const url of tries) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* next */ }
  }
  return [];
}

const STATUS = { // [css class, label, left-panel category]
  landed: ['landed', 'Landed', 'hist'], crashed: ['lost', 'Lost on landing', 'hist'],
  planned: ['planned', 'Planned mission', 'planned'], candidate_region: ['cand', 'Candidate region', 'cand'],
};
const statusOf = s => STATUS[s.status] || ['landed', s.status || '', 'hist'];

// ---------- landing areas (candidate regions and planned missions) ----------
// Candidate regions: NASA describes each Artemis region as roughly 15 x 15 km (docs/RESEARCH.md §9.1);
// we draw that square around the proxy centre. Planned missions: no published ellipse, so an
// illustrative 5 km radius circle. Both follow the LOLA surface and are depth-tested (far side hidden).
const AREA = {
  cand: { half: 7.5, color: 0xffd84d, size: 7.5 },     // NASA: each Artemis region ~15 x 15 km
  planned: { radius: 5, color: 0xff9a1f, size: 5 },     // illustrative, no published ellipse
  hist: { radius: 1, color: 0x3fd68f, size: 1 },        // illustrative ~1 km around the landing point
};
const LOST_COLOR = 0xff5d5d;
const AREA_LIFT = 1.2;
const areaMeshes = []; // km above the sampled LOLA height, so the patch stays above the coarser mesh

function surfacePoint(n, east, north, de, dn) {
  const v = n.clone().multiplyScalar(MOON_R).addScaledVector(east, de).addScaledVector(north, dn).normalize();
  const lat = Math.asin(v.z) * 180 / Math.PI, lon = Math.atan2(v.y, v.x) * 180 / Math.PI;
  return v.multiplyScalar(MOON_R + heightKm(lat, lon) + AREA_LIFT);
}

function makeArea(m) {
  const base = AREA[m.cat];
  if (!base) return null;
  const spec = m.site.status === 'crashed' ? { ...base, color: LOST_COLOR } : base;
  const n = m.normal, lon = Math.atan2(n.y, n.x), lat = Math.asin(n.z);
  const east = new THREE.Vector3(-Math.sin(lon), Math.cos(lon), 0);
  const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat));
  const outline = [], fill = [];
  if (spec.half) { // square, sampled along each edge so it hugs the terrain
    const h = spec.half, k = 24, corners = [[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]];
    for (let c = 0; c < 4; c++) for (let i = 0; i < k; i++) {
      const t = i / k, [x0, y0] = corners[c], [x1, y1] = corners[c + 1];
      outline.push(surfacePoint(n, east, north, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t));
    }
    const g = 12; // fill grid
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
      const q = (a, b) => surfacePoint(n, east, north, -h + 2 * h * a / g, -h + 2 * h * b / g);
      fill.push(q(i, j), q(i + 1, j), q(i + 1, j + 1), q(i, j), q(i + 1, j + 1), q(i, j + 1));
    }
  } else { // circle
    const r = spec.radius, k = 96, c0 = surfacePoint(n, east, north, 0, 0);
    const ring = i => surfacePoint(n, east, north, r * Math.cos(2 * Math.PI * i / k), r * Math.sin(2 * Math.PI * i / k));
    for (let i = 0; i < k; i++) { outline.push(ring(i)); fill.push(c0, ring(i), ring(i + 1)); }
  }
  const group = new THREE.Group();
  const lineGeo = new THREE.BufferGeometry().setFromPoints(outline);
  group.add(new THREE.LineLoop(lineGeo, new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: 0.95, depthWrite: false })));
  const fillGeo = new THREE.BufferGeometry().setFromPoints(fill);
  const fillMesh = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
  fillMesh.userData.site = m; // the whole patch is hoverable/clickable (raycast below)
  areaMeshes.push(fillMesh);
  group.add(fillMesh);
  moonFrame.add(group);
  return group;
}

function addSites(sites) {
  for (const s of sites) {
    const lat = s.lat_deg * Math.PI / 180, lon = s.lon_deg * Math.PI / 180;
    const n = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
    const el = document.createElement('div');
    el.className = `site ${statusOf(s)[0]}`;
    el.setAttribute('aria-label', s.name);
    el.innerHTML = `<i>${ROCKET_SVG}</i>`;
    const obj = new CSS2DObject(el);
    // Sit on the real (LOLA) surface, not the bare sphere: polar sites are up to ~5 km above it.
    obj.position.copy(n).multiplyScalar(MOON_R + heightKm(s.lat_deg, s.lon_deg) + 0.3);
    moonFrame.add(obj);
    const m = { site: s, obj, el, normal: n, cat: statusOf(s)[2] };
    m.area = makeArea(m);
    el.addEventListener('pointerenter', () => { if (!card.pinned) showCard(m); cancelHide(); });
    el.addEventListener('pointerleave', () => scheduleHide());
    // Pin on pointerdown, not click: markers are repositioned every frame, and if one shifts a pixel
    // between press and release the browser sends the click to a parent instead.
    el.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (card.m === m && card.pinned) { hideCard(true); return; }
      showCard(m); card.pinned = true; $('card').classList.add('open');
    });
    el.addEventListener('click', e => e.stopPropagation());
    siteMarkers.push(m);
  }
  for (const c of ['hist', 'planned', 'cand']) $('n-' + c).textContent = siteMarkers.filter(m => m.cat === c).length;
  $('site-note').textContent = `${siteMarkers.length} sites. Markers on the far side of the Moon are hidden; turn the Moon to see them.`;
}

// One floating card, positioned above the hovered or pinned marker every frame.
const card = { m: null, pinned: false, timer: 0 };

function fmtDate(iso) {
  if (!/^\d{4}-\d\d-\d\d/.test(iso || '')) return iso || '—';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
const fmtLoc = s => `${Math.abs(s.lat_deg).toFixed(2)}°${s.lat_deg < 0 ? 'S' : 'N'}, ${Math.abs(s.lon_deg).toFixed(2)}°${s.lon_deg < 0 ? 'W' : 'E'}`;

// "Why here": only statements already in site-info.js (no invented facts).
function whyHtml(m, info) {
  let items = [];
  if (m.cat === 'cand') {
    items = ['Long sunlit periods for solar power', 'Direct line of sight to Earth for radio contact',
      'Near permanently shadowed craters that may hold water ice'];
  } else if (info.text) {
    items = info.text.split(/(?<=\.)\s+|;\s+/).map(t => t.replace(/\.$/, '')).filter(Boolean).slice(0, 3)
      .map(t => t.charAt(0).toUpperCase() + t.slice(1));
  }
  if (!items.length) return '';
  const title = m.cat === 'hist' ? 'About this landing' : 'Why here';
  return `<div class="why"><div class="sec">${title}</div><ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
}

// Live conditions from our server (same numbers as the analysis page), fetched on first hover, cached.
const condCache = new Map();
// Same server choice as the analysis page: ?api=… or the saved address, else this page's server.
const API_BASE = (new URLSearchParams(location.search).get('api') ?? localStorage.getItem('navApi') ?? '').replace(/\/$/, '');
function condUrl(s) {
  const start = new Date(state.t).toISOString().slice(0, 10);
  return { key: `${s.lat_deg},${s.lon_deg},${start}`, url: `${API_BASE}/api/track?${new URLSearchParams({ lat: s.lat_deg, lon: s.lon_deg, start, days: 30, step_min: 60 })}` };
}
const fmtDur = h => (h == null ? '—' : h < 48 ? `${Math.round(h)} h` : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`);
function verdictOf(sum) { // interim rule shared with the analysis page: Sun % and Earth %
  const rank = v => (v >= 70 ? 0 : v >= 50 ? 1 : 2), rankE = v => (v >= 50 ? 0 : v >= 30 ? 1 : 2);
  const r = Math.max(rank(sum.sun_visible_pct), rankE(sum.earth_visible_pct));
  return [['good', 'Good site'], ['marginal', 'Marginal site'], ['poor', 'Poor site']][r];
}
function condHtml(sum) {
  const [vcls, vword] = verdictOf(sum);
  const setFirst = sum.hours_to_sunset != null && (sum.hours_to_sunrise == null || sum.hours_to_sunset < sum.hours_to_sunrise);
  const next = setFirst ? `Sunset in ${fmtDur(sum.hours_to_sunset)}` : sum.hours_to_sunrise != null ? `Sunrise in ${fmtDur(sum.hours_to_sunrise)}` : 'No sunrise/sunset in window';
  return `<div class="verdict ${vcls}"><i></i>${vword} <small>for a solar-powered lander</small></div>
    <dl><dt>Sunlight</dt><dd>${(+sum.sun_visible_pct).toFixed(0)}% of the time</dd>
    <dt>Earth in view</dt><dd>${(+sum.earth_visible_pct).toFixed(0)}% (direct radio link)</dd>
    <dt>Longest night</dt><dd>${fmtDur(sum.longest_night_hours)}</dd>
    <dt>Next</dt><dd>${next}</dd></dl>`;
}
async function loadConditions(m) {
  const { key, url } = condUrl(m.site);
  const body = () => (card.m === m ? $('card').querySelector('.cond-body') : null);
  try {
    if (!condCache.has(key)) condCache.set(key, fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status)))));
    const data = await condCache.get(key);
    if (body()) body().innerHTML = condHtml(data.summary);
  } catch {
    condCache.delete(key);
    if (body()) body().textContent = 'Live conditions need the analysis server.';
  }
}

function showCard(m) {
  const s = m.site, [cls, label] = statusOf(s), info = SITE_INFO[s.mission] || {};
  const c = $('card');
  if (card.m !== m) {
    card.m = m; card.pinned = false;
    siteMarkers.forEach(x => x.el.classList.toggle('active', x === m));
    c.className = `glass ${cls}`;
    c.innerHTML = `
      <span class="status">${esc(label)}</span>
      <h3>${esc(s.name)}</h3>
      <dl>
        <dt>Mission</dt><dd>${esc(s.mission.replace(/\s*\(.*\)$/, ''))}</dd>
        <dt>Date</dt><dd>${esc(fmtDate(info.date))}</dd>
        <dt>Location</dt><dd>${fmtLoc(s)}</dd>
        ${m.cat === 'cand' ? '<dt>Area</dt><dd>~15 × 15 km NASA candidate region (shaded on the surface)</dd>' : ''}
        ${m.cat === 'planned' ? '<dt>Area</dt><dd>illustrative 5 km radius (no published landing ellipse)</dd>' : ''}
        ${m.cat === 'hist' ? '<dt>Area</dt><dd>illustrative ~1 km around the landing point</dd>' : ''}
      </dl>
      ${whyHtml(m, info)}
      <div class="cond"><div class="sec">Conditions, next 30 days</div><div class="cond-body">Computing…</div></div>
      <div class="more"><div>
        ${info.text ? `<p>${esc(info.text)}</p>` : ''}
        ${s.coord_note ? `<p>${esc(s.coord_note)}</p>` : ''}
        <div class="actions"><button class="text" data-fly>Fly to site</button><a class="text" data-horizon href="index.html?lat=${s.lat_deg}&lon=${s.lon_deg}">${EMBED ? 'Analyse this site ↑' : 'Horizon →'}</a></div>
      </div></div>
      <div class="hint">Click for details</div>`;
    loadConditions(m);
    if (EMBED) c.querySelector('[data-horizon]').onclick = e => {
      e.preventDefault(); e.stopPropagation();
      // Same-origin parent (index.html) applies the site to the analysis form.
      window.parent.postMessage({ type: 'lunar-nav:site', lat: s.lat_deg, lon: s.lon_deg, name: s.name }, location.origin);
    };
    c.querySelector('[data-fly]').onclick = e => {
      e.stopPropagation();
      hideCard(true); // do not cover the landing area we are flying to
      flyTo(m.normal.clone().applyMatrix4(new THREE.Matrix4().extractRotation(moonFrame.matrix)), Math.min(camera.position.length(), MOON_R + Math.max(20, 20 * (AREA[m.cat]?.size ?? 7.5)))); // area spans ~100 px
    };
    c.hidden = false;
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  }
  positionCard();
}

function hideCard(force) {
  if (card.pinned && !force) return;
  card.m = null; card.pinned = false;
  $('card').hidden = true;
  siteMarkers.forEach(x => x.el.classList.remove('active'));
}
function scheduleHide() { cancelHide(); card.timer = setTimeout(() => hideCard(false), 180); }
function cancelHide() { clearTimeout(card.timer); }

const _v = new THREE.Vector3();
function positionCard() {
  if (!card.m) return;
  card.m.obj.getWorldPosition(_v).project(camera);
  const c = $('card');
  const W = view.clientWidth, H = view.clientHeight, cw = c.offsetWidth || 280, ch = c.offsetHeight || 160;
  const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
  // Keep the card on screen: clamp horizontally, and flip below the marker if it would be cut off at the top.
  // On narrow screens, or when it fits neither above nor below, show it as a bottom sheet that scrolls.
  const above = y - ch - 16 >= 8, below = y + ch + 16 <= H;
  // Never slide under the open settings panel: its right edge is the card's left limit.
  const panel = $('left'), vr = view.getBoundingClientRect();
  const minLeft = panel && !panel.classList.contains('collapsed') ? panel.getBoundingClientRect().right - vr.left + 8 : 8;
  const sheet = W < 600 || (!above && !below) || W - minLeft < cw + 8;
  c.classList.toggle('sheet', sheet);
  if (sheet) { c.style.left = ''; c.style.top = ''; return; }
  c.style.left = `${Math.max(minLeft + cw / 2, Math.min(W - cw / 2 - 8, x))}px`;
  c.style.top = `${y}px`;
  c.classList.toggle('below', !above);
}

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
  // The orbit starts and ends at the Moon (origin); skip the stretch inside ~4 Moon radii so the
  // line does not cut across the Moon's face.
  let a = 0, b = MOON_ORBIT_N - 1;
  const r2 = (16 * MOON_R * MOON_R);
  const d2 = k => mo.getX(k) ** 2 + mo.getY(k) ** 2 + mo.getZ(k) ** 2;
  while (a < b && d2(a) < r2) a++;
  while (b > a && d2(b) < r2) b--;
  moonOrbit.geometry.setDrawRange(a, b - a + 1);

  if (lastTrailT === null || Math.abs(state.t - lastTrailT) > 36e5) { updateTrails(d); lastTrailT = state.t; }
  updateOrbits(d);
}

function updateMarkers() {
  const rot = new THREE.Matrix4().extractRotation(moonFrame.matrix);
  const camDir = camera.position.clone();
  const dist = camera.position.length();
  const near = dist < MOON_R * 40;
  const cats = { hist: $('cat-hist').checked, planned: $('cat-planned').checked, cand: $('cat-cand').checked };
  for (const m of siteMarkers) {
    const wn = m.normal.clone().applyMatrix4(rot);
    const p = wn.clone().multiplyScalar(MOON_R);
    const toCam = camDir.clone().sub(p).normalize();
    m.facing = wn.dot(toCam) > 0.06; // far side and grazing limb
    const closeUp = m.area && dist < MOON_R + 60 * (AREA[m.cat]?.size ?? 7.5); // up close the patch is the landing zone
    m.obj.visible = near && cats[m.cat] && m.facing && !closeUp;
    if (m.area) m.area.visible = cats[m.cat]; // depth test hides areas on the far side
  }
  if (card.m && !(card.m.facing && cats[card.m.cat])) hideCard(true);
  const labelsOn = $('opt-labels').checked;
  for (const key of ['sun', ...PLANETS]) bodies[key].label.visible = labelsOn;
  bodies.moon.label.visible = labelsOn && dist > MOON_R * 40;
  moonOrbit.visible = $('opt-orbits').checked;
}

// ---------- time control ----------

const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');

function setTime(ms) { state.t = ms; syncTime(); }

function syncTime() {
  const d = new Date(state.t);
  $('date-main').textContent = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  $('date-time').textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  if (document.activeElement !== $('date')) $('date').value = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (document.activeElement !== $('time')) $('time').value = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function setPlaying(on) {
  state.playing = on;
  $('bar').classList.toggle('playing', on);
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
}

/** Step one day per click; holding the button keeps stepping. */
function holdStep(btn, dir) {
  let t1 = 0, t2 = 0;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  btn.addEventListener('pointerdown', () => {
    setPlaying(false);
    setTime(state.t + dir * DAY);
    t1 = setTimeout(() => { t2 = setInterval(() => setTime(state.t + dir * DAY), 90); }, 380);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
}

function wireTime() {
  const top = $('top');
  $('top-toggle').onclick = () => {
    const closed = top.classList.toggle('closed');
    $('top-toggle').setAttribute('aria-expanded', String(!closed));
    $('top-toggle').setAttribute('aria-label', closed ? 'Show time controls' : 'Hide time controls');
    if (closed) togglePicker(false);
  };
  $('play').onclick = () => setPlaying(!state.playing);
  holdStep($('back'), -1);
  holdStep($('fwd'), 1);
  $('date-btn').onclick = () => togglePicker();
  const fromInputs = () => {
    const ms = Date.parse(`${$('date').value}T${$('time').value || '00:00'}:00Z`);
    if (Number.isFinite(ms)) setTime(ms);
  };
  $('date').onchange = fromInputs; $('time').onchange = fromInputs;
  $('now').onclick = () => setTime(Date.now());
}

function togglePicker(force) {
  const open = force ?? !$('picker').classList.contains('open');
  $('picker').classList.toggle('open', open);
  $('picker').setAttribute('aria-hidden', String(!open));
  $('date-btn').setAttribute('aria-expanded', String(open));
}

// ---------- panels, theme, toggles ----------

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  scene.background = new THREE.Color(theme === 'light' ? 0xdde2ea : 0x02030a);
  const orbitCol = theme === 'light' ? 0x6b7486 : 0x7a8396;
  Object.values(orbitLines).forEach(l => l.material.color.setHex(orbitCol));
}

function wirePanels() {
  $('left-toggle').onclick = () => {
    const collapsed = $('left').classList.toggle('collapsed');
    $('left-toggle').setAttribute('aria-expanded', String(!collapsed));
    $('left-toggle').setAttribute('aria-label', collapsed ? 'Show settings' : 'Hide settings');
  };
  $('opt-trails').onchange = () => Object.values(trailLines).forEach(l => (l.visible = $('opt-trails').checked));
  $('opt-orbits').onchange = () => Object.values(orbitLines).forEach(l => (l.visible = $('opt-orbits').checked));
  $('opt-shade').onchange = () => (moonUniforms.shade.value = $('opt-shade').checked ? 1 : 0);
  document.querySelectorAll('[data-cam]').forEach(b => (b.onclick = () => cameraPreset(b.dataset.cam, lastPos)));
  const c = $('card');
  c.addEventListener('pointerenter', cancelHide);
  c.addEventListener('pointerleave', scheduleHide);
  c.addEventListener('click', e => { e.stopPropagation(); card.pinned = true; c.classList.add('open'); });
  // Hover and click on the shaded landing areas themselves (not only on the dot).
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let areaHover = null, down = null, pending = false;
  const hitArea = (x, y) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(areaMeshes.filter(a => a.parent.visible), false)[0];
    return hit ? hit.object.userData.site : null;
  };
  renderer.domElement.addEventListener('pointermove', e => {
    if (pending || e.buttons) return; // throttle; ignore while dragging the camera
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const m = hitArea(e.clientX, e.clientY);
      if (m && !card.pinned) { showCard(m); cancelHide(); }
      else if (!m && areaHover && !card.pinned) scheduleHide();
      areaHover = m;
      renderer.domElement.style.cursor = m ? 'pointer' : '';
    });
  });
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('click', e => {
    const moved = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5; // a camera drag, not a click
    const m = moved ? null : hitArea(e.clientX, e.clientY);
    if (m) { showCard(m); card.pinned = true; $('card').classList.add('open'); return; }
    if (!moved) { hideCard(true); togglePicker(false); }
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches?.('input, select, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); if (e.target.matches?.('button')) e.target.blur(); setPlaying(!state.playing); }
    if (e.key === 'ArrowRight') setTime(state.t + DAY);
    if (e.key === 'ArrowLeft') setTime(state.t - DAY);
    if (e.key === 'Escape') { hideCard(true); togglePicker(false); }
  });
}

// ---------- main loop ----------

let lastFrame = performance.now(), lastUi = 0;
function frame(now) {
  const dt = (now - lastFrame) / 1000; lastFrame = now;
  if (state.playing) state.t += dt * DAY; // 1 day per second
  stepFly(now);
  controls.update();
  updateScene();
  updateMarkers();
  positionCard();
  if (state.playing && now - lastUi > 100) { lastUi = now; syncTime(); }
  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- start ----------

buildBodies();
PLANETS.forEach(makeTrail);
updateScene();
applyTheme(state.theme);
wireTime();
wirePanels();
if (window.innerWidth < 600 || EMBED) $('left-toggle').click(); // small screens and embeds: settings tucked away
if (EMBED) document.body.classList.add('embed');
resize();
// Initial view: close to the Moon, looking at the south pole with Earth's direction in mind.
{
  const toEarth = new THREE.Vector3(...sub(lastPos.earth, lastPos.moon)).normalize();
  camera.position.copy(toEarth.multiplyScalar(0.55).add(new THREE.Vector3(0, 0, -0.85)).normalize().multiplyScalar(6500));
}
syncTime();
requestAnimationFrame(frame);
loadMoon().catch(e => { $('loading').textContent = `Could not load Moon textures: ${e.message || e}`; });
Promise.all([loadSites(), loadHeights().catch(() => null)]).then(([sites]) => addSites(sites));
