// Build the "Sprocket-Bot" world-host GLB — a high-definition stylized model of
// the brass-and-copper steampunk robot reference image. We assemble it from
// three.js geometry generators (smooth, high-segment surfaces), bake every
// part's transform into world-space position/normal arrays, then merge by
// material and emit a single glTF 2.0 binary with @gltf-transform/core.
//
// The output is intentionally texture-free and uses only core glTF features
// (PBR metallic-roughness + emissive, no extensions) so it also passes the
// custom room-object upload validator (validateCustomRoomObjectAsset):
//   - triangle-only primitives, POSITION present
//   - no external buffer/image URIs (single embedded GLB buffer)
//   - no disallowed glTF extensions, no embedded textures
//
// Run:  node scripts/build-sprocket-bot-glb.mjs
// Out:  apps/web/public/world-hosts/sprocket-bot.glb

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  ConeGeometry,
  TubeGeometry,
  LatheGeometry,
  ExtrudeGeometry,
  Shape,
  Curve,
  Vector2,
  Vector3,
  Matrix3,
  Matrix4,
  Euler
} from "three";
import { Document, NodeIO } from "@gltf-transform/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../apps/web/public/world-hosts/sprocket-bot.glb");

// ── Material palette (PBR metallic-roughness, baked vertex-free colours) ──────
// colour is linear-ish sRGB hex; emissive given as [r,g,b] 0..1 (core glTF, no
// emissive-strength extension so it stays within the upload allow-list).
// Metalness deliberately kept in the 0.3–0.6 range (like the procedural retro
// robot): the room scene has no environment map, so fully-metallic surfaces
// would render near-black. Mid metalness + brighter base colours read well
// under the room's directional lights while keeping a polished-brass look.
const MATERIALS = {
  brass: { hex: "#d6ac4e", metalness: 0.5, roughness: 0.38 },
  brassDark: { hex: "#a07f31", metalness: 0.5, roughness: 0.48 },
  copper: { hex: "#d77a48", metalness: 0.5, roughness: 0.36 },
  copperDark: { hex: "#a85a32", metalness: 0.5, roughness: 0.44 },
  steelBlue: { hex: "#4a82a0", metalness: 0.42, roughness: 0.46 },
  steelBlueDark: { hex: "#356379", metalness: 0.42, roughness: 0.5 },
  gunmetal: { hex: "#7c848a", metalness: 0.55, roughness: 0.42 },
  darkSteel: { hex: "#32383d", metalness: 0.5, roughness: 0.52 },
  rubber: { hex: "#1b1e22", metalness: 0.1, roughness: 0.85 },
  cream: { hex: "#f0e7cd", metalness: 0.1, roughness: 0.65 },
  needleRed: { hex: "#c84334", metalness: 0.25, roughness: 0.55 },
  valveRed: { hex: "#bb3a30", metalness: 0.3, roughness: 0.48 },
  dialGreen: { hex: "#37a368", metalness: 0.25, roughness: 0.55 },
  dialYellow: { hex: "#e2b53e", metalness: 0.25, roughness: 0.55 },
  glassBulb: { hex: "#fff4cf", metalness: 0, roughness: 0.15, emissive: [1.0, 0.86, 0.5] },
  // Named "eyeGlow" so the runtime avatar can find + pulse these by material name.
  eyeGlow: { hex: "#ff8a2e", metalness: 0.2, roughness: 0.25, emissive: [1.0, 0.5, 0.12] },
  eyeSocket: { hex: "#211a12", metalness: 0.35, roughness: 0.6 },
  wireRed: { hex: "#c2473a", metalness: 0.2, roughness: 0.7 },
  wireBlue: { hex: "#3a68c0", metalness: 0.2, roughness: 0.7 },
  wireYellow: { hex: "#d8aa3c", metalness: 0.2, roughness: 0.7 }
};

function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  const srgb = [(n >> 16 & 0xff) / 255, (n >> 8 & 0xff) / 255, (n & 0xff) / 255];
  // approximate sRGB -> linear so baseColorFactor reads correctly in three.js
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
}

// ── Part accumulator ─────────────────────────────────────────────────────────
/** @type {Array<{positions:Float32Array,normals:Float32Array,indices:Uint32Array,material:string}>} */
const parts = [];

