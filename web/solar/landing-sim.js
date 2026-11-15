// Self-contained 3D SPLICE spacecraft descent simulation & telemetry diagram renderer for solar.html.
// Uses only standard Three.js primitives passed via `THREE` and unlit vertex-shaded materials
// because the main scene has no Three.js lights.

export const SIM_DURATION_S = 240;

export const PHASES = [
  { id: 'TRN', idx: 1, label: '01 · Approach (TRN)', short: 'TRN', startU: 0, endU: 0.30, color: '#38bdf8', note: 'Optical Terrain Relative Navigation pitchover' },
  { id: 'NDL', idx: 2, label: '02 · Braking (NDL)', short: 'NDL', startU: 0.30, endU: 0.62, color: '#f59e0b', note: '4-beam Doppler lidar powered deceleration' },
  { id: 'HDL', idx: 3, label: '03 · Hazard Scan (HDL)', short: 'HDL', startU: 0.62, endU: 0.84, color: '#a855f7', note: 'Flash lidar hazard scan & 500 m safe divert' },
  { id: 'DQG', idx: 4, label: '04 · Terminal (DQG)', short: 'DQG', startU: 0.84, endU: 1.00, color: '#22c55e', note: 'Vertical precision descent & soft touchdown' },
];

const MOON_RADIUS_KM = 1737.4;
const TOUCHDOWN_U = 0.995;
const MECO_U = 0.992;
const DIVERT_DN_KM = 0.16;
const DIVERT_CR_KM = -0.47370877; // hypot(0.16, 0.47370877) === 0.500 km (500 m SPLICE divert)
const VEL_SCALE = 1000 / SIM_DURATION_S; // converts d(km)/du into m/s

const clamp01 = v => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

function smooth5(t) {
  const x = clamp01(t);
  return x * x * x * (10 + x * (-15 + 6 * x));
}

function smooth5Deriv(t) {
  if (t <= 0 || t >= 1) return 0;
  return 30 * t * t * (1 - t) * (1 - t);
}

// C1 cubic Hermite spline evaluator across sorted { u, v, d } knots.
function evalHermite(u, knots) {
  if (u <= knots[0].u) return { v: knots[0].v, d: knots[0].d };
  const last = knots[knots.length - 1];
  if (u >= last.u) return { v: last.v, d: last.d };
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i], b = knots[i + 1];
    if (u <= b.u) {
      const h = b.u - a.u;
      const t = (u - a.u) / h;
      const t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      const dh00 = 6 * t2 - 6 * t;
      const dh10 = 3 * t2 - 4 * t + 1;
      const dh01 = -6 * t2 + 6 * t;
      const dh11 = 3 * t2 - 2 * t;
      return {
        v: h00 * a.v + h10 * h * a.d + h01 * b.v + h11 * h * b.d,
        d: (dh00 * a.v + dh10 * h * a.d + dh01 * b.v + dh11 * h * b.d) / h,
      };
    }
  }
  return { v: last.v, d: last.d };
}

const ALT_KNOTS = [
  { u: 0.000, v: 18.00, d: -36 / VEL_SCALE },
  { u: 0.300, v: 12.60, d: -23.52 },
  { u: 0.620, v: 2.35,  d: -12.72 },
  { u: 0.840, v: 0.42,  d: -4.32 },
  { u: TOUCHDOWN_U, v: 0.00, d: -0.8 / VEL_SCALE },
];

const DN_NOM_KNOTS = [
  { u: 0.000, v: 42.00, d: -100.3 },
  { u: 0.300, v: 14.90, d: -79.8 },
  { u: 0.620, v: 1.60,  d: -10.5 },
  { u: 0.840, v: 0.24,  d: -0.9 },
  { u: TOUCHDOWN_U, v: DIVERT_DN_KM, d: 0.0 },
];

const CR_NOM_KNOTS = [
  { u: 0.000, v: 3.00,  d: -Math.sqrt((420 / VEL_SCALE) ** 2 - 100.3 ** 2) },
  { u: 0.300, v: 0.80,  d: -5.50 },
  { u: 0.620, v: -0.34, d: -1.10 },
  { u: 0.840, v: -0.465, d: -0.15 },
  { u: TOUCHDOWN_U, v: DIVERT_CR_KM, d: 0.0 },
];

const PITCH_KNOTS = [
  { u: 0.000, v: 68.0, d: -10.0 },
  { u: 0.300, v: 62.0, d: -28.0 },
  { u: 0.620, v: 34.0, d: -95.0 },
  { u: 0.840, v: 10.0, d: -85.0 },
  { u: 0.940, v: 1.5,  d: -22.0 },
  { u: MECO_U, v: 0.0, d: 0.0 },
];

const THROTTLE_KNOTS = [
  { u: 0.000, v: 35.0, d: 40.0 },
  { u: 0.250, v: 48.0, d: 110.0 },
  { u: 0.340, v: 88.0, d: 80.0 },
  { u: 0.500, v: 94.0, d: 0.0 },
  { u: 0.620, v: 76.0, d: -110.0 },
  { u: 0.740, v: 58.0, d: -45.0 },
  { u: 0.840, v: 46.0, d: -55.0 },
  { u: 0.960, v: 30.0, d: -90.0 },
  { u: MECO_U, v: 0.0, d: 0.0 },
];

