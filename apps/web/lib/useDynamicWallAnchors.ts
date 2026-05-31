"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CreateDynamicWallAnchorRequest, DynamicWallAnchor, UpdateDynamicWallAnchorRequest } from "@3dspace/contracts";
import {
  createDynamicWallAnchor,
  listDynamicWallAnchors,
  removeDynamicWallAnchor,
  updateDynamicWallAnchor
} from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

export function useDynamicWallAnchors(input: {
  identity: ApiIdentity | null;
  roomId: string | null | undefined;
  enabled: boolean;
}) {
  const [anchors, setAnchors] = useState<DynamicWallAnchor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!input.identity || !input.roomId || !input.enabled) return;
    try {
      const result = await listDynamicWallAnchors(input.identity, input.roomId);
      if (mountedRef.current) setAnchors(result);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : "Failed to load boards");
    }
  }, [input.identity, input.roomId, input.enabled]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    if (!input.enabled) return;
    const interval = setInterval(() => { void refresh(); }, 30_000);
    return () => {
      clearInterval(interval);
      mountedRef.current = false;
    };
  }, [refresh, input.enabled]);

  const handleRealtimeMessage = useCallback(
    (message: RealtimeMessage) => {
      if (!input.roomId || !("type" in message)) return false;
      if (message.type === "room.board.created.v1" && message.roomId === input.roomId) {
        setAnchors((prev) => {
          if (prev.some((a) => a.id === message.anchor.id)) return prev;
          return [...prev, message.anchor];
        });
        return true;
      }
      if (message.type === "room.board.updated.v1" && message.roomId === input.roomId) {
        setAnchors((prev) => prev.map((a) => a.id === message.anchor.id ? message.anchor : a));
        return true;
      }
      if (message.type === "room.board.removed.v1" && message.roomId === input.roomId) {
        setAnchors((prev) => prev.filter((a) => a.id !== message.anchorId));
        return true;
      }
      return false;
    },
    [input.roomId]
  );

  const create = useCallback(async (body: CreateDynamicWallAnchorRequest): Promise<DynamicWallAnchor> => {
    if (!input.identity || !input.roomId) throw new Error("Not ready");
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: DynamicWallAnchor = {
      id: optimisticId,
      roomId: input.roomId,
      wallId: body.wallId,
      createdByUserId: input.identity.userId,
      label: body.title,
      position: body.center,
      normal: body.normal,
      width: body.width,
      height: body.height,
      metadata: { accepts: body.accepts, hideSurface: true, hideObjectHeader: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setAnchors((prev) => [...prev, optimistic]);
    try {
      const { anchor } = await createDynamicWallAnchor(input.identity, input.roomId, body);
      setAnchors((prev) => prev.map((a) => a.id === optimisticId ? anchor : a));
      return anchor;
    } catch (err) {
      setAnchors((prev) => prev.filter((a) => a.id !== optimisticId));
      throw err;
    }
  }, [input.identity, input.roomId]);

  const update = useCallback(async (id: string, patch: UpdateDynamicWallAnchorRequest): Promise<DynamicWallAnchor> => {
    if (!input.identity || !input.roomId) throw new Error("Not ready");
    const { anchor } = await updateDynamicWallAnchor(input.identity, input.roomId, id, patch);
    setAnchors((prev) => prev.map((a) => a.id === id ? anchor : a));
    return anchor;
  }, [input.identity, input.roomId]);

  const remove = useCallback(async (id: string): Promise<void> => {
    if (!input.identity || !input.roomId) throw new Error("Not ready");
    await removeDynamicWallAnchor(input.identity, input.roomId, id);
    setAnchors((prev) => prev.filter((a) => a.id !== id));
  }, [input.identity, input.roomId]);

  return { anchors, create, update, remove, refresh, error, handleRealtimeMessage };
}
