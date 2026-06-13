// Reproportion the simple robot's floating head and add animated glowing eyes.
//
// What it does (all baked into the GLB, UVs untouched so the body/head texture
// keeps matching the original bake):
//   1. Splits the single fused mesh into "head" (Y >= SPLIT_Y) and "body".
//   2. Scales the head up a touch about its own centre and slides it down so it
//      floats just above the body instead of way up high.
//   3. Adds two unlit cyan glow eyes on the dark face plate, matching the
//      reference art (bright white-cyan core fading into the face).
//   4. Bakes a looping "LookAround" animation that darts the eyes around now and
//      then, returning to centre between glances.
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
const HEAD_PIVOT_Y = 3.218;   // head bbox centre Y (scale about this)
const HEAD_SCALE = 1.05;      // "a bit larger" (reduced from 1.16 per design feedback)
const TARGET_GAP = 0.14;      // small float gap between body top and head bottom
const BODY_TOP_Y = 2.044;     // measured body bbox max Y

// Eye placement (final model space, after the head transform).
const EYE_DX = 0.20;          // half the spacing between the two eyes
const EYE_Y_OFFSET = 0.06;    // above the head centre
const EYE_Z_PROUD = 0.02;     // sit just proud of the face surface
const FACE_SURFACE_Z = 0.704; // pre-scale front-most Z at eye height
const EYE_R = 0.21;           // glow quad half-size (scaled up 1.25× to hold visual size after 20% overall shrink)
// -------------------------------------------------------------------------

const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
const doc = await io.read(IN_PATH);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const scene = root.getDefaultScene() ?? root.listScenes()[0];

// 1 + 2. Reproportion the head in place (POSITION only; UVs + normals untouched).
const headBottomScaled = HEAD_PIVOT_Y - (HEAD_PIVOT_Y - 2.436) * HEAD_SCALE;
const TRANSLATE_Y = BODY_TOP_Y + TARGET_GAP - headBottomScaled;

const prim = root.listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute("POSITION");
const v = [0, 0, 0];
for (let i = 0; i < pos.getCount(); i++) {
  pos.getElement(i, v);
  if (v[1] >= SPLIT_Y) {
    v[0] = v[0] * HEAD_SCALE;
    v[1] = HEAD_PIVOT_Y + (v[1] - HEAD_PIVOT_Y) * HEAD_SCALE + TRANSLATE_Y;
    v[2] = v[2] * HEAD_SCALE;
    pos.setElement(i, v);
  }
}

const HEAD_CENTRE_Y = HEAD_PIVOT_Y + TRANSLATE_Y;
const EYE_Y = HEAD_CENTRE_Y + EYE_Y_OFFSET;
const EYE_Z = FACE_SURFACE_Z * HEAD_SCALE + EYE_Z_PROUD;

console.log(
  `head: scale ${HEAD_SCALE}, dY ${TRANSLATE_Y.toFixed(3)}, ` +
  `new gap ${(headBottomScaled + TRANSLATE_Y - BODY_TOP_Y).toFixed(3)}`
);
console.log(`eyes: Y ${EYE_Y.toFixed(3)}, Z ${EYE_Z.toFixed(3)}, ±X ${EYE_DX}`);

// 3. Eye glow texture: bright white-cyan core fading to transparent at the rim.
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

// One eye quad facing +Z, instanced by both eye nodes.
const r = EYE_R;
const eyePrim = doc
  .createPrimitive()
  .setMaterial(eyeMat)
  .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(
    new Float32Array([-r, -r, 0, r, -r, 0, r, r, 0, -r, r, 0])
  ))
  .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
  ))
  .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setBuffer(buffer).setArray(
    new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])
  ))
  .setIndices(doc.createAccessor().setType("SCALAR").setBuffer(buffer).setArray(
    new Uint16Array([0, 1, 2, 0, 2, 3])
  ));
const eyeMesh = doc.createMesh("robot-eye").addPrimitive(eyePrim);

const eyeRig = doc.createNode("EyeRig").setTranslation([0, EYE_Y, EYE_Z]);
eyeRig.addChild(doc.createNode("EyeL").setMesh(eyeMesh).setTranslation([-EYE_DX, 0, 0]));
eyeRig.addChild(doc.createNode("EyeR").setMesh(eyeMesh).setTranslation([EYE_DX, 0, 0]));
scene.addChild(eyeRig);

// 4. "LookAround" — mostly centred, with occasional quick saccades. Loops at 14s.
// Each row: [time, dx, dy] applied on top of the rig's resting translation.
const GLANCES = [
  [0.0, 0, 0],
  [3.0, 0, 0],
  [3.18, 0.075, 0.012], // glance right
  [5.0, 0.075, 0.012],
  [5.18, 0, 0],
  [6.6, 0, 0],
  [6.78, -0.075, 0.012], // glance left
  [8.3, -0.075, 0.012],
  [8.48, 0, 0],
  [9.7, 0, 0],
  [9.88, 0.0, 0.06], // glance up
  [10.9, 0.0, 0.06],
  [11.08, 0, 0],
  [12.1, 0, 0],
  [12.28, -0.05, -0.035], // glance down-left
  [13.3, -0.05, -0.035],
  [13.48, 0, 0],
  [14.0, 0, 0], // back to centre (seamless loop)
];
const times = new Float32Array(GLANCES.length);
const trans = new Float32Array(GLANCES.length * 3);
GLANCES.forEach(([t, dx, dy], i) => {
  times[i] = t;
  trans[i * 3] = dx;
  trans[i * 3 + 1] = EYE_Y + dy;
  trans[i * 3 + 2] = EYE_Z;
});
const inputAcc = doc.createAccessor("look_time").setType("SCALAR").setBuffer(buffer).setArray(times);
const outputAcc = doc.createAccessor("look_trans").setType("VEC3").setBuffer(buffer).setArray(trans);
const sampler = doc.createAnimationSampler().setInterpolation("LINEAR").setInput(inputAcc).setOutput(outputAcc);
const channel = doc.createAnimationChannel().setTargetNode(eyeRig).setTargetPath("translation").setSampler(sampler);
doc.createAnimation("LookAround").addSampler(sampler).addChannel(channel);

await writeFile(OUT_PATH, Buffer.from(await io.writeBinary(doc)));
console.log(`Wrote ${OUT_PATH}`);
