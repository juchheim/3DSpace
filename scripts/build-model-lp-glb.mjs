// Build the "MODEL-LP" world-host GLB — a faithful, weathered reproduction of the
// red-and-steel utility mech in the supplied three-view reference (front / side /
// back). Every form is sculpted to match the drawing rather than stood in with a
// bare primitive: chamfered armour plates are extruded silhouettes, limbs are
// tapered cylinders with real elbow/knee hinges, the hands are articulated
// three-finger grippers (one clutching an open-end wrench), the feet are tracked
// road-wheel bogies with achilles pistons, and the back carries a twin-canister
// jetpack firing exhaust. Aging is the only simplification: surfaces are solid,
// dull-metallic colours (no decals beyond the stencilled MODEL-LP chest plate).
//
// Geometry is generated with three.js, each part baked into world-space
// position/normal arrays, then merged by group+material into a single glTF 2.0
// binary via @gltf-transform/core. Texture-free apart from two embedded PNGs
// (the MODEL-LP plate + eye screen), so it also passes the custom room-object
// upload validator and can be imported as a placeable object.
//
// Run:  node scripts/build-model-lp-glb.mjs   (or: npm run build:host-glb-modellp)
// Out:  apps/web/public/world-hosts/model-lp.glb

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
  PlaneGeometry,
  ExtrudeGeometry,
  Shape,
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
const OUT_PATH = resolve(__dirname, "../apps/web/public/world-hosts/model-lp.glb");
const DEG = Math.PI / 180;

// ── Material palette (PBR metallic-roughness, baked colours, no textures) ─────
// Metalness kept moderate (the room scene has no env map, so fully-metallic PBR
// renders near-black). Paint reads as worn "dull metallic": some metalness, high
// roughness. Emissive given as linear [r,g,b], all ≤1 (no emissive-strength ext).
const MATERIALS = {
  red:        { hex: "#9e3b2c", metalness: 0.38, roughness: 0.6 },   // weathered brick-red armour paint
  redDark:    { hex: "#7c2c20", metalness: 0.4,  roughness: 0.62 },  // shadowed red panels
  redDeep:    { hex: "#5d2117", metalness: 0.4,  roughness: 0.66 },  // deepest red grooves / inner caps
  steel:      { hex: "#888d91", metalness: 0.55, roughness: 0.5 },   // weathered structural steel
  steelLight: { hex: "#a9afb3", metalness: 0.5,  roughness: 0.42 },  // brighter plates (chest plate, face bezel)
  steelDark:  { hex: "#5b6064", metalness: 0.55, roughness: 0.55 },  // darker steel detail
  gunmetal:   { hex: "#3f4448", metalness: 0.6,  roughness: 0.5 },   // joints, limb cylinders, hoses
  darkRecess: { hex: "#15181b", metalness: 0.3,  roughness: 0.72 },  // screen / vent / deep recess
  rubber:     { hex: "#131417", metalness: 0.1,  roughness: 0.9 },   // treads + wheel tyres
  wrench:     { hex: "#c6cace", metalness: 0.45, roughness: 0.32 },  // bright steel wrench (low metalness reads bright with no env map)
  // "eyeGlow" is found + pulsed by name in the GLB host avatar (cyan screen eyes).
  eyeGlow:    { hex: "#08252e", metalness: 0.1,  roughness: 0.5,  emissive: [0.12, 0.82, 1.0] },
  eyeCore:    { hex: "#cdf4ff", metalness: 0.0,  roughness: 0.3,  emissive: [0.55, 0.9, 1.0] },
  // jet exhaust: opaque emissive frustums stacked vertically (blue at the nozzle
  // → orange at the tip). No env map / bloom in the room scene, so the base is
  // kept very dark and the saturated emissive carries the colour (a lit, light
  // base washes to cream under ACES tone-mapping).
  flameBlue:  { hex: "#0a1f33", metalness: 0, roughness: 0.6, emissive: [0.3, 0.62, 1.0] },
  flameCore:  { hex: "#2a3340", metalness: 0, roughness: 0.6, emissive: [0.7, 0.85, 1.0] },
  flameOrange:{ hex: "#3a1604", metalness: 0, roughness: 0.6, emissive: [1.0, 0.46, 0.08] }
};

function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  const srgb = [(n >> 16 & 0xff) / 255, (n >> 8 & 0xff) / 255, (n & 0xff) / 255];
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
}

// ── Part accumulator (bakes each geometry's transform into world space) ───────
/** @type {Array<{positions:Float32Array,normals:Float32Array,indices:Uint32Array,material:string,group:string}>} */
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

/** Current hierarchy group every added part is tagged with. */
let CUR_GROUP = "Misc";
function group(name, fn) {
  const prev = CUR_GROUP;
  CUR_GROUP = name;
  fn();
  CUR_GROUP = prev;
}

/** Bake + collect a part into the merged static mesh, tagged with its group. */
function add(geometry, material, opts = {}) {
  const p = bakePart(geometry, material, opts);
  p.group = CUR_GROUP;
  parts.push(p);
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Rounded-rectangle profile (centred at origin) for extruded armour boxes. */
function roundedRectShape(w, h, r) {
  const s = new Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Chamfered box (rounded-rect extruded with a bevel), centred on all axes. */
function roundedBoxGeo(w, h, d, r = 0.025, bevel = 0.012) {
  const b = Math.min(bevel, d / 2 - 0.001, w / 2 - 0.001, h / 2 - 0.001);
  const shape = roundedRectShape(w, h, Math.min(r, w / 2 - 0.002, h / 2 - 0.002));
  const geo = new ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - 2 * b), bevelEnabled: b > 0,
    bevelThickness: b, bevelSize: b, bevelSegments: 2, steps: 1, curveSegments: 4
  });
  geo.computeBoundingBox();
  geo.translate(0, 0, -(geo.boundingBox.min.z + geo.boundingBox.max.z) / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Extrude a closed 2D silhouette (list of [x,y]) along Z, centred in Z. */
function extrudeProfile(pts, depth, { bevel = 0.012, curveSegments = 4 } = {}) {
  const shape = new Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const b = Math.min(bevel, depth / 2 - 0.001);
  const geo = new ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - 2 * b), bevelEnabled: b > 0,
    bevelThickness: b, bevelSize: b, bevelSegments: 2, steps: 1, curveSegments
  });
  geo.computeBoundingBox();
  geo.translate(0, 0, -(geo.boundingBox.min.z + geo.boundingBox.max.z) / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Smooth tube through control points (hoses / wires / cables). */
function tubeThrough(points, tubeRadius = 0.02, { tubular = 60, radial = 10 } = {}) {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(p[0], p[1], p[2])), false, "catmullrom", 0.5);
  return new TubeGeometry(curve, tubular, tubeRadius, radial, false);
}

const _q = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _zAxis = new Vector3(0, 0, 1);
const _dir = new Vector3();
const _qe = new Euler();

