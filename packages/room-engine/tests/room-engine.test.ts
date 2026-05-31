import { BuildPieceSchema } from "@3dspace/contracts";
import { describe, expect, it } from "vitest";
import {
  anchorHasOccupyingWallObject,
  anchorAcceptsWallObjectType,
  anchorSupportsCreateOption,
  applyDefaultWallAnchorDimensions,
  boardPlacementWalls,
  buildPieceColliders,
  canTouchRoomObject,
  calculateSpatialAudio,
  isOccupyingWallObjectStatus,
  isBoardGrantActive,
  clampPositionToBounds,
  createAvatarState,
  roomCenterXZ,
  rotationFacingRoomCenter,
  createDefaultRoomManifest,
  createFreeForAllManifest,
  validateDynamicBoardPlacement,
  createWorkforceTrainingManifest,
  interpolateAvatarState,
  delta2DToWorldXZ,
  projectPositionTo2D,
  resolveWallCollisions,
  selectSpawnPoint,
  transformLocalMovementToWorld,
  unprojectPointFrom2D,
  WIDESCREEN_ASPECT,
  widescreenHeight,
  applyDefaultRoomGeometry,
  PRIMARY_BOARD_WIDTH,
  PRIMARY_BOARD_HEIGHT,
  PRIMARY_BOARD_CENTER_X,
  PRIMARY_BOARD_CENTER_Y,
  FRONT_MEDIA_WIDTH,
  FRONT_MEDIA_CENTER_X,
  FRONT_MEDIA_CENTER_Y,
  LEFT_RESOURCE_RAIL_WIDTH,
  LEFT_RESOURCE_RAIL_HEIGHT,
  LEFT_RESOURCE_RAIL_CENTER_Y,
  LEFT_RESOURCE_RAIL_CENTER_Z,
  RIGHT_RESOURCE_RAIL_WIDTH,
  RIGHT_RESOURCE_RAIL_HEIGHT,
  RIGHT_RESOURCE_RAIL_CENTER_Y,
  RIGHT_RESOURCE_RAIL_CENTER_Z,
  SECONDARY_BOARD_WIDTH,
  SECONDARY_BOARD_HEIGHT,
  BACK_DISPLAY_CENTER_Y
} from "../src/index";
import type { ClassroomBoardAccessGrant, RoomObject } from "@3dspace/contracts";

