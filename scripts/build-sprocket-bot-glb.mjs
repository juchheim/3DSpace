// Build the "Sprocket-Bot" world-host GLB — a high-definition stylized model of
// the brass-and-copper steampunk robot reference image. Pass 2 models each part
// of the reference painstakingly (goggle eyes with filaments, a TUNE-O-METER
// gauge, interlocking gears, jewel lights, a side boiler + valve, a propeller,
// shoulder handles, claw grippers, a gripped light bulb, coil-spring legs with
// knurled knees, copper-capped boots, the pennant) at dense segment counts.
//
// The mesh is assembled from three.js geometry generators, each baked into
// world-space position/normal arrays, then merged by material into a single
// glTF 2.0 binary via @gltf-transform/core. It is texture-free (PBR
// metallic-roughness + emissive, no extensions) so it also passes the custom
// room-object upload validator and can be imported as a placeable object.
//
// Run:  node scripts/build-sprocket-bot-glb.mjs   (or: npm run build:host-glb)
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
  CircleGeometry,
  ExtrudeGeometry,
  Shape,
  Path,
  Curve,
  CatmullRomCurve3,
  Vector2,
  Vector3,
  Matrix3,
  Matrix4,
  Euler,
  Quaternion
} from "three";
import { Document, NodeIO } from "@gltf-transform/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../apps/web/public/world-hosts/sprocket-bot.glb");
const DEG = Math.PI / 180;

// ── Material palette (PBR metallic-roughness, baked colours, no textures) ─────
// Metalness kept in 0.3–0.6: the room scene has no environment map, so fully
// metallic PBR would render near-black. Emissive given as linear [r,g,b].
const MATERIALS = {
  brass: { hex: "#c89b3e", metalness: 0.55, roughness: 0.33 },
  brassLight: { hex: "#dcb858", metalness: 0.5, roughness: 0.28 },
  brassDark: { hex: "#8f6d2a", metalness: 0.55, roughness: 0.46 },
  copper: { hex: "#c16a3a", metalness: 0.55, roughness: 0.3 },
  copperLight: { hex: "#d98a55", metalness: 0.5, roughness: 0.28 },
  copperDark: { hex: "#8d4626", metalness: 0.55, roughness: 0.44 },
  steelBlue: { hex: "#40718b", metalness: 0.45, roughness: 0.4 }, // torso front panel
  steelBlueDk: { hex: "#2c5066", metalness: 0.45, roughness: 0.5 },
  headBlue: { hex: "#74858f", metalness: 0.5, roughness: 0.44 }, // head + legs dusty blue-grey
  gunmetal: { hex: "#7e868c", metalness: 0.6, roughness: 0.38 }, // springs
  pewter: { hex: "#9aa1a6", metalness: 0.6, roughness: 0.34 },
  darkSteel: { hex: "#2a2e31", metalness: 0.5, roughness: 0.55 },
  rubber: { hex: "#1b1e22", metalness: 0.1, roughness: 0.85 },
  cream: { hex: "#efe7d0", metalness: 0.08, roughness: 0.6 }, // gauge faces, flag
  needle: { hex: "#23262a", metalness: 0.3, roughness: 0.5 },
  red: { hex: "#b5392c", metalness: 0.25, roughness: 0.5 }, // red button, valve
  green: { hex: "#2f9e5b", metalness: 0.25, roughness: 0.5 },
  amber: { hex: "#e0a52e", metalness: 0.25, roughness: 0.5 },
  wireRed: { hex: "#c0392b", metalness: 0.12, roughness: 0.72 },
  wireBlue: { hex: "#2f5ab2", metalness: 0.12, roughness: 0.72 },
  wireYellow: { hex: "#d4a72e", metalness: 0.12, roughness: 0.72 },
  glassBulb: { hex: "#fff4cf", metalness: 0, roughness: 0.12, emissive: [1.0, 0.82, 0.42] },
  // "eyeGlow" is found + pulsed by name in SprocketBotHostAvatar. Dark base +
  // strong amber emissive so it reads as a self-lit lens, not a shiny pale ball.
  eyeGlow: { hex: "#5e2400", metalness: 0.1, roughness: 0.5, emissive: [1.0, 0.42, 0.06] },
  filament: { hex: "#ffcf80", metalness: 0, roughness: 0.4, emissive: [1.0, 0.55, 0.18] },
  socket: { hex: "#1b1611", metalness: 0.4, roughness: 0.6 },
  jewelGreen: { hex: "#3be07a", metalness: 0.2, roughness: 0.22, emissive: [0.12, 0.8, 0.36] },
  jewelRed: { hex: "#ff5a44", metalness: 0.2, roughness: 0.22, emissive: [0.9, 0.2, 0.12] },
  jewelAmber: { hex: "#ffb43e", metalness: 0.2, roughness: 0.22, emissive: [1.0, 0.58, 0.12] }
};

function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  const srgb = [(n >> 16 & 0xff) / 255, (n >> 8 & 0xff) / 255, (n & 0xff) / 255];
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
}

// ── Part accumulator (bakes each geometry's transform into world space) ───────
/** @type {Array<{positions:Float32Array,normals:Float32Array,indices:Uint32Array,material:string}>} */
const parts = [];
const _m4 = new Matrix4();
const _nm = new Matrix3();
const _euler = new Euler();
const _pos = new Vector3();
const _scl = new Vector3();
const _v = new Vector3();

