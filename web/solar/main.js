// 3D view: the Moon at the centre of a true-scale Solar System, landing sites, trails, time control.
// Rendering is unlit (no light sources, no shadow maps). The Moon uses one cheap dot product with
// the real Sun direction and a LOLA-derived normal map for day/night and relief.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as E from './ephem.js?v=20261115q';
import { SITE_INFO } from './site-info.js?v=20261115q';
import { PLANET_INFO } from './planet-info.js?v=20261115q';

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
const PICKABLE_BODIES = ['sun', 'moon', ...PLANETS];
const TRAIL_ARC = 0.28, TRAIL_N = 128;

const FALLBACK_PLANET_INFO = {
  sun: {
    type: 'G-type Main-Sequence Star', radiusKm: 695700, gravity: '274.0 m/s²', period: '—',
    summary: 'Central star containing 99.86% of the solar system mass, providing heat and illumination.',
    missionNote: 'Solar flux powers photovoltaic arrays for south pole landers during unshadowed periods.'
  },
  moon: {
    type: 'Planetary-Mass Satellite', radiusKm: 1737.4, gravity: '1.62 m/s²', period: '27.32 d',
    summary: 'Earth’s tidally-locked satellite with an axial tilt of 1.54° relative to the ecliptic normal.',
    missionNote: 'Exploration target for Artemis and CLPS missions targeting south pole volatile deposits.'
  },
  mercury: {
    type: 'Terrestrial Planet', radiusKm: 2439.7, gravity: '3.70 m/s²', period: '87.97 d',
    summary: 'Innermost rocky planet in a 3:2 spin-orbit resonance with extreme diurnal temperature swings.',
    missionNote: 'Visited by Mariner 10 and MESSENGER; BepiColombo currently en route.'
  },
  venus: {
    type: 'Terrestrial Planet', radiusKm: 6051.8, gravity: '8.87 m/s²', period: '224.70 d',
    summary: 'Dense runaway greenhouse atmosphere with 92 bar surface pressure and clouds of sulfuric acid.',
    missionNote: 'Subject of Venera and Magellan missions; DAVINCI and VERITAS scheduled for launch.'
  },
  earth: {
    type: 'Terrestrial Planet', radiusKm: 6371.0, gravity: '9.81 m/s²', period: '365.26 d',
    summary: 'Dense water-rich terrestrial planet supporting life with an active biosphere and magnetosphere.',
    missionNote: 'Direct-to-Earth (DTE) radio links require uninterrupted line-of-sight from lunar lander masts.'
  },
  mars: {
    type: 'Terrestrial Planet', radiusKm: 3389.5, gravity: '3.72 m/s²', period: '686.98 d',
    summary: 'Cold desert world with large shield volcanoes, deep canyons, and carbon dioxide polar ice caps.',
    missionNote: 'Under continuous surface and orbital study by robotic landers, rovers, and orbiters.'
  },
  jupiter: {
    type: 'Gas Giant', radiusKm: 69911, gravity: '24.79 m/s²', period: '4332.59 d',
    summary: 'Largest planet in the Solar System, with deep hydrogen atmosphere and Great Red Spot storm.',
    missionNote: 'Explored by Galileo and Juno; ESA JUICE and Europa Clipper en route.'
  },
  saturn: {
    type: 'Gas Giant', radiusKm: 58232, gravity: '10.44 m/s²', period: '10759.22 d',
    summary: 'Ringed gas giant with thousands of thin icy ringlets and ocean-bearing moons Titan and Enceladus.',
    missionNote: 'Explored by Cassini-Huygens for 13 years; Dragonfly mission to Titan under development.'
  },
  uranus: {
    type: 'Ice Giant', radiusKm: 25362, gravity: '8.69 m/s²', period: '30688.5 d',
    summary: 'Ice giant tilted 97.8° onto its orbital plane with a dynamic atmosphere and pale cyan hue.',
    missionNote: 'Encountered by Voyager 2 in 1986; identified as top priority for future flagship mission.'
  },
  neptune: {
    type: 'Ice Giant', radiusKm: 24622, gravity: '11.15 m/s²', period: '60182 d',
    summary: 'Outermost planet featuring supersonic retrograde winds and cryovolcanic retrograde moon Triton.',
    missionNote: 'Encountered by Voyager 2 in 1989; tracked via Hubble and James Webb Space Telescope.'
  }
};
function getPlanetInfo(key) {
  return (typeof PLANET_INFO !== 'undefined' && PLANET_INFO?.[key]) || FALLBACK_PLANET_INFO[key] || {};
}

