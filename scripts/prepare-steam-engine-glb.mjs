// Generate a realistic cutaway horizontal stationary steam engine GLB.
//
// Everything is procedural:
//   - Geometry is built with three.js primitives plus custom partial-tube
//     builders for the cutaway shells (boiler + steam cylinder + fire tube).
//   - A single 1024x1024 JPEG texture atlas (riveted boiler plate, red
//     lagging, brass, cast iron, steel, copper, brick, section-red hatching,
//     gauge dial, fire) is baked from SVG with sharp.
//   - One 4-second seamlessly looping animation ("Run") drives every moving
//     part from real slider-crank kinematics sampled at 30 fps:
//       crankshaft + flywheel + eccentric, connecting rod, piston/crosshead,
//       slide valve + eccentric rod, governor, boiler water slosh + bubbles,
//       in-cylinder steam volumes, chimney smoke, gland steam wisps, gauge
//       needle flutter.
//   - Cut faces are painted section-red with diagonal hatching, and the
//     water/steam stay inside the shells (nothing pours out of the cutaway).
//
// Run:  node scripts/prepare-steam-engine-glb.mjs [out.glb]
// Default out: GLBs/steam-engine.glb

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const OUT_PATH = resolve(process.argv[2] ?? resolve(__dirname, "../GLBs/steam-engine.glb"));

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Timing: one revolution every 2 s (30 rpm); the clip is 4 s = 2 revolutions
// so slower effects (slosh, smoke) can complete one cycle and still loop.
// ---------------------------------------------------------------------------
const REV_T = 2.0;
const CLIP_T = 4.0;
const FPS = 30;
const NKEYS = CLIP_T * FPS + 1; // 121 keys, last duplicates first for loop closure

// Slider-crank dimensions (metres).
const CRANK_X = 1.85; // crankshaft centre
const AXIS_Y = 0.5; // cylinder / crankshaft axis height
const CRANK_R = 0.16; // crank radius -> 0.32 m stroke
const ROD_L = 0.75; // connecting rod length
const XHEAD_TO_PISTON = 1.01; // crosshead pin to piston centre (rigid)

const theta = (t) => (2 * Math.PI * t) / REV_T;
// crank pin world position = (CRANK_X - r cos th, AXIS_Y + r sin th)
const crankAngle = (th) => Math.PI - th; // node rotation about +z putting local +x pin at the right spot
const slider = (th) => CRANK_R * Math.cos(th) + Math.sqrt(ROD_L * ROD_L - CRANK_R * CRANK_R * Math.sin(th) ** 2);
const xheadX = (th) => CRANK_X - slider(th);
const pistonX = (th) => xheadX(th) - XHEAD_TO_PISTON;
const rodTilt = (th) => Math.atan2(CRANK_R * Math.sin(th), Math.sqrt(ROD_L * ROD_L - CRANK_R * CRANK_R * Math.sin(th) ** 2));

// Valve gear: eccentric (throw 0.05) on the crankshaft leads the crank,
// eccentric rod of fixed length to the valve spindle knuckle. The whole
// valve train lives in the z = ECC_Z plane (sheave, strap, rod, spindle).
const ECC_E = 0.05;
const ECC_PHASE = -115 * DEG; // relative to crank pin, in node-local angle
const ECC_ROD_L = 1.192;
const VALVE_PIN_Y = 0.775;
const ECC_Z = 0.14;
const eccCenter = (th) => {
  const a = crankAngle(th) + ECC_PHASE;
  return [CRANK_X + ECC_E * Math.cos(a), AXIS_Y + ECC_E * Math.sin(a)];
};
const valvePinX = (th) => {
  const [ex, ey] = eccCenter(th);
  const dy = VALVE_PIN_Y - ey;
  return ex - Math.sqrt(ECC_ROD_L * ECC_ROD_L - dy * dy);
};

const THETA_BIND = 65 * DEG; // static (bind) pose: mid-stroke, looks alive in stills

// ---------------------------------------------------------------------------
// Texture atlas: 4x4 grid of 256 px cells, baked from SVG via sharp.
// glTF UV origin is top-left, so cell row 0 is the TOP of the image.
// ---------------------------------------------------------------------------
const CELL = {
  boiler: { c: 0, r: 0 },
  lagging: { c: 1, r: 0 },
  brass: { c: 2, r: 0 },
  iron: { c: 3, r: 0 },
  steel: { c: 0, r: 1 },
  copper: { c: 1, r: 1 },
  brick: { c: 2, r: 1 },
  cut: { c: 3, r: 1 },
  dial: { c: 0, r: 2 },
  fire: { c: 1, r: 2 }
};