function add(geometry, material, opts = {}) {
  const pos = opts.pos ?? [0, 0, 0];
  const rot = opts.rot ?? [0, 0, 0];
  const scale = opts.scale ?? 1;
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];

  _pos.set(pos[0], pos[1], pos[2]);
  _euler.set(rot[0], rot[1], rot[2], "XYZ");
  _scl.set(s[0], s[1], s[2]);
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
    } else outNorm[i * 3 + 1] = 1;
  }
  let indices;
  if (geometry.index) indices = Uint32Array.from(geometry.index.array);
  else { indices = new Uint32Array(count); for (let i = 0; i < count; i++) indices[i] = i; }
  parts.push({ positions: outPos, normals: outNorm, indices, material });
  geometry.dispose?.();
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Toothed gear (involute-ish) as an extruded shape with a centre bore. */
function gearGeometry({ teeth = 12, outer = 0.1, root = 0.082, bore = 0.03, depth = 0.03, twist = 0.0 }) {
  const shape = new Shape();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const phase = (i % 4) / 4;
    const a = (i / steps) * Math.PI * 2 + twist;
    // flat-topped trapezoidal teeth: outer for the tooth tip span, root for the gap
    const r = phase < 0.5 ? outer : root;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  if (bore > 0) {
    const hole = new Path();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const x = Math.cos(a) * bore, y = Math.sin(a) * bore;
      if (i === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
    }
    shape.holes.push(hole);
  }
  const geo = new ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: depth * 0.16, bevelSize: depth * 0.16, bevelSegments: 1, steps: 1
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Coil spring: a round tube swept along a vertical helix. */
function springGeometry({ height = 0.4, coilRadius = 0.07, tubeRadius = 0.018, turns = 5, tubular = 200, radial = 12 }) {
  class Helix extends Curve {
    getPoint(t, target = new Vector3()) {
      const a = turns * Math.PI * 2 * t;
      return target.set(Math.cos(a) * coilRadius, t * height - height / 2, Math.sin(a) * coilRadius);
    }
  }
  return new TubeGeometry(new Helix(), tubular, tubeRadius, radial, false);
}

/** Smooth tube through control points (pipes and wires). */
function tubeThrough(points, tubeRadius = 0.02, { tubular = 60, radial = 10 } = {}) {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(p[0], p[1], p[2])), false, "catmullrom", 0.5);
  return new TubeGeometry(curve, tubular, tubeRadius, radial, false);
}

/** Rounded ankle-boot shell from a revolved profile. */
function bootShellGeometry() {
  const pts = [
    new Vector2(0.0, 0.0), new Vector2(0.10, 0.0), new Vector2(0.118, 0.028),
    new Vector2(0.108, 0.07), new Vector2(0.082, 0.108), new Vector2(0.045, 0.132),
    new Vector2(0.0, 0.14)
  ];
  const geo = new LatheGeometry(pts, 36);
  geo.computeVertexNormals();
  return geo;
}

// ── Detail sub-assemblies ────────────────────────────────────────────────────

const _q = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _dir = new Vector3();
const _qe = new Euler();
/** Tapered cylinder from p0 to p1 (Y-axis cylinder rotated onto the segment). */
function beam(p0, p1, r0, r1, mat, segs = 22) {
  _dir.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const len = _dir.length() || 1e-5;
  _dir.normalize();
  _q.setFromUnitVectors(_up, _dir);
  _qe.setFromQuaternion(_q);
  add(new CylinderGeometry(r1, r0, len, segs), mat, {
    pos: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2],
    rot: [_qe.x, _qe.y, _qe.z]
  });
}

function addRivet(x, y, z, r = 0.013, mat = "brass") {
  add(new SphereGeometry(r, 14, 10), mat, { pos: [x, y, z] });
}

/** Ring of rivets around a vertical axis at height y, radius `radius`. */
function rivetRingY(y, radius, count, r = 0.013, mat = "brass", phase = 0) {
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    addRivet(Math.cos(a) * radius, y, Math.sin(a) * radius, r, mat);
  }
}

/** Arc of rivets across the *front* of the torso (centred on +Z), shallow on the barrel. */
function rivetArcFront(y, radius, fromDeg, toDeg, count, r = 0.012, mat = "brass") {
  for (let i = 0; i < count; i++) {
    const a = (fromDeg + (toDeg - fromDeg) * (count === 1 ? 0.5 : i / (count - 1))) * DEG;
    addRivet(Math.sin(a) * radius, y, Math.cos(a) * radius, r, mat);
  }
}

/** Hex bolt head with a slight dome. */
function hexBolt(x, y, z, r = 0.024, depth = 0.018, rot = [0, 0, 0], mat = "brassDark") {
  add(new CylinderGeometry(r, r, depth, 6), mat, { pos: [x, y, z], rot });
  add(new SphereGeometry(r * 0.5, 12, 8), "brass", { pos: [x, y + (rot[0] ? 0 : depth * 0.4), z], rot });
}

/**
 * Round analog gauge mounted on the torso front (+Z): brass bezel, cream face,
 * tick marks, a needle and a centre hub. cx,cy on the front plane at z≈zFront.
 */