/** Tapered cylinder from p0 to p1 (Y-cylinder rotated onto the segment). */
function beam(p0, p1, r0, r1, mat, segs = 20) {
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

/** Torus ring centred at p, axis along dir (banding for limbs / nozzles). */
function ringAt(p, dir, R, tube, mat, seg = 24) {
  _dir.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(_zAxis, _dir);
  _qe.setFromQuaternion(_q);
  add(new TorusGeometry(R, tube, 10, seg), mat, { pos: p, rot: [_qe.x, _qe.y, _qe.z] });
}

function addRivet(x, y, z, r = 0.011, mat = "steelDark") {
  add(new SphereGeometry(r, 10, 7), mat, { pos: [x, y, z] });
}

/** A straight run of rivets from p0 to p1. */
function rivetRun(p0, p1, n, r = 0.01, mat = "steelDark") {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    addRivet(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t, r, mat);
  }
}

/** Rivets framing a +Z-facing rectangle (corners + edge runs). */
function rivetFrame(cx, cy, z, w, h, nx, ny, r = 0.009, mat = "steelDark") {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  rivetRun([x0, y0, z], [x1, y0, z], nx, r, mat);
  rivetRun([x0, y1, z], [x1, y1, z], nx, r, mat);
  rivetRun([x0, y0, z], [x0, y1, z], ny, r, mat);
  rivetRun([x1, y0, z], [x1, y1, z], ny, r, mat);
}

/** Ring of rivets around a vertical axis at height y, radius `radius`. */
function rivetRingY(y, radius, count, r = 0.011, mat = "steelDark", cx = 0, cz = 0, phase = 0) {
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    addRivet(cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius, r, mat);
  }
}

/** Hex bolt head with a slight dome (cap fasteners on joints/plates). */
function hexBolt(x, y, z, r = 0.02, depth = 0.016, rot = [0, 0, 0], mat = "steelDark") {
  add(new CylinderGeometry(r, r, depth, 6), mat, { pos: [x, y, z], rot });
  add(new SphereGeometry(r * 0.5, 10, 8), "steel", { pos: [x, y + (rot[0] ? 0 : depth * 0.4), z], rot });
}

/** A row of recessed vent slots (e.g. lower chest grille), facing +Z by default. */
function ventSlots(cx, cy, cz, count, w, h, depth, gap, mat = "darkRecess", rot = [0, 0, 0]) {
  for (let i = 0; i < count; i++) {
    add(new BoxGeometry(w, h, depth), mat, { pos: [cx + (i - (count - 1) / 2) * gap, cy, cz], rot });
  }
}

/** Telescoping hydraulic piston (bright rod sliding in a barrel) p0→p1. */
function piston(p0, p1, rOuter = 0.02, rInner = 0.011, mat = "gunmetal") {
  const mid = [p0[0] + (p1[0] - p0[0]) * 0.55, p0[1] + (p1[1] - p0[1]) * 0.55, p0[2] + (p1[2] - p0[2]) * 0.55];
  beam(p0, p1, rInner, rInner, "steelLight", 12); // chromed rod (full length)
  beam(p0, mid, rOuter, rOuter, mat, 14);          // barrel over the first half
  add(new SphereGeometry(rOuter * 1.05, 12, 9), mat, { pos: p0 });
  add(new SphereGeometry(rInner * 1.2, 10, 8), "steelDark", { pos: p1 });
}

// ── Movable iris meshes (one per eye) emitted as their own nodes after merge,
// so the host avatar can dart them around for a lifelike, expressive gaze.
// Each entry: { name, center:[x,y,z], parts:[bakedPart,…] } (parts local-centred).
const irisSpecs = [];

// ── Rectangular embedded-PNG decals (MODEL-LP plate, eye screen), emitted after
// merge as textured planes facing +Z. Each: { group, w, h, pos:[x,y,z], svg }.
const rectDecals = [];

// ── Detail sub-assemblies ────────────────────────────────────────────────────

// Shared torso anchors (front face z, key heights) used across assemblies.
const CHEST = { cy: 1.27, frontZ: 0.15, backZ: -0.15, topY: 1.50, botY: 1.04 };

/**
 * Glowing screen eyes: a dark inset face screen plus two movable cyan lenses.
 * The lenses are separate "eyeIris_*" nodes the runtime gazes around inside the
 * screen; the lens material is "eyeGlow" so the runtime also pulses it.
 */
function buildFaceScreen(cy, frontZ) {
  CUR_GROUP = "Face";
  // raised steel bezel around the screen
  add(roundedBoxGeo(0.30, 0.165, 0.05, 0.03, 0.012), "steelLight", { pos: [0, cy, frontZ + 0.005] });
  // brow visor lip overhanging the top of the screen
  add(roundedBoxGeo(0.31, 0.03, 0.07, 0.012, 0.008), "steel", { pos: [0, cy + 0.092, frontZ + 0.02], rot: [0.28, 0, 0] });
  // dark recessed screen
  add(roundedBoxGeo(0.255, 0.115, 0.03, 0.02, 0.008), "darkRecess", { pos: [0, cy - 0.004, frontZ + 0.028] });
  // glassy screen face (printed faint cyan grid, dark) so the eyes sit "in" a display
  rectDecals.push({ group: "Face", w: 0.245, h: 0.108, pos: [0, cy - 0.004, frontZ + 0.045], svg: screenSVG() });
  // corner bolts on the bezel
  for (const sx of [-0.13, 0.13]) for (const sy of [-0.07, 0.07]) hexBolt(sx, cy + sy, frontZ + 0.03, 0.011, 0.01, [Math.PI / 2, 0, 0], "steelDark");

  // ── movable cyan lens irises (separate nodes) ──
  CUR_GROUP = "Eyes";
  const ey = cy + 0.012, ez = frontZ + 0.052;
  for (const side of [-1, 1]) {
    const ex = side * 0.062;
    const tilt = side * 0.12; // tops lean slightly inward → friendly/curious
    const lp = [];
    lp.push(bakePart(roundedBoxGeo(0.05, 0.085, 0.022, 0.022, 0.008), "eyeGlow", { pos: [0, 0, 0], rot: [0, 0, tilt] }));
    lp.push(bakePart(roundedBoxGeo(0.03, 0.058, 0.02, 0.014, 0.006), "eyeCore", { pos: [0, 0, 0.006], rot: [0, 0, tilt] }));
    lp.push(bakePart(new SphereGeometry(0.008, 8, 6), "eyeCore", { pos: [-side * 0.008, 0.022, 0.014] })); // catchlight
    irisSpecs.push({ name: side < 0 ? "eyeIris_L" : "eyeIris_R", center: [ex, ey, ez], parts: lp });
  }
}

