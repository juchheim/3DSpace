import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/test",
  timeout: 45_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
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
          command: "ENABLE_CLASSROOM_LESSONS=true npm --workspace @3dspace/api run dev",
          url: "http://127.0.0.1:8080/health",
          reuseExistingServer: true,
          timeout: 120_000
        },
        {
          command: "NEXT_PUBLIC_E2E_DEV_AUTH=true NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 NEXT_PUBLIC_ENABLE_CLASSROOM_LESSONS=true npm --workspace @3dspace/web run dev",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: true,
          timeout: 120_000
        }
      ]
});
