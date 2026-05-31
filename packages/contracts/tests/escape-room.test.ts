import { describe, expect, it } from "vitest";
import { getRoomTypeFeatureFlags, parseRoomSettings, RoomTypeSchema } from "../src/index";

describe("escape-room room type (contracts)", () => {
  it("accepts escape-room in RoomTypeSchema", () => {
    expect(RoomTypeSchema.parse("escape-room")).toBe("escape-room");
  });

  it("defaults playModeEnabled to false in room settings", () => {
    const settings = parseRoomSettings({
      maxParticipants: 30,
      defaultViewMode: "3d",
      defaultQuality: "medium",
      enable2DAnalog: true,
      enableWallAttachments: true
    });
    expect(settings.playModeEnabled).toBe(false);
  });

  it("exposes escape-room feature flags per plan", () => {
    const flags = getRoomTypeFeatureFlags("escape-room");
    expect(flags.building).toBe(true);
    expect(flags.dynamicBoards).toBe(true);
    expect(flags.logic).toBe(true);
    expect(flags.worldSkins).toBe(true);
    expect(flags.aiObjects).toBe(true);
    expect(flags.whiteboards).toBe(true);
    expect(flags.openJoin).toBe(false);
    expect(flags.aiMeetingNotes).toBe(false);
    expect(flags.sharedBrowsers).toBe(false);
    expect(flags.liveCaptions).toBe(false);
    expect(flags.classroomState).toBe(false);
    expect(flags.lessons).toBe(false);
    expect(flags.breakoutPods).toBe(false);
  });

  it("leaves classroom and free-for-all flags unchanged", () => {
    expect(getRoomTypeFeatureFlags("classroom").building).toBe(false);
    expect(getRoomTypeFeatureFlags("classroom").logic).toBe(false);
    expect(getRoomTypeFeatureFlags("classroom").dynamicBoards).toBe(false);

    expect(getRoomTypeFeatureFlags("free-for-all").building).toBe(true);
    expect(getRoomTypeFeatureFlags("free-for-all").dynamicBoards).toBe(true);
    expect(getRoomTypeFeatureFlags("free-for-all").logic).toBe(false);
    expect(getRoomTypeFeatureFlags("free-for-all").openJoin).toBe(true);

    expect(getRoomTypeFeatureFlags("workforce-training").building).toBe(false);
    expect(getRoomTypeFeatureFlags("workforce-training").logic).toBe(false);
  });
});
