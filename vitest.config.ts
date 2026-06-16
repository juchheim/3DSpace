import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@3dspace/avatar-accessories/browser",
        replacement: new URL("./packages/avatar-accessories/src/browser.ts", import.meta.url).pathname
      },
      {
        find: "@3dspace/avatar-bodies/browser",
        replacement: new URL("./packages/avatar-bodies/src/browser.ts", import.meta.url).pathname
      },
      {
        find: "@3dspace/contracts",
        replacement: new URL("./packages/contracts/src/index.ts", import.meta.url).pathname
      },
      {
        find: "@3dspace/room-engine",
        replacement: new URL("./packages/room-engine/src/index.ts", import.meta.url).pathname
      },
      {
        find: "@3dspace/avatar-accessories",
        replacement: new URL("./packages/avatar-accessories/src/index.ts", import.meta.url).pathname
      }
    ]
  },
  test: {
    environment: "node",
    include: [
      "apps/api/tests/**/*.test.ts",
      "apps/web/tests/**/*.test.ts",
      "apps/web/tests/**/*.test.tsx",
      "packages/**/tests/**/*.test.ts"
    ],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["apps/api/src/**/*.ts", "packages/**/src/**/*.ts"]
    }
  }
});
