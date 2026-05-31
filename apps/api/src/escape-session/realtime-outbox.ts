import type { EscapeSession, RoomSessionRealtimeMessage } from "@3dspace/contracts";

export function buildRoomSessionMessage(input: {
  roomId: string;
  session: EscapeSession;
  senderId: string;
}): RoomSessionRealtimeMessage {
  return {
    type: "room.session.v1",
    roomId: input.roomId,
    session: input.session,
    sentAt: Date.now(),
    senderId: input.senderId
  };
}
