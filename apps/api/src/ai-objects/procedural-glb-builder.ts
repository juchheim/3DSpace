import { Document, NodeIO, type Mesh } from "@gltf-transform/core";
import { KHRMaterialsUnlit } from "@gltf-transform/extensions";
import type { ProceduralMaterial, ProceduralObjectSpec, ProceduralPart } from "./types.js";

// Segment counts for primitives — kept intentionally low for budget-friendly stylized meshes.
const SPHERE_SEGMENTS = 8;
const CYLINDER_SEGMENTS = 8;
const TORUS_TUBE_SEGMENTS = 8;
const TORUS_RADIAL_SEGMENTS = 16;

type Vec3 = [number, number, number];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 0xff) / 255, (n >> 8 & 0xff) / 255, (n & 0xff) / 255];
}

function applyTransform(vertices: Float32Array, position?: Vec3, rotation?: Vec3): Float32Array {
  const result = new Float32Array(vertices.length);
  const [px, py, pz] = position ?? [0, 0, 0];
  const [rx, ry, rz] = rotation ?? [0, 0, 0];

  const cosX = Math.cos(rx * Math.PI / 180), sinX = Math.sin(rx * Math.PI / 180);
  const cosY = Math.cos(ry * Math.PI / 180), sinY = Math.sin(ry * Math.PI / 180);
  const cosZ = Math.cos(rz * Math.PI / 180), sinZ = Math.sin(rz * Math.PI / 180);

  for (let i = 0; i < vertices.length; i += 3) {
    let x = vertices[i]!, y = vertices[i + 1]!, z = vertices[i + 2]!;
    // Rotation X
    let ny = y * cosX - z * sinX; let nz = y * sinX + z * cosX; y = ny; z = nz;
    // Rotation Y
    let nx = x * cosY + z * sinY; nz = -x * sinY + z * cosY; x = nx; z = nz;
    // Rotation Z
    nx = x * cosZ - y * sinZ; ny = x * sinZ + y * cosZ; x = nx; y = ny;
    result[i] = x + px; result[i + 1] = y + py; result[i + 2] = z + pz;
  }
  return result;
}