function atlasSvg() {
  const S = 256;
  const at = (cell) => [cell.c * S, cell.r * S];
  let defs = "<defs>";
  let g = "";
  // every cell is drawn inside a clip so patterns never bleed into neighbours
  const openCell = (cell) => {
    const [x, y] = at(cell);
    const id = `clip${cell.c}_${cell.r}`;
    defs += `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${S}" height="${S}"/></clipPath>`;
    g += `<g clip-path="url(#${id})">`;
  };
  const closeCell = () => {
    g += "</g>";
  };

  // -- boiler plate: dark green, horizontal plate seams + rivet rows (wraps in u)
  {
    openCell(CELL.boiler);
    const [x, y] = at(CELL.boiler);
    g += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#3a573f"/>`;
    for (let row = 0; row < 2; row++) {
      const sy = y + 64 + row * 128;
      g += `<rect x="${x}" y="${sy - 3}" width="${S}" height="6" fill="#2c4632"/>`;
      g += `<rect x="${x}" y="${sy - 4}" width="${S}" height="1.5" fill="#5d8266" opacity="0.7"/>`;
      for (let i = 0; i < 12; i++) {
        const rx = x + (i + 0.5) * (S / 12);
        for (const dy of [-11, 11]) {
          g += `<circle cx="${rx}" cy="${sy + dy}" r="4.4" fill="#27402d"/>`;
          g += `<circle cx="${rx - 1.1}" cy="${sy + dy - 1.1}" r="3.1" fill="#56795f"/>`;
        }
      }
    }
    // subtle vertical wear streaks
    for (let i = 0; i < 7; i++) {
      const sx = x + ((i * 37 + 12) % S);
      g += `<rect x="${sx}" y="${y}" width="${4 + (i % 3)}" height="${S}" fill="#314a36" opacity="0.5"/>`;
    }
    closeCell();
  }

  // -- red lagging: crimson with polished brass bands (bands wrap in u)
  {
    openCell(CELL.lagging);
    const [x, y] = at(CELL.lagging);
    g += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#96342c"/>`;
    for (let i = 0; i < 6; i++) {
      const sx = x + ((i * 43 + 20) % S);
      g += `<rect x="${sx}" y="${y}" width="${6 + (i % 4) * 2}" height="${S}" fill="#872e27" opacity="0.8"/>`;
    }
    for (const by of [40, 128, 216]) {
      g += `<rect x="${x}" y="${y + by - 7}" width="${S}" height="14" fill="#c79b3a"/>`;
      g += `<rect x="${x}" y="${y + by - 7}" width="${S}" height="4" fill="#eccb6a"/>`;
      g += `<rect x="${x}" y="${y + by + 3}" width="${S}" height="2" fill="#8a6a1c"/>`;
    }
    closeCell();
  }

  // -- brass: warm tone with soft horizontal brushing
  {
    openCell(CELL.brass);
    const [x, y] = at(CELL.brass);
    g += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#caa53c"/>`;
    for (let i = 0; i < 24; i++) {
      const sy = y + ((i * 11 + 3) % S);
      const tone = i % 3 === 0 ? "#e2c258" : i % 3 === 1 ? "#b08e2e" : "#d6b54a";
      g += `<rect x="${x}" y="${sy}" width="${S}" height="${2 + (i % 2)}" fill="${tone}" opacity="0.6"/>`;
    }
    closeCell();
  }

  // -- cast iron: dark grey with mottle
  {
    openCell(CELL.iron);
    const [x, y] = at(CELL.iron);
    g += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#4d5156"/>`;
    for (let i = 0; i < 40; i++) {
      const px = x + ((i * 53 + 17) % S);
      const py = y + ((i * 97 + 31) % S);
      const r = 6 + (i % 5) * 3;
      g += `<circle cx="${px}" cy="${py}" r="${r}" fill="${i % 2 ? "#565b60" : "#42464a"}" opacity="0.65"/>`;
    }
    closeCell();
  }

  // -- machined steel: light grey, fine horizontal brushing
  {
    openCell(CELL.steel);
    const [x, y] = at(CELL.steel);
    g += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#b9bec3"/>`;
    for (let i = 0; i < 32; i++) {
      const sy = y + i * 8;
      g += `<rect x="${x}" y="${sy}" width="${S}" height="1.5" fill="${i % 2 ? "#d0d5da" : "#a3a8ad"}" opacity="0.8"/>`;
    }
    closeCell();
  }

  // -- copper: warm gradient bands
  {
    openCell(CELL.copper);
    const [x, y] = at(CELL.copper);
    g += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#b97140"/>`;
    for (let i = 0; i < 20; i++) {
      const sy = y + ((i * 13 + 5) % S);
      g += `<rect x="${x}" y="${sy}" width="${S}" height="${3 + (i % 3)}" fill="${i % 2 ? "#cb8049" : "#a35f36"}" opacity="0.7"/>`;
    }
    closeCell();
  }

  // -- brick: running bond, whole bricks per row so it wraps in u
  {
    openCell(CELL.brick);
    const [x, y] = at(CELL.brick);
    g += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#9a9089"/>`; // mortar
    const bw = 32;
    const bh = 16;
    for (let row = 0; row < S / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < S / bw; col++) {
        const bx = x + col * bw + off;
        const tone = ["#8a4a3c", "#935244", "#814238", "#965546"][(row * 5 + col + 5) % 4];
        g += `<rect x="${bx + 1}" y="${y + row * bh + 1}" width="${bw - 2}" height="${bh - 2}" fill="${tone}"/>`;
        // wrap the row's leading brick so the cell tiles in u
        if (col === -1) g += `<rect x="${bx + S + 1}" y="${y + row * bh + 1}" width="${bw - 2}" height="${bh - 2}" fill="${tone}"/>`;
      }
    }
    closeCell();
  }

  // -- section red: engineering cutaway hatching (45deg, spacing 32 -> wraps)
  {
    openCell(CELL.cut);
    const [x, y] = at(CELL.cut);
    g += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#c5402a"/>`;
    for (let k = -8; k < 16; k++) {
      const o = k * 32;
      g += `<line x1="${x + o}" y1="${y}" x2="${x + o + S}" y2="${y + S}" stroke="#e8d8c8" stroke-width="3" opacity="0.85"/>`;
    }
    closeCell();
  }

  // -- gauge dial: white face, black ticks, red zone
  {
    openCell(CELL.dial);
    const [x, y] = at(CELL.dial);
    const cx = x + S / 2;
    const cy = y + S / 2;
    g += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#86680f"/>`;
    g += `<circle cx="${cx}" cy="${cy}" r="118" fill="#f3efe2" stroke="#403318" stroke-width="6"/>`;
    for (let i = 0; i <= 12; i++) {
      const a = (-210 + i * 20) * DEG;
      const r0 = i % 3 === 0 ? 86 : 98;
      const x1 = cx + Math.cos(a) * r0;
      const y1 = cy + Math.sin(a) * r0;
      const x2 = cx + Math.cos(a) * 110;
      const y2 = cy + Math.sin(a) * 110;
      g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#222" stroke-width="${i % 3 === 0 ? 6 : 3}"/>`;
    }
    // red over-pressure arc
    g += `<path d="M ${cx + Math.cos(-10 * DEG) * 104} ${cy + Math.sin(-10 * DEG) * 104} A 104 104 0 0 1 ${cx + Math.cos(30 * DEG) * 104} ${cy + Math.sin(30 * DEG) * 104}" stroke="#b3261e" stroke-width="10" fill="none"/>`;
    g += `<circle cx="${cx}" cy="${cy}" r="10" fill="#403318"/>`;
    closeCell();
  }

  // -- fire: glowing coals
  {
    openCell(CELL.fire);
    const [x, y] = at(CELL.fire);
    g += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#8a2604"/>`;
    for (let i = 0; i < 130; i++) {
      const px = x + ((i * 41 + 9) % S);
      const py = y + ((i * 67 + 23) % S);
      const r = 4 + (i % 6) * 2.2;
      const tone = ["#ff8c1a", "#ffb84d", "#e8540a", "#ffd97a", "#c33808"][i % 5];
      g += `<circle cx="${px}" cy="${py}" r="${r}" fill="${tone}" opacity="${0.5 + (i % 3) * 0.18}"/>`;
    }
    closeCell();
  }

  defs += "</defs>";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">${defs}<rect width="1024" height="1024" fill="#3a3a3a"/>${g}</svg>`;
}

// Map a geometry's 0..1 UVs into an atlas cell (optionally a sub-window).
// Flips v because three.js UV origin is bottom-left but glTF is top-left.
// A small inset keeps bilinear/mip sampling from bleeding into neighbour
// cells (the patterns are noisy enough that the wrap-seam jump is invisible).
function cellUV(geom, cell, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  const uv = geom.attributes.uv;
  const inset = 0.012;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i);
    let v = uv.getY(i);
    u = Math.min(1, Math.max(0, u));
    v = Math.min(1, Math.max(0, v));
    const uu = u0 + inset + u * (u1 - u0 - 2 * inset);
    const vv = v0 + inset + (1 - v) * (v1 - v0 - 2 * inset);
    uv.setXY(i, (cell.c + uu) / 4, (cell.r + vv) / 4);
  }
  return geom;
}

// ---------------------------------------------------------------------------
// Custom geometry builders (axis = +x, phi measured from +y toward +z).
// ---------------------------------------------------------------------------
const P = (phi, R) => [R * Math.cos(phi), R * Math.sin(phi)]; // -> (y, z)

