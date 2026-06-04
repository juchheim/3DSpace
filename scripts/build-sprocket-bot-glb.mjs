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
  PlaneGeometry,
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
import sharp from "sharp";

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
  glassBulb: { hex: "#fff4cf", metalness: 0, roughness: 0.12, emissive: [1.0, 0.82, 0.42], alpha: 0.6 },
  // "eyeGlow" is found + pulsed by name in SprocketBotHostAvatar. Dark base +
  // strong amber emissive so it reads as a self-lit warm oil-lamp bulb.
  eyeGlow: { hex: "#5e2400", metalness: 0.1, roughness: 0.5, emissive: [1.0, 0.44, 0.09] },
  filament: { hex: "#ffcf80", metalness: 0, roughness: 0.4, emissive: [1.0, 0.58, 0.2] },
  highlight: { hex: "#fff4d8", metalness: 0.0, roughness: 0.25, emissive: [0.7, 0.62, 0.42] },
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

function bakePart(geometry, material, opts = {}) {
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
  geometry.dispose?.();
  return { positions: outPos, normals: outNorm, indices, material };
}

/** Bake + collect a part into the merged static mesh. */
function add(geometry, material, opts = {}) {
  parts.push(bakePart(geometry, material, opts));
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

// Movable iris meshes (one per eye) are emitted as their own nodes after the
// static merge, so the avatar can dart them around for a lifelike gaze.
// Each entry: { name, center:[x,y,z], parts:[bakedPart,…] } (parts are local).
const irisSpecs = [];

/**
 * Round, layered eye facing +Z (no tilt): a static brass socket (concentric
 * bezel rings + dark interior, merged) plus a separate movable warm "oil-lamp"
 * bulb/iris node the runtime gazes around inside the socket.
 */
function buildEye(name, cx, cy, cz, R) {
  // recessed brass housing cup (axis along Z)
  add(new CylinderGeometry(R * 1.0, R * 1.18, 0.08, 32), "brass", { pos: [cx, cy, cz - 0.05], rot: [Math.PI / 2, 0, 0] });
  // thin dark backing disc (just enough to set off the glow, not a deep well)
  add(new SphereGeometry(R * 0.78, 26, 18), "socket", { pos: [cx, cy, cz - 0.03], scale: [1, 1, 0.3] });
  // layered concentric brass bezel rings (in the XY plane, facing +Z)
  add(new TorusGeometry(R * 1.06, R * 0.17, 16, 40), "brassLight", { pos: [cx, cy, cz] });
  add(new TorusGeometry(R * 0.9, R * 0.1, 14, 34), "brass", { pos: [cx, cy, cz + 0.013] });
  add(new TorusGeometry(R * 0.76, R * 0.055, 12, 30), "brassDark", { pos: [cx, cy, cz + 0.024] });
  rivetRingForCircle(cx, cy, cz, R * 1.3, 10, 0.009, "brass");

  // ── movable warm bulb / iris (separate node; geometry local-centred) ──
  // A shallow dome whose apex sits just inside the bezel front: clearly visible
  // (not lost in the dark), yet not protruding on a stalk.
  const lp = [];
  lp.push(bakePart(new SphereGeometry(R * 0.54, 28, 22), "eyeGlow", { pos: [0, 0, 0.0], scale: [1, 1, 0.85] }));     // glowing bulb dome
  lp.push(bakePart(new TorusGeometry(R * 0.24, R * 0.04, 8, 18), "filament", { pos: [0, 0, 0.024] }));               // filament coil
  lp.push(bakePart(new BoxGeometry(0.0035, R * 0.52, 0.0035), "filament", { pos: [0, 0, 0.027] }));                  // upright filament
  lp.push(bakePart(new SphereGeometry(R * 0.11, 12, 10), "highlight", { pos: [-R * 0.22, R * 0.24, 0.03] }));        // catchlight
  irisSpecs.push({ name, center: [cx, cy, cz - 0.002], parts: lp });
}

// A ring (torus) centred at p with its axis along dir — used for copper banding.
const _zAxis = new Vector3(0, 0, 1);
function ringAt(p, dir, R, tube, mat) {
  _dir.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(_zAxis, _dir);
  _qe.setFromQuaternion(_q);
  add(new TorusGeometry(R, tube, 10, 22), mat, { pos: p, rot: [_qe.x, _qe.y, _qe.z] });
}

/** Evenly spaced copper bands wrapping an arm segment between p0 and p1. */
function armBands(p0, p1, r0, r1, n, mat = "copper") {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    ringAt([p0[0] + d[0] * t, p0[1] + d[1] * t, p0[2] + d[2] * t], d, r0 + (r1 - r0) * t + 0.006, 0.01, mat);
  }
}

