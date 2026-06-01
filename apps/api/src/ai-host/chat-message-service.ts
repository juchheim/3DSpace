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

export { assertAiHostChatRateLimit, countRecentUserMessages, secondsUntilRateLimitResets } from "./rate-limit.js";
