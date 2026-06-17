"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomEnvironment, RoomLightingRealtimeMessage } from "@3dspace/contracts";
import { defaultRoomEnvironment } from "@3dspace/contracts";
import { getRoomEnvironment, setRoomEnvironment } from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

export function useRoomEnvironment(input: {
  identity: ApiIdentity;
  roomId?: string;
  publish?: (message: RealtimeMessage) => void;
}) {
  const [environment, setEnvironment] = useState<RoomEnvironment>(defaultRoomEnvironment);
  const publishRef = useRef(input.publish);
  publishRef.current = input.publish;

  useEffect(() => {
    if (!input.roomId) { setEnvironment(defaultRoomEnvironment()); return; }
    getRoomEnvironment(input.identity, input.roomId)
      .then((result) => setEnvironment(result.environment))
      .catch(() => { /* keep default */ });
  }, [input.identity, input.roomId]);

  const updateEnvironment = useCallback(async (
    patch: Partial<RoomEnvironment>,
    options?: { commit?: boolean }
  ) => {
    if (!input.roomId) return;
    setEnvironment((prev) => ({ ...prev, ...patch }));
    if (options?.commit !== false) {
      try {
        const result = await setRoomEnvironment(input.identity, input.roomId, patch);
        setEnvironment(result.environment);
        for (const msg of result.realtimeMessages) publishRef.current?.(msg);
      } catch {
        // keep optimistic
      }
    }
  }, [input.identity, input.roomId]);

  const handleRealtimeMessage = useCallback((message: RealtimeMessage): boolean => {
    if (!("type" in message)) return false;
    const msg = message as RoomLightingRealtimeMessage;
    if (msg.type === "room.lighting.environment.v1") {
      if (msg.roomId !== input.roomId) return false;
      setEnvironment(msg.environment);
      return true;
    }
    return false;
  }, [input.roomId]);

  return { environment, updateEnvironment, handleRealtimeMessage };
}
