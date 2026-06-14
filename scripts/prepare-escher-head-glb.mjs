// Prepare escher-head.glb for World Builder (Scenes tab):
//   - Crop neck geometry below the lowest staircase tread
//   - Shift geometry down so the floor sits at y=0
//   - Downscale textures to max 2048 px
//   - PNG/JPEG → grayscale JPEG q85
//   - Prune unused nodes/data
//
// When shipping a new scene, also add it to worldAssetCatalog.ts with
//   category: "scene" and staticCollider: true
//
// Run:  node scripts/prepare-escher-head-glb.mjs [in.glb] [out.glb] [cropY]
// Default: GLBs/escher-head.glb → apps/web/public/objects/escher-head.glb

import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_IN = resolve(__dirname, "../GLBs/escher-head.glb");
const DEFAULT_OUT = resolve(__dirname, "../apps/web/public/objects/escher-head.glb");

const IN_PATH = resolve(process.argv[2] ?? DEFAULT_IN);
const OUT_PATH = resolve(process.argv[3] ?? DEFAULT_OUT);
const CROP_Y_OVERRIDE = process.argv[4] ? Number(process.argv[4]) : null;
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
  let pipeline = sharp(Buffer.from(src)).grayscale();
  const needsDownscale =
    (meta.width ?? 0) > MAX_TEXTURE_DIMENSION || (meta.height ?? 0) > MAX_TEXTURE_DIMENSION;
  if (needsDownscale) {
    pipeline = pipeline.resize(MAX_TEXTURE_DIMENSION, MAX_TEXTURE_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true
    });
  }

  const notes = ["grayscale"];
  if (needsDownscale) notes.push(`downscale→${MAX_TEXTURE_DIMENSION}`);

  if (kind === "baseColor" || kind === "emissive" || kind === "normal" || mime === "image/png" || mime === "image/jpeg") {
    const jpeg = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    texture.setImage(jpeg);
    texture.setMimeType("image/jpeg");
    notes.push(mime.includes("png") ? "PNG→JPEG" : "JPEG q85");
    return { kind, before, after: jpeg.byteLength, note: notes.join(", ") };
  }

  return { kind, before, after: before, skipped: true, reason: "unrecognized" };
}

/** Lowest upward-facing tread Y (clustered stair levels, excludes the neck plinth). */
function detectLowestStairY(doc) {
  const levelCounts = new Map();

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute("POSITION");
      const indices = prim.getIndices();
      if (!position || !indices) continue;

      const pos = position.getArray();
      const idx = indices.getArray();

      for (let t = 0; t < idx.length / 3; t++) {
        const v = [0, 1, 2].map((k) => {
          const vi = idx[t * 3 + k];
          return [pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]];
        });
        const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
        const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
        const nx = e1[1] * e2[2] - e1[2] * e2[1];
        const ny = e1[2] * e2[0] - e1[0] * e2[2];
        const nz = e1[0] * e2[1] - e1[1] * e2[0];
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-8) continue;

        const normalY = ny / len;
        const cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
        const span = Math.max(
          Math.hypot(v[0][0] - v[1][0], v[0][2] - v[1][2]),
          Math.hypot(v[1][0] - v[2][0], v[1][2] - v[2][2]),
          Math.hypot(v[0][0] - v[2][0], v[0][2] - v[2][2])
        );

        if (normalY > 0.9 && cy > 0.5 && cy < 5 && span > 0.08) {
          const level = Math.round(cy * 50) / 50;
          levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
        }
      }
    }
  }

  const levels = [...levelCounts.entries()]
    .filter(([, count]) => count >= 5)
    .sort((a, b) => a[0] - b[0]);

  return levels[0]?.[0] ?? 1.35;
}

function rebuildPrimitive(doc, prim, pos, idx, keepTris) {
  const oldToNew = new Map();
  const newPos = [];
  const newNorm = [];
  const newUv = [];
  const normal = prim.getAttribute("NORMAL")?.getArray();
  const uv = prim.getAttribute("TEXCOORD_0")?.getArray();
  const newIdx = [];

  const mapVertex = (vi) => {
    if (oldToNew.has(vi)) return oldToNew.get(vi);
    const next = oldToNew.size;
    oldToNew.set(vi, next);
    newPos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
    if (normal) newNorm.push(normal[vi * 3], normal[vi * 3 + 1], normal[vi * 3 + 2]);
    if (uv) newUv.push(uv[vi * 2], uv[vi * 2 + 1]);
    return next;
  };

  for (const t of keepTris) {
    newIdx.push(mapVertex(idx[t * 3]), mapVertex(idx[t * 3 + 1]), mapVertex(idx[t * 3 + 2]));
  }

  const IndexArray = newIdx.some((i) => i > 65535) ? Uint32Array : Uint32Array;
  prim.setAttribute(
    "POSITION",
    doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array(newPos))
  );
  if (normal) {
    prim.setAttribute(
      "NORMAL",
      doc
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array(newNorm))
    );
  }
  if (uv) {
    prim.setAttribute(
      "TEXCOORD_0",
      doc
        .createAccessor()
        .setType("VEC2")
        .setArray(new Float32Array(newUv))
    );
  }
  prim.setIndices(
    doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(new IndexArray(newIdx))
  );
}

/** Remove neck geometry below the lowest staircase tread. */
function cropNeckBelowStairs(doc, cropY) {
  let removedTris = 0;

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute("POSITION");
      const indices = prim.getIndices();
      if (!position || !indices) continue;

      const pos = position.getArray();
      const idx = indices.getArray();
      const triCount = idx.length / 3;
      const keepTris = [];

      for (let t = 0; t < triCount; t++) {
        let maxY = -Infinity;
        for (let k = 0; k < 3; k++) {
          maxY = Math.max(maxY, pos[idx[t * 3 + k] * 3 + 1]);
        }
        if (maxY >= cropY - 0.005) {
          keepTris.push(t);
        } else {
          removedTris += 1;
        }
      }

      rebuildPrimitive(doc, prim, pos, idx, keepTris);
    }
  }

  return { removedTris, cropY };
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

  const cropY = CROP_Y_OVERRIDE ?? detectLowestStairY(doc);
  const { removedTris } = cropNeckBelowStairs(doc, cropY);
  console.log(`Cropped neck below y=${cropY.toFixed(3)}: removed ${removedTris} triangles`);

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
