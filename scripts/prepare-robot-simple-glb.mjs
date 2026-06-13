// Reproportion the simple robot's floating head and add animated glowing eyes.
//
// What it does (all baked into the GLB, UVs untouched so the body/head texture
// keeps matching the original bake):
//   1. Splits the single fused mesh into "head" (Y >= SPLIT_Y) and "body".
//   2. Scales the head up a touch about its own centre and slides it down so it
//      floats just above the body instead of way up high.
//   3. Adds two unlit cyan glow eyes on the dark face plate, matching the
//      reference art (bright white-cyan core fading into the face).
//   4. Bakes a looping "LookAround" animation that:
//        a. Darts the eyes around now and then, returning to centre between glances.
//        b. Rotates the HeadPivot node in sync so the head follows the gaze.
//
// Source of truth is GLBs/robot-simple-raw.glb (the untouched original); the
// transform is not idempotent, so always regenerate from the raw file.
//
// Run: node scripts/prepare-robot-simple-glb.mjs [in.glb] [out.glb]

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { KHRMaterialsUnlit } from "@gltf-transform/extensions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const IN_PATH = resolve(process.argv[2] ?? resolve(__dirname, "../GLBs/robot-simple-raw.glb"));
const OUT_PATH = resolve(process.argv[3] ?? resolve(__dirname, "../GLBs/robot-simple.glb"));

// --- Tunables -------------------------------------------------------------
const SPLIT_Y = 2.2;          // head vs body cut (clear empty band 2.15..2.43)
const HEAD_PIVOT_Y = 3.218;   // head bbox centre Y in original space (scale about this)
const HEAD_SCALE = 1.05;      // head size relative to raw
const TARGET_GAP = 0.14;      // float gap between body top and head bottom
const BODY_TOP_Y = 2.044;     // measured body bbox max Y

// Eye placement (final model space, after the head transform).
const EYE_DX = 0.20;          // half the spacing between the two eyes
const EYE_Y_OFFSET = 0.06;    // above the head centre
const EYE_Z_PROUD = 0.05;     // sit proud of the face surface (extra clearance when eyes translate sideways)
const FACE_SURFACE_Z = 0.704; // pre-scale front-most Z at eye height
const EYE_R = 0.21;           // glow quad half-size (scaled up to hold visual size after 20% overall render shrink)
const EYE_SCALE_X = 0.9;      // horizontal eye travel multiplier (head rotation already covers most of the lateral movement)
const EYE_SCALE_Y = 1.4;      // vertical eye travel multiplier

// Head rotation: how far the head turns to follow the eye gaze direction.
const HEAD_YAW_FACTOR   = 2.2;  // radians of yaw per unit of eye dx  (~9.5° max)
const HEAD_PITCH_FACTOR = 1.8;  // radians of pitch per unit of eye dy (~6° max)
// -------------------------------------------------------------------------

const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
const doc = await io.read(IN_PATH);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const scene = root.getDefaultScene() ?? root.listScenes()[0];

// ── 1 + 2. Transform head vertices, track which are head ─────────────────
const headBottomScaled = HEAD_PIVOT_Y - (HEAD_PIVOT_Y - 2.436) * HEAD_SCALE;
const TRANSLATE_Y = BODY_TOP_Y + TARGET_GAP - headBottomScaled;
const HEAD_CENTRE_Y = HEAD_PIVOT_Y + TRANSLATE_Y;
const EYE_Y = HEAD_CENTRE_Y + EYE_Y_OFFSET;
const EYE_Z = FACE_SURFACE_Z * HEAD_SCALE + EYE_Z_PROUD;

console.log(
  `head: scale ${HEAD_SCALE}, dY ${TRANSLATE_Y.toFixed(3)}, ` +
  `new gap ${(headBottomScaled + TRANSLATE_Y - BODY_TOP_Y).toFixed(3)}`
);
console.log(`eyes: Y ${EYE_Y.toFixed(3)}, Z ${EYE_Z.toFixed(3)}, ±X ${EYE_DX}`);

const origPrim = root.listMeshes()[0].listPrimitives()[0];
const origMat  = origPrim.getMaterial();
const posAcc   = origPrim.getAttribute("POSITION");
const nrmAcc   = origPrim.getAttribute("NORMAL");
const uvAcc    = origPrim.getAttribute("TEXCOORD_0");
const idxAcc   = origPrim.getIndices();

const vertCount = posAcc.getCount();
const v = [0, 0, 0];
const isHead = new Uint8Array(vertCount);

for (let i = 0; i < vertCount; i++) {
  posAcc.getElement(i, v);
  if (v[1] >= SPLIT_Y) {
    isHead[i] = 1;
    v[0] = v[0] * HEAD_SCALE;
    v[1] = HEAD_PIVOT_Y + (v[1] - HEAD_PIVOT_Y) * HEAD_SCALE + TRANSLATE_Y;
    v[2] = v[2] * HEAD_SCALE;
    posAcc.setElement(i, v);
  }
}