// Open tube along x. phi0..phi1 is the kept arc. flip=true points normals inward.
function tubeX(R, x0, x1, phi0, phi1, radialSegs = 48, flip = false) {
  const lengthSegs = 1;
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  const arc = phi1 - phi0;
  const segs = Math.max(4, Math.round((radialSegs * Math.abs(arc)) / (2 * Math.PI)));
  for (let i = 0; i <= lengthSegs; i++) {
    const x = x0 + ((x1 - x0) * i) / lengthSegs;
    for (let j = 0; j <= segs; j++) {
      const phi = phi0 + (arc * j) / segs;
      const [y, z] = P(phi, R);
      pos.push(x, y, z);
      const n = [0, Math.cos(phi), Math.sin(phi)];
      nrm.push(0, flip ? -n[1] : n[1], flip ? -n[2] : n[2]);
      uv.push(j / segs, i / lengthSegs);
    }
  }
  const row = segs + 1;
  for (let i = 0; i < lengthSegs; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * row + j;
      const b = a + row;
      if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b);
      else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Annular sector in the plane x=xc, normal +-x.
function ringX(xc, Rin, Rout, phi0, phi1, facing = 1, radialSegs = 48) {
  const arc = phi1 - phi0;
  const segs = Math.max(3, Math.round((radialSegs * Math.abs(arc)) / (2 * Math.PI)));
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  for (let k = 0; k <= 1; k++) {
    const R = k === 0 ? Rin : Rout;
    for (let j = 0; j <= segs; j++) {
      const phi = phi0 + (arc * j) / segs;
      const [y, z] = P(phi, R);
      pos.push(xc, y, z);
      nrm.push(facing, 0, 0);
      uv.push(j / segs, k);
    }
  }
  const row = segs + 1;
  for (let j = 0; j < segs; j++) {
    const a = j;
    const b = j + row;
    if (facing > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
    else idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Full disk at x=xc.
function diskX(xc, R, facing = 1, radialSegs = 48) {
  const g = new THREE.CircleGeometry(R, radialSegs);
  // CircleGeometry lies in xy-plane facing +z; rotate so it faces +-x.
  g.rotateY(facing > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.translate(xc, 0, 0);
  return g;
}

// Flat radial quad (a cut face along a window's straight edge), x0..x1, R0..R1 at angle phi.
function radialQuad(x0, x1, R0, R1, phi, flipNormal = false) {
  const [y0, z0] = P(phi, R0);
  const [y1, z1] = P(phi, R1);
  const pos = [x0, y0, z0, x1, y0, z0, x0, y1, z1, x1, y1, z1];
  // normal = tangential direction
  let n = [0, -Math.sin(phi), Math.cos(phi)];
  if (flipNormal) n = [0, -n[1], -n[2]];
  const nrm = [...n, ...n, ...n, ...n].map((v, i) => (i % 3 === 0 ? 0 : v)).slice(0);
  const uv = [0, 0, 1, 0, 0, 1, 1, 1];
  const idx = flipNormal ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Cutaway shell: a wall (outer+inner surface) along x with a rectangular
// window (in x and phi) removed, cut faces returned separately.
function windowedShell({ Rout, Rin, x0, x1, winX0, winX1, winPhi0, winPhi1, segs = 48 }) {
  const shell = [];
  const cuts = [];
  const PI2 = Math.PI * 2;
  // full-ring end sections
  shell.push(tubeX(Rout, x0, winX0, 0, PI2, segs));
  shell.push(tubeX(Rout, winX1, x1, 0, PI2, segs));
  shell.push(tubeX(Rin, x0, winX0, 0, PI2, segs, true));
  shell.push(tubeX(Rin, winX1, x1, 0, PI2, segs, true));
  // windowed middle section keeps the complement arc winPhi1..winPhi0+2pi
  shell.push(tubeX(Rout, winX0, winX1, winPhi1, winPhi0 + PI2, segs));
  shell.push(tubeX(Rin, winX0, winX1, winPhi1, winPhi0 + PI2, segs, true));
  // cut faces: two rings at window ends + two straight strips along the arc edges
  cuts.push(ringX(winX0, Rin, Rout, winPhi0, winPhi1, -1, segs));
  cuts.push(ringX(winX1, Rin, Rout, winPhi0, winPhi1, 1, segs));
  cuts.push(radialQuad(winX0, winX1, Rin, Rout, winPhi0, true));
  cuts.push(radialQuad(winX0, winX1, Rin, Rout, winPhi1, false));
  return { shell, cuts };
}

// Box helper: dims + centre + optional euler, with UVs mapped later.
function box(w, h, d, cx, cy, cz, rot = null) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rot) g.rotateX(rot[0]), g.rotateY(rot[1]), g.rotateZ(rot[2]);
  g.translate(cx, cy, cz);
  return g;
}

// Cylinder along an arbitrary axis between two points.
function rodBetween(p0, p1, r0, r1 = r0, radialSegs = 16) {
  const a = new THREE.Vector3(...p0);
  const b = new THREE.Vector3(...p1);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radialSegs);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

// Water body: partial cylinder bottom + flat top surface (the waterline).
function waterBody(R, x0, x1, cy, waterY, segs = 48) {
  const phiS = Math.acos((waterY - cy) / R);
  const curved = tubeX(R, x0, x1, phiS, 2 * Math.PI - phiS, segs);
  curved.translate(0, cy, 0);
  const zHalf = R * Math.sin(phiS);
  const top = new THREE.PlaneGeometry(x1 - x0, zHalf * 2);
  top.rotateX(-Math.PI / 2);
  top.translate((x0 + x1) / 2, waterY, 0);
  return mergeGeometries([curved, top], false);
}

// ---------------------------------------------------------------------------
// glTF document scaffolding
// ---------------------------------------------------------------------------
const doc = new Document();
const buffer = doc.createBuffer("bin");
const scene = doc.createScene("SteamEngine");
doc.getRoot().setDefaultScene(scene);

const atlasJpeg = await sharp(Buffer.from(atlasSvg())).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
const atlasTex = doc.createTexture("steam-engine-atlas").setImage(atlasJpeg).setMimeType("image/jpeg");

function makeMat(name, { metal = 0.5, rough = 0.5, color = [1, 1, 1, 1], textured = true, blend = false, doubleSided = false, emissive = null } = {}) {
  const m = doc
    .createMaterial(name)
    .setBaseColorFactor(color)
    .setMetallicFactor(metal)
    .setRoughnessFactor(rough)
    .setDoubleSided(doubleSided);
  if (textured) m.setBaseColorTexture(atlasTex);
  if (blend) m.setAlphaMode("BLEND");
  if (emissive) {
    m.setEmissiveFactor(emissive);
    m.setEmissiveTexture(atlasTex);
  }
  return m;
}

// NOTE: the Verse room lights scenes with analytic lights only (no IBL), so
// metalness is kept moderate or PBR metals would render nearly black.
const MAT = {
  boiler: makeMat("boiler-plate", { metal: 0.2, rough: 0.55, doubleSided: true }),
  lagging: makeMat("red-lagging", { metal: 0.12, rough: 0.5, doubleSided: true }),
  brass: makeMat("brass", { metal: 0.55, rough: 0.32 }),
  iron: makeMat("cast-iron", { metal: 0.3, rough: 0.55 }),
  steel: makeMat("steel", { metal: 0.45, rough: 0.3 }),
  copper: makeMat("copper", { metal: 0.45, rough: 0.4 }),
  brick: makeMat("brick", { metal: 0.0, rough: 0.92 }),
  cut: makeMat("section-cut", { metal: 0.05, rough: 0.7, doubleSided: true }),
  dial: makeMat("gauge-dial", { metal: 0.1, rough: 0.4 }),
  fire: makeMat("fire", { metal: 0, rough: 1, color: [0.25, 0.05, 0.01, 1], emissive: [1, 0.55, 0.15] }),
  water: makeMat("water", { textured: false, color: [0.12, 0.38, 0.52, 0.55], metal: 0, rough: 0.08, blend: true, doubleSided: true }),
  steamSoft: makeMat("steam-soft", { textured: false, color: [0.93, 0.95, 0.97, 0.22], metal: 0, rough: 0.9, blend: true, doubleSided: true }),
  steamCyl: makeMat("steam-cylinder", { textured: false, color: [0.94, 0.96, 0.98, 0.3], metal: 0, rough: 0.85, blend: true, doubleSided: true }),
  smoke: makeMat("smoke", { textured: false, color: [0.85, 0.85, 0.87, 0.3], metal: 0, rough: 1, blend: true, doubleSided: true }),
  glass: makeMat("gauge-glass", { textured: false, color: [0.85, 0.92, 0.95, 0.22], metal: 0, rough: 0.05, blend: true, doubleSided: true }),
  portDark: makeMat("port-dark", { textured: false, color: [0.06, 0.06, 0.07, 1], metal: 0.3, rough: 0.8 })
};

let triCount = 0;

function primFromGeom(geom, material) {
  const g = geom.index ? geom : geom.toNonIndexed();
  const posArr = new Float32Array(g.attributes.position.array);
  const nrmArr = new Float32Array(g.attributes.normal.array);
  const uvArr = g.attributes.uv ? new Float32Array(g.attributes.uv.array) : new Float32Array((posArr.length / 3) * 2);
  const count = posArr.length / 3;
  const idxSrc = g.index ? g.index.array : [...Array(count).keys()];
  const IdxArr = count > 65535 ? Uint32Array : Uint16Array;
  const idxArr = new IdxArr(idxSrc);
  triCount += idxArr.length / 3;
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(posArr))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(nrmArr))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setBuffer(buffer).setArray(uvArr))
    .setIndices(doc.createAccessor().setType("SCALAR").setBuffer(buffer).setArray(idxArr))
    .setMaterial(material);
  return prim;
}

// Add a node carrying one or more (geometry, material) pairs.
function addPart(name, parts, parent = null, trs = {}) {
  const mesh = doc.createMesh(name);
  for (const [geom, mat] of parts) mesh.addPrimitive(primFromGeom(geom, mat));
  const node = doc.createNode(name).setMesh(mesh);
  if (trs.t) node.setTranslation(trs.t);
  if (trs.r) node.setRotation(trs.r);
  if (trs.s) node.setScale(trs.s);
  if (parent) parent.addChild(node);
  else scene.addChild(node);
  return node;
}

const merged = (geoms) => mergeGeometries(geoms, false);

// ---------------------------------------------------------------------------
// STATIC STRUCTURE
// ---------------------------------------------------------------------------

// Plinth (brick) with a flywheel pit.
{
  const bricks = [];
  const slab = (x0, x1, z0, z1, y0, y1) => {
    const g = box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    cellUV(g, CELL.brick);
    bricks.push(g);
  };
  slab(-2.45, 1.3, -0.85, 0.85, 0, 0.18); // main slab
  slab(1.3, 2.45, -0.4, 0.85, 0, 0.18); // right of pit
  slab(1.3, 2.45, -0.85, -0.7, 0, 0.18); // behind pit
  slab(1.3, 2.45, -0.7, -0.4, 0, 0.014); // pit floor
  addPart("Plinth", [[merged(bricks), MAT.brick]]);

  // cast-iron bed plate under the motion work
  const bed = box(2.75, 0.065, 0.6, 0.95, 0.2125, 0);
  cellUV(bed, CELL.iron);
  addPart("BedPlate", [[bed, MAT.iron]]);
}

// ---------------------------------------------------------------------------
// BOILER
// ---------------------------------------------------------------------------
const B = { cx: -1.45, cy: 0.78, R: 0.42, Rin: 0.39, x0: -2.15, x1: -0.75, winX0: -1.8, winX1: -1.05, winPhi0: 25 * DEG, winPhi1: 115 * DEG };
const WATER_Y = 0.88;

{
  const { shell, cuts } = windowedShell({ Rout: B.R, Rin: B.Rin, x0: B.x0, x1: B.x1, winX0: B.winX0, winX1: B.winX1, winPhi0: B.winPhi0, winPhi1: B.winPhi1, segs: 56 });
  // UV: plate pattern continuous along boiler length
  const L = B.x1 - B.x0;
  const win = (x0, x1) => [(x0 - B.x0) / L, (x1 - B.x0) / L];
  // shell order: outer end/end, inner end/end, outer window, inner window —
  // inner surfaces get the bright steel cell so the cutaway interior reads.
  const segSpans = [
    [B.x0, B.winX0], [B.winX1, B.x1], [B.x0, B.winX0], [B.winX1, B.x1], [B.winX0, B.winX1], [B.winX0, B.winX1]
  ];
  for (let k = 0; k < shell.length; k++) {
    const [v0, v1] = win(segSpans[k][0], segSpans[k][1]);
    cellUV(shell[k], k === 2 || k === 3 || k === 5 ? CELL.steel : CELL.boiler, 0, v0, 1, v1);
  }
  for (const c of cuts) cellUV(c, CELL.cut);
  addPart("BoilerShell", [[merged(shell), MAT.boiler], [merged(cuts), MAT.cut]]);

  // end caps (dished look: disk + rim torus)
  const caps = [];
  for (const [x, f] of [[B.x0, -1], [B.x1, 1]]) {
    caps.push(diskX(x + f * 0.012, B.R, f, 56));
    const rim = new THREE.TorusGeometry(B.R - 0.012, 0.018, 10, 56);
    rim.rotateY(Math.PI / 2);
    rim.translate(x + f * 0.012, B.cy - B.cy, 0); // torus already centred at origin in yz
    rim.translate(0, 0, 0);
    caps.push(rim);
  }
  const capsG = merged(caps);
  capsG.translate(0, B.cy, 0);
  cellUV(capsG, CELL.boiler);
  addPart("BoilerEnds", [[capsG, MAT.boiler]]);

  // shift shell into place (windowedShell builds around y=0)
  // -> instead of shifting after the fact, the shell node gets a translation:
}
// windowedShell built the boiler at y=0; raise the node.
// (we set translation on the two nodes we just added)
for (const n of scene.listChildren()) {
  if (n.getName() === "BoilerShell") n.setTranslation([0, B.cy, 0]);
}

// boiler saddles
{
  const s = [];
  for (const sx of [-1.95, -0.95]) {
    const g = box(0.24, 0.27, 0.6, sx, 0.18 + 0.135, 0);
    cellUV(g, CELL.brick);
    s.push(g);
  }
  addPart("BoilerSaddles", [[merged(s), MAT.brick]]);
}

// fire tube (flue) with its own cutaway aligned with the boiler window + fire inside
{
  const F = { R: 0.135, Rin: 0.123, y: 0.62, x0: -2.13, x1: -0.77, winX0: -1.72, winX1: -1.13, winPhi0: 30 * DEG, winPhi1: 110 * DEG };
  const { shell, cuts } = windowedShell({ Rout: F.R, Rin: F.Rin, x0: F.x0, x1: F.x1, winX0: F.winX0, winX1: F.winX1, winPhi0: F.winPhi0, winPhi1: F.winPhi1, segs: 32 });
  for (const sgeom of shell) cellUV(sgeom, CELL.steel);
  for (const c of cuts) cellUV(c, CELL.cut);
  const flue = addPart("FireTube", [[merged(shell), MAT.steel], [merged(cuts), MAT.cut]]);
  flue.setTranslation([0, F.y, 0]);

  const fire = tubeX(0.105, F.x0 + 0.01, F.x1 - 0.01, 0, Math.PI * 2, 24);
  const fireCapA = diskX(F.x0 + 0.012, 0.105, -1, 24);
  const fireCapB = diskX(F.x1 - 0.012, 0.105, 1, 24);
  const fireG = merged([fire, fireCapA, fireCapB]);
  fireG.translate(0, F.y, 0);
  cellUV(fireG, CELL.fire);
  addPart("Fire", [[fireG, MAT.fire]]);
}

// water (sloshing) — stays inside the shell
{
  const w = waterBody(0.385, B.x0 + 0.03, B.x1 - 0.03, 0, WATER_Y - B.cy, 56);
  // geometry is local to the boiler centre so the node can roll (slosh)
  addPart("BoilerWater", [[w, MAT.water]], null, { t: [0, B.cy, 0] });
}

// steam space (soft fog above the waterline)
{
  const s = tubeX(0.375, B.x0 + 0.04, B.x1 - 0.04, -68 * DEG, 68 * DEG, 40);
  s.translate(0, B.cy, 0);
  addPart("BoilerSteamSpace", [[s, MAT.steamSoft]]);
}

// steam dome + safety valve + stack (smokebox end) + fittings
{
  const brass = [];
  const green = [];
  const copper = [];

  // dome at x=-0.95
  const dome = new THREE.CylinderGeometry(0.12, 0.125, 0.24, 32);
  dome.translate(-0.95, 1.3, 0);
  green.push(dome);
  const domeCap = new THREE.SphereGeometry(0.12, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  domeCap.translate(-0.95, 1.42, 0);
  brass.push(domeCap);

  // safety valve at x=-1.6
  const sv = new THREE.CylinderGeometry(0.045, 0.055, 0.12, 16);
  sv.translate(-1.6, 1.25, 0);
  brass.push(sv);
  const svTop = new THREE.SphereGeometry(0.03, 12, 8);
  svTop.translate(-1.6, 1.32, 0);
  brass.push(svTop);

  // chimney stack on the smokebox end
  const stack = new THREE.CylinderGeometry(0.085, 0.105, 1.18, 24);
  stack.translate(-2.0, 1.76, 0);
  const stackBase = new THREE.CylinderGeometry(0.13, 0.16, 0.16, 24);
  stackBase.translate(-2.0, 1.23, 0);
  const stackCap = new THREE.CylinderGeometry(0.105, 0.085, 0.07, 24);
  stackCap.translate(-2.0, 2.385, 0);
  const ironG = merged([stack, stackBase, stackCap]);
  cellUV(ironG, CELL.iron);
  addPart("Chimney", [[ironG, MAT.iron]]);

  // firebox door on the back end (toward -x)
  const door = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 24);
  door.rotateZ(Math.PI / 2);
  door.translate(-2.18, 0.62, 0);
  const doorG = merged([door]);
  cellUV(doorG, CELL.iron);
  addPart("FireboxDoor", [[doorG, MAT.iron]]);

  // steam pipe: dome -> steam chest (copper)
  const steamPath = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.95, 1.46, 0),
      new THREE.Vector3(-0.95, 1.62, 0),
      new THREE.Vector3(-0.45, 1.58, 0.04),
      new THREE.Vector3(0.02, 1.28, 0.08),
      new THREE.Vector3(0.02, 0.87, 0.08)
    ],
    false,
    "catmullrom",
    0.1
  );
  const steamPipe = new THREE.TubeGeometry(steamPath, 32, 0.045, 12, false);
  copper.push(steamPipe);

  // exhaust pipe: chest end -> down to the bed
  const exPath = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.135, 0.775, 0.08),
      new THREE.Vector3(-0.32, 0.74, 0.06),
      new THREE.Vector3(-0.45, 0.5, 0.02),
      new THREE.Vector3(-0.5, 0.26, 0)
    ],
    false,
    "catmullrom",
    0.1
  );
  copper.push(new THREE.TubeGeometry(exPath, 24, 0.038, 12, false));

  const copperG = merged(copper);
  cellUV(copperG, CELL.copper);
  addPart("Pipes", [[copperG, MAT.copper]]);

  const greenG = merged(green);
  cellUV(greenG, CELL.boiler);
  addPart("SteamDome", [[greenG, MAT.boiler]]);

  const brassG = merged(brass);
  cellUV(brassG, CELL.brass);
  addPart("BrassFittings", [[brassG, MAT.brass]]);
}

