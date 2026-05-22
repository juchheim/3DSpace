/**
 * Generates the Mars Surface world skin thumbnail (800×500).
 *
 * Dependency-free software renderer producing a stylised top-third-angle view
 * of the theater under the Mars sky: pale dust sky fading to the ochre floor,
 * with back-wall silhouettes in rust-orange.
 *
 * This is a placeholder thumbnail for Phase 0 sign-off. The canonical thumbnail
 * for the Phase 2 catalog is captured from the dev harness at
 * /dev/world-skin-hero using the browser's WebGL canvas.
 *
 * Run: node packages/world-skins/scripts/render-skin-thumbnail.mjs
 */

import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH  = 800;
const HEIGHT = 500;

// ── Color palette (matches MarsSkin.tsx) ─────────────────────────────────────

const SKY_TOP    = "#c8865a";   // pale salmon haze
const SKY_BOTTOM = "#e0a070";   // warm horizon glow
const FLOOR_FAR  = "#b86838";   // regolith near horizon
const FLOOR_NEAR = "#7a3c14";   // darker regolith in foreground
const FOG_COLOR  = "#b87050";   // dust haze
const WALL_COLOR = "#c07038";   // ochre back wall
const WALL_DARK  = "#8a4820";   // shadow side of walls
const TIER_COLOR = "#ae6030";   // tier platform faces

// ── Maths helpers ────────────────────────────────────────────────────────────

const framebuffer = new Float64Array(WIDTH * HEIGHT * 3);

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

function setPixel(x, y, r, g, b) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 3;
  framebuffer[i]     = r;
  framebuffer[i + 1] = g;
  framebuffer[i + 2] = b;
}

