import { describe, expect, it } from "vitest";
import { BuildPieceSchema } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_FLOOR_THICKNESS,
  BUILD_ID_PREFIX,
  BUILD_LEVEL_HEIGHT,
  BUILD_STEP_UP_MAX,
  buildPieceColliders,
  createFreeForAllManifest,
  createGroundHeightContext,
  groundHeightAt,
  levelToY,
  rampHeightAt
} from "../src/index.js";

function ctxFor(manifest: ReturnType<typeof createFreeForAllManifest>, pieces: Parameters<typeof createGroundHeightContext>[1]) {
  return createGroundHeightContext(manifest, pieces);
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

describe("groundHeightAt", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-ground-height" });

  it("returns terrain base with no build pieces", () => {
    const ctx = ctxFor(manifest, []);
    expect(groundHeightAt(0, 0, ctx, 0)).toBe(0);
  });

  it("stands on a single floor top", () => {
    const floor = floorPiece(manifest, 2, 2, 0);
    const topY = buildPieceColliders(floor).floorTop!.topY;
    const ctx = ctxFor(manifest, [floor]);
    const x = (floor.cell.ix + 0.5) * BUILD_CELL_SIZE;
    const z = (floor.cell.iz + 0.5) * BUILD_CELL_SIZE;

    expect(topY).toBe(BUILD_FLOOR_THICKNESS);
    expect(groundHeightAt(x, z, ctx, 0)).toBeCloseTo(topY, 5);
  });

  it("steps up a floor lip within BUILD_STEP_UP_MAX", () => {
    const floor = floorPiece(manifest, 0, 0, 0);
    const topY = buildPieceColliders(floor).floorTop!.topY;
    const ctx = ctxFor(manifest, [floor]);
    const x = (floor.cell.ix + 0.5) * BUILD_CELL_SIZE;
    const z = (floor.cell.iz + 0.5) * BUILD_CELL_SIZE;

    expect(topY).toBeLessThanOrEqual(BUILD_STEP_UP_MAX);
    expect(groundHeightAt(x, z, ctx, 0)).toBeCloseTo(topY, 5);
  });

  it("does not step up a full level from terrain", () => {
    const floor = floorPiece(manifest, 4, 4, 1);
    const topY = levelToY(1) + BUILD_FLOOR_THICKNESS;
    const ctx = ctxFor(manifest, [floor]);
    const x = (floor.cell.ix + 0.5) * BUILD_CELL_SIZE;
    const z = (floor.cell.iz + 0.5) * BUILD_CELL_SIZE;

    expect(topY).toBeGreaterThan(BUILD_STEP_UP_MAX);
    expect(groundHeightAt(x, z, ctx, 0)).toBe(0);
  });

  it("descends when walking off a raised floor", () => {
    const floor = floorPiece(manifest, 3, 3, 1);
    const topY = levelToY(1) + BUILD_FLOOR_THICKNESS;
    const ctx = ctxFor(manifest, [floor]);
    const onX = (floor.cell.ix + 0.5) * BUILD_CELL_SIZE;
    const onZ = (floor.cell.iz + 0.5) * BUILD_CELL_SIZE;
    const offX = (floor.cell.ix - 0.5) * BUILD_CELL_SIZE;
    const offZ = (floor.cell.iz + 0.5) * BUILD_CELL_SIZE;

    expect(groundHeightAt(onX, onZ, ctx, topY)).toBeCloseTo(topY, 5);
    expect(groundHeightAt(offX, offZ, ctx, topY)).toBe(0);
  });

  it("picks the higher floor when stacked in the same cell", () => {
    const low = floorPiece(manifest, 1, 1, 0);
    const high = floorPiece(manifest, 1, 1, 1);
    const lowTop = buildPieceColliders(low).floorTop!.topY;
    const highTop = buildPieceColliders(high).floorTop!.topY;
    const ctx = ctxFor(manifest, [low, high]);
    const x = (1 + 0.5) * BUILD_CELL_SIZE;
    const z = (1 + 0.5) * BUILD_CELL_SIZE;

    expect(groundHeightAt(x, z, ctx, highTop)).toBeCloseTo(highTop, 5);
    expect(groundHeightAt(x, z, ctx, lowTop)).toBeCloseTo(lowTop, 5);
    expect(highTop).toBeGreaterThan(lowTop + BUILD_STEP_UP_MAX);
  });

  it("is deterministic for identical inputs", () => {
    const floor = floorPiece(manifest, 5, 5, 0);
    const ctx = ctxFor(manifest, [floor]);
    const x = (5 + 0.5) * BUILD_CELL_SIZE;
    const z = (5 + 0.5) * BUILD_CELL_SIZE;
    const a = groundHeightAt(x, z, ctx, 0);
    const b = groundHeightAt(x, z, ctx, 0);
    expect(a).toBe(b);
  });

  it("teleport mode lands on a raised platform from terrain height", () => {
    const floor = floorPiece(manifest, 6, 6, 1);
    const topY = levelToY(1) + BUILD_FLOOR_THICKNESS;
    const ctx = ctxFor(manifest, [floor]);
    const x = (floor.cell.ix + 0.5) * BUILD_CELL_SIZE;
    const z = (floor.cell.iz + 0.5) * BUILD_CELL_SIZE;

    expect(groundHeightAt(x, z, ctx, 0, "walk")).toBe(0);
    expect(groundHeightAt(x, z, ctx, 0, "teleport")).toBeCloseTo(topY, 5);
    expect(groundHeightAt(x, z, ctx, 0, "snap")).toBeCloseTo(topY, 5);
  });

  it("snap mode elevates a stationary avatar when pieces load underfoot", () => {
    const floor = floorPiece(manifest, 7, 7, 1);
    const topY = levelToY(1) + BUILD_FLOOR_THICKNESS;
    const ctx = ctxFor(manifest, [floor]);
    const x = (floor.cell.ix + 0.5) * BUILD_CELL_SIZE;
    const z = (floor.cell.iz + 0.5) * BUILD_CELL_SIZE;

    expect(groundHeightAt(x, z, ctx, 0, "snap")).toBeCloseTo(topY, 5);
  });
});

describe("rampHeightAt", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-ramp-height" });

  it("interpolates from low to high edge along +Z", () => {
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
    const surface = buildPieceColliders(ramp).ramp!;

    expect(rampHeightAt(surface, 1, surface.minZ)).toBeCloseTo(surface.lowY, 3);
    expect(rampHeightAt(surface, 1, surface.maxZ)).toBeCloseTo(surface.highY, 3);
    expect(rampHeightAt(surface, 1, BUILD_CELL_SIZE / 2)).toBeCloseTo(
      surface.lowY + (surface.highY - surface.lowY) / 2,
      3
    );
  });

  it("contributes to groundHeightAt on the ramp slope", () => {
    const ramp = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}ramp:2,2:0`,
      roomId: manifest.roomId,
      kind: "ramp",
      cell: { ix: 2, iz: 2 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    const surface = buildPieceColliders(ramp).ramp!;
    const ctx = ctxFor(manifest, [ramp]);
    const x = (2 + 0.5) * BUILD_CELL_SIZE;
    const z = 2 * BUILD_CELL_SIZE + 0.25;
    const midY = rampHeightAt(surface, x, z)!;

    expect(groundHeightAt(x, z, ctx, 0)).toBeCloseTo(midY, 3);
  });
});
