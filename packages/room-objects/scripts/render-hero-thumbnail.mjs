/**
 * Generates the RoomObject hero catalog thumbnail.
 *
 * This is a dependency-free software renderer producing a CPK-accurate, shaded
 * illustration of the water molecule in its default state (ball-and-stick,
 * bond-angle readout on). It exists so the catalog file is real and presentable
 * without a browser.
 *
 * The canonical thumbnail is the live WebGL render captured from the dev harness
 * ("Capture thumbnail" button at /dev/room-object-hero) — re-capture before the
 * Phase 0 PR for pixel parity with the in-engine look.
 *
 * Run: node packages/room-objects/scripts/render-hero-thumbnail.mjs
 */

import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 800;
const HEIGHT = 600;

// Shared geometry with waterMolecule.tsx, projected to a flat front view.
const SCALE = 440; // pixels per metre
const BOND_ANGLE_DEG = 104.5;
const BOND_LENGTH = 0.42 * SCALE;
const OXYGEN_RADIUS = 0.17 * SCALE;
const HYDROGEN_RADIUS = 0.105 * SCALE;
const BOND_RADIUS = 0.05 * SCALE;

// CPK palette + annotation accent, matching the renderer defaults.
const OXYGEN_HEX = "#e23c2b";
const HYDROGEN_HEX = "#eef1f4";
const ACCENT_HEX = "#f4b63f";

// ── Maths helpers ────────────────────────────────────────────────────────────

const framebuffer = new Float64Array(WIDTH * HEIGHT * 3);

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Alpha-composites a colour onto the framebuffer at an integer pixel. */
function blendPixel(x, y, r, g, b, coverage) {
  if (coverage <= 0 || x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 3;
  framebuffer[i] = framebuffer[i] * (1 - coverage) + r * coverage;
  framebuffer[i + 1] = framebuffer[i + 1] * (1 - coverage) + g * coverage;
  framebuffer[i + 2] = framebuffer[i + 2] * (1 - coverage) + b * coverage;
}

// Light rig — upper-left key, in image space (+x right, +y down, +z toward viewer).
const LIGHT = normalize3(-0.55, -0.62, 0.6);
const HALF_VECTOR = normalize3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);

// ── Drawing primitives ───────────────────────────────────────────────────────

function paintBackground() {
  const top = hexToRgb("#19212f");
  const bottom = hexToRgb("#0a0e15");
  for (let y = 0; y < HEIGHT; y++) {
    const t = y / (HEIGHT - 1);
    for (let x = 0; x < WIDTH; x++) {
      const dx = (x - 400) / 520;
      const dy = (y - 300) / 440;
      const glow = Math.max(0, 1 - (dx * dx + dy * dy)) * 0.085;
      const i = (y * WIDTH + x) * 3;
      framebuffer[i] = mix(top[0], bottom[0], t) + glow;
      framebuffer[i + 1] = mix(top[1], bottom[1], t) + glow;
      framebuffer[i + 2] = mix(top[2], bottom[2], t) + glow * 1.1;
    }
  }
}

function drawShadow(cx, cy, rx, ry, strength) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(HEIGHT, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(WIDTH, Math.ceil(cx + rx)); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d >= 1) continue;
      blendPixel(x, y, 0.02, 0.025, 0.035, Math.pow(1 - d, 1.7) * strength);
    }
  }
}

function drawSphere(cx, cy, radius, hex) {
  const base = hexToRgb(hex);
  const x0 = Math.max(0, Math.floor(cx - radius - 2));
  const x1 = Math.min(WIDTH, Math.ceil(cx + radius + 2));
  const y0 = Math.max(0, Math.floor(cy - radius - 2));
  const y1 = Math.min(HEIGHT, Math.ceil(cy + radius + 2));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      const coverage = smoothstep(radius + 0.8, radius - 0.8, dist);
      if (coverage <= 0) continue;

      const nx = dx / radius;
      const ny = dy / radius;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      const specular = Math.pow(Math.max(0, nx * HALF_VECTOR[0] + ny * HALF_VECTOR[1] + nz * HALF_VECTOR[2]), 48) * 0.7;
      const rim = Math.pow(1 - nz, 3) * 0.2;
      const light = 0.3 + 0.95 * diffuse;

      blendPixel(
        x,
        y,
        clamp01(base[0] * light + specular + rim * 0.55),
        clamp01(base[1] * light + specular + rim * 0.62),
        clamp01(base[2] * light + specular + rim * 0.78),
        coverage,
      );
    }
  }
}

