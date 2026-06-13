import { HttpError } from "../errors.js";

const MINUTE_MS = 60_000;

// Map of `${userId}:${roomId}` → array of timestamps within the current minute window
const buckets = new Map<string, number[]>();

export function enforceTranslationRateLimit(
  userId: string,
  roomId: string,
  limitPerMinute: number
): void {
  const key = `${userId}:${roomId}`;
  const now = Date.now();
  const cutoff = now - MINUTE_MS;
  let timestamps = buckets.get(key) ?? [];
  timestamps = timestamps.filter((t) => t >= cutoff);
  if (timestamps.length >= limitPerMinute) {
    throw new HttpError(429, "Translation rate limit exceeded", "translation-unavailable");
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
}
