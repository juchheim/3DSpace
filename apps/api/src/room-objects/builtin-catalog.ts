import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RoomObjectTemplateSchema, type RoomObjectTemplate } from "@3dspace/contracts";
import type { Repository } from "../repository.js";

const catalogPath = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/room-objects/catalog/builtin.json");

export function loadBuiltinRoomObjectCatalog(): RoomObjectTemplate[] {
  const raw = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown[];
  return raw.map((entry) => RoomObjectTemplateSchema.parse(entry));
}

export async function seedBuiltinRoomObjectTemplates(repository: Repository) {
  const templates = loadBuiltinRoomObjectCatalog();
  await repository.upsertBuiltinRoomObjectTemplates(templates);
}
