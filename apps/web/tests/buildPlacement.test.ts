import { BuildPieceSchema } from "@3dspace/contracts";
import { describe, expect, it } from "vitest";
import { BUILD_CELL_SIZE, createFreeForAllManifest, worldToCell } from "@3dspace/room-engine";
import {
  alignWallEdgeToNeighbors,
  avatarStandingLevel,
  buildPlacementStatusMessage,
  checkBuildCapsForPlacements,
  evaluateBuildPlacement,
  findBuildPieceForDestroy,
  findSurfacePieceAtCell,
  fixturePlacementLevel,
  inferRampRotationFromHit,
  nearestWallEdge,
  resolveBuildPlacementTarget,
  resolvePlaceAheadBuildTarget,
  resolveRampRotation,
  tryAcquireBuildPlacementSlot,
  wallFacingRotation
} from "../lib/buildPlacement";

/** FFA spawns sit on a radius-10 ring; stay outside spawn keep-out with 3 m cells. */
const SAFE_PLACE_X = -18;
const SAFE_PLACE_Z = -18;

function wallPieceAt(ix: number, iz: number, edge: "n" | "s" | "e" | "w") {
  return BuildPieceSchema.parse({
    id: `build:wall:${ix},${iz}:0:${edge}`,
    roomId: "room-placement",
    kind: "wall",
    cell: { ix, iz },
    level: 0,
    edge,
    rotation: 0,
    materialId: "stone",
    createdByUserId: "user-1",
    createdAt: "2026-05-31T00:00:00.000Z"
  });
}

describe("alignWallEdgeToNeighbors", () => {
  it("snaps a perpendicular cursor edge collinear with an adjacent run", () => {
    // (5,5) already holds an n-wall; placing at (6,5) with a cursor 'e' should extend the run.
    const existing = wallPieceAt(5, 5, "n");
    expect(alignWallEdgeToNeighbors({ ix: 6, iz: 5 }, 0, "e", { [existing.id]: existing })).toBe("n");
  });

  it("keeps the cursor edge for a standalone wall", () => {
    expect(alignWallEdgeToNeighbors({ ix: 6, iz: 5 }, 0, "e", {})).toBe("e");
  });

  it("keeps the cursor edge when it already aligns with the run", () => {
    const existing = wallPieceAt(5, 5, "n");
    expect(alignWallEdgeToNeighbors({ ix: 6, iz: 5 }, 0, "n", { [existing.id]: existing })).toBe("n");
  });

  it("does not snap across a perpendicular neighbour (keeps corners buildable)", () => {
    // (6,5) holds an n-wall (a horizontal run); placing the corner turn at (6,6) with 'e' must
    // stay 'e' — (6,5) is a front/back neighbour, not part of an e/w run.
    const existing = wallPieceAt(6, 5, "n");
    expect(alignWallEdgeToNeighbors({ ix: 6, iz: 6 }, 0, "e", { [existing.id]: existing })).toBe("e");
  });

  it("keeps the cursor edge when two different runs meet (ambiguous)", () => {
    const horizontal = wallPieceAt(5, 5, "n"); // suggests 'n' for (6,5)
    const vertical = wallPieceAt(6, 6, "e"); // suggests 'e' for (6,5)
    const pieces = { [horizontal.id]: horizontal, [vertical.id]: vertical };
    expect(alignWallEdgeToNeighbors({ ix: 6, iz: 5 }, 0, "s", pieces)).toBe("s");
  });

  it("only aligns within the same level", () => {
    const existing = wallPieceAt(5, 5, "n"); // level 0
    expect(alignWallEdgeToNeighbors({ ix: 6, iz: 5 }, 1, "e", { [existing.id]: existing })).toBe("e");
  });
});