// Precompute cumulative propellant burn integral coupled directly to throttlePct so
// propellantPct transitions smoothly from 100% at u=0 to 28% at engine cutoff.
const PROP_LUT_N = 128;
const PROP_LUT = (() => {
  const cum = new Float64Array(PROP_LUT_N + 1);
  const du = 1 / PROP_LUT_N;
  let prev = evalHermite(0, THROTTLE_KNOTS).v;
  for (let i = 1; i <= PROP_LUT_N; i++) {
    const u = i * du;
    const cur = u >= MECO_U ? 0 : Math.max(0, evalHermite(u, THROTTLE_KNOTS).v);
    cum[i] = cum[i - 1] + 0.5 * (prev + cur) * du;
    prev = cur;
  }
  const total = cum[PROP_LUT_N] || 1;
  const out = new Float64Array(PROP_LUT_N + 1);
  for (let i = 0; i <= PROP_LUT_N; i++) {
    out[i] = 100 - 72 * (cum[i] / total);
  }
  return out;
})();

function evalPropellant(u) {
  if (u <= 0) return 100;
  if (u >= MECO_U) return 28;
  const f = u * PROP_LUT_N;
  const i0 = Math.min(PROP_LUT_N - 1, Math.floor(f));
  const t = f - i0;
  return PROP_LUT[i0] * (1 - t) + PROP_LUT[i0 + 1] * t;
}

function phaseFor(u) {
  for (let i = 0; i < PHASES.length - 1; i++) {
    if (u < PHASES[i].endU) return PHASES[i];
  }
  return PHASES[PHASES.length - 1];
}

/**
 * Evaluate the C1 lunar powered descent state at normalized mission progress `u` in [0, 1].
 */
export function evalDescentState(u) {
  const uc = clamp01(u);
  const tSec = uc * SIM_DURATION_S;
  const phase = phaseFor(uc);
  const landed = uc >= TOUCHDOWN_U;

  const alt = landed ? { v: 0, d: -0.8 / VEL_SCALE } : evalHermite(uc, ALT_KNOTS);
  const altKm = Math.max(0, alt.v);
  const altM = altKm * 1000;

  const divT = (uc - PHASES[2].startU) / (PHASES[2].endU - PHASES[2].startU);
  const divFrac = smooth5(divT);
  const divDeriv = smooth5Deriv(divT) / (PHASES[2].endU - PHASES[2].startU);

  let downrangeKm = 0;
  let crossrangeKm = 0;
  let horizVelMs = 0;
  let vertVelMs = 0.8;

  if (!landed) {
    const dnNom = evalHermite(uc, DN_NOM_KNOTS);
    const crNom = evalHermite(uc, CR_NOM_KNOTS);
    downrangeKm = dnNom.v - DIVERT_DN_KM * divFrac;
    crossrangeKm = crNom.v - DIVERT_CR_KM * divFrac;
    const dDn = dnNom.d - DIVERT_DN_KM * divDeriv;
    const dCr = crNom.d - DIVERT_CR_KM * divDeriv;
    horizVelMs = VEL_SCALE * Math.hypot(dDn, dCr);
    vertVelMs = Math.max(0.8, -VEL_SCALE * alt.d);
  }

  const totalVelMs = Math.hypot(horizVelMs, vertVelMs);
  const pitchDeg = uc >= MECO_U ? 0 : Math.max(0, evalHermite(uc, PITCH_KNOTS).v);
  const throttlePct = uc >= MECO_U ? 0 : Math.max(0, Math.min(100, evalHermite(uc, THROTTLE_KNOTS).v));
  const propellantPct = evalPropellant(uc);
  const divertOffsetM = 500 * divFrac;

  return {
    u: uc,
    tSec,
    phase,
    altKm,
    altM,
    downrangeKm,
    crossrangeKm,
    divertOffsetM,
    horizVelMs,
    vertVelMs,
    totalVelMs,
    pitchDeg,
    throttlePct,
    propellantPct,
    landed,
    ndlActive: uc >= 0.25 && uc < 0.96,
    hdlActive: uc >= 0.58 && uc < 0.92,
    plumeActive: uc > 0.02 && uc < MECO_U,
  };
}

// Bake directional pseudo-shading into geometry vertex colors so unlit meshes read clearly as 3D.
function applyVertexShading(THREE, geo, baseHex, topBoost = 1.15) {
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const count = geo.attributes.position.count;
  const col = new Float32Array(count * 3);
  const base = new THREE.Color(baseHex);
  const lightDir = new THREE.Vector3(0.55, 0.72, 0.42).normalize();
  const nVec = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    nVec.fromBufferAttribute(nrm, i).normalize();
    const ndl = nVec.dot(lightDir);
    const upBias = nVec.y > 0.7 ? topBoost : 1.0;
    const shade = Math.max(0.54, Math.min(1.18, (0.80 + 0.30 * ndl) * upBias));
    col[i * 3] = Math.min(1, base.r * shade);
    col[i * 3 + 1] = Math.min(1, base.g * shade);
    col[i * 3 + 2] = Math.min(1, base.b * shade);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function disposeObjectTree(root) {
  root.traverse(obj => {
    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
      obj.geometry.dispose();
    }
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        for (const m of obj.material) {
          if (m && typeof m.dispose === 'function') m.dispose();
        }
      } else if (typeof obj.material.dispose === 'function') {
        obj.material.dispose();
      }
    }
  });
}

