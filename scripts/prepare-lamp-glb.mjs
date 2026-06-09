// Prepare lamp.glb for World Builder:
//   - Base-color PNGs → JPEG q85 (normals stay PNG)
//   - Split the single mesh into LampBase + LampShade nodes (Y threshold)
//
// Run:  node scripts/prepare-lamp-glb.mjs [in.glb] [out.glb]
// Default: GLBs/lamp.glb → apps/web/public/objects/lamp.glb

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_IN = resolve(__dirname, "../GLBs/lamp.glb");
const DEFAULT_OUT = resolve(__dirname, "../apps/web/public/objects/lamp.glb");

const IN_PATH = resolve(process.argv[2] ?? DEFAULT_IN);
const OUT_PATH = resolve(process.argv[3] ?? DEFAULT_OUT);

/** Shade fabric starts where the lampshade bell widens (~0.82 m in native space). */
const SHADE_Y_MIN = 0.82;

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
    return { kind, before, after: jpeg.byteLength, note: mime.includes("png") ? "PNG→JPEG" : "JPEG q85" };
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

  return { kind, before, after: before, skipped: true, reason: "unrecognized" };
}

function readAccessorArray(accessor) {
  if (!accessor) return null;
  return accessor.getArray();
}

function triangleCentroidY(positions, i0, i1, i2) {
  return (positions[i0 * 3 + 1] + positions[i1 * 3 + 1] + positions[i2 * 3 + 1]) / 3;
}

function splitPrimitive(document, primitive, thresholdY) {
  const positions = readAccessorArray(primitive.getAttribute("POSITION"));
  const indices = readAccessorArray(primitive.getIndices());
  if (!positions) throw new Error("Primitive missing POSITION");

  const triCount = indices ? indices.length / 3 : positions.length / 9;
  const baseTris = [];
  const shadeTris = [];

  for (let t = 0; t < triCount; t++) {
    const i0 = indices ? indices[t * 3] : t * 3;
    const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
    const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;
    const cy = triangleCentroidY(positions, i0, i1, i2);
    if (cy >= thresholdY) shadeTris.push(i0, i1, i2);
    else baseTris.push(i0, i1, i2);
  }

  const attributeNames = ["POSITION", "NORMAL", "TEXCOORD_0", "TANGENT"];
  const sourceAttributes = Object.fromEntries(
    attributeNames
      .map((name) => [name, primitive.getAttribute(name)])
      .filter(([, accessor]) => accessor)
  );

  const sharedBuffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();

  function buildPrimitive(triangles) {
    if (triangles.length === 0) return null;

    const prim = document.createPrimitive();
    const material = primitive.getMaterial();
    if (material) prim.setMaterial(material);

    const remap = new Map();
    const remappedAttributes = Object.fromEntries(
      Object.keys(sourceAttributes).map((name) => [name, []])
    );
    const remappedIndices = [];

    for (const oldIndex of triangles) {
      if (!remap.has(oldIndex)) {
        const newIndex = remappedAttributes.POSITION.length / 3;
        remap.set(oldIndex, newIndex);
        for (const [name, accessor] of Object.entries(sourceAttributes)) {
          const arr = accessor.getArray();
          const itemSize = name === "POSITION" || name === "NORMAL" || name === "TANGENT" ? 3 : 2;
          const start = oldIndex * itemSize;
          remappedAttributes[name].push(...arr.slice(start, start + itemSize));
        }
      }
      remappedIndices.push(remap.get(oldIndex));
    }

    for (const [name, values] of Object.entries(remappedAttributes)) {
      const accessor = document
        .createAccessor()
        .setType(name === "TEXCOORD_0" ? "VEC2" : "VEC3")
        .setArray(new Float32Array(values))
        .setBuffer(sharedBuffer);
      prim.setAttribute(name, accessor);
    }

    const indexAccessor = document
      .createAccessor()
      .setType("SCALAR")
      .setArray(new Uint32Array(remappedIndices))
      .setBuffer(sharedBuffer);
    prim.setIndices(indexAccessor);
    prim.setMode(primitive.getMode());
    return prim;
  }

  return {
    base: buildPrimitive(baseTris),
    shade: buildPrimitive(shadeTris)
  };
}

function splitLampMeshes(document) {
  const root = document.getRoot();
  const scene = root.listScenes()[0] ?? root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error("No scene in lamp.glb");

  const alreadySplit = scene.listChildren().some((child) => child.getName() === "LampBase");
  if (alreadySplit) {
    console.log("  mesh split: skipped (LampBase/LampShade already present)");
    return;
  }

  const sourceMesh =
    scene.listChildren().map((child) => child.getMesh()).find(Boolean) ?? root.listMeshes()[0];
  if (!sourceMesh) throw new Error("No mesh in lamp.glb");

  const sourcePrim = sourceMesh.listPrimitives()[0];
  if (!sourcePrim) throw new Error("No primitive in lamp.glb");

  const { base, shade } = splitPrimitive(document, sourcePrim, SHADE_Y_MIN);
  if (!base || !shade) throw new Error("Failed to split lamp mesh");

  const baseMesh = document.createMesh("LampBase").addPrimitive(base);
  const shadeMesh = document.createMesh("LampShade").addPrimitive(shade);

  const baseNode = document.createNode("LampBase").setMesh(baseMesh);
  const shadeNode = document.createNode("LampShade").setMesh(shadeMesh);

  scene.listChildren().forEach((child) => scene.removeChild(child));
  scene.addChild(baseNode);
  scene.addChild(shadeNode);
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

  splitLampMeshes(doc);

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
