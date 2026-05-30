import { BuildPieceSchema } from "@3dspace/contracts";
import { describe, expect, it } from "vitest";
import { BUILD_CELL_SIZE, createFreeForAllManifest, worldToCell } from "@3dspace/room-engine";
import {
  avatarStandingLevel,
  buildPlacementStatusMessage,
  checkBuildCapsForPlacements,
  evaluateBuildPlacement,
  findBuildPieceForDestroy,
  findSurfacePieceAtCell,
  inferRampRotationFromHit,
  nearestWallEdge,
  resolveBuildPlacementTarget,
  resolvePlaceAheadBuildTarget,
  resolveRampRotation,
  tryAcquireBuildPlacementSlot
} from "../lib/buildPlacement";

describe("buildPlacement", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-placement" });

  it("picks the nearest wall edge from a hit point", () => {
    expect(nearestWallEdge(23.8, 11, 11, 5)).toBe("e");
    expect(nearestWallEdge(11, 23.8, 5, 11)).toBe("n");
  });

  it("derives the avatar's standing level from feet height", () => {
    expect(avatarStandingLevel(0)).toBe(0); // ground
    expect(avatarStandingLevel(2.3)).toBe(1); // on a level-1 floor (levelToY(1) + floor thickness)
    expect(avatarStandingLevel(4.3)).toBe(2);
  });

  it("extends a floor at the avatar's standing level when the cursor hits empty ground", () => {
    // Standing on a level-1 floor (feet ≈ 2.3); aim at the empty neighbour cell, where the
    // ray hits the ground plane (hitY ≈ 0, no surface piece). Without baseLevel this fell to 0.
    const target = resolveBuildPlacementTarget({
      tool: "floor",
      hitX: 12.1,
      hitY: 0.001,
      hitZ: 10,
      rotation: 0,
      materialId: "stone",
      surfacePiece: null,
      baseLevel: avatarStandingLevel(2.3)
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
      hitX: 23,
      hitY: 0,
      hitZ: 1.9,
      rotation: 0,
      materialId: "stone"
    });
    expect(target.cell).toEqual({ ix: 11, iz: 0 });
    expect(target.edge).toBe("n");
    const preview = evaluateBuildPlacement(manifest, target, "room-placement", "user-1");
    expect(preview.allowed).toBe(false);
    expect(preview.reason).toBe("hall-keep-out");
  });

  it("rejects a second ramp in the same cell and level when ids differ", () => {
    const rampTarget = resolveBuildPlacementTarget({
      tool: "ramp",
      hitX: 10,
      hitY: 0,
      hitZ: 10,
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
      hitX: 10,
      hitY: 0,
      hitZ: 10,
      rotation: 0,
      materialId: "stone"
    });
    const existingFloor = evaluateBuildPlacement(manifest, target, "room-placement", "user-1").piece;
    const piecesById = { [existingFloor.id]: existingFloor };

    const rampTarget = resolveBuildPlacementTarget({
      tool: "ramp",
      hitX: 10,
      hitY: 0,
      hitZ: 10,
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

  it("place-ahead stacks on floor surface at target cell", () => {
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
      avatarPosition: { x: 10, y: 0.3, z: 10 },
      rotationY: 0,
      rotation: 0,
      materialId: "stone",
      pieces: [floor]
    });
    expect(target.cell).toEqual({ ix: 5, iz: 6 });
    expect(target.level).toBe(1);
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
      hitX: 10,
      hitY: 0,
      hitZ: 10,
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
      hitX: 10,
      hitY: 0,
      hitZ: 10,
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
      hitX: 10,
      hitY: 0,
      hitZ: 10,
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
