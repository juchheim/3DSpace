// Prepare classroom-simple.glb for World Builder (Scenes tab):
//   - Shift geometry down so the floor sits at y=0 (matches other World Builder GLBs)
//   - Downscale textures to max 2048 px (room-object limit)
//   - PNG / oversized JPEG → JPEG q85
//   - Prune unused nodes/data
//
// When shipping a new scene, also add it to worldAssetCatalog.ts with
//   category: "scene" and staticCollider: true
// so Rapier builds a walkable trimesh from this GLB (see worldAssetColliderMesh.ts).
//
// Run:  node scripts/prepare-classroom-simple-glb.mjs [in.glb] [out.glb]
// Default: GLBs/classroom-simple.glb → apps/web/public/objects/classroom-simple.glb

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_IN = resolve(__dirname, "../GLBs/classroom-simple.glb");
const DEFAULT_OUT = resolve(__dirname, "../apps/web/public/objects/classroom-simple.glb");

const IN_PATH = resolve(process.argv[2] ?? DEFAULT_IN);
const OUT_PATH = resolve(process.argv[3] ?? DEFAULT_OUT);
const MAX_TEXTURE_DIMENSION = 2048;

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
  const meta = await sharp(Buffer.from(src)).metadata();
  let pipeline = sharp(Buffer.from(src));
  const needsDownscale =
    (meta.width ?? 0) > MAX_TEXTURE_DIMENSION || (meta.height ?? 0) > MAX_TEXTURE_DIMENSION;
  if (needsDownscale) {
    pipeline = pipeline.resize(MAX_TEXTURE_DIMENSION, MAX_TEXTURE_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true
    });
  }

  if (kind === "baseColor" || kind === "emissive" || kind === "normal") {
    const jpeg = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    texture.setImage(jpeg);
    texture.setMimeType("image/jpeg");
    const notes = [];
    if (needsDownscale) notes.push(`downscale→${MAX_TEXTURE_DIMENSION}`);
    notes.push(mime.includes("png") ? "PNG→JPEG" : mime.includes("webp") ? "WebP→JPEG" : "JPEG q85");
    return { kind, before, after: jpeg.byteLength, note: notes.join(", ") };
  }

  if (mime === "image/png") {
    const jpeg = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    texture.setImage(jpeg);
    texture.setMimeType("image/jpeg");
    const note = needsDownscale
      ? `downscale→${MAX_TEXTURE_DIMENSION}, PNG→JPEG (unnamed)`
      : "PNG→JPEG (unnamed)";
    return { kind: "pngFallback", before, after: jpeg.byteLength, note };
  }

  if (mime === "image/jpeg") {
    const jpeg = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    texture.setImage(jpeg);
    texture.setMimeType("image/jpeg");
    const note = needsDownscale ? `downscale→${MAX_TEXTURE_DIMENSION}, JPEG q85` : "JPEG q85";
    return { kind: "jpegReencode", before, after: jpeg.byteLength, note };
  }

  return { kind, before, after: before, skipped: true, reason: "unrecognized" };
}

/** Translate geometry so the lowest vertex sits at y=0 (room floor at placement). */
function normalizeMeshGroundY(doc) {
  let minY = Infinity;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION")?.getArray();
      if (!pos) continue;
      for (let i = 1; i < pos.length; i += 3) {
        minY = Math.min(minY, pos[i]);
      }
    }
  }

  if (!Number.isFinite(minY) || Math.abs(minY) < 1e-6) {
    return { offsetY: 0 };
  }

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute("POSITION");
      if (!position) continue;
      const pos = Float32Array.from(position.getArray());
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] -= minY;
      }
      prim.setAttribute(
        "POSITION",
        doc
          .createAccessor()
          .setType("VEC3")
          .setArray(pos)
      );
    }
  }

  return { offsetY: minY };
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const beforeBytes = (await readFile(IN_PATH)).byteLength;
  const doc = await io.read(IN_PATH);
  const root = doc.getRoot();

  const { offsetY } = normalizeMeshGroundY(doc);
  if (Math.abs(offsetY) > 1e-6) {
    console.log(`Normalized ground: lowered scene by ${offsetY.toFixed(3)} m so floor sits at y=0`);
  }

  const textureRoles = buildTextureRoleMap(root);
  const results = [];
  for (const texture of root.listTextures()) {
    const kind = resolveTextureKind(texture, textureRoles);
    results.push({ name: texture.getName(), kind, ...(await reencodeTexture(texture, kind)) });
  }

  await doc.transform(prune());

  await mkdir(dirname(OUT_PATH), { recursive: true });
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