// water gauge glass on the boiler front (level matches the boiler water)
{
  const gx = -0.88;
  const gz = 0.46;
  const brass = [];
  for (const fy of [0.6, 0.98]) {
    const f = new THREE.CylinderGeometry(0.028, 0.028, 0.05, 12);
    f.translate(gx, fy, gz);
    brass.push(f);
    const stub = new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8);
    stub.rotateX(Math.PI / 2);
    stub.translate(gx, fy, gz - 0.06);
    brass.push(stub);
  }
  const brassG = merged(brass);
  cellUV(brassG, CELL.brass);
  addPart("GaugeFittings", [[brassG, MAT.brass]]);

  const tube = new THREE.CylinderGeometry(0.015, 0.015, 0.34, 10, 1, true);
  tube.translate(gx, 0.79, gz);
  addPart("GaugeGlass", [[tube, MAT.glass]]);

  const col = new THREE.CylinderGeometry(0.011, 0.011, WATER_Y - 0.62, 10);
  col.translate(gx, 0.62 + (WATER_Y - 0.62) / 2, gz);
  addPart("GaugeWater", [[col, MAT.water]]);
}

// pressure gauge on the chimney, facing the viewer; the needle flutters
{
  const gx = -2.0;
  const gy = 1.62;
  const stub = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 10);
  stub.rotateX(Math.PI / 2);
  stub.translate(gx, gy, 0.12);
  const rim = new THREE.TorusGeometry(0.075, 0.014, 10, 28);
  rim.translate(gx, gy, 0.17);
  const brassG = merged([stub, rim]);
  cellUV(brassG, CELL.brass);
  addPart("PressureGaugeBody", [[brassG, MAT.brass]]);

  const face = new THREE.CircleGeometry(0.072, 28);
  face.translate(0, 0, 0.0);
  cellUV(face, CELL.dial);
  // dial face node sits at gauge centre; needle is its animated child
  const faceNode = addPart("PressureGaugeFace", [[face, MAT.dial]], null, { t: [gx, gy, 0.171] });

  const needle = box(0.008, 0.052, 0.006, 0, 0.02, 0.004);
  cellUV(needle, CELL.iron);
  addPart("GaugeNeedle", [[needle, MAT.iron]], faceNode, { t: [0, 0, 0.002] });
}

