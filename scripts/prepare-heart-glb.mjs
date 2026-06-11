// Add a realistic, looping "heartbeat" pump to the heart GLB.
//
// The source mesh is a static anatomical sculpt (single shell, great vessels
// modelled as open stumps at the base). We add ONE morph target representing
// peak systole and drive its weight with a physiological cardiac-cycle curve:
//   - ventricular walls squeeze radially toward a per-height centerline
//   - the heart shortens slightly along its long axis (apex draws up)
//   - the valve plane + great vessels stay anchored (no displacement)
// Target normals are recomputed for the deformed shape so shading stays correct.
//
// Run:  node scripts/prepare-heart-glb.mjs [in.glb] [out.glb]
// Default: GLBs/heart.glb -> GLBs/heart-beating.glb

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const IN_PATH = resolve(process.argv[2] ?? resolve(__dirname, "../GLBs/heart.glb"));
const OUT_PATH = resolve(process.argv[3] ?? resolve(__dirname, "../GLBs/heart-beating.glb"));

// --- Contraction tuning (epicardial surface motion, not chamber volume) ---
const RADIAL_SQUEEZE = 0.12; // 12% inward at the mid-ventricle at peak systole
const LONG_SHORTEN = 0.055; // 5.5% long-axis shortening (apex draws toward base)
const VENT_FULL = 0.45; // yNorm below this contracts fully
const VENT_FADE = 0.82; // yNorm above this is anchored (valve plane + vessels)

// --- Cardiac cycle (resting ~65 bpm) ---
const PERIOD = 0.92; // seconds per beat
const FPS = 60;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Asymmetric gaussian pulse (faster rise, slower fall when wR > wL).
const pulse = (t, c, wL, wR, h) => {
  const w = t < c ? wL : wR;
  return h * Math.exp(-((t - c) ** 2) / (2 * w * w));
};