describe("room engine", () => {
  it("creates a manifest with shared 3D and 2D data", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });

    expect(manifest.roomId).toBe("room_1");
    expect(manifest.spawnPoints.length).toBeGreaterThan(0);
    expect(manifest.wallAnchors.map((anchor) => anchor.id)).toContain("anchor-board");
    expect(manifest.capabilities.maxParticipants).toBe(30);
    expect(manifest.projection.kind).toBe("top-down-v1");
  });

  it("derives wall create options from anchor metadata.accepts", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const board = manifest.wallAnchors.find((anchor) => anchor.id === "anchor-board");
    const media = manifest.wallAnchors.find((anchor) => anchor.id === "anchor-media-left");
    const left = manifest.wallAnchors.find((anchor) => anchor.id === "anchor-left");
    const right = manifest.wallAnchors.find((anchor) => anchor.id === "anchor-right");
    const back = manifest.wallAnchors.find((anchor) => anchor.id === "anchor-back");

    expect(board).toBeDefined();
    expect(media).toBeDefined();
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(back).toBeDefined();
    expect(anchorSupportsCreateOption(board!, "poll")).toBe(true);
    expect(anchorSupportsCreateOption(board!, "camera")).toBe(true);
    expect(anchorSupportsCreateOption(board!, "microphone")).toBe(true);
    expect(anchorSupportsCreateOption(media!, "poll")).toBe(false);
    expect(anchorSupportsCreateOption(media!, "microphone")).toBe(true);
    expect(anchorSupportsCreateOption(media!, "screen")).toBe(false);
    expect(anchorSupportsCreateOption(left!, "camera")).toBe(true);
    expect(anchorSupportsCreateOption(left!, "microphone")).toBe(true);
    expect(anchorSupportsCreateOption(left!, "screen")).toBe(true);
    expect(anchorSupportsCreateOption(right!, "camera")).toBe(true);
    expect(anchorSupportsCreateOption(back!, "screen")).toBe(true);
  });

  it("uses 16:9 widescreen proportions for front media and primary board sizing", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    expect(widescreenHeight(16)).toBe(9);
    const board = manifest.wallAnchors.find((anchor) => anchor.id === "anchor-board");
    const media = manifest.wallAnchors.find((anchor) => anchor.id === "anchor-media-left");
    expect(media!.width / media!.height).toBeCloseTo(WIDESCREEN_ASPECT, 5);
    expect(board?.width).toBe(PRIMARY_BOARD_WIDTH);
    expect(board?.height).toBeCloseTo(PRIMARY_BOARD_HEIGHT, 3);
    expect(board?.position.x).toBe(PRIMARY_BOARD_CENTER_X);
    expect(board?.position.y).toBe(PRIMARY_BOARD_CENTER_Y);
    expect(media?.width).toBe(FRONT_MEDIA_WIDTH);
    expect(media?.position.x).toBe(FRONT_MEDIA_CENTER_X);
    expect(media?.position.y).toBe(FRONT_MEDIA_CENTER_Y);
  });

  it("uses large centered dimensions for side and back resource boards", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const left = manifest.wallAnchors.find((candidate) => candidate.id === "anchor-left");
    const right = manifest.wallAnchors.find((candidate) => candidate.id === "anchor-right");
    const back = manifest.wallAnchors.find((candidate) => candidate.id === "anchor-back");

    expect(left?.width).toBe(LEFT_RESOURCE_RAIL_WIDTH);
    expect(left?.height).toBeCloseTo(LEFT_RESOURCE_RAIL_HEIGHT, 3);
    expect(left?.position.y).toBe(LEFT_RESOURCE_RAIL_CENTER_Y);
    expect(left?.position.z).toBe(LEFT_RESOURCE_RAIL_CENTER_Z);

    expect(right?.width).toBe(RIGHT_RESOURCE_RAIL_WIDTH);
    expect(right?.height).toBeCloseTo(RIGHT_RESOURCE_RAIL_HEIGHT, 3);
    expect(right?.position.y).toBe(RIGHT_RESOURCE_RAIL_CENTER_Y);
    expect(right?.position.z).toBe(RIGHT_RESOURCE_RAIL_CENTER_Z);

    expect(back?.width).toBe(SECONDARY_BOARD_WIDTH);
    expect(back?.height).toBeCloseTo(SECONDARY_BOARD_HEIGHT, 3);
    expect(back?.position.y).toBe(BACK_DISPLAY_CENTER_Y);
  });

  it("uses a square same-height room shell with raised rear tiers", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const wallHeights = new Set(manifest.walls.map((wall) => wall.height));

    expect(wallHeights).toEqual(new Set([manifest.dimensions.height]));
    expect(manifest.dimensions.width).toBe(30);
    expect(manifest.dimensions.depth).toBe(30);
    expect(manifest.tiers).toEqual([
      { minZ: 4, maxZ: 8.5, floorY: 0.5 },
      { minZ: 8.5, maxZ: 15, floorY: 1 }
    ]);
  });

  it("keeps panorama wall segments proportional to the square four-wall unwrap", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const lengthsById = new Map(
      manifest.walls.map((wall) => [
        wall.id,
        Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z)
      ])
    );

    expect(lengthsById.get("wall-left")).toBe(30);
    expect(
      ["wall-back-lo", "wall-back-li", "wall-back-c", "wall-back-ri", "wall-back-ro"]
        .reduce((sum, id) => sum + (lengthsById.get(id) ?? 0), 0)
    ).toBe(30);
    expect(lengthsById.get("wall-right")).toBe(30);
    expect(lengthsById.get("wall-front")).toBe(30);
  });

  it("applies latest default anchor dimensions to stored manifests", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const stale = {
      ...manifest,
      wallAnchors: manifest.wallAnchors.map((anchor) => {
        if (anchor.id === "anchor-board") {
          return { ...anchor, width: 6.8, height: 2.1 };
        }
        if (anchor.id === "anchor-left") {
          return { ...anchor, width: 5, height: 2.8, position: { ...anchor.position, y: 2.5 } };
        }
        return anchor;
      })
    };
    const updated = applyDefaultWallAnchorDimensions(stale);
    const board = updated.wallAnchors.find((anchor) => anchor.id === "anchor-board");
    const left = updated.wallAnchors.find((anchor) => anchor.id === "anchor-left");
    expect(board?.width).toBe(PRIMARY_BOARD_WIDTH);
    expect(board?.height).toBeCloseTo(PRIMARY_BOARD_HEIGHT, 3);
    expect(left?.width).toBe(LEFT_RESOURCE_RAIL_WIDTH);
    expect(left?.height).toBeCloseTo(LEFT_RESOURCE_RAIL_HEIGHT, 3);
    expect(left?.position.y).toBe(LEFT_RESOURCE_RAIL_CENTER_Y);
    expect(left?.position.z).toBe(LEFT_RESOURCE_RAIL_CENTER_Z);
  });

  it("applies latest default room geometry to stored manifests", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const stale = {
      ...manifest,
      dimensions: { ...manifest.dimensions, height: 6 },
      bounds: { ...manifest.bounds, maxZ: 9.8 },
      tiers: [{ minZ: 3, maxZ: 7.5, floorY: 0.5 }],
      walls: manifest.walls.map((wall) => ({ ...wall, height: wall.id === "wall-front" ? 8 : 5 }))
    };
    const updated = applyDefaultRoomGeometry(stale);

    expect(new Set(updated.walls.map((wall) => wall.height))).toEqual(new Set([8]));
    expect(updated.bounds.maxZ).toBe(13.5);
    expect(updated.tiers).toEqual([
      { minZ: 4, maxZ: 8.5, floorY: 0.5 },
      { minZ: 8.5, maxZ: 15, floorY: 1 }
    ]);
  });

  it("treats removed wall objects as not occupying an anchor", () => {
    expect(isOccupyingWallObjectStatus("active")).toBe(true);
    expect(isOccupyingWallObjectStatus("source_ended")).toBe(true);
    expect(isOccupyingWallObjectStatus("removed")).toBe(false);
    expect(
      anchorHasOccupyingWallObject(
        [
          { wallAnchorId: "anchor-board", status: "active" },
          { wallAnchorId: "anchor-board", status: "removed" }
        ],
        "anchor-board"
      )
    ).toBe(true);
    expect(
      anchorHasOccupyingWallObject([{ wallAnchorId: "anchor-board", status: "removed" }], "anchor-board")
    ).toBe(false);
  });

  it("matches broad wall-anchor accepts rules for file-backed object types", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const media = manifest.wallAnchors.find((anchor) => anchor.id === "anchor-media-left");

    expect(media).toBeDefined();
    expect(anchorAcceptsWallObjectType(media!, "image.file")).toBe(true);
    expect(anchorAcceptsWallObjectType(media!, "audio.file")).toBe(true);
    expect(anchorAcceptsWallObjectType(media!, "video.file")).toBe(false);
    expect(anchorAcceptsWallObjectType(media!, "screen.live")).toBe(false);
  });

  it("evaluates board-grant expiry from shared policy", () => {
    const activeNoExpiry = { status: "active", expiresAt: null } as ClassroomBoardAccessGrant;
    const revoked = { status: "revoked", expiresAt: null } as ClassroomBoardAccessGrant;
    const expiresAtNoon = { status: "active", expiresAt: "2026-05-30T12:00:00.000Z" } as ClassroomBoardAccessGrant;

    expect(isBoardGrantActive(activeNoExpiry)).toBe(true);
    expect(isBoardGrantActive(revoked)).toBe(false);
    expect(isBoardGrantActive(expiresAtNoon, Date.parse("2026-05-30T11:59:59.000Z"))).toBe(true);
    expect(isBoardGrantActive(expiresAtNoon, Date.parse("2026-05-30T12:00:00.000Z"))).toBe(false);
  });

  it("evaluates room-object touch grants for users and groups", () => {
    const object = {
      touchPolicy: "granted",
      grantedUserIds: ["student-1"],
      grantedGroupIds: ["group-1"]
    } as RoomObject;

    expect(canTouchRoomObject({ object, userId: "teacher-1", role: "teacher", memberGroupIds: [] })).toBe(true);
    expect(canTouchRoomObject({ object, userId: "student-1", role: "student", memberGroupIds: [] })).toBe(true);
    expect(canTouchRoomObject({ object, userId: "student-2", role: "student", memberGroupIds: ["group-1"] })).toBe(true);
    expect(canTouchRoomObject({ object, userId: "student-3", role: "student", memberGroupIds: [] })).toBe(false);
  });

  it("transforms local movement relative to avatar facing", () => {
    const forward = transformLocalMovementToWorld(0, { x: 0, z: -1 });
    const right = transformLocalMovementToWorld(0, { x: 1, z: 0 });
    const strafeLeft = transformLocalMovementToWorld(Math.PI / 2, { x: -1, z: 0 });

    expect(forward.x).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(1);
    expect(right.x).toBeCloseTo(-1);
    expect(right.z).toBeCloseTo(0);
    expect(strafeLeft.x).toBeCloseTo(0);
    expect(strafeLeft.z).toBeCloseTo(-1);
  });

  it("clamps movement to room bounds", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });

    expect(clampPositionToBounds(manifest, { x: 99, y: 12, z: -99 })).toEqual({
      x: manifest.bounds.maxX,
      y: 0,
      z: manifest.bounds.minZ
    });
  });

  it("selects role-appropriate spawn points", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const teacher = createAvatarState({ participantId: "teacher-1", manifest, role: "teacher" });
    const student = createAvatarState({ participantId: "student-1", manifest, role: "student" });

    expect(teacher.position.z).toBeLessThan(0);
    expect(student.position.z).toBeGreaterThan(0);

    const center = roomCenterXZ(manifest);
    for (const avatar of [teacher, student]) {
      const facingX = Math.sin(avatar.rotation.y);
      const facingZ = Math.cos(avatar.rotation.y);
      const toCenterX = center.x - avatar.position.x;
      const toCenterZ = center.z - avatar.position.z;
      expect(facingX * toCenterX + facingZ * toCenterZ).toBeGreaterThan(0);
      expect(avatar.rotation.y).toBeCloseTo(rotationFacingRoomCenter(manifest, avatar.position).y);
    }
  });

  it("avoids occupied spawn points when another candidate is available", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const firstChoice = selectSpawnPoint({ manifest, participantId: "student-1", role: "student" });
    const nextChoice = selectSpawnPoint({
      manifest,
      participantId: "student-1",
      role: "student",
      occupiedPositions: [firstChoice.position]
    });

    expect(nextChoice.id).not.toBe(firstChoice.id);
  });

  it("round-trips 3D positions through the 2D projection", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const position = { x: 2, y: 0, z: -1 };
    const point = projectPositionTo2D(manifest, position);
    const projected = unprojectPointFrom2D(manifest, point);

    expect(projected.x).toBeCloseTo(position.x);
    expect(projected.z).toBeCloseTo(position.z);
  });

  it("maps 2D drag deltas to world XZ", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const width = manifest.bounds.maxX - manifest.bounds.minX;
    const depth = manifest.bounds.maxZ - manifest.bounds.minZ;
    const delta = delta2DToWorldXZ(manifest, { dx: 10, dy: -5 });

    expect(delta.dx).toBeCloseTo(width * 0.1);
    expect(delta.dz).toBeCloseTo(-depth * 0.05);
  });

  it("interpolates avatar state", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const previous = createAvatarState({ participantId: "p1", manifest, spawnIndex: 0, sentAt: 0 });
    const next = {
      ...previous,
      sentAt: 100,
      position: { x: 10, y: 0, z: 10 },
      movement: "walking" as const
    };

    expect(interpolateAvatarState(previous, next, 0.5).position.x).toBeCloseTo(5);
    expect(interpolateAvatarState(previous, next, 0.5).position.y).toBeCloseTo(0);
    expect(interpolateAvatarState(previous, next, 0.5).position.z).toBeCloseTo((previous.position.z + next.position.z) / 2);
  });

  it("calculates tunable spatial audio gain and pan", () => {
    const near = calculateSpatialAudio({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const far = calculateSpatialAudio({ x: 0, y: 0, z: 0 }, { x: 18, y: 0, z: 0 });

    expect(near.gain).toBeGreaterThan(far.gain);
    expect(far.pan).toBeGreaterThan(0);
  });
});

