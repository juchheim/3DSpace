import {
  RoomAiHostChatMessageSchema,
  type RoomAiHostChatMessage,
  type RoomAiHostChatMode
} from "@3dspace/contracts";
import { newId, nowIso } from "../repository.js";
import type { AiHostChatTurn } from "./chat-service.js";

export function createAiHostChatMessageRecord(input: {
  roomId: string;
  userId: string;
  mode: RoomAiHostChatMode;
  fileId?: string | undefined;
  role: RoomAiHostChatMessage["role"];
  content: string;
}): RoomAiHostChatMessage {
  return RoomAiHostChatMessageSchema.parse({
    id: newId("aihostmsg"),
    roomId: input.roomId,
    userId: input.userId,
    mode: input.mode,
    ...(input.fileId ? { fileId: input.fileId } : {}),
    role: input.role,
    content: input.content,
    createdAt: nowIso()
  });
}

/** Convert stored messages into model turns, keeping only user/assistant and the last N. */
export function toChatHistory(
  messages: RoomAiHostChatMessage[],
  maxContextMessages: number
): AiHostChatTurn[] {
  const turns = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
  if (turns.length > maxContextMessages) {
    return turns.slice(turns.length - maxContextMessages);
  }
  return turns;
}

/** Number of user messages this user sent in the room within the trailing hour. */
export function countRecentUserMessages(messages: RoomAiHostChatMessage[], now = Date.now()): number {
  const cutoff = now - 3_600_000;
  return messages.filter(
    (message) => message.role === "user" && new Date(message.createdAt).getTime() >= cutoff
  ).length;
}
