"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { voiceForParticipant } from "@3dspace/contracts";
import type { ApiIdentity } from "./identity";
import { translateSpeech } from "./api";
import type { TranslationResolvedItem } from "./useTranslation";

export type VoiceMode = "off" | "duck" | "replace";

const STALE_MS = 8_000;
const MAX_QUEUE = 4;

type QueueItem = {
  participantId: string;
  utteranceId: string;
  text: string;
  lang: string;
  voice: string;
  enqueuedAt: number;
};

// Module-level AudioBuffer cache keyed by (lang|voice|text)
const audioBufferCache = new Map<string, AudioBuffer>();

export function useTranslationVoice(input: {
  identity: ApiIdentity;
  roomId?: string;
  enabled: boolean;
  mode: VoiceMode;
  voiceChoice: string;
  provider: "openai" | "browser";
}) {
  const queueRef = useRef<QueueItem[]>([]);
  const playingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [duckedParticipantIds, setDuckedParticipantIds] = useState<Set<string>>(new Set());
  const [speaking, setSpeaking] = useState(false);
  const [queueDepth, setQueueDepth] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const duckedRef = useRef<Set<string>>(new Set());
  const inputRef = useRef(input);
  inputRef.current = input;

  function getOrCreateContext(): AudioContext | null {
    if (audioCtxRef.current) return audioCtxRef.current;
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      return ctx;
    } catch {
      return null;
    }
  }

  const clearDuck = useCallback((participantId: string) => {
    duckedRef.current = new Set([...duckedRef.current].filter((id) => id !== participantId));
    setDuckedParticipantIds(new Set(duckedRef.current));
  }, []);

  const addDuck = useCallback((participantId: string) => {
    duckedRef.current = new Set([...duckedRef.current, participantId]);
    setDuckedParticipantIds(new Set(duckedRef.current));
  }, []);

  const playNext = useCallback(async () => {
    if (playingRef.current) return;

    // Drop stale items
    const now = Date.now();
    queueRef.current = queueRef.current.filter((item) => now - item.enqueuedAt < STALE_MS);
    setQueueDepth(queueRef.current.length);

    const item = queueRef.current.shift();
    if (!item) return;
    setQueueDepth(queueRef.current.length);

    playingRef.current = true;
    setSpeaking(true);
    addDuck(item.participantId);

    const { identity, roomId, provider } = inputRef.current;

    if (provider === "browser") {
      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.lang = item.lang;
      utterance.onend = () => {
        clearDuck(item.participantId);
        playingRef.current = false;
        setSpeaking(false);
        void playNext();
      };
      utterance.onerror = () => {
        clearDuck(item.participantId);
        playingRef.current = false;
        setSpeaking(false);
        void playNext();
      };
      speechSynthesis.speak(utterance);
      return;
    }

    const ctx = getOrCreateContext();
    if (!ctx) {
      clearDuck(item.participantId);
      playingRef.current = false;
      setSpeaking(false);
      return;
    }

    if (ctx.state === "suspended") {
      setAudioBlocked(true);
      clearDuck(item.participantId);
      playingRef.current = false;
      setSpeaking(false);
      // Re-enqueue so it can play after resume
      queueRef.current.unshift(item);
      setQueueDepth(queueRef.current.length);
      return;
    }

    setAudioBlocked(false);

    const cacheKey = `${item.lang}|${item.voice}|${item.text}`;
    let audioBuffer = audioBufferCache.get(cacheKey);

    if (!audioBuffer) {
      let arrayBuf: ArrayBuffer | null = null;
      try {
        arrayBuf = roomId ? await translateSpeech(identity, roomId, { text: item.text, lang: item.lang, voice: item.voice }) : null;
      } catch {
        // fall through — null means no audio
      }
      if (!arrayBuf) {
        clearDuck(item.participantId);
        playingRef.current = false;
        setSpeaking(false);
        void playNext();
        return;
      }
      try {
        audioBuffer = await ctx.decodeAudioData(arrayBuf);
        audioBufferCache.set(cacheKey, audioBuffer);
      } catch {
        clearDuck(item.participantId);
        playingRef.current = false;
        setSpeaking(false);
        void playNext();
        return;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    currentSourceRef.current = source;

    const maxDubMs = (audioBuffer.duration + 2) * 1000;
    safetyTimerRef.current = setTimeout(() => {
      clearDuck(item.participantId);
      playingRef.current = false;
      setSpeaking(false);
      void playNext();
    }, maxDubMs);

    source.onended = () => {
      if (safetyTimerRef.current !== null) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      clearDuck(item.participantId);
      playingRef.current = false;
      setSpeaking(false);
      void playNext();
    };

    source.start();
  }, [addDuck, clearDuck]);

  const enqueue = useCallback((item: TranslationResolvedItem) => {
    const { enabled, mode, voiceChoice } = inputRef.current;
    if (!enabled || mode === "off") return;

    // Dedupe by (participantId, utteranceId)
    const alreadyQueued = queueRef.current.some(
      (q) => q.participantId === item.participantId && q.utteranceId === item.utteranceId
    );
    if (alreadyQueued) return;

    // Drop oldest if at cap
    if (queueRef.current.length >= MAX_QUEUE) {
      queueRef.current.shift();
    }

    const voice = voiceChoice === "auto" ? voiceForParticipant(item.participantId) : voiceChoice;
    queueRef.current.push({
      participantId: item.participantId,
      utteranceId: item.utteranceId,
      text: item.text,
      lang: item.targetLang,
      voice,
      enqueuedAt: Date.now()
    });
    setQueueDepth(queueRef.current.length);
    void playNext();
  }, [playNext]);

  const resumeAudio = useCallback(() => {
    const ctx = getOrCreateContext();
    if (!ctx) return;
    void ctx.resume().then(() => {
      setAudioBlocked(false);
      void playNext();
    });
  }, [playNext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      currentSourceRef.current?.stop();
      if (safetyTimerRef.current !== null) clearTimeout(safetyTimerRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return { enqueue, duckedParticipantIds, speaking, queueDepth, audioBlocked, resumeAudio };
}
