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

type BoardPlacementWall = RoomManifest["walls"][number];

const BUILD_WALL_PIECE_ID_RE = /^build:wall:(-?\d+),(-?\d+):(\d+):(n|s|e|w)$/;

function parseBuildWallPieceId(id: string) {
  const match = id.match(BUILD_WALL_PIECE_ID_RE);
  if (!match) return null;
  return {
    ix: Number(match[1]),
    iz: Number(match[2]),
    level: Number(match[3]),
    edge: match[4] as NonNullable<BuildPiece["edge"]>
  };
}

function buildWallChainKey(wall: BoardPlacementWall) {
  const parsed = parseBuildWallPieceId(wall.id);
  if (!parsed) return null;
  const baseY = Math.min(wall.start.y, wall.end.y);
  // Walls only share a run when they sit on the same line: an x-run (n/s edge) shares a z, a
  // z-run (e/w edge) shares an x. Without this line coordinate, a same-edge wall in a parallel
  // row collides on the key, sorts between a run's segments, and splits it — so a board can no
  // longer span both cells. Which walls collide depends on every piece's grid position, which
  // is why the failure looked like it depended on where in the room you built.
  const horizontal = parsed.edge === "n" || parsed.edge === "s";
  const lineCoord = horizontal ? wall.start.z : wall.start.x;
  return `${parsed.level}:${parsed.edge}:${baseY}:${wall.height}:${wall.thickness ?? 0}:${lineCoord}`;
}

function buildWallSortAlongAxis(wall: BoardPlacementWall) {
  const parsed = parseBuildWallPieceId(wall.id)!;
  return parsed.edge === "n" || parsed.edge === "s" ? parsed.ix : parsed.iz;
}

function buildWallSegmentsShareEndpoint(a: BoardPlacementWall, b: BoardPlacementWall, epsilon = 0.001) {
  const endsA = [a.start, a.end];
  const endsB = [b.start, b.end];
  return endsA.some((pa) =>
    endsB.some(
      (pb) =>
        Math.abs(pa.x - pb.x) <= epsilon &&
        Math.abs(pa.y - pb.y) <= epsilon &&
        Math.abs(pa.z - pb.z) <= epsilon
    )
  );
}

function mergeBuildWallChain(chain: BoardPlacementWall[]): BoardPlacementWall {
  const first = chain[0]!;
  const parsed = parseBuildWallPieceId(first.id);
  const segmentIds = chain.map((wall) => wall.id);
  if (!parsed || chain.length === 1) {
    return { ...first, anchorIds: segmentIds };
  }

  const horizontal = parsed.edge === "n" || parsed.edge === "s";
  const y = Math.min(first.start.y, first.end.y);
  let start;
  let end;
  if (horizontal) {
    const xs = chain.flatMap((wall) => [wall.start.x, wall.end.x]);
    const z = first.start.z;
    start = { x: Math.min(...xs), y, z };
    end = { x: Math.max(...xs), y, z };
  } else {
    const zs = chain.flatMap((wall) => [wall.start.z, wall.end.z]);
    const x = first.start.x;
    start = { x, y, z: Math.min(...zs) };
    end = { x, y, z: Math.max(...zs) };
  }

  return {
    ...first,
    id: first.id,
    label: "build-wall",
    start,
    end,
    anchorIds: segmentIds
  };
}

/**
 * Merge collinear adjacent build-wall colliders into continuous board surfaces.
 * Segment piece ids are stored on `anchorIds` for orphan checks and overlap scoping.
 */
export function mergeAdjacentBuildWallSegments(buildWalls: BoardPlacementWall[]): BoardPlacementWall[] {
  const byChainKey = new Map<string, BoardPlacementWall[]>();
  for (const wall of buildWalls) {
    const key = buildWallChainKey(wall);
    if (!key) continue;
    const group = byChainKey.get(key) ?? [];
    group.push(wall);
    byChainKey.set(key, group);
  }

  const merged: BoardPlacementWall[] = [];
  for (const group of byChainKey.values()) {
    const sorted = [...group].sort((a, b) => buildWallSortAlongAxis(a) - buildWallSortAlongAxis(b));
    let chain: BoardPlacementWall[] = [sorted[0]!];
    for (let i = 1; i < sorted.length; i++) {
      const segment = sorted[i]!;
      const previous = chain[chain.length - 1]!;
      if (buildWallSegmentsShareEndpoint(previous, segment)) {
        chain.push(segment);
      } else {
        merged.push(mergeBuildWallChain(chain));
        chain = [segment];
      }
    }
    merged.push(mergeBuildWallChain(chain));
  }
  return merged;
}

