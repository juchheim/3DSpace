import crypto from "node:crypto";
import type { AppConfig } from "../config.js";
import { authSessionExpired } from "../errors.js";
import type { AuthRefreshSessionRecord, Repository } from "../repository.js";
import { randomToken } from "./google-oauth.js";

function tokenHash(refreshToken: string) {
  return crypto.createHash("sha256").update(refreshToken).digest("hex");
}

function newSessionId() {
  return `authsess_${crypto.randomBytes(16).toString("hex")}`;
}

export function hashRefreshTokenForTests(refreshToken: string) {
  return tokenHash(refreshToken);
}

export async function createRefreshSession(
  repository: Repository,
  config: AppConfig,
  input: { userId: string; rotatedFromId?: string }
) {
  const refreshToken = randomToken(32);
  const now = new Date();
  const record: AuthRefreshSessionRecord = {
    id: newSessionId(),
    userId: input.userId,
    tokenHash: tokenHash(refreshToken),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.authRefreshTtlSeconds * 1000).toISOString(),
    ...(input.rotatedFromId ? { rotatedFromId: input.rotatedFromId } : {})
  };
  await repository.createAuthRefreshSession(record);
  return {
    session: record,
    refreshToken,
    refreshExpiresAt: record.expiresAt
  };
}

export async function rotateRefreshSession(repository: Repository, config: AppConfig, refreshToken: string) {
  const existing = await repository.getAuthRefreshSessionByTokenHash(tokenHash(refreshToken));
  if (
    !existing ||
    existing.revokedAt ||
    new Date(existing.expiresAt).getTime() <= Date.now()
  ) {
    throw authSessionExpired();
  }

  await repository.revokeAuthRefreshSession(existing.id, new Date().toISOString());
  return createRefreshSession(repository, config, { userId: existing.userId, rotatedFromId: existing.id });
}

export async function revokeRefreshSession(repository: Repository, refreshToken: string) {
  const existing = await repository.getAuthRefreshSessionByTokenHash(tokenHash(refreshToken));
  if (!existing || existing.revokedAt) return;
  await repository.revokeAuthRefreshSession(existing.id, new Date().toISOString());
}
