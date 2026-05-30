import { describe, expect, it } from "vitest";
import { BuildPieceSchema } from "@3dspace/contracts";
import {
  AVATAR_STAND_HEIGHT,
  BUILD_CELL_SIZE,
  BUILD_FLOOR_THICKNESS,
  BUILD_ID_PREFIX,
  BUILD_LEVEL_HEIGHT,
  BUILD_STEP_UP_MAX,
  buildPieceColliders,
  collectCollisionWalls,
  createFreeForAllManifest,
  createGroundHeightContext,
  groundHeightAt,
  levelToY,
  resolveWallCollisionsV2
} from "../src/index.js";

function floorPiece(
  manifest: ReturnType<typeof createFreeForAllManifest>,
  ix: number,
  iz: number,
  level: number
) {
  return BuildPieceSchema.parse({
    id: `${BUILD_ID_PREFIX}floor:${ix},${iz}:${level}`,
    roomId: manifest.roomId,
    kind: "floor",
    cell: { ix, iz },
    level,
    rotation: 0,
    materialId: "stone",
    createdByUserId: "u1",
    createdAt: "2026-05-30T12:00:00.000Z"
  });
}

function wallPiece(
  manifest: ReturnType<typeof createFreeForAllManifest>,
  ix: number,
  iz: number,
  level: number,
  edge: "n" | "e" | "s" | "w"
) {
  return BuildPieceSchema.parse({
    id: `${BUILD_ID_PREFIX}wall:${ix},${iz}:${level}:${edge}`,
    roomId: manifest.roomId,
    kind: "wall",
    cell: { ix, iz },
    level,
    edge,
    rotation: 0,
    materialId: "stone",
    createdByUserId: "u1",
    createdAt: "2026-05-30T12:00:00.000Z"
  });
}

describe("build movement matrix", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-build-matrix" });

  it("walk mode: terrain → floor lip → level-1 platform → descend off edge", () => {
    const groundFloor = floorPiece(manifest, 4, 4, 0);
    const platform = floorPiece(manifest, 5, 5, 1);
    const ctx = createGroundHeightContext(manifest, [groundFloor, platform]);

    const groundTop = BUILD_FLOOR_THICKNESS;
    const platformTop = levelToY(1) + BUILD_FLOOR_THICKNESS;
    const onGroundX = 4.5 * BUILD_CELL_SIZE;
    const onGroundZ = 4.5 * BUILD_CELL_SIZE;
    const onPlatformX = 5.5 * BUILD_CELL_SIZE;
    const onPlatformZ = 5.5 * BUILD_CELL_SIZE;
    const offPlatformX = 6.5 * BUILD_CELL_SIZE;

    expect(groundHeightAt(onGroundX, onGroundZ, ctx, 0, "walk")).toBeCloseTo(groundTop, 5);
    expect(groundHeightAt(onPlatformX, onPlatformZ, ctx, 0, "snap")).toBeCloseTo(platformTop, 5);
    expect(groundHeightAt(onPlatformX, onPlatformZ, ctx, platformTop, "walk")).toBeCloseTo(platformTop, 5);
    expect(groundHeightAt(offPlatformX, onPlatformZ, ctx, platformTop, "walk")).toBe(0);
  });

  it("walk mode: cannot step up a full level from terrain without teleport/snap", () => {
    const platform = floorPiece(manifest, 3, 3, 1);
    const ctx = createGroundHeightContext(manifest, [platform]);
    const x = 3.5 * BUILD_CELL_SIZE;
    const z = 3.5 * BUILD_CELL_SIZE;
    const topY = levelToY(1) + BUILD_FLOOR_THICKNESS;

    expect(topY).toBeGreaterThan(BUILD_STEP_UP_MAX);
    expect(groundHeightAt(x, z, ctx, 0, "walk")).toBe(0);
    expect(groundHeightAt(x, z, ctx, 0, "snap")).toBeCloseTo(topY, 5);
  });

  it("collision: build wall blocks ground-level passage but not over-wall movement", () => {
    const piece = wallPiece(manifest, 5, 0, 0, "e");
    const walls = collectCollisionWalls(manifest, [piece]);
    const wall = buildPieceColliders(piece).walls[0]!;
    const midX = (wall.start.x + wall.end.x) / 2;
    const midZ = (wall.start.z + wall.end.z) / 2;

    const blocked = resolveWallCollisionsV2(
      { x: midX - 0.5, z: midZ },
      { x: midX + 0.5, z: midZ },
      walls,
      0,
      AVATAR_STAND_HEIGHT
    );
    expect(blocked.x).toBeLessThan(midX + 0.5);

    const overWall = resolveWallCollisionsV2(
      { x: midX - 0.5, z: midZ },
      { x: midX + 0.5, z: midZ },
      walls,
      wall.baseY + BUILD_LEVEL_HEIGHT,
      AVATAR_STAND_HEIGHT
    );
    expect(overWall.x).toBeCloseTo(midX + 0.5, 3);
  });

  it("collision + ground: avatar stands on floor top after snap", () => {
    const floor = floorPiece(manifest, 6, 6, 0);
    const ctx = createGroundHeightContext(manifest, [floor]);
    const topY = buildPieceColliders(floor).floorTop!.topY;
    const x = 6.5 * BUILD_CELL_SIZE;
    const z = 6.5 * BUILD_CELL_SIZE;

    expect(groundHeightAt(x, z, ctx, 0, "snap")).toBeCloseTo(topY, 5);
    expect(topY).toBeCloseTo(BUILD_FLOOR_THICKNESS, 5);
  });

  it("stacked floors in one cell: highest reachable surface wins in walk mode", () => {
    const low = floorPiece(manifest, 7, 7, 0);
    const high = floorPiece(manifest, 7, 7, 1);
    const ctx = createGroundHeightContext(manifest, [low, high]);
    const x = 7.5 * BUILD_CELL_SIZE;
    const z = 7.5 * BUILD_CELL_SIZE;
    const highTop = levelToY(1) + BUILD_FLOOR_THICKNESS;

    expect(groundHeightAt(x, z, ctx, highTop, "walk")).toBeCloseTo(highTop, 5);
  });
});