/** Side sensor disc ("ear") on the head: concentric rings around a dark lens. */
function sensorDisc(side, hy) {
  const x = side * 0.185;
  add(new CylinderGeometry(0.06, 0.06, 0.03, 28), "steel", { pos: [x, hy + 0.01, 0.0], rot: [0, 0, Math.PI / 2] });
  add(new TorusGeometry(0.058, 0.012, 10, 28), "steelDark", { pos: [x + side * 0.016, hy + 0.01, 0.0], rot: [0, Math.PI / 2, 0] });
  add(new TorusGeometry(0.038, 0.009, 10, 24), "steelLight", { pos: [x + side * 0.018, hy + 0.01, 0.0], rot: [0, Math.PI / 2, 0] });
  add(new CylinderGeometry(0.025, 0.025, 0.03, 20), "darkRecess", { pos: [x + side * 0.014, hy + 0.01, 0.0], rot: [0, 0, Math.PI / 2] });
  add(new SphereGeometry(0.012, 12, 10), "steelLight", { pos: [x + side * 0.026, hy + 0.01, 0.0] });
  rivetRingY(hy + 0.01, 0.05, 6, 0.007, "steelDark", x + side * 0.006, 0); // around the disc (approx ring on the side)
}

function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

/**
 * Articulated finger built from a `forward` (point) direction and a `bend`
 * direction (perpendicular, pointing toward the palm). Each phalanx direction is
 * `forward` rotated toward `bend` by the running sum of `jointAngles` — every
 * joint adds a POSITIVE flex, so the curl is monotonic and physically cannot
 * hyperextend backward. Knuckle spheres sit on the convex (back) side; the tip
 * tucks toward the palm. Returns the fingertip position.
 */
function finger(base, forward, bend, segLens, jointAngles, r0, mat, group) {
  CUR_GROUP = group;
  const fwd = norm3(forward), bnd = norm3(bend);
  let p = [base[0], base[1], base[2]];
  let a = 0;
  const pts = [p];
  for (let i = 0; i < segLens.length; i++) {
    a += jointAngles[i];
    const ca = Math.cos(a), sa = Math.sin(a);
    const d = [fwd[0] * ca + bnd[0] * sa, fwd[1] * ca + bnd[1] * sa, fwd[2] * ca + bnd[2] * sa];
    p = [p[0] + d[0] * segLens[i], p[1] + d[1] * segLens[i], p[2] + d[2] * segLens[i]];
    pts.push(p);
  }
  for (let i = 0; i < segLens.length; i++) {
    const r = r0 * (1 - i * 0.13);
    add(new SphereGeometry(r * 1.16, 10, 8), "gunmetal", { pos: pts[i] });          // knuckle joint
    beam(pts[i], pts[i + 1], r, r0 * (1 - (i + 1) * 0.13), mat, 10);                 // phalanx
  }
  add(new SphereGeometry(r0 * 0.6, 8, 6), "steelDark", { pos: pts[pts.length - 1] }); // fingertip pad
  return pts[pts.length - 1];
}

/**
 * A real open-end spanner: a flat bar handle that widens through rounded
 * shoulders into an oblong head, with a short, stubby U-jaw (parallel grip
 * faces, rounded throat) opening at the bottom and canted ~12° off the handle
 * axis — the signature open-end shape. Built from a Shape with curved corners,
 * extruded flat. Handle top at y≈0, jaw mouth at the bottom; centred in X.
 */
