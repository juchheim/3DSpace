import { randomToken } from "./google-oauth.js";
import type { AppConfig } from "../config.js";
import { authSessionExpired } from "../errors.js";
import type { AuthExchangeCodeRecord, Repository } from "../repository.js";

export async function createExchangeCode(
  repository: Repository,
  config: AppConfig,
  input: { userId: string; displayName: string; email?: string }
) {
  const now = new Date();
  const record: AuthExchangeCodeRecord = {
    code: randomToken(32),
    userId: input.userId,
    displayName: input.displayName,
    ...(input.email ? { email: input.email } : {}),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.authExchangeTtlSeconds * 1000).toISOString()
  };
  await repository.createAuthExchangeCode(record);
  return record.code;
}

export async function consumeExchangeCode(repository: Repository, code: string) {
  const record = await repository.consumeAuthExchangeCode(code);
  if (!record) throw authSessionExpired();
  return record;
}