// ---------------------------------------------------------------------------
// STEAM CYLINDER (cutaway) + STEAM CHEST + slide valve ports
// ---------------------------------------------------------------------------
const CYL = { x0: -0.165, x1: 0.345, Rout: 0.2, Rin: 0.16, winX0: -0.1, winX1: 0.28, winPhi0: 35 * DEG, winPhi1: 125 * DEG };
const BORE = { x0: -0.135, x1: 0.315 };

{
  const { shell, cuts } = windowedShell({ Rout: CYL.Rout, Rin: CYL.Rin, x0: CYL.x0, x1: CYL.x1, winX0: CYL.winX0, winX1: CYL.winX1, winPhi0: CYL.winPhi0, winPhi1: CYL.winPhi1, segs: 48 });
  const L = CYL.x1 - CYL.x0;
  const win = (a, b) => [(a - CYL.x0) / L, (b - CYL.x0) / L];
  const segSpans = [
    [CYL.x0, CYL.winX0], [CYL.winX1, CYL.x1], [CYL.x0, CYL.winX0], [CYL.winX1, CYL.x1], [CYL.winX0, CYL.winX1], [CYL.winX0, CYL.winX1]
  ];
  for (let k = 0; k < shell.length; k++) {
    const [v0, v1] = win(segSpans[k][0], segSpans[k][1]);
    // inner surfaces are the polished bore
    cellUV(shell[k], k === 2 || k === 3 || k === 5 ? CELL.steel : CELL.lagging, 0, v0, 1, v1);
  }
  for (const c of cuts) cellUV(c, CELL.cut);
  const node = addPart("CylinderBarrel", [[merged(shell), MAT.lagging], [merged(cuts), MAT.cut]]);
  node.setTranslation([0, AXIS_Y, 0]);

  // heads + gland
  const headParts = [];
  const front = new THREE.CylinderGeometry(0.235, 0.235, 0.06, 40);
  front.rotateZ(Math.PI / 2);
  front.translate(-0.195, 0, 0);
  headParts.push(front);
  const rear = new THREE.CylinderGeometry(0.235, 0.235, 0.06, 40);
  rear.rotateZ(Math.PI / 2);
  rear.translate(0.375, 0, 0);
  headParts.push(rear);
  const gland = new THREE.CylinderGeometry(0.055, 0.065, 0.07, 20);
  gland.rotateZ(Math.PI / 2);
  gland.translate(0.435, 0, 0);
  headParts.push(gland);
  const headsG = merged(headParts);
  headsG.translate(0, AXIS_Y, 0);
  cellUV(headsG, CELL.iron);
  addPart("CylinderHeads", [[headsG, MAT.iron]]);

  // inner faces of the bore ends (visible through the window)
  const inA = diskX(BORE.x0, CYL.Rin, 1, 32);
  const inB = diskX(BORE.x1, CYL.Rin, -1, 32);
  const inG = merged([inA, inB]);
  inG.translate(0, AXIS_Y, 0);
  cellUV(inG, CELL.steel);
  addPart("BoreEnds", [[inG, MAT.steel]]);

  // cradle support
  const cradle = box(0.34, 0.075, 0.34, 0.09, 0.2825, 0);
  cellUV(cradle, CELL.iron);
  addPart("CylinderCradle", [[cradle, MAT.iron]]);
}

