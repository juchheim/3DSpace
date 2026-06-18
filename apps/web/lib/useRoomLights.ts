"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomLight, RoomLightRealtimeMessage } from "@3dspace/contracts";
import { listRoomLights, createRoomLight, updateRoomLight, deleteRoomLight } from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";
import { createIdThrottle, type IdThrottle } from "./idThrottle";

const REFRESH_INTERVAL_MS = 30_000;
/** Trailing-throttle interval for `commit:false` upsert broadcasts during a drag. */
const LIGHT_BROADCAST_THROTTLE_MS = 70;

export function useRoomLights(input: {
  identity: ApiIdentity;
  roomId?: string;
  publish?: (message: RealtimeMessage) => void;
}) {
  const [lightsById, setLightsById] = useState<Record<string, RoomLight>>({});
  const lightsByIdRef = useRef<Record<string, RoomLight>>({});
  const updateSeqRef = useRef<Record<string, number>>({});
  // Transient "edited by" presence keyed by light id, fed by incoming upserts
  // from *other* users (no schema change). Consumers decay it for display.
  const [recentEditors, setRecentEditors] = useState<Record<string, { userId: string; at: number }>>({});
  const publishRef = useRef(input.publish);
  publishRef.current = input.publish;

  // Throttle only the optimistic (`commit:false`) broadcast so a 60 fps gizmo
  // drag doesn't flood the data channel. Local state still updates every call.
  const broadcastThrottleRef = useRef<IdThrottle<RoomLightRealtimeMessage> | null>(null);
  if (!broadcastThrottleRef.current) {
    broadcastThrottleRef.current = createIdThrottle<RoomLightRealtimeMessage>(
      (msg) => publishRef.current?.(msg),
      LIGHT_BROADCAST_THROTTLE_MS
    );
  }
  useEffect(() => () => broadcastThrottleRef.current?.dispose(), []);

  const replaceLightsById = useCallback((next: Record<string, RoomLight>) => {
    lightsByIdRef.current = next;
    setLightsById(next);
  }, []);

  const patchLightsById = useCallback((updater: (prev: Record<string, RoomLight>) => Record<string, RoomLight>) => {
    const next = updater(lightsByIdRef.current);
    lightsByIdRef.current = next;
    setLightsById(next);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    if (!input.roomId) { replaceLightsById({}); return; }
    try {
      const result = await listRoomLights(input.identity, input.roomId);
      const byId: Record<string, RoomLight> = {};
      for (const l of result) byId[l.id] = l;
      replaceLightsById(byId);
    } catch {
      // Non-fatal: keep current state
    }
  }, [input.identity, input.roomId, replaceLightsById]);

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
    patchLightsById((prev) => ({ ...prev, [tempId]: optimistic }));
    try {
      const result = await createRoomLight(input.identity, input.roomId, body);
      const light = result.light;
      patchLightsById((prev) => {
        const next = { ...prev };
        delete next[tempId];
        next[light.id] = light;
        return next;
      });
      for (const msg of result.realtimeMessages) publishRef.current?.(msg);
      return light;
    } catch {
      patchLightsById((prev) => { const next = { ...prev }; delete next[tempId]; return next; });
    }
  }, [input.identity, input.roomId, patchLightsById]);

  const updateLight = useCallback(async (
    id: string,
    patch: Parameters<typeof updateRoomLight>[3],
    options?: { commit?: boolean }
  ) => {
    if (!input.roomId) return;
    const existing = lightsByIdRef.current[id];
    if (!existing) return;
    const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() } as RoomLight;
    patchLightsById((prev) => (prev[id] ? { ...prev, [id]: merged } : prev));
    const upsertMsg: RoomLightRealtimeMessage = {
      type: "room.light.upsert.v1",
      roomId: input.roomId,
      light: merged,
      sentAt: Date.now(),
      senderId: input.identity.userId,
    };
    if (options?.commit !== false) {
      // Commit: cancel any pending throttled broadcast and flush this state now.
      broadcastThrottleRef.current?.flush(id, upsertMsg);
      const seq = (updateSeqRef.current[id] ?? 0) + 1;
      updateSeqRef.current[id] = seq;
      try {
        const result = await updateRoomLight(input.identity, input.roomId, id, patch);
        if (updateSeqRef.current[id] !== seq) return;
        patchLightsById((prev) => ({ ...prev, [id]: result.light }));
        for (const msg of result.realtimeMessages) publishRef.current?.(msg);
      } catch {
        // Non-fatal: state stays at optimistic
      }
    } else {
      // Optimistic drag frame: broadcast is throttled (local state already set).
      broadcastThrottleRef.current?.push(id, upsertMsg);
    }
  }, [input.identity, input.roomId, patchLightsById]);

  const deleteLight = useCallback(async (id: string) => {
    if (!input.roomId) return;
    const previous = lightsByIdRef.current[id];
    patchLightsById((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      const result = await deleteRoomLight(input.identity, input.roomId, id);
      for (const msg of result.realtimeMessages) publishRef.current?.(msg);
    } catch {
      if (previous) patchLightsById((prev) => ({ ...prev, [id]: previous }));
    }
  }, [input.identity, input.roomId, patchLightsById]);

  const handleRealtimeMessage = useCallback((message: RealtimeMessage): boolean => {
    if (!("type" in message)) return false;
    const msg = message as RoomLightRealtimeMessage;
    if (msg.type === "room.light.upsert.v1") {
      if (msg.roomId !== input.roomId) return false;
      if (msg.senderId === input.identity.userId) return true;
      patchLightsById((prev) => ({ ...prev, [msg.light.id]: msg.light }));
      setRecentEditors((prev) => ({ ...prev, [msg.light.id]: { userId: msg.senderId, at: Date.now() } }));
      return true;
    }
    if (msg.type === "room.light.remove.v1") {
      if (msg.roomId !== input.roomId) return false;
      patchLightsById((prev) => {
        if (!(msg.lightId in prev)) return prev;
        const next = { ...prev };
        delete next[msg.lightId];
        return next;
      });
      return true;
    }
    return false;
  }, [input.identity, input.roomId, patchLightsById]);

  const lights = Object.values(lightsById).sort((a, b) => a.id.localeCompare(b.id));

  return { lights, lightsById, recentEditors, createLight, updateLight, deleteLight, handleRealtimeMessage, refresh };
}