/** Cylinder hinge elbow: a spool across the bend axis (X) with copper end discs + bolt caps. */
function hingeElbow(p, r = 0.05, len = 0.095) {
  add(new CylinderGeometry(r, r, len, 26), "darkSteel", { pos: p, rot: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) {
    add(new CylinderGeometry(r * 1.12, r * 1.12, 0.014, 26), "copper", { pos: [p[0] + s * len / 2, p[1], p[2]], rot: [0, 0, Math.PI / 2] });
    add(new CylinderGeometry(r * 0.46, r * 0.46, 0.03, 6), "brass", { pos: [p[0] + s * (len / 2 + 0.012), p[1], p[2]], rot: [0, 0, Math.PI / 2] }); // hex bolt cap
    add(new SphereGeometry(r * 0.22, 10, 8), "brassLight", { pos: [p[0] + s * (len / 2 + 0.03), p[1], p[2]] });
  }
}

/** Wrist collar shared by both hands. */
function wristCollar(wr, dy = 0.0) {
  add(new CylinderGeometry(0.034, 0.04, 0.05, 18), "brass", { pos: [wr[0], wr[1] + dy, wr[2]] });
  add(new TorusGeometry(0.04, 0.011, 10, 22), "copper", { pos: [wr[0], wr[1] + dy + 0.024, wr[2]] });
}

/** Bulb-cradling hand: two prongs curl UP around the bulb base, glass pointing up. */
function bulbHand(wr) {
  wristCollar(wr, -0.02);
  const bx = wr[0], by = wr[1] + 0.04, bz = wr[2] + 0.02;
  for (const side of [-1, 1]) {
    const pts = [
      [bx + side * 0.028, by - 0.02, bz - 0.012],
      [bx + side * 0.058, by + 0.035, bz + 0.0],
      [bx + side * 0.052, by + 0.088, bz + 0.02],
      [bx + side * 0.022, by + 0.122, bz + 0.034] // curl in over the bulb
    ];
    add(tubeThrough(pts, 0.013, { tubular: 28, radial: 8 }), "gunmetal");
    add(new SphereGeometry(0.015, 12, 10), "darkSteel", { pos: pts[3] });   // fingertip
    add(new SphereGeometry(0.013, 10, 8), "brass", { pos: pts[0] });        // knuckle bolt
  }
  lightBulb(bx, by, bz); // base in the cradle, glass above
  // colourful wires trailing from the bulb base
  add(tubeThrough([[bx - 0.02, by - 0.03, bz], [bx - 0.06, by - 0.13, bz + 0.02], [bx - 0.03, by - 0.23, bz - 0.01]], 0.009, { tubular: 28 }), "wireRed");
  add(tubeThrough([[bx + 0.02, by - 0.03, bz], [bx + 0.06, by - 0.15, bz + 0.02], [bx + 0.02, by - 0.25, bz]], 0.009, { tubular: 28 }), "wireYellow");
  add(tubeThrough([[bx, by - 0.04, bz + 0.01], [bx, by - 0.17, bz + 0.04], [bx - 0.03, by - 0.27, bz + 0.02]], 0.009, { tubular: 28 }), "wireBlue");
}

/** Open two-prong pincer (empty hand): prongs curl inward at the tips. */
function openClaw(wr) {
  wristCollar(wr, 0.03);
  add(new SphereGeometry(0.03, 16, 12), "darkSteel", { pos: wr });
  for (const side of [-1, 1]) {
    const pts = [
      [wr[0] + side * 0.026, wr[1] - 0.01, wr[2]],
      [wr[0] + side * 0.052, wr[1] - 0.06, wr[2] + 0.02],
      [wr[0] + side * 0.046, wr[1] - 0.11, wr[2] + 0.05],
      [wr[0] + side * 0.016, wr[1] - 0.142, wr[2] + 0.078] // curl inward
    ];
    add(tubeThrough(pts, 0.014, { tubular: 28, radial: 8 }), "gunmetal");
    add(new ConeGeometry(0.016, 0.036, 10), "darkSteel", { pos: pts[3], rot: [Math.PI * 0.8, 0, 0] });
    add(new SphereGeometry(0.013, 10, 8), "brass", { pos: pts[0] });
  }
}

/**
 * A standard incandescent light bulb (not an egg): a lathe-revolved A-shape glass
 * envelope on a threaded Edison screw base with insulator + solder contact tip,
 * a brass seam collar, and an internal filament. y = bottom of the metal base.
 */
function lightBulb(x, y, z) {
  // ── metal Edison screw base ──
  add(new SphereGeometry(0.0085, 12, 10), "brass", { pos: [x, y + 0.003, z], scale: [1, 0.7, 1] });           // solder contact tip
  add(new CylinderGeometry(0.012, 0.0085, 0.012, 16), "darkSteel", { pos: [x, y + 0.012, z] });               // black insulator
  add(new CylinderGeometry(0.022, 0.016, 0.046, 24), "brassDark", { pos: [x, y + 0.04, z] });                 // screw shell
  add(springGeometry({ height: 0.044, coilRadius: 0.0226, tubeRadius: 0.0035, turns: 6, tubular: 96, radial: 6 }), "brass", { pos: [x, y + 0.04, z] }); // helical thread
  // ── glass envelope (A-bulb profile, revolved) ──
  const prof = [
    [0.02, 0.0], [0.022, 0.008], [0.034, 0.024], [0.044, 0.046],
    [0.046, 0.072], [0.041, 0.097], [0.027, 0.117], [0.013, 0.131], [0.0, 0.136]
  ].map(([r, h]) => new Vector2(r, h));
  const glass = new LatheGeometry(prof, 36);
  glass.computeVertexNormals();
  add(glass, "glassBulb", { pos: [x, y + 0.063, z] });
  // brass collar at the glass/base seam
  add(new TorusGeometry(0.021, 0.006, 10, 24), "brass", { pos: [x, y + 0.065, z] });
  // ── internal filament: two support wires + a coil (visible through the glass) ──
  add(new BoxGeometry(0.0028, 0.028, 0.0028), "filament", { pos: [x - 0.007, y + 0.108, z] });
  add(new BoxGeometry(0.0028, 0.028, 0.0028), "filament", { pos: [x + 0.007, y + 0.108, z] });
  add(new TorusGeometry(0.008, 0.0024, 6, 14), "filament", { pos: [x, y + 0.122, z], rot: [Math.PI / 2, 0, 0] });
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

// Shared torso dimensions (used by the back pack + shoulders too).
const TORSO = { cy: 1.14, R: 0.33, H: 0.56 };
const TORSO_TOP = TORSO.cy + TORSO.H / 2; // 1.42
const TORSO_BOT = TORSO.cy - TORSO.H / 2; // 0.86

function buildTorso() {
  const { cy, R, H } = TORSO;
  const top = TORSO_TOP, bot = TORSO_BOT;
  // z on the curved front surface for a given x (so instruments hug the barrel)
  const zAt = (x, off = 0.004) => Math.sqrt(Math.max(0.0004, R * R - x * x)) + off;

  // main brass barrel — compact, slightly waisted toward the bottom
  add(new CylinderGeometry(R, R * 0.92, H, 60), "brass", { pos: [0, cy, 0] });
  // blue painted front panel (proud curved segment hugging the barrel)
  add(new CylinderGeometry(R * 1.012, R * 0.94, H * 0.76, 60, 1, true, -0.8, 1.6), "steelBlue", { pos: [0, cy - 0.01, 0] });
  // LOW brass shoulder deck — the neck emerges cleanly above it (no longer covers the neck)
  add(new SphereGeometry(R * 0.92, 48, 22, 0, Math.PI * 2, 0, Math.PI / 2), "brass", { pos: [0, top - 0.015, 0], scale: [1, 0.16, 1] });
  add(new CylinderGeometry(0.1, 0.13, 0.05, 28), "brass", { pos: [0, top + 0.0, 0] }); // neck collar base
  // top + bottom flange belts with rivets
  for (const by of [top - 0.01, bot + 0.01]) {
    add(new TorusGeometry(R * 0.99, 0.026, 14, 60), "brassDark", { pos: [0, by, 0], rot: [Math.PI / 2, 0, 0] });
    rivetRingY(by, R * 0.99, 26, 0.011, "brass");
  }
  // mid brass border framing the blue panel
  add(new TorusGeometry(R * 1.0, 0.013, 12, 60), "brass", { pos: [0, cy + 0.05, 0], rot: [Math.PI / 2, 0, 0] });

  // handles on the deck (brass D-rings)
  for (const side of [-1, 1]) add(new TorusGeometry(0.045, 0.011, 12, 24, Math.PI), "brass", { pos: [side * 0.1, top + 0.015, 0.09] });

  // ── front instruments — each centred on the curved front via zAt ──
  gauge(0.05, cy + 0.07, zAt(0.05) + 0.015, 0.1, { needleDeg: -28, ticks: 11 });
  rainbowDial(-0.14, cy + 0.13, zAt(-0.14) + 0.012, 0.042);
  rainbowDial(-0.075, cy + 0.16, zAt(-0.075) + 0.012, 0.036);
  add(gearGeometry({ teeth: 14, outer: 0.058, root: 0.046, bore: 0.014, depth: 0.024 }), "brassDark", { pos: [-0.17, cy - 0.03, zAt(-0.17)], rot: [0, 0, 0.2] });
  add(gearGeometry({ teeth: 10, outer: 0.04, root: 0.03, bore: 0.01, depth: 0.02 }), "brass", { pos: [-0.1, cy - 0.07, zAt(-0.1) + 0.004], rot: [0, 0, -0.3] });
  add(gearGeometry({ teeth: 8, outer: 0.03, root: 0.023, bore: 0.008, depth: 0.018 }), "copper", { pos: [-0.045, cy - 0.02, zAt(-0.045) + 0.006], rot: [0, 0, 0.1] });
  porthole(-0.1, cy - 0.15, zAt(-0.1) + 0.012, 0.082);
  jewel(0.15, cy - 0.04, zAt(0.15) + 0.008, 0.022, "jewelAmber");
  jewel(0.18, cy - 0.1, zAt(0.18) + 0.006, 0.018, "jewelGreen");
  jewel(0.18, cy - 0.15, zAt(0.18) + 0.006, 0.018, "jewelRed");
  // red button
  add(new CylinderGeometry(0.03, 0.034, 0.026, 24), "brassDark", { pos: [0.1, cy - 0.19, zAt(0.1)], rot: [Math.PI / 2, 0, 0] });
  add(new SphereGeometry(0.028, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2), "red", { pos: [0.1, cy - 0.19, zAt(0.1) + 0.012], rot: [-Math.PI / 2, 0, 0] });
  // knurled brass control knob
  add(new CylinderGeometry(0.026, 0.03, 0.034, 18), "brass", { pos: [-0.2, cy - 0.14, zAt(-0.2)], rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; add(new BoxGeometry(0.005, 0.034, 0.007), "brassDark", { pos: [-0.2 + Math.cos(a) * 0.026, cy - 0.14, zAt(-0.2) + Math.sin(a) * 0.026], rot: [Math.PI / 2, -a, 0] }); }
  // looping coloured wires across the panel
  add(tubeThrough([[0.16, cy + 0.0, zAt(0.16)], [0.25, cy - 0.05, zAt(0.16) + 0.05], [0.22, cy - 0.16, zAt(0.16) + 0.02], [0.13, cy - 0.21, zAt(0.13)]], 0.011, { tubular: 48 }), "wireRed");
  add(tubeThrough([[-0.02, cy - 0.2, zAt(0)], [0.05, cy - 0.27, zAt(0) + 0.04], [0.12, cy - 0.22, zAt(0.12)]], 0.009, { tubular: 36 }), "wireYellow");
  // panel rivet arcs (follow the curve)
  rivetArcFront(top - 0.06, R, -46, 46, 9, 0.011, "brass");
  rivetArcFront(bot + 0.06, R, -46, 46, 9, 0.011, "brass");
  // lower-back vent grille (visible from behind)
  for (let i = -2; i <= 2; i++) add(new BoxGeometry(0.18, 0.014, 0.01), "darkSteel", { pos: [0, cy - 0.12 + i * 0.028, -zAt(0) + 0.01] });
}

function shoulderHub(x, side) {
  // stub from the torso deck out to the shoulder ball
  beam([side * TORSO.R, 1.36, 0], [x, 1.34, 0], 0.07, 0.08, "brass", 20);
  add(new SphereGeometry(0.1, 32, 22), "brass", { pos: [x, 1.34, 0.0] });
  add(new TorusGeometry(0.088, 0.022, 14, 30), "copper", { pos: [x, 1.34, 0.0], rot: [0, 0, Math.PI / 2] });
  rivetRingForCircle(x, 1.34, 0.088, 0.072, 8, 0.01, "brass");
  add(gearGeometry({ teeth: 12, outer: 0.062, root: 0.048, bore: 0.014, depth: 0.022 }), "brassDark", { pos: [x, 1.34, 0.092], rot: [0, 0, side * 0.2] });
}

function buildShoulders() {
  shoulderHub(-0.5, -1);
  shoulderHub(0.5, 1);
}

function buildArms() {
  // ── robot's right arm = IMAGE LEFT (−X): raised, gripping a glowing bulb ──
  {
    const sh = [-0.5, 1.32, 0.02];
    const el = [-0.58, 1.1, 0.18];
    const wr = [-0.45, 1.16, 0.4];
    beam(sh, el, 0.05, 0.044, "headBlue");      // upper arm
    armBands(sh, el, 0.05, 0.044, 3, "copper");
    hingeElbow(el, 0.052, 0.095);               // cylinder hinge
    beam(el, wr, 0.044, 0.034, "brass");        // forearm
    armBands(el, wr, 0.044, 0.034, 3, "copper");
    bulbHand(wr);
  }
  // ── robot's left arm = IMAGE RIGHT (+X): lowered, open claw ──
  {
    const sh = [0.5, 1.32, 0.02];
    const el = [0.57, 1.05, 0.05];
    const wr = [0.55, 0.82, 0.09];
    beam(sh, el, 0.05, 0.044, "headBlue");
    armBands(sh, el, 0.05, 0.044, 3, "copper");
    hingeElbow(el, 0.052, 0.095);
    beam(el, wr, 0.044, 0.034, "brass");
    armBands(el, wr, 0.044, 0.034, 3, "copper");
    openClaw(wr);
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
  // accordion bellows bridging the torso deck (1.42) and the head chin (1.54)
  add(new CylinderGeometry(0.058, 0.082, 0.14, 28), "darkSteel", { pos: [0, 1.47, 0] });
  for (let i = 0; i < 5; i++) {
    const r = 0.075 - Math.abs(i - 2) * 0.004;
    add(new TorusGeometry(r, 0.015, 12, 30), "gunmetal", { pos: [0, 1.42 + i * 0.026, 0], rot: [Math.PI / 2, 0, 0] });
  }
  // colourful wires running up the neck into the head
  add(tubeThrough([[0.03, 1.4, 0.05], [0.05, 1.48, 0.07], [0.03, 1.56, 0.06]], 0.008, { tubular: 24 }), "wireRed");
  add(tubeThrough([[-0.03, 1.4, 0.05], [-0.05, 1.48, 0.07], [-0.03, 1.56, 0.06]], 0.008, { tubular: 24 }), "wireBlue");
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

  // ── round, layered eyes with movable warm-bulb irises ──
  const eyeR = 0.067;
  buildEye("eyeIris_L", -0.088, hy + 0.035, 0.205, eyeR);
  buildEye("eyeIris_R", 0.088, hy + 0.035, 0.205, eyeR);

  // ── copper mouth grille with VERTICAL slots (wide, lower-centre of the face) ──
  const my = hy - 0.088, mz0 = 0.19;
  add(new BoxGeometry(0.215, 0.1, 0.03), "copper", { pos: [0, my, mz0], rot: [0.04, 0, 0] });        // surround plate
  add(new BoxGeometry(0.182, 0.074, 0.025), "socket", { pos: [0, my, mz0 + 0.016] });                 // dark recess
  for (let i = -3; i <= 3; i++) add(new BoxGeometry(0.014, 0.068, 0.022), "copperDark", { pos: [i * 0.026, my, mz0 + 0.025] }); // 7 vertical bars
  for (const sx of [-0.094, 0.094]) for (const sy of [-0.038, 0.038]) addRivet(sx, my + sy, mz0 + 0.012, 0.009, "brass");

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

// Where the textured pennant attaches (set by buildBackPack, used after merge).
let flagAnchor = { x: 0, y: 1.8, z: -0.4, lean: -0.22 };

function buildBackPack() {
  // A riveted boiler/tank mounted on the upper back (offset to +X = image right).
  // The flag pole roots into the top of this tank, so the pennant is no longer
  // floating. Matches the back/side reference views.
  const tx = 0.13, tz = -0.42, tankR = 0.12, tankH = 0.44;
  const tcy = 1.05 + tankH / 2; // tank centre ≈ 1.27
  add(new CylinderGeometry(tankR, tankR, tankH, 32), "gunmetal", { pos: [tx, tcy, tz] });
  add(new SphereGeometry(tankR, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), "gunmetal", { pos: [tx, tcy + tankH / 2, tz], scale: [1, 0.7, 1] });
  add(new SphereGeometry(tankR, 32, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), "gunmetal", { pos: [tx, tcy - tankH / 2, tz], scale: [1, 0.7, 1] });
  add(new TorusGeometry(tankR, 0.016, 12, 32), "brass", { pos: [tx, tcy + 0.12, tz], rot: [Math.PI / 2, 0, 0] });
  add(new TorusGeometry(tankR, 0.016, 12, 32), "brass", { pos: [tx, tcy - 0.12, tz], rot: [Math.PI / 2, 0, 0] });
  rivetRingY(tcy + 0.12, tankR, 14, 0.011, "brass");
  rivetRingY(tcy - 0.12, tankR, 14, 0.011, "brass");
  // mounting brackets to the torso back
  beam([tx - 0.04, tcy + 0.1, tz + 0.04], [0.02, TORSO_TOP - 0.1, -TORSO.R + 0.02], 0.016, 0.016, "brassDark", 12);
  beam([tx - 0.04, tcy - 0.1, tz + 0.04], [0.02, TORSO.cy - 0.1, -TORSO.R + 0.02], 0.016, 0.016, "brassDark", 12);
  // copper pipes from the tank into the torso back
  add(tubeThrough([[tx - 0.08, tcy + 0.14, tz + 0.04], [tx - 0.18, tcy + 0.08, tz + 0.14], [-0.04, TORSO.cy + 0.12, -TORSO.R + 0.04]], 0.02, { tubular: 48 }), "copper");
  add(tubeThrough([[tx - 0.06, tcy - 0.14, tz + 0.04], [tx - 0.16, TORSO.cy, tz + 0.14], [0.02, TORSO.cy - 0.06, -TORSO.R + 0.04]], 0.018, { tubular: 48 }), "copper");
  // red valve/petcock on top of the tank
  add(new CylinderGeometry(0.018, 0.024, 0.05, 14), "brass", { pos: [tx, tcy + tankH / 2 + 0.05, tz] });
  add(new TorusGeometry(0.032, 0.009, 10, 20), "red", { pos: [tx, tcy + tankH / 2 + 0.09, tz], rot: [Math.PI / 2, 0, 0] });
  add(new SphereGeometry(0.02, 16, 12), "red", { pos: [tx, tcy + tankH / 2 + 0.09, tz] });

  // ── flag pole rooted in the tank top, leaning out to +X ──
  const lean = -0.24;
  const poleBase = [tx, tcy + tankH / 2 + 0.06, tz];
  const poleLen = 0.42;
  const poleTop = [poleBase[0] - Math.sin(lean) * poleLen, poleBase[1] + Math.cos(lean) * poleLen, poleBase[2]];
  add(new CylinderGeometry(0.008, 0.01, poleLen, 12), "brassDark", {
    pos: [(poleBase[0] + poleTop[0]) / 2, (poleBase[1] + poleTop[1]) / 2, tz], rot: [0, 0, lean]
  });
  add(new SphereGeometry(0.014, 12, 10), "brass", { pos: poleTop });
  flagAnchor = { x: poleTop[0], y: poleTop[1] - 0.02, z: tz, lean };
}

function buildBaseShadow() {
  add(new CylinderGeometry(0.38, 0.38, 0.004, 40), "rubber", { pos: [0, 0.002, 0.03] });
}

buildBoots();
buildLegs();
buildTorso();
buildBackPack();
buildShoulders();
buildArms();
buildPropeller();
buildNeck();
buildHead();
buildTopAntennas();
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
  const a = def.alpha ?? 1;
  const mat = doc.createMaterial(materialKey)
    .setBaseColorFactor([r, g, b, a])
    .setRoughnessFactor(def.roughness)
    .setMetallicFactor(def.metalness);
  if (a < 1) { mat.setAlphaMode("BLEND"); mat.setDoubleSided(true); }
  if (def.emissive) mat.setEmissiveFactor(def.emissive);

  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer))
    .setMaterial(mat);
  rootNode.addChild(doc.createNode(materialKey).setMesh(doc.createMesh(materialKey).addPrimitive(prim)));
}

// ── SPROCKET-BOT pennant: a waving banner with an embedded "SPROCKET-BOT"
//    texture, rooted at the back-pack flag pole. Embedded (no external URI) and
//    1024×320 (≤2048), so it still passes the room-object upload validator. ──
{
  // NB: sharp/resvg ignores SVG textLength, so size the font to fit the width.
  const TW = 1536, TH = 400;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}">
    <rect width="${TW}" height="${TH}" fill="#efe6cf"/>
    <rect x="14" y="14" width="${TW - 28}" height="${TH - 28}" fill="none" stroke="#b09a5e" stroke-width="9"/>
    <text x="${TW / 2}" y="${TH / 2 + 8}" font-family="Georgia, 'DejaVu Serif', 'Times New Roman', serif" font-weight="bold" font-size="150" fill="#33506b" text-anchor="middle" dominant-baseline="central">SPROCKET-BOT</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const tex = doc.createTexture("sprocketBotFlag").setImage(new Uint8Array(png)).setMimeType("image/png");
  const flagMat = doc.createMaterial("flag")
    .setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.7).setMetallicFactor(0.0)
    .setDoubleSided(true).setBaseColorTexture(tex);

  const bw = 0.5, bh = 0.16;
  const plane = new PlaneGeometry(bw, bh, 40, 3);
  const pp = plane.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const u = pp.getX(i) / bw + 0.5; // 0 at hoist → 1 at fly
    pp.setZ(i, Math.sin(u * Math.PI * 2.4) * 0.024 * u); // gentle wave
    pp.setY(i, pp.getY(i) * (1 - 0.16 * u)); // slight taper toward the fly
  }
  plane.computeVertexNormals();

  // Translate so the hoist edge meets the pole top; match the floor-seat shift.
  const ax = flagAnchor.x + bw / 2, ay = flagAnchor.y - minY, az = flagAnchor.z;
  const src = plane.attributes.position.array, nrm = plane.attributes.normal.array;
  const fpos = new Float32Array(src.length), fnor = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    fpos[i] = src[i] + ax; fpos[i + 1] = src[i + 1] + ay; fpos[i + 2] = src[i + 2] + az;
    fnor[i] = nrm[i]; fnor[i + 1] = nrm[i + 1]; fnor[i + 2] = nrm[i + 2];
  }
  const flagPrim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(fpos).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(fnor).setBuffer(buffer))
    // flip V only (keep U) so the text reads upright + left-to-right on the
    // front (+Z) face users see
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(Float32Array.from(plane.attributes.uv.array, (val, i) => (i % 2 === 0 ? val : 1 - val))).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(Uint32Array.from(plane.index.array)).setBuffer(buffer))
    .setMaterial(flagMat);
  rootNode.addChild(doc.createNode("flag").setMesh(doc.createMesh("flag").addPrimitive(flagPrim)));
  totalTriangles += plane.index.count / 3;
  plane.dispose();
}

