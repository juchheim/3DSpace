import { RoomObjectTemplateSchema, type RoomObjectTemplate } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import type { Repository } from "../repository.js";
import { loadBuiltinCatalog } from "../catalog/load-builtin.js";

/** Placeholder origin for public GLB assets resolved to `config.appUrl` at seed time. */
export const BUILTIN_PUBLIC_ASSET_ORIGIN = "https://app.invalid";

export function resolveBuiltinRoomObjectAssetUrls(
  templates: RoomObjectTemplate[],
  appUrl: string
): RoomObjectTemplate[] {
  const origin = appUrl.replace(/\/+$/, "");
  return templates.map((template) => {
    if (template.assetUrl?.startsWith(`${BUILTIN_PUBLIC_ASSET_ORIGIN}/`)) {
      return {
        ...template,
        assetUrl: `${origin}${template.assetUrl.slice(BUILTIN_PUBLIC_ASSET_ORIGIN.length)}`
      };
    }
    return template;
  });
}

export function loadBuiltinRoomObjectCatalog(): RoomObjectTemplate[] {
  return loadBuiltinCatalog({
    importMetaUrl: import.meta.url,
    packagePath: "../../../../packages/room-objects/catalog/builtin.json",
    parse: (entry) => RoomObjectTemplateSchema.parse(entry)
  });
}

export async function seedBuiltinRoomObjectTemplates(repository: Repository, config?: Pick<AppConfig, "appUrl">) {
  const templates = config?.appUrl
    ? resolveBuiltinRoomObjectAssetUrls(loadBuiltinRoomObjectCatalog(), config.appUrl)
    : loadBuiltinRoomObjectCatalog();
  await repository.upsertBuiltinRoomObjectTemplates(templates);
}