const state = {
  t: Date.now(),
  playing: false,
  theme: 'dark',
  camFocus: 'moon',
  activeSite: null,
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
controls.enablePan = false;            // target tracks Moon, Earth, or Sun cleanly
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.zoomSpeed = 1.6;
controls.minDistance = MOON_R + 12;
controls.maxDistance = 3e10;
controls.addEventListener('start', () => { fly = null; });

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
moonMesh.userData.bodyKey = 'moon';
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
const MOON_ORBIT_N = 360, MOON_SIDEREAL = 27.3217;
const MOON_TRAIL_N = 64, MOON_TRAIL_DAYS = 7.5;
let moonOrbit = null, moonTrail = null;
function makeLabel(text, color, key) {
  const el = document.createElement('div');
  el.className = 'plabel';
  el.innerHTML = `<span class="plabel-tag" data-body="${esc(key)}"><i style="background:${color};color:${color}"></i>${esc(text)}</span>`;
  const tag = el.querySelector('.plabel-tag');
  tag.addEventListener('pointerenter', () => {
    if ($('opt-planet-hover')?.checked && !card.pinned) {
      showPlanetCard(key);
      cancelHide();
    }
  });
  tag.addEventListener('pointerleave', () => {
    if ($('opt-planet-hover')?.checked && !card.pinned) {
      scheduleHide();
    }
  });
  tag.addEventListener('click', e => {
    e.stopPropagation();
    if ($('opt-planet-hover')?.checked) {
      showPlanetCard(key);
      card.pinned = true;
      $('card').classList.add('open');
    }
  });
  return new CSS2DObject(el);
}

function buildBodies() {
  // Sun: a plain bright sphere plus a soft additive glow sprite.
  const sun = new THREE.Mesh(new THREE.SphereGeometry(E.BODIES.sun.radius, 64, 32), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
  sun.userData.bodyKey = 'sun';
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gg = gc.getContext('2d'), grad = gg.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,220,140,0.9)'); grad.addColorStop(0.3, 'rgba(255,190,80,0.35)'); grad.addColorStop(1, 'rgba(255,160,40,0)');
  gg.fillStyle = grad; gg.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(E.BODIES.sun.radius * 8);
  sun.add(glow);
  const sunLabel = makeLabel('Sun', '#ffd36b', 'sun'); sun.add(sunLabel);
  scene.add(sun);
  bodies.sun = { obj: sun, label: sunLabel };

  const moonLabel = makeLabel('Moon', '#d9d9d9', 'moon'); scene.add(moonLabel);
  bodies.moon = { label: moonLabel };
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOON_ORBIT_N * 3), 3));
  moonOrbit = new THREE.LineLoop(mg, new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.48, depthWrite: false, depthTest: true }));
  moonOrbit.frustumCulled = false;
  scene.add(moonOrbit);

  const mtg = new THREE.BufferGeometry();
  mtg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOON_TRAIL_N * 3), 3));
  const mtc = new Float32Array(MOON_TRAIL_N * 4);
  for (let i = 0; i < MOON_TRAIL_N; i++) mtc.set([0.88, 0.92, 0.98, (i / (MOON_TRAIL_N - 1)) ** 1.6 * 0.85], i * 4);
  mtg.setAttribute('color', new THREE.BufferAttribute(mtc, 4));
  moonTrail = new THREE.Line(mtg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  moonTrail.frustumCulled = false;
  scene.add(moonTrail);

  for (const key of PLANETS) {
    const b = E.BODIES[key];
    const mat = planetMaterial(planetTexture(key, b.color));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 64, 32), mat);
    mesh.userData.bodyKey = key;
    // Tilt: SphereGeometry poles are on +y; rotate +y onto the planet's pole.
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleFromRaDec(...POLES[key]));
    if (key === 'saturn') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(74500, 136780, 128),
        new THREE.MeshBasicMaterial({ color: 0xcdbb94, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }));
      ring.rotation.x = Math.PI / 2; // ring plane = planet equator (xz of the sphere)
      mesh.add(ring);
    }
    const label = makeLabel(b.name, b.color, key);
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
  for (let i = 0; i < TRAIL_N; i++) { col.set([c.r, c.g, c.b, (i / (TRAIL_N - 1)) ** 1.6 * 0.78], i * 4); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  line.frustumCulled = false;
  helio.add(line);
  trailLines[key] = line;
}

function updateTrails(d, pos) {
  for (const key of PLANETS) {
    const arr = trailLines[key].geometry.attributes.position;
    const span = E.BODIES[key].periodDays * TRAIL_ARC;
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const p = E.bodyHelio(key, d - span + i * span / (TRAIL_N - 1));
      arr.setXYZ(i, p[0], p[1], p[2]);
    }
    const pFin = (pos && pos[key]) ? pos[key] : E.bodyHelio(key, d);
    arr.setXYZ(TRAIL_N - 1, pFin[0], pFin[1], pFin[2]);
    arr.needsUpdate = true;
  }
}

