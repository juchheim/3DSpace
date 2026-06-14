import type { TrimeshColliderSpec } from "@3dspace/room-engine";

/**
 * Builds Rapier trimesh collider specs for placed world assets flagged with
 * `staticCollider: true` in `worldAssetCatalog.ts`. Every new scene added to
 * the catalog must set that flag or avatars cannot walk on the geometry.
 */

import type { PlacedChair } from "./usePlacedChairs";
import {
  isStaticColliderWorldAsset,
  placedWorldAssetRenderScale,
  worldAssetGlbUrl
} from "./worldAssetCatalog";
import type { WorldAssetColliderMesh } from "./worldAssetColliderMesh";

function stableAssetKey(asset: PlacedChair) {
  const scale = asset.scale ?? placedWorldAssetRenderScale(asset);
  return `${asset.id}|${asset.slug}|${asset.position.x},${asset.position.y},${asset.position.z}|${asset.yaw}|${scale}`;
}

export function worldAssetPhysicsCacheKey(
  assets: PlacedChair[],
  meshReadyByUrl: ReadonlyMap<string, boolean>
): string {
  return assets
    .filter((asset) => isStaticColliderWorldAsset(asset.slug))
    .sort((a, b) => stableAssetKey(a).localeCompare(stableAssetKey(b)))
    .map((asset) => {
      const glbUrl = worldAssetGlbUrl(asset.slug);
      const meshReady = meshReadyByUrl.get(glbUrl) ? "1" : "0";
      return `${stableAssetKey(asset)}|mesh:${meshReady}`;
    })
    .join(";");
}

export function buildWorldAssetTrimeshColliderSpecs(
  assets: PlacedChair[],
  meshByUrl: ReadonlyMap<string, WorldAssetColliderMesh>
): TrimeshColliderSpec[] {
  const specs: TrimeshColliderSpec[] = [];

  for (const asset of assets) {
    if (!isStaticColliderWorldAsset(asset.slug)) continue;

    const glbUrl = worldAssetGlbUrl(asset.slug);
    const mesh = meshByUrl.get(glbUrl);
    if (!mesh) continue;

    const scale = placedWorldAssetRenderScale(asset);
    const cos = Math.cos(asset.yaw);
    const sin = Math.sin(asset.yaw);
    const vertices = new Float32Array(mesh.vertices.length);

    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const lx = mesh.vertices[i]! * scale;
      const ly = mesh.vertices[i + 1]! * scale;
      const lz = mesh.vertices[i + 2]! * scale;
      vertices[i] = lx * cos - lz * sin + asset.position.x;
      vertices[i + 1] = ly + asset.position.y;
      vertices[i + 2] = lx * sin + lz * cos + asset.position.z;
    }

    specs.push({
      kind: "trimesh",
      id: `world-asset:${asset.id}`,
      source: "world-asset",
      vertices,
      indices: mesh.indices
    });
  }

  specs.sort((a, b) => a.id.localeCompare(b.id));
  return specs;
}
