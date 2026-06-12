// Generate a mature Southern Live Oak (Quercus virginiana) GLB.
//
// Everything is procedural and deterministic (seeded RNG):
//   - Skeleton: short buttressed trunk, 6-7 sprawling near-horizontal scaffold
//     limbs that dip and rise (the live-oak signature), recursive secondary
//     branches and twigs, plus root flares at grade.
//   - Geometry: every branch is swept along a parallel-transport frame with
//     per-ring radius taper, buttress lobes and gnarl noise; radial/ring
//     resolution adapts to branch radius to stay near the triangle budget.
//   - Textures baked from SVG with sharp: a seamless 1024px furrowed-bark
//     base color, a matching normal map (height -> Sobel), and a 1024px
//     2x2 foliage atlas (three dense leaf-cluster cells + one Spanish-moss
//     cell) kept as PNG for alpha-masked cards.
//   - Canopy: leaf cards oriented outward from the crown centre with
//     spherical normals for soft lighting; Spanish moss hangs as tapered
//     strips from the undersides of the lower limbs.
//
// NOTE: Verse rooms light with analytic lights only (no IBL), so all
// materials stay metalness 0 / high roughness.
//
// Run:  node scripts/prepare-live-oak-glb.mjs [out.glb]
// Default out: GLBs/live-oak.glb (also copied to apps/web/public/objects/)

import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const OUT_PATH = resolve(process.argv[2] ?? resolve(__dirname, "../GLBs/live-oak.glb"));
const PUBLIC_PATH = resolve(__dirname, "../apps/web/public/objects/live-oak.glb");
const ROOM_OBJECT_PATH = resolve(__dirname, "../apps/web/public/room-objects/assets/live-oak.glb");

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Seeded RNG so the tree is reproducible run to run.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x11e0ac);
const rnd = (lo = 0, hi = 1) => lo + (hi - lo) * rng();
const gauss = () => (rng() + rng() + rng()) * 2 - 3; // ~N(0,1)-ish in [-3,3]

// ---------------------------------------------------------------------------
// Bark textures: seamless furrowed live-oak bark, baked color + height->normal.
// Live-oak bark is dark gray-brown, broken into narrow blocky vertical ridges.
// Elements are drawn once into <defs> and stamped 3x3 so all edges tile.
// ---------------------------------------------------------------------------
const BARK_SIZE = 1024;

function barkElements(height) {
  // height=true renders a heightfield (ridges light, furrows dark) for the
  // normal map; otherwise the color pass.
  const parts = [];
  const ridgeCols = height ? ["#b8b8b8", "#cfcfcf", "#a8a8a8"] : ["#8a7d6c", "#968a79", "#7d7162"];
  const furrowCol = height ? "#1c1c1c" : "#3a322a";
  const r = mulberry32(0xba12c);
  const rr = (lo, hi) => lo + (hi - lo) * r();
  // Vertical wavy furrows
  for (let i = 0; i < 30; i++) {
    const x0 = (i / 30) * BARK_SIZE + rr(-12, 12);
    let d = `M ${x0.toFixed(1)} -40`;
    let x = x0;
    for (let y = 0; y <= BARK_SIZE + 80; y += 64) {
      x += rr(-16, 16);
      d += ` L ${x.toFixed(1)} ${y}`;
    }
    const w = rr(5, 13);
    parts.push(`<path d="${d}" fill="none" stroke="${furrowCol}" stroke-width="${w.toFixed(1)}" stroke-linecap="round" opacity="${rr(0.75, 1).toFixed(2)}"/>`);
    // Ridge highlight hugging the furrow
    const col = ridgeCols[i % ridgeCols.length];
    parts.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${(w * rr(1.7, 2.6)).toFixed(1)}" transform="translate(${rr(8, 18).toFixed(1)},0)" opacity="${rr(0.3, 0.55).toFixed(2)}"/>`);
  }
  // Horizontal checks that break ridges into the blocky live-oak pattern
  for (let i = 0; i < 220; i++) {
    const x = rr(0, BARK_SIZE);
    const y = rr(0, BARK_SIZE);
    const len = rr(10, 42);
    parts.push(`<path d="M ${x.toFixed(1)} ${y.toFixed(1)} l ${len.toFixed(1)} ${rr(-6, 6).toFixed(1)}" stroke="${furrowCol}" stroke-width="${rr(2, 5).toFixed(1)}" opacity="${rr(0.35, 0.8).toFixed(2)}" fill="none"/>`);
  }
  // Speckle: lichen flecks and grain on the color pass, gentle noise on height
  for (let i = 0; i < 900; i++) {
    const x = rr(0, BARK_SIZE);
    const y = rr(0, BARK_SIZE);
    const rad = rr(1, 4);
    const c = height
      ? (r() < 0.5 ? "#ffffff" : "#000000")
      : r() < 0.18
        ? "#90a083" // pale lichen
        : r() < 0.5
          ? "#463d33"
          : "#9b8f7e";
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${c}" opacity="${rr(0.06, height ? 0.12 : 0.3).toFixed(2)}"/>`);
  }
  return parts.join("\n");
}

