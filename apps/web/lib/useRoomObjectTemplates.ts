"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoomObjectTemplate } from "@3dspace/contracts";
import { listRoomObjectTemplates } from "./api";
import type { ApiIdentity } from "./identity";

const templateCache = new Map<string, RoomObjectTemplate[]>();
const inflightCache = new Map<string, Promise<RoomObjectTemplate[]>>();

async function loadTemplates(cacheKey: string, identity: ApiIdentity) {
  const existing = inflightCache.get(cacheKey);
  if (existing) return existing;
  const request = listRoomObjectTemplates(identity)
    .then((templates) => {
      templateCache.set(cacheKey, templates);
      return templates;
    })
    .finally(() => {
      inflightCache.delete(cacheKey);
    });
  inflightCache.set(cacheKey, request);
  return request;
}

export function useRoomObjectTemplates(input: {
  identity: ApiIdentity;
  classId?: string | undefined;
  enabled: boolean;
}) {
  const cacheKey = input.classId ? `${input.classId}:${input.identity.userId}` : undefined;
  const [templates, setTemplates] = useState<RoomObjectTemplate[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (options?: { force?: boolean }) => {
      if (!input.enabled || !cacheKey) {
        setTemplates([]);
        setStatus("idle");
        setError("");
        return [];
      }

      if (!options?.force) {
        const cached = templateCache.get(cacheKey);
        if (cached) {
          setTemplates(cached);
          setStatus("ready");
          setError("");
          return cached;
        }
      } else {
        templateCache.delete(cacheKey);
      }

      setStatus("loading");
      setError("");
      try {
        const next = await loadTemplates(cacheKey, input.identity);
        setTemplates(next);
        setStatus("ready");
        return next;
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unable to load room object templates.");
        return [];
      }
    },
    [cacheKey, input.enabled, input.identity]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    templates,
    status,
    error,
    refetch: () => refresh({ force: true })
  };
}
