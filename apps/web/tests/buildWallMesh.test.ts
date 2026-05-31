import { describe, expect, it } from "vitest";
import type { BuildPiece } from "@3dspace/contracts";
import { BUILD_CELL_SIZE, BUILD_WALL_THICKNESS, buildPieceColliders } from "@3dspace/room-engine";
import { wallMeshTransform } from "../lib/buildWallMesh";

function wallPiece(edge: "n" | "s" | "e" | "w", level = 0): BuildPiece {
  return {
    id: `build:wall:-9,1:${level}:${edge}`,
    roomId: "room_test",
    kind: "wall",
    cell: { ix: -9, iz: 1 },
    level,
    edge,
    rotation: 0,
    materialId: "stone",
    createdByUserId: "user_1",
    createdAt: "2026-05-31T00:00:00.000Z"
  };
}

/** World-space X/Z extents of an axis-aligned box after a Y-rotation of 0 or ±90°. */
function worldExtents(size: [number, number, number], rotationY: number) {
  const swapped = Math.abs(Math.abs(rotationY) - Math.PI / 2) < 1e-6;
  return swapped ? { x: size[2], z: size[0] } : { x: size[0], z: size[2] };
}

describe("wallMeshTransform", () => {
  it.each(["n", "s", "e", "w"] as const)(
    "renders the %s wall coplanar with its collider (not perpendicular)",
    (edge) => {
      const piece = wallPiece(edge);
      const collider = buildPieceColliders(piece).walls[0]!;
      const runsAlongZ = Math.abs(collider.end.z - collider.start.z) > Math.abs(collider.end.x - collider.start.x);

      const { size, rotationY } = wallMeshTransform(piece);
      const extents = worldExtents(size, rotationY);

      if (runsAlongZ) {
        // e/w walls: long along Z, thin along X. The old Math.PI/2 bug swapped these.
        expect(extents.z).toBeCloseTo(BUILD_CELL_SIZE);
        expect(extents.x).toBeCloseTo(BUILD_WALL_THICKNESS);
      } else {
        // n/s walls: long along X, thin along Z.
        expect(extents.x).toBeCloseTo(BUILD_CELL_SIZE);
        expect(extents.z).toBeCloseTo(BUILD_WALL_THICKNESS);
      }
    }
  );

  it("centers the mesh on the collider midpoint and the level base", () => {
    const piece = wallPiece("e", 1);
    const collider = buildPieceColliders(piece).walls[0]!;
    const { position } = wallMeshTransform(piece);
    expect(position[0]).toBeCloseTo((collider.start.x + collider.end.x) / 2);
    expect(position[2]).toBeCloseTo((collider.start.z + collider.end.z) / 2);
    // Sits above the elevated base, not at y=0.
    expect(position[1]).toBeGreaterThan(collider.baseY);
  });
});
