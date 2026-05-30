import { describe, expect, it } from "vitest";
import { BuildPieceSchema } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_FLOOR_THICKNESS,
  BUILD_ID_PREFIX,
  buildPieceColliders,
  collectCollisionWalls,
  createFreeForAllManifest,
  createGroundHeightContext,
  groundHeightAt,
  levelToY,
  rampClimbFromRotation,
  rampHeightAt,
  resolveWallCollisionsV2
} from "../src/index.js";

function rampPiece(
  manifest: ReturnType<typeof createFreeForAllManifest>,
  ix: number,
  iz: number,
  level: number,
  rotation: 0 | 90 | 180 | 270 = 0
) {
  return BuildPieceSchema.parse({
    id: `${BUILD_ID_PREFIX}ramp:${ix},${iz}:${level}`,
    roomId: manifest.roomId,
    kind: "ramp",
    cell: { ix, iz },
    level,
    rotation,
    materialId: "stone",
    createdByUserId: "u1",
    createdAt: "2026-05-30T12:00:00.000Z"
  });
}

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

function simulateWalkAlongRamp(
  manifest: ReturnType<typeof createFreeForAllManifest>,
  ramp: ReturnType<typeof rampPiece>,
  direction: "up" | "down",
  steps = 28
) {
  const ctx = createGroundHeightContext(manifest, [ramp]);
  const surface = buildPieceColliders(ramp).ramp!;
  const { climbAxis, climbSign } = rampClimbFromRotation(ramp.rotation);
  const centerX = (ramp.cell.ix + 0.5) * BUILD_CELL_SIZE;
  const centerZ = (ramp.cell.iz + 0.5) * BUILD_CELL_SIZE;

  let y = direction === "up" ? surface.lowY : surface.highY;
  const heights: number[] = [y];

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (climbAxis === "z") {
      const lowZ = climbSign === 1 ? surface.minZ + 0.02 : surface.maxZ - 0.02;
      const highZ = climbSign === 1 ? surface.maxZ - 0.02 : surface.minZ + 0.02;
      const startZ = direction === "up" ? lowZ : highZ;
      const endZ = direction === "up" ? highZ : lowZ;
      const z = startZ + (endZ - startZ) * t;
      y = groundHeightAt(centerX, z, ctx, y, "walk");
    } else {
      const lowX = climbSign === 1 ? surface.minX + 0.02 : surface.maxX - 0.02;
      const highX = climbSign === 1 ? surface.maxX - 0.02 : surface.minX + 0.02;
      const startX = direction === "up" ? lowX : highX;
      const endX = direction === "up" ? highX : lowX;
      const x = startX + (endX - startX) * t;
      y = groundHeightAt(x, centerZ, ctx, y, "walk");
    }
    heights.push(y);
  }

  return { heights, surface };
}

describe("ramp walking simulation", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-ramp-walk" });

  it("walks up a +Z ramp with monotonically increasing height", () => {
    const ramp = rampPiece(manifest, 2, 2, 0, 0);
    const { heights, surface } = simulateWalkAlongRamp(manifest, ramp, "up");
    const centerX = (2 + 0.5) * BUILD_CELL_SIZE;
    const endZ = surface.maxZ - 0.02;
    const expectedTop = rampHeightAt(surface, centerX, endZ)!;

    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]!).toBeGreaterThanOrEqual(heights[i - 1]! - 1e-6);
    }
    expect(heights[heights.length - 1]).toBeCloseTo(expectedTop, 2);
    expect(heights[0]).toBeCloseTo(surface.lowY, 2);
    // Climbed nearly a full level (relative to the ramp's rise — independent of the level-height constant).
    expect(expectedTop).toBeGreaterThan(surface.lowY + (surface.highY - surface.lowY) * 0.9);
  });

  it("walks down a +Z ramp with decreasing height", () => {
    const ramp = rampPiece(manifest, 3, 3, 0, 0);
    const { heights, surface } = simulateWalkAlongRamp(manifest, ramp, "down");
    const centerX = (3 + 0.5) * BUILD_CELL_SIZE;
    const endZ = surface.minZ + 0.02;
    const expectedBottom = rampHeightAt(surface, centerX, endZ)!;

    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]!).toBeLessThanOrEqual(heights[i - 1]! + 1e-6);
    }
    expect(heights[heights.length - 1]).toBeCloseTo(expectedBottom, 2);
    expect(heights[0]).toBeCloseTo(surface.highY, 2);
    expect(expectedBottom).toBeLessThan(0.2);
  });

  it("connects ramp top to a floor on the next level in the same cell", () => {
    const ramp = rampPiece(manifest, 4, 4, 0, 0);
    const floor = floorPiece(manifest, 4, 4, 1);
    const floorTop = levelToY(1) + BUILD_FLOOR_THICKNESS;
    const ctx = createGroundHeightContext(manifest, [ramp, floor]);
    const surface = buildPieceColliders(ramp).ramp!;
    const x = (4 + 0.5) * BUILD_CELL_SIZE;
    const z = surface.maxZ - 0.06;

    let y = surface.highY - 0.05;
    y = groundHeightAt(x, z, ctx, y, "walk");

    expect(y).toBeCloseTo(floorTop, 2);
  });

  it("does not block an avatar walking off the side of a ramp", () => {
    const ramp = rampPiece(manifest, 5, 5, 0, 0);
    // A ramp adds no collision barriers — you can leave the surface from any edge.
    expect(buildPieceColliders(ramp).walls).toEqual([]);

    const surface = buildPieceColliders(ramp).ramp!;
    const centerX = (5 + 0.5) * BUILD_CELL_SIZE;
    const midZ = (surface.minZ + surface.maxZ) / 2;
    const feetY = rampHeightAt(surface, centerX, midZ)!;

    const result = resolveWallCollisionsV2(
      { x: centerX, z: midZ },
      { x: surface.minX - 1.0, z: midZ },
      collectCollisionWalls(manifest, [ramp]),
      feetY
    );

    expect(result.x).toBeCloseTo(surface.minX - 1.0, 3);
  });
});

describe("rampHeightAt along climb axes", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-ramp-axes" });

  it("interpolates along +X for rotation 90", () => {
    const ramp = rampPiece(manifest, 1, 1, 0, 90);
    const surface = buildPieceColliders(ramp).ramp!;
    const z = (1 + 0.5) * BUILD_CELL_SIZE;
    expect(rampHeightAt(surface, surface.minX, z)).toBeCloseTo(surface.lowY, 3);
    expect(rampHeightAt(surface, surface.maxX, z)).toBeCloseTo(surface.highY, 3);
  });
});
