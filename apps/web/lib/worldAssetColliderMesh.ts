import { NodeIO } from "@gltf-transform/core";

export type WorldAssetColliderMesh = {
  vertices: Float32Array;
  indices: Uint32Array;
};

const meshCache = new Map<string, Promise<WorldAssetColliderMesh>>();

function extractColliderMesh(doc: Awaited<ReturnType<NodeIO["readBinary"]>>): WorldAssetColliderMesh {
  const mesh = doc.getRoot().listMeshes()[0];
  if (!mesh) {
    throw new Error("GLB has no mesh for collider extraction.");
  }

  const prim = mesh.listPrimitives()[0];
  if (!prim) {
    throw new Error("GLB mesh has no primitives for collider extraction.");
  }

  const position = prim.getAttribute("POSITION");
  const indices = prim.getIndices();
  if (!position || !indices) {
    throw new Error("GLB mesh is missing POSITION or indices for collider extraction.");
  }

  const srcPos = position.getArray();
  const srcIdx = indices.getArray();
  if (!srcPos || !srcIdx) {
    throw new Error("GLB mesh POSITION or indices buffer is empty.");
  }

  const vertices = new Float32Array(srcPos.length);
  vertices.set(srcPos);

  const IndexArray = srcIdx.some((value) => value > 65535) ? Uint32Array : Uint32Array;
  const meshIndices = new IndexArray(srcIdx.length);
  for (let i = 0; i < srcIdx.length; i++) {
    meshIndices[i] = srcIdx[i]!;
  }

  return { vertices, indices: meshIndices };
}

/** Load (and cache) triangle soup from a world-asset GLB URL. */
export function loadWorldAssetColliderMesh(glbUrl: string): Promise<WorldAssetColliderMesh> {
  const cached = meshCache.get(glbUrl);
  if (cached) return cached;

  const pending = (async () => {
    const response = await fetch(glbUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch collider mesh ${glbUrl}: ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const doc = await new NodeIO().readBinary(bytes);
    return extractColliderMesh(doc);
  })();

  meshCache.set(glbUrl, pending);
  return pending;
}

/** @internal Test helper */
export function __resetWorldAssetColliderMeshCacheForTests() {
  meshCache.clear();
}