describe("workforce training manifest", () => {
  const manifest = createWorkforceTrainingManifest({ roomId: "room-wt-1" });

  it("parses against RoomManifestSchema and has correct outer dimensions", () => {
    expect(manifest.roomId).toBe("room-wt-1");
    expect(manifest.dimensions.width).toBe(68);
    expect(manifest.dimensions.depth).toBe(54);
    expect(manifest.dimensions.height).toBe(8);
  });

  it("has exactly 16 wall anchors", () => {
    expect(manifest.wallAnchors).toHaveLength(16);
  });

  it("has at least 22 wall segments", () => {
    expect(manifest.walls.length).toBeGreaterThanOrEqual(22);
  });

  it("does not define a hall pass holding zone", () => {
    expect(manifest.hallpassHoldingZone).toBeUndefined();
  });

  it("offsets doorway openings so doorway-wall boards no longer overlap them", () => {
    function doorwayGap(firstWallId: string, secondWallId: string, axis: "x" | "z") {
      const firstWall = manifest.walls.find((wall) => wall.id === firstWallId);
      const secondWall = manifest.walls.find((wall) => wall.id === secondWallId);

      expect(firstWall).toBeDefined();
      expect(secondWall).toBeDefined();

      const gapMin = axis === "x" ? firstWall!.end.x : firstWall!.end.z;
      const gapMax = axis === "x" ? secondWall!.start.x : secondWall!.start.z;

      return {
        center: (gapMin + gapMax) / 2,
        width: gapMax - gapMin
      };
    }

    const centralLeftDoor = doorwayGap("c-left-a", "c-left-b", "z");
    const centralRightDoor = doorwayGap("c-right-a", "c-right-b", "z");
    const centralBackDoor = doorwayGap("c-back-a", "c-back-b", "x");
    const leftSideDoor = doorwayGap("sr-left-hall-b", "sr-left-hall-a", "z");
    const backSideDoor = doorwayGap("sr-back-hall-a", "sr-back-hall-b", "x");
    const rightSideDoor = doorwayGap("sr-right-hall-b", "sr-right-hall-a", "z");

    const centralLeftBoard = manifest.wallAnchors.find((anchor) => anchor.id === "wt-anchor-c-left");
    const centralRightBoard = manifest.wallAnchors.find((anchor) => anchor.id === "wt-anchor-c-right");
    const centralBackBoard = manifest.wallAnchors.find((anchor) => anchor.id === "wt-anchor-c-back");
    const leftSideBoard = manifest.wallAnchors.find((anchor) => anchor.id === "wt-anchor-sl-hall");
    const backSideBoard = manifest.wallAnchors.find((anchor) => anchor.id === "wt-anchor-sb-hall");
    const rightSideBoard = manifest.wallAnchors.find((anchor) => anchor.id === "wt-anchor-sr-hall");

    expect(centralLeftBoard).toBeDefined();
    expect(centralRightBoard).toBeDefined();
    expect(centralBackBoard).toBeDefined();
    expect(leftSideBoard).toBeDefined();
    expect(backSideBoard).toBeDefined();
    expect(rightSideBoard).toBeDefined();

    expect(centralLeftDoor.center).toBeLessThan(0);
    expect(centralRightDoor.center).toBeLessThan(0);
    expect(centralBackDoor.center).toBeLessThan(0);
    expect(leftSideDoor.center).toBeLessThan(0);
    expect(backSideDoor.center).toBeLessThan(0);
    expect(rightSideDoor.center).toBeLessThan(0);

    expect(centralLeftBoard!.position.z).toBeGreaterThan(0);
    expect(centralRightBoard!.position.z).toBeGreaterThan(0);
    expect(centralBackBoard!.position.x).toBeGreaterThan(0);
    expect(leftSideBoard!.position.z).toBeGreaterThan(0);
    expect(backSideBoard!.position.x).toBeGreaterThan(0);
    expect(rightSideBoard!.position.z).toBeGreaterThan(0);

    expect(Math.abs(centralLeftBoard!.position.z - centralLeftDoor.center)).toBeGreaterThan((centralLeftBoard!.width + centralLeftDoor.width) / 2);
    expect(Math.abs(centralRightBoard!.position.z - centralRightDoor.center)).toBeGreaterThan((centralRightBoard!.width + centralRightDoor.width) / 2);
    expect(Math.abs(centralBackBoard!.position.x - centralBackDoor.center)).toBeGreaterThan((centralBackBoard!.width + centralBackDoor.width) / 2);
    expect(Math.abs(leftSideBoard!.position.z - leftSideDoor.center)).toBeGreaterThan((leftSideBoard!.width + leftSideDoor.width) / 2);
    expect(Math.abs(backSideBoard!.position.x - backSideDoor.center)).toBeGreaterThan((backSideBoard!.width + backSideDoor.width) / 2);
    expect(Math.abs(rightSideBoard!.position.z - rightSideDoor.center)).toBeGreaterThan((rightSideBoard!.width + rightSideDoor.width) / 2);
  });

  it("includes spawn-instructor and at least one spawn-trainee", () => {
    const ids = manifest.spawnPoints.map((s) => s.id);
    expect(ids).toContain("spawn-instructor");
    expect(ids.some((id) => id.startsWith("spawn-trainee-"))).toBe(true);
  });

  it("applyDefaultRoomGeometry with workforce-training returns manifest unchanged", () => {
    const result = applyDefaultRoomGeometry(manifest, "workforce-training");
    expect(result).toBe(manifest);
    expect(result.dimensions.width).toBe(68);
  });

  it("applyDefaultRoomGeometry with classroom overwrites geometry", () => {
    const result = applyDefaultRoomGeometry(manifest, "classroom");
    expect(result.dimensions.width).toBe(30);
    expect(result.dimensions.depth).toBe(30);
  });

  it("applyDefaultWallAnchorDimensions with workforce-training returns manifest unchanged", () => {
    const result = applyDefaultWallAnchorDimensions(manifest, "workforce-training");
    expect(result).toBe(manifest);
  });

  it("clampPositionToBounds: origin is within walkable bounds", () => {
    const clamped = clampPositionToBounds(manifest, { x: 0, y: 0, z: 0 });
    expect(clamped.x).toBe(0);
    expect(clamped.z).toBe(0);
  });

  it("clampPositionToBounds: left side room interior point stays in bounds", () => {
    const clamped = clampPositionToBounds(manifest, { x: -30, y: 0, z: 0 });
    expect(clamped.x).toBe(-30);
    expect(clamped.z).toBe(0);
  });

  it("clampPositionToBounds: right side room interior point stays in bounds", () => {
    const clamped = clampPositionToBounds(manifest, { x: 30, y: 0, z: 0 });
    expect(clamped.x).toBe(30);
    expect(clamped.z).toBe(0);
  });

  it("clampPositionToBounds: point outside outer rectangle clamps to maxX", () => {
    const clamped = clampPositionToBounds(manifest, { x: 40, y: 0, z: 0 });
    expect(clamped.x).toBe(manifest.bounds.maxX); // 34
  });

  it("adds outer caps at the back hallway corners", () => {
    const wallIds = new Set(manifest.walls.map((wall) => wall.id));

    expect(wallIds).toContain("h-back-corner-left-west");
    expect(wallIds).toContain("h-back-corner-left-north");
    expect(wallIds).toContain("h-back-corner-right-east");
    expect(wallIds).toContain("h-back-corner-right-north");
  });

  it("blocks movement out of the back-left hallway corner", () => {
    const leftWall = manifest.walls.find((wall) => wall.id === "h-back-corner-left-west");
    const northWall = manifest.walls.find((wall) => wall.id === "h-back-corner-left-north");

    expect(leftWall).toBeDefined();
    expect(northWall).toBeDefined();

    const leftStopX = leftWall!.start.x + (leftWall!.thickness ?? 0) / 2 + 0.4;
    const northStopZ = northWall!.start.z - (northWall!.thickness ?? 0) / 2 - 0.4;

    expect(
      resolveWallCollisions({ x: -23.1, z: 22 }, { x: -24.5, z: 22 }, manifest.walls)
    ).toEqual({ x: leftStopX, z: 22 });

    expect(
      resolveWallCollisions({ x: -22, z: 23.1 }, { x: -22, z: 24.5 }, manifest.walls)
    ).toEqual({ x: -22, z: northStopZ });
  });

  it("blocks movement out of the back-right hallway corner", () => {
    const rightWall = manifest.walls.find((wall) => wall.id === "h-back-corner-right-east");
    const northWall = manifest.walls.find((wall) => wall.id === "h-back-corner-right-north");

    expect(rightWall).toBeDefined();
    expect(northWall).toBeDefined();

    const rightStopX = rightWall!.start.x - (rightWall!.thickness ?? 0) / 2 - 0.4;
    const northStopZ = northWall!.start.z - (northWall!.thickness ?? 0) / 2 - 0.4;

    expect(
      resolveWallCollisions({ x: 23.1, z: 22 }, { x: 24.5, z: 22 }, manifest.walls)
    ).toEqual({ x: rightStopX, z: 22 });

    expect(
      resolveWallCollisions({ x: 22, z: 23.1 }, { x: 22, z: 24.5 }, manifest.walls)
    ).toEqual({ x: 22, z: northStopZ });
  });

  it("stops at the near face of thick hallway walls instead of the wall centerline", () => {
    const leftWall = manifest.walls.find((wall) => wall.id === "h-left-outer-s");
    expect(leftWall).toBeDefined();

    const stopX = leftWall!.start.x + (leftWall!.thickness ?? 0) / 2 + 0.4;

    expect(
      resolveWallCollisions({ x: -23.1, z: -10 }, { x: -24.5, z: -10 }, manifest.walls)
    ).toEqual({ x: stopX, z: -10 });
  });
});