function wrenchGeometry() {
  const hw = 0.0145;                 // handle half-width
  const hd = 0.05;                   // head half-width (oblong, wider than handle)
  const sw = 0.02;                   // jaw slot half-width (the bolt gap)
  const neckY = -0.185;              // handle → head junction (cant pivot)
  const headMidY = -0.252;           // head outer mid-height
  const jawY = -0.31;                // jaw mouth (open bottom)
  const throatY = -0.262;            // closed top of the U slot
  const cant = 12 * DEG;             // open end canted off the handle axis
  const cs = Math.cos(cant), sn = Math.sin(cant);
  // Rotate a head-region point about the neck pivot so the open end cants.
  const R = (x, y) => { const dy = y - neckY; return [x * cs - dy * sn, neckY + x * sn + dy * cs]; };
  const A = R(hd, neckY), B = R(hd, headMidY), C = R(hd, jawY), D = R(hd - 0.016, jawY);
  const E = R(sw, jawY), F = R(sw, throatY), G = R(0, throatY + 0.014), H = R(-sw, throatY);
  const I = R(-sw, jawY), J = R(-hd + 0.016, jawY), K = R(-hd, jawY), L = R(-hd, headMidY), M = R(-hd, neckY);

  const s = new Shape();
  s.moveTo(hw, -0.012);
  s.lineTo(hw, neckY);                              // right handle side
  s.quadraticCurveTo(A[0], A[1], B[0], B[1]);       // rounded right shoulder → head
  s.quadraticCurveTo(C[0], C[1], D[0], D[1]);       // rounded right outer-bottom corner
  s.lineTo(E[0], E[1]);                             // right jaw bottom face
  s.lineTo(F[0], F[1]);                             // up the right grip face
  s.quadraticCurveTo(G[0], G[1], H[0], H[1]);       // rounded throat of the U
  s.lineTo(I[0], I[1]);                             // down the left grip face
  s.lineTo(J[0], J[1]);                             // left jaw bottom face
  s.quadraticCurveTo(K[0], K[1], L[0], L[1]);       // rounded left outer-bottom corner
  s.quadraticCurveTo(M[0], M[1], -hw, neckY);       // rounded left shoulder → handle
  s.lineTo(-hw, -0.012);                            // left handle side
  s.quadraticCurveTo(0, 0.002, hw, -0.012);         // rounded handle top
  s.closePath();

  const b = 0.005;
  const geo = new ExtrudeGeometry(s, { depth: 0.028 - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, steps: 1, curveSegments: 6 });
  geo.computeBoundingBox();
  geo.translate(0, 0, -(geo.boundingBox.min.z + geo.boundingBox.max.z) / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Small rounded armour panel with edge rivets (legs / body accents). */
function rivetedPanel(geo, mat, opts, frame) {
  add(geo, mat, opts);
  if (frame) rivetFrame(frame.cx, frame.cy, frame.z, frame.w, frame.h, frame.nx, frame.ny, frame.r ?? 0.009, frame.mat ?? "steelDark");
}

// ── Assemble the robot (Y up, faces +Z, feet near y=0, ~2.1 m tall) ───────────

function buildFeet() {
  for (const side of [-1, 1]) {
    const x = side * 0.165;
    CUR_GROUP = side === -1 ? "Right_Foot" : "Left_Foot"; // robot's right is −X
    const heelZ = -0.13, toeZ = 0.21, fw = 0.135;
    // foot chassis (long, toe forward) — dark so the red caps + tread read like the reference
    add(roundedBoxGeo(fw, 0.07, toeZ - heelZ, 0.025, 0.012), "steelDark", { pos: [x, 0.115, (heelZ + toeZ) / 2] });
    // red toe cap + red heel cap
    add(roundedBoxGeo(fw + 0.006, 0.06, 0.07, 0.02, 0.01), "red", { pos: [x, 0.10, toeZ - 0.02] });
    add(roundedBoxGeo(fw + 0.006, 0.07, 0.05, 0.02, 0.01), "redDark", { pos: [x, 0.115, heelZ + 0.02] });

    // ── tank-style tread loop wrapping the road wheels (stadium ring, extruded
    //    across the foot width). Built in local XY then turned to span X. ──
    const trackOuter = roundedRectShape(toeZ - heelZ + 0.02, 0.13, 0.06);
    const hole = roundedRectShape(toeZ - heelZ - 0.06, 0.06, 0.025);
    trackOuter.holes.push(hole);
    const track = new ExtrudeGeometry(trackOuter, { depth: fw - 0.02, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, steps: 1, curveSegments: 6 });
    track.translate(0, 0, -(fw - 0.02) / 2);
    track.computeVertexNormals();
    add(track, "rubber", { pos: [x, 0.075, (heelZ + toeZ) / 2], rot: [0, Math.PI / 2, 0] });
    // tread lugs around the track underside for grip
    for (let i = 0; i < 9; i++) {
      const tz = heelZ + 0.02 + i * ((toeZ - heelZ - 0.04) / 8);
      add(new BoxGeometry(fw - 0.02, 0.014, 0.022), "rubber", { pos: [x, 0.012, tz] });
    }

    // ── road wheels (axles along X), tyre + steel hub, protruding to the track ──
    for (const wz of [heelZ + 0.04, heelZ + 0.12, toeZ - 0.12, toeZ - 0.04]) {
      add(new CylinderGeometry(0.044, 0.044, fw - 0.03, 18), "rubber", { pos: [x, 0.058, wz], rot: [0, 0, Math.PI / 2] });
      add(new CylinderGeometry(0.026, 0.026, fw - 0.012, 14), "steelDark", { pos: [x, 0.058, wz], rot: [0, 0, Math.PI / 2] });
      for (const s of [-1, 1]) add(new CylinderGeometry(0.012, 0.012, 0.012, 8), "steel", { pos: [x + s * (fw / 2 - 0.005), 0.058, wz], rot: [0, 0, Math.PI / 2] });
    }
    // ankle pivot block on top of the chassis
    add(roundedBoxGeo(0.09, 0.05, 0.12, 0.02, 0.01), "steelDark", { pos: [x, 0.17, 0.0] });
    add(new CylinderGeometry(0.04, 0.04, 0.1, 20), "gunmetal", { pos: [x, 0.19, 0.0], rot: [0, 0, Math.PI / 2] });
    hexBolt(x + 0.052, 0.19, 0.0, 0.018, 0.014, [0, 0, Math.PI / 2], "steel");
    hexBolt(x - 0.052, 0.19, 0.0, 0.018, 0.014, [0, 0, Math.PI / 2], "steel");
  }
}

function buildLegs() {
  for (const side of [-1, 1]) {
    const x = side * 0.165;
    CUR_GROUP = side === -1 ? "Right_Leg" : "Left_Leg";
    // ── shin: gunmetal core + red front armour with edge rivets ──
    beam([x, 0.205, 0.0], [x, 0.55, 0.025], 0.05, 0.046, "gunmetal");
    add(extrudeProfile([[-0.07, -0.15], [0.07, -0.15], [0.075, 0.12], [0.045, 0.16], [-0.045, 0.16], [-0.075, 0.12]], 0.1, { bevel: 0.012 }),
      "red", { pos: [x, 0.4, 0.075] });
    rivetRun([x - 0.062, 0.28, 0.122], [x - 0.062, 0.52, 0.122], 5, 0.009, "steelDark");
    rivetRun([x + 0.062, 0.28, 0.122], [x + 0.062, 0.52, 0.122], 5, 0.009, "steelDark");
    rivetRun([x - 0.04, 0.27, 0.124], [x + 0.04, 0.27, 0.124], 3, 0.008, "steelDark");
    // achilles piston: lower-rear shin → heel
    CUR_GROUP = side === -1 ? "Right_Leg" : "Left_Leg";
    piston([x, 0.46, -0.07], [x, 0.18, -0.11], 0.02, 0.011);

    // ── knee: round hinge disc with centre bolt + screw slot ──
    add(new CylinderGeometry(0.075, 0.075, 0.13, 30), "steelDark", { pos: [x, 0.565, 0.02], rot: [0, 0, Math.PI / 2] });
    for (const s of [-1, 1]) add(new CylinderGeometry(0.078, 0.078, 0.012, 30), "red", { pos: [x + s * 0.066, 0.565, 0.02], rot: [0, 0, Math.PI / 2] });
    hexBolt(x + 0.072, 0.565, 0.02, 0.026, 0.016, [0, 0, Math.PI / 2], "steel");
    hexBolt(x - 0.072, 0.565, 0.02, 0.026, 0.016, [0, 0, Math.PI / 2], "steel");
    add(new BoxGeometry(0.012, 0.06, 0.012), "steelDark", { pos: [x + 0.08, 0.565, 0.02] }); // screw slot

    // ── thigh: gunmetal core + red armour with rivets ──
    beam([x, 0.6, 0.02], [x, 0.86, 0.0], 0.052, 0.058, "gunmetal");
    add(extrudeProfile([[-0.075, -0.15], [0.075, -0.15], [0.08, 0.12], [0.05, 0.16], [-0.05, 0.16], [-0.08, 0.12]], 0.11, { bevel: 0.012 }),
      "red", { pos: [x, 0.73, 0.06] });
    rivetRun([x - 0.066, 0.6, 0.116], [x - 0.066, 0.86, 0.116], 5, 0.009, "steelDark");
    rivetRun([x + 0.066, 0.6, 0.116], [x + 0.066, 0.86, 0.116], 5, 0.009, "steelDark");
    // hip ball joint
    add(new SphereGeometry(0.072, 24, 18), "gunmetal", { pos: [x, 0.9, 0.0] });
    add(new TorusGeometry(0.06, 0.016, 10, 24), "steelDark", { pos: [x, 0.9, 0.0], rot: [0, Math.PI / 2, 0] });
  }
}

function buildPelvis() {
  CUR_GROUP = "Pelvis";
  add(roundedBoxGeo(0.36, 0.18, 0.27, 0.035, 0.014), "steelDark", { pos: [0, 0.95, 0.0] });
  // red front waist plate + central groin plate
  add(roundedBoxGeo(0.30, 0.13, 0.05, 0.03, 0.012), "red", { pos: [0, 0.97, 0.115] });
  add(roundedBoxGeo(0.12, 0.12, 0.06, 0.03, 0.012), "redDark", { pos: [0, 0.9, 0.12] });
  rivetFrame(0, 0.97, 0.142, 0.27, 0.1, 5, 3, 0.009, "steelDark");
  // hip housings flanking the pelvis
  for (const side of [-1, 1]) {
    add(new CylinderGeometry(0.085, 0.085, 0.1, 24), "steel", { pos: [side * 0.165, 0.93, 0.0], rot: [0, 0, Math.PI / 2] });
    add(new TorusGeometry(0.085, 0.014, 10, 26), "steelDark", { pos: [side * 0.165, 0.93, 0.0], rot: [0, Math.PI / 2, 0] });
  }
  rivetRingY(1.02, 0.16, 12, 0.009, "steelDark");
}

function buildTorso() {
  CUR_GROUP = "Torso";
  const cy = CHEST.cy;
  // chamfered chest tub (wider at the shoulders, narrowing to the waist)
  const chest = extrudeProfile([
    [-0.25, 0.23], [0.25, 0.23], [0.25, -0.02], [0.17, -0.23], [-0.17, -0.23], [-0.25, -0.02]
  ], 0.3, { bevel: 0.016 });
  add(chest, "red", { pos: [0, cy, 0] });
  // upper-chest collar deck where the neck emerges (trapezoid block)
  add(extrudeProfile([[-0.13, 0.0], [0.13, 0.0], [0.1, 0.07], [-0.1, 0.07]], 0.2, { bevel: 0.01 }), "redDark", { pos: [0, CHEST.topY - 0.01, 0.02] });
  // chest top + bottom rim ridges
  add(roundedBoxGeo(0.5, 0.03, 0.31, 0.012, 0.008), "redDark", { pos: [0, CHEST.topY - 0.02, 0.0] });

  // ── grey MODEL-LP plate (proud, stencilled) on the chest front ──
  CUR_GROUP = "ChestPlate";
  add(roundedBoxGeo(0.26, 0.3, 0.05, 0.025, 0.012), "steelLight", { pos: [0, cy + 0.04, CHEST.frontZ + 0.01] });
  add(roundedBoxGeo(0.225, 0.265, 0.03, 0.02, 0.008), "steel", { pos: [0, cy + 0.04, CHEST.frontZ + 0.03] }); // recessed inner field
  rectDecals.push({ group: "ChestPlate", w: 0.2, h: 0.235, pos: [0, cy + 0.04, CHEST.frontZ + 0.047], svg: modelLpPlateSVG() });
  for (const sx of [-0.105, 0.105]) for (const sy of [-0.12, 0.12]) hexBolt(sx, cy + 0.04 + sy, CHEST.frontZ + 0.03, 0.014, 0.012, [Math.PI / 2, 0, 0], "steelDark");

  // ── lower-chest horizontal vent grille (angled slats) ──
  CUR_GROUP = "Torso";
  add(roundedBoxGeo(0.24, 0.075, 0.04, 0.015, 0.008), "darkRecess", { pos: [0, cy - 0.16, CHEST.frontZ + 0.005], rot: [-0.18, 0, 0] });
  ventSlots(0, cy - 0.16, CHEST.frontZ + 0.022, 5, 0.21, 0.011, 0.014, 0.016, "steelDark", [-0.18, 0, 0]);

  // side body rivets framing the chest flanks
  for (const side of [-1, 1]) {
    rivetRun([side * 0.245, cy - 0.18, 0.08], [side * 0.245, cy + 0.2, 0.08], 6, 0.01, "steelDark");
  }
}

function buildShoulders() {
  for (const side of [-1, 1]) {
    CUR_GROUP = side < 0 ? "Right_Arm" : "Left_Arm";
    const x = side * 0.34;
    // chunky red pauldron cap over the shoulder, bevelled outward
    add(roundedBoxGeo(0.21, 0.17, 0.27, 0.05, 0.02), "red", { pos: [x, 1.45, 0.0], rot: [0, 0, side * -0.12] });
    // under-bevel + a panel groove line + rivets
    add(roundedBoxGeo(0.17, 0.05, 0.23, 0.03, 0.012), "redDark", { pos: [x, 1.37, 0.0], rot: [0, 0, side * -0.12] });
    add(new BoxGeometry(0.005, 0.12, 0.2), "redDeep", { pos: [x + side * 0.085, 1.45, 0.0] }); // outer seam
    rivetRun([x - 0.06, 1.52, 0.12], [x + 0.06, 1.52, 0.12], 3, 0.009, "steelDark");
    addRivet(x, 1.45, 0.135, 0.012, "steelDark");
    // shoulder joint ball under the pauldron
    add(new SphereGeometry(0.075, 22, 16), "gunmetal", { pos: [x, 1.38, 0.0] });
  }
}

function buildArms() {
  // robot's right arm (−X, image LEFT) grips the wrench; left arm (+X) is open.
  for (const side of [-1, 1]) {
    CUR_GROUP = side < 0 ? "Right_Arm" : "Left_Arm";
    const sh = [side * 0.34, 1.38, 0.0];
    const el = [side * 0.40, 1.07, 0.02];
    const wr = [side * 0.42, 0.78, 0.04];
    // upper arm (steel cylinder) + red shoulder band
    beam(sh, el, 0.06, 0.05, "steel");
    ringAt([sh[0] + (el[0] - sh[0]) * 0.12, sh[1] + (el[1] - sh[1]) * 0.12, sh[2] + (el[2] - sh[2]) * 0.12], [el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]], 0.062, 0.016, "red");
    // ── elbow hinge: red housing + cross pin + bolt caps ──
    add(roundedBoxGeo(0.12, 0.11, 0.12, 0.03, 0.014), "red", { pos: el });
    add(new CylinderGeometry(0.052, 0.052, 0.13, 22), "gunmetal", { pos: el, rot: [0, 0, Math.PI / 2] });
    for (const s of [-1, 1]) {
      add(new CylinderGeometry(0.055, 0.055, 0.012, 22), "steelDark", { pos: [el[0] + s * 0.066, el[1], el[2]], rot: [0, 0, Math.PI / 2] });
      hexBolt(el[0] + s * 0.075, el[1], el[2], 0.02, 0.014, [0, 0, Math.PI / 2], "steel");
    }
    // forearm (steel cylinder) + red band near the elbow
    beam(el, wr, 0.052, 0.044, "steel");
    ringAt([el[0] + (wr[0] - el[0]) * 0.15, el[1] + (wr[1] - el[1]) * 0.15, el[2] + (wr[2] - el[2]) * 0.15], [wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]], 0.054, 0.018, "red");
    // wrist collar
    add(new CylinderGeometry(0.044, 0.05, 0.05, 20), "gunmetal", { pos: wr });
    add(new TorusGeometry(0.05, 0.012, 10, 22), "steelDark", { pos: [wr[0], wr[1] + 0.022, wr[2]], rot: [Math.PI / 2, 0, 0] });
  }
}

