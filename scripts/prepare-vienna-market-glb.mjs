// Prepare vienna-market.glb for World Builder (Scenes tab):
//   - Remove stray grounded pole near scene center
//   - Downscale textures to max 2048 px (room-object limit)
//   - PNG / oversized JPEG → JPEG q85 (including normals, per tree.glb convention)
//   - Prune unused nodes/data
//
// Run:  node scripts/prepare-vienna-market-glb.mjs [in.glb] [out.glb]
// Default: GLBs/vienna-market.glb → apps/web/public/objects/vienna-market.glb

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_IN = resolve(__dirname, "../GLBs/vienna-market.glb");
const DEFAULT_OUT = resolve(__dirname, "../apps/web/public/objects/vienna-market.glb");

const IN_PATH = resolve(process.argv[2] ?? DEFAULT_IN);
const OUT_PATH = resolve(process.argv[3] ?? DEFAULT_OUT);
const MAX_TEXTURE_DIMENSION = 2048;

/** Stray pole near scene center (authored artifact at ground level). */
const STRAY_STICK = {
  centerX: 0,
  centerZ: 2.75,
  radiusX: 1,
  radiusZ: 1,
  maxY: 2.2
};

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

function componentBounds(pos, idx, triIndices) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const t of triIndices) {
    for (let k = 0; k < 3; k++) {
      const vi = idx[t * 3 + k];
      const x = pos[vi * 3];
      const y = pos[vi * 3 + 1];
      const z = pos[vi * 3 + 2];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
  }
  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2
  };
}

function isStrayStickComponent(bounds) {
  return (
    bounds.minY < 0.5 &&
    bounds.maxY <= STRAY_STICK.maxY &&
    Math.abs(bounds.centerX - STRAY_STICK.centerX) < STRAY_STICK.radiusX &&
    Math.abs(bounds.centerZ - STRAY_STICK.centerZ) < STRAY_STICK.radiusZ
  );
}

/** Drop the grounded pole cluster split across many tiny mesh islands. */
function removeStrayStickGeometry(doc) {
  let removedTris = 0;
  let removedComponents = 0;

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute("POSITION");
      const indices = prim.getIndices();
      if (!position || !indices) continue;

      const pos = position.getArray();
      const idx = indices.getArray();
      const triCount = idx.length / 3;
      const vcount = pos.length / 3;

      const parent = new Array(vcount).fill(0).map((_, i) => i);
      const find = (a) => {
        while (parent[a] !== a) {
          parent[a] = parent[parent[a]];
          a = parent[a];
        }
        return a;
      };
      const union = (a, b) => {
        a = find(a);
        b = find(b);
        if (a !== b) parent[b] = a;
      };

      for (let t = 0; t < triCount; t++) {
        union(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
      }

      const compTris = new Map();
      for (let t = 0; t < triCount; t++) {
        const root = find(idx[t * 3]);
        if (!compTris.has(root)) compTris.set(root, []);
        compTris.get(root).push(t);
      }

      const keepTris = [];
      let removedFromPrim = 0;
      let removedFromPrimComponents = 0;
      for (const triIndices of compTris.values()) {
        const bounds = componentBounds(pos, idx, triIndices);
        if (isStrayStickComponent(bounds)) {
          removedFromPrim += triIndices.length;
          removedFromPrimComponents += 1;
          continue;
        }
        keepTris.push(...triIndices);
      }

      if (removedFromPrim === 0) continue;

      removedTris += removedFromPrim;
      removedComponents += removedFromPrimComponents;

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

      const IndexArray = newIdx.some((i) => i > 65535) ? Uint32Array : Uint16Array;
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
  }

  return { removedTris, removedComponents };
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const beforeBytes = (await readFile(IN_PATH)).byteLength;
  const doc = await io.read(IN_PATH);
  const root = doc.getRoot();

  const { removedTris, removedComponents } = removeStrayStickGeometry(doc);
  if (removedTris > 0) {
    console.log(`Removed stray stick: ${removedTris} triangles across ${removedComponents} mesh islands`);
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

  if (resolve(IN_PATH) !== resolve(OUT_PATH)) {
    await copyFile(OUT_PATH, IN_PATH);
  }

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
