import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@3dspace/contracts": new URL("../../packages/contracts/src/index.ts", import.meta.url).pathname
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