function drawBondHalf(ax, ay, bx, by, hex) {
  const base = hexToRgb(hex);
  const ex = bx - ax;
  const ey = by - ay;
  const length = Math.hypot(ex, ey) || 1;
  const dirX = ex / length;
  const dirY = ey / length;
  const perpX = -dirY;
  const perpY = dirX;

  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - BOND_RADIUS - 2));
  const maxX = Math.min(WIDTH, Math.ceil(Math.max(ax, bx) + BOND_RADIUS + 2));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - BOND_RADIUS - 2));
  const maxY = Math.min(HEIGHT, Math.ceil(Math.max(ay, by) + BOND_RADIUS + 2));

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const px = x + 0.5 - ax;
      const py = y + 0.5 - ay;
      const t = clamp01((px * dirX + py * dirY) / length);
      const closestX = ax + ex * t;
      const closestY = ay + ey * t;
      const ddx = x + 0.5 - closestX;
      const ddy = y + 0.5 - closestY;
      const dist = Math.hypot(ddx, ddy);
      const coverage = smoothstep(BOND_RADIUS + 0.8, BOND_RADIUS - 0.8, dist);
      if (coverage <= 0) continue;

      // Cylindrical cross-section shading.
      const offset = (ddx * perpX + ddy * perpY) / BOND_RADIUS;
      const nz = Math.sqrt(Math.max(0, 1 - offset * offset));
      const nx = perpX * offset;
      const ny = perpY * offset;
      const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      const specular = Math.pow(Math.max(0, nx * HALF_VECTOR[0] + ny * HALF_VECTOR[1] + nz * HALF_VECTOR[2]), 32) * 0.4;
      const light = 0.34 + 0.85 * diffuse;

      blendPixel(
        x,
        y,
        clamp01(base[0] * light + specular),
        clamp01(base[1] * light + specular),
        clamp01(base[2] * light + specular),
        coverage,
      );
    }
  }
}

function drawAngleArc(cx, cy, innerRadius, outerRadius, startAngle, endAngle, hex) {
  const color = hexToRgb(hex);
  const edge = 0.014;
  const x0 = Math.max(0, Math.floor(cx - outerRadius - 2));
  const x1 = Math.min(WIDTH, Math.ceil(cx + outerRadius + 2));
  const y0 = Math.max(0, Math.floor(cy - outerRadius - 2));
  const y1 = Math.min(HEIGHT, Math.ceil(cy + outerRadius + 2));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      const radial =
        smoothstep(innerRadius - 0.9, innerRadius + 0.9, dist) *
        smoothstep(outerRadius + 0.9, outerRadius - 0.9, dist);
      if (radial <= 0) continue;
      const angle = Math.atan2(dy, dx);
      const angular =
        smoothstep(startAngle - edge, startAngle + edge, angle) *
        smoothstep(endAngle + edge, endAngle - edge, angle);
      const coverage = radial * angular * 0.95;
      if (coverage <= 0) continue;
      blendPixel(x, y, color[0], color[1], color[2], coverage);
    }
  }
}

// ── Compose the molecule ─────────────────────────────────────────────────────

function render() {
  paintBackground();

  const halfAngle = ((BOND_ANGLE_DEG / 2) * Math.PI) / 180;
  const oxygen = { x: 400, y: 340 };
  const offsetX = Math.sin(halfAngle) * BOND_LENGTH;
  const offsetY = Math.cos(halfAngle) * BOND_LENGTH;
  const hLeft = { x: oxygen.x - offsetX, y: oxygen.y - offsetY };
  const hRight = { x: oxygen.x + offsetX, y: oxygen.y - offsetY };

  drawShadow(oxygen.x, oxygen.y + 122, 188, 40, 0.4);

  // Half-bonds: oxygen-coloured near O, hydrogen-coloured near H.
  for (const hydrogen of [hLeft, hRight]) {
    const midX = (oxygen.x + hydrogen.x) / 2;
    const midY = (oxygen.y + hydrogen.y) / 2;
    drawBondHalf(oxygen.x, oxygen.y, midX, midY, OXYGEN_HEX);
    drawBondHalf(midX, midY, hydrogen.x, hydrogen.y, HYDROGEN_HEX);
  }

  drawSphere(oxygen.x, oxygen.y, OXYGEN_RADIUS, OXYGEN_HEX);
  drawSphere(hLeft.x, hLeft.y, HYDROGEN_RADIUS, HYDROGEN_HEX);
  drawSphere(hRight.x, hRight.y, HYDROGEN_RADIUS, HYDROGEN_HEX);

  // Bond-angle arc, centred on "up" (−π/2 in atan2 space).
  const innerRadius = OXYGEN_RADIUS + 0.05 * SCALE;
  const outerRadius = innerRadius + 0.03 * SCALE;
  drawAngleArc(oxygen.x, oxygen.y, innerRadius, outerRadius, -Math.PI / 2 - halfAngle, -Math.PI / 2 + halfAngle, ACCENT_HEX);
}

// ── PNG encoding (truecolour + alpha, no dependencies) ───────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng() {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let p = 0; p < WIDTH * HEIGHT; p++) {
    for (let c = 0; c < 3; c++) {
      // Tiny dither breaks up gradient banding in the dark background.
      const value = clamp01(framebuffer[p * 3 + c] + (Math.random() - 0.5) / 255);
      pixels[p * 4 + c] = Math.round(value * 255);
    }
    pixels[p * 4 + 3] = 255;
  }

  const stride = WIDTH * 4;
  const raw = Buffer.alloc(HEIGHT * (stride + 1));
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour + alpha

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Entry point ──────────────────────────────────────────────────────────────

render();
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/web/public/room-objects/thumbnails/water-molecule.png",
);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, encodePng());
console.log(`Wrote ${WIDTH}×${HEIGHT} thumbnail → ${outputPath}`);
