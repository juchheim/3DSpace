"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorldSkin } from "@3dspace/contracts";
import { listWorldSkins } from "./api";
import type { ApiIdentity } from "./identity";

const skinCatalogCache = new Map<string, WorldSkin[]>();
const inflightCache = new Map<string, Promise<WorldSkin[]>>();
const SOFT_REFRESH_MS = 30_000;

async function loadCatalog(cacheKey: string, identity: ApiIdentity) {
  const existing = inflightCache.get(cacheKey);
  if (existing) return existing;
  const request = listWorldSkins(identity)
    .then((skins) => {
      skinCatalogCache.set(cacheKey, skins);
      return skins;
    })
    .finally(() => {
      inflightCache.delete(cacheKey);
    });
  inflightCache.set(cacheKey, request);
  return request;
}

export function useWorldSkinCatalog(identity: ApiIdentity) {
  const cacheKey = identity.userId;
  const [skins, setSkins] = useState<WorldSkin[]>(() => skinCatalogCache.get(cacheKey) ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const softTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!opts?.force) {
        const cached = skinCatalogCache.get(cacheKey);
        if (cached) {
          setSkins(cached);
          return cached;
        }
      } else {
        skinCatalogCache.delete(cacheKey);
      }

      setLoading(true);
      setError(undefined);
      try {
        const next = await loadCatalog(cacheKey, identity);
        setSkins(next);
        return next;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load skin catalog");
        return [];
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheKey]
  );

  useEffect(() => {
    // Abort previous soft-refresh timer when identity changes
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    if (softTimerRef.current) clearTimeout(softTimerRef.current);

    void refresh();

    // Soft-refresh every 30 s so catalog stays current in long sessions
    const schedule = () => {
      softTimerRef.current = setTimeout(() => {
        void refresh({ force: true });
        schedule();
      }, SOFT_REFRESH_MS);
    };
    schedule();

    return () => {
      if (softTimerRef.current) clearTimeout(softTimerRef.current);
    };
  }, [refresh]);

  return { skins, loading, error, refresh: () => refresh({ force: true }) };
}
