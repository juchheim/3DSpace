import { describe, expect, it } from "vitest";
import { BuildLogicPieceSchema } from "@3dspace/contracts";
import {
  applyChannelPulse,
  applyChannelSetLatched,
  isChannelActive,
  resolveAllConsumerNodes,
  resolveConsumerNodeState
} from "../src/channel-bus.js";

const createdAt = "2026-05-31T12:00:00.000Z";

function piece(input: Record<string, unknown>) {
  return BuildLogicPieceSchema.parse(input);
}

describe("channel bus", () => {
  it("latch door opens when its channel is pulsed", () => {
    const door = piece({
      id: "logic:door:1,1:0:e",
      roomId: "r1",
      kind: "door",
      cell: { ix: 1, iz: 1 },
      level: 0,
      edge: "e",
      rotation: 0,
      channelId: "main-door",
      config: { listenMode: "latch" },
      createdByUserId: "u1",
      createdAt
    });
    const channels = applyChannelPulse({}, "main-door", 1000);
    expect(isChannelActive(channels["main-door"], 1100)).toBe(true);
    const node = resolveConsumerNodeState(door, { open: false }, channels, { nowMs: 1100 });
    expect(node.open).toBe(true);
  });

  it("latch light turns on when its channel is pulsed", () => {
    const light = piece({
      id: "logic:light:3,3:0",
      roomId: "r1",
      kind: "light",
      cell: { ix: 3, iz: 3 },
      level: 0,
      rotation: 0,
      channelId: "room-light",
      config: { listenMode: "latch", initialState: { on: false } },
      createdByUserId: "u1",
      createdAt
    });
    const channels = applyChannelPulse({}, "room-light", 2000);
    const node = resolveConsumerNodeState(light, { on: false }, channels, { nowMs: 2100 });
    expect(node.on).toBe(true);
  });

  it("momentary door opens only while channel is latched", () => {
    const door = piece({
      id: "logic:door:4,4:0:e",
      roomId: "r1",
      kind: "door",
      cell: { ix: 4, iz: 4 },
      level: 0,
      edge: "e",
      rotation: 0,
      channelId: "hold-door",
      config: { listenMode: "momentary" },
      createdByUserId: "u1",
      createdAt
    });
    const latched = applyChannelPulse({}, "hold-door", 3000);
    expect(resolveConsumerNodeState(door, { open: false }, latched, { nowMs: 3100 }).open).toBe(true);
    const released = applyChannelSetLatched(latched, "hold-door", false, 3200);
    expect(resolveConsumerNodeState(door, { open: true }, released, { nowMs: 3300 }).open).toBe(false);
  });

  it("requireAll door opens only when every listed channel is active", () => {
    const door = piece({
      id: "logic:door:5,5:0:n",
      roomId: "r1",
      kind: "door",
      cell: { ix: 5, iz: 5 },
      level: 0,
      edge: "n",
      rotation: 0,
      config: { listenMode: "latch", requireAll: ["key-a", "key-b"] },
      createdByUserId: "u1",
      createdAt
    });
    let channels = applyChannelPulse({}, "key-a", 4000);
    expect(resolveConsumerNodeState(door, { open: false }, channels, { nowMs: 4100 }).open).toBe(false);
    channels = applyChannelPulse(channels, "key-b", 4200);
    expect(resolveConsumerNodeState(door, { open: false }, channels, { nowMs: 4300 }).open).toBe(true);
  });

  it("toggle button flips door on successive pulses", () => {
    const door = piece({
      id: "logic:door:2,2:0:n",
      roomId: "r1",
      kind: "door",
      cell: { ix: 2, iz: 2 },
      level: 0,
      edge: "n",
      rotation: 0,
      channelId: "ch-a",
      config: { listenMode: "toggle" },
      createdByUserId: "u1",
      createdAt
    });
    let nodes: Record<string, Record<string, unknown>> = {};
    nodes = { ...nodes, ...resolveAllConsumerNodes([door], applyChannelPulse({}, "ch-a"), nodes, { toggleEdge: true }) };
    expect(nodes[door.id]?.open).toBe(true);
    nodes = { ...nodes, ...resolveAllConsumerNodes([door], applyChannelPulse({}, "ch-a"), nodes, { toggleEdge: true }) };
    expect(nodes[door.id]?.open).toBe(false);
  });
});
