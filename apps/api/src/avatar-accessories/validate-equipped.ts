import {
  AvatarEquippedAccessoriesSchema,
  type AvatarAccessoryCatalogEntry,
  type AvatarEquippedAccessories
} from "@3dspace/contracts";
import { getBuiltinAvatarAccessoryCatalog } from "@3dspace/avatar-accessories";
import { z } from "zod";
import { badRequest } from "../errors.js";

const ACCESSORY_SLOTS = ["head"] as const;

export const PatchUserAvatarAccessoriesBodySchema = z.object({
  accessories: z
    .object({
      head: z.string().nullable().optional().default(null)
    })
    .strict()
});

export function validateEquippedAccessories(
  accessories: AvatarEquippedAccessories,
  catalog: AvatarAccessoryCatalogEntry[] = getBuiltinAvatarAccessoryCatalog()
): AvatarEquippedAccessories {
  const parsed = AvatarEquippedAccessoriesSchema.parse(accessories);
  const catalogBySlug = new Map(catalog.map((entry) => [entry.slug, entry]));

  for (const slot of ACCESSORY_SLOTS) {
    const slug = parsed[slot];
    if (slug == null) continue;
    const entry = catalogBySlug.get(slug);
    if (!entry) throw badRequest(`Unknown accessory slug: ${slug}`);
    if (entry.slot !== slot) {
      throw badRequest(`Accessory "${slug}" is not equippable in slot "${slot}"`);
    }
  }

  return parsed;
}