function buildBox(sx: number, sy: number, sz: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  // 6 faces, 4 vertices each = 24 vertices; 6 faces * 2 tris * 3 indices = 36 indices
  const faces: Array<{ verts: number[][]; normal: number[] }> = [
    { verts: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz]], normal: [0, 0, -1] },
    { verts: [[-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz], [hx, -hy, hz]], normal: [0, 0, 1] },
    { verts: [[-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz], [-hx, -hy, hz]], normal: [-1, 0, 0] },
    { verts: [[hx, -hy, -hz], [hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz]], normal: [1, 0, 0] },
    { verts: [[-hx, -hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz]], normal: [0, -1, 0] },
    { verts: [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]], normal: [0, 1, 0] }
  ];
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  faces.forEach((face, fi) => {
    const base = fi * 4;
    face.verts.forEach((v) => { positions.push(...v); normals.push(...face.normal); });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

function buildSphere(radius: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const stacks = SPHERE_SEGMENTS, slices = SPHERE_SEGMENTS * 2;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let i = 0; i <= stacks; i++) {
    const phi = (i / stacks) * Math.PI;
    for (let j = 0; j <= slices; j++) {
      const theta = (j / slices) * 2 * Math.PI;
      const x = Math.sin(phi) * Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(theta);
      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
    }
  }
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j, b = a + slices + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

function buildCylinder(radius: number, height: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const segs = CYLINDER_SEGMENTS;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const hy = height / 2;
  // Side
  for (let i = 0; i <= segs; i++) {
    const theta = (i / segs) * 2 * Math.PI;
    const x = Math.cos(theta), z = Math.sin(theta);
    positions.push(x * radius, -hy, z * radius, x * radius, hy, z * radius);
    normals.push(x, 0, z, x, 0, z);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  // Caps
  const topCenter = positions.length / 3; positions.push(0, hy, 0); normals.push(0, 1, 0);
  const botCenter = positions.length / 3; positions.push(0, -hy, 0); normals.push(0, -1, 0);
  for (let i = 0; i < segs; i++) {
    const j0 = topCenter - (segs + 1) * 2 + i * 2 + 1;
    const j1 = j0 + 2;
    positions.push(Math.cos((i / segs) * 2 * Math.PI) * radius, hy, Math.sin((i / segs) * 2 * Math.PI) * radius);
    normals.push(0, 1, 0);
    positions.push(Math.cos((i / segs) * 2 * Math.PI) * radius, -hy, Math.sin((i / segs) * 2 * Math.PI) * radius);
    normals.push(0, -1, 0);
  }
  // Simplified cap indices using vertex data we just added
  const capBase = topCenter + 2;
  for (let i = 0; i < segs; i++) {
    const ti = capBase + i * 2;
    const ti2 = capBase + ((i + 1) % segs) * 2;
    indices.push(topCenter, ti, ti2);
    indices.push(botCenter, ti2 + 1, ti + 1);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

function buildCone(radius: number, height: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const segs = CYLINDER_SEGMENTS;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const base = -height / 2, apex = height / 2;
  // Lateral
  const slant = Math.sqrt(radius * radius + height * height);
  const ny = radius / slant, nr = height / slant;
  for (let i = 0; i <= segs; i++) {
    const theta = (i / segs) * 2 * Math.PI;
    const x = Math.cos(theta), z = Math.sin(theta);
    positions.push(x * radius, base, z * radius);
    normals.push(x * nr, ny, z * nr);
    positions.push(0, apex, 0);
    normals.push(x * nr, ny, z * nr);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    indices.push(b, b + 2, b + 1);
  }
  // Bottom cap
  const bc = positions.length / 3; positions.push(0, base, 0); normals.push(0, -1, 0);
  for (let i = 0; i < segs; i++) {
    const theta0 = (i / segs) * 2 * Math.PI, theta1 = ((i + 1) % segs / segs) * 2 * Math.PI;
    const cv = positions.length / 3;
    positions.push(Math.cos(theta0) * radius, base, Math.sin(theta0) * radius); normals.push(0, -1, 0);
    positions.push(Math.cos(theta1) * radius, base, Math.sin(theta1) * radius); normals.push(0, -1, 0);
    indices.push(bc, cv + 1, cv);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

function buildTorus(radius: number, tube: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const R = TORUS_RADIAL_SEGMENTS, r = TORUS_TUBE_SEGMENTS;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let i = 0; i <= R; i++) {
    const u = (i / R) * 2 * Math.PI;
    for (let j = 0; j <= r; j++) {
      const v = (j / r) * 2 * Math.PI;
      const x = (radius + tube * Math.cos(v)) * Math.cos(u);
      const y = tube * Math.sin(v);
      const z = (radius + tube * Math.cos(v)) * Math.sin(u);
      positions.push(x, y, z);
      const nx = Math.cos(v) * Math.cos(u), ny2 = Math.sin(v), nz = Math.cos(v) * Math.sin(u);
      normals.push(nx, ny2, nz);
    }
  }
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < r; j++) {
      const a = i * (r + 1) + j, b = a + r + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

function buildExtrude(profile: [number, number][], depth: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const n = profile.length;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const hd = depth / 2;
  // Front and back faces (XZ profile extruded along Y)
  for (let i = 0; i < n; i++) {
    const [x, z] = profile[i]!;
    positions.push(x, hd, z, x, -hd, z);
    normals.push(0, 1, 0, 0, -1, 0);
  }
  // Simple fan triangulation for front/back (works for convex profiles)
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i * 2, (i + 1) * 2);
    indices.push(1, (i + 1) * 2 + 1, i * 2 + 1);
  }
  // Side walls
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ax, az] = profile[i]!, [bx, bz] = profile[j]!;
    const base = positions.length / 3;
    positions.push(ax, hd, az, ax, -hd, az, bx, hd, bz, bx, -hd, bz);
    const dx = bz - az, dz = -(bx - ax);
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    normals.push(dx / len, 0, dz / len, dx / len, 0, dz / len, dx / len, 0, dz / len, dx / len, 0, dz / len);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

function buildPrimitive(part: ProceduralPart): { positions: Float32Array; normals: Float32Array; indices: Uint32Array; material: string } | null {
  if (part.op === "union") {
    return null; // handled by flattening
  }
  let geo: { positions: Float32Array; normals: Float32Array; indices: Uint32Array };
  switch (part.op) {
    case "box": geo = buildBox(part.size[0], part.size[1], part.size[2]); break;
    case "sphere": geo = buildSphere(part.radius); break;
    case "cylinder": geo = buildCylinder(part.radius, part.height); break;
    case "cone": geo = buildCone(part.radius, part.height); break;
    case "torus": geo = buildTorus(part.radius, part.tube); break;
    case "extrude": geo = buildExtrude(part.profile, part.depth); break;
    default: return null;
  }
  geo.positions = applyTransform(geo.positions, part.position, part.rotation);
  return { ...geo, material: part.material };
}

function flattenParts(parts: ProceduralPart[]): Array<{ positions: Float32Array; normals: Float32Array; indices: Uint32Array; material: string }> {
  const result: ReturnType<typeof flattenParts> = [];
  for (const part of parts) {
    if (part.op === "union") {
      result.push(...flattenParts(part.children));
    } else {
      const prim = buildPrimitive(part);
      if (prim) result.push(prim);
    }
  }
  return result;
}

function countTriangles(primitives: ReturnType<typeof flattenParts>): number {
  return primitives.reduce((sum, p) => sum + p.indices.length / 3, 0);
}

function buildPlaceholderThumbnail(): Buffer {
  // 1×1 px grey PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  );
}

export async function buildGlbFromProceduralSpec(spec: ProceduralObjectSpec): Promise<{ glbBytes: Buffer; thumbnailBytes: Buffer; triangleCount: number }> {
  const document = new Document();
  Object.assign(document.getRoot().getAsset(), { generator: "3DSpace procedural-glb-builder v1" });

  const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
  const scene = document.createScene(spec.displayName);
  const root = document.createNode(spec.displayName);
  scene.addChild(root);

  const primitives = flattenParts(spec.parts);
  const triangleCount = countTriangles(primitives);

  const materialCache = new Map<string, ReturnType<typeof document.createMaterial>>();

  function getMaterial(name: string) {
    if (materialCache.has(name)) return materialCache.get(name)!;
    const def = spec.materials[name] ?? { colorHex: "#888888", roughness: 0.8, metalness: 0 };
    const mat = document.createMaterial(name);
    const [r, g, b] = hexToRgb(def.colorHex);
    mat.setBaseColorFactor([r!, g!, b!, 1]);
    mat.setRoughnessFactor(def.roughness ?? 0.8);
    mat.setMetallicFactor(def.metalness ?? 0);
    materialCache.set(name, mat);
    return mat;
  }

  for (let i = 0; i < primitives.length; i++) {
    const prim = primitives[i]!;
    const buffer = document.createBuffer();
    const posAccessor = document.createAccessor()
      .setType("VEC3").setArray(prim.positions as unknown as Float32Array<ArrayBuffer>).setBuffer(buffer);
    const normAccessor = document.createAccessor()
      .setType("VEC3").setArray(prim.normals as unknown as Float32Array<ArrayBuffer>).setBuffer(buffer);
    const idxAccessor = document.createAccessor()
      .setType("SCALAR").setArray(prim.indices as unknown as Uint32Array<ArrayBuffer>).setBuffer(buffer);

    const primitive = document.createPrimitive()
      .setAttribute("POSITION", posAccessor)
      .setAttribute("NORMAL", normAccessor)
      .setIndices(idxAccessor)
      .setMaterial(getMaterial(prim.material));

    const mesh: Mesh = document.createMesh(`part_${i}`).addPrimitive(primitive);
    const node = document.createNode(`part_${i}`).setMesh(mesh);
    root.addChild(node);
  }

  const glbBytes = Buffer.from(await io.writeBinary(document));
  const thumbnailBytes = buildPlaceholderThumbnail();
  return { glbBytes, thumbnailBytes, triangleCount };
}
