import { describe, expect, it } from "vitest";
import type { BuildPiece } from "@3dspace/contracts";
import { BuildPieceSchema } from "@3dspace/contracts";
import { createFreeForAllManifest } from "../src/index.js";
import {
  buildPieceColliders,
  BUILD_CELL_SIZE,
  BUILD_ID_PREFIX,
  BUILD_MAX_LEVEL,
  BUILD_WALL_HEIGHT,
  isBuildAllowedAt,
  levelToY,
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
    expect(rampColliders.walls.length).toBeGreaterThan(0);
    expect(rampColliders.walls.every((wall) => wall.passable === false)).toBe(true);
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
