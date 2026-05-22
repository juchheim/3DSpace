import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const source = join(root, "../../packages/room-objects/catalog/builtin.json");
const targetDir = join(root, "dist/room-objects/catalog");
const target = join(targetDir, "builtin.json");

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