describe("wallFacingRotation", () => {
  it("flips a wall so its front faces the placer", () => {
    // North edge of cell (3,3) sits at world z = 12.
    expect(wallFacingRotation("n", { ix: 3, iz: 3 }, 7, 6)).toBe(180); // placer south of the line
    expect(wallFacingRotation("n", { ix: 3, iz: 3 }, 7, 13)).toBe(0); // placer north of the line
    // East edge of cell (3,3) sits at world x = 12.
    expect(wallFacingRotation("e", { ix: 3, iz: 3 }, 13, 7)).toBe(0); // placer east of the line
    expect(wallFacingRotation("e", { ix: 3, iz: 3 }, 6, 7)).toBe(180); // placer west of the line
  });

  it("orients a placed wall toward the avatar", () => {
    const south = resolveBuildPlacementTarget({
      tool: "wall",
      hitX: 10.5,
      hitY: 0,
      hitZ: 11.2,
      rotation: 0,
      materialId: "stone",
      avatarX: 10.5,
      avatarZ: 10
    });
    expect(south.edge).toBe("n");
    expect(south.rotation).toBe(180);
  });
});

describe("buildPlacement", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-placement" });

  it("picks the nearest wall edge from a hit point", () => {
    expect(nearestWallEdge(35, 16.5, 11, 5)).toBe("e");
    expect(nearestWallEdge(16.5, 35, 5, 11)).toBe("n");
  });

  it("derives the avatar's standing level from feet height", () => {
    expect(avatarStandingLevel(0)).toBe(0); // ground
    expect(avatarStandingLevel(3.3)).toBe(1); // on a level-1 floor (levelToY(1) + floor thickness)
    expect(avatarStandingLevel(6.5)).toBe(2);
  });

  it("extends a floor at the avatar's standing level when the cursor hits empty ground", () => {
    // Standing on a level-1 floor (feet ≈ 3.3); aim at the empty neighbour cell, where the
    // ray hits the ground plane (hitY ≈ 0, no surface piece). Without baseLevel this fell to 0.
    const target = resolveBuildPlacementTarget({
      tool: "floor",
      hitX: 12.1,
      hitY: 0.001,
      hitZ: 10,
      rotation: 0,
      materialId: "stone",
      surfacePiece: null,
      baseLevel: avatarStandingLevel(3.3)
    });
    expect(target.kind).toBe("floor");
    expect(target.level).toBe(1);
  });

  it("still builds on the ground (level 0) when the avatar is standing on the ground", () => {
    const target = resolveBuildPlacementTarget({
      tool: "floor",
      hitX: 12.1,
      hitY: 0.001,
      hitZ: 10,
      rotation: 0,
      materialId: "stone",
      surfacePiece: null,
      baseLevel: avatarStandingLevel(0)
    });
    expect(target.level).toBe(0);
  });

  it("rejects hall-overlapping wall targets consistently with floors", () => {
    const target = resolveBuildPlacementTarget({
      tool: "wall",
      hitX: 25.5,
      hitY: 0,
      hitZ: 2.5,
      rotation: 0,
      materialId: "stone"
    });
    expect(target.cell).toEqual({ ix: 8, iz: 0 });
    expect(target.edge).toBe("n");
    const preview = evaluateBuildPlacement(manifest, target, "room-placement", "user-1");
    expect(preview.allowed).toBe(false);
    expect(preview.reason).toBe("hall-keep-out");
  });

  it("rejects a second ramp in the same cell and level when ids differ", () => {
    const rampTarget = resolveBuildPlacementTarget({
      tool: "ramp",
      hitX: SAFE_PLACE_X,
      hitY: 0,
      hitZ: SAFE_PLACE_Z,
      rotation: 0,
      materialId: "stone"
    });
    const existingRamp = {
      ...evaluateBuildPlacement(manifest, rampTarget, "room-placement", "user-1").piece,
      id: "build:ramp:10,10:0:legacy"
    };
    const piecesById = { [existingRamp.id]: existingRamp };

    const secondRamp = evaluateBuildPlacement(manifest, rampTarget, "room-placement", "user-1", piecesById);
    expect(secondRamp.allowed).toBe(false);
    expect(secondRamp.reason).toBe("slot-occupied");
  });

  it("allows a floor and ramp to share the same cell and level", () => {
    const target = resolveBuildPlacementTarget({
      tool: "floor",
      hitX: SAFE_PLACE_X,
      hitY: 0,
      hitZ: SAFE_PLACE_Z,
      rotation: 0,
      materialId: "stone"
    });
    const existingFloor = evaluateBuildPlacement(manifest, target, "room-placement", "user-1").piece;
    const piecesById = { [existingFloor.id]: existingFloor };

    const rampTarget = resolveBuildPlacementTarget({
      tool: "ramp",
      hitX: SAFE_PLACE_X,
      hitY: 0,
      hitZ: SAFE_PLACE_Z,
      rotation: 0,
      materialId: "stone"
    });
    const rampPreview = evaluateBuildPlacement(manifest, rampTarget, "room-placement", "user-1", piecesById);
    expect(rampPreview.allowed).toBe(true);
  });

  it("places a ramp on a floor at the floor level with climb toward the hit", () => {
    const ix = 8;
    const iz = 8;
    const centerX = (ix + 0.5) * BUILD_CELL_SIZE;
    const centerZ = (iz + 0.5) * BUILD_CELL_SIZE;
    const floor = BuildPieceSchema.parse({
      id: "build:floor:8,8:0",
      roomId: manifest.roomId,
      kind: "floor",
      cell: { ix, iz },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });

    const northTarget = resolveBuildPlacementTarget({
      tool: "ramp",
      hitX: centerX,
      hitY: 0.3,
      hitZ: centerZ + BUILD_CELL_SIZE * 0.45,
      rotation: 180,
      materialId: "stone",
      surfacePiece: floor
    });
    expect(northTarget.level).toBe(0);
    expect(northTarget.rotation).toBe(0);

    const southTarget = resolveBuildPlacementTarget({
      tool: "ramp",
      hitX: centerX,
      hitY: 0.3,
      hitZ: centerZ - BUILD_CELL_SIZE * 0.45,
      rotation: 0,
      materialId: "stone",
      surfacePiece: floor
    });
    expect(southTarget.rotation).toBe(180);

    const piecesById = { [floor.id]: floor };
    const placement = evaluateBuildPlacement(manifest, northTarget, "room-placement", "user-1", piecesById);
    expect(placement.allowed).toBe(true);
  });

  it("uses manual ramp rotation when the user pressed R", () => {
    const ix = 6;
    const iz = 6;
    const centerX = (ix + 0.5) * BUILD_CELL_SIZE;
    const centerZ = (iz + 0.5) * BUILD_CELL_SIZE;
    const floor = BuildPieceSchema.parse({
      id: "build:floor:6,6:0",
      roomId: manifest.roomId,
      kind: "floor",
      cell: { ix, iz },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });

    const autoTarget = resolveBuildPlacementTarget({
      tool: "ramp",
      hitX: centerX,
      hitY: 0.3,
      hitZ: centerZ + BUILD_CELL_SIZE * 0.45,
      rotation: 90,
      materialId: "stone",
      surfacePiece: floor,
      rampRotationOverride: false
    });
    expect(autoTarget.rotation).toBe(0);

    const manualTarget = resolveBuildPlacementTarget({
      tool: "ramp",
      hitX: centerX,
      hitY: 0.3,
      hitZ: centerZ + BUILD_CELL_SIZE * 0.45,
      rotation: 90,
      materialId: "stone",
      surfacePiece: floor,
      rampRotationOverride: true
    });
    expect(manualTarget.rotation).toBe(90);
    expect(resolveRampRotation(centerX, centerZ + 0.45, ix, iz, 90, true)).toBe(90);
    expect(resolveRampRotation(centerX, centerZ + 0.45, ix, iz, 90, false)).toBe(0);
  });

  it("infers ramp rotation from hit quadrant", () => {
    const ix = 4;
    const iz = 4;
    const centerX = (ix + 0.5) * BUILD_CELL_SIZE;
    const centerZ = (iz + 0.5) * BUILD_CELL_SIZE;
    expect(inferRampRotationFromHit(centerX + 0.5, centerZ, ix, iz)).toBe(90);
    expect(inferRampRotationFromHit(centerX, centerZ + 0.5, ix, iz)).toBe(0);
    expect(inferRampRotationFromHit(centerX, centerZ - 0.5, ix, iz)).toBe(180);
    expect(inferRampRotationFromHit(centerX - 0.5, centerZ, ix, iz)).toBe(270);
  });

  it("resolves place-ahead one cell in front of avatar facing", () => {
    const target = resolvePlaceAheadBuildTarget({
      tool: "floor",
      avatarPosition: { x: 10, y: 0, z: 10 },
      rotationY: 0,
      rotation: 0,
      materialId: "stone"
    });
    expect(target.cell.iz).toBeGreaterThan(worldToCell(10, 10).iz);
  });

  it("place-ahead extends floor at the same level when target cell has a floor", () => {
    const floor = BuildPieceSchema.parse({
      id: "build:floor:5:5:0",
      roomId: "room-placement",
      kind: "floor",
      cell: { ix: 5, iz: 6 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "user-1",
      createdAt: new Date().toISOString()
    });
    const target = resolvePlaceAheadBuildTarget({
      tool: "floor",
      avatarPosition: { x: 16.5, y: 0.3, z: 16.5 },
      rotationY: 0,
      rotation: 0,
      materialId: "stone",
      pieces: [floor]
    });
    expect(target.cell).toEqual({ ix: 5, iz: 6 });
    // Same level as the existing floor — extending horizontally, not stacking above.
    expect(target.level).toBe(0);
  });

  it("finds topmost destroy target at a cell", () => {
    const floor = BuildPieceSchema.parse({
      id: "build:floor:2:2:1",
      roomId: "room-placement",
      kind: "floor",
      cell: { ix: 2, iz: 2 },
      level: 1,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "user-1",
      createdAt: new Date().toISOString()
    });
    const hitX = 2 * BUILD_CELL_SIZE + BUILD_CELL_SIZE / 2;
    const hitZ = 2 * BUILD_CELL_SIZE + BUILD_CELL_SIZE / 2;
    expect(findBuildPieceForDestroy([floor], hitX, hitZ)?.id).toBe(floor.id);
  });

  it("findSurfacePieceAtCell picks reachable floor top", () => {
    const floor = BuildPieceSchema.parse({
      id: "build:floor:3:3:0",
      roomId: "room-placement",
      kind: "floor",
      cell: { ix: 3, iz: 3 },
      level: 0,
      rotation: 0,
      materialId: "wood",
      createdByUserId: "user-1",
      createdAt: new Date().toISOString()
    });
    const found = findSurfacePieceAtCell([floor], { ix: 3, iz: 3 }, 0.35);
    expect(found?.id).toBe(floor.id);
  });

  it("tryAcquireBuildPlacementSlot enforces spacing", () => {
    const lastAt = { current: 0 };
    expect(tryAcquireBuildPlacementSlot(lastAt)).toBe(true);
    expect(tryAcquireBuildPlacementSlot(lastAt)).toBe(false);
  });

  it("checkBuildCapsForPlacements rejects user and room caps", () => {
    const target = resolveBuildPlacementTarget({
      tool: "floor",
      hitX: SAFE_PLACE_X,
      hitY: 0,
      hitZ: SAFE_PLACE_Z,
      rotation: 0,
      materialId: "stone"
    });
    const userPieces = Array.from({ length: 400 }, (_, index) =>
      BuildPieceSchema.parse({
        id: `build:floor:${index},0:0`,
        roomId: "room-placement",
        kind: "floor",
        cell: { ix: index, iz: 0 },
        level: 0,
        rotation: 0,
        materialId: "stone",
        createdByUserId: "user-1",
        createdAt: new Date().toISOString()
      })
    );
    const userCap = checkBuildCapsForPlacements(userPieces, "user-1", [target]);
    expect(userCap.ok).toBe(false);
    if (!userCap.ok) {
      expect(userCap.reason).toBe("user-cap");
      expect(buildPlacementStatusMessage(userCap.reason)).toBe("Build piece limit reached for this user");
    }

    const roomPieces = Array.from({ length: 1000 }, (_, index) =>
      BuildPieceSchema.parse({
        id: `build:floor:${index},1:0`,
        roomId: "room-placement",
        kind: "floor",
        cell: { ix: index, iz: 1 },
        level: 0,
        rotation: 0,
        materialId: "stone",
        createdByUserId: "user-2",
        createdAt: new Date().toISOString()
      })
    );
    const roomCap = checkBuildCapsForPlacements(roomPieces, "user-2", [target]);
    expect(roomCap.ok).toBe(false);
    if (!roomCap.ok) {
      expect(roomCap.reason).toBe("room-cap");
      expect(buildPlacementStatusMessage(roomCap.reason)).toBe("Build piece limit reached for this room");
    }
  });

  it("evaluateBuildPlacement returns friendly cap messages", () => {
    const target = resolveBuildPlacementTarget({
      tool: "floor",
      hitX: SAFE_PLACE_X,
      hitY: 0,
      hitZ: SAFE_PLACE_Z,
      rotation: 0,
      materialId: "stone"
    });
    const userPieces = Array.from({ length: 400 }, (_, index) =>
      BuildPieceSchema.parse({
        id: `build:floor:${index},0:0`,
        roomId: "room-placement",
        kind: "floor",
        cell: { ix: index, iz: 0 },
        level: 0,
        rotation: 0,
        materialId: "stone",
        createdByUserId: "user-1",
        createdAt: new Date().toISOString()
      })
    );
    const preview = evaluateBuildPlacement(manifest, target, "room-placement", "user-1", Object.fromEntries(userPieces.map((piece) => [piece.id, piece])));
    expect(preview.allowed).toBe(false);
    expect(preview.message).toBe("Build piece limit reached for this user");
  });

  it("allows replacing a piece at the same stable slot", () => {
    const target = resolveBuildPlacementTarget({
      tool: "floor",
      hitX: SAFE_PLACE_X,
      hitY: 0,
      hitZ: SAFE_PLACE_Z,
      rotation: 0,
      materialId: "stone"
    });
    const existing = evaluateBuildPlacement(manifest, target, "room-placement", "user-1").piece;
    const replaceTarget = { ...target, materialId: "wood" as const };
    const preview = evaluateBuildPlacement(manifest, replaceTarget, "room-placement", "user-1", {
      [existing.id]: existing
    });
    expect(preview.allowed).toBe(true);
  });
});