describe("free-for-all wall collisions", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-ffa-1" });

  it("includes a central cubed wall ring inside the cylindrical hub", () => {
    const centralWallIds = new Set(
      manifest.walls
        .filter((wall) => wall.id.startsWith("ffa-central-"))
        .map((wall) => wall.id)
    );

    expect(centralWallIds).toEqual(
      new Set(["ffa-central-north", "ffa-central-east", "ffa-central-south", "ffa-central-west"])
    );
  });

  it("uses 12 m tall central square walls for large board placement", () => {
    const centralHeights = manifest.walls
      .filter((wall) => wall.id.startsWith("ffa-central-"))
      .map((wall) => wall.height);
    const perimeterHeights = manifest.walls
      .filter((wall) => wall.id.startsWith("ffa-perim-"))
      .map((wall) => wall.height);

    expect(new Set(centralHeights)).toEqual(new Set([12]));
    expect(new Set(perimeterHeights)).toEqual(new Set([8]));
    expect(manifest.dimensions.height).toBe(12);
  });

  it("uses hideSurface static boards inset from adjoining-room walls", () => {
    const northBoard = manifest.wallAnchors.find((anchor) => anchor.id === "ffa-adj-north-anchor");
    expect(northBoard).toBeDefined();
    expect(northBoard!.metadata?.hideSurface).toBe(true);
    expect(Math.hypot(northBoard!.position.x, northBoard!.position.z)).toBeCloseTo(42.75, 3);
  });

  it("clamps movement to the circular perimeter outside exit arcs", () => {
    const result = resolveWallCollisions(
      { x: 22.5, z: 6 },
      { x: 23.8, z: 6 },
      manifest.walls
    );

    expect(Math.hypot(result.x, result.z)).toBeLessThanOrEqual(22.6);
  });

  it("does not apply radial clamp when moving through an exit arc", () => {
    const result = resolveWallCollisions(
      { x: 22.5, z: 0.1 },
      { x: 23.8, z: 0.1 },
      manifest.walls
    );

    expect(result.x).toBeCloseTo(23.8);
    expect(result.z).toBeCloseTo(0.1);
  });

  it("does not teleport movement inside adjoining rooms", () => {
    const result = resolveWallCollisions(
      { x: 35, z: 0 },
      { x: 35, z: 0.8 },
      manifest.walls
    );

    expect(result.x).toBeCloseTo(35);
    expect(result.z).toBeCloseTo(0.8);
  });
});

