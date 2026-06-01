import { describe, expect, it } from "vitest";
import { createFreeForAllManifest } from "@3dspace/room-engine";
import {
  AI_HOST_SUMMON_DISTANCE_M,
  aiHostHubPlacementPosition,
  aiHostPlacementInFrontOfAvatar,
  aiHostPlacementPosition
} from "../lib/useAiWorldHost";

describe("aiHostPlacementPosition", () => {
  it("places hub at origin with manifest floor Y when no build pieces", () => {
    const manifest = createFreeForAllManifest({ roomId: "room-test" });
    const hub = aiHostHubPlacementPosition(manifest, [], 0);
    expect(hub.x).toBe(0);
    expect(hub.z).toBe(0);
    expect(hub.y).toBeGreaterThanOrEqual(0);
  });

  it("matches explicit origin placement", () => {
    const manifest = createFreeForAllManifest({ roomId: "room-test" });
    const hub = aiHostHubPlacementPosition(manifest, [], 0);
    const explicit = aiHostPlacementPosition(manifest, 0, 0, [], 0);
    expect(hub).toEqual(explicit);
  });

  it("places the guide in front of the avatar facing them", () => {
    const manifest = createFreeForAllManifest({ roomId: "room-test" });
    const avatarYaw = Math.PI / 4;
    const avatar = { x: 3, y: 0, z: -2 };
    const { position, rotationY } = aiHostPlacementInFrontOfAvatar(manifest, avatar, avatarYaw, [], 0);

    expect(position.x).toBeCloseTo(avatar.x + Math.sin(avatarYaw) * AI_HOST_SUMMON_DISTANCE_M);
    expect(position.z).toBeCloseTo(avatar.z + Math.cos(avatarYaw) * AI_HOST_SUMMON_DISTANCE_M);
    expect(rotationY).toBeCloseTo(avatarYaw + Math.PI);
  });
});