let orbitsFor = null;
function updateOrbits(d) {
  if (orbitsFor !== null && Math.abs(d - orbitsFor) < 0.25) return;
  orbitsFor = d;
  for (const key of PLANETS) {
    let pts;
    try {
      pts = E.planetOrbit(key, d, 1080);
    } catch {
      pts = E.planetOrbit(key === 'earth' ? 'emb' : key, d, 1080);
    }
    if (!orbitLines[key]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0x7a8396, transparent: true, opacity: 0.36, depthWrite: false }));
      line.frustumCulled = false;
      helio.add(line);
      orbitLines[key] = line;
    } else {
      if (orbitLines[key].geometry.attributes.position.array.length !== pts.length) {
        orbitLines[key].geometry.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      } else {
        orbitLines[key].geometry.attributes.position.array.set(pts);
        orbitLines[key].geometry.attributes.position.needsUpdate = true;
      }
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
const card = { m: null, bodyKey: null, pinned: false, timer: 0 };

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
  } else if (info?.text) {
    items = info.text.split(/(?<=\.)\s+|;\s+/).map(t => t.replace(/\.$/, '')).filter(Boolean).slice(0, 3)
      .map(t => t.charAt(0).toUpperCase() + t.slice(1));
  } else {
    const [cls, label] = statusOf(m.site);
    items = [`${m.site.mission} exploration site`, `Coordinates: ${fmtLoc(m.site)}`, `Status: ${label}`];
  }
  if (!items.length) return '';
  const title = m.cat === 'hist' ? 'About this landing' : 'Why here';
  return `<div class="why"><div class="sec">${title}</div><ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
}

// Live conditions from our server (same numbers as the analysis page), fetched on first hover, cached.
// Falls back cleanly to instantaneous & 30-day ephem.js geometry so the Date window indicator and mini-diagram always appear immediately.
const condCache = new Map();
const condResolved = new Map();
// Same server choice as the analysis page: ?api=… or the saved address, else this page's server.
const API_BASE = (new URLSearchParams(location.search).get('api') ?? localStorage.getItem('navApi') ?? '').replace(/\/$/, '');
function condUrl(s) {
  const start = new Date(state.t).toISOString().slice(0, 10);
  return { key: `${s.lat_deg},${s.lon_deg},${start}`, url: `${API_BASE}/api/track?${new URLSearchParams({ lat: s.lat_deg, lon: s.lon_deg, start, days: 30, step_min: 60 })}` };
}

function getActiveLiveData(site, ms) {
  if (!site) return null;
  for (const data of condResolved.values()) {
    if (!data?.points?.length) continue;
    if (Math.abs(data._lat - site.lat_deg) < 1e-4 && Math.abs(data._lon - site.lon_deg) < 1e-4) {
      const t0 = Date.parse(data.points[0].t);
      const t1 = Date.parse(data.points[data.points.length - 1].t);
      if (ms >= t0 && ms <= t1) return data;
    }
  }
  return null;
}

const fmtDur = h => (h == null ? '—' : h < 48 ? `${Math.round(h)} h` : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`);
const shortUtcDate = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function siteWinPoint(latDeg, lonDeg, ms) {
  const d = E.daysSinceJ2000(ms);
  const pos = E.allHelio(d), o = E.moonOrientation(d);
  const rz = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
  const rx = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
  const toEl = target => {
    const dir = [target[0] - pos.moon[0], target[1] - pos.moon[1], target[2] - pos.moon[2]];
    const n = Math.hypot(...dir) || 1;
    const u = rz(rx(rz(dir.map(v => v / n), -o.node), -o.incl), -o.w);
    const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
    const dot = u[0] * Math.cos(lat) * Math.cos(lon) + u[1] * Math.cos(lat) * Math.sin(lon) + u[2] * Math.sin(lat);
    return Math.asin(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
  };
  const sunEl = toEl(pos.sun), earthEl = toEl(pos.earth);
  const sunOk = sunEl > -0.26, earthOk = earthEl > 0;
  return { sunEl, earthEl, sunOk, earthOk, open: sunOk && earthOk };
}

function siteWinSeries(latDeg, lonDeg, startMs, days = 30) {
  const stepH = 8, n = Math.round((days * 24) / stepH) + 1;
  const pts = [];
  let sunHits = 0, earthHits = 0, curDark = 0, maxDark = 0, sunsetH = null, sunriseH = null;
  for (let i = 0; i < n; i++) {
    const t = startMs + i * stepH * 36e5;
    const p = siteWinPoint(latDeg, lonDeg, t);
    if (p.sunOk) { sunHits++; curDark = 0; if (sunriseH === null && i > 0 && !pts[i - 1].sun_vis) sunriseH = i * stepH; }
    else { curDark += stepH; maxDark = Math.max(maxDark, curDark); if (sunsetH === null && i > 0 && pts[i - 1].sun_vis) sunsetH = i * stepH; }
    if (p.earthOk) earthHits++;
    pts.push({ t: new Date(t).toISOString(), sun: { el_deg: p.sunEl }, earth: { el_deg: p.earthEl }, sun_vis: p.sunOk ? 1 : 0, earth_vis: p.earthOk ? 1 : 0 });
  }
  return {
    points: pts,
    source: 'ephem',
    summary: {
      sun_visible_pct: 100 * sunHits / n,
      earth_visible_pct: 100 * earthHits / n,
      longest_night_hours: maxDark,
      hours_to_sunset: sunsetH,
      hours_to_sunrise: sunriseH,
    },
  };
}

function evalWindowNow(m, liveData) {
  const live = liveData || getActiveLiveData(m.site, state.t);
  let pt = null;
  if (live?.points?.length) {
    let bestDiff = Infinity;
    for (const p of live.points) {
      const df = Math.abs(Date.parse(p.t) - state.t);
      if (df < bestDiff) { bestDiff = df; pt = p; }
    }
    if (bestDiff > 6 * 36e5) pt = null;
  }
  const sunOk = pt ? pt.sun_vis > 0 : siteWinPoint(m.site.lat_deg, m.site.lon_deg, state.t).sunOk;
  const earthOk = pt ? pt.earth_vis >= 0.5 : siteWinPoint(m.site.lat_deg, m.site.lon_deg, state.t).earthOk;
  const open = sunOk && earthOk;
  const reason = open ? 'Window open' : (!sunOk && !earthOk ? 'No Sun · No DTE' : !sunOk ? 'No Sun' : 'Low DTE');
  return { open, sunOk, earthOk, reason };
}

function drawCardDiagram(canvas, series, nowMs) {
  if (!canvas || !series?.points?.length) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 290, h = canvas.clientHeight || 62;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pts = series.points, n = pts.length;
  const plotLeft = 28, right = 4, W = w - plotLeft - right, chartTop = 3, chartBot = 28;
  let lo = -3, hi = 3;
  for (const p of pts) { lo = Math.min(lo, p.sun.el_deg, p.earth.el_deg); hi = Math.max(hi, p.sun.el_deg, p.earth.el_deg); }
  const y = v => chartTop + (chartBot - chartTop) * (hi - v) / Math.max(1, hi - lo);
  const x = i => plotLeft + W * i / Math.max(1, n - 1);
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.setLineDash([2, 2]);
  g.beginPath(); g.moveTo(plotLeft, y(0)); g.lineTo(w - right, y(0)); g.stroke();
  g.setLineDash([]);
  const plot = (fn, col) => {
    g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(x(i), y(fn(p))) : g.moveTo(x(i), y(fn(p)))));
    g.stroke();
  };
  plot(p => p.earth.el_deg, '#38bdf8');
  plot(p => p.sun.el_deg, '#f59e0b');
  const rows = [
    ['SUN', '#f59e0b', p => p.sun_vis > 0 ? 'rgba(245,158,11,0.85)' : null],
    ['DTE', '#38bdf8', p => p.earth_vis >= 0.5 ? 'rgba(56,189,248,0.85)' : null],
    ['WIN', '#34d399', p => (p.sun_vis > 0 && p.earth_vis >= 0.5) ? '#10b981' : 'rgba(239,68,68,0.32)'],
  ];
  g.font = '600 7.5px "JetBrains Mono", monospace';
  rows.forEach(([lbl, tc, colFn], r) => {
    const top = 33 + r * 9;
    g.fillStyle = tc; g.fillText(lbl, 3, top + 4.8);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(plotLeft, top, W, 5);
    for (let i = 0; i < n; i++) {
      const c = colFn(pts[i]); if (!c) continue;
      g.fillStyle = c;
      const x0 = x(i - 0.5), x1 = x(i + 0.5);
      const rx0 = Math.max(plotLeft, x0), rx1 = Math.min(w - right, x1 + 0.5);
      if (rx1 > rx0) g.fillRect(rx0, top, rx1 - rx0, 5);
    }
  });
  const t0 = Date.parse(pts[0].t), t1 = Date.parse(pts[n - 1].t);
  if (nowMs >= t0 && nowMs <= t1 && t1 > t0) {
    const cx = plotLeft + W * (nowMs - t0) / (t1 - t0);
    g.strokeStyle = 'rgba(248,250,252,0.85)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx, 2); g.lineTo(cx, h - 2); g.stroke();
  }
}

