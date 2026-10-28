// Procedurally paints the Mars textures used by the "Our campuses" globe on the About page.
// Output is committed under public/textures/, so the site never fetches a texture from anywhere else.
//
//   node scripts/make-mars-texture.mjs
//
// The albedo features, volcanoes, basins, and Valles Marineris sit near their real
// latitudes and longitudes so the campus pins land somewhere recognizable. Everything
// else is seeded noise; the same seed always paints the same planet.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'public', 'textures');
const W = 2048;
const H = 1024;
const DEG = Math.PI / 180;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(2004);
const perm = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function noise3(x, y, z) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = perm[X] + Y;
  const AA = perm[A] + Z;
  const AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y;
  const BA = perm[B] + Z;
  const BB = perm[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u), lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
    lerp(
      lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
      lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  );
}

function fbm(x, y, z, octaves, lacunarity = 2.03, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x, y, z);
    norm += amp;
    amp *= gain;
    x *= lacunarity;
    y *= lacunarity;
    z *= lacunarity;
  }
  return sum / norm;
}

function vec(latDeg, lonDeg) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
}

/** Angular distance in degrees between two unit vectors. */
function angle(a, b) {
  const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(d) / DEG;
}

// [lat, lon east, radius°, strength]. Positive strength darkens, negative brightens.
const albedoFeatures = [
  [9, 69, 11, 0.62], // Syrtis Major
  [-3, 2, 9, 0.5], // Sinus Meridiani
  [-9, 22, 11, 0.5], // Sinus Sabaeus
  [-24, -38, 17, 0.42], // Mare Erythraeum
  [46, -28, 15, 0.46], // Acidalia Planitia
  [-14, 108, 15, 0.45], // Mare Tyrrhenum
  [-24, 146, 17, 0.45], // Mare Cimmerium
  [-31, -152, 14, 0.38], // Mare Sirenum
  [47, 112, 18, 0.26], // Utopia Planitia
  [-27, -88, 7, 0.32], // Solis Lacus
  [-10, -60, 7, 0.22], // Valles Marineris floor dust
  [-42, 70, 16, -0.4], // Hellas
  [-50, -43, 8, -0.3], // Argyre
  [20, 8, 18, -0.22], // Arabia Terra
  [2, -112, 22, -0.25], // Tharsis
  [24, 147, 10, -0.18], // Elysium
  [18, -134, 9, -0.12], // Olympus Mons
];

// [lat, lon east, radius°, height]. Positive is a shield volcano, negative a basin.
const reliefFeatures = [
  [18.65, -133.8, 9.5, 1.0], // Olympus Mons
  [-8.3, -120.1, 3.6, 0.6], // Arsia Mons
  [1.5, -112.9, 3.2, 0.55], // Pavonis Mons
  [11.8, -104.5, 3.4, 0.6], // Ascraeus Mons
  [25.0, 147.2, 3.2, 0.4], // Elysium Mons
  [-42.4, 70.5, 17, -0.75], // Hellas
  [-49.7, -43.0, 8.5, -0.5], // Argyre
  [12.9, 87.0, 9, -0.35], // Isidis, with Jezero on its western rim
];

// Valles Marineris centerline, west to east.
const valles = [
  [-7, -101],
  [-8, -92],
  [-6.5, -84],
  [-9, -76],
  [-10.5, -70],
  [-11, -62],
  [-12.5, -54],
  [-11, -46],
  [-7, -40],
  [-3, -35],
].map(([la, lo]) => vec(la, lo));

function distanceToValles(p) {
  let best = Infinity;
  for (let i = 0; i < valles.length - 1; i++) {
    const a = valles[i];
    const b = valles[i + 1];
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      const q = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      const len = Math.hypot(q[0], q[1], q[2]);
      const d = angle(p, [q[0] / len, q[1] / len, q[2] / len]);
      if (d < best) best = d;
    }
  }
  return best;
}

const albedoVecs = albedoFeatures.map(([la, lo, r, s]) => ({ v: vec(la, lo), r, s }));
const reliefVecs = reliefFeatures.map(([la, lo, r, h]) => ({ v: vec(la, lo), r, h }));

const height = new Float32Array(W * H);
const albedo = new Float32Array(W * H);
const ice = new Float32Array(W * H);

