"use client";

/**
 * Persisted world-asset hook — same interface as the old usePlacedChairs but
 * backed by the API. Assets survive page refresh and are shared across all
 * participants in a room via realtime broadcast.
 *
 * The `chairs` array is typed as `PlacedChair[]` so existing consumers
 * (useSitting, PlacedChairsLayer, AssetPlacementController) don't need changes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlacedChair } from "./usePlacedChairs";
import type { WorldAssetRealtimeMessage } from "@3dspace/contracts";
import { createWorldAsset, deleteWorldAsset, listWorldAssets } from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

const REFRESH_INTERVAL_MS = 30_000;

function toChair(asset: {
  id: string;
  position: { x: number; y: number; z: number };
  yaw: number;
}): PlacedChair {
  return { id: asset.id, position: asset.position, yaw: asset.yaw };
}

export function usePlacedWorldAssets(input: {
  identity: ApiIdentity;
  roomId?: string;
  publish?: (message: RealtimeMessage) => void;
}) {
  const [chairsById, setChairsById] = useState<Record<string, PlacedChair>>({});
  const publishRef = useRef(input.publish);
  publishRef.current = input.publish;

  // ── Load ────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!input.roomId) { setChairsById({}); return; }
    try {
      const assets = await listWorldAssets(input.identity, input.roomId);
      const byId: Record<string, PlacedChair> = {};
      for (const a of assets) byId[a.id] = toChair(a);
      setChairsById(byId);
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

  // ── Place ────────────────────────────────────────────────────────────────
  const placeChair = useCallback(
    async (position: { x: number; y: number; z: number }, yaw: number) => {
      if (!input.roomId) return;
      // Optimistic: assign a temp id
      const tempId = `tmp-${Date.now()}`;
      const optimistic: PlacedChair = { id: tempId, position, yaw };
      setChairsById((prev) => ({ ...prev, [tempId]: optimistic }));
      try {
        const result = await createWorldAsset(input.identity, input.roomId, {
          slug: "folding-chair",
          position,
          yaw
        });
        const chair = toChair(result.asset);
        // Replace temp entry with the real one
        setChairsById((prev) => {
          const next = { ...prev };
          delete next[tempId];
          next[chair.id] = chair;
          return next;
        });
        // Broadcast so other participants see it immediately
        for (const msg of result.realtimeMessages) {
          publishRef.current?.(msg);
        }
      } catch {
        // Rollback
        setChairsById((prev) => {
          const next = { ...prev };
          delete next[tempId];
          return next;
        });
      }
    },
    [input.identity, input.roomId]
  );

  // ── Remove ───────────────────────────────────────────────────────────────
  const removeChair = useCallback(
    async (id: string) => {
      if (!input.roomId) return;
      const previous = chairsById[id];
      setChairsById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        const result = await deleteWorldAsset(input.identity, input.roomId, id);
        for (const msg of result.realtimeMessages) {
          publishRef.current?.(msg);
        }
      } catch {
        if (previous) setChairsById((prev) => ({ ...prev, [id]: previous }));
      }
    },
    [chairsById, input.identity, input.roomId]
  );

  // ── Realtime ─────────────────────────────────────────────────────────────
  const handleRealtimeMessage = useCallback(
    (message: RealtimeMessage): boolean => {
      if (!("type" in message)) return false;
      const msg = message as WorldAssetRealtimeMessage;
      if (msg.type === "room.world-asset.upsert.v1") {
        if (msg.roomId !== input.roomId) return false;
        setChairsById((prev) => ({
          ...prev,
          [msg.asset.id]: toChair(msg.asset)
        }));
        return true;
      }
      if (msg.type === "room.world-asset.remove.v1") {
        if (msg.roomId !== input.roomId) return false;
        setChairsById((prev) => {
          if (!(msg.assetId in prev)) return prev;
          const next = { ...prev };
          delete next[msg.assetId];
          return next;
        });
        return true;
      }
      return false;
    },
    [input.roomId]
  );

  const chairs = Object.values(chairsById).sort((a, b) => a.id.localeCompare(b.id));

  return { chairs, placeChair, removeChair, handleRealtimeMessage };
}
