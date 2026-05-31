import { describe, expect, it } from "vitest";
import { BuildLogicPieceSchema } from "@3dspace/contracts";
import {
  logicChannelColor,
  logicChannelsForPiece,
  logicChannelsFromPieces,
  primaryChannelForPiece
} from "../src/logic.js";

const createdAt = "2026-05-31T12:00:00.000Z";

function piece(input: Record<string, unknown>) {
  return BuildLogicPieceSchema.parse({
    roomId: "r1",
    rotation: 0,
    createdByUserId: "u1",
    createdAt,
    ...input
  });
}

describe("logic channel helpers", () => {
  it("collects emit, requireAll, and trigger channels for a piece", () => {
    const timer = piece({
      id: "logic:timer:1,1:0",
      kind: "timer",
      cell: { ix: 1, iz: 1 },
      level: 0,
      channelId: "vault-open",
      config: { triggerChannelId: "start-timer" }
    });
    expect(logicChannelsForPiece(timer).sort()).toEqual(["start-timer", "vault-open"]);

    const door = piece({
      id: "logic:door:2,2:0:n",
      kind: "door",
      cell: { ix: 2, iz: 2 },
      level: 0,
      edge: "n",
      config: { requireAll: ["key-a", "key-b"] }
    });
    expect(logicChannelsForPiece(door).sort()).toEqual(["key-a", "key-b"]);
  });

  it("lists unique sorted channels across all pieces", () => {
    const button = piece({
      id: "logic:button:3,3:0:n",
      kind: "button",
      cell: { ix: 3, iz: 3 },
      level: 0,
      edge: "n",
      channelId: "main-door"
    });
    const door = piece({
      id: "logic:door:4,4:0:e",
      kind: "door",
      cell: { ix: 4, iz: 4 },
      level: 0,
      edge: "e",
      channelId: "main-door"
    });
    expect(logicChannelsFromPieces([button, door])).toEqual(["main-door"]);
  });

  it("assigns a stable color per channel id and matches across linked nodes", () => {
    expect(logicChannelColor("main-door")).toBe(logicChannelColor("main-door"));
    expect(logicChannelColor("main-door")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("derives a primary channel for tinting", () => {
    const door = piece({
      id: "logic:door:5,5:0:n",
      kind: "door",
      cell: { ix: 5, iz: 5 },
      level: 0,
      edge: "n",
      config: { requireAll: ["key-a", "key-b"] }
    });
    expect(primaryChannelForPiece(door)).toBe("key-a");
  });
});