console.log('painting albedo and relief…');
for (let y = 0; y < H; y++) {
  const lat = 90 - ((y + 0.5) / H) * 180;
  for (let x = 0; x < W; x++) {
    const lon = ((x + 0.5) / W) * 360 - 180;
    const p = vec(lat, lon);
    const i = y * W + x;

    const wx = fbm(p[0] * 2.1 + 11, p[1] * 2.1, p[2] * 2.1, 4) * 0.35;
    const wy = fbm(p[0] * 2.1, p[1] * 2.1 + 23, p[2] * 2.1, 4) * 0.35;
    const wz = fbm(p[0] * 2.1, p[1] * 2.1, p[2] * 2.1 + 37, 4) * 0.35;
    const q = [p[0] + wx, p[1] + wy, p[2] + wz];

    let a = 0.5 + fbm(q[0] * 1.6, q[1] * 1.6, q[2] * 1.6, 5) * 0.55;
    for (const f of albedoVecs) {
      const d = angle(q, f.v) / f.r;
      if (d < 2.2) a -= f.s * Math.exp(-d * d * 1.4);
    }
    a += fbm(p[0] * 14, p[1] * 14, p[2] * 14, 3) * 0.12;

    let h = fbm(p[0] * 3, p[1] * 3, p[2] * 3, 6) * 0.25;
    h += (-p[1] + 0.15) * 0.18; // southern highlands sit higher than the northern plains
    for (const f of reliefVecs) {
      const d = angle(p, f.v) / f.r;
      if (d < 1.6) {
        if (f.h > 0) {
          h += f.h * Math.pow(Math.max(0, 1 - d), 1.6);
          if (d < 0.12) h -= f.h * 0.25 * (1 - d / 0.12); // summit caldera
        } else {
          h += f.h * (1 - smooth(0.7, 1.15, d)) + -f.h * 0.25 * Math.exp(-Math.pow((d - 1.1) / 0.12, 2));
        }
      }
    }

    const nearValles = lat > -24 && lat < 6 && lon > -112 && lon < -24;
    const dv = nearValles ? distanceToValles(q.map((c) => c / Math.hypot(q[0], q[1], q[2]))) : Infinity;
    const canyonWidth = 1.6 + fbm(p[0] * 9, p[1] * 9, p[2] * 9, 3) * 1.2;
    if (dv < canyonWidth * 2) {
      const t = dv / canyonWidth;
      h -= 0.7 * Math.exp(-t * t * 2.5);
      a -= 0.16 * Math.exp(-t * t * 1.5);
    }

    const capNoise = fbm(p[0] * 6, p[1] * 6, p[2] * 6, 4) * 5;
    const north = smooth(80.5, 83.5, lat + capNoise);
    const southCenter = angle(p, vec(-87, -45));
    const south = 1 - smooth(4.5, 7, southCenter + capNoise * 0.6);
    ice[i] = Math.max(north, south);

    height[i] = h;
    albedo[i] = a;
  }
}

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function stampCrater(latC, lonC, radiusDeg, depth) {
  const rows = Math.ceil(((radiusDeg * 1.8) / 180) * H);
  const yc = ((90 - latC) / 180) * H;
  for (let y = Math.max(0, Math.floor(yc - rows)); y < Math.min(H, Math.ceil(yc + rows)); y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    const cos = Math.max(0.08, Math.cos(lat * DEG));
    const cols = Math.min(W / 2, Math.ceil(((radiusDeg * 1.8) / 360 / cos) * W));
    const xc = ((lonC + 180) / 360) * W;
    for (let k = -cols; k <= cols; k++) {
      const x = (((Math.floor(xc) + k) % W) + W) % W;
      const lon = ((x + 0.5) / W) * 360 - 180;
      const d = angle(vec(lat, lon), vec(latC, lonC)) / radiusDeg;
      if (d > 1.8) continue;
      const i = y * W + x;
      let dh;
      if (d < 1) dh = -depth * (1 - d * d) + depth * 0.35 * Math.pow(d, 6);
      else dh = depth * 0.35 * Math.exp(-Math.pow((d - 1) / 0.25, 2));
      height[i] += dh;
      if (d < 0.95) albedo[i] -= depth * 0.18 * (1 - d);
    }
  }
}

