import { describe, expect, it } from "vitest";
import type { BuildPiece } from "@3dspace/contracts";
import { BuildPieceSchema } from "@3dspace/contracts";
import { createFreeForAllManifest } from "../src/index.js";
import {
  boardPlacementWalls,
  buildPieceColliders,
  buildWallFacingNormal,
  buildWallPlacementTargetLayout,
  BUILD_CELL_SIZE,
  BUILD_ID_PREFIX,
  BUILD_MAX_LEVEL,
  BUILD_WALL_HEIGHT,
  isBuildAllowedAt,
  levelToY,
  mergeAdjacentBuildWallSegments,
  worldToCell
} from "../src/build.js";

describe("buildPieceColliders", () => {
  it("derives a height-aware wall segment on the cell edge", () => {
    const piece = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}wall:1,2:0:e`,
      roomId: "room-1",
      kind: "wall",
      cell: { ix: 1, iz: 2 },
      level: 1,
      edge: "e",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });

    const { walls, floorTop, ramp } = buildPieceColliders(piece);
    expect(floorTop).toBeUndefined();
    expect(ramp).toBeUndefined();
    expect(walls).toHaveLength(1);
    expect(walls[0]!.id.startsWith(BUILD_ID_PREFIX)).toBe(true);
    expect(walls[0]!.baseY).toBe(levelToY(1));
    expect(walls[0]!.height).toBe(BUILD_WALL_HEIGHT);
    expect(walls[0]!.passable).toBe(false);
    expect(walls[0]!.start.x).toBe(walls[0]!.end.x);
  });

  it("derives a floor top and ramp surface with barrier walls", () => {
    const floor = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}floor:0,0:0`,
      roomId: "room-1",
      kind: "floor",
      cell: { ix: 0, iz: 0 },
      level: 0,
      rotation: 0,
      materialId: "wood",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    const floorColliders = buildPieceColliders(floor);
    expect(floorColliders.floorTop?.topY).toBeGreaterThan(levelToY(0));
    expect(floorColliders.walls).toHaveLength(0);

    const ramp = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}ramp:0,0:0`,
      roomId: "room-1",
      kind: "ramp",
      cell: { ix: 0, iz: 0 },
      level: 0,
      rotation: 0,
      materialId: "metal",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    const rampColliders = buildPieceColliders(ramp);
    expect(rampColliders.ramp?.climbAxis).toBe("z");
    expect(rampColliders.ramp?.climbSign).toBe(1);
    // A ramp is a walkable surface only — no collision barriers, so an avatar can walk off any edge.
    expect(rampColliders.walls).toHaveLength(0);
  });
});

describe("boardPlacementWalls", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-ffa-board-walls" });
  const createdAt = "2026-05-30T12:00:00.000Z";

  it("includes manifest walls plus merged build wall runs (floors/ramps excluded)", () => {
    const wall = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}wall:3,4:0:e`,
      roomId: "room-1",
      kind: "wall",
      cell: { ix: 3, iz: 4 },
      level: 0,
      edge: "e",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt
    });
    const floor = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}floor:0,0:0`,
      roomId: "room-1",
      kind: "floor",
      cell: { ix: 0, iz: 0 },
      level: 0,
      rotation: 0,
      materialId: "wood",
      createdByUserId: "u1",
      createdAt
    });
    const ramp = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}ramp:1,1:0`,
      roomId: "room-1",
      kind: "ramp",
      cell: { ix: 1, iz: 1 },
      level: 0,
      rotation: 0,
      materialId: "metal",
      createdByUserId: "u1",
      createdAt
    });

    const walls = boardPlacementWalls(manifest, [wall, floor, ramp]);
    expect(walls.slice(0, manifest.walls.length)).toEqual(manifest.walls);
    expect(walls).toHaveLength(manifest.walls.length + 1);
    expect(walls.at(-1)!.id).toBe(wall.id);
  });

  it("sets build wall start.y to levelToY(level)", () => {
    const wall = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}wall:1,2:1:e`,
      roomId: "room-1",
      kind: "wall",
      cell: { ix: 1, iz: 2 },
      level: 1,
      edge: "e",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt
    });

    const buildWall = boardPlacementWalls(manifest, [wall]).at(-1)!;
    expect(buildWall.start.y).toBe(levelToY(1));
    expect(buildWall.end.y).toBe(levelToY(1));
  });

  it("returns manifest walls only when build pieces are empty", () => {
    expect(boardPlacementWalls(manifest, [])).toEqual(manifest.walls);
  });
});

function wallBuildPiece(ix: number, iz: number, level: number, edge: "n" | "e" | "s" | "w", createdAt: string) {
  return BuildPieceSchema.parse({
    id: `${BUILD_ID_PREFIX}wall:${ix},${iz}:${level}:${edge}`,
    roomId: "room-1",
    kind: "wall",
    cell: { ix, iz },
    level,
    edge,
    rotation: 0,
    materialId: "stone",
    createdByUserId: "u1",
    createdAt
  });
}

describe("mergeAdjacentBuildWallSegments", () => {
  const createdAt = "2026-05-30T12:00:00.000Z";

  it("merges collinear adjacent build walls into one board surface", () => {
    const pieces = [15, 16, 17].map((ix) => wallBuildPiece(ix, 15, 0, "n", createdAt));
    const buildWalls = pieces.flatMap((piece) => buildPieceColliders(piece).walls);
    const merged = mergeAdjacentBuildWallSegments(buildWalls);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.anchorIds).toEqual(pieces.map((piece) => piece.id));
    expect(Math.hypot(merged[0]!.end.x - merged[0]!.start.x, merged[0]!.end.z - merged[0]!.start.z)).toBeCloseTo(
      BUILD_CELL_SIZE * 3,
      3
    );
  });

  it("does not merge build walls separated by a missing cell", () => {
    const pieces = [wallBuildPiece(15, 15, 0, "n", createdAt), wallBuildPiece(17, 15, 0, "n", createdAt)];
    const buildWalls = pieces.flatMap((piece) => buildPieceColliders(piece).walls);
    expect(mergeAdjacentBuildWallSegments(buildWalls)).toHaveLength(2);
  });

  it("does not merge build walls at different levels", () => {
    const pieces = [wallBuildPiece(15, 15, 0, "e", createdAt), wallBuildPiece(15, 16, 1, "e", createdAt)];
    const buildWalls = pieces.flatMap((piece) => buildPieceColliders(piece).walls);
    expect(mergeAdjacentBuildWallSegments(buildWalls)).toHaveLength(2);
  });
});

describe("buildWallFacingNormal", () => {
  const createdAt = "2026-05-30T12:00:00.000Z";

  it("faces a north build wall toward a reference on the south side", () => {
    const wall = buildPieceColliders(wallBuildPiece(5, 5, 0, "n", createdAt)).walls[0]!;
    const normal = buildWallFacingNormal(wall, { x: wall.start.x + 1, z: wall.start.z - 2 });
    expect(normal).toEqual({ x: 0, y: 0, z: -1 });
  });

  it("faces an east build wall toward a reference on the west side", () => {
    const wall = buildPieceColliders(wallBuildPiece(5, 5, 0, "e", createdAt)).walls[0]!;
    const normal = buildWallFacingNormal(wall, { x: wall.start.x - 2, z: wall.start.z + 1 });
    expect(normal).toEqual({ x: -1, y: 0, z: 0 });
  });
});

describe("buildWallPlacementTargetLayout", () => {
  const createdAt = "2026-05-30T12:00:00.000Z";

  it("aligns thickness on X for east/west build walls", () => {
    const wall = buildPieceColliders(wallBuildPiece(5, 5, 0, "e", createdAt)).walls[0]!;
    const layout = buildWallPlacementTargetLayout(wall);
    expect(layout).not.toBeNull();
    expect(layout!.boxSize[0]).toBeLessThan(layout!.boxSize[2]);
    expect(layout!.rotationY).toBe(0);
  });

  it("aligns thickness on Z for north/south build walls", () => {
    const wall = buildPieceColliders(wallBuildPiece(5, 5, 0, "n", createdAt)).walls[0]!;
    const layout = buildWallPlacementTargetLayout(wall);
    expect(layout).not.toBeNull();
    expect(layout!.boxSize[0]).toBeGreaterThan(layout!.boxSize[2]);
    expect(layout!.rotationY).toBe(0);
  });
});

describe("isBuildAllowedAt", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-ffa-build-test" });

  it("allows pieces inside manifest bounds away from keep-out zones", () => {
    const piece = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}floor:5,5:0`,
      roomId: "room-1",
      kind: "floor",
      cell: { ix: 5, iz: 5 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    expect(isBuildAllowedAt(manifest, piece)).toEqual({ ok: true });
  });

  it("rejects pieces above max level or outside bounds", () => {
    const overLevel = {
      id: `${BUILD_ID_PREFIX}ramp:0,0:${BUILD_MAX_LEVEL}`,
      roomId: "room-1",
      kind: "ramp",
      cell: { ix: 0, iz: 0 },
      level: BUILD_MAX_LEVEL,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    } satisfies BuildPiece;
    expect(isBuildAllowedAt(manifest, overLevel)).toEqual({ ok: false, reason: "level-cap" });

    const outOfBounds = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}floor:999,999:0`,
      roomId: "room-1",
      kind: "floor",
      cell: { ix: 999, iz: 999 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    expect(isBuildAllowedAt(manifest, outOfBounds)).toEqual({ ok: false, reason: "out-of-bounds" });
  });

  it("rejects placements overlapping spawn keep-out", () => {
    const spawn = manifest.spawnPoints[0]!;
    const cell = worldToCell(spawn.position.x, spawn.position.z);
    const piece = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}floor:0,0:0`,
      roomId: "room-1",
      kind: "floor",
      cell,
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    expect(isBuildAllowedAt(manifest, piece)).toEqual({ ok: false, reason: "spawn-keep-out" });
  });

  it("rejects placements in FFA hall corridors", () => {
    const piece = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}floor:12,0:0`,
      roomId: "room-1",
      kind: "floor",
      cell: { ix: 12, iz: 0 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    expect(isBuildAllowedAt(manifest, piece)).toEqual({ ok: false, reason: "hall-keep-out" });
  });

  it("rejects walls in partially hall-overlapping cells using cell bounds, not edge endpoints", () => {
    const cell = { ix: 11, iz: 0 };
    const floor = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}floor:11,0:0`,
      roomId: "room-1",
      kind: "floor",
      cell,
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    expect(isBuildAllowedAt(manifest, floor)).toEqual({ ok: false, reason: "hall-keep-out" });

    const northWall = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}wall:11,0:0:n`,
      roomId: "room-1",
      kind: "wall",
      cell,
      level: 0,
      edge: "n",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    expect(isBuildAllowedAt(manifest, northWall)).toEqual({ ok: false, reason: "hall-keep-out" });
  });

  it("rejects placements in inner FFA exit wedges", () => {
    const cell = worldToCell(18, 0);
    const piece = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}floor:${cell.ix},${cell.iz}:0`,
      roomId: "room-1",
      kind: "floor",
      cell,
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    expect(isBuildAllowedAt(manifest, piece)).toEqual({ ok: false, reason: "exit-keep-out" });
  });

  it("rejects walls fronting static FFA boards but allows floors elsewhere", () => {
    const eastAnchor = manifest.wallAnchors.find((anchor) => anchor.id === "ffa-adj-east-anchor");
    expect(eastAnchor).toBeDefined();
    const boardCell = worldToCell(
      eastAnchor!.position.x + eastAnchor!.normal.x * (BUILD_CELL_SIZE * 0.5),
      eastAnchor!.position.z + eastAnchor!.normal.z * (BUILD_CELL_SIZE * 0.5)
    );

    const wall = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}wall:${boardCell.ix},${boardCell.iz}:0:n`,
      roomId: "room-1",
      kind: "wall",
      cell: boardCell,
      level: 0,
      edge: "n",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    expect(isBuildAllowedAt(manifest, wall)).toEqual({ ok: false, reason: "board-keep-out" });

    const floor = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}floor:5,5:0`,
      roomId: "room-1",
      kind: "floor",
      cell: { ix: 5, iz: 5 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    expect(isBuildAllowedAt(manifest, floor)).toEqual({ ok: true });
  });
});
