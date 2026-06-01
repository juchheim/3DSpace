import type { RoomAiHost, RoomAiHostRealtimeMessage } from "@3dspace/contracts";

export function applyAiHostRealtimeMessage(
  host: RoomAiHost | null,
  message: RoomAiHostRealtimeMessage
): RoomAiHost | null {
  switch (message.type) {
    case "room.ai-host.updated.v1":
      return message.host;
    case "room.ai-host.dismissed.v1":
      return null;
    case "room.ai-host.file.updated.v1":
    case "room.ai-host.file.removed.v1":
      return host;
    default:
      return host;
  }
}
