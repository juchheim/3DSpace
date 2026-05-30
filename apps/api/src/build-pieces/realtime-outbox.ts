import type { BuildPiece, RoomBuildRealtimeMessage } from "@3dspace/contracts";

export function buildBuildUpsertMessage(input: {
  roomId: string;
  piece: BuildPiece;
  senderId: string;
  sentAt?: number;
}): Extract<RoomBuildRealtimeMessage, { type: "room.build.upsert.v1" }> {
  return {
    type: "room.build.upsert.v1",
    roomId: input.roomId,
    piece: input.piece,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}

export function buildBuildRemoveMessage(input: {
  roomId: string;
  pieceId: string;
  senderId: string;
  sentAt?: number;
}): Extract<RoomBuildRealtimeMessage, { type: "room.build.remove.v1" }> {
  return {
    type: "room.build.remove.v1",
    roomId: input.roomId,
    pieceId: input.pieceId,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}

export function buildBuildBatchMessage(input: {
  roomId: string;
  pieces: BuildPiece[];
  senderId: string;
  sentAt?: number;
}): Extract<RoomBuildRealtimeMessage, { type: "room.build.batch.v1" }> {
  return {
    type: "room.build.batch.v1",
    roomId: input.roomId,
    pieces: input.pieces,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}
