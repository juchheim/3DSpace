"use client";

import {
  DEFAULT_AVATAR_BODY_SLUG,
  getBuiltinAvatarBodyBySlug,
  getBuiltinAvatarBodyCatalog,
  resolveAvatarBodySlug
} from "@3dspace/avatar-bodies/browser";
import type { AvatarBodyCatalogEntry, AvatarBodySlug } from "@3dspace/contracts";
import { useGLTF, useTexture } from "@react-three/drei";

export const BUILTIN_AVATAR_BODY_CATALOG = getBuiltinAvatarBodyCatalog();

export { DEFAULT_AVATAR_BODY_SLUG, getBuiltinAvatarBodyBySlug, resolveAvatarBodySlug };

const TARGET_HEIGHT = 1.7;

for (const entry of BUILTIN_AVATAR_BODY_CATALOG) {
  useGLTF.preload(entry.glbUrl);
  useTexture.preload(entry.zoneMaskUrl);
}

export function resolveAvatarBodyEntry(bodySlug: AvatarBodySlug | string | null | undefined): AvatarBodyCatalogEntry {
  const slug = resolveAvatarBodySlug(bodySlug);
  return getBuiltinAvatarBodyBySlug(slug) ?? BUILTIN_AVATAR_BODY_CATALOG[0]!;
}

export function avatarBodyModelScale(entry: AvatarBodyCatalogEntry): number {
  return TARGET_HEIGHT / entry.nativeHeight;
}

/** Verse-only bodies are hidden outside Dream IXR verse room types. */
export function avatarBodyCatalogForRoom(
  catalog: AvatarBodyCatalogEntry[],
  isVerseRoom: boolean
): AvatarBodyCatalogEntry[] {
  return catalog.filter((entry) => !entry.verseOnly || isVerseRoom);
}
