import { BuildPieceSchema } from "@3dspace/contracts";
import { describe, expect, it } from "vitest";
import { normalizeBuildPiece } from "../../src/build-pieces/normalize.js";

describe("normalizeBuildPiece", () => {
  it("strips edge on non-wall pieces so Zod validation passes", () => {
    const normalized = normalizeBuildPiece({
      id: "build:floor:1,2:0",
      roomId: "room-1",
      kind: "floor",
      cell: { ix: 1, iz: 2 },
      level: 0,
      edge: null as unknown as undefined,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    expect(normalized.edge).toBeUndefined();
    expect(() => BuildPieceSchema.parse(normalized)).not.toThrow();
  });

  it("keeps edge on doorway pieces", () => {
    const piece = normalizeBuildPiece({
      id: "build:doorway:1,2:0:n",
      roomId: "room-1",
      kind: "doorway",
      cell: { ix: 1, iz: 2 },
      level: 0,
      edge: "n",
      rotation: 0,
      materialId: "wood",
      createdByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    expect(piece.edge).toBe("n");
  });

  it("keeps edge on wall pieces", () => {
    const piece = normalizeBuildPiece({
      id: "build:wall:1,2:0:n",
      roomId: "room-1",
      kind: "wall",
      cell: { ix: 1, iz: 2 },
      level: 0,
      edge: "n",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    expect(piece.edge).toBe("n");
  });

  it("renames retired ceiling-futuristic-dark kind", () => {
    const piece = normalizeBuildPiece({
      id: "build:ceiling-futuristic-dark:1,1:0",
      roomId: "room-1",
      kind: "ceiling-futuristic-dark" as "ceiling-futuristic",
      cell: { ix: 1, iz: 1 },
      level: 0,
      rotation: 0,
      materialId: "metal",
      createdByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    expect(piece.kind).toBe("ceiling-futuristic");
    expect(() => BuildPieceSchema.parse(piece)).not.toThrow();
  });
});
