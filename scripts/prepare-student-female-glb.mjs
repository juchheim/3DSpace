// Optimize student-female.glb for avatar runtime:
//   - Baked base color / emissive PNG → JPEG (quality 85)
//
// Run:  node scripts/prepare-student-female-glb.mjs
// In:   GLBs/student-white-female.glb
// Out:  apps/web/public/avatars/student-female.glb

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const IN_PATH = resolve(__dirname, "../GLBs/student-white-female.glb");
const OUT_PATH = resolve(__dirname, "../apps/web/public/avatars/student-female.glb");
const OPTIMIZE = resolve(__dirname, "optimize-lp-glb.mjs");

const result = spawnSync(process.execPath, [OPTIMIZE, IN_PATH, OUT_PATH], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