function buildLanderMesh(THREE) {
  const craftGroup = new THREE.Group();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const addEdgedMesh = (geo, baseHex, edgeHex, edgeOpacity = 0.65, topBoost = 1.12) => {
    applyVertexShading(THREE, geo, baseHex, topBoost);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    if (edgeHex != null) {
      const edges = new THREE.EdgesGeometry(geo, 18);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: edgeHex, transparent: edgeOpacity < 1, opacity: edgeOpacity })
      );
      mesh.add(line);
    }
    return mesh;
  };

  // Footpad contact plane sits at local y = 0 so touchdown rests cleanly on the lunar surface.
  // Octagonal MLI gold foil descent stage (~0.9 km visual radius).
  const busGeo = new THREE.CylinderGeometry(0.84, 0.92, 0.88, 8);
  const bus = addEdgedMesh(busGeo, 0xd49b35, 0x5c3a0a, 0.85, 1.10);
  bus.position.y = 0.84;
  craftGroup.add(bus);

  // Dark charcoal SPLICE avionics deck atop descent stage.
  const deckGeo = new THREE.CylinderGeometry(0.62, 0.72, 0.34, 8);
  const deck = addEdgedMesh(deckGeo, 0x1e293b, 0x64748b, 0.80, 1.18);
  deck.position.y = 1.44;
  craftGroup.add(deck);

  // Forward optical TRN / HDL sensor pod on deck shoulder.
  const podGeo = new THREE.BoxGeometry(0.28, 0.22, 0.32);
  const pod = addEdgedMesh(podGeo, 0x334155, 0x94a3b8, 0.80, 1.12);
  pod.position.set(0, 1.44, 0.66);
  craftGroup.add(pod);

  const lensMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  lensMesh.rotation.x = Math.PI * 0.5;
  lensMesh.position.set(0, 1.44, 0.82);
  craftGroup.add(lensMesh);

  // Silver/white High-Gain Antenna (HGA) mast & parabolic dish.
  const mastGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.52, 8);
  const mast = addEdgedMesh(mastGeo, 0xcbd5e1, null, 1, 1.05);
  mast.position.set(-0.24, 1.85, -0.18);
  craftGroup.add(mast);

  const dishGroup = new THREE.Group();
  dishGroup.position.set(-0.24, 2.12, -0.18);
  dishGroup.rotation.set(0.35, 0, 0.22);

  const dishOuterGeo = new THREE.CylinderGeometry(0.46, 0.08, 0.16, 18, 1, true);
  applyVertexShading(THREE, dishOuterGeo, 0xe2e8f0, 1.12);
  const dishMesh = new THREE.Mesh(
    dishOuterGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide })
  );
  dishMesh.position.y = 0.08;
  dishGroup.add(dishMesh);

  const dishRim = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return new THREE.Vector3(0.46 * Math.cos(a), 0.16, 0.46 * Math.sin(a));
      })
    ),
    new THREE.LineBasicMaterial({ color: 0x94a3b8 })
  );
  dishGroup.add(dishRim);

  const feedHorn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.035, 0.24, 8),
    new THREE.MeshBasicMaterial({ color: 0x94a3b8 })
  );
  feedHorn.position.y = 0.16;
  dishGroup.add(feedHorn);
  craftGroup.add(dishGroup);

  // Two crisp photovoltaic solar wings extending along +/-X with deep sapphire cells & pale cyan frame.
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.78, 1.38, 0);

    const boom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8),
      new THREE.MeshBasicMaterial({ color: 0x94a3b8 })
    );
    boom.rotation.z = Math.PI * 0.5;
    boom.position.x = side * 0.17;
    wing.add(boom);

    const frameGeo = new THREE.BoxGeometry(1.56, 0.055, 0.76);
    const frame = addEdgedMesh(frameGeo, 0x0f172a, 0x67e8f9, 0.92, 1.05);
    frame.position.x = side * 1.06;
    wing.add(frame);

    const panelGeo = new THREE.BoxGeometry(1.46, 0.068, 0.66);
    applyVertexShading(THREE, panelGeo, 0x1d4ed8, 1.15);
    const panel = new THREE.Mesh(
      panelGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true })
    );
    panel.position.x = side * 1.06;
    wing.add(panel);

    // Subtle cell-rib highlight bars across the wing face.
    const ribPts = [];
    for (let k = -2; k <= 2; k++) {
      const rx = side * 1.06 + k * 0.28;
      ribPts.push(new THREE.Vector3(rx, 0.038, -0.32), new THREE.Vector3(rx, 0.038, 0.32));
    }
    wing.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(ribPts),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 })
    ));

    craftGroup.add(wing);
  }

  // 4 splayed landing struts + circular footpads anchored from hull down to y = 0.
  const strutMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1 });
  const padGeo = new THREE.CylinderGeometry(0.20, 0.25, 0.06, 12);
  applyVertexShading(THREE, padGeo, 0x94a3b8, 1.15);
  const padMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });

  const addStrut = (p0, p1, rTop, rBot) => {
    const dir = p1.clone().sub(p0);
    const len = dir.length();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 8), strutMat);
    cyl.position.copy(p0).addScaledVector(dir, 0.5);
    cyl.quaternion.setFromUnitVectors(yAxis, dir.normalize());
    craftGroup.add(cyl);
  };

  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const ca = Math.cos(a), sa = Math.sin(a);
    const foot = new THREE.Vector3(1.36 * ca, 0.03, 1.36 * sa);
    const hipUpper = new THREE.Vector3(0.84 * ca, 0.94, 0.84 * sa);
    const hipLower = new THREE.Vector3(0.88 * ca, 0.44, 0.88 * sa);

    addStrut(hipUpper, foot, 0.038, 0.032);
    addStrut(hipLower, foot, 0.032, 0.028);

    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(foot.x, 0.03, foot.z);
    craftGroup.add(pad);

    const padRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 12 }, (_, k) => {
          const pa = (k / 12) * Math.PI * 2;
          return new THREE.Vector3(foot.x + 0.25 * Math.cos(pa), 0.062, foot.z + 0.25 * Math.sin(pa));
        })
      ),
      new THREE.LineBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.75 })
    );
    craftGroup.add(padRing);
  }

  // Main engine nozzle bell underneath descent bus.
  const nozzleGeo = new THREE.CylinderGeometry(0.16, 0.34, 0.30, 16, 1, true);
  applyVertexShading(THREE, nozzleGeo, 0x334155, 1.0);
  const nozzle = new THREE.Mesh(
    nozzleGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide })
  );
  nozzle.position.y = 0.28;
  craftGroup.add(nozzle);

  const throatGlow = new THREE.Mesh(
    new THREE.CircleGeometry(0.30, 16),
    new THREE.MeshBasicMaterial({ color: 0xfef08a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  throatGlow.rotation.x = Math.PI * 0.5;
  throatGlow.position.y = 0.16;
  craftGroup.add(throatGlow);

  // Animated main engine plume anchored at nozzle exit (y = 0.14) pointing downward (-Y).
  const plumeGroup = new THREE.Group();
  plumeGroup.position.y = 0.14;

  const outerLen = 2.6;
  const outerGeo = new THREE.ConeGeometry(0.42, outerLen, 16, 1, true);
  outerGeo.rotateX(Math.PI);
  outerGeo.translate(0, -outerLen * 0.5, 0);
  const plumeOuterMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  plumeGroup.add(new THREE.Mesh(outerGeo, plumeOuterMat));

  const innerLen = 1.65;
  const innerGeo = new THREE.ConeGeometry(0.22, innerLen, 14);
  innerGeo.rotateX(Math.PI);
  innerGeo.translate(0, -innerLen * 0.5, 0);
  const plumeInnerMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  plumeGroup.add(new THREE.Mesh(innerGeo, plumeInnerMat));

  plumeGroup.visible = false;
  craftGroup.add(plumeGroup);

  return { craftGroup, plumeGroup, plumeOuterMat, plumeInnerMat, throatGlow };
}

/**
 * Create the Moon-fixed 3D landing trajectory, reticle, spacecraft model, engine plume,
 * NDL 4-beam Doppler lidar, and HDL hazard scan fan attached to `moonFrame`.
 */
export function createLanderSimulation(THREE, moonFrame) {
  const group = new THREE.Group();
  group.visible = false;
  moonFrame.add(group);

  const siteGroup = new THREE.Group();
  group.add(siteGroup);

  const { craftGroup, plumeGroup, plumeOuterMat, plumeInnerMat, throatGlow } = buildLanderMesh(THREE);
  group.add(craftGroup);

  // Dynamic NDL 4-beam Doppler lidar lines (4 segments = 8 vertices).
  const ndlPos = new Float32Array(8 * 3);
  const ndlGeo = new THREE.BufferGeometry();
  ndlGeo.setAttribute('position', new THREE.BufferAttribute(ndlPos, 3));
  const ndlMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const ndlBeams = new THREE.LineSegments(ndlGeo, ndlMat);
  ndlBeams.frustumCulled = false;
  ndlBeams.visible = false;
  group.add(ndlBeams);

  // Dynamic sweeping HDL flash-lidar scan cone (apex + 16-segment ground ellipse = 16 triangles = 48 vertices).
  const HDL_SEGS = 16;
  const hdlPos = new Float32Array(HDL_SEGS * 3 * 3);
  const hdlCol = new Float32Array(HDL_SEGS * 3 * 3);
  const hdlApexCol = new THREE.Color('#a855f7');
  const hdlBaseCol = new THREE.Color('#22c55e');
  for (let i = 0; i < HDL_SEGS; i++) {
    const b = i * 9;
    hdlCol[b] = hdlApexCol.r; hdlCol[b + 1] = hdlApexCol.g; hdlCol[b + 2] = hdlApexCol.b;
    hdlCol[b + 3] = hdlBaseCol.r; hdlCol[b + 4] = hdlBaseCol.g; hdlCol[b + 5] = hdlBaseCol.b;
    hdlCol[b + 6] = hdlBaseCol.r; hdlCol[b + 7] = hdlBaseCol.g; hdlCol[b + 8] = hdlBaseCol.b;
  }
  const hdlGeo = new THREE.BufferGeometry();
  hdlGeo.setAttribute('position', new THREE.BufferAttribute(hdlPos, 3));
  hdlGeo.setAttribute('color', new THREE.BufferAttribute(hdlCol, 3));
  const hdlMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const hdlScan = new THREE.Mesh(hdlGeo, hdlMat);
  hdlScan.frustumCulled = false;
  hdlScan.visible = false;
  group.add(hdlScan);

  let activeSite = null;
  let surfR = MOON_RADIUS_KM;
  const upVec = new THREE.Vector3(0, 0, 1);
  const eastVec = new THREE.Vector3(1, 0, 0);
  const northVec = new THREE.Vector3(0, 1, 0);
  const approachHorizVec = new THREE.Vector3();

  // Scratch vectors to avoid per-frame allocations during animation.
  const _dVec = new THREE.Vector3();
  const _p0 = new THREE.Vector3();
  const _p1 = new THREE.Vector3();
  const _radUp = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _xAxis = new THREE.Vector3();
  const _yAxis = new THREE.Vector3();
  const _zAxis = new THREE.Vector3();
  const _rotMat = new THREE.Matrix4();
  const _beamDir = new THREE.Vector3();
  const _beamHit = new THREE.Vector3();
  const _beamOrigin = new THREE.Vector3();
  const _scanCenter = new THREE.Vector3();
  const _ringA = new THREE.Vector3();
  const _ringB = new THREE.Vector3();

  // Map local tangent (downrangeKm, crossrangeKm) onto spherical altitude surfR + altKm
  // so trajectory points never dip below the curved 1737.4 km lunar sphere.
  function localToMoon(downrangeKm, crossrangeKm, altKm, rSurf = surfR, out = new THREE.Vector3()) {
    const azNorm = Math.hypot(0.88, 0.48);
    const c = 0.88 / azNorm;
    const s = 0.48 / azNorm;
    const nOff = -downrangeKm * c + crossrangeKm * s;
    const eOff = downrangeKm * s + crossrangeKm * c;
    _dVec.copy(northVec).multiplyScalar(nOff).addScaledVector(eastVec, eOff);
    out.copy(upVec).multiplyScalar(rSurf).add(_dVec).normalize().multiplyScalar(rSurf + altKm);
    return out;
  }

  function rebuildSiteGeometry() {
    disposeObjectTree(siteGroup);
    siteGroup.clear();

    const SAMPLES = 96;
    const trajPts = [];
    const trajCols = [];
    const groundPts = [];
    const colTmp = new THREE.Color();

    for (let i = 0; i < SAMPLES; i++) {
      const u = i / (SAMPLES - 1);
      const st = evalDescentState(u);
      trajPts.push(localToMoon(st.downrangeKm, st.crossrangeKm, st.altKm, surfR));
      groundPts.push(localToMoon(st.downrangeKm, st.crossrangeKm, 0.35, surfR));
      colTmp.set(st.phase.color);
      trajCols.push(colTmp.r, colTmp.g, colTmp.b);
    }

    const trajGeo = new THREE.BufferGeometry().setFromPoints(trajPts);
    trajGeo.setAttribute('color', new THREE.Float32BufferAttribute(trajCols, 3));
    siteGroup.add(new THREE.Line(
      trajGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.94 })
    ));

    // Surface ground-track projection at surfR + 0.35.
    const gndGeo = new THREE.BufferGeometry().setFromPoints(groundPts);
    const gndLine = new THREE.Line(
      gndGeo,
      new THREE.LineDashedMaterial({
        color: 0x7dd3fc,
        dashSize: 0.9,
        gapSize: 0.55,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      })
    );
    gndLine.computeLineDistances();
    siteGroup.add(gndLine);

    // 4 phase waypoint markers at each phase start.
    const wpCoreGeo = new THREE.SphereGeometry(0.30, 12, 10);
    const wpHaloGeo = new THREE.SphereGeometry(0.56, 12, 10);
    for (const p of PHASES) {
      const st = evalDescentState(p.startU);
      const wpPos = localToMoon(st.downrangeKm, st.crossrangeKm, st.altKm, surfR);
      const wpGroup = new THREE.Group();
      wpGroup.position.copy(wpPos);
      wpGroup.add(new THREE.Mesh(wpCoreGeo, new THREE.MeshBasicMaterial({ color: p.color })));
      wpGroup.add(new THREE.Mesh(
        wpHaloGeo,
        new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.24, depthWrite: false })
      ));
      siteGroup.add(wpGroup);
    }

    // Landing Zone Reticle & 500 m Divert Ring on the curved surface at surfR + 0.35.
    const makeSurfaceRing = (radiusKm, segs, hex, opacity) => {
      const pts = [];
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push(localToMoon(radiusKm * Math.cos(a), radiusKm * Math.sin(a), 0.35, surfR));
      }
      return new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false })
      );
    };

    // 500 m SPLICE divert radius ring + outer landing reticle ring.
    siteGroup.add(makeSurfaceRing(0.50, 48, 0xa855f7, 0.90));
    siteGroup.add(makeSurfaceRing(1.75, 64, 0x22c55e, 0.90));

    // Cardinal reticle crosshair ticks around target.
    const tickPts = [];
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      tickPts.push(
        localToMoon(0.75 * ca, 0.75 * sa, 0.35, surfR),
        localToMoon(2.35 * ca, 2.35 * sa, 0.35, surfR)
      );
    }
    siteGroup.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(tickPts),
      new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.85, depthWrite: false })
    ));

    // Subtle marker showing the nominal hazard spot avoided by the 500 m divert.
    const hazPts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      hazPts.push(localToMoon(DIVERT_DN_KM + 0.20 * Math.cos(a), DIVERT_CR_KM + 0.20 * Math.sin(a), 0.35, surfR));
    }
    siteGroup.add(new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(hazPts),
      new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.65, depthWrite: false })
    ));
  }

  function updateSensorEffects(s, clockMs) {
    // 4-beam NDL Doppler lidar pointing downward toward the surface ground track.
    ndlBeams.visible = Boolean(s.ndlActive);
    if (s.ndlActive) {
      _beamOrigin.copy(craftGroup.position).addScaledVector(_yAxis, 0.35);
      const surfRadius = surfR + 0.35;
      const posAttr = ndlGeo.attributes.position;
      const splayOffsets = [
        [0.16, 0.14],
        [0.16, -0.14],
        [-0.08, 0.18],
        [-0.08, -0.18],
      ];
      const pulse = 0.64 + 0.26 * Math.sin(clockMs * 0.014);
      ndlMat.opacity = pulse;

      for (let i = 0; i < 4; i++) {
        const [fSplay, xSplay] = splayOffsets[i];
        _beamDir
          .copy(_radUp).multiplyScalar(-1)
          .addScaledVector(_fwd, fSplay * (0.4 + 0.6 * (1 - s.u)))
          .addScaledVector(_xAxis, xSplay)
          .normalize();

        // Ray-sphere intersection from _beamOrigin along _beamDir onto sphere of radius surfRadius.
        const b = _beamOrigin.dot(_beamDir);
        const c = _beamOrigin.lengthSq() - surfRadius * surfRadius;
        const disc = Math.max(0, b * b - c);
        const tHit = Math.max(0.2, -b - Math.sqrt(disc));
        _beamHit.copy(_beamOrigin).addScaledVector(_beamDir, tHit);

        posAttr.setXYZ(i * 2, _beamOrigin.x, _beamOrigin.y, _beamOrigin.z);
        posAttr.setXYZ(i * 2 + 1, _beamHit.x, _beamHit.y, _beamHit.z);
      }
      posAttr.needsUpdate = true;
    }

    // Sweeping HDL flash-lidar scan cone onto the 500 m landing zone.
    hdlScan.visible = Boolean(s.hdlActive);
    if (s.hdlActive) {
      _beamOrigin.copy(craftGroup.position).addScaledVector(_yAxis, 1.35).addScaledVector(_zAxis, 0.72);
      const sweepDn = 0.42 * Math.sin(clockMs * 0.0042);
      const sweepCr = 0.42 * Math.cos(clockMs * 0.0067);
      const footprintR = 0.48;
      localToMoon(sweepDn, sweepCr, 0.35, surfR, _scanCenter);
      const posAttr = hdlGeo.attributes.position;

      for (let i = 0; i < HDL_SEGS; i++) {
        const a0 = (i / HDL_SEGS) * Math.PI * 2;
        const a1 = ((i + 1) / HDL_SEGS) * Math.PI * 2;
        localToMoon(sweepDn + footprintR * Math.cos(a0), sweepCr + footprintR * Math.sin(a0), 0.35, surfR, _ringA);
        localToMoon(sweepDn + footprintR * Math.cos(a1), sweepCr + footprintR * Math.sin(a1), 0.35, surfR, _ringB);

        const v = i * 3;
        posAttr.setXYZ(v, _beamOrigin.x, _beamOrigin.y, _beamOrigin.z);
        posAttr.setXYZ(v + 1, _ringA.x, _ringA.y, _ringA.z);
        posAttr.setXYZ(v + 2, _ringB.x, _ringB.y, _ringB.z);
      }
      posAttr.needsUpdate = true;
      hdlMat.opacity = 0.24 + 0.06 * Math.sin(clockMs * 0.009);
    }
  }

  function setProgress(u, clockMs = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    const s = evalDescentState(u);
    if (!activeSite) return s;

    localToMoon(s.downrangeKm, s.crossrangeKm, s.altKm, surfR, craftGroup.position);
    _radUp.copy(craftGroup.position).normalize();

    // Compute smooth forward flight tangent projected onto local horizontal plane,
    // blending smoothly toward approachHorizVec as horizontal speed approaches zero.
    const uA = Math.max(0, s.u - 0.004);
    const uB = Math.min(TOUCHDOWN_U - 0.001, s.u + 0.004);
    if (uB > uA + 1e-6 && s.horizVelMs > 0.25) {
      const sA = evalDescentState(uA);
      const sB = evalDescentState(uB);
      localToMoon(sA.downrangeKm, sA.crossrangeKm, sA.altKm, surfR, _p0);
      localToMoon(sB.downrangeKm, sB.crossrangeKm, sB.altKm, surfR, _p1);
      _fwd.copy(_p1).sub(_p0);
      _fwd.addScaledVector(_radUp, -_fwd.dot(_radUp));
    } else {
      _fwd.set(0, 0, 0);
    }
    _p0.copy(approachHorizVec).addScaledVector(_radUp, -approachHorizVec.dot(_radUp)).normalize();
    if (_fwd.lengthSq() < 1e-8) {
      _fwd.copy(_p0);
    } else {
      const wFwd = Math.min(1, s.horizVelMs / 12);
      _fwd.normalize().multiplyScalar(wFwd).addScaledVector(_p0, 1 - wFwd).normalize();
    }

    // Orient craft +Y along radialUp rotated forward along flight tangent by pitchDeg.
    const pitchRad = (s.pitchDeg * Math.PI) / 180;
    _xAxis.crossVectors(_radUp, _fwd).normalize();
    _yAxis.copy(_radUp).multiplyScalar(Math.cos(pitchRad)).addScaledVector(_fwd, Math.sin(pitchRad)).normalize();
    _zAxis.crossVectors(_xAxis, _yAxis).normalize();
    _rotMat.makeBasis(_xAxis, _yAxis, _zAxis);
    craftGroup.quaternion.setFromRotationMatrix(_rotMat);

    // Animate engine plume and nozzle throat glow from throttlePct & clockMs.
    if (s.plumeActive && s.throttlePct > 0.5) {
      const th = s.throttlePct / 100;
      const flicker = 1 + 0.08 * Math.sin(clockMs * 0.043) + 0.05 * Math.cos(clockMs * 0.097);
      const lenScale = (0.32 + 1.12 * th) * flicker;
      const radScale = (0.58 + 0.48 * th) * (0.96 + 0.04 * Math.sin(clockMs * 0.061));
      plumeGroup.visible = true;
      plumeGroup.scale.set(radScale, lenScale, radScale);
      plumeOuterMat.color.setHex(0x38bdf8).lerp(new THREE.Color(0xf59e0b), Math.min(1, th * 1.15));
      plumeOuterMat.opacity = Math.min(0.84, 0.24 + 0.56 * th);
      plumeInnerMat.opacity = Math.min(0.95, 0.35 + 0.58 * th);
      throatGlow.visible = true;
    } else {
      plumeGroup.visible = false;
      throatGlow.visible = false;
    }

    updateSensorEffects(s, clockMs);
    return s;
  }

  function reset(siteMarker, groundKm = 0) {
    if (!siteMarker || !siteMarker.normal) {
      activeSite = null;
      hide();
      return;
    }
    activeSite = siteMarker;
    surfR = MOON_RADIUS_KM + (Number.isFinite(groundKm) ? groundKm : 0);

    upVec.copy(siteMarker.normal).normalize();
    eastVec.set(-upVec.y, upVec.x, 0);
    if (eastVec.length() < 1e-5) eastVec.set(1, 0, 0);
    eastVec.normalize();
    northVec.crossVectors(upVec, eastVec).normalize();

    localToMoon(1, 0, 0, surfR, _p0);
    localToMoon(0, 0, 0, surfR, _p1);
    approachHorizVec.copy(_p1).sub(_p0).normalize();

    rebuildSiteGeometry();
    group.visible = true;
    setProgress(0);
  }

  function getCraftFramePos(targetVec) {
    if (targetVec && typeof targetVec.copy === 'function') {
      targetVec.copy(craftGroup.position);
      return targetVec;
    }
    return craftGroup.position.clone();
  }

  function hide() {
    group.visible = false;
  }

  function dispose() {
    moonFrame.remove(group);
    disposeObjectTree(group);
    activeSite = null;
  }

  return { group, reset, setProgress, getCraftFramePos, hide, dispose };
}

