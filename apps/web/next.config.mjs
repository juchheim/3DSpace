import nextEnv from "@next/env";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Monorepo: load shared environment defaults from the repository root.
nextEnv.loadEnvConfig(repoRoot);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@3dspace/contracts",
    "@3dspace/room-engine",
    "@3dspace/avatar-accessories",
    "@3dspace/avatar-bodies"
  ],
  experimental: {
    externalDir: true
  },
  // Silence Next 16's "webpack config without turbopack config" error. Dev uses
  // `--webpack` (see package.json) so extensionAlias applies; production build
  // resolves workspace packages to dist and runs fine under Turbopack.
  turbopack: {},
  // Next.js 16 defaults to Turbopack, which lacks webpack's extensionAlias.
  // Workspace packages (notably @3dspace/contracts) use ESM `.js` import specifiers
  // that point at `.ts` sources via the package.json `development` export condition.
  // Run `next dev --webpack` (see package.json) so this alias is applied.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
