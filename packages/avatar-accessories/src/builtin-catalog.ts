import catalogJson from "../catalog/builtin.json";
import {
  AvatarAccessoryCatalogEntrySchema,
  type AvatarAccessoryCatalogEntry
} from "@3dspace/contracts";

function loadRawBuiltinCatalog(): unknown[] {
  if (!Array.isArray(catalogJson)) {
    throw new Error("Avatar accessory builtin catalog must be a JSON array");
  }
  return catalogJson;
}

export function getBuiltinAvatarAccessoryCatalog(): AvatarAccessoryCatalogEntry[] {
  return loadRawBuiltinCatalog().map((entry) => AvatarAccessoryCatalogEntrySchema.parse(entry));
}

/** Parsed built-in catalog entries (same as {@link getBuiltinAvatarAccessoryCatalog}). */
export const BUILTIN_AVATAR_ACCESSORIES = getBuiltinAvatarAccessoryCatalog();

export function getBuiltinAvatarAccessoryBySlug(slug: string): AvatarAccessoryCatalogEntry | undefined {
  return BUILTIN_AVATAR_ACCESSORIES.find((entry) => entry.slug === slug);
}