function gauge(cx, cy, zFront, radius, { needleDeg = -35, ticks = 12, faceMat = "cream" } = {}) {
  add(new TorusGeometry(radius, radius * 0.16, 16, 40), "brass", { pos: [cx, cy, zFront], rot: [Math.PI / 2, 0, 0] });
  add(new CylinderGeometry(radius * 0.92, radius * 0.92, radius * 0.18, 40), faceMat, { pos: [cx, cy, zFront - 0.01], rot: [Math.PI / 2, 0, 0] });
  // tick marks around the dial
  for (let i = 0; i < ticks; i++) {
    const a = (-120 + (240 * i) / (ticks - 1)) * DEG;
    const tx = cx + Math.sin(a) * radius * 0.74;
    const ty = cy + Math.cos(a) * radius * 0.74;
    add(new BoxGeometry(0.004, radius * 0.16, 0.004), "needle", { pos: [tx, ty, zFront + 0.02], rot: [0, 0, -a] });
  }
  // needle + hub
  const na = needleDeg * DEG;
  add(new BoxGeometry(0.006, radius * 0.82, 0.006), "needle", {
    pos: [cx + Math.sin(na) * radius * 0.32, cy + Math.cos(na) * radius * 0.32, zFront + 0.03], rot: [0, 0, -na]
  });
  add(new CylinderGeometry(radius * 0.14, radius * 0.14, 0.02, 16), "brassDark", { pos: [cx, cy, zFront + 0.035], rot: [Math.PI / 2, 0, 0] });
}

/** Little rainbow arc dial (the pair top-left of the chest). */
function rainbowDial(cx, cy, zFront, radius) {
  add(new TorusGeometry(radius, radius * 0.2, 12, 28), "brass", { pos: [cx, cy, zFront], rot: [Math.PI / 2, 0, 0] });
  add(new CylinderGeometry(radius * 0.85, radius * 0.85, 0.016, 28), "cream", { pos: [cx, cy, zFront - 0.008], rot: [Math.PI / 2, 0, 0] });
  const bands = ["red", "amber", "green"];
  for (let i = 0; i < 3; i++) {
    add(new TorusGeometry(radius * 0.6, radius * 0.12, 8, 14, Math.PI * 0.5), bands[i], {
      pos: [cx, cy, zFront + 0.004], rot: [Math.PI / 2, 0, (-0.78 + i * 0.52)]
    });
  }
  add(new BoxGeometry(0.004, radius * 0.7, 0.004), "needle", { pos: [cx + 0.006, cy + 0.008, zFront + 0.02], rot: [0, 0, -0.4] });
}

/** Glowing jewel indicator light: emissive dome in a brass bezel. */
function jewel(x, y, zFront, r, mat) {
  add(new TorusGeometry(r * 1.05, r * 0.4, 10, 20), "brassDark", { pos: [x, y, zFront], rot: [Math.PI / 2, 0, 0] });
  add(new SphereGeometry(r, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat, { pos: [x, y, zFront + 0.004], rot: [-Math.PI / 2, 0, 0], scale: [1, 1.1, 1] });
}

/** Glowing porthole vacuum tube: copper rim, dark socket, glass + coiled filament. */
function porthole(cx, cy, zFront, radius) {
  add(new TorusGeometry(radius * 1.05, radius * 0.26, 16, 36), "copper", { pos: [cx, cy, zFront], rot: [Math.PI / 2, 0, 0] });
  rivetRingForCircle(cx, cy, zFront + 0.01, radius * 1.18, 12, 0.01, "brass");
  add(new CylinderGeometry(radius * 0.9, radius * 0.9, 0.05, 32), "socket", { pos: [cx, cy, zFront - 0.02], rot: [Math.PI / 2, 0, 0] });
  add(new SphereGeometry(radius * 0.78, 28, 20), "eyeGlow", { pos: [cx, cy, zFront + 0.02], scale: [1, 1, 0.55] });
  // filament coil inside
  add(new TorusGeometry(radius * 0.34, radius * 0.06, 8, 18), "filament", { pos: [cx, cy, zFront + 0.05], rot: [Math.PI / 2, 0.3, 0] });
}

/** Place a ring of rivets around a circle on the front plane (+Z facing). */
function rivetRingForCircle(cx, cy, zFront, radius, count, r, mat) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    addRivet(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, zFront, r, mat);
  }
}

/** Goggle eye: short brass cup so a big glowing lens sits proud, with a filament. */
function gogglEye(cx, cy, cz, radius, tilt) {
  // shallow brass eye-cup (kept short so the lens reads, not a deep socket)
  add(new CylinderGeometry(radius * 1.1, radius * 1.2, 0.05, 30), "brass", { pos: [cx, cy, cz - 0.05], rot: [Math.PI / 2 + tilt, 0, 0] });
  // raised brass bezel ring + thin dark inner rim (kept small so the lens shows)
  add(new TorusGeometry(radius * 1.04, radius * 0.16, 14, 34), "brassLight", { pos: [cx, cy, cz], rot: [Math.PI / 2 + tilt, 0, 0] });
  add(new TorusGeometry(radius * 0.92, radius * 0.06, 12, 28), "socket", { pos: [cx, cy, cz + 0.018], rot: [Math.PI / 2 + tilt, 0, 0] });
  // big glowing amber lens, proud of the bezel (eyeGlow is pulsed at runtime)
  add(new SphereGeometry(radius * 0.92, 30, 22), "eyeGlow", { pos: [cx, cy, cz + 0.03], scale: [1, 1, 0.7] });
  // small glowing filament coil sitting on the lens
  add(new TorusGeometry(radius * 0.3, radius * 0.05, 8, 18), "filament", { pos: [cx, cy, cz + 0.06], rot: [tilt, 0, 0] });
  rivetRingForCircle(cx, cy, cz, radius * 1.28, 8, 0.009, "brass");
}

