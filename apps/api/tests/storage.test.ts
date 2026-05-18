import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { createDownloadTarget } from "../src/services/storage.js";

function storageConfig(overrides: Partial<AppConfig["objectStorage"]> = {}): AppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 8080,
    apiPublicUrl: "http://127.0.0.1:8080",
    corsAllowedOrigins: [],
    clerkSecretKey: undefined,
    clerkWebhookSecret: undefined,
    mongoUri: undefined,
    mongoDbName: "3dspace",
    livekitUrl: "ws://localhost:7880",
    livekitApiKey: undefined,
    livekitApiSecret: undefined,
    objectStorage: {
      endpoint: "https://example.r2.cloudflarestorage.com",
      bucket: "media",
      accessKeyId: "key",
      secretAccessKey: "secret",
      publicBaseUrl: "https://cdn.example.com",
      publicRead: false,
      ...overrides
    },
    sentryDsn: undefined,
    tuning: {} as AppConfig["tuning"]
  };
}

describe("createDownloadTarget", () => {
  it("presigns downloads when public base URL is set but public read is disabled", async () => {
    const download = await createDownloadTarget(storageConfig(), { storageKey: "rooms/test.png" });
    expect(download.url).toContain("X-Amz-Algorithm");
    expect(download.url).not.toContain("https://cdn.example.com/");
  });

  it("returns the public base URL when public read is enabled", async () => {
    const download = await createDownloadTarget(storageConfig({ publicRead: true }), { storageKey: "rooms/test.png" });
    expect(download.url).toBe("https://cdn.example.com/rooms/test.png");
  });
});
