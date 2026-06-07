"use client";

import { Suspense, useMemo } from "react";
import type { AvatarAccessoryCatalogEntry, AvatarEquippedAccessories } from "@3dspace/contracts";
import type { Object3D } from "three";
import { getAccessoryAdjustment, resolveAccessoryEntry } from "../lib/avatarAccessoryAdjustments";
import { BUILTIN_AVATAR_ACCESSORY_CATALOG } from "../lib/avatarAccessoryCatalog";
import { AvatarAccessoryGlb, findBone } from "./AvatarAccessoryGlb";

const ACCESSORY_SLOTS = ["head"] as const;

export type AvatarAccessoryLayerProps = {
  root: Object3D;
  equipped: AvatarEquippedAccessories;
  catalog?: AvatarAccessoryCatalogEntry[];
};

export function AvatarAccessoryLayer({
  root,
  equipped,
  catalog = BUILTIN_AVATAR_ACCESSORY_CATALOG
}: AvatarAccessoryLayerProps) {
  const catalogBySlug = useMemo(() => new Map(catalog.map((entry) => [entry.slug, entry])), [catalog]);

  return (
    <>
      {ACCESSORY_SLOTS.map((slot) => {
        const slug = equipped[slot];
        if (!slug) return null;
        const entry = catalogBySlug.get(slug);
        if (!entry) return null;
        const resolvedEntry = resolveAccessoryEntry(entry, getAccessoryAdjustment(equipped, slug));
        const bone = findBone(root, entry.attachBone);
        if (!bone) return null;
        return (
          <Suspense key={`${slot}:${slug}`} fallback={null}>
            <AvatarAccessoryGlb entry={resolvedEntry} bone={bone} />
          </Suspense>
        );
      })}
    </>
  );
}