// Wrench handle line (robot's LEFT hand grips it); used to seat the wrench too.
const WRENCH_HAND_X = 0.42;
const WRENCH_HANDLE_Z = 0.105;

function buildHands() {
  // Palm chassis: a block with a knuckle row at the front edge, a back-of-hand
  // plate, and a wrist hub. `front` is +1 if the back of the hand faces +Z.
  function palmBlock(g, cx, cy, cz) {
    CUR_GROUP = g;
    add(roundedBoxGeo(0.082, 0.07, 0.072, 0.02, 0.01), "steel", { pos: [cx, cy, cz] });
    add(roundedBoxGeo(0.076, 0.055, 0.024, 0.012, 0.008), "steelDark", { pos: [cx, cy + 0.004, cz - 0.038] }); // back-of-hand plate
    add(new CylinderGeometry(0.046, 0.05, 0.045, 18), "gunmetal", { pos: [cx, cy + 0.058, cz] });               // wrist hub
    add(new BoxGeometry(0.082, 0.018, 0.07), "steelDark", { pos: [cx, cy + 0.036, cz + 0.006] });               // knuckle ridge
  }

  // ── robot's LEFT hand (+X): closed fist clutching the wrench handle ──
  // Fingers reach forward (+Z) over the handle then curl down and under it; the
  // opposed thumb presses in from the inner (−X) side. forward→bend flexion only.
  {
    const g = "Left_Hand";
    const cx = WRENCH_HAND_X;
    palmBlock(g, cx, 0.705, 0.05);
    for (let i = 0; i < 3; i++) {
      const fx = cx + (i - 1) * 0.027;
      finger([fx, 0.742, 0.084], [0, 0, 1], [0, -1, 0], [0.05, 0.043, 0.037], [0.55, 0.95, 1.05], 0.017, "steel", g);
    }
    finger([cx - 0.05, 0.722, 0.072], [0.62, 0.1, 0.78], [0, -1, 0.1], [0.046, 0.04], [0.55, 0.85], 0.018, "steel", g);
  }
  // ── robot's RIGHT hand (−X): open, relaxed gripper ──
  // Fingers hang down with a gentle natural curl toward the palm; relaxed thumb.
  {
    const g = "Right_Hand";
    const cx = -0.42;
    palmBlock(g, cx, 0.705, 0.05);
    for (let i = 0; i < 3; i++) {
      const fx = cx + (i - 1) * 0.027;
      finger([fx, 0.738, 0.07], [0, -0.92, 0.38], [0, -0.38, -0.92], [0.052, 0.045, 0.04], [0.25, 0.4, 0.45], 0.017, "steel", g);
    }
    finger([cx + 0.05, 0.722, 0.066], [-0.5, -0.78, 0.38], [0, -0.42, -0.9], [0.046, 0.04], [0.35, 0.45], 0.018, "steel", g);
  }
}

