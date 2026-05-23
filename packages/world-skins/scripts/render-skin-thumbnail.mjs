/**
 * Generates placeholder world skin thumbnails (800×500 PNG) for all five
 * builtin skins. Each is a stylised software-rendered scene hinting at the
 * skin's colour palette and atmosphere.
 *
 * Run: node packages/world-skins/scripts/render-skin-thumbnail.mjs
 *
 * Output: apps/web/public/world-skins/thumbnails/<slug>.png
 * These static files are committed and served by:
 *   - Next.js at /world-skins/thumbnails/<slug>.png (public dir)
 *   - API dev mode at /v1/world-skin-assets/world-skins/thumbnails/<slug>.png
 *     (storage.ts filesystem fallback reads apps/web/public/)
 *
 * Production: upload these files to R2 at world-skins/thumbnails/<slug>.png
 * so the API's worldSkinAssetUrl rewrite resolves correctly.
 */

import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH  = 800;
const HEIGHT = 500;

// ── Maths helpers ─────────────────────────────────────────────────────────────

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function mix(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function makeFramebuffer() { return new Float64Array(WIDTH * HEIGHT * 3); }

function setPixel(fb, x, y, r, g, b) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 3;
  fb[i] = r; fb[i + 1] = g; fb[i + 2] = b;
}
function blendPixel(fb, x, y, r, g, b, alpha) {
  if (alpha <= 0 || x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 3;
  fb[i]     = fb[i]     * (1 - alpha) + r * alpha;
  fb[i + 1] = fb[i + 1] * (1 - alpha) + g * alpha;
  fb[i + 2] = fb[i + 2] * (1 - alpha) + b * alpha;
}

function fillHGradient(fb, y0, y1, topHex, bottomHex) {
  const top    = hexToRgb(topHex);
  const bottom = hexToRgb(bottomHex);
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1);
    const r = mix(top[0], bottom[0], t);
    const g = mix(top[1], bottom[1], t);
    const b = mix(top[2], bottom[2], t);
    for (let x = 0; x < WIDTH; x++) setPixel(fb, x, y, r, g, b);
  }
}

function fillQuad(fb, v0, v1, v2, v3, hex) {
  const color = hexToRgb(hex);
  const edges = [[v0, v1], [v1, v2], [v2, v3], [v3, v0]];
  const ys = [v0, v1, v2, v3].map(v => v[1]);
  const yMin = Math.max(0,      Math.floor(Math.min(...ys)));
  const yMax = Math.min(HEIGHT, Math.ceil(Math.max(...ys)));
  for (let y = yMin; y < yMax; y++) {
    const xs = [];
    for (const [a, b] of edges) {
      const ay = a[1], by = b[1];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(a[0] + ((y - ay) / (by - ay)) * (b[0] - a[0]));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let x = Math.max(0, Math.round(xs[0])); x < Math.min(WIDTH, Math.round(xs[xs.length - 1])); x++) {
      setPixel(fb, x, y, color[0], color[1], color[2]);
    }
  }
}

function paintVignette(fb, strength = 0.55) {
  const vignette = [0.02, 0.03, 0.04];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dx = (x / WIDTH  - 0.5) * 2;
      const dy = (y / HEIGHT - 0.5) * 2;
      const d  = Math.sqrt(dx * dx + dy * dy);
      blendPixel(fb, x, y, vignette[0], vignette[1], vignette[2], smoothstep(0.55, 1.3, d) * strength);
    }
  }
}