const _m4 = new Matrix4();
const _nm = new Matrix3();
const _euler = new Euler();
const _pos = new Vector3();
const _scl = new Vector3();
const _v = new Vector3();

/**
 * Bake a three.js geometry into world space and stash it as a part.
 * opts: { pos:[x,y,z], rot:[x,y,z] radians, scale:number|[x,y,z] }
 */
function add(geometry, material, opts = {}) {
  const pos = opts.pos ?? [0, 0, 0];
  const rot = opts.rot ?? [0, 0, 0];
  const scale = opts.scale ?? 1;
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];

  _pos.set(pos[0], pos[1], pos[2]);
  _euler.set(rot[0], rot[1], rot[2], "XYZ");
  _scl.set(s[0], s[1], s[2]);
  // Compose T * R * S into _m4 (rotation then scale columns, then translation).
  _m4.makeRotationFromEuler(_euler);
  _m4.scale(_scl);
  _m4.setPosition(_pos);
  _nm.getNormalMatrix(_m4);

  const srcPos = geometry.attributes.position.array;
  const srcNorm = geometry.attributes.normal ? geometry.attributes.normal.array : null;
  const count = srcPos.length / 3;

  const outPos = new Float32Array(srcPos.length);
  const outNorm = new Float32Array(srcPos.length);
  for (let i = 0; i < count; i++) {
    _v.set(srcPos[i * 3], srcPos[i * 3 + 1], srcPos[i * 3 + 2]).applyMatrix4(_m4);
    outPos[i * 3] = _v.x; outPos[i * 3 + 1] = _v.y; outPos[i * 3 + 2] = _v.z;
    if (srcNorm) {
      _v.set(srcNorm[i * 3], srcNorm[i * 3 + 1], srcNorm[i * 3 + 2]).applyMatrix3(_nm).normalize();
      outNorm[i * 3] = _v.x; outNorm[i * 3 + 1] = _v.y; outNorm[i * 3 + 2] = _v.z;
    } else {
      outNorm[i * 3 + 1] = 1;
    }
  }

  let indices;
  if (geometry.index) {
    indices = Uint32Array.from(geometry.index.array);
  } else {
    indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
  }
  parts.push({ positions: outPos, normals: outNorm, indices, material });
  geometry.dispose?.();
}

// ── Geometry helpers ─────────────────────────────────────────────────────────
const DEG = Math.PI / 180;

