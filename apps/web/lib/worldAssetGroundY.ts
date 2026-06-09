import type { BuildPiece, RoomManifest } from "@3dspace/contracts";
import { createGroundHeightContext, groundHeightAt } from "@3dspace/room-engine";

/** Walkable surface height for a world asset at (x, z), including build floors and ramps. */
export function worldAssetGroundY(
  manifest: RoomManifest,
  buildPieces: BuildPiece[],
  x: number,
  z: number
): number {
  const ctx = createGroundHeightContext(manifest, buildPieces);
  return groundHeightAt(x, z, ctx, 0, "snap");
}

/**
 * Ground Y for placing a new world asset, limited to surfaces reachable by stepping
 * up from `currentY`. This prevents an upper floor from intercepting placement aimed
 * at a lower level.
 */
export function worldAssetPlacementGroundY(
  manifest: RoomManifest,
  buildPieces: BuildPiece[],
  x: number,
  z: number,
  currentY: number
): number {
  const ctx = createGroundHeightContext(manifest, buildPieces);
  return groundHeightAt(x, z, ctx, currentY, "walk");
}
