import { WorldSkinSchema, type WorldSkin } from "@3dspace/contracts";
import type { Repository } from "../repository.js";
import { loadBuiltinCatalog } from "../catalog/load-builtin.js";

export function loadBuiltinWorldSkinCatalog(): WorldSkin[] {
  return loadBuiltinCatalog({
    importMetaUrl: import.meta.url,
    packagePath: "../../../../packages/world-skins/catalog/builtin.json",
    parse: (entry) => WorldSkinSchema.parse(entry)
  });
}

export async function seedBuiltinWorldSkins(repository: Repository) {
  const skins = loadBuiltinWorldSkinCatalog();
  await repository.upsertBuiltinWorldSkins(skins);
}
