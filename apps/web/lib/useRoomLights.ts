"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomLight, RoomLightRealtimeMessage } from "@3dspace/contracts";
import { listRoomLights, createRoomLight, updateRoomLight, deleteRoomLight } from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

const REFRESH_INTERVAL_MS = 30_000;

export function useRoomLights(input: {
  identity: ApiIdentity;
  roomId?: string;
  publish?: (message: RealtimeMessage) => void;
}) {
  const [lightsById, setLightsById] = useState<Record<string, RoomLight>>({});
  const publishRef = useRef(input.publish);
  publishRef.current = input.publish;

  const refresh = useCallback(async () => {
    if (!input.roomId) { setLightsById({}); return; }
    try {
      const result = await listRoomLights(input.identity, input.roomId);
      const byId: Record<string, RoomLight> = {};
      for (const l of result) byId[l.id] = l;
      setLightsById(byId);
    } catch {
      // Non-fatal: keep current state
    }
  }, [input.identity, input.roomId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!input.roomId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_INTERVAL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [input.roomId, refresh]);

  const createLight = useCallback(async (body: Parameters<typeof createRoomLight>[2]) => {
    if (!input.roomId) return;
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: RoomLight = {
      id: tempId,
      roomId: input.roomId,
      enabled: true,
      createdByUserId: input.identity.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...body,
      castShadow: body.castShadow ?? false,
    } as unknown as RoomLight;
    setLightsById((prev) => ({ ...prev, [tempId]: optimistic }));
    try {
      const result = await createRoomLight(input.identity, input.roomId, body);
      const light = result.light;
      setLightsById((prev) => {
        const next = { ...prev };
        delete next[tempId];
        next[light.id] = light;
        return next;
      });
      for (const msg of result.realtimeMessages) publishRef.current?.(msg);
      return light;
    } catch {
      setLightsById((prev) => { const next = { ...prev }; delete next[tempId]; return next; });
    }
  }, [input.identity, input.roomId]);

  const updateLight = useCallback(async (
    id: string,
    patch: Parameters<typeof updateRoomLight>[3],
    options?: { commit?: boolean }
  ) => {
    if (!input.roomId) return;
    const existing = lightsById[id];
    if (!existing) return;
    const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() } as RoomLight;
    setLightsById((prev) => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: merged };
    });
    const upsertMsg: RoomLightRealtimeMessage = {
      type: "room.light.upsert.v1",
      roomId: input.roomId,
      light: merged,
      sentAt: Date.now(),
      senderId: input.identity.userId,
    };
    publishRef.current?.(upsertMsg);
    if (options?.commit !== false) {
      try {
        const result = await updateRoomLight(input.identity, input.roomId, id, patch);
        setLightsById((prev) => ({ ...prev, [id]: result.light }));
        for (const msg of result.realtimeMessages) publishRef.current?.(msg);
      } catch {
        // Non-fatal: state stays at optimistic
      }
    }
  }, [input.identity, input.roomId, lightsById]);

  const deleteLight = useCallback(async (id: string) => {
    if (!input.roomId) return;
    const previous = lightsById[id];
    setLightsById((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      const result = await deleteRoomLight(input.identity, input.roomId, id);
      for (const msg of result.realtimeMessages) publishRef.current?.(msg);
    } catch {
      if (previous) setLightsById((prev) => ({ ...prev, [id]: previous }));
    }
  }, [input.identity, input.roomId, lightsById]);

  const handleRealtimeMessage = useCallback((message: RealtimeMessage): boolean => {
    if (!("type" in message)) return false;
    const msg = message as RoomLightRealtimeMessage;
    if (msg.type === "room.light.upsert.v1") {
      if (msg.roomId !== input.roomId) return false;
      if (msg.senderId === input.identity.userId) return true;
      setLightsById((prev) => ({ ...prev, [msg.light.id]: msg.light }));
      return true;
    }
    if (msg.type === "room.light.remove.v1") {
      if (msg.roomId !== input.roomId) return false;
      setLightsById((prev) => {
        if (!(msg.lightId in prev)) return prev;
        const next = { ...prev };
        delete next[msg.lightId];
        return next;
      });
      return true;
    }
    return false;
  }, [input.identity, input.roomId]);

  const lights = Object.values(lightsById).sort((a, b) => a.id.localeCompare(b.id));

  return { lights, lightsById, createLight, updateLight, deleteLight, handleRealtimeMessage, refresh };
}