function blendPixel(x, y, r, g, b, alpha) {
  if (alpha <= 0 || x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 3;
  framebuffer[i]     = framebuffer[i]     * (1 - alpha) + r * alpha;
  framebuffer[i + 1] = framebuffer[i + 1] * (1 - alpha) + g * alpha;
  framebuffer[i + 2] = framebuffer[i + 2] * (1 - alpha) + b * alpha;
}

// ── Scene layers ──────────────────────────────────────────────────────────────

// Horizon line in image space
const HORIZON_Y = Math.floor(HEIGHT * 0.42);

function paintSky() {
  const top    = hexToRgb(SKY_TOP);
  const bottom = hexToRgb(SKY_BOTTOM);
  for (let y = 0; y < HORIZON_Y; y++) {
    const t = y / (HORIZON_Y - 1);
    const r = mix(top[0], bottom[0], t);
    const g = mix(top[1], bottom[1], t);
    const b = mix(top[2], bottom[2], t);
    for (let x = 0; x < WIDTH; x++) setPixel(x, y, r, g, b);
  }
}

function paintFloor() {
  const near = hexToRgb(FLOOR_NEAR);
  const far  = hexToRgb(FLOOR_FAR);
  for (let y = HORIZON_Y; y < HEIGHT; y++) {
    // t=0 at horizon, t=1 at bottom — perspective foreshortening
    const t = Math.pow((y - HORIZON_Y) / (HEIGHT - HORIZON_Y), 0.55);
    const r = mix(far[0], near[0], t);
    const g = mix(far[1], near[1], t);
    const b = mix(far[2], near[2], t);
    for (let x = 0; x < WIDTH; x++) setPixel(x, y, r, g, b);
  }
}

function paintFogBand() {
  const fog = hexToRgb(FOG_COLOR);
  // Dust haze near the horizon: blend fog over a ~60px band centred on HORIZON_Y
  const bandHalf = 30;
  for (let dy = -bandHalf; dy <= bandHalf; dy++) {
    const y = HORIZON_Y + dy;
    const strength = 0.55 * (1 - Math.abs(dy) / bandHalf);
    for (let x = 0; x < WIDTH; x++) blendPixel(x, y, fog[0], fog[1], fog[2], strength);
  }
}

/**
 * Paints a filled quadrilateral by scanline.
 * Vertices must be ordered: [topLeft, topRight, bottomRight, bottomLeft].
 */
function fillQuad(v0, v1, v2, v3, hex) {
  const color = hexToRgb(hex);
  // Find y range
  const ys = [v0, v1, v2, v3].map(v => v[1]);
  const yMin = Math.max(0,      Math.floor(Math.min(...ys)));
  const yMax = Math.min(HEIGHT, Math.ceil(Math.max(...ys)));

  // Edges: v0→v3, v1→v2 (left and right sides, sorted by y)
  const edges = [[v0, v1], [v1, v2], [v2, v3], [v3, v0]];

  for (let y = yMin; y < yMax; y++) {
    // Find x intersections with all edges at this scanline
    const xs = [];
    for (const [a, b] of edges) {
      const ay = a[1], by = b[1];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        const t = (y - ay) / (by - ay);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const xStart = Math.max(0,     Math.round(xs[0]));
    const xEnd   = Math.min(WIDTH, Math.round(xs[xs.length - 1]));
    for (let x = xStart; x < xEnd; x++) setPixel(x, y, color[0], color[1], color[2]);
  }
}

function paintWalls() {
  // Back wall spans image width, sits just above the horizon
  // Perspective foreshortening: wall height depends on depth
  const wallTopY    = HORIZON_Y - 110;
  const wallBottomY = HORIZON_Y + 2;

  // Five back-wall segments, distributed across image width
  const wallSegs = [
    { x0: 10,  x1: 148, shade: WALL_DARK  },  // wall-back-lo (far left outer)
    { x0: 148, x1: 310, shade: WALL_COLOR },   // wall-back-li
    { x0: 310, x1: 490, shade: WALL_COLOR },   // wall-back-c  (center)
    { x0: 490, x1: 652, shade: WALL_COLOR },   // wall-back-ri
    { x0: 652, x1: 790, shade: WALL_DARK  },   // wall-back-ro (far right outer)
  ];

  for (const seg of wallSegs) {
    // Slight perspective taper: outer segments are slightly narrower at top
    const taper = 6;
    fillQuad(
      [seg.x0 + taper, wallTopY],
      [seg.x1 - taper, wallTopY],
      [seg.x1,         wallBottomY],
      [seg.x0,         wallBottomY],
      seg.shade,
    );
  }

  // Left and right side walls (perspective view)
  fillQuad(
    [0,   HORIZON_Y - 80],
    [50,  HORIZON_Y - 80],
    [80,  HORIZON_Y + 2],
    [0,   HORIZON_Y + 2],
    WALL_DARK,
  );
  fillQuad(
    [750, HORIZON_Y - 80],
    [WIDTH, HORIZON_Y - 80],
    [WIDTH, HORIZON_Y + 2],
    [720, HORIZON_Y + 2],
    WALL_DARK,
  );
}

function paintTiers() {
  // Tier platform faces visible between horizon and floor foreground
  const tier1Y = HORIZON_Y + 25;
  const tier2Y = HORIZON_Y + 48;

  // Tier 2 (back row, higher) — narrow strip
  for (let y = tier1Y; y < tier2Y; y++) {
    const t = (y - tier1Y) / (tier2Y - tier1Y);
    const xPad = Math.floor(mix(60, 40, t));
    const color = hexToRgb(TIER_COLOR);
    const shade = 0.7 + 0.3 * (1 - t);
    for (let x = xPad; x < WIDTH - xPad; x++) {
      setPixel(x, y, color[0] * shade, color[1] * shade, color[2] * shade);
    }
  }

  // Tier 1 (mid row) — wider strip below
  const tier3Y = tier2Y + 30;
  for (let y = tier2Y; y < tier3Y; y++) {
    const t = (y - tier2Y) / (tier3Y - tier2Y);
    const xPad = Math.floor(mix(40, 20, t));
    const color = hexToRgb(TIER_COLOR);
    const shade = 0.6 + 0.3 * (1 - t);
    for (let x = xPad; x < WIDTH - xPad; x++) {
      setPixel(x, y, color[0] * shade, color[1] * shade, color[2] * shade);
    }
  }
}

function paintDustParticles() {
  // Scatter a few bright dust motes for atmosphere
  const rng = { state: 0x12345678 };
  function rand() {
    rng.state ^= rng.state << 13;
    rng.state ^= rng.state >> 17;
    rng.state ^= rng.state << 5;
    return ((rng.state >>> 0) / 0xffffffff);
  }
  const dustColor = hexToRgb("#dda070");
  for (let i = 0; i < 120; i++) {
    const x = Math.floor(rand() * WIDTH);
    const y = Math.floor(HORIZON_Y * 0.2 + rand() * HORIZON_Y * 0.9);
    const r = rand();
    const alpha = r * 0.3;
    blendPixel(x, y, dustColor[0], dustColor[1], dustColor[2], alpha);
  }
}

function paintVignette() {
  const vignette = hexToRgb("#050709");
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dx = (x / WIDTH  - 0.5) * 2;
      const dy = (y / HEIGHT - 0.5) * 2;
      const d  = Math.sqrt(dx * dx + dy * dy);
      const strength = smoothstep(0.55, 1.3, d) * 0.55;
      blendPixel(x, y, vignette[0], vignette[1], vignette[2], strength);
    }
  }
}

function render() {
  paintSky();
  paintFloor();
  paintWalls();
  paintTiers();
  paintFogBand();
  paintDustParticles();
  paintVignette();
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
      const value = clamp01(framebuffer[p * 3 + c] + (Math.random() - 0.5) / 255);
      pixels[p * 4 + c] = Math.round(value * 255);
    }
    pixels[p * 4 + 3] = 255;
  }

  const stride = WIDTH * 4;
  const raw = Buffer.alloc(HEIGHT * (stride + 1));
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH,  0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // truecolour + alpha

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
  "../../../apps/web/public/world-skins/thumbnails/mars-surface.png",
);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, encodePng());
console.log(`Wrote ${WIDTH}×${HEIGHT} thumbnail → ${outputPath}`);