function verdictOf(sum) { // interim rule shared with the analysis page: Sun % and Earth %
  const rank = v => (v >= 70 ? 0 : v >= 50 ? 1 : 2), rankE = v => (v >= 50 ? 0 : v >= 30 ? 1 : 2);
  const r = Math.max(rank(sum.sun_visible_pct), rankE(sum.earth_visible_pct));
  return [['good', 'Good site'], ['marginal', 'Marginal site'], ['poor', 'Poor site']][r];
}
function condHtml(sum, srcLabel) {
  const [vcls, vword] = verdictOf(sum);
  const setFirst = sum.hours_to_sunset != null && (sum.hours_to_sunrise == null || sum.hours_to_sunset < sum.hours_to_sunrise);
  const next = setFirst ? `Sunset in ${fmtDur(sum.hours_to_sunset)}` : sum.hours_to_sunrise != null ? `Sunrise in ${fmtDur(sum.hours_to_sunrise)}` : 'No sunrise/sunset in window';
  return `<div class="verdict ${vcls}"><i></i>${vword} <small>for a solar-powered lander</small></div>
    <canvas class="card-diagram" aria-label="30-day visibility and landing window diagram"></canvas>
    <div class="card-diag-note"><span>Now .. +30d · Sun · DTE · Win</span> <span>${esc(srcLabel)}</span></div>
    <dl><dt>Sunlight</dt><dd>${(+sum.sun_visible_pct).toFixed(0)}% of the time</dd>
    <dt>Earth in view</dt><dd>${(+sum.earth_visible_pct).toFixed(0)}% (direct radio link)</dd>
    <dt>Longest night</dt><dd>${fmtDur(sum.longest_night_hours)}</dd>
    <dt>Next</dt><dd>${next}</dd></dl>`;
}

function updateCardWindow() {
  const m = card.m || state.activeSite;
  const db = $('date-btn');
  if (!m || card.bodyKey) {
    db.classList.remove('win-open', 'win-closed');
    return;
  }
  const live = getActiveLiveData(m.site, state.t);
  const w = evalWindowNow(m, live);
  db.classList.toggle('win-open', w.open);
  db.classList.toggle('win-closed', !w.open);
  const dd = $('card-date');
  if (dd && card.m) {
    const info = SITE_INFO[m.site.mission] || {};
    const statusLabel = w.open ? `Window open · ${shortUtcDate(state.t)}` : `${w.reason} · ${shortUtcDate(state.t)}`;
    dd.innerHTML = `<span class="win-pill ${w.open ? 'open' : 'closed'}"><i></i>${esc(statusLabel)}</span> <span>${esc(fmtDate(info.date))}</span>`;
  }
}

function updateMoonSummary() {
  const summaryEl = $('moon-summary');
  if (!summaryEl) return;
  const cats = { hist: $('cat-hist')?.checked, planned: $('cat-planned')?.checked, cand: $('cat-cand')?.checked };
  const enabled = siteMarkers.filter(m => cats[m.cat]);
  if (card.m) {
    const live = getActiveLiveData(card.m.site, state.t);
    const w = evalWindowNow(card.m, live);
    summaryEl.innerHTML = `<strong>${esc(card.m.site.name)}</strong>: ${w.open ? '<span class="open-count">Window Open</span>' : `<span style="color:#f87171">${esc(w.reason)}</span>`}`;
    return;
  }
  if (!enabled.length) {
    summaryEl.innerHTML = 'No site categories active';
    return;
  }
  let openCount = 0;
  for (const m of enabled) {
    if (siteWinPoint(m.site.lat_deg, m.site.lon_deg, state.t).open) openCount++;
  }
  summaryEl.innerHTML = `<span class="open-count">${openCount} / ${enabled.length}</span> sites open at current UTC`;
}

async function loadConditions(m) {
  const { key, url } = condUrl(m.site);
  const body = () => (card.m === m ? $('card').querySelector('.cond-body') : null);
  // Instant 0ms ephemeris estimate + 30-day diagram right on hover
  const fallback = siteWinSeries(m.site.lat_deg, m.site.lon_deg, state.t, 30);
  if (body()) {
    body().innerHTML = condHtml(fallback.summary, 'ephem preview');
    drawCardDiagram(body().querySelector('.card-diagram'), fallback, state.t);
  }
  updateCardWindow();
  updateMoonSummary();
  try {
    if (!condCache.has(key)) condCache.set(key, fetch(url, { signal: AbortSignal.timeout(4000) }).then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status)))));
    const data = await condCache.get(key);
    data._lat = m.site.lat_deg;
    data._lon = m.site.lon_deg;
    condResolved.set(key, data);
    if (body()) {
      body().innerHTML = condHtml(data.summary, 'LOLA + DE440s');
      drawCardDiagram(body().querySelector('.card-diagram'), data, state.t);
    }
    updateCardWindow();
    updateMoonSummary();
  } catch {
    condCache.delete(key);
  }
}

