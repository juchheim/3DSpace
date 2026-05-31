import type { BuildPiece } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_LEVEL_HEIGHT,
  BUILD_WALL_HEIGHT,
  BUILD_WALL_THICKNESS,
  buildPieceColliders
} from "@3dspace/room-engine";

export type WallMeshTransform = {
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
};

/**
 * World-space transform for a build `wall` piece's visible mesh.
 *
 * The box `size` already encodes the wall orientation in world axes — e/w edges run
 * along Z (thin on X), n/s edges run along X (thin on Z) — so the mesh must NOT be
 * Y-rotated. A previous Math.PI/2 rotation on e/w walls spun the mesh to run along X,
 * leaving it perpendicular to its own collider and to any board mounted on it.
 */
export function wallMeshTransform(piece: BuildPiece): WallMeshTransform {
  const wall = buildPieceColliders(piece).walls[0]!;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;
  const midX = (wall.start.x + wall.end.x) / 2;
  const midZ = (wall.start.z + wall.end.z) / 2;
  const edge = piece.edge!;
  const size: [number, number, number] =
    edge === "e" || edge === "w"
      ? [BUILD_WALL_THICKNESS, BUILD_WALL_HEIGHT, BUILD_CELL_SIZE]
      : [BUILD_CELL_SIZE, BUILD_WALL_HEIGHT, BUILD_WALL_THICKNESS];
  return {
    position: [midX, baseY + BUILD_WALL_HEIGHT / 2, midZ],
    rotationY: 0,
    size
  };
}
