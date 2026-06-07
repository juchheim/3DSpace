// Re-encode simple-bot.glb textures for a smaller file:
//   - Baked_BaseColor: PNG → JPEG (quality 85)
//   - normal: stays PNG (JPEG artifacts break normal maps), recompressed losslessly
//
// Run:  node scripts/optimize-simple-bot-glb.mjs [in.glb] [out.glb]
// Default in/out: GLBs/simple-bot.glb

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_PATH = resolve(__dirname, "../GLBs/simple-bot.glb");

const IN_PATH = resolve(process.argv[2] ?? DEFAULT_PATH);
const OUT_PATH = resolve(process.argv[3] ?? IN_PATH);

const BASE_COLOR_NAMES = new Set(["baked_basecolor", "basecolor", "diffuse", "albedo"]);
const NORMAL_NAMES = new Set(["normal"]);

function textureKind(name) {
  const key = (name ?? "").trim().toLowerCase();
  if (BASE_COLOR_NAMES.has(key)) return "baseColor";
  if (NORMAL_NAMES.has(key)) return "normal";
  if (key.includes("base") && key.includes("color")) return "baseColor";
  if (key.includes("normal")) return "normal";
  return "other";
}

async function reencodeTexture(texture) {
  const src = texture.getImage();
  if (!src || src.byteLength === 0) return { skipped: true, reason: "empty" };

  const kind = textureKind(texture.getName());
  const before = src.byteLength;

  if (kind === "baseColor") {
    const jpeg = await sharp(Buffer.from(src))
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    texture.setImage(jpeg);
    texture.setMimeType("image/jpeg");
    return { kind, before, after: jpeg.byteLength };
  }

  if (kind === "normal") {
    // Normals must stay PNG; only replace when recompression actually shrinks the blob.
    const png = await sharp(Buffer.from(src))
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    if (png.byteLength < before) {
      texture.setImage(png);
      texture.setMimeType("image/png");
      return { kind, before, after: png.byteLength, note: "recompressed PNG" };
    }
    return { kind, before, after: before, note: "kept original PNG (JPEG breaks normals)" };
  }

  return { kind, before, after: before, skipped: true, reason: "unrecognized name" };
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const beforeBytes = (await readFile(IN_PATH)).byteLength;
  const doc = await io.read(IN_PATH);
  const root = doc.getRoot();

  const results = [];
  for (const texture of root.listTextures()) {
    results.push({ name: texture.getName(), ...(await reencodeTexture(texture)) });
  }

  await io.write(OUT_PATH, doc);
  const afterBytes = (await readFile(OUT_PATH)).byteLength;

  console.log(`Wrote ${OUT_PATH}`);
  for (const row of results) {
    if (row.skipped) {
      console.log(`  ${row.name}: skipped (${row.reason})`);
      continue;
    }
    const pct = (((row.before - row.after) / row.before) * 100).toFixed(1);
    console.log(
      `  ${row.name} [${row.kind}]: ${(row.before / 1024 / 1024).toFixed(2)} MB → ${(row.after / 1024 / 1024).toFixed(2)} MB (−${pct}%)${row.note ? ` — ${row.note}` : ""}`
    );
  }
  console.log(
    `GLB total: ${(beforeBytes / 1024 / 1024).toFixed(2)} MB → ${(afterBytes / 1024 / 1024).toFixed(2)} MB (−${(((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(1)}%)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
