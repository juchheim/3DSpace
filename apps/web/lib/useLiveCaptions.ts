"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LiveCaptionsChunkMessageV1,
  LiveCaptionsContributorMessageV1,
  LiveCaptionsInterimMessageV1
} from "@3dspace/contracts";
import type { RealtimeMessage } from "./realtime";
import { speechRecognitionSupported, useSpeechRecognition } from "./useSpeechRecognition";

const MAX_LINES = 100;
const INTERIM_MIN_INTERVAL_MS = 170;

export type CaptionLine = {
  id: string;
  participantId: string;
  chunkId: string;
  text: string;
  startMs: number;
  sentAt: number;
};

type InterimLine = {
  chunkId: string;
  text: string;
  sentAt: number;
};

function newChunkId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function trimLines(lines: CaptionLine[]) {
  return lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines;
}

function speechErrorMessage(code: string) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Speech recognition permission denied. Allow microphone access for this site.";
    case "audio-capture":
      return "Could not capture audio for captions. Turn on your mic first.";
    case "invalid-state":
    case "start-failed":
      return "Could not start speech recognition. Try toggling captions off and on.";
    default:
      return "Speech recognition error.";
  }
}

export function useLiveCaptions(input: {
  roomId?: string | undefined;
  participantId: string;
  enabled: boolean;
  micEnabled: boolean;
  publish?: ((message: RealtimeMessage) => void) | undefined;
}) {
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [interimByParticipant, setInterimByParticipant] = useState<Map<string, InterimLine>>(() => new Map());
  const [contributors, setContributors] = useState<Set<string>>(() => new Set());
  const [sharing, setSharing] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [dockOpen, setDockOpen] = useState(false);

  const sharingRef = useRef(false);
  const chunkIdRef = useRef(newChunkId());
  const lastInterimSentRef = useRef(0);
  const sharingStartedAtRef = useRef(0);
  const stopRecognitionRef = useRef<() => void>(() => {});

  const supported = speechRecognitionSupported();

  const setLocalInterim = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = Date.now();
    const chunkId = chunkIdRef.current;
    setInterimByParticipant((current) => {
      const next = new Map(current);
      next.set(input.participantId, { chunkId, text: trimmed, sentAt: now });
      return next;
    });
    setContributors((current) => new Set(current).add(input.participantId));
  }, [input.participantId]);

  const publishContributor = useCallback((active: boolean) => {
    setContributors((current) => {
      const next = new Set(current);
      if (active) next.add(input.participantId);
      else next.delete(input.participantId);
      return next;
    });
    if (!input.roomId || !input.publish) return;
    const message: LiveCaptionsContributorMessageV1 = {
      type: "room.captions.contributor.v1",
      roomId: input.roomId,
      participantId: input.participantId,
      active,
      sentAt: Date.now()
    };
    input.publish(message);
  }, [input.participantId, input.publish, input.roomId]);

  const publishInterim = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLocalInterim(trimmed);
    if (!input.roomId || !input.publish) return;
    const now = Date.now();
    if (now - lastInterimSentRef.current < INTERIM_MIN_INTERVAL_MS) return;
    lastInterimSentRef.current = now;
    const chunkId = chunkIdRef.current;
    const message: LiveCaptionsInterimMessageV1 = {
      type: "room.captions.interim.v1",
      roomId: input.roomId,
      participantId: input.participantId,
      chunkId,
      text: trimmed,
      sentAt: now
    };
    input.publish(message);
  }, [input.participantId, input.publish, input.roomId, setLocalInterim]);

  const publishFinal = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = Date.now();
    const chunkId = chunkIdRef.current;
    const startMs = Math.max(0, now - sharingStartedAtRef.current);
    if (input.roomId && input.publish) {
      const message: LiveCaptionsChunkMessageV1 = {
        type: "room.captions.chunk.v1",
        roomId: input.roomId,
        participantId: input.participantId,
        chunkId,
        text: trimmed,
        isFinal: true,
        startMs,
        sentAt: now
      };
      input.publish(message);
    }
    chunkIdRef.current = newChunkId();
    lastInterimSentRef.current = 0;
    setInterimByParticipant((current) => {
      if (!current.has(input.participantId)) return current;
      const next = new Map(current);
      next.delete(input.participantId);
      return next;
    });
    setLines((current) => trimLines([
      ...current,
      {
        id: `${input.participantId}:${chunkId}`,
        participantId: input.participantId,
        chunkId,
        text: trimmed,
        startMs,
        sentAt: now
      }
    ]));
    setContributors((current) => new Set(current).add(input.participantId));
    setDockOpen(true);
  }, [input.participantId, input.publish, input.roomId]);

  const disableSharing = useCallback(() => {
    sharingRef.current = false;
    setSharing(false);
    setListening(false);
    stopRecognitionRef.current();
    publishContributor(false);
    setInterimByParticipant((current) => {
      if (!current.has(input.participantId)) return current;
      const next = new Map(current);
      next.delete(input.participantId);
      return next;
    });
  }, [input.participantId, publishContributor]);

  const { start: startRecognition, stop: stopRecognition, listening: recognitionListening } = useSpeechRecognition({
    onInterim: publishInterim,
    onFinal: publishFinal,
    onError: (code) => {
      setError(speechErrorMessage(code));
      disableSharing();
    }
  });

  stopRecognitionRef.current = stopRecognition;

  const enableSharing = useCallback(() => {
    if (!input.enabled) return;
    if (!supported) {
      setError("Chrome or Edge required to share captions.");
      return;
    }
    if (!input.micEnabled) {
      setError("Turn on your mic before sharing captions.");
      return;
    }
    setError("");
    sharingRef.current = true;
    sharingStartedAtRef.current = Date.now();
    chunkIdRef.current = newChunkId();
    lastInterimSentRef.current = 0;
    setSharing(true);
    setDockOpen(true);
    publishContributor(true);
    startRecognition();
  }, [input.enabled, input.micEnabled, publishContributor, startRecognition, supported]);

  const toggleSharing = useCallback(() => {
    if (sharingRef.current) disableSharing();
    else enableSharing();
  }, [disableSharing, enableSharing]);

  useEffect(() => {
    setListening(sharing && recognitionListening);
  }, [recognitionListening, sharing]);

  const handleRealtimeMessage = useCallback((message: RealtimeMessage) => {
    if (!input.roomId || !("roomId" in message) || message.roomId !== input.roomId) return false;

    if (message.type === "room.captions.chunk.v1") {
      const chunk = message as LiveCaptionsChunkMessageV1;
      setInterimByParticipant((current) => {
        const existing = current.get(chunk.participantId);
        if (!existing || existing.chunkId !== chunk.chunkId) return current;
        const next = new Map(current);
        next.delete(chunk.participantId);
        return next;
      });
      setLines((current) => {
        const id = `${chunk.participantId}:${chunk.chunkId}`;
        if (current.some((line) => line.id === id)) return current;
        return trimLines([
          ...current,
          {
            id,
            participantId: chunk.participantId,
            chunkId: chunk.chunkId,
            text: chunk.text,
            startMs: chunk.startMs,
            sentAt: chunk.sentAt
          }
        ]);
      });
      setContributors((current) => new Set(current).add(chunk.participantId));
      setDockOpen(true);
      return true;
    }

    if (message.type === "room.captions.interim.v1") {
      const interim = message as LiveCaptionsInterimMessageV1;
      setInterimByParticipant((current) => {
        const next = new Map(current);
        next.set(interim.participantId, {
          chunkId: interim.chunkId,
          text: interim.text,
          sentAt: interim.sentAt
        });
        return next;
      });
      setContributors((current) => new Set(current).add(interim.participantId));
      setDockOpen(true);
      return true;
    }

    if (message.type === "room.captions.contributor.v1") {
      const contributor = message as LiveCaptionsContributorMessageV1;
      if (contributor.participantId === input.participantId) return true;
      setContributors((current) => {
        const next = new Set(current);
        if (contributor.active) next.add(contributor.participantId);
        else next.delete(contributor.participantId);
        return next;
      });
      if (!contributor.active) {
        setInterimByParticipant((current) => {
          if (!current.has(contributor.participantId)) return current;
          const next = new Map(current);
          next.delete(contributor.participantId);
          return next;
        });
      } else {
        setDockOpen(true);
      }
      return true;
    }

    return false;
  }, [input.participantId, input.roomId]);

  const dropContributor = useCallback((participantId: string) => {
    setContributors((current) => {
      if (!current.has(participantId)) return current;
      const next = new Set(current);
      next.delete(participantId);
      return next;
    });
    setInterimByParticipant((current) => {
      if (!current.has(participantId)) return current;
      const next = new Map(current);
      next.delete(participantId);
      return next;
    });
    if (participantId === input.participantId && sharingRef.current) {
      disableSharing();
    }
  }, [disableSharing, input.participantId]);

  const copyVisible = useCallback(async () => {
    const parts: string[] = [];
    for (const line of lines) {
      parts.push(line.text);
    }
    for (const [participantId, interim] of interimByParticipant.entries()) {
      if (participantId !== input.participantId || !sharingRef.current) {
        parts.push(interim.text);
      }
    }
    const text = parts.filter(Boolean).join("\n");
    if (!text) return;
    await navigator.clipboard.writeText(text);
  }, [input.participantId, interimByParticipant, lines]);

  useEffect(() => {
    if (sharingRef.current && !input.micEnabled) {
      setError("Mic off — captions paused.");
      disableSharing();
    }
  }, [disableSharing, input.micEnabled]);

  useEffect(() => {
    if (!input.enabled && sharingRef.current) disableSharing();
  }, [disableSharing, input.enabled]);

  useEffect(() => () => {
    if (sharingRef.current) {
      sharingRef.current = false;
      stopRecognitionRef.current();
    }
  }, []);

  const live = contributors.size > 0 || sharing;

  const setDockOpenStable = useCallback((open: boolean) => {
    setDockOpen(open);
  }, []);

  return {
    lines,
    interimByParticipant,
    contributors,
    sharing,
    listening,
    supported,
    error,
    dockOpen,
    live,
    setDockOpen: setDockOpenStable,
    enableSharing,
    disableSharing,
    toggleSharing,
    handleRealtimeMessage,
    dropContributor,
    copyVisible
  };
}
