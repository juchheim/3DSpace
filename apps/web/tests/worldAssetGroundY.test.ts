import { describe, expect, it } from "vitest";
import { BuildPieceSchema } from "@3dspace/contracts";
import { BUILD_FLOOR_THICKNESS, BUILD_ID_PREFIX, cellToWorldCenter, createEscapeRoomManifest } from "@3dspace/room-engine";
import { worldAssetGroundY } from "../lib/worldAssetGroundY";

describe("worldAssetGroundY", () => {
  it("returns floor top Y when a build floor covers the point", () => {
    const manifest = createEscapeRoomManifest({ roomId: "r1" });
    const { x, z } = cellToWorldCenter(2, 3);
    const floor = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}floor:2,3:0`,
      roomId: "r1",
      kind: "floor",
      cell: { ix: 2, iz: 3 },
      level: 0,
      rotation: 0,
      materialId: "wood",
      createdByUserId: "u1",
      createdAt: "2026-06-08T12:00:00.000Z"
    });
    const y = worldAssetGroundY(manifest, [floor], x, z);
    expect(y).toBeCloseTo(BUILD_FLOOR_THICKNESS, 5);
  });
});
