import { describe, expect, it } from "vitest";
import { BuildPieceSchema } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_ID_PREFIX,
  BUILD_WALL_HEIGHT,
  buildPieceColliders,
  collectCollisionWalls,
  createFreeForAllManifest,
  createWorkforceTrainingManifest,
  levelToY,
  resolveWallCollisions,
  resolveWallCollisionsV2
} from "../src/index.js";

describe("resolveWallCollisionsV2 ground-level regression", () => {
  const workforceManifest = createWorkforceTrainingManifest({ roomId: "room-wt-collision" });
  const ffaManifest = createFreeForAllManifest({ roomId: "room-ffa-collision" });

  const cases = [
    {
      name: "workforce back-left corner west",
      manifest: workforceManifest,
      oldPos: { x: -23.1, z: 22 },
      newPos: { x: -24.5, z: 22 }
    },
    {
      name: "workforce back-left corner north",
      manifest: workforceManifest,
      oldPos: { x: -22, z: 23.1 },
      newPos: { x: -22, z: 24.5 }
    },
    {
      name: "ffa perimeter clamp",
      manifest: ffaManifest,
      oldPos: { x: 22.5, z: 6 },
      newPos: { x: 23.8, z: 6 }
    },
    {
      name: "ffa exit arc pass-through",
      manifest: ffaManifest,
      oldPos: { x: 22.5, z: 0.1 },
      newPos: { x: 23.8, z: 0.1 }
    },
    {
      name: "ffa adjoining room lateral",
      manifest: ffaManifest,
      oldPos: { x: 35, z: 0 },
      newPos: { x: 35, z: 0.8 }
    }
  ] as const;

  it.each(cases)("$name matches resolveWallCollisions at y=0", ({ manifest, oldPos, newPos }) => {
    const legacy = resolveWallCollisions(oldPos, newPos, manifest.walls);
    const heightAware = resolveWallCollisionsV2(
      oldPos,
      newPos,
      collectCollisionWalls(manifest, []),
      0
    );
    expect(heightAware).toEqual(legacy);
  });
});

describe("build-piece wall collision", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-build-collision" });

  it("blocks ground-level movement through a built wall", () => {
    const piece = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}wall:5,0:0:e`,
      roomId: manifest.roomId,
      kind: "wall",
      cell: { ix: 5, iz: 0 },
      level: 0,
      edge: "e",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    const wall = buildPieceColliders(piece).walls[0]!;
    expect(wall.id.startsWith(BUILD_ID_PREFIX)).toBe(true);

    const wallX = wall.start.x;
    const stopX = wallX - (wall.thickness ?? 0) / 2 - 0.4;
    const startZ = (piece.cell.iz + 0.5) * BUILD_CELL_SIZE;

    const result = resolveWallCollisionsV2(
      { x: stopX + 0.5, z: startZ },
      { x: stopX - 1.5, z: startZ },
      collectCollisionWalls(manifest, [piece]),
      0
    );

    expect(result.x).toBeCloseTo(stopX, 3);
    expect(result.z).toBeCloseTo(startZ, 3);
  });

  it("does not block movement under an elevated build wall", () => {
    const piece = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}wall:5,0:2:e`,
      roomId: manifest.roomId,
      kind: "wall",
      cell: { ix: 5, iz: 0 },
      level: 2,
      edge: "e",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    const wall = buildPieceColliders(piece).walls[0]!;
    expect(wall.baseY).toBe(levelToY(2));
    expect(wall.height).toBe(BUILD_WALL_HEIGHT);

    const wallX = wall.start.x;
    const passX = wallX - (wall.thickness ?? 0) / 2 - 0.8;
    const startZ = (piece.cell.iz + 0.5) * BUILD_CELL_SIZE;

    const result = resolveWallCollisionsV2(
      { x: passX + 0.5, z: startZ },
      { x: passX - 1.5, z: startZ },
      collectCollisionWalls(manifest, [piece]),
      0
    );

    expect(result.x).toBeCloseTo(passX - 1.5, 3);
    expect(result.z).toBeCloseTo(startZ, 3);
  });

  describe("ramp barrier collision", () => {
    const ramp = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}ramp:0,0:0`,
      roomId: manifest.roomId,
      kind: "ramp",
      cell: { ix: 0, iz: 0 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    const rampWalls = buildPieceColliders(ramp).walls;
    const backWall = rampWalls.find((wall) => wall.id.endsWith(":back"))!;
    const sideWall = rampWalls.find((wall) => wall.id.endsWith(":side-w"))!;

    it("includes back and side barriers in the collision set", () => {
      const walls = collectCollisionWalls(manifest, [ramp]);
      const rampBarrierIds = walls
        .filter((wall) => wall.id.startsWith(BUILD_ID_PREFIX))
        .map((wall) => wall.id);
      expect(rampBarrierIds).toContain(backWall.id);
      expect(rampBarrierIds).toContain(sideWall.id);
    });

    it("blocks ground-level movement through the ramp back barrier", () => {
      const wallZ = backWall.start.z;
      const stopZ = wallZ - (backWall.thickness ?? 0) / 2 - 0.4;
      const startX = (ramp.cell.ix + 0.5) * BUILD_CELL_SIZE;

      const result = resolveWallCollisionsV2(
        { x: startX, z: stopZ - 0.5 },
        { x: startX, z: stopZ + 1.5 },
        collectCollisionWalls(manifest, [ramp]),
        0
      );

      expect(result.x).toBeCloseTo(startX, 3);
      expect(result.z).toBeCloseTo(stopZ, 3);
    });

    it("blocks ground-level movement through a ramp side barrier", () => {
      const wallX = sideWall.start.x;
      const stopX = wallX + (sideWall.thickness ?? 0) / 2 + 0.4;
      const startZ = (ramp.cell.iz + 0.5) * BUILD_CELL_SIZE;

      const result = resolveWallCollisionsV2(
        { x: stopX + 0.5, z: startZ },
        { x: stopX - 1.5, z: startZ },
        collectCollisionWalls(manifest, [ramp]),
        0
      );

      expect(result.x).toBeCloseTo(stopX, 3);
      expect(result.z).toBeCloseTo(startZ, 3);
    });

    it("does not block movement under elevated ramp barriers", () => {
      const elevatedRamp = { ...ramp, level: 2 as const, id: `${BUILD_ID_PREFIX}ramp:0,0:2` };
      const wallZ = backWall.start.z;
      const passZ = wallZ - (backWall.thickness ?? 0) / 2 - 0.8;
      const startX = (ramp.cell.ix + 0.5) * BUILD_CELL_SIZE;

      const result = resolveWallCollisionsV2(
        { x: startX, z: passZ - 0.5 },
        { x: startX, z: passZ + 1.5 },
        collectCollisionWalls(manifest, [elevatedRamp]),
        0
      );

      expect(result.z).toBeCloseTo(passZ + 1.5, 3);
    });
  });
});