function paintWallsAndFloor(fb, { skyTop, skyBottom, floorFar, floorNear, wallMain, wallDark, tierColor, fogColor, fogStrength = 0.45 }) {
  const HORIZON_Y = Math.floor(HEIGHT * 0.42);

  // Sky
  fillHGradient(fb, 0, HORIZON_Y, skyTop, skyBottom);
  // Floor
  for (let y = HORIZON_Y; y < HEIGHT; y++) {
    const t = Math.pow((y - HORIZON_Y) / (HEIGHT - HORIZON_Y), 0.55);
    const fn = hexToRgb(floorNear);
    const ff = hexToRgb(floorFar);
    const r = mix(ff[0], fn[0], t), g = mix(ff[1], fn[1], t), b = mix(ff[2], fn[2], t);
    for (let x = 0; x < WIDTH; x++) setPixel(fb, x, y, r, g, b);
  }
  // Fog band
  const fog = hexToRgb(fogColor);
  for (let dy = -30; dy <= 30; dy++) {
    const fy = HORIZON_Y + dy;
    const s  = fogStrength * (1 - Math.abs(dy) / 30);
    for (let x = 0; x < WIDTH; x++) blendPixel(fb, x, fy, fog[0], fog[1], fog[2], s);
  }
  // Back walls — 5 segments
  const wallTopY = HORIZON_Y - 110;
  const wallBottomY = HORIZON_Y + 2;
  for (const seg of [
    { x0: 10,  x1: 148, c: wallDark  },
    { x0: 148, x1: 310, c: wallMain  },
    { x0: 310, x1: 490, c: wallMain  },
    { x0: 490, x1: 652, c: wallMain  },
    { x0: 652, x1: 790, c: wallDark  },
  ]) {
    fillQuad(fb, [seg.x0 + 6, wallTopY], [seg.x1 - 6, wallTopY], [seg.x1, wallBottomY], [seg.x0, wallBottomY], seg.c);
  }
  // Side walls
  fillQuad(fb, [0, HORIZON_Y - 80], [50, HORIZON_Y - 80], [80, HORIZON_Y + 2], [0, HORIZON_Y + 2], wallDark);
  fillQuad(fb, [750, HORIZON_Y - 80], [WIDTH, HORIZON_Y - 80], [WIDTH, HORIZON_Y + 2], [720, HORIZON_Y + 2], wallDark);
  // Tier strips
  const tier1Y = HORIZON_Y + 25, tier2Y = HORIZON_Y + 48, tier3Y = tier2Y + 30;
  const tc = hexToRgb(tierColor);
  for (let y = tier1Y; y < tier2Y; y++) {
    const t = (y - tier1Y) / (tier2Y - tier1Y);
    const xPad = Math.floor(mix(60, 40, t));
    const shade = 0.7 + 0.3 * (1 - t);
    for (let x = xPad; x < WIDTH - xPad; x++) setPixel(fb, x, y, tc[0] * shade, tc[1] * shade, tc[2] * shade);
  }
  for (let y = tier2Y; y < tier3Y; y++) {
    const t = (y - tier2Y) / (tier3Y - tier2Y);
    const xPad = Math.floor(mix(40, 20, t));
    const shade = 0.6 + 0.3 * (1 - t);
    for (let x = xPad; x < WIDTH - xPad; x++) setPixel(fb, x, y, tc[0] * shade, tc[1] * shade, tc[2] * shade);
  }
}

// ── PNG encoder ───────────────────────────────────────────────────────────────

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
  const tb = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}
function encodePng(fb) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let p = 0; p < WIDTH * HEIGHT; p++) {
    for (let c = 0; c < 3; c++) {
      pixels[p * 4 + c] = Math.round(clamp01(fb[p * 3 + c] + (Math.random() - 0.5) / 255) * 255);
    }
    pixels[p * 4 + 3] = 255;
  }
  const stride = WIDTH * 4;
  const raw = Buffer.alloc(HEIGHT * (stride + 1));
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0); ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; ihdr[9] = 6; // truecolour + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Skin palette definitions ──────────────────────────────────────────────────

const SKINS = [
  {
    slug: "mars-surface",
    palette: {
      skyTop:      "#c8865a",
      skyBottom:   "#e0a070",
      floorFar:    "#b86838",
      floorNear:   "#7a3c14",
      wallMain:    "#c07038",
      wallDark:    "#8a4820",
      tierColor:   "#ae6030",
      fogColor:    "#b87050",
      fogStrength:  0.45,
    },
  },
  {
    slug: "cell-interior",
    palette: {
      skyTop:      "#0a1a2e",
      skyBottom:   "#0d2540",
      floorFar:    "#0a3050",
      floorNear:   "#062040",
      wallMain:    "#0e4060",
      wallDark:    "#082838",
      tierColor:   "#0c3858",
      fogColor:    "#1a6080",
      fogStrength:  0.35,
    },
  },
  {
    slug: "roman-forum",
    palette: {
      skyTop:      "#8ab0d8",
      skyBottom:   "#b8cce8",
      floorFar:    "#c8b890",
      floorNear:   "#a89870",
      wallMain:    "#d4c8a0",
      wallDark:    "#a89870",
      tierColor:   "#c0b088",
      fogColor:    "#d0c8b0",
      fogStrength:  0.25,
    },
  },
  {
    slug: "rainforest-canopy",
    palette: {
      skyTop:      "#0a2010",
      skyBottom:   "#103018",
      floorFar:    "#284820",
      floorNear:   "#1a3014",
      wallMain:    "#2c5022",
      wallDark:    "#182c10",
      tierColor:   "#244018",
      fogColor:    "#306828",
      fogStrength:  0.40,
    },
  },
  {
    slug: "art-studio",
    palette: {
      skyTop:      "#e8e0d4",
      skyBottom:   "#f0e8dc",
      floorFar:    "#d4c8b4",
      floorNear:   "#c0b09c",
      wallMain:    "#e0d8cc",
      wallDark:    "#c8c0b0",
      tierColor:   "#d0c4b0",
      fogColor:    "#e8e0d8",
      fogStrength:  0.15,
    },
  },
];

// ── Render and write all thumbnails ──────────────────────────────────────────

const outDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/web/public/world-skins/thumbnails",
);
mkdirSync(outDir, { recursive: true });

for (const skin of SKINS) {
  const fb = makeFramebuffer();
  paintWallsAndFloor(fb, skin.palette);
  paintVignette(fb);
  const outputPath = resolve(outDir, `${skin.slug}.png`);
  writeFileSync(outputPath, encodePng(fb));
  console.log(`Wrote ${WIDTH}×${HEIGHT} thumbnail → ${outputPath}`);
}
