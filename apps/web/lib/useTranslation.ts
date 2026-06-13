"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TranslationUtteranceMessageV1 } from "@3dspace/contracts";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";
import { speechRecognitionSupported, useSpeechRecognition } from "./useSpeechRecognition";
import { translateText as apiTranslateText } from "./api";

const MAX_LINES = 100;

export type TranslationLine = {
  id: string;
  participantId: string;
  utteranceId: string;
  sourceText: string;
  displayText: string;
  sourceLang: string;
  translatedFrom: string | null;
  startMs: number;
  sentAt: number;
  pending: boolean;
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeLang(code: string): string {
  return code.split("-")[0]?.toLowerCase() ?? code.toLowerCase();
}

function speechErrorMessage(code: string) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Speech recognition permission denied. Allow microphone access for this site.";
    case "audio-capture":
      return "Could not capture audio. Turn on your mic first.";
    case "invalid-state":
    case "start-failed":
      return "Could not start speech recognition. Try toggling off and on.";
    default:
      return "Speech recognition error.";
  }
}

function trimLines(lines: TranslationLine[]) {
  return lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines;
}

// Simple client-side translate cache: hash → translated text
const clientCache = new Map<string, string>();

function cacheKey(sourceLang: string, targetLang: string, text: string) {
  return `${sourceLang}|${targetLang}|${text}`;
}

// In-flight de-dupe: hash → promise
const inFlight = new Map<string, Promise<string>>();

async function cachedTranslate(
  identity: ApiIdentity,
  roomId: string,
  sourceLang: string,
  targetLang: string,
  text: string,
  context: string[]
): Promise<string> {
  const key = cacheKey(sourceLang, targetLang, text);
  const cached = clientCache.get(key);
  if (cached !== undefined) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = apiTranslateText(identity, roomId, { text, sourceLang, targetLang, context })
    .then((res) => {
      clientCache.set(key, res.translatedText);
      inFlight.delete(key);
      return res.translatedText;
    })
    .catch(() => {
      inFlight.delete(key);
      return text; // fallback: show original
    });

  inFlight.set(key, promise);
  return promise;
}

export type TranslationResolvedItem = {
  participantId: string;
  utteranceId: string;
  sourceLang: string;
  targetLang: string;
  text: string;
  startMs: number;
};

