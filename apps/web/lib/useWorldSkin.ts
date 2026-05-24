"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WORLD_SKIN_DEFAULT_THEATER_SLUG,
  type WorldSkin,
  type WorldSkinDayNightMode
} from "@3dspace/contracts";
import { fetchWorldSkin } from "./api";
import type { ApiIdentity } from "./identity";

// LRU-style per-slug cache with 1-hour TTL
const skinCache = new Map<string, { skin: WorldSkin; expiresAt: number }>();
const inflightFetch = new Map<string, Promise<WorldSkin>>();
const CACHE_TTL_MS = 60 * 60 * 1000;
export const CROSSFADE_MS = 1000;

function cachedSkin(slug: string): WorldSkin | null {
  const cached = skinCache.get(slug);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.skin;
}

async function loadSkin(slug: string, identity: ApiIdentity): Promise<WorldSkin> {
  const cached = cachedSkin(slug);
  if (cached) return cached;

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

function skinLoadKey(resolvedId: string, identity: ApiIdentity) {
  return `${resolvedId}:${identity.userId}`;
}

export function useWorldSkin(input: {
  identity: ApiIdentity;
  skinId: string | null;
  dayNightMode: WorldSkinDayNightMode;
  enabled?: boolean;
  /** Wait until auth/local identity is settled before fetching (avoids 401 + skipped retry). */
  identityReady?: boolean;
}): ActiveSkin {
  const { identity, skinId, enabled = true, identityReady = true } = input;
  const [skin, setSkin] = useState<WorldSkin | null>(() =>
    enabled && identityReady ? cachedSkin(skinId ?? WORLD_SKIN_DEFAULT_THEATER_SLUG) : null
  );
  const [ready, setReady] = useState(() => Boolean(skin));
  const [error, setError] = useState<string | undefined>(undefined);
  const loadGenerationRef = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);
  const inflightKeyRef = useRef<string | null>(null);

  const load = useCallback(
    async (id: string | null) => {
      if (!enabled || !identityReady) {
        loadGenerationRef.current += 1;
        loadedKeyRef.current = null;
        inflightKeyRef.current = null;
        setSkin(null);
        setReady(true);
        setError(undefined);
        return;
      }

      const resolvedId = id === null ? WORLD_SKIN_DEFAULT_THEATER_SLUG : id;
      const loadKey = skinLoadKey(resolvedId, identity);

      if (loadKey === loadedKeyRef.current || loadKey === inflightKeyRef.current) {
        return;
      }

      const generation = ++loadGenerationRef.current;
      inflightKeyRef.current = loadKey;
      setReady(false);
      setError(undefined);

      try {
        const next = await loadSkin(resolvedId, identity);
        if (generation !== loadGenerationRef.current) return;

        setSkin(next);
        await preloadSkinTextures(next);
        if (generation !== loadGenerationRef.current) return;

        loadedKeyRef.current = loadKey;
        setSkin(next);
        setReady(true);
      } catch (err) {
        if (generation !== loadGenerationRef.current) return;

        const fallback = cachedSkin(resolvedId);
        if (fallback) {
          loadedKeyRef.current = loadKey;
          setSkin(fallback);
          setReady(true);
          setError(undefined);
          return;
        }

        loadedKeyRef.current = null;
        setSkin(null);
        setReady(true);
        setError(err instanceof Error ? err.message : "Failed to load skin");
      } finally {
        if (inflightKeyRef.current === loadKey) {
          inflightKeyRef.current = null;
        }
      }
    },
    [enabled, identity, identityReady]
  );

  useEffect(() => {
    void load(skinId);
  }, [skinId, load]);

  return {
    skin,
    ready,
    fadeMs: CROSSFADE_MS,
    ...(error !== undefined ? { error } : {})
  };
}
