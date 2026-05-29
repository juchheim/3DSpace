"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { HyperbeamEmbed } from "@hyperbeam/web";
import { drawHyperbeamFrame, DEFAULT_SHARED_BROWSER_FRAME_SIZE } from "./hyperbeamFrameCanvas";
import { HYPERBEAM_MAX_VIEWPORT_AREA, optimalHyperbeamViewportForAspect } from "../../lib/hyperbeamViewport";

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
  /** When set, resizes the Hyperbeam VM to the best resolution for this aspect ratio within maxArea. */
  displayAspectRatio?: number;
  /** Trades latency for smoother motion when true (Hyperbeam playoutDelay). */
  playoutDelay?: boolean;
  volume?: number;
  onDisconnect?: (reason: string) => void;
  onCloseWarning?: (secondsUntilClose: number | undefined) => void;
  /** Fired after each frame-mode canvas blit (3D wall mesh textures). */
  onFrameDrawn?: () => void;
  /** Expose the raw video MediaStreamTrack (for VideoTexture on 3D wall meshes) instead of using frameCb. */
  captureVideoTrack?: boolean;
};

export type UseHyperbeamEmbedResult = {
  containerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  status: HyperbeamEmbedStatus;
  error: string | null;
  instance: HyperbeamEmbed | null;
  videoMode: HyperbeamVideoMode;
  /** Live video track when `captureVideoTrack` is set; drives `THREE.VideoTexture` on wall meshes. */
  videoTrack: MediaStreamTrack | null;
};

export function useHyperbeamEmbed(options: UseHyperbeamEmbedOptions): UseHyperbeamEmbedResult {
  const {
    embedUrl,
    enabled,
    hasControl,
    videoMode = "dom",
    frameSize = DEFAULT_SHARED_BROWSER_FRAME_SIZE,
    displayAspectRatio,
    playoutDelay = false,
    volume = 1,
    onDisconnect,
    onCloseWarning,
    onFrameDrawn,
    captureVideoTrack = false
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
  const onFrameDrawnRef = useRef(onFrameDrawn);
  onFrameDrawnRef.current = onFrameDrawn;
  const hasControlRef = useRef(hasControl);
  hasControlRef.current = hasControl;
  const displayAspectRatioRef = useRef(displayAspectRatio);
  displayAspectRatioRef.current = displayAspectRatio;
  const [status, setStatus] = useState<HyperbeamEmbedStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<HyperbeamEmbed | null>(null);
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack | null>(null);

  const attachAudio = useCallback((track: MediaStreamTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    const stream = new MediaStream([track]);
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
  }, []);

  const resizeForDisplayAspect = useCallback(async (hb: HyperbeamEmbed) => {
    const aspect = displayAspectRatioRef.current;
    if (!aspect || aspect <= 0) return;
    const maxArea = hb.maxArea ?? HYPERBEAM_MAX_VIEWPORT_AREA;
    const { width, height } = optimalHyperbeamViewportForAspect(aspect, maxArea);
    await hb.resize(width, height);
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
      onFrameDrawnRef.current?.();
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
      setVideoTrack(null);
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
          ...(videoMode === "frame"
            ? captureVideoTrack
              ? { videoTrackCb: (track: MediaStreamTrack) => setVideoTrack(track) }
              : { frameCb: onFrame }
            : {}),
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

        try {
          await resizeForDisplayAspect(hb);
        } catch {
          // Keep the default session size if resize is rejected.
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
      setVideoTrack(null);
      const audio = audioRef.current;
      if (audio?.srcObject) audio.srcObject = null;
    };
  }, [attachAudio, captureVideoTrack, embedUrl, enabled, onFrame, playoutDelay, resizeForDisplayAspect, videoMode, volume]);

  useEffect(() => {
    const hb = instanceRef.current;
    if (!hb) return;
    void resizeForDisplayAspect(hb).catch(() => undefined);
  }, [displayAspectRatio, instance, resizeForDisplayAspect]);

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
    videoMode,
    videoTrack
  };
}
