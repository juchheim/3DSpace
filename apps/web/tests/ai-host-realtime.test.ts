import { describe, expect, it } from "vitest";
import { applyAiHostRealtimeMessage } from "../lib/ai-host-realtime";

const host = {
  id: "host-1",
  roomId: "room-1",
  displayName: "Chip",
  position: { x: 0, y: 0, z: 0 },
  rotationY: 0,
  createdByUserId: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("applyAiHostRealtimeMessage", () => {
  it("applies updated and dismissed messages", () => {
    const updated = applyAiHostRealtimeMessage(null, {
      type: "room.ai-host.updated.v1",
      roomId: "room-1",
      host: { ...host, displayName: "Guide" },
      sentAt: 1,
      senderId: "user-2"
    });
    expect(updated?.displayName).toBe("Guide");

    const dismissed = applyAiHostRealtimeMessage(updated, {
      type: "room.ai-host.dismissed.v1",
      roomId: "room-1",
      deleteFiles: false,
      sentAt: 2,
      senderId: "user-2"
    });
    expect(dismissed).toBeNull();
  });
});