function buildWrench() {
  CUR_GROUP = "Wrench";
  // clutched in the robot's LEFT fist (matches the reference): the handle passes
  // vertically through the grip so the curled fingers wrap it, and the open-end
  // jaw hangs below the hand.
  add(wrenchGeometry(), "wrench", { pos: [WRENCH_HAND_X, 0.80, WRENCH_HANDLE_Z], rot: [0.12, 0.0, -0.02] });
}

function buildNeck() {
  CUR_GROUP = "Neck";
  // short steel neck column + collar where it meets the head
  add(new CylinderGeometry(0.07, 0.085, 0.1, 24), "gunmetal", { pos: [0, 1.545, 0.0] });
  add(new TorusGeometry(0.085, 0.016, 10, 26), "steelDark", { pos: [0, 1.5, 0.0], rot: [Math.PI / 2, 0, 0] });
  add(new TorusGeometry(0.072, 0.014, 10, 24), "steelDark", { pos: [0, 1.59, 0.0], rot: [Math.PI / 2, 0, 0] });
  // corrugated hoses flanking the neck (tube + rib rings) running chest → head
  for (const side of [-1, 1]) {
    const hose = [[side * 0.05, 1.5, 0.08], [side * 0.07, 1.55, 0.07], [side * 0.05, 1.6, 0.05]];
    add(tubeThrough(hose, 0.013, { tubular: 20, radial: 8 }), "gunmetal");
    for (let i = 0; i < 4; i++) {
      const t = 0.15 + i * 0.22;
      const p = [side * (0.05 + Math.sin(t * Math.PI) * 0.02), 1.5 + t * 0.1, 0.08 - t * 0.03];
      ringAt(p, [side * 0.2, 1, -0.3], 0.016, 0.005, "steelDark", 14);
    }
  }
  // a couple of thin cables up the front centre
  add(tubeThrough([[0.02, 1.49, 0.085], [0.0, 1.55, 0.075], [0.02, 1.6, 0.06]], 0.007, { tubular: 18 }), "darkRecess");
  add(tubeThrough([[-0.02, 1.49, 0.085], [0.0, 1.54, 0.078], [-0.02, 1.6, 0.06]], 0.007, { tubular: 18 }), "darkRecess");
}

function buildHead() {
  const hy = 1.72;
  CUR_GROUP = "Head";
  // boxy head shell (steel), slightly wider than tall, chamfered
  add(roundedBoxGeo(0.36, 0.27, 0.3, 0.035, 0.018), "steel", { pos: [0, hy, 0] });
  // red top cap panel + red rear panel (back-view colouring)
  add(roundedBoxGeo(0.33, 0.04, 0.27, 0.02, 0.01), "red", { pos: [0, hy + 0.14, -0.01] });
  add(roundedBoxGeo(0.3, 0.18, 0.04, 0.02, 0.01), "red", { pos: [0, hy + 0.01, -0.155] });
  // raised detail box on the rear-top of the head with two bolts (back view)
  add(roundedBoxGeo(0.13, 0.05, 0.08, 0.015, 0.008), "steelDark", { pos: [0.07, hy + 0.15, -0.1] });
  for (const sx of [0.04, 0.1]) addRivet(sx, hy + 0.178, -0.1, 0.012, "steelLight");
  // panel-line rivets along the head sides + back
  rivetRun([0.18, hy - 0.1, 0.08], [0.18, hy + 0.1, 0.08], 4, 0.009, "steelDark");
  rivetRun([-0.18, hy - 0.1, 0.08], [-0.18, hy + 0.1, 0.08], 4, 0.009, "steelDark");
  rivetFrame(0, hy, -0.153, 0.28, 0.16, 5, 3, 0.008, "steelDark");
  // side vent slots behind the sensor disc (both sides)
  for (const side of [-1, 1]) ventSlots(side * 0.182, hy - 0.04, -0.04, 3, 0.012, 0.06, 0.012, 0.03, "darkRecess", [0, Math.PI / 2, 0]);

  // ── glowing screen face with movable cyan eyes ──
  buildFaceScreen(hy + 0.02, 0.15);

  // ── side sensor discs ("ears") ──
  CUR_GROUP = "Head";
  sensorDisc(-1, hy);
  sensorDisc(1, hy);
}