function barkSvg(height) {
  const base = height ? "#808080" : "#6e6253";
  const body = barkElements(height);
  const offsets = [];
  for (const dx of [-BARK_SIZE, 0, BARK_SIZE])
    for (const dy of [-BARK_SIZE, 0, BARK_SIZE]) offsets.push(`<use href="#bark" x="${dx}" y="${dy}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BARK_SIZE}" height="${BARK_SIZE}">
  <defs><g id="bark">${body}</g></defs>
  <rect width="${BARK_SIZE}" height="${BARK_SIZE}" fill="${base}"/>
  ${offsets.join("\n")}
</svg>`;
}

// Height map -> tangent-space normal map via Sobel.
async function bakeBarkNormal() {
  const raw = await sharp(Buffer.from(barkSvg(true)))
    .resize(BARK_SIZE, BARK_SIZE)
    .greyscale()
    .blur(1.2)
    .raw()
    .toBuffer();
  const N = BARK_SIZE;
  const out = Buffer.alloc(N * N * 3);
  const h = (x, y) => raw[((y + N) % N) * N + ((x + N) % N)] / 255;
  const STRENGTH = 2.2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx =
        h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
      const dy =
        h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
      const nx = -dx * STRENGTH;
      const ny = dy * STRENGTH; // glTF UV origin is top-left; flip green
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const o = (y * N + x) * 3;
      out[o] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
    }
  }
  return sharp(out, { raw: { width: N, height: N, channels: 3 } }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

// ---------------------------------------------------------------------------
// Foliage atlas (PNG, alpha): 2x2 grid of 512px cells.
// Cells 0-2: dense live-oak leaf clusters (small oblong evergreen leaves,
// glossy dark green tops, pale undersides). Cell 3: Spanish-moss festoon.
// ---------------------------------------------------------------------------
const ATLAS_SIZE = 1024;
const CELL = ATLAS_SIZE / 2;

function leafClusterCell(seed) {
  const r = mulberry32(seed);
  const rr = (lo, hi) => lo + (hi - lo) * r();
  const parts = [];
  const greens = ["#3a5e2b", "#46702f", "#54803a", "#5f8c44", "#3f6630", "#6a9a4e"];
  const pales = ["#7a9a62", "#88a76f", "#96b37c"];
  // Faint twig skeleton under the leaves
  for (let i = 0; i < 7; i++) {
    const a = rr(0, Math.PI * 2);
    const len = rr(120, 215);
    parts.push(
      `<path d="M 256 256 q ${(Math.cos(a) * len * 0.5).toFixed(0)} ${(Math.sin(a) * len * 0.5 + rr(-30, 30)).toFixed(0)} ${(Math.cos(a) * len).toFixed(0)} ${(Math.sin(a) * len).toFixed(0)}" stroke="#4a3c2c" stroke-width="${rr(3, 6).toFixed(1)}" fill="none" opacity="0.85"/>`
    );
  }
  // Leaves: dense in the middle, sparser to the edge; cluster stays inside
  // the cell with an 18px inset so MASK sampling never bleeds across cells.
  for (let i = 0; i < 150; i++) {
    const ang = rr(0, Math.PI * 2);
    const dist = 230 * Math.sqrt(r()) * (0.25 + 0.75 * r());
    const cx = 256 + Math.cos(ang) * dist;
    const cy = 256 + Math.sin(ang) * dist;
    const rot = rr(0, 360);
    const L = rr(17, 27); // half-length: live-oak leaves are small (4-10 cm)
    const W = L * rr(0.3, 0.42);
    const underside = r() < 0.22;
    const fill = underside ? pales[i % pales.length] : greens[i % greens.length];
    parts.push(
      `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot.toFixed(0)})">` +
        `<ellipse rx="${L.toFixed(1)}" ry="${W.toFixed(1)}" fill="${fill}"/>` +
        (underside
          ? ""
          : `<ellipse rx="${(L * 0.55).toFixed(1)}" ry="${(W * 0.45).toFixed(1)}" cx="${(L * 0.18).toFixed(1)}" cy="${(-W * 0.25).toFixed(1)}" fill="#8fbd63" opacity="${rr(0.3, 0.55).toFixed(2)}"/>`) +
        `<line x1="${(-L).toFixed(1)}" y1="0" x2="${(L * 0.85).toFixed(1)}" y2="0" stroke="#2c4a22" stroke-width="1.1" opacity="0.6"/>` +
        `</g>`
    );
  }
  return parts.join("\n");
}

function mossCell(seed) {
  const r = mulberry32(seed);
  const rr = (lo, hi) => lo + (hi - lo) * r();
  const parts = [];
  const grays = ["#aab49a", "#b7c0a8", "#98a288", "#c3cbb4", "#8d9780"];
  // Hanging festoon: many thin wavy strands, dense at top, tapering down.
  for (let i = 0; i < 130; i++) {
    const x0 = 256 + gaussFrom(r) * 95;
    const drop = rr(220, 470);
    let d = `M ${x0.toFixed(1)} ${rr(10, 60).toFixed(1)}`;
    let x = x0;
    const segs = 6;
    for (let s = 1; s <= segs; s++) {
      x += rr(-26, 26) * (1 - s / (segs + 2));
      d += ` L ${x.toFixed(1)} ${(rr(10, 40) + (drop * s) / segs).toFixed(1)}`;
    }
    parts.push(
      `<path d="${d}" fill="none" stroke="${grays[i % grays.length]}" stroke-width="${rr(1.6, 3.6).toFixed(1)}" stroke-linecap="round" opacity="${rr(0.55, 0.95).toFixed(2)}"/>`
    );
  }
  // Curly side wisps
  for (let i = 0; i < 90; i++) {
    const x = 256 + gaussFrom(r) * 100;
    const y = rr(40, 430);
    parts.push(
      `<path d="M ${x.toFixed(1)} ${y.toFixed(1)} q ${rr(-18, 18).toFixed(1)} ${rr(6, 22).toFixed(1)} ${rr(-26, 26).toFixed(1)} ${rr(14, 34).toFixed(1)}" fill="none" stroke="${grays[(i + 2) % grays.length]}" stroke-width="${rr(1.2, 2.4).toFixed(1)}" opacity="${rr(0.4, 0.85).toFixed(2)}"/>`
    );
  }
  return parts.join("\n");
}

function gaussFrom(r) {
  return (r() + r() + r()) * 2 - 3;
}

function foliageAtlasSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ATLAS_SIZE}" height="${ATLAS_SIZE}">
  <g>${leafClusterCell(0x1ea51)}</g>
  <g transform="translate(${CELL},0)">${leafClusterCell(0x1ea52)}</g>
  <g transform="translate(0,${CELL})">${leafClusterCell(0x1ea53)}</g>
  <g transform="translate(${CELL},${CELL})">${mossCell(0x305)}</g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Branch skeleton.
