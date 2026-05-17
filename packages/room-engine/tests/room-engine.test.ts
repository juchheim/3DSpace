import { describe, expect, it } from "vitest";
import {
  calculateSpatialAudio,
  clampPositionToBounds,
  createAvatarState,
  createDefaultRoomManifest,
  interpolateAvatarState,
  projectPositionTo2D,
  transformLocalMovementToWorld,
  unprojectPointFrom2D
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

  it("round-trips 3D positions through the 2D projection", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const position = { x: 2, y: 0, z: -1 };
    const point = projectPositionTo2D(manifest, position);
    const projected = unprojectPointFrom2D(manifest, point);

    expect(projected.x).toBeCloseTo(position.x);
    expect(projected.z).toBeCloseTo(position.z);
  });

  it("interpolates avatar state", () => {
    const manifest = createDefaultRoomManifest({ roomId: "room_1" });
    const previous = createAvatarState({ participantId: "p1", manifest, sentAt: 0 });
    const next = {
      ...previous,
      sentAt: 100,
      position: { x: 10, y: 0, z: 10 },
      movement: "walking" as const
    };

    expect(interpolateAvatarState(previous, next, 0.5).position.x).toBeCloseTo(5);
    expect(interpolateAvatarState(previous, next, 0.5).position.y).toBeCloseTo(0);
    expect(interpolateAvatarState(previous, next, 0.5).position.z).toBeCloseTo(3.9);
  });

  it("calculates tunable spatial audio gain and pan", () => {
    const near = calculateSpatialAudio({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const far = calculateSpatialAudio({ x: 0, y: 0, z: 0 }, { x: 18, y: 0, z: 0 });

    expect(near.gain).toBeGreaterThan(far.gain);
    expect(far.pan).toBeGreaterThan(0);
  });
});