function showCard(m) {
  const s = m.site, [cls, label] = statusOf(s), info = SITE_INFO[s.mission] || {};
  const c = $('card');
  if (card.m !== m) {
    card.m = m;
    card.bodyKey = null;
    card.pinned = false;
    state.activeSite = m;
    siteMarkers.forEach(x => x.el.classList.toggle('active', x === m));
    c.className = `glass ${cls}`;
    c.style.removeProperty('--c');
    c.innerHTML = `
      <span class="status">${esc(label)}</span>
      <h3>${esc(s.name)}</h3>
      <dl>
        <dt>Mission</dt><dd>${esc(s.mission.replace(/\s*\(.*\)$/, ''))}</dd>
        <dt>Date</dt><dd id="card-date">${esc(fmtDate(info.date))}</dd>
        <dt>Location</dt><dd>${fmtLoc(s)}</dd>
        ${m.cat === 'cand' ? '<dt>Area</dt><dd>~15 × 15 km NASA candidate region (shaded on the surface)</dd>' : ''}
        ${m.cat === 'planned' ? '<dt>Area</dt><dd>illustrative 5 km radius (no published landing ellipse)</dd>' : ''}
        ${m.cat === 'hist' ? '<dt>Area</dt><dd>illustrative ~1 km around the landing point</dd>' : ''}
      </dl>
      ${whyHtml(m, info)}
      <div class="cond"><div class="sec">Conditions, next 30 days</div><div class="cond-body">Computing…</div></div>
      <div class="actions">
        <button class="text" data-fly>Fly to site</button>
        <a class="text" data-horizon href="index.html?lat=${s.lat_deg}&lon=${s.lon_deg}">${EMBED ? 'Analyse this site ↑' : 'Horizon & Stats ↗'}</a>
      </div>
      <div class="more"><div>
        ${info.text ? `<p>${esc(info.text)}</p>` : ''}
        ${s.coord_note ? `<p>${esc(s.coord_note)}</p>` : ''}
        ${!info.text && !s.coord_note ? `<p>${esc(s.mission)} — target coordinates ${fmtLoc(s)}.</p>` : ''}
      </div></div>
      <div class="hint">Click to expand background</div>`;
    loadConditions(m);
    if (EMBED) c.querySelector('[data-horizon]').onclick = e => {
      e.preventDefault(); e.stopPropagation();
      window.parent.postMessage({ type: 'lunar-nav:site', lat: s.lat_deg, lon: s.lon_deg, name: s.name }, location.origin);
    };
    c.querySelector('[data-fly]').onclick = e => {
      e.stopPropagation();
      state.activeSite = m;
      hideCard(true); // preserves state.activeSite for #date-btn
      setActiveCam('moon');
      const rel = camera.position.distanceTo(controls.target);
      flyTo(m.normal.clone().applyMatrix4(new THREE.Matrix4().extractRotation(moonFrame.matrix)), Math.min(rel, MOON_R + Math.max(20, 20 * (AREA[m.cat]?.size ?? 7.5))), 'moon');
    };
    c.hidden = false;
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  }
  positionCard();
  updateMoonSummary();
}

function showPlanetCard(key) {
  if (!$('opt-planet-hover')?.checked) return;
  const b = E.BODIES[key];
  if (!b) return;
  const pInfo = getPlanetInfo(key);
  const c = $('card');
  card.m = null;
  card.bodyKey = key;
  card.pinned = false;
  siteMarkers.forEach(x => x.el.classList.remove('active'));
  $('date-btn').classList.remove('win-open', 'win-closed');

  c.className = 'glass';
  c.style.setProperty('--c', b.color || 'var(--accent)');

  const p = key === 'sun' ? [0, 0, 0] : (lastPos?.[key] || [0, 0, 0]);
  const rSun = Math.hypot(...p);
  const pEarth = lastPos?.earth || [0, 0, 0];
  const rEarth = Math.hypot(p[0] - pEarth[0], p[1] - pEarth[1], p[2] - pEarth[2]);
  const pMoon = lastPos?.moon || [0, 0, 0];
  const rMoon = Math.hypot(p[0] - pMoon[0], p[1] - pMoon[1], p[2] - pMoon[2]);

  let earthRow = '';
  if (key === 'earth') {
    earthRow = `<dt>From Moon</dt><dd>${(rMoon / 1000).toFixed(0)}k km</dd>`;
  } else if (key === 'moon') {
    earthRow = `<dt>From Earth</dt><dd>${(rMoon / 1000).toFixed(0)}k km</dd>`;
  } else {
    earthRow = `<dt>From Earth</dt><dd>${(rEarth / E.AU_KM).toFixed(3)} AU · ${(rEarth / 1e6).toFixed(1)} M km</dd>`;
  }

  const sunRow = key === 'sun'
    ? '<dt>From Sun</dt><dd>0 AU (System Center)</dd>'
    : `<dt>From Sun</dt><dd>${(rSun / E.AU_KM).toFixed(3)} AU · ${(rSun / 1e6).toFixed(1)} M km</dd>`;

  const rad = b.radius ?? pInfo.radiusKm;
  const radStr = rad ? `${rad.toLocaleString()} km` : '—';
  const perStr = pInfo.period || (b.periodDays ? `${b.periodDays.toFixed(1)} d` : '—');

  c.innerHTML = `
    <span class="status">${esc(pInfo.type || 'Celestial Body')}</span>
    <h3>${esc(b.name)}</h3>
    <dl>
      <dt>Date</dt><dd id="card-date">${esc(shortUtcDate(state.t))}</dd>
      ${sunRow}
      ${earthRow}
      <dt>Period</dt><dd>${esc(perStr)}</dd>
      <dt>Radius</dt><dd>${esc(radStr)}</dd>
      <dt>Gravity</dt><dd>${esc(pInfo.gravity || '—')}</dd>
    </dl>
    <div class="why">
      <div class="sec">Summary</div>
      <p style="margin:4px 0 0;font-size:12px;line-height:1.45;color:#cbd5e1;">${esc(pInfo.summary || '')}</p>
      ${pInfo.missionNote ? `<p style="margin:6px 0 0;font-size:11.5px;line-height:1.4;color:var(--muted);">${esc(pInfo.missionNote)}</p>` : ''}
    </div>
    <div class="actions" style="margin-top:10px;">
      <button class="text" data-focus-body="${esc(key)}" style="background:var(--text);color:var(--bg);font-weight:600;width:100%;text-align:center;">Focus camera</button>
    </div>
    <div class="hint">Click to pin</div>
  `;

  c.querySelector('[data-focus-body]').onclick = e => {
    e.stopPropagation();
    if (key === 'moon') cameraPreset('moon', lastPos);
    else if (key === 'earth') cameraPreset('earth', lastPos);
    else if (['mercury', 'venus', 'mars', 'sun'].includes(key)) cameraPreset('inner', lastPos);
    else cameraPreset('all', lastPos);
  };

  c.hidden = false;
  c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  positionCard();
}

