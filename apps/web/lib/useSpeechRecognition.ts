"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultLike = { transcript: string };
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<{ 0: SpeechRecognitionResultLike; isFinal: boolean }>;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechRecognitionSupported() {
  return getRecognitionCtor() !== null;
}

export function useSpeechRecognition(input: {
  lang?: string | undefined;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: ((code: string) => void) | undefined;
}) {
  const supported = speechRecognitionSupported();
  const [listening, setListening] = useState(false);
  const wantListeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const startRecognitionRef = useRef<() => void>(() => {});
  const onInterimRef = useRef(input.onInterim);
  const onFinalRef = useRef(input.onFinal);
  const onErrorRef = useRef(input.onError);
  onInterimRef.current = input.onInterim;
  onFinalRef.current = input.onFinal;
  onErrorRef.current = input.onError;

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    clearRestartTimer();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    }
    setListening(false);
  }, [clearRestartTimer]);

  const startRecognition = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || !wantListeningRef.current) return;

    clearRestartTimer();
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new Ctor();
    recognition.lang = input.lang ?? "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        if (!result) continue;
        const transcript = result[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        if (result.isFinal) finalText += `${finalText ? " " : ""}${transcript}`;
        else interim += `${interim ? " " : ""}${transcript}`;
      }
      if (interim) onInterimRef.current(interim);
      if (finalText) onFinalRef.current(finalText);
    };

    recognition.onerror = (event) => {
      const code = event.error ?? "unknown";
      if (code === "not-allowed" || code === "service-not-allowed") {
        wantListeningRef.current = false;
        recognitionRef.current = null;
        onErrorRef.current?.(code);
        setListening(false);
        return;
      }
      if (code === "audio-capture") {
        wantListeningRef.current = false;
        recognitionRef.current = null;
        onErrorRef.current?.(code);
        setListening(false);
      }
    };

    recognition.onend = () => {
      if (!wantListeningRef.current) {
        recognitionRef.current = null;
        setListening(false);
        return;
      }
      recognitionRef.current = null;
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        startRecognitionRef.current();
      }, 300);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch (error) {
      wantListeningRef.current = false;
      recognitionRef.current = null;
      setListening(false);
      onErrorRef.current?.(error instanceof DOMException && error.name === "InvalidStateError"
        ? "invalid-state"
        : "start-failed");
    }
  }, [clearRestartTimer, input.lang]);

  startRecognitionRef.current = startRecognition;

  const start = useCallback(() => {
    if (!supported) return false;
    wantListeningRef.current = true;
    startRecognition();
    return true;
  }, [startRecognition, supported]);

  useEffect(() => () => {
    stop();
  }, [stop]);

  return { supported, listening, start, stop };
}
