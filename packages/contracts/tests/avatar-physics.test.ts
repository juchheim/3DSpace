import { describe, expect, it } from "vitest";

import {
  AvatarAirborneStateSchema,
  AvatarStateMessageSchema,
  getRoomTypeFeatureFlags,
  parseRoomSettings,
  PhysicsTuningSchema,
  WorldSkinOverridesSchema
} from "../src/index";

describe("avatar physics contracts", () => {
  it("parses physics tuning defaults", () => {
    expect(PhysicsTuningSchema.parse({})).toEqual({
      enabled: false,
      gravity: 24,
      moveSpeed: 3.2,
      jumpHeight: 1.3,
      maxFallSpeed: 40,
      airControl: 0.6,
      coyoteTimeMs: 120,
      capsuleRadius: 0.4,
      capsuleHeight: 1.6,
      maxSlopeClimbDeg: 50,
      autoStepHeight: 0.6,
      snapToGroundDist: 0.3
    });
  });

  it("adds physics room settings with an empty default override", () => {
    const settings = parseRoomSettings({
      maxParticipants: 30,
      defaultViewMode: "3d",
      defaultQuality: "medium",
      enable2DAnalog: true,
      enableWallAttachments: true
    });

    expect(settings.physics).toEqual({});
  });

  it("marks physics as free-for-all only", () => {
    expect(getRoomTypeFeatureFlags("free-for-all").physics).toBe(true);
    expect(getRoomTypeFeatureFlags("escape-room").physics).toBe(false);
    expect(getRoomTypeFeatureFlags("classroom").physics).toBe(false);
  });

  it("keeps avatar movement stable and airborne state optional", () => {
    const parsed = AvatarStateMessageSchema.parse({
      type: "avatar.state.v1",
      sentAt: 123,
      participantId: "p1",
      position: { x: 1, y: 2, z: 3 },
      rotation: { y: 0 },
      movement: "walking",
      viewMode: "3d"
    });

    expect(parsed.movement).toBe("walking");
    expect(parsed.airborneState).toBeUndefined();
    expect(AvatarAirborneStateSchema.parse("falling")).toBe("falling");
    expect(
      AvatarStateMessageSchema.parse({
        type: "avatar.state.v1",
        sentAt: 123,
        participantId: "p1",
        position: { x: 0, y: 0, z: 0 },
        rotation: { y: 0 },
        movement: "running",
        viewMode: "3d"
      }).movement
    ).toBe("running");
  });

  it("allows world skins to tune gravity and jump multipliers", () => {
    const parsed = WorldSkinOverridesSchema.parse({
      lighting: {
        ambientColor: "#ffffff",
        directionalColor: "#ffffff"
      },
      gravityMultiplier: 0.38,
      jumpMultiplier: 1.5
    });

    expect(parsed.gravityMultiplier).toBe(0.38);
    expect(parsed.jumpMultiplier).toBe(1.5);
  });
});