// ── Movable iris nodes (round glowing eyes the runtime darts around) ──
{
  const irisMatCache = new Map();
  const irisMat = (key) => {
    if (irisMatCache.has(key)) return irisMatCache.get(key);
    const def = MATERIALS[key];
    const [r, g, b] = hexToLinear(def.hex);
    const m = doc.createMaterial(key).setBaseColorFactor([r, g, b, 1]).setRoughnessFactor(def.roughness).setMetallicFactor(def.metalness);
    if (def.emissive) m.setEmissiveFactor(def.emissive);
    irisMatCache.set(key, m);
    return m;
  };
  for (const spec of irisSpecs) {
    const mesh = doc.createMesh(spec.name);
    const byMat = new Map();
    for (const p of spec.parts) {
      if (!byMat.has(p.material)) byMat.set(p.material, []);
      byMat.get(p.material).push(p);
    }
    for (const [matKey, group] of byMat) {
      let vc = 0, ic = 0;
      for (const p of group) { vc += p.positions.length / 3; ic += p.indices.length; }
      const positions = new Float32Array(vc * 3), normals = new Float32Array(vc * 3), indices = new Uint32Array(ic);
      let vo = 0, io = 0;
      for (const p of group) {
        positions.set(p.positions, vo * 3); normals.set(p.normals, vo * 3);
        for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i] + vo;
        vo += p.positions.length / 3; io += p.indices.length;
      }
      totalTriangles += ic / 3;
      mesh.addPrimitive(doc.createPrimitive()
        .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer))
        .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer))
        .setMaterial(irisMat(matKey)));
    }
    rootNode.addChild(doc.createNode(spec.name).setMesh(mesh).setTranslation([spec.center[0], spec.center[1] - minY, spec.center[2]]));
  }
}

await mkdir(dirname(OUT_PATH), { recursive: true });
const glb = await new NodeIO().writeBinary(doc);
await writeFile(OUT_PATH, Buffer.from(glb));

console.log(`Wrote ${OUT_PATH}`);
console.log(`Parts: ${parts.length}  ·  Materials (primitives): ${byMaterial.size}`);
console.log(`Triangles: ${totalTriangles.toLocaleString()}`);
console.log(`Height (feet→top): ${maxY.toFixed(3)} m`);
console.log(`File size: ${(glb.byteLength / 1024).toFixed(1)} KB`);
