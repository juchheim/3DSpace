import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const productionEnv = {
  NODE_ENV: "production",
  API_PUBLIC_URL: "https://api.example.com",
  APP_URL: "https://app.example.com",
  CORS_ALLOWED_ORIGINS: "https://app.example.com",
  GOOGLE_OAUTH_CLIENT_ID: "google-client",
  GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
  AUTH_JWT_SECRET: "test-jwt-secret",
  AUTH_ALLOWED_EMAIL_DOMAINS: "example.com",
  MONGODB_URI: "mongodb://localhost",
  LIVEKIT_URL: "wss://livekit.example.com",
  LIVEKIT_API_KEY: "lk",
  LIVEKIT_API_SECRET: "secret",
  ENABLE_SHARED_BROWSERS: "true",
  ENABLE_WALL_ATTACHMENTS: "false",
  ENABLE_WHITEBOARDS: "false"
} as NodeJS.ProcessEnv;

describe("loadConfig shared browser / Hyperbeam", () => {
  it("requires HYPERBEAM_API_KEY when shared browsers are enabled in production", () => {
    expect(() => loadConfig(productionEnv)).toThrow(/HYPERBEAM_API_KEY/);
  });

  it("accepts production shared browsers when HYPERBEAM_API_KEY is set", () => {
    const config = loadConfig({ ...productionEnv, HYPERBEAM_API_KEY: "hb_test" });
    expect(config.tuning.enableSharedBrowsers).toBe(true);
    expect(config.tuning.hyperbeamApiKey).toBe("hb_test");
    expect(config.tuning.sharedBrowserHyperbeamQuality).toBe("sharp");
    expect(config.tuning.sharedBrowserHyperbeamFramerate).toBe(30);
  });

  it("rejects invalid SHARED_BROWSER_HYPERBEAM_FRAMERATE", () => {
    expect(() =>
      loadConfig({
        SHARED_BROWSER_HYPERBEAM_FRAMERATE: "12"
      })
    ).toThrow(/SHARED_BROWSER_HYPERBEAM_FRAMERATE/);
  });

  it("parses hyperbeam quality from env", () => {
    const config = loadConfig({
      SHARED_BROWSER_HYPERBEAM_QUALITY: "sharp",
      SHARED_BROWSER_HYPERBEAM_FRAMERATE: "60"
    });
    expect(config.tuning.sharedBrowserHyperbeamQuality).toBe("sharp");
    expect(config.tuning.sharedBrowserHyperbeamFramerate).toBe(60);
  });
});
