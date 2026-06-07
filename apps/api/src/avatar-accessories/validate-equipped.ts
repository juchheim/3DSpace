import {
  AvatarAccessoryAdjustmentSchema,
  AvatarEquippedAccessoriesSchema,
  type AvatarAccessoryCatalogEntry,
  type AvatarEquippedAccessories
} from "@3dspace/contracts";
import { getBuiltinAvatarAccessoryCatalog } from "@3dspace/avatar-accessories";
import { z } from "zod";
import { badRequest } from "../errors.js";

const ACCESSORY_SLOTS = ["head", "hands"] as const;

const ADJUSTMENT_LIMITS = {
  position: 0.15,
  rotation: Math.PI,
  scale: 2
} as const;

export const PatchUserAvatarAccessoriesBodySchema = z.object({
  accessories: AvatarEquippedAccessoriesSchema
});

function validateAdjustmentValues(slug: string, adjustment: z.infer<typeof AvatarAccessoryAdjustmentSchema>) {
  const position = adjustment.positionOffset;
  if (position) {
    for (const axis of ["x", "y", "z"] as const) {
      const value = position[axis];
      if (value != null && Math.abs(value) > ADJUSTMENT_LIMITS.position) {
        throw badRequest(`Accessory "${slug}" ${axis} offset out of range`);
      }
    }
  }

  const rotation = adjustment.rotationOffset;
  if (rotation) {
    for (const axis of ["x", "y", "z"] as const) {
      const value = rotation[axis];
      if (value != null && Math.abs(value) > ADJUSTMENT_LIMITS.rotation) {
        throw badRequest(`Accessory "${slug}" ${axis} rotation out of range`);
      }
    }
  }

  if (adjustment.scaleOffset != null && Math.abs(adjustment.scaleOffset) > ADJUSTMENT_LIMITS.scale) {
    throw badRequest(`Accessory "${slug}" scale offset out of range`);
  }
}

export function validateEquippedAccessories(
  accessories: AvatarEquippedAccessories,
  catalog: AvatarAccessoryCatalogEntry[] = getBuiltinAvatarAccessoryCatalog()
): AvatarEquippedAccessories {
  const parsed = AvatarEquippedAccessoriesSchema.parse(accessories);
  const catalogBySlug = new Map(catalog.map((entry) => [entry.slug, entry]));
  const equippedSlugs = new Set<string>();

  for (const slot of ACCESSORY_SLOTS) {
    const slug = parsed[slot];
    if (slug == null) continue;
    const entry = catalogBySlug.get(slug);
    if (!entry) throw badRequest(`Unknown accessory slug: ${slug}`);
    if (entry.slot !== slot) {
      throw badRequest(`Accessory "${slug}" is not equippable in slot "${slot}"`);
    }
    equippedSlugs.add(slug);
  }

  const adjustments = parsed.adjustments ?? {};
  for (const [slug, adjustment] of Object.entries(adjustments)) {
    if (!catalogBySlug.has(slug)) throw badRequest(`Unknown accessory adjustment slug: ${slug}`);
    if (!equippedSlugs.has(slug)) {
      throw badRequest(`Accessory "${slug}" is not equipped`);
    }
    validateAdjustmentValues(slug, adjustment);
  }

  return parsed;
}
