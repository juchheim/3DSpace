"use client";

import { useCallback, useState } from "react";
import type { ParticipantAudioMode, ParticipantAudioModeMessage } from "@3dspace/contracts";

export type AudioModeEntry = { mode: ParticipantAudioMode; radiusMeters: number };

export function useAudioModes() {
  const [modes, setModes] = useState<Map<string, AudioModeEntry>>(new Map());

  const receive = useCallback((msg: ParticipantAudioModeMessage) => {
    setModes((prev) => new Map(prev).set(msg.participantId, { mode: msg.mode, radiusMeters: msg.radiusMeters }));
  }, []);

  const drop = useCallback((participantId: string) => {
    setModes((prev) => {
      if (!prev.has(participantId)) return prev;
      const next = new Map(prev);
      next.delete(participantId);
      return next;
    });
  }, []);

  const getMode = useCallback((id: string) => modes.get(id), [modes]);

  return { receive, drop, getMode, all: modes };
}
