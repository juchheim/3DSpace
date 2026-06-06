import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { signAccessToken, verifyAccessToken } from "../../src/auth/jwt.js";

describe("access JWT", () => {
  it("signs and verifies access-token claims", () => {
    const config = loadConfig({ NODE_ENV: "test", AUTH_JWT_SECRET: "secret" });
    const signed = signAccessToken(
      { sub: "google:123", email: "teacher@example.com", name: "Teacher", provider: "google" },
      config
    );
    expect(verifyAccessToken(signed.token, config)).toEqual({
      sub: "google:123",
      email: "teacher@example.com",
      name: "Teacher",
      provider: "google"
    });
  });

  it("rejects expired tokens", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      AUTH_JWT_SECRET: "secret",
      AUTH_JWT_TTL_SECONDS: "-1"
    });
    const signed = signAccessToken({ sub: "google:123", name: "Teacher", provider: "google" }, config);
    expect(() => verifyAccessToken(signed.token, config)).toThrow(/Invalid or expired/);
  });

  it("rejects tokens signed with another secret", () => {
    const config = loadConfig({ NODE_ENV: "test", AUTH_JWT_SECRET: "secret" });
    const otherConfig = loadConfig({ NODE_ENV: "test", AUTH_JWT_SECRET: "other-secret" });
    const signed = signAccessToken({ sub: "google:123", name: "Teacher", provider: "google" }, config);
    expect(() => verifyAccessToken(signed.token, otherConfig)).toThrow(/Invalid or expired/);
  });
});
