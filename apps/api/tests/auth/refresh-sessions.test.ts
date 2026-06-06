import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { MemoryRepository } from "../../src/repository.js";
import {
  createRefreshSession,
  revokeRefreshSession,
  rotateRefreshSession
} from "../../src/auth/refresh-sessions.js";

describe("refresh sessions", () => {
  it("creates and rotates refresh tokens once", async () => {
    const repository = new MemoryRepository();
    const config = loadConfig({ NODE_ENV: "test" });
    const created = await createRefreshSession(repository, config, { userId: "google:123" });
    const rotated = await rotateRefreshSession(repository, config, created.refreshToken);

    expect(rotated.refreshToken).not.toBe(created.refreshToken);
    await expect(rotateRefreshSession(repository, config, created.refreshToken)).rejects.toThrow(/Session expired/);
  });

  it("revokes refresh tokens", async () => {
    const repository = new MemoryRepository();
    const config = loadConfig({ NODE_ENV: "test" });
    const created = await createRefreshSession(repository, config, { userId: "google:123" });
    await revokeRefreshSession(repository, created.refreshToken);
    await expect(rotateRefreshSession(repository, config, created.refreshToken)).rejects.toThrow(/Session expired/);
  });
});
