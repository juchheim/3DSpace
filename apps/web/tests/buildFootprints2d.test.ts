import { describe, expect, it } from "vitest";
import type { BuildPiece, RoomManifest } from "@3dspace/contracts";
import { BUILD_CELL_SIZE, createFreeForAllManifest } from "@3dspace/room-engine";
import {
  floorFootprintRect,
  rampFootprintArrow,
  wallFootprintSegment
} from "../lib/buildFootprints2d";

describe("buildFootprints2d", () => {
  const manifest = createFreeForAllManifest({ roomId: "ffa-footprints" }) as RoomManifest;
  const roomId = "ffa-footprints";

  it("projects a floor cell to a non-degenerate rect", () => {
    const piece: BuildPiece = {
      id: "build:floor:0:0:0",
      roomId,
      kind: "floor",
      cell: { ix: 1, iz: 2 },
      level: 1,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: new Date().toISOString()
    };
    const rect = floorFootprintRect(manifest, piece);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it("projects a wall as a line segment on the cell edge", () => {
    const piece: BuildPiece = {
      id: "build:wall:0:0:0:e",
      roomId,
      kind: "wall",
      cell: { ix: 0, iz: 0 },
      level: 0,
      edge: "e",
      rotation: 0,
      materialId: "wood",
      createdByUserId: "u1",
      createdAt: new Date().toISOString()
    };
    const segment = wallFootprintSegment(manifest, piece);
    expect(segment).not.toBeNull();
    const dx = segment!.end.x - segment!.start.x;
    const dy = segment!.end.y - segment!.start.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(0.5);
  });

  it("projects a ramp climb arrow with tip away from tail", () => {
    const piece: BuildPiece = {
      id: "build:ramp:1:1:0",
      roomId,
      kind: "ramp",
      cell: { ix: 1, iz: 1 },
      level: 0,
      rotation: 0,
      materialId: "metal",
      createdByUserId: "u1",
      createdAt: new Date().toISOString()
    };
    const arrow = rampFootprintArrow(manifest, piece);
    expect(arrow).not.toBeNull();
    const climbSpan =
      Math.abs(arrow!.tip.x - arrow!.tail.x) + Math.abs(arrow!.tip.y - arrow!.tail.y);
    expect(climbSpan).toBeGreaterThan(BUILD_CELL_SIZE * 0.2);
  });
});
