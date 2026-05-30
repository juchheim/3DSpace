import type { AppConfig } from "../config.js";
import { tooManyRequests } from "../errors.js";

const WINDOW_MS = 60_000;

export class SessionRateLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly config: AppConfig) {}

  enforce(userId: string, roomId: string) {
    const now = Date.now();
    const key = `${roomId}:${userId}`;
    const existing = this.attempts.get(key);
    if (!existing || existing.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }
    if (existing.count >= this.config.tuning.sessionJoinRateLimitPerMinute) {
      throw tooManyRequests("Too many room join attempts. Wait before requesting another session token.");
    }
    existing.count += 1;
  }
}
