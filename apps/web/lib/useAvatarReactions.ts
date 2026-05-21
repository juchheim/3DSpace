"use client";

import { useCallback, useEffect, useState } from "react";
import type { AvatarReactionMessage, AvatarReactionSlug } from "@3dspace/contracts";

const WINDOW_MS = 60_000;

export type ReactionLogEntry = { reaction: AvatarReactionSlug; receivedAt: number };

export function useAvatarReactions() {
  const [reactions, setReactions] = useState<Map<string, AvatarReactionMessage>>(new Map());
  const [log, setLog] = useState<ReactionLogEntry[]>([]);

  const receive = useCallback((msg: AvatarReactionMessage) => {
    setReactions((prev) => new Map(prev).set(msg.participantId, msg));
    const ms = Math.max(0, Date.parse(msg.expiresAt) - Date.now());
    setTimeout(() => {
      setReactions((prev) => {
        const next = new Map(prev);
        if (next.get(msg.participantId) === msg) next.delete(msg.participantId);
        return next;
      });
    }, ms);
    setLog((prev) => [
      ...prev.filter((e) => Date.now() - e.receivedAt < WINDOW_MS),
      { reaction: msg.reaction, receivedAt: Date.now() }
    ]);
  }, []);

  // Prune stale log entries so counts stay accurate when reactions stop arriving.
  useEffect(() => {
    const id = window.setInterval(() => {
      setLog((prev) => {
        const cutoff = Date.now() - WINDOW_MS;
        const next = prev.filter((e) => e.receivedAt >= cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 5_000);
    return () => window.clearInterval(id);
  }, []);

  const drop = useCallback((participantId: string) => {
    setReactions((prev) => {
      if (!prev.has(participantId)) return prev;
      const next = new Map(prev);
      next.delete(participantId);
      return next;
    });
  }, []);

  const getReaction = useCallback((id: string) => reactions.get(id), [reactions]);

  return { receive, drop, getReaction, all: reactions, log };
}
