import type { RoomAiHostChatMessage } from "@3dspace/contracts";
import { aiHostRateLimited } from "../errors.js";

const HOUR_MS = 3_600_000;

/** Number of user messages in the trailing hour (same mode/file filter as the chat request). */
export function countRecentUserMessages(messages: RoomAiHostChatMessage[], now = Date.now()): number {
  const cutoff = now - HOUR_MS;
  return messages.filter(
    (message) => message.role === "user" && new Date(message.createdAt).getTime() >= cutoff
  ).length;
}

/** Seconds until the oldest user message in the trailing hour falls outside the window. */
export function secondsUntilRateLimitResets(messages: RoomAiHostChatMessage[], now = Date.now()): number {
  const cutoff = now - HOUR_MS;
  const recent = messages
    .filter((message) => message.role === "user" && new Date(message.createdAt).getTime() >= cutoff)
    .map((message) => new Date(message.createdAt).getTime());
  if (recent.length === 0) return 0;
  const oldest = Math.min(...recent);
  return Math.max(1, Math.ceil((oldest + HOUR_MS - now) / 1000));
}

export function assertAiHostChatRateLimit(
  messages: RoomAiHostChatMessage[],
  maxPerHour: number,
  now = Date.now()
) {
  if (countRecentUserMessages(messages, now) >= maxPerHour) {
    throw aiHostRateLimited(secondsUntilRateLimitResets(messages, now));
  }
}
