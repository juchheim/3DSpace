import { describe, expect, it } from "vitest";
import { getRoomTypeFeatureFlags } from "@3dspace/contracts";
import { createEscapeRoomManifest } from "@3dspace/room-engine";
import { buildingEnvEnabled } from "../lib/config";

describe("escape room client prerequisites", () => {
  it("exposes building and dynamic board features for escape-room type", () => {
    const flags = getRoomTypeFeatureFlags("escape-room");
    expect(flags.building).toBe(true);
    expect(flags.dynamicBoards).toBe(true);
    expect(flags.classroomState).toBe(false);
    expect(flags.aiMeetingNotes).toBe(false);
    expect(flags.sharedBrowsers).toBe(false);
  });

  it("ships an empty canvas manifest suitable for RoomView3D", () => {
    const manifest = createEscapeRoomManifest({ roomId: "room-escape-ui" });
    expect(manifest.walls).toEqual([]);
    expect(manifest.wallAnchors).toEqual([]);
    expect(manifest.dimensions.width).toBe(80);
  });

  it("gates build UI on escape-room env flag via buildingEnvEnabled", () => {
    // Default test env: both flags false unless set in vitest config / CI
    const enabled = buildingEnvEnabled("escape-room");
    expect(typeof enabled).toBe("boolean");
    if (process.env.NEXT_PUBLIC_ENABLE_ESCAPE_ROOM === "true") {
      expect(enabled).toBe(true);
    }
  });
});
