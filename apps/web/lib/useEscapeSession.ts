"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuildLogicPiece, EscapeSession, RoomLogicRealtimeMessage, RoomSessionRealtimeMessage } from "@3dspace/contracts";
import { getEscapeSession, resetEscapeSession, startEscapeSession, winEscapeSession } from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

const REFRESH_INTERVAL_MS = 30_000;

type PublishSessionMessage = (message: RealtimeMessage) => void;

function publishMessages(
  publish: PublishSessionMessage | undefined,
  messages: Array<RoomSessionRealtimeMessage | RoomLogicRealtimeMessage>
) {
  for (const message of messages) {
    publish?.(message);
  }
}

export function useEscapeSession(input: {
  identity: ApiIdentity;
  roomId?: string | undefined;
  enabled: boolean;
  publish?: PublishSessionMessage | undefined;
  onReset?: (() => void) | undefined;
  onRealtimeMessages?: ((messages: Array<RoomSessionRealtimeMessage | RoomLogicRealtimeMessage>) => void) | undefined;
}) {
  const [session, setSession] = useState<EscapeSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const applySession = useCallback((next: EscapeSession) => {
    setSession(next);
  }, []);

  const applyRealtimeMessage = useCallback(
    (message: RoomSessionRealtimeMessage) => {
      if (!input.enabled || !input.roomId || message.roomId !== input.roomId) return false;
      setSession((prev) => {
        if (prev && prev.status !== "idle" && message.session.status === "idle") {
          input.onReset?.();
        }
        return message.session;
      });
      return true;
    },
    [input.enabled, input.onReset, input.roomId]
  );

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      if (!input.enabled || !input.roomId) {
        setSession(null);
        setError("");
        setLoading(false);
        return null;
      }
      const showLoading = options?.showLoading ?? true;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const next = await getEscapeSession(input.identity, input.roomId);
        applySession(next);
        return next;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load escape session.");
        return null;
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [applySession, input.enabled, input.identity, input.roomId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!input.enabled || !input.roomId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh({ showLoading: false });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [input.enabled, input.roomId, refresh]);

  const start = useCallback(
    async (durationSec?: number) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      setBusy(true);
      try {
        const result = await startEscapeSession(input.identity, input.roomId, durationSec);
        applySession(result.session);
        input.onRealtimeMessages?.(result.realtimeMessages);
        publishMessages(input.publish, result.realtimeMessages);
        return result.session;
      } finally {
        setBusy(false);
      }
    },
    [applySession, input.identity, input.publish, input.roomId]
  );

  const reset = useCallback(async () => {
    if (!input.roomId) throw new Error("Room is not ready.");
    setBusy(true);
    try {
      const result = await resetEscapeSession(input.identity, input.roomId);
      applySession(result.session);
      input.onRealtimeMessages?.(result.realtimeMessages);
      publishMessages(input.publish, result.realtimeMessages);
      input.onReset?.();
      return result;
    } finally {
      setBusy(false);
    }
  }, [applySession, input.identity, input.onRealtimeMessages, input.onReset, input.publish, input.roomId]);

  const win = useCallback(async () => {
    if (!input.roomId) return null;
    try {
      const result = await winEscapeSession(input.identity, input.roomId);
      applySession(result.session);
      input.onRealtimeMessages?.(result.realtimeMessages);
      publishMessages(input.publish, result.realtimeMessages);
      return result.session;
    } catch {
      return null;
    }
  }, [applySession, input.identity, input.onRealtimeMessages, input.publish, input.roomId]);

  return {
    session,
    loading,
    error,
    busy,
    refresh,
    handleRealtimeMessage: (message: RealtimeMessage) => {
      if (!("type" in message) || message.type !== "room.session.v1") return false;
      return applyRealtimeMessage(message as RoomSessionRealtimeMessage);
    },
    actions: { start, reset, win }
  };
}

export function escapeSessionRemainingSec(session: EscapeSession | null, nowMs = Date.now()) {
  if (!session || session.status !== "running" || !session.startedAt) return null;
  const endMs = new Date(session.startedAt).getTime() + session.durationSec * 1000;
  return Math.max(0, Math.ceil((endMs - nowMs) / 1000));
}

export function formatEscapeCountdown(totalSec: number) {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