/** A toothed gear as an extruded shape. */
function gearGeometry({ teeth = 12, outer = 0.1, root = 0.082, bore = 0.03, depth = 0.03 }) {
  const shape = new Shape();
  const steps = teeth * 2;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = i % 2 === 0 ? outer : root;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  if (bore > 0) {
    const hole = new Shape();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = Math.cos(a) * bore, y = Math.sin(a) * bore;
      if (i === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
    }
    shape.holes.push(hole);
  }
  const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.18, bevelSize: depth * 0.18, bevelSegments: 1, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/** A coil spring: a tube swept along a helix. */
function springGeometry({ height = 0.4, coilRadius = 0.07, tubeRadius = 0.018, turns = 5, tubular = 220 }) {
  class Helix extends Curve {
    getPoint(t, target = new Vector3()) {
      const a = turns * Math.PI * 2 * t;
      return target.set(Math.cos(a) * coilRadius, t * height - height / 2, Math.sin(a) * coilRadius);
    }
  }
  return new TubeGeometry(new Helix(), tubular, tubeRadius, 12, false);
}

/** A bent pipe through a few points. */
function pipeGeometry(points, tubeRadius = 0.022, tubular = 64) {
  class P extends Curve {
    getPoint(t, target = new Vector3()) {
      // Catmull-ish: sample the polyline smoothly
      const seg = (points.length - 1) * t;
      const i = Math.min(points.length - 2, Math.floor(seg));
      const f = seg - i;
      const a = points[i], b = points[i + 1];
      return target.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
    }
  }
  return new TubeGeometry(new P(), tubular, tubeRadius, 10, false);
}

/** A rounded boot via a lathe profile (sole + upper) — returns a side boot. */
function bootGeometry() {
  // profile in XY (x = radius from the heel axis), rough rounded shoe shell
  const pts = [
    new Vector2(0.0, 0.0),
    new Vector2(0.10, 0.0),
    new Vector2(0.115, 0.03),
    new Vector2(0.10, 0.075),
    new Vector2(0.072, 0.11),
    new Vector2(0.03, 0.125),
    new Vector2(0.0, 0.13)
  ];
  const geo = new LatheGeometry(pts, 28);
  geo.computeVertexNormals();
  return geo;
}

// ── Assemble the robot (Y up, faces +Z, feet at y=0, ~1.95 m tall) ───────────

function buildBoots() {
  for (const side of [-1, 1]) {
    const x = side * 0.2;
    // sole — a flattened, forward-stretched boot shell
    add(bootGeometry(), "darkSteel", { pos: [x, 0.0, 0.02], scale: [1.15, 1.0, 1.6] });
    // copper toe cap
    add(new SphereGeometry(0.07, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2), "copper", { pos: [x, 0.03, 0.14], scale: [1.1, 0.7, 1.2] });
    // heel rim
    add(new TorusGeometry(0.085, 0.018, 12, 28), "brass", { pos: [x, 0.03, 0.0], rot: [Math.PI / 2, 0, 0], scale: [1.1, 1.0, 1.6] });
    // ankle bolt
    add(new CylinderGeometry(0.05, 0.055, 0.07, 20), "gunmetal", { pos: [x, 0.16, 0.0] });
  }
}

function buildLegs() {
  for (const side of [-1, 1]) {
    const x = side * 0.2;
    // spring shank
    add(springGeometry({ height: 0.34, coilRadius: 0.066, tubeRadius: 0.017, turns: 6 }), "gunmetal", { pos: [x, 0.37, 0.0] });
    // knee joint
    add(new SphereGeometry(0.07, 24, 18), "brass", { pos: [x, 0.57, 0.0] });
    add(new CylinderGeometry(0.04, 0.04, 0.09, 18), "copper", { pos: [x, 0.63, 0.0] });
    // hex nut accents at knee
    add(new CylinderGeometry(0.052, 0.052, 0.03, 6), "brassDark", { pos: [x, 0.57, 0.07], rot: [Math.PI / 2, 0, 0] });
  }
  // pelvis block
  add(new CylinderGeometry(0.2, 0.23, 0.16, 32), "brass", { pos: [0, 0.7, 0] });
  add(new TorusGeometry(0.21, 0.022, 12, 36), "brassDark", { pos: [0, 0.64, 0], rot: [Math.PI / 2, 0, 0] });
}

function buildTorso() {
  const cy = 1.04; // torso centre
  // main barrel — brass
  add(new CylinderGeometry(0.34, 0.32, 0.62, 48), "brass", { pos: [0, cy, 0] });
  // blue front belly panel (slightly proud, curved) — a shallow segment of a larger cylinder
  add(new CylinderGeometry(0.345, 0.325, 0.5, 48, 1, true, -0.7, 1.4), "steelBlue", { pos: [0, cy, 0] });
  // domed shoulder top
  add(new SphereGeometry(0.34, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), "brass", { pos: [0, cy + 0.31, 0], scale: [1, 0.55, 1] });
  // belts top + bottom with rivets
  for (const by of [cy + 0.3, cy - 0.3]) {
    add(new TorusGeometry(0.335, 0.028, 14, 48), "brassDark", { pos: [0, by, 0], rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      add(new SphereGeometry(0.014, 10, 8), "brass", { pos: [Math.cos(a) * 0.335, by, Math.sin(a) * 0.335] });
    }
  }

  // ── glowing belly porthole ──
  add(new TorusGeometry(0.105, 0.03, 16, 40), "copper", { pos: [0, cy - 0.05, 0.33], rot: [Math.PI / 2, 0, 0] });
  add(new CylinderGeometry(0.095, 0.095, 0.03, 32), "eyeSocket", { pos: [0, cy - 0.05, 0.33], rot: [Math.PI / 2, 0, 0] });
  add(new SphereGeometry(0.075, 28, 20), "eyeGlow", { pos: [0, cy - 0.05, 0.35], scale: [1, 1, 0.5] });

  // ── round pressure gauge dial (upper-right of chest) ──
  const gx = 0.15, gy = cy + 0.12, gz = 0.31;
  add(new TorusGeometry(0.07, 0.016, 12, 32), "brass", { pos: [gx, gy, gz], rot: [Math.PI / 2, 0, 0] });
  add(new CylinderGeometry(0.062, 0.062, 0.02, 32), "cream", { pos: [gx, gy, gz], rot: [Math.PI / 2, 0, 0] });
  add(new BoxGeometry(0.008, 0.052, 0.006), "needleRed", { pos: [gx + 0.012, gy + 0.018, gz + 0.012], rot: [0, 0, -0.5] });
  add(new SphereGeometry(0.01, 10, 8), "darkSteel", { pos: [gx, gy, gz + 0.012] });

  // ── two small coloured rainbow dials (upper-left) ──
  add(new CylinderGeometry(0.038, 0.038, 0.02, 24), "dialGreen", { pos: [-0.16, cy + 0.14, 0.31], rot: [Math.PI / 2, 0, 0] });
  add(new CylinderGeometry(0.038, 0.038, 0.02, 24), "dialYellow", { pos: [-0.105, cy + 0.16, 0.315], rot: [Math.PI / 2, 0, 0] });

  // ── lower vent grille ──
  for (let i = -2; i <= 2; i++) {
    add(new BoxGeometry(0.18, 0.012, 0.01), "darkSteel", { pos: [0, cy - 0.18 + i * 0.022, 0.325] });
  }

  // ── side copper pipes climbing to the shoulders ──
  add(pipeGeometry([[0.3, cy - 0.18, 0.06], [0.36, cy - 0.02, 0.02], [0.34, cy + 0.18, 0.0], [0.4, cy + 0.28, -0.02]]), "copper", { });
  add(pipeGeometry([[-0.3, cy - 0.18, 0.06], [-0.36, cy - 0.02, 0.02], [-0.34, cy + 0.18, 0.0]]), "copper", { });

  // ── pressure valve wheel (right side) ──
  add(new TorusGeometry(0.06, 0.014, 10, 24), "valveRed", { pos: [0.36, cy + 0.05, 0.16], rot: [0, 0.6, 0] });
  for (let i = 0; i < 4; i++) {
    add(new CylinderGeometry(0.008, 0.008, 0.12, 8), "valveRed", { pos: [0.36, cy + 0.05, 0.16], rot: [0, 0.6, (i * Math.PI) / 2] });
  }
  add(new CylinderGeometry(0.018, 0.018, 0.05, 12), "brass", { pos: [0.345, cy + 0.05, 0.155], rot: [0, 0, Math.PI / 2] });

  // ── colourful wire bundle looping across the belly ──
  add(pipeGeometry([[-0.12, cy - 0.26, 0.3], [-0.04, cy - 0.32, 0.33], [0.06, cy - 0.24, 0.32]], 0.01), "wireRed", { });
  add(pipeGeometry([[-0.1, cy - 0.24, 0.31], [0.0, cy - 0.3, 0.34], [0.1, cy - 0.22, 0.31]], 0.01), "wireBlue", { });
  add(pipeGeometry([[-0.08, cy - 0.28, 0.31], [0.03, cy - 0.33, 0.33], [0.12, cy - 0.26, 0.3]], 0.01), "wireYellow", { });

  // ── decorative gear on the torso side ──
  add(gearGeometry({ teeth: 12, outer: 0.075, root: 0.06, bore: 0.022, depth: 0.025 }), "brassDark", { pos: [-0.27, cy - 0.04, 0.2], rot: [0, -0.5, 0] });
}

function buildShoulders() {
  for (const side of [-1, 1]) {
    add(new SphereGeometry(0.1, 28, 20), "brass", { pos: [side * 0.42, 1.3, 0.0] });
    add(new TorusGeometry(0.085, 0.02, 12, 28), "copper", { pos: [side * 0.42, 1.3, 0.0], rot: [0, 0, Math.PI / 2] });
  }
}

function clawHand(baseX, baseY, baseZ, openAmount = 1) {
  // palm
  add(new SphereGeometry(0.05, 20, 16), "brass", { pos: [baseX, baseY, baseZ], scale: [1, 0.8, 1] });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fx = Math.cos(a) * 0.04 * openAmount;
    const fz = Math.sin(a) * 0.04 * openAmount;
    add(new CylinderGeometry(0.012, 0.008, 0.09, 10), "gunmetal", {
      pos: [baseX + fx, baseY - 0.05, baseZ + fz],
      rot: [0.5 * Math.cos(a), 0, -0.5 * Math.sin(a)]
    });
    add(new ConeGeometry(0.012, 0.03, 10), "darkSteel", { pos: [baseX + fx * 1.4, baseY - 0.1, baseZ + fz * 1.4], rot: [Math.PI, 0, 0] });
  }
}

function buildArms() {
  // ── robot's right arm (image left): raised, holding a glowing light bulb ──
  {
    const sx = 0.42, sy = 1.3;
    add(new CylinderGeometry(0.05, 0.045, 0.26, 24), "steelBlue", { pos: [sx + 0.05, sy - 0.04, 0.06], rot: [0.5, 0, 0.5] });
    // arm ribs
    add(new TorusGeometry(0.05, 0.012, 10, 20), "darkSteel", { pos: [sx + 0.02, sy + 0.02, 0.02], rot: [0.6, 0, 0.5] });
    add(new SphereGeometry(0.052, 20, 16), "copper", { pos: [sx + 0.11, sy - 0.16, 0.14] }); // elbow
    add(new CylinderGeometry(0.04, 0.036, 0.22, 24), "brass", { pos: [sx + 0.04, sy - 0.05, 0.27], rot: [1.15, 0, 0.2] });
    const hx = sx - 0.06, hy = sy - 0.04, hz = 0.42;
    clawHand(hx, hy, hz, 1.1);
    // light bulb gripped in the claw
    add(new CylinderGeometry(0.022, 0.03, 0.04, 16), "brassDark", { pos: [hx, hy + 0.05, hz] }); // screw base
    add(new SphereGeometry(0.05, 28, 22), "glassBulb", { pos: [hx, hy + 0.11, hz], scale: [1, 1.25, 1] }); // glass
  }
  // ── robot's left arm (image right): lowered, claw + propeller nub ──
  {
    const sx = -0.42, sy = 1.3;
    add(new CylinderGeometry(0.05, 0.045, 0.28, 24), "steelBlue", { pos: [sx - 0.03, sy - 0.14, 0.02], rot: [-0.1, 0, -0.25] });
    add(new SphereGeometry(0.052, 20, 16), "copper", { pos: [sx - 0.08, sy - 0.3, 0.02] }); // elbow
    add(new CylinderGeometry(0.04, 0.036, 0.24, 24), "brass", { pos: [sx - 0.06, sy - 0.44, 0.04], rot: [0.15, 0, -0.12] });
    clawHand(sx - 0.09, sy - 0.58, 0.06, 0.9);
  }
}

function buildPropeller() {
  // little propeller on the robot's left shoulder/back
  const px = -0.5, py = 1.34, pz = -0.06;
  add(new CylinderGeometry(0.016, 0.016, 0.05, 12), "brass", { pos: [px, py, pz], rot: [Math.PI / 2, 0, 0] });
  add(new SphereGeometry(0.022, 14, 10), "copper", { pos: [px, py, pz - 0.03] });
  for (let i = 0; i < 3; i++) {
    add(new BoxGeometry(0.13, 0.006, 0.03), "gunmetal", { pos: [px, py, pz - 0.03], rot: [0, 0, (i * Math.PI * 2) / 3], scale: [1, 1, 1] });
  }
}

function buildNeck() {
  // accordion bellows neck — stacked rings
  for (let i = 0; i < 4; i++) {
    add(new TorusGeometry(0.07 - i * 0.002, 0.016, 12, 28), "gunmetal", { pos: [0, 1.38 + i * 0.025, 0], rot: [Math.PI / 2, 0, 0] });
  }
  add(new CylinderGeometry(0.06, 0.075, 0.1, 24), "darkSteel", { pos: [0, 1.4, 0] });
}

function buildHead() {
  const hy = 1.62;
  // head barrel
  add(new CylinderGeometry(0.2, 0.205, 0.26, 40), "gunmetal", { pos: [0, hy, 0] });
  // riveted brass face plate
  add(new CylinderGeometry(0.198, 0.2, 0.16, 40, 1, true, -0.85, 1.7), "brass", { pos: [0, hy + 0.01, 0] });
  // copper dome
  add(new SphereGeometry(0.205, 48, 28, 0, Math.PI * 2, 0, Math.PI / 2), "copper", { pos: [0, hy + 0.13, 0], scale: [1, 0.85, 1] });
  add(new TorusGeometry(0.205, 0.02, 14, 40), "copperDark", { pos: [0, hy + 0.13, 0], rot: [Math.PI / 2, 0, 0] });
  // brow band
  add(new BoxGeometry(0.3, 0.03, 0.02), "copper", { pos: [0, hy + 0.08, 0.19], rot: [0.1, 0, 0] });

  // ── eyes — glowing orange lenses with brass bezels ──
  for (const side of [-1, 1]) {
    const ex = side * 0.082, ey = hy + 0.02, ez = 0.18;
    add(new CylinderGeometry(0.052, 0.052, 0.04, 28), "darkSteel", { pos: [ex, ey, ez], rot: [Math.PI / 2 + 0.15, 0, 0] }); // socket tube
    add(new TorusGeometry(0.05, 0.014, 12, 28), "brass", { pos: [ex, ey, ez + 0.02], rot: [Math.PI / 2, 0, 0] }); // bezel
    add(new SphereGeometry(0.042, 26, 20), "eyeGlow", { pos: [ex, ey, ez + 0.03], scale: [1, 1, 0.7] }); // glow lens
  }

  // ── mouth grille ──
  add(new BoxGeometry(0.18, 0.07, 0.02), "darkSteel", { pos: [0, hy - 0.07, 0.18] });
  for (let i = -3; i <= 3; i++) {
    add(new BoxGeometry(0.008, 0.06, 0.018), "copper", { pos: [i * 0.022, hy - 0.07, 0.192] });
  }

  // ── ear bolts ──
  for (const side of [-1, 1]) {
    add(new CylinderGeometry(0.03, 0.03, 0.05, 18), "brass", { pos: [side * 0.205, hy, 0], rot: [0, 0, Math.PI / 2] });
    add(new CylinderGeometry(0.034, 0.034, 0.02, 6), "brassDark", { pos: [side * 0.235, hy, 0], rot: [0, 0, Math.PI / 2] });
    // little antenna whisker
    add(new CylinderGeometry(0.004, 0.004, 0.12, 8), "gunmetal", { pos: [side * 0.27, hy + 0.05, 0], rot: [0, 0, side * 0.6] });
    add(new SphereGeometry(0.012, 12, 10), "copper", { pos: [side * 0.33, hy + 0.1, 0] });
  }
}

function buildTopHat() {
  const ty = 1.88; // dome top
  // gear crown on top of the dome
  add(gearGeometry({ teeth: 14, outer: 0.085, root: 0.066, bore: 0.018, depth: 0.022 }), "brass", { pos: [0, ty, 0], rot: [Math.PI / 2, 0, 0] });
  // central antenna rod + ball
  add(new CylinderGeometry(0.008, 0.01, 0.16, 14), "brassDark", { pos: [0, ty + 0.1, 0] });
  add(new SphereGeometry(0.022, 18, 14), "brass", { pos: [0, ty + 0.19, 0] });
  // small gear threaded on the rod
  add(gearGeometry({ teeth: 10, outer: 0.03, root: 0.022, bore: 0.009, depth: 0.012 }), "copper", { pos: [0, ty + 0.06, 0], rot: [0, 0.3, 0] });

  // spring antenna (left)
  add(springGeometry({ height: 0.14, coilRadius: 0.018, tubeRadius: 0.006, turns: 6, tubular: 120 }), "gunmetal", { pos: [-0.09, ty + 0.09, 0.02] });
  add(new SphereGeometry(0.016, 14, 10), "copper", { pos: [-0.09, ty + 0.17, 0.02] });

  // straight antenna with loop tip (right)
  add(new CylinderGeometry(0.005, 0.005, 0.2, 10), "gunmetal", { pos: [0.1, ty + 0.11, -0.02], rot: [0, 0, -0.2] });
  add(new TorusGeometry(0.022, 0.005, 8, 18), "brass", { pos: [0.14, ty + 0.21, -0.02], rot: [Math.PI / 2, 0, 0] });

  // ── flag / pennant on a thin pole (right shoulder) ──
  const fx = 0.46, fz = 0.0, fy = 1.42;
  add(new CylinderGeometry(0.006, 0.006, 0.4, 10), "brassDark", { pos: [fx, fy + 0.2, fz] });
  add(new SphereGeometry(0.014, 12, 10), "brass", { pos: [fx, fy + 0.41, fz] });
  // pennant — a thin extruded triangle
  const pennant = new Shape();
  pennant.moveTo(0, 0);
  pennant.lineTo(0.22, 0.035);
  pennant.lineTo(0.0, 0.07);
  pennant.lineTo(0, 0);
  const pennantGeo = new ExtrudeGeometry(pennant, { depth: 0.004, bevelEnabled: false });
  pennantGeo.computeVertexNormals();
  add(pennantGeo, "cream", { pos: [fx + 0.012, fy + 0.34, fz - 0.002] });
  // red stripe on the pennant hoist
  add(new BoxGeometry(0.02, 0.06, 0.006), "needleRed", { pos: [fx + 0.025, fy + 0.375, fz] });
}

function buildShadowContact() {
  // a flat dark disc to seat the robot on the floor when no ground shadow exists
  add(new CylinderGeometry(0.34, 0.34, 0.004, 36), "rubber", { pos: [0, 0.002, 0] });
}

buildBoots();
buildLegs();
buildTorso();
buildShoulders();
buildArms();
buildPropeller();
buildNeck();
buildHead();
buildTopHat();
buildShadowContact();

// ── Merge by material → write GLB ────────────────────────────────────────────
const byMaterial = new Map();
for (const part of parts) {
  if (!byMaterial.has(part.material)) byMaterial.set(part.material, []);
  byMaterial.get(part.material).push(part);
}

const doc = new Document();
Object.assign(doc.getRoot().getAsset(), { generator: "3DSpace sprocket-bot builder v1" });
const scene = doc.createScene("Sprocket-Bot");
const rootNode = doc.createNode("Sprocket-Bot");
scene.addChild(rootNode);
const buffer = doc.createBuffer();

let totalTriangles = 0;
for (const [materialKey, group] of byMaterial) {
  let vertCount = 0;
  let idxCount = 0;
  for (const p of group) { vertCount += p.positions.length / 3; idxCount += p.indices.length; }
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(idxCount);
  let vo = 0, io = 0;
  for (const p of group) {
    positions.set(p.positions, vo * 3);
    normals.set(p.normals, vo * 3);
    for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i] + vo;
    vo += p.positions.length / 3;
    io += p.indices.length;
  }
  totalTriangles += idxCount / 3;

  const def = MATERIALS[materialKey];
  const [r, g, b] = hexToLinear(def.hex);
  const mat = doc.createMaterial(materialKey)
    .setBaseColorFactor([r, g, b, 1])
    .setRoughnessFactor(def.roughness)
    .setMetallicFactor(def.metalness);
  if (def.emissive) mat.setEmissiveFactor(def.emissive);

  const posAcc = doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer);
  const normAcc = doc.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer);
  const idxAcc = doc.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", posAcc)
    .setAttribute("NORMAL", normAcc)
    .setIndices(idxAcc)
    .setMaterial(mat);
  const mesh = doc.createMesh(materialKey).addPrimitive(prim);
  rootNode.addChild(doc.createNode(materialKey).setMesh(mesh));
}

await mkdir(dirname(OUT_PATH), { recursive: true });
const glb = await new NodeIO().writeBinary(doc);
await writeFile(OUT_PATH, Buffer.from(glb));

console.log(`Wrote ${OUT_PATH}`);
console.log(`Materials (primitives): ${byMaterial.size}`);
console.log(`Triangles: ${totalTriangles.toLocaleString()}`);
console.log(`File size: ${(glb.byteLength / 1024).toFixed(1)} KB`);
