import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@3dspace/contracts": new URL("./packages/contracts/src/index.ts", import.meta.url).pathname,
      "@3dspace/room-engine": new URL("./packages/room-engine/src/index.ts", import.meta.url).pathname
    }
  },
  test: {
    environment: "node",
    include: [
      "apps/api/tests/**/*.test.ts",
      "apps/web/tests/**/*.test.ts",
      "packages/**/tests/**/*.test.ts"
    ],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["apps/api/src/**/*.ts", "packages/**/src/**/*.ts"]
    }
  }
});
