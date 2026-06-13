// Generate a tall-grass patch GLB for the World Builder Objects palette.
//
// Everything is procedural and deterministic (seeded RNG):
//   - One "patch" = a dense clump of ~190 individually curved blades plus a
//     handful of taller seed-head stalks, rooted inside a ~0.6 m circle.
//   - Each blade is a V-folded ribbon (3 verts per ring: two edges + a raised
//     centre crease) swept along a drooping spine with per-blade lean, droop,
//     twist and width taper, so silhouettes read as real grass up close.
//   - Colors are per-vertex (root→tip gradient with per-blade hue jitter and
//     occasional dry tan blades) — no textures, so edges stay razor sharp at
//     any distance and there is nothing to alpha-sort.
//   - Wind data is baked into TEXCOORD_0: uv.x = per-blade phase (0..1),
//     uv.y = bend weight (0 at the root → 1 at the tip). The web client
//     injects a vertex-shader sway for catalog assets flagged `windSway`.
//
// NOTE: Verse rooms light with analytic lights only (no IBL), so the material
// stays metalness 0 / high roughness, and normals are up-biased (a pure
// side-facing normal renders near-black under analytic lighting).
//
// Run:  node scripts/prepare-tall-grass-glb.mjs [out.glb]
// Default out: GLBs/tall-grass.glb (also copied to apps/web/public/objects/)

import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const OUT_PATH = resolve(process.argv[2] ?? resolve(__dirname, "../GLBs/tall-grass.glb"));
const PUBLIC_PATH = resolve(__dirname, "../apps/web/public/objects/tall-grass.glb");

// ---------------------------------------------------------------------------
// Seeded RNG so the patch is reproducible run to run.
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
const rng = mulberry32(0x6e455);
const rnd = (lo = 0, hi = 1) => lo + (hi - lo) * rng();