describe("image-floor placement", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-placement" });
  const TEXTURE_A = "rooms/room-placement/floor-textures/a.webp";
  const TEXTURE_B = "rooms/room-placement/floor-textures/b.webp";

  function imageFloorTarget(texture?: string, textureSpanCells?: 2 | 4 | 8) {
    return resolveBuildPlacementTarget({
      tool: "image-floor",
      hitX: SAFE_PLACE_X,
      hitY: 0,
      hitZ: SAFE_PLACE_Z,
      rotation: 0,
      materialId: "stone",
      ...(texture ? { textureStorageKey: texture } : {}),
      ...(textureSpanCells ? { textureSpanCells } : {})
    });
  }

  it("resolves an image-floor target carrying the selected texture", () => {
    const target = imageFloorTarget(TEXTURE_A);
    expect(target.kind).toBe("image-floor");
    expect(target.level).toBe(0);
    expect(target.textureStorageKey).toBe(TEXTURE_A);
  });

  it("resolves an image-floor target carrying the selected texture span", () => {
    const target = imageFloorTarget(TEXTURE_A, 8);
    expect(target.textureSpanCells).toBe(8);
  });

  it("blocks an image floor where a plain floor already sits (and vice versa)", () => {
    const floorTarget = resolveBuildPlacementTarget({
      tool: "floor",
      hitX: SAFE_PLACE_X,
      hitY: 0,
      hitZ: SAFE_PLACE_Z,
      rotation: 0,
      materialId: "stone"
    });
    const plainFloor = evaluateBuildPlacement(manifest, floorTarget, "room-placement", "user-1").piece;

    const imageOverPlain = evaluateBuildPlacement(
      manifest,
      imageFloorTarget(TEXTURE_A),
      "room-placement",
      "user-1",
      { [plainFloor.id]: plainFloor }
    );
    expect(imageOverPlain.allowed).toBe(false);
    expect(imageOverPlain.reason).toBe("slot-occupied");

    const imageFloor = evaluateBuildPlacement(
      manifest,
      imageFloorTarget(TEXTURE_A),
      "room-placement",
      "user-1"
    ).piece;
    const plainOverImage = evaluateBuildPlacement(manifest, floorTarget, "room-placement", "user-1", {
      [imageFloor.id]: imageFloor
    });
    expect(plainOverImage.allowed).toBe(false);
    expect(plainOverImage.reason).toBe("slot-occupied");
  });

  it("allows repainting an image floor in place with a different texture", () => {
    const existing = {
      ...evaluateBuildPlacement(manifest, imageFloorTarget(TEXTURE_A), "room-placement", "user-1").piece,
      id: "build:image-floor:-6,-6:0:legacy"
    };
    const repaint = evaluateBuildPlacement(
      manifest,
      imageFloorTarget(TEXTURE_B),
      "room-placement",
      "user-1",
      { [existing.id]: existing }
    );
    expect(repaint.allowed).toBe(true);
  });

  it("allows repainting an image floor in place with a different texture span", () => {
    const existing = {
      ...evaluateBuildPlacement(manifest, imageFloorTarget(TEXTURE_A, 4), "room-placement", "user-1").piece,
      id: "build:image-floor:-6,-6:0:legacy"
    };
    const repaint = evaluateBuildPlacement(
      manifest,
      imageFloorTarget(TEXTURE_A, 8),
      "room-placement",
      "user-1",
      { [existing.id]: existing }
    );
    expect(repaint.allowed).toBe(true);
  });

  it("rejects the same texture in an occupied slot when ids differ (no-op sweep)", () => {
    const existing = {
      ...evaluateBuildPlacement(manifest, imageFloorTarget(TEXTURE_A), "room-placement", "user-1").piece,
      id: "build:image-floor:-6,-6:0:legacy"
    };
    const samePaint = evaluateBuildPlacement(
      manifest,
      imageFloorTarget(TEXTURE_A),
      "room-placement",
      "user-1",
      { [existing.id]: existing }
    );
    expect(samePaint.allowed).toBe(false);
    expect(samePaint.reason).toBe("slot-occupied");
  });

  it("has a friendly message for the missing-texture state", () => {
    expect(buildPlacementStatusMessage("floor-texture-missing")).toBe("Upload or pick a floor image first");
  });
});

