// Swap an avatar's head: delete the original head triangles from the skinned
// body mesh and graft a replacement head GLB onto the `Head` bone so it follows
// the skeleton's animations. The replacement head stays a rigid (non-skinned)
// mesh with its own material/texture, which keeps it out of the recolor shader
// (BlockyAvatar only recolors skinned meshes).
//
// Usage: node scripts/swap-avatar-head.mjs
//
// Produces apps/web/public/avatars/azure-vanguard-hd.glb

import { NodeIO } from "@gltf-transform/core";
import { mergeDocuments } from "@gltf-transform/functions";

// ── Config ───────────────────────────────────────────────────────────────────
const BODY_PATH = "apps/web/public/avatars/azure-vanguard.glb";
const HEAD_PATH = "GLBs/vanguard-head.glb";
const OUT_PATH = "apps/web/public/avatars/azure-vanguard-hd.glb";

const HEAD_BONE = "Head";
// Joints whose vertices form the original head (Head + head_end). Indices are
// resolved by name from the skin so this stays robust if joint order changes.
const HEAD_JOINT_NAMES = ["Head", "head_end"];
// A triangle is removed when the average head-weight of its 3 vertices exceeds
// this. 0.5 cleanly drops the head while keeping the neck/jaw blend ring.
const HEAD_TRIANGLE_THRESHOLD = 0.5;

// Where the replacement head's local origin (its base, authored at Y=0) lands in
// world space. Defaults align the base to the original neck-seam centre; tune
// these if the head needs nudging forward/back or up/down.
const PLACE_X = -0.005;
const PLACE_Y = 1.3243; // original head bbox bottom; top lands at +head height
const PLACE_Z = 0.036;

// ── mat4 helpers (column-major, matching gltf-transform / glMatrix) ───────────
function mat4Multiply(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function mat4Invert(m) {
  const [
    m00, m01, m02, m03,
    m10, m11, m12, m13,
    m20, m21, m22, m23,
    m30, m31, m32, m33
  ] = m;
  const b00 = m00 * m11 - m01 * m10;
  const b01 = m00 * m12 - m02 * m10;
  const b02 = m00 * m13 - m03 * m10;
  const b03 = m01 * m12 - m02 * m11;
  const b04 = m01 * m13 - m03 * m11;
  const b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30;
  const b07 = m20 * m32 - m22 * m30;
  const b08 = m20 * m33 - m23 * m30;
  const b09 = m21 * m32 - m22 * m31;
  const b10 = m21 * m33 - m23 * m31;
  const b11 = m22 * m33 - m23 * m32;
  let det =
    b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) throw new Error("Head bone world matrix is non-invertible");
  det = 1.0 / det;
  return [
    (m11 * b11 - m12 * b10 + m13 * b09) * det,
    (m02 * b10 - m01 * b11 - m03 * b09) * det,
    (m31 * b05 - m32 * b04 + m33 * b03) * det,
    (m22 * b04 - m21 * b05 - m23 * b03) * det,
    (m12 * b08 - m10 * b11 - m13 * b07) * det,
    (m00 * b11 - m02 * b08 + m03 * b07) * det,
    (m32 * b02 - m30 * b05 - m33 * b01) * det,
    (m20 * b05 - m22 * b02 + m23 * b01) * det,
    (m10 * b10 - m11 * b08 + m13 * b06) * det,
    (m01 * b08 - m00 * b10 - m03 * b06) * det,
    (m30 * b04 - m31 * b02 + m33 * b00) * det,
    (m21 * b02 - m20 * b04 - m23 * b00) * det,
    (m11 * b07 - m10 * b09 - m12 * b06) * det,
    (m00 * b09 - m01 * b07 + m02 * b06) * det,
    (m31 * b01 - m30 * b03 - m32 * b00) * det,
    (m20 * b03 - m21 * b01 + m22 * b00) * det
  ];
}

function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────────
const io = new NodeIO();
const body = await io.read(BODY_PATH);
const head = await io.read(HEAD_PATH);
const bodyRoot = body.getRoot();

// 1. Resolve the Head bone and head joint indices.
const headBone = bodyRoot.listNodes().find((n) => n.getName() === HEAD_BONE);
if (!headBone) throw new Error(`Bone "${HEAD_BONE}" not found in body`);