// ── 3. Split the modified single mesh into head + body ────────────────────
// Read arrays after the head transform has been applied.
const posArr = posAcc.getArray();
const nrmArr = nrmAcc.getArray();
const uvArr  = uvAcc.getArray();
const idxArr = idxAcc.getArray();

// Separate triangles — no triangle straddles the gap (verified by Y histogram).
const headTris = [], bodyTris = [];
for (let t = 0; t < idxArr.length; t += 3) {
  const a = idxArr[t], b = idxArr[t + 1], c = idxArr[t + 2];
  (isHead[a] && isHead[b] && isHead[c] ? headTris : bodyTris).push(a, b, c);
}

// Compact a list of triangle vertex indices into dense typed arrays.
// headLocal = true → subtract HEAD_CENTRE_Y from Y so coords are pivot-relative.
function compactVerts(triIndices, headLocal) {
  const map = new Map();
  const pos = [], nrm = [], uv = [], idx = [];
  for (const oldIdx of triIndices) {
    if (!map.has(oldIdx)) {
      const n = map.size; map.set(oldIdx, n);
      let x = posArr[oldIdx * 3], y = posArr[oldIdx * 3 + 1], z = posArr[oldIdx * 3 + 2];
      if (headLocal) y -= HEAD_CENTRE_Y;
      pos.push(x, y, z);
      nrm.push(nrmArr[oldIdx * 3], nrmArr[oldIdx * 3 + 1], nrmArr[oldIdx * 3 + 2]);
      uv.push(uvArr[oldIdx * 2], uvArr[oldIdx * 2 + 1]);
    }
    idx.push(map.get(oldIdx));
  }
  const Idx = map.size > 65535 ? Uint32Array : Uint16Array;
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    uv: new Float32Array(uv),
    idx: new Idx(idx),
  };
}

const bodyVerts = compactVerts(bodyTris, false);
const headVerts = compactVerts(headTris, true);

function makePrim(verts, mat) {
  return doc
    .createPrimitive()
    .setMaterial(mat)
    .setAttribute("POSITION",   doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(verts.pos))
    .setAttribute("NORMAL",     doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(verts.nrm))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setBuffer(buffer).setArray(verts.uv))
    .setIndices(                doc.createAccessor().setType("SCALAR").setBuffer(buffer).setArray(verts.idx));
}

// Replace the existing node's mesh with body-only geometry.
const bodyNode = root.listNodes()[0];
bodyNode.setMesh(doc.createMesh("robot-body").addPrimitive(makePrim(bodyVerts, origMat)));

// New node for the head — pivot at HEAD_CENTRE_Y so it can rotate about its own centre.
const headPivotNode = doc
  .createNode("HeadPivot")
  .setMesh(doc.createMesh("robot-head").addPrimitive(makePrim(headVerts, origMat)))
  .setTranslation([0, HEAD_CENTRE_Y, 0]);
scene.addChild(headPivotNode);

// ── 4. Eye glow texture ───────────────────────────────────────────────────
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="#f2ffff" stop-opacity="1"/>
      <stop offset="16%" stop-color="#aef2fb" stop-opacity="1"/>
      <stop offset="38%" stop-color="#43d2ea" stop-opacity="0.98"/>
      <stop offset="62%" stop-color="#22a7c6" stop-opacity="0.62"/>
      <stop offset="82%" stop-color="#1b89a8" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#157591" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="128" cy="128" r="128" fill="url(#g)"/>
