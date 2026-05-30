import type { WorldSkin } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { worldSkinAssetUrl } from "./uploader.js";

export function rewriteWorldSkinAssetUrls(skin: WorldSkin, config: AppConfig): WorldSkin {
  const overrides = skin.overrides;
  return {
    ...skin,
    thumbnailStorageKey: worldSkinAssetUrl(config, skin.thumbnailStorageKey),
    overrides: {
      ...overrides,
      panoramaWall: overrides.panoramaWall
        ? { ...overrides.panoramaWall, storageKey: worldSkinAssetUrl(config, overrides.panoramaWall.storageKey) }
        : undefined,
      walls: Object.fromEntries(
        Object.entries(overrides.walls).map(([id, wall]) => [
          id,
          wall.textureStorageKey ? { ...wall, textureStorageKey: worldSkinAssetUrl(config, wall.textureStorageKey) } : wall
        ])
      ),
      floor: overrides.floor?.textureStorageKey
        ? { ...overrides.floor, textureStorageKey: worldSkinAssetUrl(config, overrides.floor.textureStorageKey) }
        : overrides.floor,
      tiers: overrides.tiers?.textureStorageKey
        ? { ...overrides.tiers, textureStorageKey: worldSkinAssetUrl(config, overrides.tiers.textureStorageKey) }
        : overrides.tiers,
      domeCeiling: overrides.domeCeiling?.textureStorageKey
        ? {
            ...overrides.domeCeiling,
            textureStorageKey: worldSkinAssetUrl(config, overrides.domeCeiling.textureStorageKey)
          }
        : overrides.domeCeiling,
      sky: overrides.sky?.storageKey
        ? { ...overrides.sky, storageKey: worldSkinAssetUrl(config, overrides.sky.storageKey) }
        : overrides.sky,
      ambient: overrides.ambient
        ? { ...overrides.ambient, storageKey: worldSkinAssetUrl(config, overrides.ambient.storageKey) }
        : undefined,
      map2dStorageKey: overrides.map2dStorageKey ? worldSkinAssetUrl(config, overrides.map2dStorageKey) : undefined
    }
  };
}
