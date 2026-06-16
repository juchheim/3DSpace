import type { AvatarBodyCatalogEntry, AvatarBodySlug } from "@3dspace/contracts";
import { getBuiltinAvatarBodyCatalog, normalizeAvatarBodySlug } from "@3dspace/avatar-bodies";
import { z } from "zod";
import { badRequest } from "../errors.js";

export const PatchUserAvatarBodyBodySchema = z.object({
  bodySlug: z.string().trim().min(1)
});

export function validateAvatarBodySlug(
  bodySlug: string,
  catalog: AvatarBodyCatalogEntry[] = getBuiltinAvatarBodyCatalog()
): AvatarBodySlug {
  const slug = normalizeAvatarBodySlug(bodySlug.trim());
  if (!catalog.some((entry) => entry.slug === slug)) {
    throw badRequest(`Unknown avatar body slug: ${bodySlug}`);
  }
  return slug as AvatarBodySlug;
}