</svg>`;
const glowPng = await sharp(Buffer.from(SVG)).png().toBuffer();
const glowTex = doc.createTexture("robot-eye-glow").setImage(glowPng).setMimeType("image/png");

const unlitExt = doc.createExtension(KHRMaterialsUnlit);
const eyeMat = doc
  .createMaterial("robot-eye")
  .setBaseColorFactor([1, 1, 1, 1])
  .setBaseColorTexture(glowTex)
  .setAlphaMode("BLEND")
  .setDoubleSided(false)
  .setRoughnessFactor(1)
  .setMetallicFactor(0);
eyeMat.setExtension("KHR_materials_unlit", unlitExt.createUnlit());

const r = EYE_R;
const eyePrim = doc
  .createPrimitive()
  .setMaterial(eyeMat)
  .setAttribute("POSITION",   doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(
    new Float32Array([-r, -r, 0,  r, -r, 0,  r, r, 0,  -r, r, 0])
  ))
  .setAttribute("NORMAL",     doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(
    new Float32Array([0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1])
  ))
  .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setBuffer(buffer).setArray(
    new Float32Array([0, 1,  1, 1,  1, 0,  0, 0])
  ))
  .setIndices(doc.createAccessor().setType("SCALAR").setBuffer(buffer).setArray(
    new Uint16Array([0, 1, 2,  0, 2, 3])
  ));
const eyeMesh = doc.createMesh("robot-eye").addPrimitive(eyePrim);

// EyeRig is a child of HeadPivot so it rotates with the head — preventing the head
// sphere from clipping through the eye quads when the head turns.
// Translation is in HeadPivot-local space: (0, EYE_Y_OFFSET, EYE_Z).
const eyeRig = doc.createNode("EyeRig").setTranslation([0, EYE_Y_OFFSET, EYE_Z]);
eyeRig.addChild(doc.createNode("EyeL").setMesh(eyeMesh).setTranslation([-EYE_DX, 0, 0]));
eyeRig.addChild(doc.createNode("EyeR").setMesh(eyeMesh).setTranslation([ EYE_DX, 0, 0]));
headPivotNode.addChild(eyeRig);

// ── 5. "LookAround" animation ─────────────────────────────────────────────
// Channel A: EyeRig translation (world-space glance offsets).
// Channel B: HeadPivot rotation (quaternion, follows gaze direction).
//
// Each row: [time, dx, dy] where dx/dy are offsets from the eye centre.
const GLANCES = [
  [0.0,  0,      0     ],
  [3.0,  0,      0     ],
  [3.18, 0.15,   0.024 ], // glance right
  [5.0,  0.15,   0.024 ],
  [5.18, 0,      0     ],
  [6.6,  0,      0     ],
  [6.78, -0.15,  0.024 ], // glance left
  [8.3,  -0.15,  0.024 ],
  [8.48, 0,      0     ],
  [9.7,  0,      0     ],
  [9.88, 0.0,    0.12  ], // glance up
  [10.9, 0.0,    0.12  ],
  [11.08,0,      0     ],
  [12.1, 0,      0     ],
  [12.28,-0.10, -0.07  ], // glance down-left
  [13.3, -0.10, -0.07  ],
  [13.48,0,      0     ],
  [14.0, 0,      0     ], // seamless loop
];

// Quaternion for intrinsic YX rotation: yaw around Y then pitch around local X.
// GLTF quaternion format: [x, y, z, w].
function glanceQuat(dx, dy) {
  const yaw   =  dx * HEAD_YAW_FACTOR;   // positive Y rotation = nose toward +X (robot's own right)
  const pitch = -dy * HEAD_PITCH_FACTOR;  // negative = look up when dy > 0
  const cy = Math.cos(yaw * 0.5),   sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
  // q = q_Y * q_X  (yaw first, then pitch in the rotated frame)
  return [cy * sp, sy * cp, -sy * sp, cy * cp]; // [x, y, z, w]
}

const times    = new Float32Array(GLANCES.length);
const eyeTrans = new Float32Array(GLANCES.length * 3);
const headRots = new Float32Array(GLANCES.length * 4);

GLANCES.forEach(([t, dx, dy], i) => {
  times[i] = t;
  // Eye translation: HeadPivot-local space, scaled independently per axis.
  eyeTrans[i * 3]     = dx * EYE_SCALE_X;
  eyeTrans[i * 3 + 1] = EYE_Y_OFFSET + dy * EYE_SCALE_Y;
  eyeTrans[i * 3 + 2] = EYE_Z;
  // Head rotation: driven by raw dx/dy — unchanged from before.
  const q = glanceQuat(dx, dy);
  headRots[i * 4]     = q[0];
  headRots[i * 4 + 1] = q[1];
  headRots[i * 4 + 2] = q[2];
  headRots[i * 4 + 3] = q[3];
});

const inputAcc      = doc.createAccessor("look_time").setType("SCALAR").setBuffer(buffer).setArray(times);
const eyeOutputAcc  = doc.createAccessor("look_eye_trans").setType("VEC3").setBuffer(buffer).setArray(eyeTrans);
const headOutputAcc = doc.createAccessor("look_head_rot").setType("VEC4").setBuffer(buffer).setArray(headRots);

const eyeSampler   = doc.createAnimationSampler().setInterpolation("LINEAR").setInput(inputAcc).setOutput(eyeOutputAcc);
const headSampler  = doc.createAnimationSampler().setInterpolation("LINEAR").setInput(inputAcc).setOutput(headOutputAcc);
const eyeChannel   = doc.createAnimationChannel().setTargetNode(eyeRig).setTargetPath("translation").setSampler(eyeSampler);
const headChannel  = doc.createAnimationChannel().setTargetNode(headPivotNode).setTargetPath("rotation").setSampler(headSampler);

doc.createAnimation("LookAround")
  .addSampler(eyeSampler).addSampler(headSampler)
  .addChannel(eyeChannel).addChannel(headChannel);

await writeFile(OUT_PATH, Buffer.from(await io.writeBinary(doc)));
console.log(`Wrote ${OUT_PATH}`);