// steam chest on top of the barrel, front face open (cutaway); shifted
// toward +z so the slide valve sits in the eccentric's plane
const CHEST = { x0: -0.13, x1: 0.31, z0: -0.04, z1: 0.2, y0: 0.7, y1: 0.88, wall: 0.025 };
{
  const w = CHEST.wall;
  const iron = [];
  const mk = (x0, x1, y0, y1, z0, z1) => iron.push(box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  mk(CHEST.x0, CHEST.x1, CHEST.y0, CHEST.y0 + 0.022, CHEST.z0, CHEST.z1); // port face plate
  mk(CHEST.x0, CHEST.x1, CHEST.y1 - w, CHEST.y1, CHEST.z0, CHEST.z1); // lid
  mk(CHEST.x0, CHEST.x1, CHEST.y0, CHEST.y1, CHEST.z0, CHEST.z0 + w); // back wall
  mk(CHEST.x0, CHEST.x0 + w, CHEST.y0, CHEST.y1, CHEST.z0, CHEST.z1); // -x wall
  mk(CHEST.x1 - w, CHEST.x1, CHEST.y0, CHEST.y1, CHEST.z0, CHEST.z1); // +x wall
  const ironG = merged(iron);
  cellUV(ironG, CELL.iron);

  // section-red frame around the open front face
  const cutsList = [];
  const f = 0.012;
  cutsList.push(box(CHEST.x1 - CHEST.x0, w, f, (CHEST.x0 + CHEST.x1) / 2, CHEST.y1 - w / 2, CHEST.z1 - f / 2 + 0.002));
  cutsList.push(box(w, CHEST.y1 - CHEST.y0, f, CHEST.x0 + w / 2, (CHEST.y0 + CHEST.y1) / 2, CHEST.z1 - f / 2 + 0.002));
  cutsList.push(box(w, CHEST.y1 - CHEST.y0, f, CHEST.x1 - w / 2, (CHEST.y0 + CHEST.y1) / 2, CHEST.z1 - f / 2 + 0.002));
  const cutsG = merged(cutsList);
  cellUV(cutsG, CELL.cut);

  // saddle casting filling the gap between the chest and the curved barrel
  const saddle = box(CHEST.x1 - CHEST.x0, 0.1, CHEST.z1 - CHEST.z0, (CHEST.x0 + CHEST.x1) / 2, CHEST.y0 - 0.05, (CHEST.z0 + CHEST.z1) / 2);
  cellUV(saddle, CELL.iron);
  addPart("SteamChest", [[merged([ironG, saddle]), MAT.iron], [cutsG, MAT.cut]]);

  // valve ports (dark slots on the port face)
  const ports = [];
  for (const px of [-0.05, 0.09, 0.23]) ports.push(box(0.05, 0.004, 0.12, px, CHEST.y0 + 0.024, 0.08));
  addPart("ValvePorts", [[merged(ports), MAT.portDark]]);
}

// ---------------------------------------------------------------------------
// MOTION WORK (static parts): guides, pedestals, governor column
// ---------------------------------------------------------------------------
{
  const steel = [];
  // slide bars
  steel.push(box(0.68, 0.04, 0.1, 1.13, 0.605, 0));
  steel.push(box(0.68, 0.04, 0.1, 1.13, 0.395, 0));
  const steelG = merged(steel);
  cellUV(steelG, CELL.steel);
  addPart("SlideBars", [[steelG, MAT.steel]]);

  const iron = [];
  // slide bar end yokes (clear of the crosshead's travel: x 0.86..1.34)
  iron.push(box(0.06, 0.42, 0.16, 1.44, 0.45, 0));
  iron.push(box(0.06, 0.42, 0.16, 0.82, 0.45, 0));
  // crankshaft pedestals
  for (const pz of [-0.41, 0.41]) {
    iron.push(box(0.24, 0.21, 0.14, CRANK_X, 0.35, pz));
    iron.push(box(0.28, 0.05, 0.18, CRANK_X, 0.27, pz));
  }
  const ironG = merged(iron);
  cellUV(ironG, CELL.iron);
  addPart("Pedestals", [[ironG, MAT.iron]]);

  // brass bearing caps
  const caps = [];
  for (const pz of [-0.41, 0.41]) {
    const cap = tubeX(0.062, -0.05, 0.05, -90 * DEG, 90 * DEG, 16);
    cap.rotateY(Math.PI / 2); // tube along x -> along z
    cap.translate(CRANK_X, AXIS_Y, pz);
    caps.push(cap);
  }
  const capsG = merged(caps);
  cellUV(capsG, CELL.brass);
  addPart("BearingCaps", [[capsG, MAT.brass]]);

  // governor column
  const col = new THREE.CylinderGeometry(0.032, 0.04, 0.535, 16);
  col.translate(0.7, 0.5125, 0.42);
  const flange = new THREE.CylinderGeometry(0.07, 0.08, 0.03, 16);
  flange.translate(0.7, 0.26, 0.42);
  const colG = merged([col, flange]);
  cellUV(colG, CELL.brass);
  addPart("GovernorColumn", [[colG, MAT.brass]]);
}

// ---------------------------------------------------------------------------
// ANIMATED ASSEMBLIES
// ---------------------------------------------------------------------------

// Crankshaft node (origin = shaft centre): shaft, webs, pin, flywheel, eccentric
const crankNode = doc.createNode("Crankshaft").setTranslation([CRANK_X, AXIS_Y, 0]);
scene.addChild(crankNode);
{
  const iron = [];
  // shaft segments (rotate with the crank)
  const sh1 = new THREE.CylinderGeometry(0.045, 0.045, 0.53, 20);
  sh1.rotateX(Math.PI / 2);
  sh1.translate(0, 0, -0.365); // z -0.63..-0.10
  iron.push(sh1);
  const sh2 = new THREE.CylinderGeometry(0.045, 0.045, 0.42, 20);
  sh2.rotateX(Math.PI / 2);
  sh2.translate(0, 0, 0.31); // z 0.10..0.52
  iron.push(sh2);
  // webs
  iron.push(box(0.36, 0.11, 0.05, 0.08, 0, -0.0775));
  iron.push(box(0.36, 0.11, 0.05, 0.08, 0, 0.0775));
  const ironG = merged(iron);
  cellUV(ironG, CELL.iron);

  // crank pin (steel)
  const pin = new THREE.CylinderGeometry(0.035, 0.035, 0.115, 16);
  pin.rotateX(Math.PI / 2);
  pin.translate(CRANK_R, 0, 0);
  cellUV(pin, CELL.steel);

  const mesh = doc.createMesh("CrankParts");
  mesh.addPrimitive(primFromGeom(ironG, MAT.iron));
  mesh.addPrimitive(primFromGeom(pin, MAT.steel));
  crankNode.setMesh(mesh);

  // flywheel as a child (z = -0.555)
  const fw = [];
  const rimOuter = tubeX(0.48, -0.05, 0.05, 0, Math.PI * 2, 64);
  rimOuter.rotateY(Math.PI / 2);
  const rimInner = tubeX(0.385, -0.05, 0.05, 0, Math.PI * 2, 64, true);
  rimInner.rotateY(Math.PI / 2);
  fw.push(rimOuter, rimInner);
  for (const f of [-1, 1]) {
    const side = ringX(f * 0.05, 0.385, 0.48, 0, Math.PI * 2, f, 64);
    side.rotateY(Math.PI / 2);
    fw.push(side);
  }
  const hub = new THREE.CylinderGeometry(0.08, 0.08, 0.13, 24);
  hub.rotateX(Math.PI / 2);
  fw.push(hub);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const spoke = new THREE.CylinderGeometry(0.02, 0.027, 0.33, 10);
    spoke.translate(0, 0.235, 0);
    spoke.rotateZ(a);
    fw.push(spoke);
  }
  const fwG = merged(fw);
  cellUV(fwG, CELL.iron);
  addPart("Flywheel", [[fwG, MAT.iron]], crankNode, { t: [0, 0, -0.555] });

  // eccentric sheave (offset disc, rotates with shaft) in the valve plane
  const sheave = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 24);
  sheave.rotateX(Math.PI / 2);
  sheave.translate(ECC_E * Math.cos(ECC_PHASE), ECC_E * Math.sin(ECC_PHASE), ECC_Z);
  cellUV(sheave, CELL.steel);
  addPart("Eccentric", [[sheave, MAT.steel]], crankNode);
}

// Piston assembly (origin = crosshead pin): crosshead, piston rod, piston, rings
const pistonNode = doc.createNode("PistonAssembly").setTranslation([xheadX(THETA_BIND), AXIS_Y, 0]);
scene.addChild(pistonNode);
{
  const steel = [];
  // piston rod: from inside the crosshead to the piston
  const rod = new THREE.CylinderGeometry(0.025, 0.025, XHEAD_TO_PISTON, 14);
  rod.rotateZ(Math.PI / 2);
  rod.translate(-XHEAD_TO_PISTON / 2, 0, 0);
  steel.push(rod);
  const steelG = merged(steel);
  cellUV(steelG, CELL.steel);

  // piston disc + rings: dark iron so it reads against the pale steam
  const rings = [];
  const piston = new THREE.CylinderGeometry(0.155, 0.155, 0.09, 32);
  piston.rotateZ(Math.PI / 2);
  piston.translate(-XHEAD_TO_PISTON, 0, 0);
  rings.push(piston);
  for (const rx of [-XHEAD_TO_PISTON - 0.028, -XHEAD_TO_PISTON + 0.028]) {
    const ring = tubeX(0.1565, rx - 0.007, rx + 0.007, 0, Math.PI * 2, 32);
    rings.push(ring);
  }
  const ringsG = merged(rings);
  cellUV(ringsG, CELL.iron);

  // crosshead block + pin bosses
  const xh = [];
  xh.push(box(0.16, 0.165, 0.11, 0, 0, 0));
  const boss = new THREE.CylinderGeometry(0.034, 0.034, 0.15, 14);
  boss.rotateX(Math.PI / 2);
  xh.push(boss);
  const xhG = merged(xh);
  cellUV(xhG, CELL.iron);

  const mesh = doc.createMesh("PistonParts");
  mesh.addPrimitive(primFromGeom(steelG, MAT.steel));
  mesh.addPrimitive(primFromGeom(ringsG, MAT.iron));
  mesh.addPrimitive(primFromGeom(xhG, MAT.iron));
  pistonNode.setMesh(mesh);
}