// ---------------------------------------------------------------------------
const branches = []; // { pts: Vector3[], radii: number[], radialSegs, radialFn? }
const leafAnchors = []; // { pos, out }
const mossAnchors = []; // { pos, r }

const CROWN_CENTER = new THREE.Vector3(0, 4.6, 0);

function radialSegsFor(r) {
  if (r > 0.32) return 14;
  if (r > 0.18) return 11;
  if (r > 0.09) return 9;
  if (r > 0.045) return 7;
  return 6;
}

function randomPerp(dir) {
  const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
  v.sub(dir.clone().multiplyScalar(v.dot(dir)));
  if (v.lengthSq() < 1e-8) v.set(dir.y, -dir.x, 0);
  return v.normalize();
}

// level: 1 = scaffold limb, 2 = secondary, 3 = twig
function growBranch(start, dir0, r0, length, level) {
  const stepLen = level === 1 ? 0.34 : level === 2 ? 0.3 : 0.34;
  const steps = Math.max(4, Math.round(length / stepLen));
  const pts = [start.clone()];
  const radii = [r0];
  const dir = dir0.clone().normalize();
  const pos = start.clone();
  const wiggle = level === 1 ? 7.5 * DEG : level === 2 ? 11 * DEG : 16 * DEG;
  const rTip = level === 3 ? 0.012 : r0 * 0.28;
  const children = [];

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Live-oak limb line: dip through the middle of the run, rise at the tip.
    if (level <= 2) {
      const droop = level === 1 ? 0.028 : 0.02;
      const lift = level === 1 ? 0.09 : 0.06;
      dir.y += -droop * Math.sin(Math.PI * Math.min(t / 0.65, 1)) + (t > 0.5 ? lift * (t - 0.5) : 0);
      if (dir.y < -0.3) dir.y = -0.3;
    } else {
      dir.y += rnd(-0.03, 0.11); // twigs reach for light
    }
    dir.applyAxisAngle(randomPerp(dir), gauss() * wiggle * 0.45).normalize();
    // Curl growth back inside the crown envelope instead of escaping it.
    {
      const ex = pos.x / 5.4;
      const ey = (pos.y - 4.6) / 3.3;
      const ez = pos.z / 5.4;
      const e = Math.hypot(ex, ey, ez);
      if (e > 0.98) {
        const inward = new THREE.Vector3(0, 4.6, 0).sub(pos).normalize();
        dir.lerp(inward, Math.min(0.45, (e - 0.98) * 1.6)).normalize();
      }
    }
    pos.addScaledVector(dir, length / steps);
    const minY = level === 1 ? 1.3 : level === 2 ? 1.5 : 1.45;
    if (pos.y < minY) pos.y = minY + rnd(0, 0.15); // keep the crown base off the turf
    pts.push(pos.clone());
    const radius = THREE.MathUtils.lerp(r0, rTip, Math.pow(t, 0.85));
    radii.push(radius);

    // Spawn children part-way along
    if (level < 3 && t > 0.22 && t < 0.93) {
      const every = 2;
      if (i % every === 0 && rng() < (level === 1 ? 0.9 : 0.85)) {
        const axis = randomPerp(dir);
        const childDir = dir.clone().applyAxisAngle(axis, rnd(28, 58) * DEG * (rng() < 0.5 ? 1 : -1));
        if (childDir.y < -0.25) childDir.y = -0.25;
        children.push({
          start: pos.clone(),
          dir: childDir.normalize(),
          r: Math.min(radius * rnd(0.52, 0.66), radius - 0.004),
          len: length * (1 - t) * rnd(0.5, 0.85) + (level === 1 ? 1.1 : 0.5),
          level: level + 1
        });
      }
    }

    // Foliage + moss anchors
    if (level === 3 && t > 0.3) leafAnchors.push({ pos: pos.clone(), out: dir.clone() });
    if (level === 2 && t > 0.5 && i % 2 === 0) leafAnchors.push({ pos: pos.clone(), out: dir.clone() });
    if (level <= 2 && pos.y > 1.7 && t > 0.2 && t < 0.92 && rng() < (level === 1 ? 0.6 : 0.3)) {
      mossAnchors.push({ pos: pos.clone(), r: radius });
    }
  }
  leafAnchors.push({ pos: pos.clone(), out: dir.clone() });

  const gnarlPhase = rnd(0, Math.PI * 2);
  const gnarlAmp = level === 1 ? 0.09 : 0.05;
  branches.push({
    pts,
    radii,
    radialSegs: radialSegsFor(r0),
    radialFn: (theta, t) => 1 + gnarlAmp * Math.sin(3 * theta + gnarlPhase + t * 7) * (1 - t * 0.5)
  });
  for (const c of children) growBranch(c.start, c.dir, c.r, c.len, c.level);
}