function buildAntenna() {
  CUR_GROUP = "Antenna";
  const bx = -0.1, by = 1.855, bz = 0.0; // base on the head top, robot's right
  // circular base disc + red ring + post
  add(new CylinderGeometry(0.05, 0.055, 0.028, 26), "steelDark", { pos: [bx, by, bz] });
  add(new TorusGeometry(0.04, 0.01, 10, 24), "red", { pos: [bx, by + 0.016, bz], rot: [Math.PI / 2, 0, 0] });
  add(new CylinderGeometry(0.022, 0.026, 0.05, 16), "gunmetal", { pos: [bx, by + 0.04, bz] });
  // thin rod with a slight lean, a bead 2/3 up, and a tip
  const lean = 0.06;
  const rodLen = 0.22, rodBase = [bx, by + 0.065, bz];
  const rodTop = [rodBase[0] - Math.sin(lean) * rodLen, rodBase[1] + Math.cos(lean) * rodLen, bz];
  beam(rodBase, rodTop, 0.007, 0.0045, "gunmetal", 12);
  const bead = [rodBase[0] + (rodTop[0] - rodBase[0]) * 0.62, rodBase[1] + (rodTop[1] - rodBase[1]) * 0.62, bz];
  add(new SphereGeometry(0.015, 14, 12), "red", { pos: bead });
  add(new SphereGeometry(0.011, 12, 10), "steelLight", { pos: rodTop });
}

function buildJetpack() {
  CUR_GROUP = "Jetpack";
  const backZ = CHEST.backZ;
  // central back housing plate
  add(roundedBoxGeo(0.36, 0.36, 0.08, 0.03, 0.014), "steelDark", { pos: [0, CHEST.cy + 0.02, backZ - 0.05] });
  // two large red back armour panels + central spine seam (back reads mostly red)
  for (const side of [-1, 1]) add(roundedBoxGeo(0.16, 0.34, 0.06, 0.03, 0.014), "red", { pos: [side * 0.09, CHEST.cy + 0.02, backZ - 0.09] });
  add(new BoxGeometry(0.022, 0.36, 0.06), "redDark", { pos: [0, CHEST.cy + 0.02, backZ - 0.09] });
  for (const side of [-1, 1]) rivetRun([side * 0.155, CHEST.cy - 0.13, backZ - 0.11], [side * 0.155, CHEST.cy + 0.16, backZ - 0.11], 5, 0.009, "steelDark");
  // small red emblem swoosh near the top-centre of the back
  add(new TorusGeometry(0.035, 0.008, 8, 18, Math.PI * 1.1), "redDeep", { pos: [0, CHEST.cy + 0.13, backZ - 0.12], rot: [0, 0, -0.6] });

  // ── twin upper-back canister tanks (grey steel, domed caps + bands) nestled
  //    between the red panels (more subtle than the panels, per the reference) ──
  for (const side of [-1, 1]) {
    const tx = side * 0.075, tz = backZ - 0.13, tcy = CHEST.cy + 0.05, th = 0.22;
    add(new CylinderGeometry(0.05, 0.05, th, 22), "steel", { pos: [tx, tcy, tz] });
    add(new SphereGeometry(0.05, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), "steel", { pos: [tx, tcy + th / 2, tz], scale: [1, 0.7, 1] });
    add(new SphereGeometry(0.05, 22, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), "steel", { pos: [tx, tcy - th / 2, tz], scale: [1, 0.7, 1] });
    add(new TorusGeometry(0.05, 0.009, 10, 22), "steelDark", { pos: [tx, tcy + 0.06, tz], rot: [Math.PI / 2, 0, 0] });
    add(new TorusGeometry(0.05, 0.009, 10, 22), "steelDark", { pos: [tx, tcy - 0.06, tz], rot: [Math.PI / 2, 0, 0] });
    // feed pipe from the tank down toward the exhaust nozzle
    add(tubeThrough([[tx, tcy - th / 2, tz], [tx, CHEST.cy - 0.18, tz + 0.03], [side * 0.11, 0.98, -0.08]], 0.015, { tubular: 28 }), "steelDark");
  }
}

function buildExhaust() {
  CUR_GROUP = "Exhaust";
  // twin downward nozzles at the lower back, angled back, firing flames.
  for (const side of [-1, 1]) {
    const nx = side * 0.11, ny = 0.95, nz = -0.12;
    // nozzle: flared bell (lathe profile) pointing down/back
    const prof = [
      [0.03, 0.0], [0.038, 0.02], [0.04, 0.05], [0.055, 0.1], [0.075, 0.14]
    ].map(([r, h]) => new Vector2(r, h));
    const bell = new LatheGeometry(prof, 24);
    bell.computeVertexNormals();
    add(bell, "gunmetal", { pos: [nx, ny, nz], rot: [Math.PI - 0.35, 0, 0], scale: 1 }); // open end faces down/back
    add(new TorusGeometry(0.04, 0.012, 10, 24), "steelDark", { pos: [nx, ny + 0.02, nz - 0.01] });
    add(new CylinderGeometry(0.035, 0.035, 0.05, 20), "gunmetal", { pos: [nx, ny + 0.05, nz + 0.02] });

    // exhaust plume: opaque emissive frustums stacked along the jet so each
    // colour band is visible from outside — white-hot mouth → blue → orange tip.
    const dir = [0, -0.94, -0.34]; // down + back
    const base = [nx, ny - 0.05, nz - 0.02];
    const at = (len) => [base[0] + dir[0] * len, base[1] + dir[1] * len, base[2] + dir[2] * len];
    beam(base, at(0.06), 0.05, 0.052, "flameCore", 16);  // white-hot mouth
    beam(at(0.06), at(0.2), 0.052, 0.04, "flameBlue", 18); // blue mid band
    beam(at(0.2), at(0.46), 0.04, 0.004, "flameOrange", 18); // orange taper to the tip
  }
}

function buildBase() {
  CUR_GROUP = "Base";
  add(new CylinderGeometry(0.4, 0.4, 0.004, 40), "rubber", { pos: [0, 0.002, 0.04] });
}