// ---------------------------------------------------------------------------
// Color helpers — palette is designed in sRGB HSL, written to COLOR_0 in
// linear space (the glTF convention).
// ---------------------------------------------------------------------------
function hslToSrgb(h, s, l) {
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function linearHsl(h, s, l) {
  return hslToSrgb(h, s, l).map(srgbToLinear);
}

// Per-blade palettes: { root, tip } in linear RGB.
function greenPalette() {
  const hue = rnd(0.21, 0.27); // olive → fresh green
  return {
    root: linearHsl(hue + 0.02, rnd(0.45, 0.58), rnd(0.11, 0.16)),
    tip: linearHsl(hue - rnd(0.01, 0.04), rnd(0.55, 0.7), rnd(0.36, 0.5))
  };
}
function dryPalette() {
  const hue = rnd(0.1, 0.14); // straw
  return {
    root: linearHsl(hue, rnd(0.3, 0.4), rnd(0.16, 0.22)),
    tip: linearHsl(hue, rnd(0.38, 0.5), rnd(0.5, 0.62))
  };
}
const STALK_PALETTE = () => ({
  root: linearHsl(0.18, 0.35, 0.18),
  tip: linearHsl(0.12, rnd(0.42, 0.52), rnd(0.46, 0.56))
});
const HEAD_COLOR = () => linearHsl(0.115, rnd(0.4, 0.5), rnd(0.52, 0.64));

const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Blade ribbon: V-folded cross-section swept along a drooping spine.
//   base      world-space root position
//   azimuth   droop/lean direction (radians)
//   opts      { length, width, lean, droop, twist, palette, phase, weightScale }
// ---------------------------------------------------------------------------
function bladeGeometry(base, azimuth, opts) {
  const rings = 7;
  const leanDir = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const idx = [];

  const pos = base.clone();
  let prev = pos.clone();
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    // Spine: starts mostly upright with `lean`, rotates toward horizontal as
    // droop accumulates quadratically — the classic arched grass-blade curve.
    const bend = opts.lean + opts.droop * t * t;
    const dir = UP.clone().multiplyScalar(Math.cos(bend)).addScaledVector(leanDir, Math.sin(bend)).normalize();
    if (i > 0) {
      const step = opts.length / (rings - 1);
      pos.addScaledVector(dir, step);
    }

    // Cross-section frame, twisted along the length.
    const twist = opts.twist * t;
    const right = new THREE.Vector3().crossVectors(dir, UP);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize().applyAxisAngle(dir, twist);
    const fold = new THREE.Vector3().crossVectors(right, dir).normalize();

    // Taper to a point (blades) or to `tipWidth` of the base (stalks, so the
    // stem stays visible all the way up to the seed head).
    const taper = (1 - t) * (1 - 0.35 * t) + t * (opts.tipWidth ?? 0);
    const w = (opts.width / 2) * taper;
    const crease = w * 0.55; // raised centre ridge → V profile
    const a = pos.clone().addScaledVector(right, -w);
    const b = pos.clone().addScaledVector(fold, crease);
    const c = pos.clone().addScaledVector(right, w);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);

    // Up-biased normals (analytic lights only); edges splay outward slightly
    // so the V fold still catches a highlight gradient across the blade.
    const nMid = fold.clone().multiplyScalar(0.55).add(UP).normalize();
    const nA = nMid.clone().addScaledVector(right, -0.35).normalize();
    const nC = nMid.clone().addScaledVector(right, 0.35).normalize();
    normals.push(nA.x, nA.y, nA.z, nMid.x, nMid.y, nMid.z, nC.x, nC.y, nC.z);

    // Root→tip gradient with a faint random streak per ring.
    const mix = t ** 0.85;
    const streak = rnd(-0.03, 0.03);
    for (let v = 0; v < 3; v++) {
      for (let ch = 0; ch < 3; ch++) {
        const cVal = opts.palette.root[ch] + (opts.palette.tip[ch] - opts.palette.root[ch]) * mix;
        colors.push(Math.min(1, Math.max(0, cVal + streak)));
      }
    }

    // Wind encoding: x = blade phase, y = bend weight (root planted).
    const weight = Math.min(1, t ** 1.6 * (opts.weightScale ?? 1));
    for (let v = 0; v < 3; v++) uvs.push(opts.phase, weight);

    prev = pos.clone();
  }
  void prev;

  for (let i = 0; i < rings - 1; i++) {
    const r0 = i * 3;
    const r1 = r0 + 3;
    idx.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1);
    idx.push(r0 + 1, r1 + 1, r0 + 2, r0 + 2, r1 + 1, r1 + 2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------------
// Seed head: three narrow diamond ribbons crossed at 60°, tapered both ways,
// sitting at the tip of a stalk — reads as a fluffy panicle from any side.
// ---------------------------------------------------------------------------
function seedHeadGeometry(top, leanDir, phase) {
  const geoms = [];
  const length = rnd(0.16, 0.22);
  const color = HEAD_COLOR();
  // Head axis: mostly up, nodding slightly along the stalk's droop direction.
  const axis = UP.clone().addScaledVector(leanDir, rnd(0.2, 0.45)).normalize();
  for (let p = 0; p < 3; p++) {
    const az = (p / 3) * Math.PI + rnd(-0.2, 0.2);
    const right = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const rows = 5;
    const positions = [];
    const normals = [];
    const colors = [];
    const uvs = [];
    const idx = [];
    const n = right.clone().multiplyScalar(0.3).add(UP).normalize();
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      // Slim spike: widest a third of the way up, pointed at both ends.
      const w = 0.0095 * Math.sin(Math.PI * Math.min(1, t * 1.45)) + 0.0012;
      // Overlap the stalk tip so the head and stem always connect.
      const cy = top.clone().addScaledVector(axis, (t - 0.3) * length);
      cy.addScaledVector(right, Math.sin(t * Math.PI) * 0.006);
      const a = cy.clone().addScaledVector(right, -w);
      const b = cy.clone().addScaledVector(right, w);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      normals.push(n.x, n.y, n.z, n.x, n.y, n.z);
      const shade = 1 - 0.18 * (1 - t);
      colors.push(color[0] * shade, color[1] * shade, color[2] * shade, color[0] * shade, color[1] * shade, color[2] * shade);
      uvs.push(phase, 1, phase, 1); // heads ride the stalk tip → full sway
    }
    for (let i = 0; i < rows - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    geoms.push(g);
  }
  return geoms;
}

// ---------------------------------------------------------------------------
// Assemble the patch.
// ---------------------------------------------------------------------------
const PATCH_RADIUS = 0.3;
const geoms = [];

// Tall blades — the body of the clump. Outer blades lean outward harder so
// the clump reads as a fountain shape rather than a bundle of needles.
const TALL_BLADES = 150;
for (let i = 0; i < TALL_BLADES; i++) {
  const az = rnd(0, Math.PI * 2);
  const r = PATCH_RADIUS * Math.sqrt(rng()) * rnd(0.85, 1);
  const base = new THREE.Vector3(Math.cos(az) * r, 0, Math.sin(az) * r);
  const outward = az + rnd(-0.7, 0.7);
  const edge = r / PATCH_RADIUS; // 0 centre → 1 rim
  geoms.push(
    bladeGeometry(base, outward, {
      length: rnd(0.55, 1.05) * (1 - 0.25 * edge),
      width: rnd(0.011, 0.018),
      lean: rnd(0.04, 0.16) + edge * rnd(0.15, 0.4),
      droop: rnd(0.25, 0.95) + edge * 0.3,
      twist: rnd(-0.7, 0.7),
      palette: rng() < 0.13 ? dryPalette() : greenPalette(),
      phase: rng()
    })
  );
}

// Short under-layer: dense, heavily drooped filler so the root zone looks
// full instead of showing bare floor between tall blades.
const FILLER_BLADES = 60;
for (let i = 0; i < FILLER_BLADES; i++) {
  const az = rnd(0, Math.PI * 2);
  const r = PATCH_RADIUS * Math.sqrt(rng());
  const base = new THREE.Vector3(Math.cos(az) * r, 0, Math.sin(az) * r);
  geoms.push(
    bladeGeometry(base, az + rnd(-0.9, 0.9), {
      length: rnd(0.16, 0.34),
      width: rnd(0.01, 0.016),
      lean: rnd(0.25, 0.6),
      droop: rnd(0.8, 1.6),
      twist: rnd(-0.9, 0.9),
      palette: rng() < 0.25 ? dryPalette() : greenPalette(),
      phase: rng(),
      weightScale: 0.35 // hugs the ground → barely moves
    })
  );
}

// Seed-head stalks: a few taller, straighter stems with wheat-toned panicles.
const STALKS = 9;
for (let i = 0; i < STALKS; i++) {
  const az = rnd(0, Math.PI * 2);
  const r = PATCH_RADIUS * 0.7 * Math.sqrt(rng());
  const base = new THREE.Vector3(Math.cos(az) * r, 0, Math.sin(az) * r);
  const phase = rng();
  const length = rnd(1.0, 1.25);
  const lean = rnd(0.03, 0.12);
  const droop = rnd(0.12, 0.3);
  geoms.push(
    bladeGeometry(base, az + rnd(-0.5, 0.5), {
      length,
      width: rnd(0.006, 0.008),
      lean,
      droop,
      twist: 0,
      palette: STALK_PALETTE(),
      phase,
      tipWidth: 0.55 // keep the stem visible right up to the seed head
    })
  );
  // Tip position ≈ integrate the same spine the stalk used (cheap re-walk).
  const tip = base.clone();
  const leanDir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  for (let s = 1; s <= 6; s++) {
    const t = s / 6;
    const bend = lean + droop * t * t;
    tip.addScaledVector(UP.clone().multiplyScalar(Math.cos(bend)).addScaledVector(leanDir, Math.sin(bend)).normalize(), length / 6);
  }
  geoms.push(...seedHeadGeometry(tip, leanDir, phase));
}

const grassGeometry = mergeGeometries(geoms, false);

// ---------------------------------------------------------------------------
// Export with gltf-transform.
// ---------------------------------------------------------------------------
const doc = new Document();
const buffer = doc.createBuffer("bin");
const scene = doc.createScene("TallGrass");
doc.getRoot().setDefaultScene(scene);

const grassMat = doc
  .createMaterial("tall-grass")
  .setDoubleSided(true)
  .setMetallicFactor(0)
  .setRoughnessFactor(0.95);

const posArr = new Float32Array(grassGeometry.attributes.position.array);
const nrmArr = new Float32Array(grassGeometry.attributes.normal.array);
const colArr = new Float32Array(grassGeometry.attributes.color.array);
const uvArr = new Float32Array(grassGeometry.attributes.uv.array);
const count = posArr.length / 3;
const IdxArr = count > 65535 ? Uint32Array : Uint16Array;
const idxArr = new IdxArr(grassGeometry.index.array);

const prim = doc
  .createPrimitive()
  .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(posArr))
  .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(nrmArr))
  .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(colArr))
  .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setBuffer(buffer).setArray(uvArr))
  .setIndices(doc.createAccessor().setType("SCALAR").setBuffer(buffer).setArray(idxArr))
  .setMaterial(grassMat);

const mesh = doc.createMesh("TallGrass").addPrimitive(prim);
scene.addChild(doc.createNode("TallGrass").setMesh(mesh));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await io.write(OUT_PATH, doc);
await copyFile(OUT_PATH, PUBLIC_PATH);

const bb = new THREE.Box3().setFromBufferAttribute(grassGeometry.attributes.position);
console.log(`Wrote ${OUT_PATH}`);
console.log(`Copied to ${PUBLIC_PATH}`);
console.log(`Vertices: ${count}, triangles: ${idxArr.length / 3}`);
console.log(
  `Bounds: x [${bb.min.x.toFixed(2)}, ${bb.max.x.toFixed(2)}], y [${bb.min.y.toFixed(2)}, ${bb.max.y.toFixed(2)}], z [${bb.min.z.toFixed(2)}, ${bb.max.z.toFixed(2)}]`
);
