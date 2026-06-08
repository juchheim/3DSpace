import type { BuildPiece, BuildPieceCorner } from "@3dspace/contracts";
import { BUILD_CELL_SIZE, BUILD_LEVEL_HEIGHT, BUILD_WALL_HEIGHT } from "@3dspace/room-engine";

/** Native arm span of wall_v2_corner.glb (full L footprint per axis; bbox is origin-centered). */
const WALL_CORNER_GLB_ARM = 2.8124;
/** Native Y extent of the source mesh. */
const WALL_CORNER_GLB_HEIGHT = 2.0;

/**
 * The source mesh's L hugs the SOUTH (−Z) and EAST (+X) cell edges at rotation 0 — i.e. its
 * natural orientation is an `se` corner — and its bounding box is centred on the origin. So we
 * place the mesh at the cell centre (where the centred bbox lines its outer faces up with the two
 * cell edges) and rotate about Y to swing the L onto the pair of edges that meet at the requested
 * corner. (A previous mapping assumed the arms pointed toward +X/+Z, which rendered every corner
 * on the wrong two edges so adjacent walls never met it cleanly.)
 */
const CORNER_ROTATION_Y: Record<BuildPieceCorner, number> = {
  se: 0,
  sw: Math.PI / 2,
  nw: Math.PI,
  ne: -Math.PI / 2
};

export type WallCornerMeshTransform = {
  position: [number, number, number];
  rotationY: number;
  scale: [number, number, number];
  /** Axis-aligned box for ghost / fallback preview. */
  size: [number, number, number];
};

/** World-space transform for a build `wall-corner` GLB. */
export function wallCornerMeshTransform(piece: BuildPiece): WallCornerMeshTransform {
  if (!piece.corner) {
    throw new Error("wall-corner piece requires corner");
  }

  const baseY = piece.level * BUILD_LEVEL_HEIGHT;
  const centerX = (piece.cell.ix + 0.5) * BUILD_CELL_SIZE;
  const centerZ = (piece.cell.iz + 0.5) * BUILD_CELL_SIZE;
  const armScale = BUILD_CELL_SIZE / WALL_CORNER_GLB_ARM;
  const heightScale = BUILD_WALL_HEIGHT / WALL_CORNER_GLB_HEIGHT;

  return {
    position: [centerX, baseY, centerZ],
    rotationY: CORNER_ROTATION_Y[piece.corner],
    scale: [armScale, heightScale, armScale],
    size: [BUILD_CELL_SIZE, BUILD_WALL_HEIGHT, BUILD_CELL_SIZE]
  };
}