describe("fixturePlacementLevel", () => {
  it("uses the standing level on empty ground", () => {
    expect(fixturePlacementLevel(null, 0)).toBe(0);
    expect(fixturePlacementLevel(null, 1)).toBe(1);
  });

  it("uses the floor level when aiming at a floor top", () => {
    const floor = BuildPieceSchema.parse({
      id: "build:floor:2,2:1",
      roomId: "room-placement",
      kind: "floor",
      cell: { ix: 2, iz: 2 },
      level: 1,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "user-1",
      createdAt: "2026-05-31T00:00:00.000Z"
    });
    expect(fixturePlacementLevel(floor, 0)).toBe(1);
  });

  it("ignores wall hit height and keeps the standing level", () => {
    const wall = wallPieceAt(3, 3, "n");
    expect(fixturePlacementLevel(wall, 0)).toBe(0);
  });
});

describe("ceiling fixture placement target", () => {
  it("places at the standing level even when the ray hits mid-wall", () => {
    const wall = wallPieceAt(3, 3, "n");
    const target = resolveBuildPlacementTarget({
      tool: "ceiling-futuristic",
      hitX: SAFE_PLACE_X,
      hitY: 6,
      hitZ: SAFE_PLACE_Z,
      rotation: 0,
      materialId: "stone",
      surfacePiece: wall,
      baseLevel: 0
    });
    expect(target.level).toBe(0);
    expect(target.kind).toBe("ceiling-futuristic");
  });

  it("does not treat an existing ceiling hit as level 1", () => {
    const existing = BuildPieceSchema.parse({
      id: "build:ceiling-futuristic:3,3:0",
      roomId: "room-placement",
      kind: "ceiling-futuristic",
      cell: { ix: 3, iz: 3 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "user-1",
      createdAt: "2026-05-31T00:00:00.000Z"
    });
    const target = resolveBuildPlacementTarget({
      tool: "ceiling-futuristic",
      hitX: 12,
      hitY: 2.9,
      hitZ: 12,
      rotation: 0,
      materialId: "stone",
      surfacePiece: existing,
      baseLevel: 0
    });
    expect(target.level).toBe(0);
  });
});
