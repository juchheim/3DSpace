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
