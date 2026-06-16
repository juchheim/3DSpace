import { BUILD_STEP_UP_MAX } from "@3dspace/room-engine";

import type { PlacedChair } from "./usePlacedChairs";
import {
  isStaticColliderWorldAsset,
  placedWorldAssetRenderScale,
  worldAssetGlbUrl
} from "./worldAssetCatalog";
import type { WorldAssetColliderMesh } from "./worldAssetColliderMesh";

const HEIGHT_EPSILON = 1e-6;

type HeightCandidate = { y: number; id: string };
export type WorldAssetGroundHeightMode = "walk" | "snap";

function pickDeterministicMax(candidates: HeightCandidate[]): number | null {
  if (candidates.length === 0) return null;
  const maxY = Math.max(...candidates.map((candidate) => candidate.y));
  const tied = candidates
    .filter((candidate) => Math.abs(candidate.y - maxY) <= HEIGHT_EPSILON)
    .sort((a, b) => a.id.localeCompare(b.id));
  return tied[0]!.y;
}

/** Barycentric height on a triangle footprint projected onto the XZ plane. */
function heightOnTriangleXZ(
  x: number,
  z: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): number | null {
  const v0x = cx - ax;
  const v0z = cz - az;
  const v1x = bx - ax;
  const v1z = bz - az;
  const v2x = x - ax;
  const v2z = z - az;
  const dot00 = v0x * v0x + v0z * v0z;
  const dot01 = v0x * v1x + v0z * v1z;
  const dot02 = v0x * v2x + v0z * v2z;
  const dot11 = v1x * v1x + v1z * v1z;
  const dot12 = v1x * v2x + v1z * v2z;
  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) <= HEIGHT_EPSILON) return null;

  const invDenom = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  if (u < -HEIGHT_EPSILON || v < -HEIGHT_EPSILON || u + v > 1 + HEIGHT_EPSILON) return null;
  return ay + u * (cy - ay) + v * (by - ay);
}

function collectSceneHeightCandidates(
  x: number,
  z: number,
  assets: PlacedChair[],
  meshByUrl: ReadonlyMap<string, WorldAssetColliderMesh>
): HeightCandidate[] {
  const candidates: HeightCandidate[] = [];

  for (const asset of assets) {
    if (!isStaticColliderWorldAsset(asset.slug)) continue;

    const mesh = meshByUrl.get(worldAssetGlbUrl(asset.slug));
    if (!mesh) continue;

    const scale = placedWorldAssetRenderScale(asset);
    const cos = Math.cos(asset.yaw);
    const sin = Math.sin(asset.yaw);
    const { vertices, indices } = mesh;

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]! * 3;
      const i1 = indices[i + 1]! * 3;
      const i2 = indices[i + 2]! * 3;

      const lx0 = vertices[i0]! * scale;
      const ly0 = vertices[i0 + 1]! * scale;
      const lz0 = vertices[i0 + 2]! * scale;
      const lx1 = vertices[i1]! * scale;
      const ly1 = vertices[i1 + 1]! * scale;
      const lz1 = vertices[i1 + 2]! * scale;
      const lx2 = vertices[i2]! * scale;
      const ly2 = vertices[i2 + 1]! * scale;
      const lz2 = vertices[i2 + 2]! * scale;

      const ax = lx0 * cos - lz0 * sin + asset.position.x;
      const ay = ly0 + asset.position.y;
      const az = lx0 * sin + lz0 * cos + asset.position.z;
      const bx = lx1 * cos - lz1 * sin + asset.position.x;
      const by = ly1 + asset.position.y;
      const bz = lx1 * sin + lz1 * cos + asset.position.z;
      const cx = lx2 * cos - lz2 * sin + asset.position.x;
      const cy = ly2 + asset.position.y;
      const cz = lx2 * sin + lz2 * cos + asset.position.z;

      const y = heightOnTriangleXZ(x, z, ax, ay, az, bx, by, bz, cx, cy, cz);
      if (y !== null) {
        candidates.push({ y, id: `${asset.id}:${i}` });
      }
    }
  }

  return candidates;
}

/**
 * Walkable height from placed scene trimeshes at (x, z).
 * Returns null when no loaded static-collider surface covers the point.
 */
export function worldAssetGroundHeightAt(
  x: number,
  z: number,
  currentY: number,
  assets: PlacedChair[],
  meshByUrl: ReadonlyMap<string, WorldAssetColliderMesh>,
  mode: WorldAssetGroundHeightMode = "walk"
): number | null {
  const candidates = collectSceneHeightCandidates(x, z, assets, meshByUrl);
  if (candidates.length === 0) return null;

  if (mode === "snap") {
    return pickDeterministicMax(candidates);
  }

  const stepLimit = currentY + BUILD_STEP_UP_MAX;
  const reachable = candidates.filter((candidate) => candidate.y <= stepLimit + HEIGHT_EPSILON);
  if (reachable.length > 0) {
    return pickDeterministicMax(reachable);
  }

  const descend = candidates.filter((candidate) => candidate.y <= currentY + HEIGHT_EPSILON);
  if (descend.length > 0) {
    return pickDeterministicMax(descend);
  }

  return null;
}

export function hasWalkableSceneAssets(assets: PlacedChair[]): boolean {
  return assets.some((asset) => isStaticColliderWorldAsset(asset.slug));
}
