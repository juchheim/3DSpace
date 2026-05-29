"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { HyperbeamEmbed } from "@hyperbeam/web";
import { drawHyperbeamFrame, DEFAULT_SHARED_BROWSER_FRAME_SIZE } from "./hyperbeamFrameCanvas";

export type HyperbeamEmbedStatus = "idle" | "loading" | "connected" | "error";

/** `dom` = iframe/video in the viewport (2D). `frame` = canvas blit via frameCb (3D wall boards). */
export type HyperbeamVideoMode = "dom" | "frame";

export type UseHyperbeamEmbedOptions = {
  embedUrl: string | null;
  /** When false, tears down any live embed (e.g. paused or off-screen). */
  enabled: boolean;
  /** Local user may send pointer/keyboard into the Hyperbeam session. */
  hasControl: boolean;
  videoMode?: HyperbeamVideoMode;
  /** Native Hyperbeam session resolution; used for frame-mode canvas backing store. */
  frameSize?: { width: number; height: number };
  /** Trades latency for smoother motion when true (Hyperbeam playoutDelay). */
  playoutDelay?: boolean;
  volume?: number;
  onDisconnect?: (reason: string) => void;
  onCloseWarning?: (secondsUntilClose: number | undefined) => void;
};

export type UseHyperbeamEmbedResult = {
  containerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  status: HyperbeamEmbedStatus;
  error: string | null;
  instance: HyperbeamEmbed | null;
  videoMode: HyperbeamVideoMode;
};

export function useHyperbeamEmbed(options: UseHyperbeamEmbedOptions): UseHyperbeamEmbedResult {
  const {
    embedUrl,
    enabled,
    hasControl,
    videoMode = "dom",
    frameSize = DEFAULT_SHARED_BROWSER_FRAME_SIZE,
    playoutDelay = false,
    volume = 1,
    onDisconnect,
    onCloseWarning
  } = options;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const instanceRef = useRef<HyperbeamEmbed | null>(null);
  const frameSizeRef = useRef(frameSize);
  frameSizeRef.current = frameSize;
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;
  const onCloseWarningRef = useRef(onCloseWarning);
  onCloseWarningRef.current = onCloseWarning;
  const hasControlRef = useRef(hasControl);
  hasControlRef.current = hasControl;
  const [status, setStatus] = useState<HyperbeamEmbedStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<HyperbeamEmbed | null>(null);

  const attachAudio = useCallback((track: MediaStreamTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    const stream = new MediaStream([track]);
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
  }, []);

  const onFrame = useCallback(
    (frame: ImageBitmap | HTMLVideoElement) => {
      if (videoMode !== "frame") return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { width, height } = frameSizeRef.current;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawHyperbeamFrame(ctx, frame, width, height);
    },
    [videoMode]
  );

  useEffect(() => {
    if (videoMode !== "frame") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = frameSize.width;
    canvas.height = frameSize.height;
  }, [frameSize.height, frameSize.width, videoMode]);

  useEffect(() => {
    if (!enabled || !embedUrl) {
      instanceRef.current?.destroy();
      instanceRef.current = null;
      setInstance(null);
      setStatus("idle");
      setError(null);
      const audio = audioRef.current;
      if (audio?.srcObject) audio.srcObject = null;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setStatus("loading");
    setError(null);

    void (async () => {
      try {
        const Hyperbeam =
          process.env.NEXT_PUBLIC_E2E_MOCK_HYPERBEAM_EMBED === "true"
            ? (await import("./mockHyperbeamEmbed")).default
            : (await import("@hyperbeam/web")).default;
        if (cancelled) return;

        instanceRef.current?.destroy();
        container.replaceChildren();

        const hb = await Hyperbeam(container, embedUrl, {
          delegateKeyboard: hasControlRef.current,
          disableInput: !hasControlRef.current,
          playoutDelay,
          volume,
          audioTrackCb: attachAudio,
          ...(videoMode === "frame" ? { frameCb: onFrame } : {}),
          onConnectionStateChange: (event) => {
            if (event.state === "playing") {
              setStatus("connected");
              setError(null);
            } else if (event.state === "failed") {
              setStatus("error");
              setError("Hyperbeam connection failed");
            }
          },
          onDisconnect: (event) => {
            setStatus("error");
            setError(`Disconnected (${event.type})`);
            onDisconnectRef.current?.(event.type);
          },
          onCloseWarning: (event) => {
            onCloseWarningRef.current?.(event.deadline?.delay);
          }
        });

        if (cancelled) {
          hb.destroy();
          return;
        }

        instanceRef.current = hb;
        setInstance(hb);
        setStatus("connected");
      } catch (cause) {
        if (cancelled) return;
        instanceRef.current = null;
        setInstance(null);
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "Failed to load Hyperbeam embed");
      }
    })();

    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
      setInstance(null);
      const audio = audioRef.current;
      if (audio?.srcObject) audio.srcObject = null;
    };
  }, [attachAudio, embedUrl, enabled, onFrame, playoutDelay, videoMode, volume]);

  useEffect(() => {
    const hb = instanceRef.current;
    if (!hb) return;
    hb.delegateKeyboard = hasControl;
    hb.disableInput = !hasControl;
  }, [hasControl, instance]);

  return {
    containerRef,
    canvasRef,
    audioRef,
    status,
    error,
    instance,
    videoMode
  };
}