function hideCard(force) {
  if (card.pinned && !force) return;
  card.m = null;
  card.bodyKey = null;
  card.pinned = false;
  $('card').hidden = true;
  siteMarkers.forEach(x => x.el.classList.remove('active'));
  updateCardWindow();
  updateMoonSummary();
}
function scheduleHide() { cancelHide(); card.timer = setTimeout(() => hideCard(false), 320); }
function cancelHide() { clearTimeout(card.timer); }

const _v = new THREE.Vector3();
function positionCard() {
  if (!card.m && !card.bodyKey) return;
  const c = $('card');
  const W = view.clientWidth, H = view.clientHeight;
  const cw = c.offsetWidth || 318, ch = c.offsetHeight || 160;

  let x, y;
  if (card.bodyKey) {
    if (card.bodyKey === 'moon') _v.set(0, 0, 0);
    else if (bodies[card.bodyKey]?.obj) bodies[card.bodyKey].obj.getWorldPosition(_v);
    else return;
    _v.project(camera);
    if (_v.z < -1 || _v.z > 1) { c.hidden = true; return; }
    c.hidden = false;
    x = (_v.x + 1) / 2 * W; y = (1 - _v.y) / 2 * H;
  } else {
    card.m.obj.getWorldPosition(_v).project(camera);
    x = (_v.x + 1) / 2 * W; y = (1 - _v.y) / 2 * H;
  }

  const topEl = $('top');
  const minTop = Math.max(46, topEl && !topEl.classList.contains('closed') ? topEl.getBoundingClientRect().bottom + 10 : 46);
  const panel = $('left'), vr = view.getBoundingClientRect();
  const minLeft = panel && !panel.classList.contains('collapsed') ? panel.getBoundingClientRect().right - vr.left + 8 : 12;

  const sheet = W < 600 || W - minLeft < cw + 8;
  c.classList.toggle('sheet', sheet);
  if (sheet) { c.classList.remove('dock-side', 'below'); c.style.left = ''; c.style.top = ''; return; }

  // When inspecting Moon surface markers on desktop, dock #card outside the Moon limb so sibling sites never get covered.
  if (card.m && !card.bodyKey && W >= 820) {
    const camDist = camera.position.length();
    const mProj = _v.set(0, 0, 0).project(camera);
    const moonCx = (mProj.x + 1) / 2 * W;
    const halfFov = (camera.fov * Math.PI / 180) * 0.5;
    const moonR = halfFov > 0 ? (H * 0.5) * (MOON_R / Math.max(MOON_R + 1, camDist * Math.tan(halfFov))) : 180;
    const rightSlot = Math.max(x + 24, moonCx + moonR + 18);
    const leftSlot = Math.min(x - cw - 24, moonCx - moonR - 18 - cw);
    let sideLeft = Math.min(W - cw - 14, rightSlot);
    if (sideLeft < minLeft && leftSlot >= minLeft) sideLeft = leftSlot;
    sideLeft = Math.max(minLeft, Math.min(W - cw - 14, sideLeft));
    const sideTop = Math.max(minTop, Math.min(H - ch - 12, y - ch * 0.45));
    c.classList.remove('below');
    c.classList.add('dock-side');
    c.style.left = `${Math.round(sideLeft)}px`;
    c.style.top = `${Math.round(sideTop)}px`;
    return;
  }

  c.classList.remove('dock-side');
  c.style.left = `${Math.max(minLeft + cw / 2, Math.min(W - cw / 2 - 8, x))}px`;

  const above = (y - ch - 14 >= minTop);
  c.classList.toggle('below', !above);

  const topY = above ? Math.max(minTop + ch + 14, Math.min(H - 12, y)) : Math.max(minTop + 8, Math.min(H - ch - 22, y));
  c.style.top = `${topY}px`;
}

// ---------- camera moves ----------

let fly = null;
function setActiveCam(name) {
  document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('active', b.dataset.cam === name));
}
function focusPoint(focus = state.camFocus, pos = lastPos) {
  if (!pos) return new THREE.Vector3();
  if (focus === 'earth') return new THREE.Vector3(...sub(pos.earth, pos.moon));
  if (focus === 'sun') return new THREE.Vector3(...sub(pos.sun, pos.moon));
  return new THREE.Vector3();
}
function flyTo(dir, dist, focus = state.camFocus, ms = 1200) {
  state.camFocus = focus;
  controls.minDistance = focus === 'moon' ? MOON_R + 12 : focus === 'earth' ? 30000 : 3e6;
  const fromOffset = camera.position.clone().sub(controls.target);
  fly = { fromOffset, fromTarget: controls.target.clone(), toDir: dir.clone().normalize(), toDist: dist, t0: performance.now(), ms };
}
function stepFly(now) {
  if (!fly) return;
  const k = Math.min(1, (now - fly.t0) / fly.ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  const targetNow = focusPoint();
  controls.target.lerpVectors(fly.fromTarget, targetNow, e);
  const d0 = Math.max(1, fly.fromOffset.length()), d1 = fly.toDist;
  const dir = fly.fromOffset.clone().normalize().lerp(fly.toDir, e).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, d0 * (d1 / d0) ** e);
  if (k >= 1) fly = null;
}