describe("validateDynamicBoardPlacement", () => {
  const manifest = createFreeForAllManifest({ roomId: "room_ffa_test" });
  const westWall = manifest.walls.find((wall) => wall.id === "ffa-central-west");
  expect(westWall).toBeDefined();

  it("allows placement on the same wall when boards are side by side along the wall", () => {
    const result = validateDynamicBoardPlacement(
      manifest,
      [
        {
          wallId: "ffa-central-west",
          position: { x: -6, z: 4 },
          width: 4
        }
      ],
      { wallId: "ffa-central-west", center: { x: -6, z: -4 }, width: 4 }
    );

    expect(result).toEqual({ ok: true });
  });

  it("does not treat perpendicular wall anchors at a corner as overlapping", () => {
    const result = validateDynamicBoardPlacement(
      manifest,
      [
        {
          wallId: "ffa-central-north",
          position: { x: 0, z: -6 },
          width: 4
        }
      ],
      { wallId: "ffa-central-west", center: { x: -6, z: 0 }, width: 4 }
    );

    expect(result).toEqual({ ok: true });
  });

  it("rejects placement when board spans overlap along the same wall", () => {
    const result = validateDynamicBoardPlacement(
      manifest,
      [
        {
          wallId: "ffa-central-west",
          position: { x: -6, z: 2 },
          width: 4
        }
      ],
      { wallId: "ffa-central-west", center: { x: -6, z: 0.5 }, width: 4 }
    );

    expect(result).toEqual({ ok: false, reason: "overlaps-anchor" });
  });
});

