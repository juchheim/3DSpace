import type { BuildLogicPiece, RoomLogicRealtimeMessage } from "@3dspace/contracts";

export function buildLogicUpsertMessage(input: {
  roomId: string;
  piece: BuildLogicPiece;
  senderId: string;
}): Extract<RoomLogicRealtimeMessage, { type: "room.logic.upsert.v1" }> {
  return {
    type: "room.logic.upsert.v1",
    roomId: input.roomId,
    piece: input.piece,
    sentAt: Date.now(),
    senderId: input.senderId
  };
}

export function buildLogicRemoveMessage(input: {
  roomId: string;
  pieceId: string;
  senderId: string;
}): Extract<RoomLogicRealtimeMessage, { type: "room.logic.remove.v1" }> {
  return {
    type: "room.logic.remove.v1",
    roomId: input.roomId,
    pieceId: input.pieceId,
    sentAt: Date.now(),
    senderId: input.senderId
  };
}

export function buildLogicStateMessage(input: {
  roomId: string;
  senderId: string;
  channels?: Record<string, { latched: boolean; lastPulseAt: number }> | undefined;
  nodes?: Record<string, Record<string, unknown>> | undefined;
}): Extract<RoomLogicRealtimeMessage, { type: "room.logic.state.v1" }> {
  return {
    type: "room.logic.state.v1",
    roomId: input.roomId,
    ...(input.channels ? { channels: input.channels } : {}),
    ...(input.nodes ? { nodes: input.nodes } : {}),
    sentAt: Date.now(),
    senderId: input.senderId
  };
}
