// Prepare tree.glb for World Builder:
//   - Convert PNG textures (including normals) to JPEG q85
//   - Prune unused nodes/data
//
// Run:  node scripts/prepare-tree-glb.mjs [in.glb] [out.glb]
// Default: GLBs/tree.glb → apps/web/public/objects/tree.glb

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_IN = resolve(__dirname, "../GLBs/tree.glb");
const DEFAULT_OUT = resolve(__dirname, "../apps/web/public/objects/tree.glb");

const IN_PATH = resolve(process.argv[2] ?? DEFAULT_IN);
const OUT_PATH = resolve(process.argv[3] ?? DEFAULT_OUT);

const BASE_COLOR_NAMES = new Set(["baked_basecolor", "basecolor", "diffuse", "albedo", "image_0", "image_1", "image_3"]);
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

  if (kind === "baseColor" || kind === "emissive" || kind === "normal") {
    const jpeg = await sharp(Buffer.from(src)).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    texture.setImage(jpeg);
    texture.setMimeType("image/jpeg");
    const note = mime.includes("png") ? "PNG→JPEG" : mime.includes("webp") ? "WebP→JPEG" : "JPEG q85";
    return { kind, before, after: jpeg.byteLength, note };
  }

  if (mime === "image/png") {
    const jpeg = await sharp(Buffer.from(src)).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    texture.setImage(jpeg);
    texture.setMimeType("image/jpeg");
    return { kind: "pngFallback", before, after: jpeg.byteLength, note: "PNG→JPEG (unnamed)" };
  }

  if (mime === "image/jpeg") {
    const jpeg = await sharp(Buffer.from(src)).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    if (jpeg.byteLength < before) {
      texture.setImage(jpeg);
      texture.setMimeType("image/jpeg");
      return { kind: "jpegReencode", before, after: jpeg.byteLength, note: "JPEG q85" };
    }
    return { kind, before, after: before, skipped: true, reason: "already compact" };
  }

  return { kind, before, after: before, skipped: true, reason: "unrecognized" };
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
