import { RoomObjectTemplateSchema, type RoomObjectTemplate } from "@3dspace/contracts";
import type { Repository } from "../repository.js";
import { loadBuiltinCatalog } from "../catalog/load-builtin.js";

export function loadBuiltinRoomObjectCatalog(): RoomObjectTemplate[] {
  return loadBuiltinCatalog({
    importMetaUrl: import.meta.url,
    packagePath: "../../../../packages/room-objects/catalog/builtin.json",
    parse: (entry) => RoomObjectTemplateSchema.parse(entry)
  });
}

export async function seedBuiltinRoomObjectTemplates(repository: Repository) {
  const templates = loadBuiltinRoomObjectCatalog();
  await repository.upsertBuiltinRoomObjectTemplates(templates);
}
