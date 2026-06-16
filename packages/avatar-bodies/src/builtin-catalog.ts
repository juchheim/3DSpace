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

/** Pre-consistency rename slugs still stored on user rows. */
const LEGACY_AVATAR_BODY_SLUGS: Record<string, AvatarBodySlug> = {
  "teacher-white-male": "teacher-male",
  "teacher-white-female": "teacher-female",
  "teacher-black-male": "teacher-male-2",
  "teacher-black-female": "teacher-female-2",
  "student-white-male": "student-male",
  "student-black-female": "student-female-2"
};

export function normalizeAvatarBodySlug(slug: string): string {
  return LEGACY_AVATAR_BODY_SLUGS[slug] ?? slug;
}

export const DEFAULT_AVATAR_BODY_SLUG: AvatarBodySlug = AvatarBodySlugSchema.parse("azure-vanguard");

export function getBuiltinAvatarBodyBySlug(slug: string): AvatarBodyCatalogEntry | undefined {
  return BUILTIN_AVATAR_BODIES.find((entry) => entry.slug === slug);
}

export function resolveAvatarBodySlug(slug: string | null | undefined): AvatarBodySlug {
  const normalized = normalizeAvatarBodySlug(slug?.trim() ?? "");
  const parsed = AvatarBodySlugSchema.safeParse(normalized);
  if (parsed.success && getBuiltinAvatarBodyBySlug(parsed.data)) return parsed.data;
  return DEFAULT_AVATAR_BODY_SLUG;
}
