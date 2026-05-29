import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/test",
  globalSetup: "./apps/web/test/global-hyperbeam-setup.ts",
  globalTeardown: "./apps/web/test/global-hyperbeam-teardown.ts",
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream"
      ]
    },
    permissions: ["camera", "microphone"]
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? undefined
    : [
        {
          command:
            "ENABLE_CLASSROOM_LESSONS=true ENABLE_BREAKOUT_PODS=true ENABLE_ROOM_OBJECTS=true ENABLE_WORLD_SKINS=true ENABLE_WORKFORCE_TRAINING=true ENABLE_FREE_FOR_ALL=true FREE_FOR_ALL_PASSWORD=open-sesame ENABLE_SHARED_BROWSERS=true HYPERBEAM_API_KEY=e2e_hyperbeam_key HYPERBEAM_API_BASE=http://127.0.0.1:19098 npm --workspace @3dspace/api run dev",
          url: "http://127.0.0.1:8080/health",
          reuseExistingServer: true,
          timeout: 180_000
        },
        {
          command:
            "NEXT_PUBLIC_E2E_DEV_AUTH=true NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 NEXT_PUBLIC_ENABLE_CLASSROOM_LESSONS=true NEXT_PUBLIC_ENABLE_BREAKOUT_PODS=true NEXT_PUBLIC_ENABLE_ROOM_OBJECTS=true NEXT_PUBLIC_ENABLE_WORLD_SKINS=true NEXT_PUBLIC_ENABLE_WORKFORCE_TRAINING=true NEXT_PUBLIC_ENABLE_FREE_FOR_ALL=true NEXT_PUBLIC_ENABLE_SHARED_BROWSERS=true NEXT_PUBLIC_E2E_MOCK_HYPERBEAM_EMBED=true npm --workspace @3dspace/web run dev",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 180_000
        }
      ]
});
