import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RoomObjectTemplateSchema, type RoomObjectTemplate } from "@3dspace/contracts";
import type { Repository } from "../repository.js";

function resolveBuiltinCatalogPath() {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const bundled = join(moduleDir, "catalog/builtin.json");
  if (existsSync(bundled)) return bundled;
  const monorepo = join(moduleDir, "../../../../packages/room-objects/catalog/builtin.json");
  if (existsSync(monorepo)) return monorepo;
  throw new Error(`Builtin room-object catalog not found (tried ${bundled} and ${monorepo})`);
}

export function loadBuiltinRoomObjectCatalog(): RoomObjectTemplate[] {
  const raw = JSON.parse(readFileSync(resolveBuiltinCatalogPath(), "utf8")) as unknown[];
  return raw.map((entry) => RoomObjectTemplateSchema.parse(entry));
}

export async function seedBuiltinRoomObjectTemplates(repository: Repository) {
  const templates = loadBuiltinRoomObjectCatalog();
  await repository.upsertBuiltinRoomObjectTemplates(templates);
}
