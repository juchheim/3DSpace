"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorldSkin, WorldSkinDayNightMode } from "@3dspace/contracts";
import { fetchWorldSkin } from "./api";
import type { ApiIdentity } from "./identity";

// LRU-style per-slug cache with 1-hour TTL
const skinCache = new Map<string, { skin: WorldSkin; expiresAt: number }>();
const inflightFetch = new Map<string, Promise<WorldSkin>>();
const CACHE_TTL_MS = 60 * 60 * 1000;
export const CROSSFADE_MS = 1000;

async function loadSkin(slug: string, identity: ApiIdentity): Promise<WorldSkin> {
  const cached = skinCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.skin;

  const existing = inflightFetch.get(slug);
  if (existing) return existing;

  const request = fetchWorldSkin(slug, identity)
    .then((skin) => {
      skinCache.set(slug, { skin, expiresAt: Date.now() + CACHE_TTL_MS });
      return skin;
    })
    .finally(() => {
      inflightFetch.delete(slug);
    });
  inflightFetch.set(slug, request);
  return request;
}

/**
 * Preload the two critical textures (panorama wall + floor) before returning
 * ready=true so the SkinLayer can hold off the material swap until decoded.
 */
function preloadSkinTextures(skin: WorldSkin): Promise<void> {
  const urls: string[] = [];
  if (skin.overrides.panoramaWall?.storageKey) {
    urls.push(skin.overrides.panoramaWall.storageKey);
  }
  if (skin.overrides.floor?.textureStorageKey) {
    urls.push(skin.overrides.floor.textureStorageKey);
  }

  if (urls.length === 0) return Promise.resolve();

  // Hint the browser cache with <link rel="preload"> if in a browser context
  if (typeof document !== "undefined") {
    for (const url of urls) {
      if (!document.querySelector(`link[rel="preload"][href="${CSS.escape(url)}"]`)) {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.href = url;
        document.head.appendChild(link);
      }
    }
  }

  // Decode via Image to warm the browser image cache
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve(); // fail-open; SkinLayer will handle missing textures
          img.src = url;
        })
    )
  ).then(() => undefined);
}

export type ActiveSkin = {
  skin: WorldSkin | null;
  /** true once the minimum-viable textures (panorama + floor) are decoded */
  ready: boolean;
  fadeMs: number;
  error?: string;
};

export function useWorldSkin(input: {
  identity: ApiIdentity;
  skinId: string | null;
  dayNightMode: WorldSkinDayNightMode;
  enabled?: boolean;
}): ActiveSkin {
  const { identity, skinId, enabled = true } = input;
  const [skin, setSkin] = useState<WorldSkin | null>(null);
  const [ready, setReady] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const prevSkinIdRef = useRef<string | null | undefined>(undefined);

  const load = useCallback(
    async (id: string | null) => {
      if (!enabled || id === null) {
        setSkin(null);
        setReady(true);
        setError(undefined);
        return;
      }

      // Avoid redundant fetches for the same slug
      if (id === prevSkinIdRef.current) return;

      setReady(false);
      setError(undefined);
      try {
        const next = await loadSkin(id, identity);
        setSkin(next);
        await preloadSkinTextures(next);
        setSkin(next); // update again post-preload so consumers can re-render
        setReady(true);
      } catch (err) {
        // Fail-open: fall back to default theater on any error
        setSkin(null);
        setReady(true);
        setError(err instanceof Error ? err.message : "Failed to load skin");
      }
    },
    // identity object may change reference; key off userId
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, identity.userId]
  );

  useEffect(() => {
    prevSkinIdRef.current = skinId;
    void load(skinId);
  }, [skinId, load]);

  return {
    skin,
    ready,
    fadeMs: CROSSFADE_MS,
    ...(error !== undefined ? { error } : {})
  };
}