// Connecting rod (origin = crosshead pin, +x toward crank pin)
const conrodNode = doc.createNode("ConnectingRod");
scene.addChild(conrodNode);
{
  const steel = [];
  const shaft = new THREE.CylinderGeometry(0.032, 0.023, ROD_L - 0.1, 14);
  shaft.rotateZ(-Math.PI / 2);
  shaft.translate(ROD_L / 2, 0, 0);
  steel.push(shaft);
  // small end boss
  const small = new THREE.CylinderGeometry(0.042, 0.042, 0.07, 14);
  small.rotateX(Math.PI / 2);
  steel.push(small);
  const steelG = merged(steel);
  cellUV(steelG, CELL.steel);

  // big end (brass strap)
  const big = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16);
  big.rotateX(Math.PI / 2);
  big.translate(ROD_L, 0, 0);
  cellUV(big, CELL.brass);

  const mesh = doc.createMesh("ConRodParts");
  mesh.addPrimitive(primFromGeom(steelG, MAT.steel));
  mesh.addPrimitive(primFromGeom(big, MAT.brass));
  conrodNode.setMesh(mesh);
}

// Slide valve assembly (origin = valve-spindle knuckle at the eccentric-rod joint)
const VALVE_SPINDLE = 0.6; // knuckle to valve centre
const valveNode = doc.createNode("SlideValve");
scene.addChild(valveNode);
{
  const brass = [];
  // the node rides at z = ECC_Z; the valve body sits over the ports at z 0.08
  const valve = box(0.2, 0.07, 0.14, -VALVE_SPINDLE, -0.02, 0.08 - ECC_Z);
  brass.push(valve);
  const brassG = merged(brass);
  cellUV(brassG, CELL.brass);

  const steel = [];
  const spindle = new THREE.CylinderGeometry(0.014, 0.014, VALVE_SPINDLE, 10);
  spindle.rotateZ(Math.PI / 2);
  spindle.translate(-VALVE_SPINDLE / 2, 0, 0);
  steel.push(spindle);
  steel.push(box(0.05, 0.05, 0.05, 0, 0, 0));
  const steelG = merged(steel);
  cellUV(steelG, CELL.steel);

  const mesh = doc.createMesh("ValveParts");
  mesh.addPrimitive(primFromGeom(brassG, MAT.brass));
  mesh.addPrimitive(primFromGeom(steelG, MAT.steel));
  valveNode.setMesh(mesh);
}

// Eccentric rod (origin = valve knuckle, +x toward eccentric centre)
const eccRodNode = doc.createNode("EccentricRod");
scene.addChild(eccRodNode);
{
  const steel = [];
  const shaft = new THREE.CylinderGeometry(0.02, 0.016, ECC_ROD_L - 0.12, 12);
  shaft.rotateZ(-Math.PI / 2);
  shaft.translate(ECC_ROD_L / 2, 0, 0);
  steel.push(shaft);
  const steelG = merged(steel);
  cellUV(steelG, CELL.steel);

  // eccentric strap ring around the sheave
  const strap = new THREE.TorusGeometry(0.1, 0.016, 10, 24);
  strap.translate(ECC_ROD_L, 0, 0);
  cellUV(strap, CELL.brass);

  const mesh = doc.createMesh("EccRodParts");
  mesh.addPrimitive(primFromGeom(steelG, MAT.steel));
  mesh.addPrimitive(primFromGeom(strap, MAT.brass));
  eccRodNode.setMesh(mesh);
}

// In-cylinder steam volumes (scale.x animated with the piston)
const steamLeftNode = doc.createNode("SteamLeft").setTranslation([BORE.x0, AXIS_Y, 0]);
const steamRightNode = doc.createNode("SteamRight").setTranslation([BORE.x1, AXIS_Y, 0]);
scene.addChild(steamLeftNode);
scene.addChild(steamRightNode);
{
  for (const [node, dir, name] of [
    [steamLeftNode, 1, "SteamLeftVol"],
    [steamRightNode, -1, "SteamRightVol"]
  ]) {
    const tube = tubeX(0.15, dir > 0 ? 0 : -1, dir > 0 ? 1 : 0, 0, Math.PI * 2, 24);
    const cap = diskX(dir > 0 ? 1 : -1, 0.15, dir, 24);
    const g = merged([tube, cap]);
    const mesh = doc.createMesh(name);
    mesh.addPrimitive(primFromGeom(g, MAT.steamCyl));
    node.setMesh(mesh);
  }
}

// Governor (spins about y)
const govNode = doc.createNode("Governor").setTranslation([0.7, 0.78, 0.42]);
scene.addChild(govNode);
{
  const brass = [];
  const spindle = new THREE.CylinderGeometry(0.013, 0.013, 0.24, 10);
  spindle.translate(0, 0.12, 0);
  brass.push(spindle);
  const finial = new THREE.SphereGeometry(0.022, 12, 8);
  finial.translate(0, 0.245, 0);
  brass.push(finial);
  // arms + balls + links (both sides)
  const top = [0, 0.21, 0];
  for (const s of [1, -1]) {
    const armEnd = [s * 0.124, 0.21 - 0.158, 0];
    brass.push(rodBetween(top, armEnd, 0.009, 0.009, 8));
    const ball = new THREE.SphereGeometry(0.04, 16, 12);
    ball.translate(...armEnd);
    brass.push(ball);
    const mid = [s * 0.062, 0.21 - 0.079, 0];
    brass.push(rodBetween(mid, [0, 0.075, 0], 0.006, 0.006, 6));
  }
  const sleeve = new THREE.CylinderGeometry(0.021, 0.021, 0.045, 10);
  sleeve.translate(0, 0.07, 0);
  brass.push(sleeve);
  const g = merged(brass);
  cellUV(g, CELL.brass);
  const mesh = doc.createMesh("GovernorParts");
  mesh.addPrimitive(primFromGeom(g, MAT.brass));
  govNode.setMesh(mesh);
}

// Boiler bubbles, chimney smoke, gland wisps — simple animated spheres
function puffNode(name, r, mat) {
  const g = new THREE.SphereGeometry(r, 14, 10);
  const mesh = doc.createMesh(name);
  mesh.addPrimitive(primFromGeom(g, mat));
  const node = doc.createNode(name).setMesh(mesh);
  scene.addChild(node);
  return node;
}

const bubbleNodes = [];
const BUBBLES = [
  { x: -1.62, z: 0.1, r: 0.024, period: 2.0, phase: 0.0 },
  { x: -1.42, z: 0.2, r: 0.018, period: 1.3333, phase: 0.35 },
  { x: -1.25, z: 0.05, r: 0.028, period: 2.0, phase: 0.6 },
  { x: -1.5, z: 0.27, r: 0.02, period: 1.3333, phase: 0.15 },
  { x: -1.33, z: 0.16, r: 0.022, period: 2.0, phase: 0.8 }
];
for (let i = 0; i < BUBBLES.length; i++) bubbleNodes.push(puffNode(`Bubble${i + 1}`, BUBBLES[i].r, MAT.steamCyl));

const smokeNodes = [];
for (let i = 0; i < 4; i++) smokeNodes.push(puffNode(`Smoke${i + 1}`, 0.085, MAT.smoke));

const wispNodes = [];
for (let i = 0; i < 2; i++) wispNodes.push(puffNode(`GlandWisp${i + 1}`, 0.045, MAT.steamCyl));

// ---------------------------------------------------------------------------
// ANIMATION ("Run", 4 s, seamless loop)
// ---------------------------------------------------------------------------
const anim = doc.createAnimation("Run");
const times = new Float32Array(NKEYS);
for (let i = 0; i < NKEYS; i++) times[i] = (i / (NKEYS - 1)) * CLIP_T;
const timeAcc = doc.createAccessor("run_t").setType("SCALAR").setBuffer(buffer).setArray(times);

