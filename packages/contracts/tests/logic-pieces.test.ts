import { describe, expect, it } from "vitest";
import {
  BuildLogicPieceSchema,
  EscapeSessionSchema,
  LogicPieceSignalRequestSchema,
  LogicPieceSignalResponseSchema,
  LogicStateSchema,
  RoomLogicRealtimeMessageSchema,
  RoomSessionMessageV1Schema,
  parseRoomSettings
} from "../src/index.js";

describe("logic pieces contracts", () => {
  it("parses a button logic piece", () => {
    const piece = BuildLogicPieceSchema.parse({
      id: "logic:button:1,2:0:n",
      roomId: "room-1",
      kind: "button",
      cell: { ix: 1, iz: 2 },
      level: 0,
      edge: "n",
      rotation: 0,
      channelId: "ch-a",
      config: {},
      createdByUserId: "u1",
      createdAt: "2026-05-31T12:00:00.000Z"
    });
    expect(piece.kind).toBe("button");
  });

  it("defaults logicEnabled to true in room settings", () => {
    const settings = parseRoomSettings({
      maxParticipants: 30,
      defaultViewMode: "3d",
      defaultQuality: "medium",
      enable2DAnalog: true,
      enableWallAttachments: true
    });
    expect(settings.logicEnabled).toBe(true);
  });

  it("parses logic signal request/response", () => {
    expect(LogicPieceSignalRequestSchema.parse({ kind: "stepOn" }).kind).toBe("stepOn");
    expect(
      LogicPieceSignalResponseSchema.parse({ ok: true, pieceId: "logic:button:1,1:0:n", kind: "interact" }).kind
    ).toBe("interact");
  });

  it("parses escape session and room.session realtime", () => {
    const session = EscapeSessionSchema.parse({
      roomId: "room-1",
      status: "running",
      startedAt: "2026-05-31T12:00:00.000Z",
      durationSec: 900,
      endedAt: null
    });
    expect(session.status).toBe("running");
    const msg = RoomSessionMessageV1Schema.parse({
      type: "room.session.v1",
      roomId: "room-1",
      session,
      sentAt: 1,
      senderId: "u1"
    });
    expect(msg.type).toBe("room.session.v1");
  });

  it("parses room.logic realtime messages", () => {
    const msg = RoomLogicRealtimeMessageSchema.parse({
      type: "room.logic.state.v1",
      roomId: "room-1",
      channels: { "ch-a": { latched: true, lastPulseAt: 1 } },
      sentAt: 1,
      senderId: "u1"
    });
    expect(msg.type).toBe("room.logic.state.v1");
    expect(LogicStateSchema.parse({ roomId: "room-1", channels: {}, nodes: {}, updatedAt: "t" }).roomId).toBe(
      "room-1"
    );
  });
});
