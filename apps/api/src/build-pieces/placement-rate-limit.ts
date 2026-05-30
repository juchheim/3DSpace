import type { AppConfig } from "../config.js";
import { tooManyRequests } from "../errors.js";

const WINDOW_MS = 60_000;

export class BuildPlacementRateLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly config: AppConfig) {}

  enforce(userId: string, roomId: string, placementCount: number) {
    if (placementCount <= 0) return;
    const now = Date.now();
    const key = `${roomId}:${userId}`;
    const limit = this.config.tuning.buildPlacementRateLimitPerMinute;
    const existing = this.attempts.get(key);
    if (!existing || existing.resetAt <= now) {
      if (placementCount > limit) {
        throw tooManyRequests("Too many build placements. Slow down and try again.");
      }
      this.attempts.set(key, { count: placementCount, resetAt: now + WINDOW_MS });
      return;
    }
    if (existing.count + placementCount > limit) {
      throw tooManyRequests("Too many build placements. Slow down and try again.");
    }
    existing.count += placementCount;
  }
}