/** Resolve a build-wall piece id or merged run id to the placement surface and its segments. */
export function resolveBuildWallBoardRun(
  placementWalls: BoardPlacementWall[],
  wallId: string
): { wall: BoardPlacementWall; segmentIds: string[] } | null {
  const direct = placementWalls.find((candidate) => candidate.id === wallId);
  if (direct) {
    const segmentIds = direct.anchorIds?.length ? direct.anchorIds : [direct.id];
    return { wall: direct, segmentIds };
  }
  const parent = placementWalls.find((candidate) => candidate.anchorIds?.includes(wallId));
  if (!parent) return null;
  return { wall: parent, segmentIds: parent.anchorIds!.length ? parent.anchorIds! : [parent.id] };
}

function buildWallRunSharesSegment(
  placementWalls: BoardPlacementWall[],
  wallIdA: string,
  wallIdB: string
) {
  if (wallIdA === wallIdB) return true;
  const runA = resolveBuildWallBoardRun(placementWalls, wallIdA);
  const runB = resolveBuildWallBoardRun(placementWalls, wallIdB);
  if (!runA || !runB) return false;
  return runA.wall.id === runB.wall.id;
}

/**
 * The walls a dynamic board may be placed on: the room's manifest walls plus merged
 * runs of adjacent build `wall` pieces (multi-cell boards span the full run).
 */
export function boardPlacementWalls(
  manifest: { walls: RoomManifest["walls"] },
  buildPieces: BuildPiece[]
): RoomManifest["walls"] {
  const buildWalls = buildPieces
    .filter((piece) => piece.kind === "wall")
    .flatMap((piece) => buildPieceColliders(piece).walls);
  const mergedBuildWalls = mergeAdjacentBuildWallSegments(buildWalls);
  return [...manifest.walls, ...mergedBuildWalls];
}

/** Outward-facing normal for a build wall, chosen to point toward `reference`. */
export function buildWallFacingNormal(
  wall: Pick<BoardPlacementWall, "id" | "start" | "end">,
  reference: { x: number; z: number }
): { x: number; y: number; z: number } | null {
  const parsed = parseBuildWallPieceId(wall.id);
  if (!parsed) return null;

  const wallMidX = (wall.start.x + wall.end.x) / 2;
  const wallMidZ = (wall.start.z + wall.end.z) / 2;
  const toReferenceX = reference.x - wallMidX;
  const toReferenceZ = reference.z - wallMidZ;

  const candidates: Record<
    NonNullable<BuildPiece["edge"]>,
    [{ x: number; y: number; z: number }, { x: number; y: number; z: number }]
  > = {
    n: [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 }
    ],
    s: [
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 1 }
    ],
    e: [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 }
    ],
    w: [
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 }
    ]
  };
  const [n1, n2] = candidates[parsed.edge];
  const d1 = n1.x * toReferenceX + n1.z * toReferenceZ;
  const d2 = n2.x * toReferenceX + n2.z * toReferenceZ;
  return d1 >= d2 ? n1 : n2;
}

/** Axis-aligned hit target for a build wall (thickness axis matches the piece edge). */
export function buildWallPlacementTargetLayout(
  wall: Pick<BoardPlacementWall, "id" | "start" | "end" | "height" | "thickness">
): { boxSize: [number, number, number]; rotationY: number } | null {
  const parsed = parseBuildWallPieceId(wall.id);
  if (!parsed) return null;

  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz) || 1;
  const thickness = Math.max(wall.thickness ?? 0.08, 0.45);

  if (parsed.edge === "e" || parsed.edge === "w") {
    return { boxSize: [thickness, wall.height, length], rotationY: 0 };
  }
  return { boxSize: [length, wall.height, thickness], rotationY: 0 };
}

export { buildWallRunSharesSegment };
