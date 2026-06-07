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

const avatarAccessoriesSource = join(root, "../../packages/avatar-accessories/catalog/builtin.json");
const avatarAccessoriesTargetDir = join(root, "dist/avatar-accessories/catalog");
mkdirSync(avatarAccessoriesTargetDir, { recursive: true });
copyFileSync(avatarAccessoriesSource, join(avatarAccessoriesTargetDir, "builtin.json"));

const avatarBodiesSource = join(root, "../../packages/avatar-bodies/catalog/builtin.json");
const avatarBodiesTargetDir = join(root, "dist/avatar-bodies/catalog");
mkdirSync(avatarBodiesTargetDir, { recursive: true });
copyFileSync(avatarBodiesSource, join(avatarBodiesTargetDir, "builtin.json"));

const aiHostCorpusSource = join(root, "src/ai-host/corpus/world-building-guide.md");
const aiHostCorpusTargetDir = join(root, "dist/ai-host/corpus");
mkdirSync(aiHostCorpusTargetDir, { recursive: true });
copyFileSync(aiHostCorpusSource, join(aiHostCorpusTargetDir, "world-building-guide.md"));