// ── printed-PNG decal faces (sRGB SVG → PNG via sharp) ───────────────────────
function modelLpPlateSVG() {
  const W = 512, H = 600;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#a9afb3"/>
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#6c7176" stroke-width="6"/>
    <rect x="40" y="${H / 2 - 70}" width="${W - 80}" height="140" fill="#9aa0a4"/>
    <text x="${W / 2}" y="${H / 2 + 26}" font-family="'Arial Narrow', Arial, sans-serif" font-weight="bold" font-size="84" letter-spacing="4" fill="#33373b" text-anchor="middle">MODEL-LP</text>
    <line x1="40" y1="${H / 2 + 96}" x2="${W - 40}" y2="${H / 2 + 96}" stroke="#7c8186" stroke-width="4"/>
    <line x1="40" y1="${H / 2 - 96}" x2="${W - 40}" y2="${H / 2 - 96}" stroke="#7c8186" stroke-width="4"/>
  </svg>`;
}

function screenSVG() {
  const W = 512, H = 224;
  let grid = "";
  for (let i = 1; i < 8; i++) grid += `<line x1="${i * W / 8}" y1="0" x2="${i * W / 8}" y2="${H}" stroke="#0c3a44" stroke-width="2"/>`;
  for (let i = 1; i < 4; i++) grid += `<line x1="0" y1="${i * H / 4}" x2="${W}" y2="${i * H / 4}" stroke="#0c3a44" stroke-width="2"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#0a1418"/>${grid}
  </svg>`;
}

buildFeet();
buildLegs();
buildPelvis();
buildTorso();
buildJetpack();
buildExhaust();
buildShoulders();
buildArms();
buildHands();
buildWrench();
buildNeck();
buildHead();
buildAntenna();
buildBase();

// Seat the model on the floor: shift every vertex so the lowest sits at y = 0.
let minY = Infinity;
let maxY = -Infinity;
for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) if (p.positions[i] < minY) minY = p.positions[i];
for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) {
  p.positions[i] -= minY;
  if (p.positions[i] > maxY) maxY = p.positions[i];
}

// ── Build the named hierarchy: Robot_Root → body-part group nodes ────────────
const doc = new Document();
Object.assign(doc.getRoot().getAsset(), { generator: "3DSpace model-lp builder v1" });
const scene = doc.createScene("MODEL-LP");
const rootNode = doc.createNode("Robot_Root");
scene.addChild(rootNode);
const buffer = doc.createBuffer();
let totalTriangles = 0;

const matCache = new Map();
function pbrMaterial(key) {
  if (matCache.has(key)) return matCache.get(key);
  const def = MATERIALS[key];
  const [r, g, b] = hexToLinear(def.hex);
  const a = def.alpha ?? 1;
  const m = doc.createMaterial(key)
    .setBaseColorFactor([r, g, b, a])
    .setRoughnessFactor(def.roughness)
    .setMetallicFactor(def.metalness);
  if (a < 1) { m.setAlphaMode("BLEND"); m.setDoubleSided(true); }
  if (def.emissive) m.setEmissiveFactor(def.emissive);
  matCache.set(key, m);
  return m;
}

function mergedPrimitive(list, materialKey) {
  let vc = 0, ic = 0;
  for (const p of list) { vc += p.positions.length / 3; ic += p.indices.length; }
  const positions = new Float32Array(vc * 3), normals = new Float32Array(vc * 3), indices = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const p of list) {
    positions.set(p.positions, vo * 3); normals.set(p.normals, vo * 3);
    for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i] + vo;
    vo += p.positions.length / 3; io += p.indices.length;
  }
  totalTriangles += ic / 3;
  return doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer))
    .setMaterial(pbrMaterial(materialKey));
}

const byGroup = new Map();
for (const part of parts) {
  if (!byGroup.has(part.group)) byGroup.set(part.group, new Map());
  const gm = byGroup.get(part.group);
  if (!gm.has(part.material)) gm.set(part.material, []);
  gm.get(part.material).push(part);
}

const GROUP_ORDER = ["Head", "Eyes", "Face", "Antenna", "Neck", "Torso", "ChestPlate", "Pelvis",
  "Jetpack", "Exhaust", "Left_Arm", "Right_Arm", "Left_Hand", "Right_Hand", "Wrench",
  "Left_Leg", "Right_Leg", "Left_Foot", "Right_Foot", "Base", "Misc"];
const rank = (g) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 999 : i; };

const groupNodes = new Map();
for (const groupName of [...byGroup.keys()].sort((a, b) => rank(a) - rank(b))) {
  const mesh = doc.createMesh(groupName);
  for (const [materialKey, list] of byGroup.get(groupName)) mesh.addPrimitive(mergedPrimitive(list, materialKey));
  const node = doc.createNode(groupName).setMesh(mesh);
  groupNodes.set(groupName, node);
  rootNode.addChild(node);
}
const parentFor = (name) => groupNodes.get(name) ?? rootNode;

// ── Movable iris nodes (cyan eyes the runtime darts around), under Eyes ──
for (const spec of irisSpecs) {
  const mesh = doc.createMesh(spec.name);
  const byMat = new Map();
  for (const p of spec.parts) {
    if (!byMat.has(p.material)) byMat.set(p.material, []);
    byMat.get(p.material).push(p);
  }
  for (const [matKey, list] of byMat) mesh.addPrimitive(mergedPrimitive(list, matKey));
  parentFor("Eyes").addChild(doc.createNode(spec.name).setMesh(mesh).setTranslation([spec.center[0], spec.center[1] - minY, spec.center[2]]));
}

// ── Rectangular embedded-PNG decals (flat planes facing +Z, V flipped upright) ──
for (let d = 0; d < rectDecals.length; d++) {
  const spec = rectDecals[d];
  const png = await sharp(Buffer.from(spec.svg)).png().toBuffer();
  const tex = doc.createTexture(`decal_${d}`).setImage(new Uint8Array(png)).setMimeType("image/png");
  const mat = doc.createMaterial(`decal_${d}`).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.45).setMetallicFactor(0.1).setBaseColorTexture(tex);
  const plane = new PlaneGeometry(spec.w, spec.h, 1, 1);
  const src = plane.attributes.position.array, nrm = plane.attributes.normal.array;
  const fpos = new Float32Array(src.length), fnor = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    fpos[i] = src[i] + spec.pos[0]; fpos[i + 1] = src[i + 1] + (spec.pos[1] - minY); fpos[i + 2] = src[i + 2] + spec.pos[2];
    fnor[i] = nrm[i]; fnor[i + 1] = nrm[i + 1]; fnor[i + 2] = nrm[i + 2];
  }
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(fpos).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(fnor).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(Float32Array.from(plane.attributes.uv.array, (v, i) => (i % 2 === 0 ? v : 1 - v))).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(Uint32Array.from(plane.index.array)).setBuffer(buffer))
    .setMaterial(mat);
  parentFor(spec.group).addChild(doc.createNode(`Decal_${d}`).setMesh(doc.createMesh(`Decal_${d}`).addPrimitive(prim)));
  totalTriangles += plane.index.count / 3;
  plane.dispose();
}

await mkdir(dirname(OUT_PATH), { recursive: true });
const glb = await new NodeIO().writeBinary(doc);
await writeFile(OUT_PATH, Buffer.from(glb));

console.log(`Wrote ${OUT_PATH}`);
console.log(`Parts: ${parts.length}  ·  Groups: ${groupNodes.size}  ·  Materials: ${matCache.size}`);
console.log(`Hierarchy: Robot_Root → ${[...groupNodes.keys()].join(", ")}`);
console.log(`Triangles: ${totalTriangles.toLocaleString()}`);
console.log(`Height (feet→top): ${maxY.toFixed(3)} m`);
console.log(`File size: ${(glb.byteLength / 1024).toFixed(1)} KB`);