// Weight over one cardiac cycle: small atrial pre-kick, then ventricular systole.
const beatWeight = (t) =>
  pulse(t, 0.085, 0.03, 0.04, 0.22) + // atrial "lub"
  pulse(t, 0.24, 0.05, 0.085, 1.0); //  ventricular "dub" (the big squeeze)

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(IN_PATH);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];

  const mesh = root.listMeshes()[0];
  const prim = mesh.listPrimitives()[0];
  const posA = prim.getAttribute("POSITION");
  const norA = prim.getAttribute("NORMAL");
  const idxA = prim.getIndices();
  const vcount = posA.getCount();

  // Base positions.
  const base = new Float32Array(vcount * 3);
  const p = [0, 0, 0];
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let v = 0; v < vcount; v++) {
    posA.getElement(v, p);
    base[v * 3] = p[0];
    base[v * 3 + 1] = p[1];
    base[v * 3 + 2] = p[2];
    if (p[1] < yMin) yMin = p[1];
    if (p[1] > yMax) yMax = p[1];
  }
  const H = yMax - yMin;

  // Per-height centerline (binned mean of x,z) so the squeeze follows the
  // heart's curved long axis instead of a single straight global axis.
  const BINS = 24;
  const sumX = new Float64Array(BINS);
  const sumZ = new Float64Array(BINS);
  const cnt = new Float64Array(BINS);
  const binOf = (y) => Math.min(BINS - 1, Math.max(0, Math.floor(((y - yMin) / H) * BINS)));
  for (let v = 0; v < vcount; v++) {
    const b = binOf(base[v * 3 + 1]);
    sumX[b] += base[v * 3];
    sumZ[b] += base[v * 3 + 2];
    cnt[b] += 1;
  }
  const clX = new Float64Array(BINS);
  const clZ = new Float64Array(BINS);
  for (let b = 0; b < BINS; b++) {
    clX[b] = cnt[b] ? sumX[b] / cnt[b] : 0;
    clZ[b] = cnt[b] ? sumZ[b] / cnt[b] : 0;
  }
  // Smooth the centerline (3-tap) to avoid bin jitter.
  const sm = (arr) => arr.map((_, i) => (arr[Math.max(0, i - 1)] + arr[i] + arr[Math.min(BINS - 1, i + 1)]) / 3);
  const cX = sm(clX);
  const cZ = sm(clZ);
  const centerAt = (y) => {
    const f = Math.min(BINS - 1 - 1e-6, Math.max(0, ((y - yMin) / H) * BINS - 0.5));
    const b0 = Math.floor(f);
    const b1 = Math.min(BINS - 1, b0 + 1);
    const t = f - b0;
    return [cX[b0] * (1 - t) + cX[b1] * t, cZ[b0] * (1 - t) + cZ[b1] * t];
  };

  // Deformed (peak-systole) positions.
  const deformed = new Float32Array(vcount * 3);
  for (let v = 0; v < vcount; v++) {
    const x = base[v * 3];
    const y = base[v * 3 + 1];
    const z = base[v * 3 + 2];
    const yN = (y - yMin) / H;
    const wv = 1 - smoothstep(VENT_FULL, VENT_FADE, yN); // 1 in ventricles -> 0 at base
    const [cx, cz] = centerAt(y);
    const squeeze = RADIAL_SQUEEZE * wv;
    const nx = x - (x - cx) * squeeze;
    const nz = z - (z - cz) * squeeze;
    // Long-axis shortening: draw points up toward the base plane, gated by wv
    // and naturally zero at the base (yMax - y -> 0 there).
    const ny = y + (yMax - y) * LONG_SHORTEN * wv;
    deformed[v * 3] = nx;
    deformed[v * 3 + 1] = ny;
    deformed[v * 3 + 2] = nz;
  }

  // Recompute smooth normals on the deformed shape (area-weighted, welded by
  // position so UV-seam splits share a normal), then store delta normals.
  const Q = 1e4;
  const keyToId = new Map();
  const remap = new Int32Array(vcount);
  for (let v = 0; v < vcount; v++) {
    const k = `${Math.round(deformed[v * 3] * Q)},${Math.round(deformed[v * 3 + 1] * Q)},${Math.round(deformed[v * 3 + 2] * Q)}`;
    // weld by BASE position (topology is identical) to keep seam verts together
    const kb = `${Math.round(base[v * 3] * Q)},${Math.round(base[v * 3 + 1] * Q)},${Math.round(base[v * 3 + 2] * Q)}`;
    let id = keyToId.get(kb);
    if (id === undefined) {
      id = keyToId.size;
      keyToId.set(kb, id);
    }
    remap[v] = id;
    void k;
  }
  const weldN = keyToId.size;
  const accN = new Float64Array(weldN * 3);
  const ni = idxA.getCount();
  for (let i = 0; i < ni; i += 3) {
    const a = idxA.getScalar(i);
    const b = idxA.getScalar(i + 1);
    const c = idxA.getScalar(i + 2);
    const ax = deformed[a * 3], ay = deformed[a * 3 + 1], az = deformed[a * 3 + 2];
    const bx = deformed[b * 3], by = deformed[b * 3 + 1], bz = deformed[b * 3 + 2];
    const cx2 = deformed[c * 3], cy = deformed[c * 3 + 1], cz2 = deformed[c * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx2 - ax, vy = cy - ay, vz = cz2 - az;
    // un-normalized cross product = area-weighted face normal
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    for (const idx of [a, b, c]) {
      const r = remap[idx];
      accN[r * 3] += fx;
      accN[r * 3 + 1] += fy;
      accN[r * 3 + 2] += fz;
    }
  }
  const baseNrm = [0, 0, 0];
  const posDelta = new Float32Array(vcount * 3);
  const nrmDelta = new Float32Array(vcount * 3);
  for (let v = 0; v < vcount; v++) {
    posDelta[v * 3] = deformed[v * 3] - base[v * 3];
    posDelta[v * 3 + 1] = deformed[v * 3 + 1] - base[v * 3 + 1];
    posDelta[v * 3 + 2] = deformed[v * 3 + 2] - base[v * 3 + 2];
    const r = remap[v];
    let nx = accN[r * 3], ny = accN[r * 3 + 1], nz = accN[r * 3 + 2];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    norA.getElement(v, baseNrm);
    nrmDelta[v * 3] = nx - baseNrm[0];
    nrmDelta[v * 3 + 1] = ny - baseNrm[1];
    nrmDelta[v * 3 + 2] = nz - baseNrm[2];
  }

  // Build morph target.
  const posDeltaAcc = doc.createAccessor("systole_dPos").setType("VEC3").setBuffer(buffer).setArray(posDelta);
  const nrmDeltaAcc = doc.createAccessor("systole_dNrm").setType("VEC3").setBuffer(buffer).setArray(nrmDelta);
  const target = doc.createPrimitiveTarget("systole").setAttribute("POSITION", posDeltaAcc).setAttribute("NORMAL", nrmDeltaAcc);
  prim.addTarget(target);
  mesh.setWeights([0]); // rest = relaxed (diastolic) base shape

  // Sample the weight curve over one cardiac cycle (seamless loop).
  const frames = Math.round(PERIOD * FPS);
  const times = new Float32Array(frames + 1);
  const weights = new Float32Array(frames + 1);
  for (let i = 0; i <= frames; i++) {
    const t = (i / frames) * PERIOD;
    times[i] = t;
    weights[i] = beatWeight(t);
  }
  weights[frames] = weights[0]; // force exact loop closure

  const inputAcc = doc.createAccessor("beat_time").setType("SCALAR").setBuffer(buffer).setArray(times);
  const outputAcc = doc.createAccessor("beat_weight").setType("SCALAR").setBuffer(buffer).setArray(weights);
  const sampler = doc.createAnimationSampler().setInterpolation("LINEAR").setInput(inputAcc).setOutput(outputAcc);

  const meshNode = root.listNodes().find((n) => n.getMesh() === mesh);
  const channel = doc.createAnimationChannel().setTargetNode(meshNode).setTargetPath("weights").setSampler(sampler);
  doc.createAnimation("Heartbeat").addSampler(sampler).addChannel(channel);

  await io.write(OUT_PATH, doc);

  const peak = Math.max(...weights);
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`  morph target "systole": ${vcount} verts, radial squeeze ${(RADIAL_SQUEEZE * 100).toFixed(0)}%, long shorten ${(LONG_SHORTEN * 100).toFixed(1)}%`);
  console.log(`  animation "Heartbeat": ${frames + 1} keys over ${PERIOD}s (~${(60 / PERIOD).toFixed(0)} bpm), peak weight ${peak.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
