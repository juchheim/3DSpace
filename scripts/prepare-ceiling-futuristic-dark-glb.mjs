// Prepare ceiling-futuristic-dark.glb for World Builder:
//   - Base-color PNGs → JPEG q85 (normals stay PNG)
//   - Rotate -90° around X so the panel lies flat (XZ) like other ceiling pieces
//
// Run:
//   node scripts/prepare-ceiling-futuristic-dark-glb.mjs
//   node scripts/prepare-ceiling-futuristic-dark-glb.mjs [in.glb] [out.glb]

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_IN = resolve(__dirname, "../GLBs/ceiling-futuristic-dark.glb");
const DEFAULT_OUT = resolve(__dirname, "../apps/web/public/objects/ceiling-futuristic-dark.glb");

const IN_PATH = resolve(process.argv[2] ?? DEFAULT_IN);
const OUT_PATH = resolve(process.argv[3] ?? DEFAULT_OUT);

const BASE_COLOR_NAMES = new Set(["baked_basecolor", "basecolor", "diffuse", "albedo", "image_0"]);
const NORMAL_NAMES = new Set(["normal"]);

function textureKindFromName(name) {
  const key = (name ?? "").trim().toLowerCase();
  if (BASE_COLOR_NAMES.has(key)) return "baseColor";
  if (NORMAL_NAMES.has(key)) return "normal";
  if (key.includes("base") && key.includes("color")) return "baseColor";
  if (key.includes("normal")) return "normal";
  return "other";
}

function buildTextureRoleMap(root) {
  const roles = new Map();
  for (const material of root.listMaterials()) {
    const baseColor = material.getBaseColorTexture();
    if (baseColor) roles.set(baseColor, "baseColor");
    const emissive = material.getEmissiveTexture();
    if (emissive) roles.set(emissive, "emissive");
    const normal = material.getNormalTexture();
    if (normal) roles.set(normal, "normal");
  }
  return roles;
}

function resolveTextureKind(texture, roles) {
  return roles.get(texture) ?? textureKindFromName(texture.getName());
}

async function reencodeTexture(texture, kind) {
  const src = texture.getImage();
  if (!src || src.byteLength === 0) return { skipped: true, reason: "empty" };

  const before = src.byteLength;
  const mime = texture.getMimeType() ?? "";

  if (kind === "baseColor" || kind === "emissive") {
    const jpeg = await sharp(Buffer.from(src))
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    texture.setImage(jpeg);
    texture.setMimeType("image/jpeg");
    const note = mime.includes("png") ? "PNG→JPEG" : mime.includes("webp") ? "WebP→JPEG" : "JPEG q85";
    return { kind, before, after: jpeg.byteLength, note };
  }

  if (kind === "normal") {
    const png = await sharp(Buffer.from(src))
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    if (png.byteLength < before) {
      texture.setImage(png);
      texture.setMimeType("image/png");
      return { kind, before, after: png.byteLength, note: "recompressed PNG" };
    }
    return { kind, before, after: before, note: "kept original PNG" };
  }

  if (mime === "image/png") {
    const jpeg = await sharp(Buffer.from(src))
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    texture.setImage(jpeg);
    texture.setMimeType("image/jpeg");
    return { kind: "pngFallback", before, after: jpeg.byteLength, note: "PNG→JPEG (unnamed)" };
  }

  if (mime === "image/jpeg") {
    const jpeg = await sharp(Buffer.from(src))
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    if (jpeg.byteLength < before) {
      texture.setImage(jpeg);
      texture.setMimeType("image/jpeg");
      return { kind: "jpegReencode", before, after: jpeg.byteLength, note: "JPEG q85" };
    }
    return { kind, before, after: before, skipped: true, reason: "already compact" };
  }

  return { kind, before, after: before, skipped: true, reason: "unrecognized" };
}

/** Lay the panel flat: source mesh spans XY with thin Z; ceiling pieces span XZ with thin Y. */
function layFlatForCeiling(root) {
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) return;

  const half = -Math.PI / 4;
  const rotation = [Math.sin(half), 0, 0, Math.cos(half)];

  for (const node of scene.listChildren()) {
    node.setRotation(rotation);
    return;
  }

  const node = root.listNodes()[0];
  if (node) node.setRotation(rotation);
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const beforeBytes = (await readFile(IN_PATH)).byteLength;
  const doc = await io.read(IN_PATH);
  const root = doc.getRoot();

  const textureRoles = buildTextureRoleMap(root);
  const results = [];
  for (const texture of root.listTextures()) {
    const kind = resolveTextureKind(texture, textureRoles);
    results.push({ name: texture.getName(), kind, ...(await reencodeTexture(texture, kind)) });
  }

  layFlatForCeiling(root);
  await doc.transform(prune());

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
