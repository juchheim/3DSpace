import type { RoomAiHost, RoomAiHostRealtimeMessage } from "@3dspace/contracts";

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
  sentAt?: number;
}): Extract<RoomAiHostRealtimeMessage, { type: "room.ai-host.dismissed.v1" }> {
  return {
    type: "room.ai-host.dismissed.v1",
    roomId: input.roomId,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}
