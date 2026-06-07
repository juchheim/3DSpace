"use client";

import { Suspense, useMemo } from "react";
import type { AvatarAccessoryCatalogEntry, AvatarEquippedAccessories } from "@3dspace/contracts";
import type { Object3D } from "three";
import { getAccessoryAdjustment, resolveAccessoryEntry } from "../lib/avatarAccessoryAdjustments";
import { BUILTIN_AVATAR_ACCESSORY_CATALOG } from "../lib/avatarAccessoryCatalog";
import { AvatarAccessoryGlb, findBone } from "./AvatarAccessoryGlb";

const ACCESSORY_SLOTS = ["head", "hands"] as const;

type AccessoryMount = {
  key: string;
  bone: Object3D;
  mirrorX: boolean;
};

function collectAccessoryMounts(
  root: Object3D,
  entry: AvatarAccessoryCatalogEntry,
  slot: (typeof ACCESSORY_SLOTS)[number],
  slug: string
): AccessoryMount[] {
  const mounts: AccessoryMount[] = [];
  const primaryBone = findBone(root, entry.attachBone);
  if (primaryBone) {
    mounts.push({ key: `${slot}:${slug}:primary`, bone: primaryBone, mirrorX: false });
  }

  if (entry.pairedAttachBone) {
    const pairedBone = findBone(root, entry.pairedAttachBone);
    if (pairedBone) {
      mounts.push({
        key: `${slot}:${slug}:paired`,
        bone: pairedBone,
        mirrorX: entry.mirrorPaired ?? false
      });
    }
  }

  return mounts;
}

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
      {ACCESSORY_SLOTS.flatMap((slot) => {
        const slug = equipped[slot];
        if (!slug) return [];
        const entry = catalogBySlug.get(slug);
        if (!entry) return [];
        const resolvedEntry = resolveAccessoryEntry(entry, getAccessoryAdjustment(equipped, slug));
        return collectAccessoryMounts(root, resolvedEntry, slot, slug).map(({ key, bone, mirrorX }) => (
          <Suspense key={key} fallback={null}>
            <AvatarAccessoryGlb entry={resolvedEntry} bone={bone} mirrorX={mirrorX} />
          </Suspense>
        ));
      })}
    </>
  );
}
