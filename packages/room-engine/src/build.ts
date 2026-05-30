import { BUILD_MAX_LEVEL, type BuildPiece, type RoomManifest } from "@3dspace/contracts";

import {
  cellFootprintCorners,
  footprintOverlapsAnyRect,
  footprintOverlapsExitWedge,
  footprintOverlapsSpawnKeepOut,
  freeForAllBuildMask,
  isFreeForAllManifest
} from "./free-for-all-build-mask.js";
import { manifestWallToCollider } from "./wall-collision.js";

export { BUILD_MAX_LEVEL };

// INVARIANT: BUILD_CELL_SIZE === BUILD_LEVEL_HEIGHT === BUILD_WALL_HEIGHT.
// Equal run and rise make a single-cell ramp exactly 45° (a 3 m rise over a 2 m run is a
// near-unwalkable 56°), and a wall being exactly one level tall keeps floor tops aligned with
// wall tops. Tune all three together; never independently.
export const BUILD_CELL_SIZE = 2.0;
export const BUILD_LEVEL_HEIGHT = 2.0;
export const BUILD_WALL_HEIGHT = 2.0;
export const BUILD_WALL_THICKNESS = 0.2;
export const BUILD_FLOOR_THICKNESS = 0.3;
export const BUILD_STEP_UP_MAX = 0.6;
/** When true, avatars ease down instead of snapping when above ground (web movement reads this). */
export const BUILD_ENABLE_EASED_FALL = false;
export const BUILD_FALL_GRAVITY = 28;
export const BUILD_PLACEMENT_RATE_LIMIT_MS = 100;
export const BUILD_MAX_PIECES_PER_ROOM = 1000;
export const BUILD_MAX_PIECES_PER_USER = 400;
export const BUILD_ID_PREFIX = "build:";

export {
  BUILD_SPAWN_KEEP_OUT_RADIUS,
  freeForAllBuildMask,
  freeForAllBoardKeepOutRects,
  freeForAllHallRects,
  isAngleWithinFreeForAllExitArc,
  isFreeForAllManifest,
  isPointInFreeForAllExitWedge,
  SPAWN_OCCUPIED_RADIUS,
  type AxisAlignedRect,
  type FreeForAllBuildMask
} from "./free-for-all-build-mask.js";

export type WallCollider = RoomManifest["walls"][number] & { baseY: number };

export type FloorTop = {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
};

export type RampSurface = {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  lowY: number;
  highY: number;
  /** World +X or +Z axis the ramp climbs along (low → high). */
  climbAxis: "x" | "z";
  /** +1 when low edge is at min on the climb axis; -1 when low is at max. */
  climbSign: 1 | -1;
  rotation: BuildPiece["rotation"];
};

export type BuildPieceColliders = {
  walls: WallCollider[];
  floorTop?: FloorTop;
  ramp?: RampSurface;
};

export function cellToWorldCenter(ix: number, iz: number) {
  return { x: (ix + 0.5) * BUILD_CELL_SIZE, z: (iz + 0.5) * BUILD_CELL_SIZE };
}

export function worldToCell(x: number, z: number) {
  return { ix: Math.floor(x / BUILD_CELL_SIZE), iz: Math.floor(z / BUILD_CELL_SIZE) };
}

export function levelToY(level: number) {
  return level * BUILD_LEVEL_HEIGHT;
}

export function buildCellFootprint(ix: number, iz: number) {
  return {
    minX: ix * BUILD_CELL_SIZE,
    maxX: (ix + 1) * BUILD_CELL_SIZE,
    minZ: iz * BUILD_CELL_SIZE,
    maxZ: (iz + 1) * BUILD_CELL_SIZE
  };
}

function cellBounds(ix: number, iz: number) {
  return buildCellFootprint(ix, iz);
}

export function buildPieceStableId(piece: Pick<BuildPiece, "kind" | "cell" | "level" | "edge">) {
  const edgePart = piece.edge ? `:${piece.edge}` : "";
  return `${BUILD_ID_PREFIX}${piece.kind}:${piece.cell.ix},${piece.cell.iz}:${piece.level}${edgePart}`;
}

function impassableWall(
  wall: Omit<WallCollider, "passable">
): WallCollider {
  return { ...wall, passable: false };
}

function wallSegmentForEdge(
  ix: number,
  iz: number,
  edge: NonNullable<BuildPiece["edge"]>,
  baseY: number
): Pick<RoomManifest["walls"][number], "start" | "end"> {
  const b = cellBounds(ix, iz);
  switch (edge) {
    case "n":
      return {
        start: { x: b.minX, y: baseY, z: b.maxZ },
        end: { x: b.maxX, y: baseY, z: b.maxZ }
      };
    case "s":
      return {
        start: { x: b.minX, y: baseY, z: b.minZ },
        end: { x: b.maxX, y: baseY, z: b.minZ }
      };
    case "e":
      return {
        start: { x: b.maxX, y: baseY, z: b.minZ },
        end: { x: b.maxX, y: baseY, z: b.maxZ }
      };
    case "w":
      return {
        start: { x: b.minX, y: baseY, z: b.minZ },
        end: { x: b.minX, y: baseY, z: b.maxZ }
      };
  }
}

