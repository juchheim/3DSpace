import { AvatarBodySlugSchema, type AvatarBodyCatalogEntry } from "@3dspace/contracts";
import { getBuiltinAvatarBodyCatalog } from "@3dspace/avatar-bodies";
import { z } from "zod";
import { badRequest } from "../errors.js";

export const PatchUserAvatarBodyBodySchema = z.object({
  bodySlug: AvatarBodySlugSchema
});

export function validateAvatarBodySlug(
  bodySlug: string,
  catalog: AvatarBodyCatalogEntry[] = getBuiltinAvatarBodyCatalog()
): z.infer<typeof AvatarBodySlugSchema> {
  const parsed = AvatarBodySlugSchema.parse(bodySlug);
  if (!catalog.some((entry) => entry.slug === parsed)) {
    throw badRequest(`Unknown avatar body slug: ${parsed}`);
  }
  return parsed;
}
