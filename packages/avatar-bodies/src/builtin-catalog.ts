import catalogJson from "../catalog/builtin.json";
import {
  AvatarBodyCatalogEntrySchema,
  AvatarBodySlugSchema,
  type AvatarBodyCatalogEntry,
  type AvatarBodySlug
} from "@3dspace/contracts";

function loadRawBuiltinCatalog(): unknown[] {
  if (!Array.isArray(catalogJson)) {
    throw new Error("Avatar body builtin catalog must be a JSON array");
  }
  return catalogJson;
}

export function getBuiltinAvatarBodyCatalog(): AvatarBodyCatalogEntry[] {
  return loadRawBuiltinCatalog().map((entry) => AvatarBodyCatalogEntrySchema.parse(entry));
}

export const BUILTIN_AVATAR_BODIES = getBuiltinAvatarBodyCatalog();

export const DEFAULT_AVATAR_BODY_SLUG: AvatarBodySlug = AvatarBodySlugSchema.parse("azure-vanguard");

export function getBuiltinAvatarBodyBySlug(slug: string): AvatarBodyCatalogEntry | undefined {
  return BUILTIN_AVATAR_BODIES.find((entry) => entry.slug === slug);
}

export function resolveAvatarBodySlug(slug: string | null | undefined): AvatarBodySlug {
  const parsed = AvatarBodySlugSchema.safeParse(slug);
  if (parsed.success && getBuiltinAvatarBodyBySlug(parsed.data)) return parsed.data;
  return DEFAULT_AVATAR_BODY_SLUG;
}
