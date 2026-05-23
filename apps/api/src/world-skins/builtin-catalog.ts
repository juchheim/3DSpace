import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WorldSkinSchema, type WorldSkin } from "@3dspace/contracts";
import type { Repository } from "../repository.js";

function resolveBuiltinCatalogPath() {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const bundled = join(moduleDir, "catalog/builtin.json");
  if (existsSync(bundled)) return bundled;
  const monorepo = join(moduleDir, "../../../../packages/world-skins/catalog/builtin.json");
  if (existsSync(monorepo)) return monorepo;
  throw new Error(`Builtin world-skins catalog not found (tried ${bundled} and ${monorepo})`);
}

export function loadBuiltinWorldSkinCatalog(): WorldSkin[] {
  const raw = JSON.parse(readFileSync(resolveBuiltinCatalogPath(), "utf8")) as unknown[];
  return raw.map((entry) => WorldSkinSchema.parse(entry));
}

export async function seedBuiltinWorldSkins(repository: Repository) {
  const skins = loadBuiltinWorldSkinCatalog();
  await repository.upsertBuiltinWorldSkins(skins);
}