describe("validateDynamicBoardPlacement with build walls", () => {
  const manifest = createFreeForAllManifest({ roomId: "room_ffa_build_boards" });
  const createdAt = "2026-05-30T12:00:00.000Z";
  const wallPiece = BuildPieceSchema.parse({
    id: "build:wall:15,15:0:e",
    roomId: manifest.roomId,
    kind: "wall",
    cell: { ix: 15, iz: 15 },
    level: 0,
    edge: "e",
    rotation: 0,
    materialId: "stone",
    createdByUserId: "u1",
    createdAt
  });
  const placementWalls = boardPlacementWalls(manifest, [wallPiece]);
  const buildWall = buildPieceColliders(wallPiece).walls[0]!;
  const center = {
    x: (buildWall.start.x + buildWall.end.x) / 2,
    y: buildWall.start.y + buildWall.height / 2,
    z: (buildWall.start.z + buildWall.end.z) / 2
  };

  it("accepts placement on a build wall collider", () => {
    const result = validateDynamicBoardPlacement(
      { walls: placementWalls },
      [],
      { wallId: buildWall.id, center, width: 1.5 }
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects overlapping boards on the same build wall", () => {
    const result = validateDynamicBoardPlacement(
      { walls: placementWalls },
      [{ wallId: buildWall.id, position: center, width: 1.5 }],
      { wallId: buildWall.id, center, width: 1.5 }
    );
    expect(result).toEqual({ ok: false, reason: "overlaps-anchor" });
  });

  it("returns wall-not-found when the build piece id is absent from placement walls", () => {
    const result = validateDynamicBoardPlacement(
      manifest,
      [],
      { wallId: buildWall.id, center, width: 1.5 }
    );
    expect(result).toEqual({ ok: false, reason: "wall-not-found" });
  });
});
