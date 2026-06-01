import { describe, expect, it } from "vitest";
import { HttpError } from "../../src/errors.js";
import {
  assertAiHostChatRateLimit,
  countRecentUserMessages,
  secondsUntilRateLimitResets
} from "../../src/ai-host/rate-limit.js";
import type { RoomAiHostChatMessage } from "@3dspace/contracts";

function userMessage(minutesAgo: number): RoomAiHostChatMessage {
  return {
    id: `msg_${minutesAgo}`,
    roomId: "room-1",
    userId: "user-1",
    mode: "build-help",
    role: "user",
    content: "hello",
    createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString()
  };
}

describe("ai-host rate limit", () => {
  it("counts only user messages in the trailing hour", () => {
    const now = Date.now();
    const messages = [
      userMessage(5),
      userMessage(70),
      { ...userMessage(10), role: "assistant" as const }
    ];
    expect(countRecentUserMessages(messages, now)).toBe(1);
  });

  it("throws ai-host-rate-limited with retryAfterSeconds", () => {
    const now = Date.now();
    const messages = [userMessage(5), userMessage(10), userMessage(15)];
    try {
      assertAiHostChatRateLimit(messages, 2, now);
      expect.fail("expected rate limit");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      const http = err as HttpError;
      expect(http.code).toBe("ai-host-rate-limited");
      expect(http.details?.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("computes seconds until the oldest message ages out", () => {
    const now = Date.now();
    const messages = [userMessage(30)];
    const seconds = secondsUntilRateLimitResets(messages, now);
    expect(seconds).toBeGreaterThan(1700);
    expect(seconds).toBeLessThanOrEqual(1800);
  });
});
