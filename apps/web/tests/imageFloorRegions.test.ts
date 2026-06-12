import { BuildPieceSchema, type BuildPiece } from "@3dspace/contracts";
import { BUILD_CELL_SIZE } from "@3dspace/room-engine";
import { describe, expect, it } from "vitest";
import {
  computeImageFloorRegions,
  DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS,
  imageFloorUvAt
} from "../lib/imageFloorRegions";

function imageFloorPiece(
  ix: number,
  iz: number,
  options: { level?: number; texture?: string; textureSpanCells?: 2 | 4 | 8 } = {}
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
    ...(options.textureSpanCells ? { textureSpanCells: options.textureSpanCells } : {}),
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

  it("separates adjacent tiles with different texture spans", () => {
    const a = imageFloorPiece(0, 0, { textureSpanCells: 2 });
    const b = imageFloorPiece(1, 0, { textureSpanCells: 4 });
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
  it("shows one cell as a 1/span slice of the image", () => {
    const cell = BUILD_CELL_SIZE;
    const span = DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS;
    const region = computeImageFloorRegions([imageFloorPiece(0, 0)]).get(
      imageFloorPiece(0, 0).id
    )!;
    expect(imageFloorUvAt(region, 0, 0)).toEqual({ u: 0, v: 1 });
    expect(imageFloorUvAt(region, cell, 0)).toEqual({ u: 1 / span, v: 1 });
    expect(imageFloorUvAt(region, cell, cell)).toEqual({ u: 1 / span, v: 1 - 1 / span });
    expect(imageFloorUvAt(region, 0, cell)).toEqual({ u: 0, v: 1 - 1 / span });
  });

  it("shows the full image once on a span×span floor", () => {
    const cell = BUILD_CELL_SIZE;
    const span = DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS;
    const pieces = Array.from({ length: span * span }, (_, index) =>
      imageFloorPiece(index % span, Math.floor(index / span))
    );
    const region = computeImageFloorRegions(pieces).get(pieces[0]!.id)!;
    expect(imageFloorUvAt(region, 0, 0)).toEqual({ u: 0, v: 1 });
    expect(imageFloorUvAt(region, span * cell, 0)).toEqual({ u: 1, v: 1 });
    expect(imageFloorUvAt(region, span * cell, span * cell)).toEqual({ u: 1, v: 0 });
    expect(imageFloorUvAt(region, 0, span * cell)).toEqual({ u: 0, v: 0 });
  });

  it("reveals more of the image as the region grows from the min corner", () => {
    const cell = BUILD_CELL_SIZE;
    const span = DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS;
    const oneCell = computeImageFloorRegions([imageFloorPiece(0, 0)]).get(imageFloorPiece(0, 0).id)!;
    const twoWide = computeImageFloorRegions([imageFloorPiece(0, 0), imageFloorPiece(1, 0)]).get(
      imageFloorPiece(0, 0).id
    )!;
    expect(imageFloorUvAt(oneCell, cell, 0).u).toBeCloseTo(1 / span);
    expect(imageFloorUvAt(twoWide, 2 * cell, 0).u).toBeCloseTo(2 / span);
  });

  it("uses the piece textureSpanCells for UV scale", () => {
    const cell = BUILD_CELL_SIZE;
    const region = computeImageFloorRegions([imageFloorPiece(0, 0, { textureSpanCells: 8 })]).get(
      imageFloorPiece(0, 0, { textureSpanCells: 8 }).id
    )!;
    expect(imageFloorUvAt(region, cell, 0)).toEqual({ u: 1 / 8, v: 1 });
  });
});