function channel(node, path, values) {
  const out = doc.createAccessor().setType(path === "rotation" ? "VEC4" : "VEC3").setBuffer(buffer).setArray(values);
  const sampler = doc.createAnimationSampler().setInterpolation("LINEAR").setInput(timeAcc).setOutput(out);
  const ch = doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler);
  anim.addSampler(sampler).addChannel(ch);
}

// sample helper: fn(t) -> value array; closes the loop exactly
function sampled(fn, dim) {
  const arr = new Float32Array(NKEYS * dim);
  for (let i = 0; i < NKEYS; i++) {
    const v = fn(times[i] % CLIP_T);
    for (let d = 0; d < dim; d++) arr[i * dim + d] = v[d];
  }
  for (let d = 0; d < dim; d++) arr[(NKEYS - 1) * dim + d] = arr[d];
  return arr;
}

const qz = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const qx = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const qy = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];

// keep quaternion keys on the same hemisphere so LERP never takes the long way
function quatContinuous(arr) {
  for (let i = 4; i < arr.length; i += 4) {
    const dot = arr[i] * arr[i - 4] + arr[i + 1] * arr[i - 3] + arr[i + 2] * arr[i - 2] + arr[i + 3] * arr[i - 1];
    if (dot < 0) for (let d = 0; d < 4; d++) arr[i + d] = -arr[i + d];
  }
  return arr;
}

// crankshaft
channel(crankNode, "rotation", quatContinuous(sampled((t) => qz(crankAngle(theta(t))), 4)));

// piston assembly
channel(pistonNode, "translation", sampled((t) => [xheadX(theta(t)), AXIS_Y, 0], 3));

// connecting rod
channel(conrodNode, "translation", sampled((t) => [xheadX(theta(t)), AXIS_Y, 0], 3));
channel(conrodNode, "rotation", quatContinuous(sampled((t) => qz(rodTilt(theta(t))), 4)));

// slide valve + eccentric rod
channel(valveNode, "translation", sampled((t) => [valvePinX(theta(t)), VALVE_PIN_Y, ECC_Z], 3));
channel(
  eccRodNode,
  "translation",
  sampled((t) => [valvePinX(theta(t)), VALVE_PIN_Y, ECC_Z], 3)
);
channel(
  eccRodNode,
  "rotation",
  quatContinuous(
    sampled((t) => {
      const th = theta(t);
      const [ex, ey] = eccCenter(th);
      return qz(Math.atan2(ey - VALVE_PIN_Y, ex - valvePinX(th)));
    }, 4)
  )
);

// in-cylinder steam volumes track the piston faces
const PISTON_HALF = 0.045;
channel(steamLeftNode, "scale", sampled((t) => [Math.max(0.012, pistonX(theta(t)) - PISTON_HALF - BORE.x0), 1, 1], 3));
channel(steamRightNode, "scale", sampled((t) => [Math.max(0.012, BORE.x1 - pistonX(theta(t)) - PISTON_HALF), 1, 1], 3));

// governor: 4 revolutions per clip
channel(govNode, "rotation", quatContinuous(sampled((t) => qy((2 * Math.PI * t * 4) / CLIP_T), 4)));

// boiler water slosh: gentle roll about the boiler axis, one cycle per clip
const waterNode = scene.listChildren().find((n) => n.getName() === "BoilerWater");
channel(waterNode, "rotation", quatContinuous(sampled((t) => qx(1.2 * DEG * Math.sin((2 * Math.PI * t) / CLIP_T)), 4)));

// gauge needle flutter (3 cycles per clip so it loops)
const needleNode = doc.getRoot().listNodes().find((n) => n.getName() === "GaugeNeedle");
channel(needleNode, "rotation", quatContinuous(sampled((t) => qz(-0.5 + 0.14 * Math.sin((2 * Math.PI * t * 3) / CLIP_T)), 4)));

// bubbles: rise from the fire tube to the waterline, grow then pop
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
for (let i = 0; i < BUBBLES.length; i++) {
  const b = BUBBLES[i];
  const cyc = (t) => ((t / b.period + b.phase) % 1 + 1) % 1;
  channel(bubbleNodes[i], "translation", sampled((t) => {
    const u = cyc(t);
    return [b.x + 0.015 * Math.sin(u * 6.28 * 2), 0.56 + (WATER_Y - 0.015 - 0.56) * u, b.z];
  }, 3));
  channel(bubbleNodes[i], "scale", sampled((t) => {
    const u = cyc(t);
    const s = Math.max(0.02, smooth01(u / 0.18) * (1 - smooth01((u - 0.92) / 0.08)));
    return [s, s, s];
  }, 3));
}

// chimney smoke: 4 staggered puffs rising and swelling, fading out by scale
for (let i = 0; i < 4; i++) {
  const phase = i / 4;
  const cyc = (t) => ((t / CLIP_T + phase) % 1 + 1) % 1;
  channel(smokeNodes[i], "translation", sampled((t) => {
    const u = cyc(t);
    return [-2.0 + 0.16 * u + 0.03 * Math.sin(u * 12.56), 2.42 + 0.95 * u, 0.02 * Math.sin(u * 9.42 + i)];
  }, 3));
  channel(smokeNodes[i], "scale", sampled((t) => {
    const u = cyc(t);
    const s = Math.max(0.01, smooth01(u / 0.14) * (0.55 + 1.05 * u) * (1 - smooth01((u - 0.82) / 0.18)));
    return [s, s, s];
  }, 3));
}

// gland wisps: one per stroke, alternating
for (let i = 0; i < 2; i++) {
  const period = 2.0;
  const phase = i * 0.5;
  const cyc = (t) => ((t / period + phase) % 1 + 1) % 1;
  channel(wispNodes[i], "translation", sampled((t) => {
    const u = cyc(t);
    return [0.47 + 0.05 * u, AXIS_Y + 0.04 + 0.3 * u, 0.02 + 0.04 * u];
  }, 3));
  channel(wispNodes[i], "scale", sampled((t) => {
    const u = cyc(t);
    const s = Math.max(0.01, smooth01(u / 0.2) * (0.4 + 0.9 * u) * (1 - smooth01((u - 0.7) / 0.3)));
    return [s, s, s];
  }, 3));
}

// ---------------------------------------------------------------------------
// Bind pose: evaluate the same kinematics at THETA_BIND so a static viewer
// shows a believable mid-stroke engine.
// ---------------------------------------------------------------------------
{
  const th = THETA_BIND;
  crankNode.setRotation(qz(crankAngle(th)));
  pistonNode.setTranslation([xheadX(th), AXIS_Y, 0]);
  conrodNode.setTranslation([xheadX(th), AXIS_Y, 0]);
  conrodNode.setRotation(qz(rodTilt(th)));
  valveNode.setTranslation([valvePinX(th), VALVE_PIN_Y, ECC_Z]);
  eccRodNode.setTranslation([valvePinX(th), VALVE_PIN_Y, ECC_Z]);
  const [ex, ey] = eccCenter(th);
  eccRodNode.setRotation(qz(Math.atan2(ey - VALVE_PIN_Y, ex - valvePinX(th))));
  steamLeftNode.setScale([Math.max(0.012, pistonX(th) - PISTON_HALF - BORE.x0), 1, 1]);
  steamRightNode.setScale([Math.max(0.012, BORE.x1 - pistonX(th) - PISTON_HALF), 1, 1]);
  needleNode.setRotation(qz(-0.5));
  // park the puffs tiny at their spawn points so they don't inflate the
  // static bounding box (viewers frame the model from the bind pose)
  for (const n of [...bubbleNodes, ...smokeNodes, ...wispNodes]) n.setScale([0.01, 0.01, 0.01]);
  for (const n of smokeNodes) n.setTranslation([-2.0, 2.42, 0]);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await io.write(OUT_PATH, doc);

console.log(`Wrote ${OUT_PATH}`);
console.log(`  triangles: ${triCount}`);
console.log(`  animation "Run": ${NKEYS} keys over ${CLIP_T}s (${60 / REV_T} rpm crank)`);
