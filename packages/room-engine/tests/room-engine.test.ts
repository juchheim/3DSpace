import { describe, expect, it } from "vitest";
import {
  anchorHasOccupyingWallObject,
  anchorSupportsCreateOption,
  applyDefaultWallAnchorDimensions,
  calculateSpatialAudio,
  isOccupyingWallObjectStatus,
  clampPositionToBounds,
  createAvatarState,
  roomCenterXZ,
  rotationFacingRoomCenter,
  createDefaultRoomManifest,
  interpolateAvatarState,
  delta2DToWorldXZ,
  projectPositionTo2D,
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

    expect(board).toBeDefined();
    expect(media).toBeDefined();
    expect(anchorSupportsCreateOption(board!, "poll")).toBe(true);
    expect(anchorSupportsCreateOption(board!, "camera")).toBe(true);
    expect(anchorSupportsCreateOption(board!, "microphone")).toBe(true);
    expect(anchorSupportsCreateOption(media!, "poll")).toBe(false);
    expect(anchorSupportsCreateOption(media!, "microphone")).toBe(true);
    expect(anchorSupportsCreateOption(media!, "screen")).toBe(false);
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