console.log('stamping craters…');
for (let n = 0; n < 900; n++) {
  const u = rand();
  const lat = Math.asin(2 * rand() - 1) / DEG;
  // The southern highlands are older and far more cratered.
  if (lat > 0 && rand() < 0.7) continue;
  const lon = rand() * 360 - 180;
  const r = 0.3 + Math.pow(u, 7) * 4.2;
  stampCrater(lat, lon, r, 0.03 + Math.min(0.07, r * 0.014));
}
stampCrater(18.38, 77.58, 0.9, 0.11); // Jezero
stampCrater(-5.4, 137.8, 1.6, 0.14); // Gale
stampCrater(-5.1, 137.85, 0.35, -0.12); // Aeolis Mons, the central peak inside Gale

console.log('shading…');
let hMin = Infinity;
let hMax = -Infinity;
for (const v of height) {
  if (v < hMin) hMin = v;
  if (v > hMax) hMax = v;
}

const palette = [
  [0.0, [74, 44, 32]],
  [0.28, [112, 60, 38]],
  [0.48, [152, 72, 40]],
  [0.68, [190, 98, 54]],
  [0.86, [214, 136, 86]],
  [1.0, [232, 176, 128]],
];
function ramp(t) {
  t = Math.min(1, Math.max(0, t));
  for (let k = 1; k < palette.length; k++) {
    if (t <= palette[k][0]) {
      const [t0, c0] = palette[k - 1];
      const [t1, c1] = palette[k];
      const s = (t - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], s), lerp(c0[1], c1[1], s), lerp(c0[2], c1[2], s)];
    }
  }
  return palette.at(-1)[1];
}

const color = Buffer.alloc(W * H * 3);
const bump = Buffer.alloc(W * H);
for (let y = 0; y < H; y++) {
  const lat = 90 - ((y + 0.5) / H) * 180;
  const cos = Math.max(0.05, Math.cos(lat * DEG));
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const xl = y * W + ((x - 1 + W) % W);
    const xr = y * W + ((x + 1) % W);
    const yu = Math.max(0, y - 1) * W + x;
    const yd = Math.min(H - 1, y + 1) * W + x;
    const dx = ((height[xr] - height[xl]) / cos) * 34;
    const dy = (height[yd] - height[yu]) * 34;
    const shade = Math.max(0.8, Math.min(1.16, 1 + (-dx + dy) * 0.25));

    let [r, g, b] = ramp(albedo[i]);
    const capT = ice[i];
    r = lerp(r, 238, capT);
    g = lerp(g, 226, capT);
    b = lerp(b, 218, capT);
    color[i * 3] = Math.min(255, r * shade);
    color[i * 3 + 1] = Math.min(255, g * shade);
    color[i * 3 + 2] = Math.min(255, b * shade);
    bump[i] = Math.round(((height[i] - hMin) / (hMax - hMin)) * 255);
  }
}

await mkdir(outDir, { recursive: true });
const raw = { raw: { width: W, height: H, channels: 3 } };
await sharp(color, raw).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(outDir, 'mars-color.jpg'));
await sharp(bump, { raw: { width: W, height: H, channels: 1 } })
  .resize(1024, 512)
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(path.join(outDir, 'mars-bump.jpg'));

// Flat map for prefers-reduced-motion and for browsers without WebGL, with a faint graticule.
const MW = 1600;
const MH = 800;
const lines = [];
for (let lon = -150; lon <= 150; lon += 30) {
  const x = ((lon + 180) / 360) * MW;
  lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${MH}" />`);
}
for (let lat = -60; lat <= 60; lat += 30) {
  const y = ((90 - lat) / 180) * MH;
  lines.push(`<line x1="0" y1="${y}" x2="${MW}" y2="${y}" />`);
}
const graticule = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${MW}" height="${MH}">` +
    `<g stroke="rgba(255,244,230,0.22)" stroke-width="1" stroke-dasharray="4 6">${lines.join('')}</g></svg>`,
);
await sharp(color, raw)
  .resize(MW, MH)
  .composite([{ input: graticule }])
  .webp({ quality: 78 })
  .toFile(path.join(outDir, 'mars-map.webp'));

console.log('wrote public/textures/mars-color.jpg, mars-bump.jpg, mars-map.webp');