/** Two-pronged claw gripper. Returns nothing; built at (x,y,z), opening downward. */
function clawGripper(x, y, z, open = 1, rot = [0, 0, 0], scale = 1) {
  // wrist coupler + pivot
  add(new CylinderGeometry(0.03 * scale, 0.035 * scale, 0.05 * scale, 16), "brass", { pos: [x, y + 0.04 * scale, z], rot });
  add(new SphereGeometry(0.034 * scale, 16, 12), "darkSteel", { pos: [x, y, z], rot });
  for (const side of [-1, 1]) {
    const sx = side * 0.03 * open * scale;
    const pts = [
      [x + side * 0.02 * scale, y, z],
      [x + sx, y - 0.05 * scale, z + 0.01 * scale],
      [x + sx * 1.4, y - 0.1 * scale, z + 0.03 * scale],
      [x + sx * 0.8, y - 0.14 * scale, z + 0.06 * scale]
    ];
    add(tubeThrough(pts, 0.014 * scale, { tubular: 24, radial: 8 }), "gunmetal");
    add(new ConeGeometry(0.016 * scale, 0.04 * scale, 10), "darkSteel", { pos: pts[3], rot: [Math.PI * 0.85, 0, 0] });
    hexBolt(x + side * 0.02 * scale, y, z + 0.02 * scale, 0.01 * scale, 0.01 * scale, [Math.PI / 2, 0, 0], "brassDark");
  }
}

/** Incandescent light bulb gripped in a claw: brass threaded base, glass, filament. */
function lightBulb(x, y, z) {
  // threaded brass base (stacked thin rings)
  for (let i = 0; i < 4; i++) add(new TorusGeometry(0.026 - i * 0.001, 0.006, 8, 18), "brassDark", { pos: [x, y + i * 0.012, z] });
  add(new CylinderGeometry(0.018, 0.026, 0.05, 18), "brass", { pos: [x, y + 0.02, z] });
  // glass envelope (teardrop) + filament
  add(new SphereGeometry(0.05, 30, 22), "glassBulb", { pos: [x, y + 0.11, z], scale: [1, 1.25, 1] });
  add(new TorusGeometry(0.014, 0.004, 6, 14), "filament", { pos: [x, y + 0.11, z], rot: [Math.PI / 2, 0, 0] });
  add(new BoxGeometry(0.004, 0.04, 0.004), "filament", { pos: [x, y + 0.08, z] });
}