// --- Trunk: short, massive, buttressed -------------------------------------
const FORK_Y = 2.2;
{
  const pts = [];
  const radii = [];
  const lean = new THREE.Vector3(rnd(-0.05, 0.05), 0, rnd(-0.05, 0.05));
  const ringsN = 10;
  for (let i = 0; i <= ringsN; i++) {
    const t = i / ringsN;
    const y = -0.08 + (FORK_Y + 0.5) * t;
    pts.push(new THREE.Vector3(lean.x * y + Math.sin(t * 5) * 0.05, y, lean.z * y + Math.cos(t * 4.2) * 0.04));
    radii.push(THREE.MathUtils.lerp(0.7, 0.42, Math.pow(t, 0.8)));
  }
  branches.push({
    pts,
    radii,
    radialSegs: 16,
    // Buttress lobes fade out with height; light gnarl all the way up.
    radialFn: (theta, t) =>
      1 +
      0.4 * Math.exp(-t * 3.2) * (0.55 + 0.45 * Math.sin(4 * theta + 0.7)) +
      0.07 * Math.sin(3 * theta + t * 6) +
      0.04 * Math.sin(7 * theta + 1.3)
  });
}

// --- Root flares ------------------------------------------------------------
for (let k = 0; k < 6; k++) {
  const a = (k / 6) * Math.PI * 2 + rnd(-0.25, 0.25);
  const dir = new THREE.Vector3(Math.cos(a), -0.18, Math.sin(a)).normalize();
  const start = new THREE.Vector3(Math.cos(a) * 0.42, 0.22, Math.sin(a) * 0.42);
  const len = rnd(0.9, 1.5);
  const pts = [];
  const radii = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const p = start.clone().addScaledVector(dir, len * t);
    p.y = Math.max(p.y - 0.5 * t * t, -0.02);
    pts.push(p);
    radii.push(THREE.MathUtils.lerp(0.22, 0.04, Math.pow(t, 0.7)));
  }
  branches.push({
    pts,
    radii,
    radialSegs: 8,
    radialFn: (theta) => 1 + 0.3 * Math.max(0, Math.sin(theta)) // ridge on top, like a surface root
  });
}