/**
 * Draw the Hi-DPI 2-panel landing telemetry diagram on `canvas`:
 *  - Top half: Altitude (0..18 km) vs Downrange (42..0 km) glide-slope profile
 *  - Bottom half: Velocity (m/s) & Engine Throttle (%) vs mission progress (0..100%)
 */
export function drawLandingDiagram(canvas, u, info = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const hasBox = canvas.clientWidth > 0 && canvas.clientHeight > 0;
  const dpr = hasBox ? Math.max(1, Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)) : 1;
  const w = hasBox ? canvas.clientWidth : (canvas.width || 320);
  const h = hasBox ? canvas.clientHeight : (canvas.height || 220);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cur = evalDescentState(u);
  const FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

  // Background fill.
  ctx.fillStyle = '#0b111d';
  ctx.fillRect(0, 0, w, h);

  const padL = 34;
  const padR = 32;
  const padT = 16;
  const gap = 22;
  const padB = 18;
  const plotW = Math.max(40, w - padL - padR);
  const availH = Math.max(80, h - padT - padB - gap);
  const topH = Math.round(availH * 0.52);
  const botT = padT + topH + gap;
  const botH = Math.max(26, Math.min(availH - topH - gap, h - 16 - botT));

  // Sample trajectory curve once for both plots.
  const N = 120;
  const samples = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    samples[i] = evalDescentState(i / N);
  }

  // ---------- TOP HALF: Altitude (0..18 km) vs Downrange (42..0 km) ----------
  const xDn = dn => padL + plotW * (1 - Math.max(0, Math.min(42, dn)) / 42);
  const yAlt = alt => padT + topH * (1 - Math.max(0, Math.min(18, alt)) / 18);

  // Subtle horizontal & vertical grid.
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  for (const aTick of [6, 12, 18]) {
    const yy = Math.round(yAlt(aTick)) + 0.5;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
  }
  for (const dTick of [30, 20, 10]) {
    const xx = Math.round(xDn(dTick)) + 0.5;
    ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + topH); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Filled lunar terrain baseline band along alt = 0 km.
  const groundY = padT + topH;
  ctx.fillStyle = '#131d30';
  ctx.beginPath();
  ctx.moveTo(padL, groundY + 6);
  for (let i = 0; i <= 40; i++) {
    const f = i / 40;
    const gx = padL + plotW * f;
    const ridge = Math.sin(f * 13.5) * 1.4 + Math.cos(f * 27) * 0.7;
    ctx.lineTo(gx, groundY - 2.5 + ridge);
  }
  ctx.lineTo(padL + plotW, groundY + 6);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, groundY + 0.5);
  ctx.lineTo(padL + plotW, groundY + 0.5);
  ctx.stroke();

  // Planned full glide-slope curve (translucent phase colors).
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.34;
  for (let i = 0; i < N; i++) {
    const a = samples[i], b = samples[i + 1];
    ctx.strokeStyle = b.phase.color;
    ctx.beginPath();
    ctx.moveTo(xDn(a.downrangeKm), yAlt(a.altKm));
    ctx.lineTo(xDn(b.downrangeKm), yAlt(b.altKm));
    ctx.stroke();
  }

  // Flown trajectory up to current u (crisp solid phase colors).
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.4;
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    if (u0 >= cur.u) break;
    const a = samples[i];
    const b = u1 <= cur.u ? samples[i + 1] : cur;
    ctx.strokeStyle = b.phase.color;
    ctx.beginPath();
    ctx.moveTo(xDn(a.downrangeKm), yAlt(a.altKm));
    ctx.lineTo(xDn(b.downrangeKm), yAlt(b.altKm));
    ctx.stroke();
  }

  // Phase transition waypoint pips on glide slope.
  for (const p of PHASES) {
    const wp = evalDescentState(p.startU);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(xDn(wp.downrangeKm), yAlt(wp.altKm), 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lidar beam hint projecting onto terrain when 0.30 <= u <= 0.90.
  const cxCraft = xDn(cur.downrangeKm);
  const cyCraft = yAlt(cur.altKm);
  if (cur.u >= 0.30 && cur.u <= 0.90) {
    const beamCol = cur.u >= 0.62 ? 'rgba(168, 85, 247, 0.38)' : 'rgba(56, 189, 248, 0.36)';
    const edgeCol = cur.u >= 0.62 ? 'rgba(34, 197, 94, 0.55)' : 'rgba(56, 189, 248, 0.62)';
    const spread = Math.max(4, Math.min(18, (groundY - cyCraft) * 0.42));
    const leadX = Math.min(padL + plotW, cxCraft + 6);
    ctx.fillStyle = beamCol;
    ctx.beginPath();
    ctx.moveTo(cxCraft, cyCraft);
    ctx.lineTo(Math.max(padL, leadX - spread), groundY);
    ctx.lineTo(Math.min(padL + plotW, leadX + spread), groundY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = edgeCol;
    ctx.lineWidth = 0.9;
    for (const sOff of [-spread, -spread * 0.33, spread * 0.33, spread]) {
      ctx.beginPath();
      ctx.moveTo(cxCraft, cyCraft);
      ctx.lineTo(Math.max(padL, Math.min(padL + plotW, leadX + sOff)), groundY);
      ctx.stroke();
    }
  }

  // Target touchdown pin at (0 km downrange, 0 km alt).
  const tx = xDn(0);
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(tx, groundY - 9);
  ctx.lineTo(tx, groundY);
  ctx.stroke();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(tx, groundY - 9, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Live animated lander reticle.
  ctx.fillStyle = cur.phase.color;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.arc(cxCraft, cyCraft, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cxCraft, cyCraft, 4.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = cur.phase.color;
  ctx.beginPath();
  ctx.arc(cxCraft, cyCraft, 2.1, 0, Math.PI * 2);
  ctx.fill();

  // Top plot labels & readouts.
  ctx.font = `600 8.5px ${FONT}`;
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  const hdr = w < 290 ? 'ALT vs DOWNRANGE' : 'ALTITUDE vs DOWNRANGE';
  ctx.fillText(hdr, padL, 10);

  ctx.textAlign = 'right';
  ctx.fillStyle = cur.phase.color;
  ctx.fillText(`${cur.phase.short} · ${cur.altKm.toFixed(1)}km · ${cur.downrangeKm.toFixed(1)}km`, padL + plotW, 10);

  ctx.font = `500 8px ${FONT}`;
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.fillText('18k', padL - 4, padT + 6);
  ctx.fillText('0', padL - 4, groundY + 2);
  ctx.textAlign = 'left';
  ctx.fillText('42km', padL, groundY + 11);
  ctx.textAlign = 'right';
  ctx.fillText('0km', padL + plotW, groundY + 11);

  // ---------- BOTTOM HALF: Velocity (m/s) & Engine Throttle (%) vs 0..100% ----------
  const xU = uv => padL + plotW * clamp01(uv);
  const yVel = v => botT + botH * (1 - Math.max(0, Math.min(440, v)) / 440);
  const yThr = p => botT + botH * (1 - Math.max(0, Math.min(100, p)) / 100);

  // Subtle phase background bands & dividers.
  for (const p of PHASES) {
    const x0 = xU(p.startU), x1 = xU(p.endU);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.05;
    ctx.fillRect(x0, botT, x1 - x0, botH);
    ctx.globalAlpha = 1;

    if (p.startU > 0) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x0) + 0.5, botT);
      ctx.lineTo(Math.round(x0) + 0.5, botT + botH);
      ctx.stroke();
    }

    ctx.font = `600 7.5px ${FONT}`;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.78;
    ctx.textAlign = 'center';
    ctx.fillText(p.short, (x0 + x1) * 0.5, botT + 9);
    ctx.globalAlpha = 1;
  }

  // Bottom plot frame lines.
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(padL + 0.5, botT + 0.5, plotW - 1, botH - 1);

  // Throttle (%) area + curve in #f59e0b.
  ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
  ctx.beginPath();
  ctx.moveTo(xU(0), botT + botH);
  for (let i = 0; i <= N; i++) {
    ctx.lineTo(xU(samples[i].u), yThr(samples[i].throttlePct));
  }
  ctx.lineTo(xU(1), botT + botH);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const px = xU(samples[i].u), py = yThr(samples[i].throttlePct);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Velocity (m/s) curve in #38bdf8.
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const px = xU(samples[i].u), py = yVel(samples[i].totalVelMs);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Vertical current-time cursor & live intersection markers.
  const curX = xU(cur.u);
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(curX, botT);
  ctx.lineTo(curX, botT + botH);
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(curX, yVel(cur.totalVelMs), 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(curX, yThr(cur.throttlePct), 2.6, 0, Math.PI * 2);
  ctx.fill();

  // Bottom plot axis ticks & live readouts.
  ctx.font = `500 8px ${FONT}`;
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'right';
  ctx.fillText('440', padL - 4, botT + 6);
  ctx.fillStyle = '#64748b';
  ctx.fillText('0', padL - 4, botT + botH);

  ctx.fillStyle = '#f59e0b';
  ctx.textAlign = 'left';
  ctx.fillText('100%', padL + plotW + 4, botT + 6);
  ctx.fillStyle = '#64748b';
  ctx.fillText('0%', padL + plotW + 4, botT + botH);

  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'left';
  ctx.fillText(`VEL ${Math.round(cur.totalVelMs)}m/s`, padL, botT + botH + 12);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText(`THR ${Math.round(cur.throttlePct)}%`, padL + 74, botT + botH + 12);
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'right';
  ctx.fillText(`T+${Math.round(cur.tSec)}s (${Math.round(cur.u * 100)}%)`, padL + plotW, botT + botH + 12);
}