/** Knurled knob knee: dark drum with a ring of vertical ridges. */
function kneeKnob(x, y, z) {
  add(new CylinderGeometry(0.075, 0.075, 0.1, 40), "darkSteel", { pos: [x, y, z] });
  add(new TorusGeometry(0.078, 0.012, 10, 36), "gunmetal", { pos: [x, y + 0.045, z], rot: [Math.PI / 2, 0, 0] });
  add(new TorusGeometry(0.078, 0.012, 10, 36), "gunmetal", { pos: [x, y - 0.045, z], rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    add(new BoxGeometry(0.008, 0.085, 0.012), "gunmetal", { pos: [Math.cos(a) * 0.077 + x, y, Math.sin(a) * 0.077 + z], rot: [0, -a, 0] });
  }
  hexBolt(x, y, z + 0.078, 0.022, 0.016, [Math.PI / 2, 0, 0], "brass");
}

// ── Assemble the robot (Y up, faces +Z, feet at y=0, ~2.0 m tall) ─────────────

function buildBoots() {
  for (const side of [-1, 1]) {
    const x = side * 0.21;
    // boot shell (rounded), stretched forward
    add(bootShellGeometry(), "headBlue", { pos: [x, 0.0, 0.0], scale: [1.15, 1.05, 1.7] });
    // sole slab
    add(new BoxGeometry(0.2, 0.05, 0.34), "darkSteel", { pos: [x, 0.025, 0.06], scale: [1, 1, 1] });
    add(new CylinderGeometry(0.1, 0.1, 0.34, 20, 1, false, -Math.PI / 2, Math.PI), "darkSteel", { pos: [x, 0.04, 0.06], rot: [Math.PI / 2, 0, 0] });
    // copper toe cap
    add(new SphereGeometry(0.085, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), "copper", { pos: [x, 0.05, 0.18], scale: [1.05, 0.8, 1.15] });
    add(new TorusGeometry(0.07, 0.014, 12, 28, Math.PI), "copperDark", { pos: [x, 0.05, 0.16], rot: [Math.PI / 2, 0, 0] });
    // copper heel trim + rivets
    add(new TorusGeometry(0.085, 0.018, 12, 24, Math.PI), "copper", { pos: [x, 0.05, -0.07], rot: [Math.PI / 2, Math.PI, 0] });
    for (let i = 0; i < 5; i++) addRivet(x - 0.07 + i * 0.035, 0.075, 0.2, 0.01, "brass");
    // ankle collar
    add(new TorusGeometry(0.06, 0.02, 12, 28), "brass", { pos: [x, 0.16, 0.0], rot: [Math.PI / 2, 0, 0] });
    add(new CylinderGeometry(0.05, 0.055, 0.06, 20), "gunmetal", { pos: [x, 0.18, 0.0] });
  }
}

function buildLegs() {
  for (const side of [-1, 1]) {
    const x = side * 0.21;
    // shin spring (ankle → knee)
    add(new CylinderGeometry(0.016, 0.016, 0.26, 10), "darkSteel", { pos: [x, 0.33, 0.0] }); // inner rod
    add(springGeometry({ height: 0.24, coilRadius: 0.062, tubeRadius: 0.016, turns: 6, tubular: 200 }), "gunmetal", { pos: [x, 0.33, 0.0] });
    // knee
    kneeKnob(x, 0.5, 0.0);
    // thigh spring (knee → hip)
    add(new CylinderGeometry(0.016, 0.016, 0.16, 10), "darkSteel", { pos: [x, 0.6, 0.0] });
    add(springGeometry({ height: 0.16, coilRadius: 0.055, tubeRadius: 0.015, turns: 4, tubular: 150 }), "gunmetal", { pos: [x, 0.62, 0.0] });
    add(new CylinderGeometry(0.05, 0.06, 0.06, 20), "brass", { pos: [x, 0.71, 0.0] }); // hip cap
    hexBolt(x, 0.71, 0.05, 0.018, 0.014, [Math.PI / 2, 0, 0]);
  }
  // pelvis
  add(new CylinderGeometry(0.21, 0.25, 0.17, 40), "brass", { pos: [0, 0.78, 0] });
  add(new TorusGeometry(0.22, 0.024, 12, 40), "brassDark", { pos: [0, 0.71, 0], rot: [Math.PI / 2, 0, 0] });
  rivetRingY(0.78, 0.255, 18, 0.012, "brassDark");
  // wire bundle drooping from under the torso between the legs
  add(tubeThrough([[-0.06, 0.86, 0.22], [-0.1, 0.74, 0.26], [-0.04, 0.66, 0.24], [0.0, 0.7, 0.26]], 0.011, { tubular: 40 }), "wireRed");
  add(tubeThrough([[0.0, 0.86, 0.22], [0.06, 0.72, 0.27], [0.1, 0.66, 0.24]], 0.011, { tubular: 40 }), "wireBlue");
  add(tubeThrough([[0.05, 0.86, 0.21], [0.0, 0.7, 0.27], [-0.06, 0.64, 0.23]], 0.011, { tubular: 40 }), "wireYellow");
}

function buildTorso() {
  const cy = 1.07;
  const R = 0.4;
  // main brass barrel
  add(new CylinderGeometry(R, R * 0.95, 0.7, 56), "brass", { pos: [0, cy, 0] });
  // blue front panel (proud curved segment across the front)
  add(new CylinderGeometry(R * 1.01, R * 0.96, 0.56, 56, 1, true, -0.9, 1.8), "steelBlue", { pos: [0, cy, 0] });
  // brass shoulder deck (domed top) + rivet ring
  add(new SphereGeometry(R, 56, 26, 0, Math.PI * 2, 0, Math.PI / 2), "brass", { pos: [0, cy + 0.34, 0], scale: [1, 0.5, 1] });
  rivetRingY(cy + 0.33, R * 0.98, 28, 0.013, "brassDark");
  // top + bottom flange belts with dense rivets
  for (const by of [cy + 0.32, cy - 0.33]) {
    add(new TorusGeometry(R * 0.99, 0.03, 14, 56), "brassDark", { pos: [0, by, 0], rot: [Math.PI / 2, 0, 0] });
    rivetRingY(by, R * 0.99, 30, 0.012, "brass");
  }
  // a mid brass border framing the blue panel
  add(new TorusGeometry(R * 0.99, 0.016, 12, 56), "brass", { pos: [0, cy + 0.04, 0], rot: [Math.PI / 2, 0, 0] });
  const zF = R * 0.99; // front working plane

  // ── handles on the shoulder deck (brass D-rings) ──
  for (const side of [-1, 1]) {
    add(new TorusGeometry(0.05, 0.012, 12, 24, Math.PI), "brass", { pos: [side * 0.12, cy + 0.4, 0.16], rot: [0, 0, 0] });
  }

  // ── big central TUNE-O-METER gauge ──
  gauge(0.02, cy + 0.12, zF + 0.02, 0.13, { needleDeg: -28, ticks: 11 });
  // ── two rainbow arc dials (top-left) ──
  rainbowDial(-0.2, cy + 0.2, zF + 0.02, 0.05);
  rainbowDial(-0.12, cy + 0.24, zF + 0.02, 0.045);
  // ── interlocking gears (left of centre) ──
  add(gearGeometry({ teeth: 14, outer: 0.082, root: 0.064, bore: 0.018, depth: 0.028 }), "brassDark", { pos: [-0.22, cy - 0.02, zF + 0.01], rot: [0, 0, 0.2] });
  add(gearGeometry({ teeth: 10, outer: 0.05, root: 0.038, bore: 0.012, depth: 0.024 }), "brass", { pos: [-0.12, cy - 0.06, zF + 0.015], rot: [0, 0, -0.3] });
  add(gearGeometry({ teeth: 8, outer: 0.036, root: 0.028, bore: 0.01, depth: 0.02 }), "copper", { pos: [-0.05, cy + 0.0, zF + 0.02], rot: [0, 0, 0.1] });
  // ── glowing porthole tube (lower-left) ──
  porthole(-0.16, cy - 0.16, zF + 0.02, 0.11);
  // ── jewel indicator lights ──
  jewel(0.16, cy - 0.05, zF + 0.02, 0.026, "jewelAmber");
  jewel(0.2, cy - 0.13, zF + 0.02, 0.022, "jewelGreen");
  jewel(0.2, cy - 0.2, zF + 0.02, 0.022, "jewelRed");
  // ── big red button (lower-right) ──
  add(new CylinderGeometry(0.035, 0.04, 0.03, 24), "brassDark", { pos: [0.12, cy - 0.22, zF + 0.01], rot: [Math.PI / 2, 0, 0] });
  add(new SphereGeometry(0.032, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2), "red", { pos: [0.12, cy - 0.22, zF + 0.025], rot: [-Math.PI / 2, 0, 0] });
  // ── brass control knob (lower-left) ──
  add(new CylinderGeometry(0.03, 0.034, 0.04, 18), "brass", { pos: [-0.26, cy - 0.18, zF], rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; add(new BoxGeometry(0.006, 0.04, 0.008), "brassDark", { pos: [-0.26 + Math.cos(a) * 0.03, cy - 0.18, zF + Math.sin(a) * 0.03], rot: [Math.PI / 2, -a, 0] }); }
  // ── looping coloured wires across the panel ──
  add(tubeThrough([[0.18, cy + 0.02, zF], [0.28, cy - 0.04, zF + 0.04], [0.26, cy - 0.16, zF + 0.02], [0.16, cy - 0.22, zF]], 0.012, { tubular: 50 }), "wireRed");
  add(tubeThrough([[-0.04, cy - 0.24, zF], [0.04, cy - 0.3, zF + 0.03], [0.12, cy - 0.26, zF]], 0.01, { tubular: 36 }), "wireYellow");
  // panel corner rivets framing the blue front
  rivetArcFront(cy + 0.26, R, -52, 52, 9, 0.012, "brass");
  rivetArcFront(cy - 0.27, R, -52, 52, 9, 0.012, "brass");

  // ── side boiler tank + valve + pipe (robot's left / image right, top) ──
  const bx = 0.34;
  add(new CylinderGeometry(0.1, 0.1, 0.22, 28), "gunmetal", { pos: [bx, cy + 0.26, -0.02] });
  add(new SphereGeometry(0.1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), "gunmetal", { pos: [bx, cy + 0.37, -0.02], scale: [1, 0.6, 1] });
  rivetRingY(cy + 0.26, 0.1, 12, 0.011, "brass");
  // red valve handwheel on top
  add(new CylinderGeometry(0.02, 0.02, 0.05, 12), "brass", { pos: [bx, cy + 0.42, -0.02] });
  add(new TorusGeometry(0.035, 0.01, 10, 20), "red", { pos: [bx, cy + 0.45, -0.02], rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 3; i++) add(new CylinderGeometry(0.005, 0.005, 0.07, 8), "red", { pos: [bx, cy + 0.45, -0.02], rot: [Math.PI / 2, 0, (i * Math.PI) / 3] });
  // copper pipe from boiler curving into the torso
  add(tubeThrough([[bx - 0.05, cy + 0.18, 0.04], [bx - 0.12, cy + 0.26, 0.06], [bx - 0.2, cy + 0.2, 0.18], [bx - 0.26, cy + 0.1, 0.28]], 0.022, { tubular: 50 }), "copper");
  add(new TorusGeometry(0.03, 0.012, 10, 20), "brass", { pos: [bx - 0.05, cy + 0.18, 0.06], rot: [0, 0, Math.PI / 2] });
}

function shoulderHub(x, side) {
  // stub from the torso deck out to the shoulder ball
  beam([side * 0.4, 1.36, 0], [x, 1.34, 0], 0.07, 0.08, "brass", 20);
  add(new SphereGeometry(0.1, 32, 22), "brass", { pos: [x, 1.34, 0.0] });
  add(new TorusGeometry(0.088, 0.022, 14, 30), "copper", { pos: [x, 1.34, 0.0], rot: [0, 0, Math.PI / 2] });
  rivetRingForCircle(x, 1.34, 0.088, 0.072, 8, 0.01, "brass");
  add(gearGeometry({ teeth: 12, outer: 0.062, root: 0.048, bore: 0.014, depth: 0.022 }), "brassDark", { pos: [x, 1.34, 0.092], rot: [0, 0, side * 0.2] });
}

function buildShoulders() {
  shoulderHub(-0.5, -1);
  shoulderHub(0.5, 1);
}

/** Joint detail at an elbow: copper ball + a hex pivot bolt facing forward. */
function elbow(p) {
  add(new SphereGeometry(0.05, 24, 18), "copper", { pos: p });
  hexBolt(p[0], p[1], p[2] + 0.052, 0.016, 0.012, [Math.PI / 2, 0, 0]);
}

function buildArms() {
  // ── robot's right arm = IMAGE LEFT (−X): raised, gripping a glowing bulb ──
  {
    const sh = [-0.5, 1.32, 0.02];
    const el = [-0.58, 1.12, 0.16];
    const wr = [-0.46, 1.18, 0.4];
    beam(sh, el, 0.052, 0.046, "headBlue"); // upper arm
    add(new TorusGeometry(0.05, 0.012, 10, 22), "brass", { pos: [sh[0] - 0.02, sh[1] - 0.06, sh[2] + 0.05], rot: [0.7, 0, 0.4] });
    elbow(el);
    beam(el, wr, 0.044, 0.036, "brass"); // forearm
    add(new TorusGeometry(0.04, 0.01, 10, 20), "brassDark", { pos: [(el[0] + wr[0]) / 2, (el[1] + wr[1]) / 2, (el[2] + wr[2]) / 2], rot: [1.1, 0, 0.2] });
    clawGripper(wr[0], wr[1] + 0.02, wr[2] + 0.02, 1.2, [-0.5, 0, 0], 1.1);
    lightBulb(wr[0], wr[1] + 0.05, wr[2] + 0.04);
    // wires dangling from the wrist
    add(tubeThrough([[wr[0] - 0.02, wr[1], wr[2]], [wr[0] - 0.07, wr[1] - 0.12, wr[2] + 0.02], [wr[0] - 0.03, wr[1] - 0.22, wr[2] - 0.02]], 0.009, { tubular: 30 }), "wireRed");
    add(tubeThrough([[wr[0] + 0.02, wr[1], wr[2]], [wr[0] + 0.07, wr[1] - 0.14, wr[2] + 0.02], [wr[0] + 0.02, wr[1] - 0.24, wr[2]]], 0.009, { tubular: 30 }), "wireYellow");
    add(tubeThrough([[wr[0], wr[1] - 0.01, wr[2] + 0.02], [wr[0], wr[1] - 0.16, wr[2] + 0.05], [wr[0] - 0.03, wr[1] - 0.26, wr[2] + 0.02]], 0.009, { tubular: 30 }), "wireBlue");
  }
  // ── robot's left arm = IMAGE RIGHT (+X): lowered, open claw ──
  {
    const sh = [0.5, 1.32, 0.02];
    const el = [0.56, 1.06, 0.04];
    const wr = [0.54, 0.82, 0.08];
    beam(sh, el, 0.052, 0.046, "headBlue");
    add(new TorusGeometry(0.05, 0.012, 10, 22), "brass", { pos: [sh[0] + 0.0, sh[1] - 0.08, sh[2] + 0.02], rot: [-0.1, 0, -0.2] });
    elbow(el);
    beam(el, wr, 0.044, 0.036, "brass");
    add(new TorusGeometry(0.04, 0.01, 10, 20), "brassDark", { pos: [(el[0] + wr[0]) / 2, (el[1] + wr[1]) / 2, (el[2] + wr[2]) / 2], rot: [0.1, 0, 0] });
    clawGripper(wr[0], wr[1], wr[2], 1.1, [0.1, 0, 0], 1.05);
  }
}

function buildPropeller() {
  // 3-blade propeller on the robot's left shoulder = IMAGE RIGHT (+X), by the boiler
  const px = 0.58, py = 1.38, pz = -0.05;
  add(new CylinderGeometry(0.02, 0.02, 0.06, 16), "brass", { pos: [px, py, pz], rot: [Math.PI / 2, 0, 0] });
  add(new SphereGeometry(0.026, 16, 12), "copper", { pos: [px, py, pz - 0.04] });
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    add(new BoxGeometry(0.18, 0.006, 0.04), "gunmetal", { pos: [px, py, pz - 0.04], rot: [0.35, 0, a] });
    add(new SphereGeometry(0.012, 10, 8), "brass", { pos: [px + Math.cos(a) * 0.085, py + Math.sin(a) * 0.085, pz - 0.04] });
  }
}

function buildNeck() {
  // accordion bellows — stacked rings + dark conduit
  for (let i = 0; i < 5; i++) {
    const r = 0.078 - Math.abs(i - 2) * 0.004;
    add(new TorusGeometry(r, 0.016, 12, 30), "gunmetal", { pos: [0, 1.46 + i * 0.026, 0], rot: [Math.PI / 2, 0, 0] });
  }
  add(new CylinderGeometry(0.06, 0.085, 0.13, 28), "darkSteel", { pos: [0, 1.48, 0] });
  // colourful wires running up the neck into the head
  add(tubeThrough([[0.03, 1.44, 0.05], [0.05, 1.52, 0.07], [0.03, 1.6, 0.06]], 0.008, { tubular: 24 }), "wireRed");
  add(tubeThrough([[-0.03, 1.44, 0.05], [-0.05, 1.52, 0.07], [-0.03, 1.6, 0.06]], 0.008, { tubular: 24 }), "wireBlue");
}

function buildHead() {
  const hy = 1.68;
  // head barrel (dusty blue-grey, riveted)
  add(new CylinderGeometry(0.21, 0.215, 0.3, 44), "headBlue", { pos: [0, hy, 0] });
  add(new TorusGeometry(0.214, 0.02, 12, 44), "brass", { pos: [0, hy + 0.14, 0], rot: [Math.PI / 2, 0, 0] }); // top collar
  add(new TorusGeometry(0.216, 0.02, 12, 44), "brass", { pos: [0, hy - 0.14, 0], rot: [Math.PI / 2, 0, 0] }); // chin collar
  rivetRingY(hy + 0.1, 0.214, 20, 0.011, "brass");
  rivetRingY(hy - 0.1, 0.216, 20, 0.011, "brass");
  // copper dome
  add(new SphereGeometry(0.215, 56, 30, 0, Math.PI * 2, 0, Math.PI / 2), "copper", { pos: [0, hy + 0.15, 0], scale: [1, 0.92, 1] });
  add(new TorusGeometry(0.215, 0.022, 14, 44), "copperDark", { pos: [0, hy + 0.15, 0], rot: [Math.PI / 2, 0, 0] });
  rivetRingY(hy + 0.17, 0.205, 16, 0.01, "brass");

  // ── goggle eyes ──
  gogglEye(-0.085, hy + 0.03, 0.2, 0.062, 0.12);
  gogglEye(0.085, hy + 0.03, 0.2, 0.062, 0.12);
  // small brow bolt between the eyes
  hexBolt(0, hy + 0.09, 0.2, 0.014, 0.01, [Math.PI / 2, 0, 0], "brass");

  // ── copper mouth plate with horizontal slot vents ──
  add(new BoxGeometry(0.2, 0.11, 0.03), "copper", { pos: [0, hy - 0.085, 0.19], rot: [0.05, 0, 0] });
  add(new BoxGeometry(0.17, 0.085, 0.02), "socket", { pos: [0, hy - 0.085, 0.205] });
  for (let i = -2; i <= 2; i++) add(new BoxGeometry(0.16, 0.012, 0.02), "copperDark", { pos: [0, hy - 0.085 + i * 0.02, 0.214] });
  for (const cx of [-0.09, 0.09]) for (const cyR of [-0.04, 0.04]) addRivet(cx, hy - 0.085 + cyR, 0.205, 0.009, "brass");

  // ── ear bolts + side whisker antennas ──
  for (const side of [-1, 1]) {
    add(new CylinderGeometry(0.03, 0.03, 0.06, 18), "brass", { pos: [side * 0.215, hy, 0], rot: [0, 0, Math.PI / 2] });
    add(new CylinderGeometry(0.036, 0.036, 0.02, 6), "brassDark", { pos: [side * 0.245, hy, 0], rot: [0, 0, Math.PI / 2] });
    add(new SphereGeometry(0.012, 12, 10), "brass", { pos: [side * 0.255, hy, 0] });
    // angled whisker rod with ball tip
    add(new CylinderGeometry(0.004, 0.004, 0.16, 8), "gunmetal", { pos: [side * 0.27, hy + 0.07, 0], rot: [0, 0, side * 0.5] });
    add(new SphereGeometry(0.013, 12, 10), "copper", { pos: [side * 0.33, hy + 0.14, 0] });
  }
}

function buildTopAntennas() {
  const ty = 1.96; // dome top
  // central rod with a flat brass disc (the "cymbal") and a ball finial
  add(new CylinderGeometry(0.009, 0.011, 0.2, 14), "brass", { pos: [0, ty + 0.1, 0] });
  add(new CylinderGeometry(0.05, 0.05, 0.012, 28), "brassLight", { pos: [0, ty + 0.06, 0] }); // disc plate
  add(new SphereGeometry(0.024, 18, 14), "brass", { pos: [0, ty + 0.21, 0] });
  // brass gear sitting on the dome top, tilted
  add(gearGeometry({ teeth: 14, outer: 0.075, root: 0.058, bore: 0.016, depth: 0.02 }), "brass", { pos: [0.07, ty + 0.0, 0.03], rot: [Math.PI / 2 - 0.25, 0, 0.2] });
  // right tall antenna with a loop tip
  add(new CylinderGeometry(0.005, 0.005, 0.26, 10), "gunmetal", { pos: [0.12, ty + 0.12, -0.02], rot: [0, 0, -0.18] });
  add(new TorusGeometry(0.026, 0.005, 8, 20), "brass", { pos: [0.17, ty + 0.25, -0.02], rot: [Math.PI / 2, 0, 0] });
  // left coiled spring antenna
  add(springGeometry({ height: 0.16, coilRadius: 0.02, tubeRadius: 0.005, turns: 7, tubular: 120, radial: 8 }), "gunmetal", { pos: [-0.1, ty + 0.1, 0.0] });
  add(new SphereGeometry(0.015, 14, 10), "copper", { pos: [-0.1, ty + 0.19, 0.0] });
}

function buildFlag() {
  // SPROCKET-BOT pennant on a thin pole (right of the head/shoulder)
  const fx = 0.5, fz = -0.04, fy = 1.52;
  add(new CylinderGeometry(0.006, 0.006, 0.46, 10), "brassDark", { pos: [fx, fy + 0.23, fz] });
  add(new SphereGeometry(0.014, 12, 10), "brass", { pos: [fx, fy + 0.47, fz] });
  const pennant = new Shape();
  pennant.moveTo(0, 0); pennant.lineTo(0.26, 0.04); pennant.lineTo(0.0, 0.08); pennant.lineTo(0, 0);
  const geo = new ExtrudeGeometry(pennant, { depth: 0.004, bevelEnabled: false });
  geo.computeVertexNormals();
  add(geo, "cream", { pos: [fx + 0.012, fy + 0.36, fz - 0.002] });
  add(new BoxGeometry(0.02, 0.07, 0.006), "red", { pos: [fx + 0.028, fy + 0.4, fz] });
}

function buildBaseShadow() {
  add(new CylinderGeometry(0.38, 0.38, 0.004, 40), "rubber", { pos: [0, 0.002, 0.03] });
}

buildBoots();
buildLegs();
buildTorso();
buildShoulders();
buildArms();
buildPropeller();
buildNeck();
buildHead();
buildTopAntennas();
buildFlag();
buildBaseShadow();

// Seat the model on the floor: shift every vertex so the lowest sits at y = 0
// (the avatar places the host with position.y at the feet).
let minY = Infinity;
let maxY = -Infinity;
for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) if (p.positions[i] < minY) minY = p.positions[i];
for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) {
  p.positions[i] -= minY;
  if (p.positions[i] > maxY) maxY = p.positions[i];
}

