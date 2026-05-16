import nextEnv from "@next/env";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Monorepo: load shared secrets (e.g. CLERK_SECRET_KEY) from the repository root.
nextEnv.loadEnvConfig(repoRoot);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@3dspace/contracts", "@3dspace/room-engine"],
  experimental: {
    externalDir: true
  }
};

export default nextConfig;
