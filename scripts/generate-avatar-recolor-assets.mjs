import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_GLB_PATH = resolve(REPO_ROOT, "apps/web/public/avatars/azure-vanguard.glb");
const DEFAULT_NEUTRAL_PATH = resolve(REPO_ROOT, "apps/web/public/avatars/azure-vanguard-albedo-neutral.jpg");
const DEFAULT_MASK_PATH = resolve(REPO_ROOT, "apps/web/public/avatars/azure-vanguard-zone-mask.png");
const DEFAULT_UV_REFERENCE_PATH = resolve(REPO_ROOT, "GLBs/azure-vanguard/uv-reference.png");

const HEAD_BONES = new Set(["Head", "head_end", "headfront", "neck"]);
const TORSO_BONES = new Set(["Hips", "Spine", "Spine01", "Spine02"]);
const ARM_BONES = new Set([
  "LeftShoulder",
  "RightShoulder",
  "LeftArm",
  "RightArm",
  "LeftForeArm",
  "RightForeArm",
  "LeftHand",
  "RightHand",
]);
const LEG_BONES = new Set(["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]);
const FOOT_BONES = new Set(["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_GLB_PATH,
    output: null,
    extractBaseColor: null,
    albedoOnly: false,
    uvReference: false,
    zoneMask: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = resolve(REPO_ROOT, argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (arg === "--output") {
      args.output = resolve(REPO_ROOT, argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (arg === "--extract-base-color") {
      args.extractBaseColor = resolve(REPO_ROOT, argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (arg === "--albedo-only") {
      args.albedoOnly = true;
      continue;
    }
    if (arg === "--uv-reference") {
      args.uvReference = true;
      continue;
    }
    if (arg === "--zone-mask") {
      args.zoneMask = true;
      continue;
    }
  }

  if (!args.albedoOnly && !args.uvReference && !args.zoneMask && !args.extractBaseColor) {
    args.albedoOnly = true;
    args.uvReference = true;
    args.zoneMask = true;
  }

  return args;
}

async function ensureDir(path) {
  await mkdir(dirname(path), { recursive: true });
}

async function readAvatarDocument(glbPath) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  return io.read(glbPath);
}

function getAvatarTexture(doc) {
  const texture = doc.getRoot().listTextures()[0];
  if (!texture?.getImage()) {
    throw new Error("Azure Vanguard GLB is missing its base-color texture.");
  }
  return texture;
}

async function readBaseColorBuffer(inputPath) {
  if (extname(inputPath).toLowerCase() === ".glb") {
    const doc = await readAvatarDocument(inputPath);
    return Buffer.from(getAvatarTexture(doc).getImage());
  }
  return sharp(inputPath).toBuffer();
}

function buildVertexClasses(joints, weights) {
  const out = new Uint8Array(joints.length / 4);
  for (let vertexIndex = 0; vertexIndex < out.length; vertexIndex += 1) {
    let bestWeight = -1;
    let bestJoint = 0;
    for (let influence = 0; influence < 4; influence += 1) {
      const weight = weights[vertexIndex * 4 + influence] ?? 0;
      if (weight > bestWeight) {
        bestWeight = weight;
        bestJoint = joints[vertexIndex * 4 + influence] ?? 0;
      }
    }
    out[vertexIndex] = bestJoint;
  }
  return out;
}

function edge(ax, ay, bx, by, cx, cy) {
  return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
}

function luminance([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isSkin(color) {
  const [r, g, b] = color;
  return r > 82 && r > g + 8 && g > b && b < 150 && luminance(color) > 55;
}

// Geometry-first zone classification. Each triangle is classified once at its
// centroid from the dominant skin bone plus position/normal, so neighbouring
// triangles in the same body region resolve to the same zone instead of being
// scattered by per-texel noise in the baked albedo. Texture colour is only
// consulted to separate bare skin (face / hands) from clothing.
function classifyZone({ boneName, y, z, nx, ny, nz, color }) {
  if (HEAD_BONES.has(boneName)) {
    if (isSkin(color) && nz > 0.2 && z > 0) return y < 1.46 ? 6 : 5;
    if (y > 1.56 || ny > 0.5) return 1;
    if (z < -0.01) return 4;
    if (Math.abs(nx) > 0.5) return 3;
    return 2;
  }

  if (TORSO_BONES.has(boneName)) {
    if (y > 1.27 && z > 0 && nz > 0.2) return 7;
    if (y > 1.18 || ny > 0.55) return 12;
    if (Math.abs(nx) > 0.6) return 11;
    if (z < -0.02) return 10;
    return y > 0.98 ? 8 : 9;
  }

  if (ARM_BONES.has(boneName)) {
    if (boneName.endsWith("Hand") || isSkin(color)) return 15;
    if (boneName.includes("Shoulder")) return 13;
    return 14;
  }

  if (LEG_BONES.has(boneName)) {
    if (z < -0.02) return 19;
    if (Math.abs(nx) > 0.55) return 18;
    return y > 0.5 ? 16 : 17;
  }

  if (FOOT_BONES.has(boneName)) {
    if (y < 0.025 || ny < -0.4) return 23;
    if (z > 0.06 || boneName.includes("ToeBase")) return 21;
    if (ny > 0.4) return 20;
    return 22;
  }

  return 0;
}

// Close 1px seams between adjacent UV islands so runtime nearest-filter
// sampling never lands on an unwritten (zone 0) texel along a triangle edge.
function dilateMask(mask, width, height, iterations) {
  for (let iter = 0; iter < iterations; iter += 1) {
    const src = mask.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 3;
        if (src[offset] !== 0) continue;
        const neighbours = [
          x > 0 ? (y * width + x - 1) * 3 : -1,
          x < width - 1 ? (y * width + x + 1) * 3 : -1,
          y > 0 ? ((y - 1) * width + x) * 3 : -1,
          y < height - 1 ? ((y + 1) * width + x) * 3 : -1,
        ];
        for (const neighbour of neighbours) {
          if (neighbour >= 0 && src[neighbour] !== 0) {
            mask[offset] = src[neighbour];
            mask[offset + 1] = src[neighbour];
            mask[offset + 2] = src[neighbour];
            break;
          }
        }
      }
    }
  }
}

async function generateNeutralAlbedo(inputPath, outputPath) {
  const baseColorBuffer = await readBaseColorBuffer(inputPath);
  const neutralBuffer = await sharp(baseColorBuffer)
    .grayscale()
    .linear(1.04, -4)
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  await ensureDir(outputPath);
  await writeFile(outputPath, neutralBuffer);
  return outputPath;
}

async function generateUvReference(glbPath, outputPath) {
  const doc = await readAvatarDocument(glbPath);
  const textureMeta = await sharp(Buffer.from(getAvatarTexture(doc).getImage())).metadata();
  const size = textureMeta.width ?? 2048;
  const image = new Uint8ClampedArray(size * size * 4).fill(255);
  const primitive = doc.getRoot().listMeshes()[0]?.listPrimitives()[0];
  if (!primitive) throw new Error("Azure Vanguard GLB mesh is missing.");
  const uv = primitive.getAttribute("TEXCOORD_0")?.getArray();
  const indices = primitive.getIndices()?.getArray();
  if (!uv || !indices) throw new Error("Azure Vanguard GLB is missing UV or index data.");

  const drawPixel = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    image[offset] = 20;
    image[offset + 1] = 20;
    image[offset + 2] = 20;
    image[offset + 3] = 255;
  };

  const drawLine = (x0, y0, x1, y1) => {
    let dx = Math.abs(x1 - x0);
    let sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0);
    let sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    let x = x0;
    let y = y0;
    while (true) {
      drawPixel(x, y);
      if (x === x1 && y === y1) break;
      const nextError = error * 2;
      if (nextError >= dy) {
        error += dy;
        x += sx;
      }
      if (nextError <= dx) {
        error += dx;
        y += sy;
      }
    }
  };

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] ?? 0;
    const ib = indices[i + 1] ?? 0;
    const ic = indices[i + 2] ?? 0;
    const ax = Math.round((uv[ia * 2] ?? 0) * (size - 1));
    const ay = Math.round((uv[ia * 2 + 1] ?? 0) * (size - 1));
    const bx = Math.round((uv[ib * 2] ?? 0) * (size - 1));
    const by = Math.round((uv[ib * 2 + 1] ?? 0) * (size - 1));
    const cx = Math.round((uv[ic * 2] ?? 0) * (size - 1));
    const cy = Math.round((uv[ic * 2 + 1] ?? 0) * (size - 1));
    drawLine(ax, ay, bx, by);
    drawLine(bx, by, cx, cy);
    drawLine(cx, cy, ax, ay);
  }

  await ensureDir(outputPath);
  await sharp(Buffer.from(image), { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toFile(outputPath);
  return outputPath;
}

async function generateZoneMask(glbPath, outputPath) {
  const doc = await readAvatarDocument(glbPath);
  const primitive = doc.getRoot().listMeshes()[0]?.listPrimitives()[0];
  const skin = doc.getRoot().listSkins()[0];
  if (!primitive || !skin) throw new Error("Azure Vanguard GLB is missing mesh or skin data.");

  const baseColorBuffer = Buffer.from(getAvatarTexture(doc).getImage());
  const { data: textureData, info } = await sharp(baseColorBuffer).raw().toBuffer({ resolveWithObject: true });
  const size = info.width;
  const mask = new Uint8ClampedArray(size * info.height * 3);

  const positions = primitive.getAttribute("POSITION")?.getArray();
  const normals = primitive.getAttribute("NORMAL")?.getArray();
  const uv = primitive.getAttribute("TEXCOORD_0")?.getArray();
  const joints = primitive.getAttribute("JOINTS_0")?.getArray();
  const weights = primitive.getAttribute("WEIGHTS_0")?.getArray();
  const indices = primitive.getIndices()?.getArray();
  if (!positions || !normals || !uv || !joints || !weights || !indices) {
    throw new Error("Azure Vanguard GLB is missing mesh attributes required for recolor mask generation.");
  }

  const jointNames = skin.listJoints().map((joint) => joint.getName());
  const vertexClasses = buildVertexClasses(joints, weights);
  const zoneCoverage = new Map();
  const sampleColorAt = (u, v) => {
    const x = Math.max(0, Math.min(info.width - 1, Math.round(u * (info.width - 1))));
    const y = Math.max(0, Math.min(info.height - 1, Math.round(v * (info.height - 1))));
    const offset = (y * info.width + x) * info.channels;
    return [
      textureData[offset] ?? 0,
      textureData[offset + 1] ?? 0,
      textureData[offset + 2] ?? 0,
    ];
  };

  const averageAttribute = (array, ia, ib, ic, stride, component) =>
    ((array[ia * stride + component] ?? 0) + (array[ib * stride + component] ?? 0) + (array[ic * stride + component] ?? 0)) / 3;

  for (let triangleIndex = 0; triangleIndex < indices.length; triangleIndex += 3) {
    const ia = indices[triangleIndex] ?? 0;
    const ib = indices[triangleIndex + 1] ?? 0;
    const ic = indices[triangleIndex + 2] ?? 0;

    const ax = (uv[ia * 2] ?? 0) * (info.width - 1);
    const ay = (uv[ia * 2 + 1] ?? 0) * (info.height - 1);
    const bx = (uv[ib * 2] ?? 0) * (info.width - 1);
    const by = (uv[ib * 2 + 1] ?? 0) * (info.height - 1);
    const cx = (uv[ic * 2] ?? 0) * (info.width - 1);
    const cy = (uv[ic * 2 + 1] ?? 0) * (info.height - 1);

    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(info.width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(info.height - 1, Math.ceil(Math.max(ay, by, cy)));
    const area = edge(ax, ay, bx, by, cx, cy);
    if (Math.abs(area) < 1e-6) continue;

    // Classify the whole triangle once at its centroid, then fill solid. This
    // is what keeps each segment a single colour instead of a per-texel mosaic.
    const centroidU = ((uv[ia * 2] ?? 0) + (uv[ib * 2] ?? 0) + (uv[ic * 2] ?? 0)) / 3;
    const centroidV = ((uv[ia * 2 + 1] ?? 0) + (uv[ib * 2 + 1] ?? 0) + (uv[ic * 2 + 1] ?? 0)) / 3;
    const boneA = jointNames[vertexClasses[ia] ?? 0] ?? "";
    const boneB = jointNames[vertexClasses[ib] ?? 0] ?? "";
    const boneC = jointNames[vertexClasses[ic] ?? 0] ?? "";
    const boneName = boneB === boneC ? boneB : boneA;
    const zoneId = classifyZone({
      boneName,
      y: averageAttribute(positions, ia, ib, ic, 3, 1),
      z: averageAttribute(positions, ia, ib, ic, 3, 2),
      nx: averageAttribute(normals, ia, ib, ic, 3, 0),
      ny: averageAttribute(normals, ia, ib, ic, 3, 1),
      nz: averageAttribute(normals, ia, ib, ic, 3, 2),
      color: sampleColorAt(centroidU, centroidV),
    });

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = edge(bx, by, cx, cy, px, py) / area;
        const w1 = edge(cx, cy, ax, ay, px, py) / area;
        const w2 = edge(ax, ay, bx, by, px, py) / area;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;

        const offset = (y * info.width + x) * 3;
        mask[offset] = zoneId;
        mask[offset + 1] = zoneId;
        mask[offset + 2] = zoneId;
        zoneCoverage.set(zoneId, (zoneCoverage.get(zoneId) ?? 0) + 1);
      }
    }
  }

  dilateMask(mask, info.width, info.height, 2);

  await ensureDir(outputPath);
  await sharp(Buffer.from(mask), { raw: { width: info.width, height: info.height, channels: 3 } })
    .png()
    .toFile(outputPath);
  return { outputPath, zoneCoverage };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.extractBaseColor) {
    const buffer = await readBaseColorBuffer(args.input);
    await ensureDir(args.extractBaseColor);
    await writeFile(args.extractBaseColor, buffer);
    console.log(`Extracted base color → ${args.extractBaseColor}`);
  }

  if (args.albedoOnly) {
    const outputPath = args.output && !args.uvReference && !args.zoneMask ? args.output : DEFAULT_NEUTRAL_PATH;
    await generateNeutralAlbedo(args.input, outputPath);
    console.log(`Generated neutral albedo → ${outputPath}`);
  }

  if (args.uvReference) {
    const outputPath = args.output && !args.albedoOnly && !args.zoneMask ? args.output : DEFAULT_UV_REFERENCE_PATH;
    await generateUvReference(args.input, outputPath);
    console.log(`Generated UV reference → ${outputPath}`);
  }

  if (args.zoneMask) {
    const outputPath = args.output && !args.albedoOnly && !args.uvReference ? args.output : DEFAULT_MASK_PATH;
    const { zoneCoverage } = await generateZoneMask(args.input, outputPath);
    console.log(`Generated zone mask → ${outputPath}`);
    console.log(`Zone coverage → ${JSON.stringify(Object.fromEntries([...zoneCoverage.entries()].sort((a, b) => a[0] - b[0])))}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