function cameraPreset(name, pos) {
  setActiveCam(name);
  const toEarth = new THREE.Vector3(...sub(pos.earth, pos.moon)).normalize();
  const side = new THREE.Vector3().crossVectors(toEarth, new THREE.Vector3(0, 0, 1)).normalize();
  if (name === 'moon') flyTo(toEarth.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 0, -0.85)), 6500, 'moon');
  if (name === 'earth') flyTo(side.clone().multiplyScalar(-0.7).add(toEarth.clone().multiplyScalar(-0.55)).add(new THREE.Vector3(0, 0, 0.72)), 1.25e6, 'earth');
  if (name === 'inner') flyTo(new THREE.Vector3(0.15, -0.45, 1), 6.2e8, 'sun');
  if (name === 'all') flyTo(new THREE.Vector3(0.08, -0.38, 1), 1.05e10, 'sun');
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

  // Seamless closed Moon orbit around Earth entering directly into the Moon center.
  const mo = moonOrbit.geometry.attributes.position, em = sub(pos.earth, moon);
  for (let i = 0; i < MOON_ORBIT_N; i++) {
    if (i === 0) {
      mo.setXYZ(0, 0, 0, 0);
      continue;
    }
    const u = i / MOON_ORBIT_N;
    const w = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const gf = E.moonGeo(d + u * MOON_SIDEREAL);
    const gb = E.moonGeo(d - (1 - u) * MOON_SIDEREAL);
    mo.setXYZ(i, em[0] + gf[0] * (1 - w) + gb[0] * w, em[1] + gf[1] * (1 - w) + gb[1] * w, em[2] + gf[2] * (1 - w) + gb[2] * w);
  }
  mo.needsUpdate = true;

  const mt = moonTrail.geometry.attributes.position;
  for (let i = 0; i < MOON_TRAIL_N - 1; i++) {
    const g = E.moonGeo(d - MOON_TRAIL_DAYS + MOON_TRAIL_DAYS * i / (MOON_TRAIL_N - 1));
    mt.setXYZ(i, em[0] + g[0], em[1] + g[1], em[2] + g[2]);
  }
  mt.setXYZ(MOON_TRAIL_N - 1, 0, 0, 0);
  mt.needsUpdate = true;

  if (!fly) {
    const curTarget = focusPoint();
    camera.position.add(curTarget.clone().sub(controls.target));
    controls.target.copy(curTarget);
  }

  // Dim unrelated outer planet orbits cleanly when inspecting Earth–Moon close up.
  const isEarthFocus = state.camFocus === 'earth';
  for (const key of PLANETS) {
    if (orbitLines[key]) orbitLines[key].material.opacity = isEarthFocus ? (key === 'earth' ? 0.2 : 0.1) : 0.36;
  }

  if (lastTrailT === null || Math.abs(state.t - lastTrailT) > 36e5) { updateTrails(d, pos); lastTrailT = state.t; }
  updateOrbits(d);
}