const skin = bodyRoot.listSkins()[0];
const joints = skin.listJoints();
const headJointIdx = new Set(
  HEAD_JOINT_NAMES.map((name) => joints.findIndex((j) => j.getName() === name)).filter(
    (i) => i >= 0
  )
);
if (headJointIdx.size === 0) throw new Error("No head joints resolved from skin");

// 2. Delete head triangles from the skinned body primitive.
const charNode = bodyRoot.listNodes().find((n) => n.getMesh()?.listPrimitives().length);
const prim = charNode.getMesh().listPrimitives()[0];
const joints0 = prim.getAttribute("JOINTS_0").getArray();
const weights0 = prim.getAttribute("WEIGHTS_0").getArray();
const vertCount = prim.getAttribute("POSITION").getCount();

const headWeight = new Float32Array(vertCount);
for (let v = 0; v < vertCount; v++) {
  let w = 0;
  for (let k = 0; k < 4; k++) {
    if (headJointIdx.has(joints0[v * 4 + k])) w += weights0[v * 4 + k];
  }
  headWeight[v] = w;
}

const indices = prim.getIndices();
const idx = indices.getArray();
const kept = [];
let dropped = 0;
for (let t = 0; t < idx.length; t += 3) {
  const a = idx[t], b = idx[t + 1], c = idx[t + 2];
  const avg = (headWeight[a] + headWeight[b] + headWeight[c]) / 3;
  if (avg > HEAD_TRIANGLE_THRESHOLD) {
    dropped++;
    continue;
  }
  kept.push(a, b, c);
}
const IndexArray = idx.constructor;
indices.setArray(new IndexArray(kept));
console.log(`Body: dropped ${dropped} head triangles, kept ${kept.length / 3}.`);

// 3. Compute the head bone's rest world matrix and the head's bone-local matrix.
const headWorld = headBone.getWorldMatrix();
const invHeadWorld = mat4Invert(headWorld);
const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, PLACE_X, PLACE_Y, PLACE_Z, 1];
const childLocal = mat4Multiply(invHeadWorld, T);

// 4. Merge the head document and re-parent its node under the Head bone.
const headScene = head.getRoot().getDefaultScene() ?? head.getRoot().listScenes()[0];
const headNodeName = headScene.listChildren()[0].getName();

const bodyScenesBefore = new Set(bodyRoot.listScenes());
mergeDocuments(body, head);
const mergedHeadScene = bodyRoot
  .listScenes()
  .find((s) => !bodyScenesBefore.has(s));
const headNode = mergedHeadScene.listChildren().find((n) => n.getName() === headNodeName)
  ?? mergedHeadScene.listChildren()[0];

headNode.setMatrix(childLocal);
headBone.addChild(headNode);
mergedHeadScene.dispose();
bodyRoot.setDefaultScene(bodyScenesBefore.values().next().value);

// 5. Verify placement: transform the head mesh bbox into world space.
const headPrim = headNode.getMesh().listPrimitives()[0];
const pos = headPrim.getAttribute("POSITION").getArray();
const nodeWorld = headNode.getWorldMatrix();
let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos.length; i += 3) {
  const p = transformPoint(nodeWorld, [pos[i], pos[i + 1], pos[i + 2]]);
  for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], p[a]);
    max[a] = Math.max(max[a], p[a]);
  }
}
console.log("Grafted head world bbox (m):");
console.log(`  X ${min[0].toFixed(4)}..${max[0].toFixed(4)}`);
console.log(`  Y ${min[1].toFixed(4)}..${max[1].toFixed(4)}  (expected base ~${PLACE_Y})`);
console.log(`  Z ${min[2].toFixed(4)}..${max[2].toFixed(4)}`);

// 6. Consolidate onto a single buffer (merge left the head's buffer separate;
// GLB allows only one binary buffer).
const buffers = bodyRoot.listBuffers();
if (buffers.length > 1) {
  const primary = buffers[0];
  for (const accessor of bodyRoot.listAccessors()) accessor.setBuffer(primary);
  for (const extra of buffers.slice(1)) extra.dispose();
}

await io.write(OUT_PATH, body);
console.log(`\nWrote ${OUT_PATH}`);
