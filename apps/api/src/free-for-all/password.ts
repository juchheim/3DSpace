import crypto from "node:crypto";
import type { AppConfig } from "../config.js";
import { unauthorized } from "../errors.js";

export function freeForAllPasswordConfigured(config: AppConfig) {
  return Boolean(config.freeForAllPassword);
}

export function assertFreeForAllPassword(config: AppConfig, provided: string | undefined) {
  if (!freeForAllPasswordConfigured(config)) {
    throw unauthorized("Free-for-All rooms are not configured (set FREE_FOR_ALL_PASSWORD)");
  }
  const expected = config.freeForAllPassword!;
  if (!provided) {
    throw unauthorized("Free-for-All password required");
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw unauthorized("Invalid Free-for-All password");
  }
}
