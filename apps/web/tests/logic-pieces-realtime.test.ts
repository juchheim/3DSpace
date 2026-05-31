import { describe, expect, it } from "vitest";
import { LogicStateSchema } from "@3dspace/contracts";
import { applyLogicStatePatch } from "../lib/logic-pieces-realtime";

describe("applyLogicStatePatch", () => {
  it("merges partial node patches and replaces on full reset", () => {
    const state = LogicStateSchema.parse({
      roomId: "r1",
      channels: { a: { latched: true, lastPulseAt: 1 } },
      nodes: { "logic:door:1,1:0:e": { open: false } },
      updatedAt: "t"
    });

    const merged = applyLogicStatePatch(state, {
      type: "room.logic.state.v1",
      roomId: "r1",
      nodes: { "logic:door:1,1:0:e": { open: true } },
      sentAt: 2,
      senderId: "u1"
    });
    expect(merged.nodes["logic:door:1,1:0:e"]?.open).toBe(true);

    const reset = applyLogicStatePatch(merged, {
      type: "room.logic.state.v1",
      roomId: "r1",
      channels: {},
      nodes: {},
      sentAt: 3,
      senderId: "u1"
    });
    expect(reset.nodes).toEqual({});
    expect(reset.channels).toEqual({});
  });
});
