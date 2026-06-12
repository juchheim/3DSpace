import { BuildPieceSchema, type BuildPiece } from "@3dspace/contracts";
import { BUILD_CELL_SIZE } from "@3dspace/room-engine";
import { describe, expect, it } from "vitest";
import { computeImageFloorRegions, imageFloorUvAt } from "../lib/imageFloorRegions";

function imageFloorPiece(
  ix: number,
  iz: number,
  options: { level?: number; texture?: string } = {}
): BuildPiece {
  const level = options.level ?? 0;
  const texture = options.texture ?? "rooms/room-1/floor-textures/tex-a.webp";
  return BuildPieceSchema.parse({
    id: `build:image-floor:${ix},${iz}:${level}`,
    roomId: "room-1",
    kind: "image-floor",
    cell: { ix, iz },
    level,
    rotation: 0,
    materialId: "stone",
    textureStorageKey: texture,
    createdByUserId: "user-1",
    createdAt: "2026-06-12T00:00:00.000Z"
  });
}

describe("computeImageFloorRegions", () => {
  it("merges edge-adjacent tiles with the same texture into one region", () => {
    const pieces = [imageFloorPiece(0, 0), imageFloorPiece(1, 0), imageFloorPiece(1, 1)];
    const regions = computeImageFloorRegions(pieces);
    const region = regions.get(pieces[0]!.id)!;
    expect(region).toBeDefined();
    expect(regions.get(pieces[1]!.id)).toBe(region);
    expect(regions.get(pieces[2]!.id)).toBe(region);
    // Bounding rect spans cells (0..1, 0..1).
    expect(region.minX).toBe(0);
    expect(region.maxX).toBe(2 * BUILD_CELL_SIZE);
    expect(region.minZ).toBe(0);
    expect(region.maxZ).toBe(2 * BUILD_CELL_SIZE);
    expect(region.pieceIds).toHaveLength(3);
  });

  it("does not merge diagonal-only neighbours", () => {
    const a = imageFloorPiece(0, 0);
    const b = imageFloorPiece(1, 1);
    const regions = computeImageFloorRegions([a, b]);
    expect(regions.get(a.id)!.regionId).not.toBe(regions.get(b.id)!.regionId);
  });

  it("separates adjacent tiles with different textures", () => {
    const a = imageFloorPiece(0, 0, { texture: "rooms/room-1/floor-textures/tex-a.webp" });
    const b = imageFloorPiece(1, 0, { texture: "rooms/room-1/floor-textures/tex-b.webp" });
    const regions = computeImageFloorRegions([a, b]);
    expect(regions.get(a.id)!.regionId).not.toBe(regions.get(b.id)!.regionId);
  });

  it("separates tiles on different levels", () => {
    const a = imageFloorPiece(0, 0, { level: 0 });
    const b = imageFloorPiece(1, 0, { level: 1 });
    const regions = computeImageFloorRegions([a, b]);
    expect(regions.get(a.id)!.regionId).not.toBe(regions.get(b.id)!.regionId);
  });

  it("ignores plain floors", () => {
    const plain = BuildPieceSchema.parse({
      id: "build:floor:0,0:0",
      roomId: "room-1",
      kind: "floor",
      cell: { ix: 0, iz: 0 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "user-1",
      createdAt: "2026-06-12T00:00:00.000Z"
    });
    expect(computeImageFloorRegions([plain]).size).toBe(0);
  });

  it("is deterministic regardless of input order", () => {
    const pieces = [imageFloorPiece(0, 0), imageFloorPiece(1, 0), imageFloorPiece(2, 0)];
    const forward = computeImageFloorRegions(pieces).get(pieces[0]!.id)!;
    const reversed = computeImageFloorRegions([...pieces].reverse()).get(pieces[0]!.id)!;
    expect(forward.regionId).toBe(reversed.regionId);
    expect(forward.pieceIds).toEqual(reversed.pieceIds);
  });
});

describe("imageFloorUvAt", () => {
  it("stretches the image across the region bounds with the top at minZ", () => {
    const pieces = [imageFloorPiece(0, 0), imageFloorPiece(1, 0)];
    const region = computeImageFloorRegions(pieces).get(pieces[0]!.id)!;
    // West edge → u=0; east edge → u=1.
    expect(imageFloorUvAt(region, region.minX, region.minZ).u).toBe(0);
    expect(imageFloorUvAt(region, region.maxX, region.minZ).u).toBe(1);
    // minZ edge is the image top (v=1); maxZ edge the bottom (v=0).
    expect(imageFloorUvAt(region, region.minX, region.minZ).v).toBe(1);
    expect(imageFloorUvAt(region, region.minX, region.maxZ).v).toBe(0);
    // Centre maps to the middle of the image.
    const centre = imageFloorUvAt(region, (region.minX + region.maxX) / 2, (region.minZ + region.maxZ) / 2);
    expect(centre.u).toBeCloseTo(0.5);
    expect(centre.v).toBeCloseTo(0.5);
  });
});