export function rampClimbFromRotation(rotation: BuildPiece["rotation"]): {
  climbAxis: "x" | "z";
  climbSign: 1 | -1;
} {
  switch (rotation) {
    case 0:
      return { climbAxis: "z", climbSign: 1 };
    case 90:
      return { climbAxis: "x", climbSign: 1 };
    case 180:
      return { climbAxis: "z", climbSign: -1 };
    case 270:
      return { climbAxis: "x", climbSign: -1 };
  }
}

/** Derive axis-aligned colliders for a grid build piece (render uses the same math). */
export function buildPieceColliders(piece: BuildPiece): BuildPieceColliders {
  const stableId = piece.id.startsWith(BUILD_ID_PREFIX) ? piece.id : buildPieceStableId(piece);
  const baseY = levelToY(piece.level);

  if (piece.kind === "wall") {
    if (!piece.edge) {
      throw new Error("build wall requires edge");
    }
    const segment = wallSegmentForEdge(piece.cell.ix, piece.cell.iz, piece.edge, baseY);
    return {
      walls: [
        impassableWall({
          id: stableId,
          label: "build-wall",
          ...segment,
          height: BUILD_WALL_HEIGHT,
          thickness: BUILD_WALL_THICKNESS,
          anchorIds: [],
          baseY
        })
      ]
    };
  }

  if (piece.kind === "floor") {
    const b = cellBounds(piece.cell.ix, piece.cell.iz);
    return {
      walls: [],
      floorTop: {
        id: stableId,
        minX: b.minX,
        maxX: b.maxX,
        minZ: b.minZ,
        maxZ: b.maxZ,
        topY: baseY + BUILD_FLOOR_THICKNESS
      }
    };
  }

  const b = cellBounds(piece.cell.ix, piece.cell.iz);
  const { climbAxis, climbSign } = rampClimbFromRotation(piece.rotation);
  const ramp: RampSurface = {
    id: stableId,
    minX: b.minX,
    maxX: b.maxX,
    minZ: b.minZ,
    maxZ: b.maxZ,
    lowY: baseY,
    highY: levelToY(piece.level + 1),
    climbAxis,
    climbSign,
    rotation: piece.rotation
  };

  // A ramp contributes a walkable surface only — no collision barriers.
  //
  // The wedge's sides are triangles (0 tall at the low edge, one level tall at the
  // high edge) and its back face is full height. A constant-height axis-aligned wall
  // cannot represent a triangle, so a full-height side/back barrier blocks an avatar
  // standing *on* the surface everywhere except the exact crest — you can't walk off
  // the sides or step off the top. Since walk-off-any-edge is the required behavior,
  // the solid wedge is visual-only. An avatar may cosmetically clip the underside if
  // it walks into the high side at ground level; that is an acceptable v1 tradeoff and
  // groundHeightAt still refuses to lift it onto an out-of-reach surface.
  return { walls: [], ramp };
}

/**
 * Shared client/server placement predicate for build pieces.
 */
export function isBuildAllowedAt(
  manifest: RoomManifest,
  piece: Pick<BuildPiece, "id" | "kind" | "cell" | "level" | "edge" | "rotation" | "materialId">
): { ok: true } | { ok: false; reason: string } {
  if (piece.level < 0 || piece.level > BUILD_MAX_LEVEL) {
    return { ok: false, reason: "level-cap" };
  }
  if (piece.kind === "ramp" && piece.level >= BUILD_MAX_LEVEL) {
    return { ok: false, reason: "level-cap" };
  }

  try {
    buildPieceColliders(piece as BuildPiece);
  } catch {
    return { ok: false, reason: "invalid-piece" };
  }

  const cellFootprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const cellCorners = cellFootprintCorners(cellFootprint);

  if (footprintOverlapsSpawnKeepOut(manifest, cellCorners)) {
    return { ok: false, reason: "spawn-keep-out" };
  }

  const { minX, maxX, minZ, maxZ } = manifest.bounds;
  for (const { x, z } of cellCorners) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) {
      return { ok: false, reason: "out-of-bounds" };
    }
  }

  if (isFreeForAllManifest(manifest)) {
    const mask = freeForAllBuildMask(manifest);
    if (mask) {
      if (footprintOverlapsAnyRect(cellFootprint, mask.halls)) {
        return { ok: false, reason: "hall-keep-out" };
      }
      if (footprintOverlapsExitWedge(cellCorners)) {
        return { ok: false, reason: "exit-keep-out" };
      }
      if (piece.kind === "wall" && footprintOverlapsAnyRect(cellFootprint, mask.boardZones)) {
        return { ok: false, reason: "board-keep-out" };
      }
    }
  }

  return { ok: true };
}

export function collectCollisionWalls(manifest: RoomManifest, buildPieces: BuildPiece[]): WallCollider[] {
  const walls: WallCollider[] = manifest.walls.map((wall) => manifestWallToCollider(wall));
  for (const piece of buildPieces) {
    walls.push(...buildPieceColliders(piece).walls);
  }
  return walls;
}
