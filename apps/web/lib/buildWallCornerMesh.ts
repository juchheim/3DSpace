import type { BuildPiece, BuildPieceCorner } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_LEVEL_HEIGHT,
  BUILD_WALL_HEIGHT,
  cornerWorldPoint
} from "@3dspace/room-engine";

/** Native arm span of wall_v2_corner.glb (inner corner to outer tip, per axis). */
const WALL_CORNER_GLB_ARM = 2.8124;
/** Native distance from mesh origin to the inner L-corner (SW of bbox). */
const WALL_CORNER_GLB_INNER = 1.408;

const CORNER_ROTATION_Y: Record<BuildPieceCorner, number> = {
  sw: 0,
  se: Math.PI / 2,
  nw: -Math.PI / 2,
  ne: Math.PI
};

export type WallCornerMeshTransform = {
  position: [number, number, number];
  rotationY: number;
  scale: [number, number, number];
  /** Axis-aligned box for ghost / fallback preview. */
  size: [number, number, number];
};

/**
 * World-space transform for a build `wall-corner` GLB.
 *
 * The source mesh has its inner corner at local (−inner, 0, −inner) with arms
 * extending toward +X and +Z; each arm is scaled to BUILD_CELL_SIZE.
 */
export function wallCornerMeshTransform(piece: BuildPiece): WallCornerMeshTransform {
  if (!piece.corner) {
    throw new Error("wall-corner piece requires corner");
  }

  const corner = piece.corner;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;
  const pt = cornerWorldPoint(piece.cell.ix, piece.cell.iz, corner);
  const rotationY = CORNER_ROTATION_Y[corner];
  const armScale = BUILD_CELL_SIZE / WALL_CORNER_GLB_ARM;
  const heightScale = BUILD_WALL_HEIGHT / 2.0;
  const scale: [number, number, number] = [armScale, heightScale, armScale];

  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const localInnerX = -WALL_CORNER_GLB_INNER;
  const localInnerZ = -WALL_CORNER_GLB_INNER;
  const rotatedInnerX = localInnerX * cos - localInnerZ * sin;
  const rotatedInnerZ = localInnerX * sin + localInnerZ * cos;

  const gx = pt.x - armScale * rotatedInnerX;
  const gz = pt.z - armScale * rotatedInnerZ;

  return {
    position: [gx, baseY, gz],
    rotationY,
    scale,
    size: [BUILD_CELL_SIZE, BUILD_WALL_HEIGHT, BUILD_CELL_SIZE]
  };
}
