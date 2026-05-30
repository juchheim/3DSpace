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
  rampHeightAt,
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

  describe("ramp surface has no collision barriers", () => {
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
    // Climb +z across the cell (x∈[0,2], z∈[0,2]); surface rises lowY=0 → highY=levelToY(1).
    const surface = buildPieceColliders(ramp).ramp!;
    const centerX = (ramp.cell.ix + 0.5) * BUILD_CELL_SIZE;

    it("contributes a walkable surface but no collision walls", () => {
      const colliders = buildPieceColliders(ramp);
      expect(colliders.ramp).toBeDefined();
      expect(colliders.walls).toEqual([]);
    });

    it("adds no build colliders to the room collision set", () => {
      const buildWallIds = collectCollisionWalls(manifest, [ramp])
        .filter((wall) => wall.id.startsWith(BUILD_ID_PREFIX))
        .map((wall) => wall.id);
      expect(buildWallIds).toEqual([]);
    });

    it("lets an avatar standing on the ramp walk off the side", () => {
      // Mid-ramp: feet on the sloped surface, then step west past the side edge (x < minX).
      const midZ = (surface.minZ + surface.maxZ) / 2;
      const feetY = rampHeightAt(surface, centerX, midZ)!;
      // Genuinely elevated — a full-height side barrier would have trapped the avatar here.
      expect(feetY).toBeGreaterThan(surface.lowY + 0.5);

      const result = resolveWallCollisionsV2(
        { x: centerX, z: midZ },
        { x: surface.minX - 1.0, z: midZ },
        collectCollisionWalls(manifest, [ramp]),
        feetY
      );

      expect(result.x).toBeCloseTo(surface.minX - 1.0, 3);
      expect(result.z).toBeCloseTo(midZ, 3);
    });

    it("lets an avatar step off the high (top) edge of the ramp", () => {
      // Near the top: feet high on the surface, then continue past the high edge (z > maxZ).
      const nearTopZ = surface.maxZ - 0.2;
      const feetY = rampHeightAt(surface, centerX, nearTopZ)!;

      const result = resolveWallCollisionsV2(
        { x: centerX, z: nearTopZ },
        { x: centerX, z: surface.maxZ + 1.0 },
        collectCollisionWalls(manifest, [ramp]),
        feetY
      );

      expect(result.x).toBeCloseTo(centerX, 3);
      expect(result.z).toBeCloseTo(surface.maxZ + 1.0, 3);
    });
  });
});
