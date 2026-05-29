import { describe, expect, it } from "vitest";
import {
  getRoomTypeFeatureFlags,
  SharedBrowserPointerBatchSchema,
  SharedBrowserRealtimeMessageSchema,
  SharedBrowserSessionSchema
} from "../src/index";

const BASE = { roomId: "room-1", wallObjectId: "wo-1", sentAt: 1_700_000_000_000, senderId: "user-1" };

describe("shared browser realtime contracts", () => {
  it("parses each realtime message type via the discriminated union", () => {
    const messages = [
      { type: "room.shared-browser.pointer.v1", ...BASE, authorUserId: "user-1", pointer: [{ kind: "move", x: 0.5, y: 0.5, at: 1 }] },
      { type: "room.shared-browser.navigate.v1", ...BASE, url: "https://example.com/", navigatedByUserId: "user-1" },
      { type: "room.shared-browser.history.v1", ...BASE, action: "back", actedByUserId: "user-1" },
      { type: "room.shared-browser.control-lease.v1", ...BASE, controlLease: null },
      { type: "room.shared-browser.state.v1", ...BASE, currentUrl: "https://example.com/", title: "Example", status: "active" },
      { type: "room.shared-browser.session.v1", ...BASE, status: "paused" }
    ];
    for (const message of messages) {
      const parsed = SharedBrowserRealtimeMessageSchema.parse(message);
      expect(parsed.type).toBe(message.type);
    }
  });

  it("carries a control lease object on control-lease and state messages", () => {
    const lease = { userId: "user-1", displayName: "Ada", expiresAt: "2026-05-28T00:00:00.000Z" };
    const control = SharedBrowserRealtimeMessageSchema.parse({
      type: "room.shared-browser.control-lease.v1",
      ...BASE,
      controlLease: lease
    });
    expect(control.type === "room.shared-browser.control-lease.v1" && control.controlLease?.userId).toBe("user-1");
  });

  it("rejects unknown realtime message types", () => {
    expect(() => SharedBrowserRealtimeMessageSchema.parse({ type: "room.shared-browser.unknown.v1", ...BASE })).toThrow();
  });

  it("clamps pointer/keyboard batches and applies array defaults", () => {
    const batch = SharedBrowserPointerBatchSchema.parse({ wallObjectId: "wo-1" });
    expect(batch.pointer).toEqual([]);
    expect(batch.keyboard).toEqual([]);
    expect(() =>
      SharedBrowserPointerBatchSchema.parse({
        wallObjectId: "wo-1",
        pointer: Array.from({ length: 121 }, () => ({ kind: "move", x: 0, y: 0, at: 0 }))
      })
    ).toThrow();
  });

  it("only enables shared browsers for free-for-all rooms", () => {
    expect(getRoomTypeFeatureFlags("free-for-all").sharedBrowsers).toBe(true);
    expect(getRoomTypeFeatureFlags("classroom").sharedBrowsers).toBe(false);
  });

  it("requires an https currentUrl on the session entity", () => {
    expect(() =>
      SharedBrowserSessionSchema.parse({
        id: "s1",
        roomId: "room-1",
        wallObjectId: "wo-1",
        createdByUserId: "user-1",
        status: "active",
        currentUrl: "not-a-url",
        viewport: { width: 1280, height: 720 },
        lastInputAt: "2026-05-28T00:00:00.000Z",
        createdAt: "2026-05-28T00:00:00.000Z",
        updatedAt: "2026-05-28T00:00:00.000Z"
      })
    ).toThrow();
  });
});
