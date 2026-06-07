"use client";

import {
  getBuiltinAvatarAccessoryBySlug,
  getBuiltinAvatarAccessoryCatalog
} from "@3dspace/avatar-accessories/browser";
import type { AvatarAccessoryCatalogEntry } from "@3dspace/contracts";
import { useGLTF } from "@react-three/drei";

export const BUILTIN_AVATAR_ACCESSORY_CATALOG = getBuiltinAvatarAccessoryCatalog();

export { getBuiltinAvatarAccessoryBySlug };

for (const entry of BUILTIN_AVATAR_ACCESSORY_CATALOG) {
  useGLTF.preload(entry.glbUrl);
}

export function resolveEquippedAccessoryEntries(
  equipped: { head?: string | null; hands?: string | null },
  catalog: AvatarAccessoryCatalogEntry[] = BUILTIN_AVATAR_ACCESSORY_CATALOG
) {
  const bySlug = new Map(catalog.map((entry) => [entry.slug, entry]));
  const entries: AvatarAccessoryCatalogEntry[] = [];
  if (equipped.head) {
    const head = bySlug.get(equipped.head);
    if (head) entries.push(head);
  }
  if (equipped.hands) {
    const hands = bySlug.get(equipped.hands);
    if (hands) entries.push(hands);
  }
  return entries;
}
