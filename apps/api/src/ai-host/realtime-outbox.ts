import type { RoomAiHost, RoomAiHostFile, RoomAiHostRealtimeMessage } from "@3dspace/contracts";

export function buildAiHostUpdatedMessage(input: {
  roomId: string;
  host: RoomAiHost;
  senderId: string;
  sentAt?: number;
}): Extract<RoomAiHostRealtimeMessage, { type: "room.ai-host.updated.v1" }> {
  return {
    type: "room.ai-host.updated.v1",
    roomId: input.roomId,
    host: input.host,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}

export function buildAiHostDismissedMessage(input: {
  roomId: string;
  senderId: string;
  deleteFiles?: boolean | undefined;
  sentAt?: number;
}): Extract<RoomAiHostRealtimeMessage, { type: "room.ai-host.dismissed.v1" }> {
  return {
    type: "room.ai-host.dismissed.v1",
    roomId: input.roomId,
    deleteFiles: input.deleteFiles ?? false,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}

export function buildAiHostFileUpdatedMessage(input: {
  roomId: string;
  file: RoomAiHostFile;
  senderId: string;
  sentAt?: number;
}): Extract<RoomAiHostRealtimeMessage, { type: "room.ai-host.file.updated.v1" }> {
  return {
    type: "room.ai-host.file.updated.v1",
    roomId: input.roomId,
    file: input.file,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}

export function buildAiHostFileRemovedMessage(input: {
  roomId: string;
  fileId: string;
  senderId: string;
  sentAt?: number;
}): Extract<RoomAiHostRealtimeMessage, { type: "room.ai-host.file.removed.v1" }> {
  return {
    type: "room.ai-host.file.removed.v1",
    roomId: input.roomId,
    fileId: input.fileId,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}