// --- Scaffold limbs ---------------------------------------------------------
const SCAFFOLDS = [
  { y: 1.45, el: 18, len: 5.9, r: 0.34 },
  { y: 1.7, el: 27, len: 6.2, r: 0.36 },
  { y: 1.9, el: 15, len: 5.6, r: 0.32 },
  { y: 2.05, el: 36, len: 5.9, r: 0.34 },
  { y: 2.15, el: 23, len: 5.4, r: 0.3 },
  { y: 2.3, el: 32, len: 5.2, r: 0.3 },
  { y: 2.4, el: 62, len: 4.4, r: 0.3 } // central leader fills the crown top
];
SCAFFOLDS.forEach((s, k) => {
  const az = k * 137.5 * DEG + rnd(-14, 14) * DEG;
  const el = (s.el + rnd(-4, 4)) * DEG;
  const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  const start = new THREE.Vector3(dir.x * 0.32, s.y, dir.z * 0.32);
  growBranch(start, dir, s.r, s.len + rnd(-0.4, 0.4), 1);
});

// ---------------------------------------------------------------------------
// Sweep meshing with parallel-transport frames.
// ---------------------------------------------------------------------------
const BARK_TEX_WORLD = 1.9; // metres of bark covered by one texture repeat

function sweepBranch({ pts, radii, radialSegs, radialFn }) {
  const rings = pts.length;
  const tangents = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(rings - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  let normal = randomPerp(tangents[0]);
  const positions = [];
  const normals = [];
  const uvs = [];
  const idx = [];
  const cols = radialSegs + 1;
  const avgR = radii.reduce((a, b) => a + b, 0) / radii.length;
  const uTiles = Math.max(1, Math.round((2 * Math.PI * avgR) / BARK_TEX_WORLD));
  let v = 0;
  for (let i = 0; i < rings; i++) {
    if (i > 0) {
      // parallel transport
      normal.sub(tangents[i].clone().multiplyScalar(normal.dot(tangents[i]))).normalize();
      v += pts[i].distanceTo(pts[i - 1]) / BARK_TEX_WORLD;
    }
    const binormal = tangents[i].clone().cross(normal).normalize();
    const t = i / (rings - 1);
    for (let j = 0; j <= radialSegs; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const radial = normal
        .clone()
        .multiplyScalar(Math.cos(theta))
        .addScaledVector(binormal, Math.sin(theta));
      const rr = radii[i] * (radialFn ? radialFn(theta, t) : 1);
      const p = pts[i].clone().addScaledVector(radial, rr);
      positions.push(p.x, p.y, p.z);
      normals.push(radial.x, radial.y, radial.z);
      uvs.push((j / radialSegs) * uTiles, v);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * cols + j;
      const b = a + cols;
      // CCW from outside: ring direction (a -> a+1) crossed with the along-
      // branch direction (a -> b) must face the same way as the radial normal.
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

const barkGeometry = mergeGeometries(branches.map(sweepBranch), false);

// ---------------------------------------------------------------------------
// Canopy: alpha-masked leaf cards with spherical normals.
// ---------------------------------------------------------------------------
const LEAF_CELLS = [
  [0, 0],
  [0.5, 0],
  [0, 0.5]
];
const MOSS_CELL = [0.5, 0.5];
// Inset keeps bilinear sampling off neighbouring atlas cells.
const CELL_INSET = 0.012;

function quadCard(center, normalDir, size, cell, rollAngle) {
  const n = normalDir.clone().normalize();
  const up0 = Math.abs(n.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = up0.clone().cross(n).normalize().applyAxisAngle(n, rollAngle);
  const up = n.clone().cross(right).normalize();
  const h = size / 2;
  const corners = [
    center.clone().addScaledVector(right, -h).addScaledVector(up, -h),
    center.clone().addScaledVector(right, h).addScaledVector(up, -h),
    center.clone().addScaledVector(right, h).addScaledVector(up, h),
    center.clone().addScaledVector(right, -h).addScaledVector(up, h)
  ];
  // Spherical normal biased upward so the canopy catches the key light and
  // the underside doesn't fall to black in analytic-light-only rooms.
  const sphereN = center.clone().sub(CROWN_CENTER).normalize().add(new THREE.Vector3(0, 0.7, 0)).normalize();
  const [u0, v0] = cell;
  const ua = u0 + CELL_INSET;
  const ub = u0 + 0.5 - CELL_INSET;
  const va = v0 + CELL_INSET;
  const vb = v0 + 0.5 - CELL_INSET;
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(corners.flatMap((c) => [c.x, c.y, c.z]), 3)
  );
  g.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute([...Array(4)].flatMap(() => [sphereN.x, sphereN.y, sphereN.z]), 3)
  );
  g.setAttribute("uv", new THREE.Float32BufferAttribute([ua, vb, ub, vb, ub, va, ua, va], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// Keep cards inside a soft crown envelope so no tuft floats off on its own.
const CROWN_RX = 5.7;
const CROWN_RY = 3.5;
function clampToCrown(p) {
  const dx = (p.x - CROWN_CENTER.x) / CROWN_RX;
  const dy = (p.y - CROWN_CENTER.y) / CROWN_RY;
  const dz = (p.z - CROWN_CENTER.z) / CROWN_RX;
  const e = Math.hypot(dx, dy, dz);
  if (e > 1.15) p.lerp(CROWN_CENTER, 1 - 1.15 / e);
  return p;
}

const leafGeoms = [];
for (const anchor of leafAnchors) {
  const cards = rng() < 0.6 ? 5 : 4;
  for (let c = 0; c < cards; c++) {
    const offset = new THREE.Vector3(gauss() * 0.3, gauss() * 0.24, gauss() * 0.3).addScaledVector(
      anchor.out,
      rnd(0, 0.55)
    );
    const center = clampToCrown(anchor.pos.clone().add(offset));
    if (center.y < 2.0) center.y = 2.0 + rnd(0, 0.35);
    const outward = center.clone().sub(CROWN_CENTER).normalize();
    const n = outward.clone().addScaledVector(new THREE.Vector3(gauss(), gauss(), gauss()).normalize(), 0.55).normalize();
    const cellIndex = Math.floor(rnd(0, 3));
    leafGeoms.push(quadCard(center, n, rnd(0.8, 1.3), LEAF_CELLS[cellIndex], rnd(0, Math.PI * 2)));
  }
}
// Crown-top filler: cards sampled on the upper dome so the apex reads full
// even where the twig skeleton is sparse.
for (let i = 0; i < 540; i++) {
  const az = rnd(0, Math.PI * 2);
  const phi = Math.acos(rnd(0.08, 1)); // dome from apex down to the eaves
  const rad = new THREE.Vector3(
    Math.sin(phi) * Math.cos(az) * rnd(4.1, 5.1),
    Math.cos(phi) * rnd(2.6, 3.2),
    Math.sin(phi) * Math.sin(az) * rnd(4.1, 5.1)
  );
  const center = CROWN_CENTER.clone().add(rad).add(new THREE.Vector3(gauss() * 0.3, gauss() * 0.25, gauss() * 0.3));
  const outward = center.clone().sub(CROWN_CENTER).normalize();
  const n = outward.clone().addScaledVector(new THREE.Vector3(gauss(), gauss(), gauss()).normalize(), 0.45).normalize();
  leafGeoms.push(quadCard(center, n, rnd(0.9, 1.4), LEAF_CELLS[Math.floor(rnd(0, 3))], rnd(0, Math.PI * 2)));
}
// Extra patch right at the apex where the dome sampling thins out.
for (let i = 0; i < 70; i++) {
  const az = rnd(0, Math.PI * 2);
  const rr2 = rnd(0, 2.4);
  const center = new THREE.Vector3(
    Math.cos(az) * rr2 + gauss() * 0.2,
    CROWN_CENTER.y + rnd(2.2, 3.1) - rr2 * 0.25,
    Math.sin(az) * rr2 + gauss() * 0.2
  );
  const n = new THREE.Vector3(gauss() * 0.4, 1, gauss() * 0.4).normalize();
  leafGeoms.push(quadCard(center, n, rnd(1.1, 1.6), LEAF_CELLS[Math.floor(rnd(0, 3))], rnd(0, Math.PI * 2)));
}
const leafGeometry = mergeGeometries(leafGeoms, false);

// ---------------------------------------------------------------------------
// Spanish moss: tapered 3-segment strips hanging from the lower limbs.
// ---------------------------------------------------------------------------
function mossStrip(top, length, width) {
  const sway = new THREE.Vector3(rnd(-0.12, 0.12), 0, rnd(-0.12, 0.12));
  const az = rnd(0, Math.PI * 2);
  const right = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const rows = 4;
  const positions = [];
  const normals = [];
  const uvs = [];
  const idx = [];
  // Up-biased normal: hanging moss is lit by the sky/key light, and a pure
  // horizontal normal renders the strands near-black in analytic lighting.
  const n = right.clone().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(0.45).add(new THREE.Vector3(0, 1, 0)).normalize();
  const [u0, v0] = MOSS_CELL;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const cy = top.clone().addScaledVector(sway, Math.sin(t * Math.PI) * length * 0.4);
    cy.y = top.y - length * t;
    const w = (width / 2) * (1 - 0.55 * t); // taper toward the tip
    const a = cy.clone().addScaledVector(right, -w);
    const b = cy.clone().addScaledVector(right, w);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    normals.push(n.x, n.y, n.z, n.x, n.y, n.z);
    const v = v0 + CELL_INSET + t * (0.5 - 2 * CELL_INSET);
    uvs.push(u0 + CELL_INSET, v, u0 + 0.5 - CELL_INSET, v);
  }
  for (let i = 0; i < rows - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

const mossGeoms = [];
for (const m of mossAnchors) {
  if (rng() > 0.75) continue;
  const strands = rng() < 0.4 ? 2 : 1;
  for (let s = 0; s < strands; s++) {
    const top = m.pos.clone().add(new THREE.Vector3(rnd(-0.2, 0.2), -m.r * 0.8, rnd(-0.2, 0.2)));
    mossGeoms.push(mossStrip(top, rnd(0.7, 1.9), rnd(0.16, 0.3)));
  }
}
const mossGeometry = mossGeoms.length ? mergeGeometries(mossGeoms, false) : null;

// ---------------------------------------------------------------------------
// Export with gltf-transform.
// ---------------------------------------------------------------------------
const doc = new Document();
const buffer = doc.createBuffer("bin");
const scene = doc.createScene("LiveOak");
doc.getRoot().setDefaultScene(scene);

const [barkColorJpeg, barkNormalJpeg, foliagePng] = await Promise.all([
  sharp(Buffer.from(barkSvg(false))).jpeg({ quality: 88, mozjpeg: true }).toBuffer(),
  bakeBarkNormal(),
  sharp(Buffer.from(foliageAtlasSvg())).png({ compressionLevel: 9 }).toBuffer()
]);

const barkColorTex = doc.createTexture("live-oak-bark").setImage(barkColorJpeg).setMimeType("image/jpeg");
const barkNormalTex = doc.createTexture("live-oak-bark-normal").setImage(barkNormalJpeg).setMimeType("image/jpeg");
const foliageTex = doc.createTexture("live-oak-foliage").setImage(foliagePng).setMimeType("image/png");

const barkMat = doc
  .createMaterial("live-oak-bark")
  .setBaseColorTexture(barkColorTex)
  .setNormalTexture(barkNormalTex)
  .setNormalScale(1)
  .setMetallicFactor(0)
  .setRoughnessFactor(0.88);

const foliageMat = doc
  .createMaterial("live-oak-foliage")
  .setBaseColorTexture(foliageTex)
  .setAlphaMode("MASK")
  .setAlphaCutoff(0.45)
  .setDoubleSided(true)
  .setMetallicFactor(0)
  .setRoughnessFactor(0.85);

let triCount = 0;
function primFromGeom(geom, material) {
  const posArr = new Float32Array(geom.attributes.position.array);
  const nrmArr = new Float32Array(geom.attributes.normal.array);
  const uvArr = new Float32Array(geom.attributes.uv.array);
  const count = posArr.length / 3;
  const idxSrc = geom.index ? geom.index.array : [...Array(count).keys()];
  const IdxArr = count > 65535 ? Uint32Array : Uint16Array;
  const idxArr = new IdxArr(idxSrc);
  triCount += idxArr.length / 3;
  return doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(posArr))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(nrmArr))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setBuffer(buffer).setArray(uvArr))
    .setIndices(doc.createAccessor().setType("SCALAR").setBuffer(buffer).setArray(idxArr))
    .setMaterial(material);
}

function addPart(name, geom, material) {
  const before = triCount;
  const mesh = doc.createMesh(name).addPrimitive(primFromGeom(geom, material));
  scene.addChild(doc.createNode(name).setMesh(mesh));
  return triCount - before;
}

const barkTris = addPart("Bark", barkGeometry, barkMat);
const leafTris = addPart("Canopy", leafGeometry, foliageMat);
const mossTris = mossGeometry ? addPart("SpanishMoss", mossGeometry, foliageMat) : 0;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await io.write(OUT_PATH, doc);
await copyFile(OUT_PATH, PUBLIC_PATH);
await copyFile(OUT_PATH, ROOM_OBJECT_PATH);

// Report
const bb = new THREE.Box3().setFromBufferAttribute(barkGeometry.attributes.position);
const lb = new THREE.Box3().setFromBufferAttribute(leafGeometry.attributes.position);
bb.union(lb);
console.log(`Wrote ${OUT_PATH}`);
console.log(`Copied to ${PUBLIC_PATH}`);
console.log(`Triangles: bark ${barkTris}, canopy ${leafTris}, moss ${mossTris} — total ${triCount}`);
console.log(`Leaf anchors: ${leafAnchors.length}, moss anchors: ${mossAnchors.length}, branches: ${branches.length}`);
console.log(
  `Bounds: x [${bb.min.x.toFixed(2)}, ${bb.max.x.toFixed(2)}], y [${bb.min.y.toFixed(2)}, ${bb.max.y.toFixed(2)}], z [${bb.min.z.toFixed(2)}, ${bb.max.z.toFixed(2)}]`
);
