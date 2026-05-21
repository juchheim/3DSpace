"use client";

import { useCallback, useState } from "react";
import type { AvatarReactionMessage } from "@3dspace/contracts";

export function useAvatarReactions() {
  const [reactions, setReactions] = useState<Map<string, AvatarReactionMessage>>(new Map());

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

  return { receive, drop, getReaction, all: reactions };
}