export function useTranslation(input: {
  identity: ApiIdentity;
  roomId?: string | undefined;
  participantId: string;
  enabled: boolean;
  micEnabled: boolean;
  readLang: string;
  speakLang: string;
  publish?: ((message: RealtimeMessage) => void) | undefined;
  onTranslationResolved?: ((item: TranslationResolvedItem) => void) | undefined;
}) {
  const [lines, setLines] = useState<TranslationLine[]>([]);
  const [sharing, setSharing] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [dockOpen, setDockOpen] = useState(false);

  const sharingRef = useRef(false);
  const dockDismissedRef = useRef(false);
  const sharingStartedAtRef = useRef(0);
  const stopRecognitionRef = useRef<() => void>(() => {});
  const readLangRef = useRef(input.readLang);
  const recentFinalTextsRef = useRef<string[]>([]);
  const onTranslationResolvedRef = useRef(input.onTranslationResolved);

  readLangRef.current = input.readLang;
  onTranslationResolvedRef.current = input.onTranslationResolved;

  const supported = speechRecognitionSupported();

  const openDock = useCallback(() => {
    dockDismissedRef.current = false;
    setDockOpen(true);
  }, []);

  const publishUtterance = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !input.roomId || !input.publish) return;
    const utteranceId = newId();
    const now = Date.now();
    const startMs = Math.max(0, now - sharingStartedAtRef.current);
    const message: TranslationUtteranceMessageV1 = {
      type: "room.translation.utterance.v1",
      roomId: input.roomId,
      participantId: input.participantId,
      utteranceId,
      sourceLang: input.speakLang,
      text: trimmed,
      isFinal: true,
      startMs,
      sentAt: now
    };
    input.publish(message);
    // Add local line (own speech in source)
    const line: TranslationLine = {
      id: `${input.participantId}:${utteranceId}`,
      participantId: input.participantId,
      utteranceId,
      sourceText: trimmed,
      displayText: trimmed,
      sourceLang: input.speakLang,
      translatedFrom: null,
      startMs,
      sentAt: now,
      pending: false
    };
    setLines((current) => trimLines([...current, line]));
    // Track recent context lines (last 3)
    recentFinalTextsRef.current = [...recentFinalTextsRef.current, trimmed].slice(-3);
    if (!dockDismissedRef.current) openDock();
  }, [input.participantId, input.publish, input.roomId, input.speakLang, openDock]);

  const disableSharing = useCallback(() => {
    sharingRef.current = false;
    setSharing(false);
    setListening(false);
    stopRecognitionRef.current();
  }, []);

  const { start: startRecognition, stop: stopRecognition, listening: recognitionListening } = useSpeechRecognition({
    lang: input.speakLang,
    onInterim: () => { /* v1: local only, not published */ },
    onFinal: publishUtterance,
    onError: (code) => {
      setError(speechErrorMessage(code));
      disableSharing();
    }
  });

  stopRecognitionRef.current = stopRecognition;

  const enableSharing = useCallback(() => {
    if (!input.enabled) return;
    if (!supported) {
      setError("Chrome or Edge required to share speech for translation.");
      return;
    }
    if (!input.micEnabled) {
      setError("Turn on your mic before sharing speech.");
      return;
    }
    setError("");
    sharingRef.current = true;
    sharingStartedAtRef.current = Date.now();
    setSharing(true);
    openDock();
    startRecognition();
  }, [input.enabled, input.micEnabled, openDock, startRecognition, supported]);

  const toggleSharing = useCallback(() => {
    if (sharingRef.current) disableSharing();
    else enableSharing();
  }, [disableSharing, enableSharing]);

  useEffect(() => {
    setListening(sharing && recognitionListening);
  }, [recognitionListening, sharing]);

  const handleRealtimeMessage = useCallback((message: RealtimeMessage): boolean => {
    if (!input.roomId || !("roomId" in message) || message.roomId !== input.roomId) return false;

    if (message.type === "room.translation.utterance.v1") {
      const utterance = message as TranslationUtteranceMessageV1;
      if (!utterance.isFinal) return true; // ignore interims
      if (utterance.participantId === input.participantId) return true; // own speech already added

      const lineId = `${utterance.participantId}:${utterance.utteranceId}`;
      const srcNorm = normalizeLang(utterance.sourceLang);
      const tgtNorm = normalizeLang(readLangRef.current);
      const sameLanguage = srcNorm === tgtNorm;

      if (sameLanguage) {
        const line: TranslationLine = {
          id: lineId,
          participantId: utterance.participantId,
          utteranceId: utterance.utteranceId,
          sourceText: utterance.text,
          displayText: utterance.text,
          sourceLang: utterance.sourceLang,
          translatedFrom: null,
          startMs: utterance.startMs,
          sentAt: utterance.sentAt,
          pending: false
        };
        setLines((current) => {
          if (current.some((l) => l.id === lineId)) return current;
          return trimLines([...current, line]);
        });
        if (!dockDismissedRef.current) openDock();
        return true;
      }

      // Insert placeholder
      const placeholder: TranslationLine = {
        id: lineId,
        participantId: utterance.participantId,
        utteranceId: utterance.utteranceId,
        sourceText: utterance.text,
        displayText: utterance.text,
        sourceLang: utterance.sourceLang,
        translatedFrom: utterance.sourceLang,
        startMs: utterance.startMs,
        sentAt: utterance.sentAt,
        pending: true
      };
      setLines((current) => {
        if (current.some((l) => l.id === lineId)) return current;
        return trimLines([...current, placeholder]);
      });
      if (!dockDismissedRef.current) openDock();

      // Translate async — capture the current readLang at this moment
      const targetLang = readLangRef.current;
      const identity = input.identity;
      const roomId = input.roomId!;
      const context = recentFinalTextsRef.current.slice(-3);

      const capturedUtterance = utterance;
      cachedTranslate(identity, roomId, utterance.sourceLang, targetLang, utterance.text, context)
        .then((translatedText) => {
          setLines((current) =>
            current.map((l) =>
              l.id === lineId
                ? { ...l, displayText: translatedText, pending: false }
                : l
            )
          );
          onTranslationResolvedRef.current?.({
            participantId: capturedUtterance.participantId,
            utteranceId: capturedUtterance.utteranceId,
            sourceLang: capturedUtterance.sourceLang,
            targetLang,
            text: translatedText,
            startMs: capturedUtterance.startMs
          });
        })
        .catch(() => {
          setLines((current) =>
            current.map((l) =>
              l.id === lineId ? { ...l, pending: false } : l
            )
          );
        });

      return true;
    }

    if (message.type === "room.translation.lang.v1") {
      return true; // consumed but no UI action needed in v1
    }

    return false;
  }, [input.participantId, input.roomId, input.identity, openDock]);

  useEffect(() => {
    if (sharingRef.current && !input.micEnabled) {
      setError("Mic off — translation paused.");
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

  // E2E test hook: allows injecting fake utterances without real LiveKit transport
  const handleRealtimeMessageRef = useRef(handleRealtimeMessage);
  handleRealtimeMessageRef.current = handleRealtimeMessage;
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_DEV_AUTH !== "true") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)["__translationHandleMessage"] = (msg: RealtimeMessage) =>
      handleRealtimeMessageRef.current(msg);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any)["__translationHandleMessage"];
    };
  }, []);

  const clearLines = useCallback(() => {
    setLines([]);
  }, []);

  const resetDock = useCallback(() => {
    clearLines();
    setError("");
    dockDismissedRef.current = true;
    setDockOpen(false);
  }, [clearLines]);

  const setDockOpenStable = useCallback((open: boolean) => {
    if (open) dockDismissedRef.current = false;
    else dockDismissedRef.current = true;
    setDockOpen(open);
  }, []);

  const copyVisible = useCallback(async () => {
    const text = lines.map((l) => l.displayText).filter(Boolean).join("\n");
    if (!text) return;
    await navigator.clipboard.writeText(text);
  }, [lines]);

  return {
    lines,
    sharing,
    listening,
    supported,
    error,
    dockOpen,
    setDockOpen: setDockOpenStable,
    clearLines,
    resetDock,
    enableSharing,
    disableSharing,
    toggleSharing,
    handleRealtimeMessage,
    copyVisible
  };
}
