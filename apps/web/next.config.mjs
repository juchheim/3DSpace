import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  envDir: repoRoot,
  transpilePackages: ["@3dspace/contracts", "@3dspace/room-engine"],
  experimental: {
    externalDir: true
  }
};

export default nextConfig;
