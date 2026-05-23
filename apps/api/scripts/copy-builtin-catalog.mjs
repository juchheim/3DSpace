import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const roomObjectsSource = join(root, "../../packages/room-objects/catalog/builtin.json");
const roomObjectsTargetDir = join(root, "dist/room-objects/catalog");
mkdirSync(roomObjectsTargetDir, { recursive: true });
copyFileSync(roomObjectsSource, join(roomObjectsTargetDir, "builtin.json"));

const worldSkinsSource = join(root, "../../packages/world-skins/catalog/builtin.json");
const worldSkinsTargetDir = join(root, "dist/world-skins/catalog");
mkdirSync(worldSkinsTargetDir, { recursive: true });
copyFileSync(worldSkinsSource, join(worldSkinsTargetDir, "builtin.json"));
