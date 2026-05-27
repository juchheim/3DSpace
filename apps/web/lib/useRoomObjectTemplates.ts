"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RoomObjectTemplate } from "@3dspace/contracts";
import { fetchRoomObjectTemplate, listRoomObjectTemplates } from "./api";
import type { ApiIdentity } from "./identity";

const templateCache = new Map<string, RoomObjectTemplate[]>();
const inflightCache = new Map<string, Promise<RoomObjectTemplate[]>>();

async function loadTemplates(cacheKey: string, roomId: string, identity: ApiIdentity) {
  const existing = inflightCache.get(cacheKey);
  if (existing) return existing;
  const request = listRoomObjectTemplates(identity, roomId)
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
  roomId?: string | undefined;
  classId?: string | undefined;
  enabled: boolean;
}) {
  const cacheKey = input.roomId && input.classId ? `${input.roomId}:${input.classId}:${input.identity.userId}` : undefined;
  const [catalogTemplates, setCatalogTemplates] = useState<RoomObjectTemplate[]>([]);
  const [supplementalById, setSupplementalById] = useState<Record<string, RoomObjectTemplate>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  const registerTemplate = useCallback((template: RoomObjectTemplate) => {
    setSupplementalById((current) => {
      if (current[template.id] === template) return current;
      return { ...current, [template.id]: template };
    });
  }, []);

  const templates = useMemo(() => {
    const byId = new Map<string, RoomObjectTemplate>();
    for (const template of catalogTemplates) {
      byId.set(template.id, template);
    }
    for (const template of Object.values(supplementalById)) {
      byId.set(template.id, template);
    }
    return Array.from(byId.values());
  }, [catalogTemplates, supplementalById]);

  const refresh = useCallback(
    async (options?: { force?: boolean }) => {
      if (!input.enabled || !cacheKey) {
        setCatalogTemplates([]);
        setStatus("idle");
        setError("");
        return [];
      }

      if (!options?.force) {
        const cached = templateCache.get(cacheKey);
        if (cached) {
          setCatalogTemplates(cached);
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
        const next = await loadTemplates(cacheKey, input.roomId!, input.identity);
        setCatalogTemplates(next);
        setStatus("ready");
        return next;
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unable to load room object templates.");
        return [];
      }
    },
    [cacheKey, input.enabled, input.identity, input.roomId]
  );

  const resolveTemplate = useCallback(
    async (templateId: string) => {
      if (!input.enabled || !input.roomId) return undefined;
      if (supplementalById[templateId]) return supplementalById[templateId];
      if (catalogTemplates.some((template) => template.id === templateId)) {
        return catalogTemplates.find((template) => template.id === templateId);
      }
      try {
        const template = await fetchRoomObjectTemplate(input.identity, templateId, input.roomId);
        registerTemplate(template);
        return template;
      } catch {
        return undefined;
      }
    },
    [catalogTemplates, input.enabled, input.identity, input.roomId, registerTemplate, supplementalById]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    templates,
    status,
    error,
    refetch: () => refresh({ force: true }),
    registerTemplate,
    resolveTemplate
  };
}