// ── Merge by material → write GLB ────────────────────────────────────────────
const byMaterial = new Map();
for (const part of parts) {
  if (!byMaterial.has(part.material)) byMaterial.set(part.material, []);
  byMaterial.get(part.material).push(part);
}

const doc = new Document();
Object.assign(doc.getRoot().getAsset(), { generator: "3DSpace sprocket-bot builder v2" });
const scene = doc.createScene("Sprocket-Bot");
const rootNode = doc.createNode("Sprocket-Bot");
scene.addChild(rootNode);
const buffer = doc.createBuffer();

let totalTriangles = 0;
for (const [materialKey, group] of byMaterial) {
  let vertCount = 0, idxCount = 0;
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

  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer))
    .setMaterial(mat);
  rootNode.addChild(doc.createNode(materialKey).setMesh(doc.createMesh(materialKey).addPrimitive(prim)));
}

await mkdir(dirname(OUT_PATH), { recursive: true });
const glb = await new NodeIO().writeBinary(doc);
await writeFile(OUT_PATH, Buffer.from(glb));

console.log(`Wrote ${OUT_PATH}`);
console.log(`Parts: ${parts.length}  ·  Materials (primitives): ${byMaterial.size}`);
console.log(`Triangles: ${totalTriangles.toLocaleString()}`);
console.log(`Height (feet→top): ${maxY.toFixed(3)} m`);
console.log(`File size: ${(glb.byteLength / 1024).toFixed(1)} KB`);
