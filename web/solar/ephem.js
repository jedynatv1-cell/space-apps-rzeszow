// Lightweight ephemeris for the 3D view (visual accuracy, not mission accuracy).
// Planets: JPL "Approximate Positions of the Planets" (Standish), Table 1, valid 1800-2050,
//   heliocentric ecliptic J2000, errors of order arcminutes for the inner planets.
// Moon: Meeus, Astronomical Algorithms ch. 47, main periodic terms (~0.1° / ~100 km).
// Moon orientation: Cassini's laws (mean libration only). Units: km, degrees, days.
// The sky plot and metrics come from the Rust server (ANISE/DE440s); this file only drives the 3D scene.

export const AU_KM = 149597870.7;
export const EARTH_MOON_MASS_RATIO = 81.30057;
const D2R = Math.PI / 180;

// [a (AU), e, I, L, long.peri, long.node] and their rates per Julian century.
const ELEMENTS = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
            [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
            [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  emb:     [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
            [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
            [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
            [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
            [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
            [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
            [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
};

export const BODIES = {
  sun:     { name: 'Sun', radius: 695700, color: '#ffcc55' },
  mercury: { name: 'Mercury', radius: 2439.7, color: '#9c948c', periodDays: 87.97 },
  venus:   { name: 'Venus', radius: 6051.8, color: '#e3c58f', periodDays: 224.70 },
  earth:   { name: 'Earth', radius: 6371.0, color: '#3d7bd9', periodDays: 365.256 },
  mars:    { name: 'Mars', radius: 3389.5, color: '#c1440e', periodDays: 686.98 },
  jupiter: { name: 'Jupiter', radius: 69911, color: '#d8b48a', periodDays: 4332.59 },
  saturn:  { name: 'Saturn', radius: 58232, color: '#e6d29a', periodDays: 10759.22 },
  uranus:  { name: 'Uranus', radius: 25362, color: '#9fd8e0', periodDays: 30688.5 },
  neptune: { name: 'Neptune', radius: 24622, color: '#4b70dd', periodDays: 60182 },
  moon:    { name: 'Moon', radius: 1737.4, color: '#bbbbbb' },
};

/** Days since J2000.0 (2000-01-01 12:00 TT; UTC-TT offset of ~69 s ignored). */
export const daysSinceJ2000 = ms => (ms - Date.UTC(2000, 0, 1, 12)) / 864e5;

const norm360 = x => ((x % 360) + 360) % 360;

/** Solved eccentric anomaly (radians) for planet elKey at epoch d. */
export function solveE(elKey, d) {
  const T = d / 36525, [el, rt] = ELEMENTS[elKey];
  const e = el[1] + rt[1] * T;
  const L = el[3] + rt[3] * T, wbar = el[4] + rt[4] * T;
  let M = norm360(L - wbar); if (M > 180) M -= 360; M *= D2R;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** Heliocentric ecliptic J2000 position [x, y, z] in km. key: a planet or 'emb'. */
export function planetHelio(key, d) {
  const T = d / 36525, [el, rt] = ELEMENTS[key];
  const a = el[0] + rt[0] * T, e = el[1] + rt[1] * T, I = (el[2] + rt[2] * T) * D2R;
  const wbar = el[4] + rt[4] * T, node = el[5] + rt[5] * T;
  const w = (wbar - node) * D2R, O = node * D2R;
  const E = solveE(key, d);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return [
    AU_KM * ((cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp),
    AU_KM * ((cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp),
    AU_KM * ((sw * sI) * xp + (cw * sI) * yp),
  ];
}

/** Closed Keplerian orbit ellipse (km, ecliptic J2000) for planet key at epoch d. */
export function planetOrbit(key, d, n = 1080) {
  const elKey = key === 'earth' ? 'emb' : key;
  const T = d / 36525, [el, rt] = ELEMENTS[elKey];
  const a = el[0] + rt[0] * T, e = el[1] + rt[1] * T, I = (el[2] + rt[2] * T) * D2R;
  const wbar = el[4] + rt[4] * T, node = el[5] + rt[5] * T;
  const w = (wbar - node) * D2R, O = node * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  const b = Math.sqrt(1 - e * e);
  const E0 = solveE(elKey, d);

  let dx = 0, dy = 0, dz = 0;
  if (key === 'earth') {
    const mg = moonGeo(d), f = 1 / (1 + EARTH_MOON_MASS_RATIO);
    dx = -mg[0] * f;
    dy = -mg[1] * f;
    dz = -mg[2] * f;
  }

  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const E = E0 + (2 * Math.PI * i) / n;
    const xp = a * (Math.cos(E) - e), yp = a * b * Math.sin(E);
    pts[i * 3]     = AU_KM * ((cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp) + dx;
    pts[i * 3 + 1] = AU_KM * ((cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp) + dy;
    pts[i * 3 + 2] = AU_KM * ((sw * sI) * xp + (cw * sI) * yp) + dz;
  }
  return pts;
}

// Meeus ch. 47 terms: [D, M, M', F, coeff]
const LON = [[0,0,1,0,6288774],[2,0,-1,0,1274027],[2,0,0,0,658314],[0,0,2,0,213618],[0,1,0,0,-185116],
  [0,0,0,2,-114332],[2,0,-2,0,58793],[2,-1,-1,0,57066],[2,0,1,0,53322],[2,-1,0,0,45758],[0,1,-1,0,-40923],
  [1,0,0,0,-34720],[0,1,1,0,-30383],[2,0,0,-2,15327],[0,0,1,2,-12528],[0,0,1,-2,10980],[4,0,-1,0,10675],
  [0,0,3,0,10034],[4,0,-2,0,8548],[2,1,-1,0,-7888],[2,1,0,0,-6766],[1,0,-1,0,-5163],[1,1,0,0,4987],[2,-1,1,0,4036]];
const DIST = [[0,0,1,0,-20905355],[2,0,-1,0,-3699111],[2,0,0,0,-2955968],[0,0,2,0,-569925],[0,1,0,0,48888],
  [0,0,0,2,-3149],[2,0,-2,0,246158],[2,-1,-1,0,-152138],[2,0,1,0,-170733],[2,-1,0,0,-204586],[0,1,-1,0,-129620],
  [1,0,0,0,108743],[0,1,1,0,104755],[2,0,0,-2,10321],[0,0,1,-2,79661],[4,0,-1,0,-34782],[0,0,3,0,-23210],
  [4,0,-2,0,-21636],[2,1,-1,0,24208],[2,1,0,0,30824],[1,0,-1,0,-8379],[1,1,0,0,-16675],[2,-1,1,0,-12831]];
const LAT = [[0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],[2,0,-1,1,55413],
  [2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],[2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],
  [2,0,-2,-1,4324],[2,0,1,1,4200]];

function moonArgs(d) {
  const T = d / 36525;
  return {
    T,
    Lp: 218.3164477 + 481267.88123421 * T,
    D: 297.8501921 + 445267.1114034 * T,
    M: 357.5291092 + 35999.0502909 * T,
    Mp: 134.9633964 + 477198.8675055 * T,
    F: 93.2720950 + 483202.0175233 * T,
    node: 125.0445479 - 1934.1362891 * T,
  };
}

/** Geocentric Moon, ecliptic J2000 [x, y, z] km. */
export function moonGeo(d) {
  const A = moonArgs(d);
  const arg = t => (t[0] * A.D + t[1] * A.M + t[2] * A.Mp + t[3] * A.F) * D2R;
  let sl = 0, sr = 0, sb = 0;
  for (const t of LON) sl += t[4] * Math.sin(arg(t));
  for (const t of DIST) sr += t[4] * Math.cos(arg(t));
  for (const t of LAT) sb += t[4] * Math.sin(arg(t));
  const lon = (A.Lp + sl / 1e6 - 1.3969713 * A.T) * D2R; // of-date -> J2000 (precession in longitude)
  const lat = (sb / 1e6) * D2R, r = 385000.56 + sr / 1000;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
}

/** Heliocentric positions (km, ecliptic J2000) of every body at day d. */
export function allHelio(d) {
  const emb = planetHelio('emb', d), mg = moonGeo(d), f = 1 / (1 + EARTH_MOON_MASS_RATIO);
  const earth = [emb[0] - mg[0] * f, emb[1] - mg[1] * f, emb[2] - mg[2] * f];
  const out = { sun: [0, 0, 0], earth, moon: [earth[0] + mg[0], earth[1] + mg[1], earth[2] + mg[2]] };
  for (const k of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) out[k] = planetHelio(k, d);
  return out;
}

/** Heliocentric position of one body (cheaper than allHelio for trails). */
export function bodyHelio(key, d) {
  if (key === 'earth' || key === 'moon') { const a = allHelio(d); return a[key]; }
  return planetHelio(key, d);
}

/**
 * Moon body frame -> ecliptic J2000 rotation via Cassini's laws: the lunar equator is inclined
 * 1.5424° to the ecliptic, its ascending node is the orbit's descending node, and the prime
 * meridian points at the mean Earth direction. Returns { node, incl, w } in radians,
 * to apply as Rz(node) · Rx(incl) · Rz(w).
 */
export function moonOrientation(d) {
  const A = moonArgs(d);
  const node = norm360(A.node + 180 - 1.3969713 * A.T); // of-date -> J2000
  return { node: node * D2R, incl: 1.5424 * D2R, w: norm360(A.Lp - A.node) * D2R }; // w = (L'+180) - (node+180)
}