function updateMarkers() {
  const rot = new THREE.Matrix4().extractRotation(moonFrame.matrix);
  const camDir = camera.position.clone();
  const distMoon = camera.position.length();
  const distTarget = camera.position.distanceTo(controls.target);
  const near = distMoon < MOON_R * 40;
  const cats = { hist: $('cat-hist').checked, planned: $('cat-planned').checked, cand: $('cat-cand').checked };
  for (const m of siteMarkers) {
    const wn = m.normal.clone().applyMatrix4(rot);
    const p = wn.clone().multiplyScalar(MOON_R);
    const toCam = camDir.clone().sub(p).normalize();
    m.facing = wn.dot(toCam) > 0.06; // far side and grazing limb
    const closeUp = m.area && distMoon < MOON_R + 60 * (AREA[m.cat]?.size ?? 7.5); // up close the patch is the landing zone
    m.obj.visible = near && cats[m.cat] && m.facing && !closeUp;
    if (m.area) m.area.visible = cats[m.cat]; // depth test hides areas on the far side
  }
  if (card.m && !(card.m.facing && cats[card.m.cat])) hideCard(true);
  const labelsOn = $('opt-labels').checked;
  for (const key of ['sun', 'moon', ...PLANETS]) bodies[key].label.visible = false;
  if (labelsOn) {
    const W = view.clientWidth, H = view.clientHeight;
    const placed = [];
    const order = state.camFocus === 'earth'
      ? ['earth', 'moon', 'sun']
      : (state.camFocus === 'sun' && distTarget > 2.5e9)
        ? ['sun', 'jupiter', 'saturn', 'uranus', 'neptune', 'earth', 'mars', 'venus', 'mercury']
        : ['sun', 'earth', 'mars', 'venus', 'mercury', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon'];
    const tmp = new THREE.Vector3();
    for (const key of order) {
      if (key === 'moon' && distMoon < MOON_R * 40) continue;
      if (key === 'moon' && state.camFocus === 'sun') continue;
      if (key === 'moon' || key === 'sun' || PLANETS.includes(key)) {
        if (key === 'moon') tmp.set(0, 0, 0);
        else bodies[key].obj.getWorldPosition(tmp);
        tmp.project(camera);
        if (tmp.z < -1 || tmp.z > 1) continue;
        const sx = (tmp.x * 0.5 + 0.5) * W, sy = (-tmp.y * 0.5 + 0.5) * H;
        if (sx < -40 || sx > W + 40 || sy < -20 || sy > H + 20) continue;
        if (placed.some(([px, py]) => Math.abs(sx - px) < 64 && Math.abs(sy - py) < 16)) continue;
        placed.push([sx, sy]);
        bodies[key].label.visible = true;
      }
    }
  }
  moonOrbit.visible = $('opt-orbits').checked;
  moonTrail.visible = $('opt-trails').checked && distMoon > MOON_R * 12;
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
  updateCardWindow();
  updateMoonSummary();
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
  $('opt-planet-hover').onchange = () => {
    const on = $('opt-planet-hover').checked;
    document.body.classList.toggle('planet-hover', on);
    if (!on && card.bodyKey) hideCard(true);
  };
  document.body.classList.toggle('planet-hover', $('opt-planet-hover').checked);

  ['cat-hist', 'cat-planned', 'cat-cand'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', () => updateMoonSummary());
  });

  document.querySelectorAll('[data-cam]').forEach(b => (b.onclick = () => cameraPreset(b.dataset.cam, lastPos)));
  const c = $('card');
  c.addEventListener('pointerenter', cancelHide);
  c.addEventListener('pointerleave', scheduleHide);
  c.addEventListener('click', e => { e.stopPropagation(); card.pinned = true; c.classList.add('open'); });

  // Hover and click on shaded landing areas or celestial bodies
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let areaHover = null, down = null, pending = false;
  const hitArea = (x, y) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(areaMeshes.filter(a => a.parent && a.parent.visible), false)[0];
    return hit ? hit.object.userData.site : null;
  };

  const pickBodyAt = (clientX, clientY) => {
    if (!$('opt-planet-hover')?.checked) return null;
    const r = renderer.domElement.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    const distMoon = camera.position.length();

    // 1. Check screen distance to projected body centers (16 px radius)
    let closestKey = null, closestDist = 16;
    const tmp = new THREE.Vector3();
    for (const key of ['sun', 'moon', ...PLANETS]) {
      if (key === 'moon' && distMoon <= MOON_R * 8) continue;
      if (key === 'moon') tmp.set(0, 0, 0);
      else if (bodies[key]?.obj) bodies[key].obj.getWorldPosition(tmp);
      else continue;
      tmp.project(camera);
      if (tmp.z < -1 || tmp.z > 1) continue;
      const sx = (tmp.x * 0.5 + 0.5) * r.width;
      const sy = (-tmp.y * 0.5 + 0.5) * r.height;
      const d = Math.hypot(px - sx, py - sy);
      if (d < closestDist) {
        closestDist = d;
        closestKey = key;
      }
    }
    if (closestKey) return closestKey;

    // 2. Raycast against body meshes
    ndc.set((px / r.width) * 2 - 1, -(py / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const pickMeshes = [bodies.sun?.obj, moonMesh, ...PLANETS.map(k => bodies[k]?.obj)].filter(Boolean);
    const hits = ray.intersectObjects(pickMeshes, true);
    for (const hit of hits) {
      let cur = hit.object;
      while (cur && !cur.userData?.bodyKey) cur = cur.parent;
      const k = cur?.userData?.bodyKey;
      if (k === 'moon' && distMoon <= MOON_R * 8) continue;
      if (k) return k;
    }
    return null;
  };

  renderer.domElement.addEventListener('pointermove', e => {
    if (pending || e.buttons) return; // throttle; ignore while dragging the camera
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const m = hitArea(e.clientX, e.clientY);
      if (m && !card.pinned) {
        showCard(m); cancelHide();
        renderer.domElement.style.cursor = 'pointer';
      } else if (!m && $('opt-planet-hover')?.checked) {
        const bodyKey = pickBodyAt(e.clientX, e.clientY);
        if (bodyKey && !card.pinned) {
          showPlanetCard(bodyKey); cancelHide();
          renderer.domElement.style.cursor = 'pointer';
        } else {
          if (!card.pinned && (areaHover || card.bodyKey)) scheduleHide();
          renderer.domElement.style.cursor = '';
        }
      } else {
        if (!card.pinned && (areaHover || card.bodyKey)) scheduleHide();
        renderer.domElement.style.cursor = '';
      }
      areaHover = m;
    });
  });
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('click', e => {
    const moved = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5;
    if (moved) return;
    const m = hitArea(e.clientX, e.clientY);
    if (m) { showCard(m); card.pinned = true; $('card').classList.add('open'); return; }
    if ($('opt-planet-hover')?.checked) {
      const bodyKey = pickBodyAt(e.clientX, e.clientY);
      if (bodyKey) { showPlanetCard(bodyKey); card.pinned = true; $('card').classList.add('open'); return; }
    }
    state.activeSite = null;
    hideCard(true);
    togglePicker(false);
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches?.('input, select, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); if (e.target.matches?.('button')) e.target.blur(); setPlaying(!state.playing); }
    if (e.key === 'ArrowRight') setTime(state.t + DAY);
    if (e.key === 'ArrowLeft') setTime(state.t - DAY);
    if (e.key === 'Escape') { state.activeSite = null; hideCard(true); togglePicker(false); }
  });
}

// ---------- main loop ----------

let lastFrame = performance.now(), lastUi = 0;
function frame(now) {
  const dt = (now - lastFrame) / 1000; lastFrame = now;
  if (state.playing) state.t += dt * DAY; // 1 day per second
  updateScene();
  stepFly(now);
  controls.update();
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
setActiveCam('moon');
if (window.innerWidth < 600 || EMBED) $('left-toggle').click(); // small screens and embeds: settings tucked away
if (window.innerWidth >= 720 && !EMBED) {
  $('top').classList.remove('closed');
  $('top-toggle').setAttribute('aria-expanded', 'true');
  $('top-toggle').setAttribute('aria-label', 'Hide time controls');
}
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
loadSites().then(sites => {
  addSites(sites);
  loadHeights().catch(() => null).then(() => {
    for (const m of siteMarkers) {
      const h = heightKm(m.site.lat_deg, m.site.lon_deg);
      m.obj.position.copy(m.normal).multiplyScalar(MOON_R + h + 0.3);
      if (m.area) {
        moonFrame.remove(m.area);
        m.area = makeArea(m);
      }
    }
  });
});
