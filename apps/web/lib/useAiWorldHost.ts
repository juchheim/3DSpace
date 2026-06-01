"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  AiHostBuildHelpContext,
  BuildPiece,
  RoomAiHost,
  RoomAiHostChatMessage,
  RoomAiHostRealtimeMessage,
  RoomManifest,
  Vector3
} from "@3dspace/contracts";
import { createGroundHeightContext, groundHeightAt } from "@3dspace/room-engine";
import { applyAiHostRealtimeMessage } from "./ai-host-realtime";
import { ApiError, createAiHost, dismissAiHost, getAiHost, listAiHostChat, patchAiHost, streamAiHostChat } from "./api";

const SPEECH_BUBBLE_MAX_CHARS = 120;

function speechBubbleSnippet(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= SPEECH_BUBBLE_MAX_CHARS) return collapsed;
  return `${collapsed.slice(0, SPEECH_BUBBLE_MAX_CHARS).trimEnd()}…`;
}
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

const REFRESH_INTERVAL_MS = 30_000;

export type AiWorldHostPlacementMode = "idle" | "summon" | "reposition";

export type AiWorldHostAnimationState = "idle" | "thinking" | "speaking";

/** Scene props for Phase 3 `RetroRobotHostAvatar` — consumed via context, not RoomView3D edits from Phase 4. */
export type AiWorldHostSceneConfig = {
  host: RoomAiHost | null;
  placementMode: AiWorldHostPlacementMode;
  ghost: { position: Vector3; rotationY: number } | null;
  animationState: AiWorldHostAnimationState;
  speechBubbleText: string | null;
  onHostInteract: () => void;
};

type PublishAiHostMessage = (message: RealtimeMessage) => void;

function publishMessages(publish: PublishAiHostMessage | undefined, messages: RoomAiHostRealtimeMessage[]) {
  for (const message of messages) {
    publish?.(message);
  }
}

export const AiWorldHostSceneContext = createContext<AiWorldHostSceneConfig | null>(null);

export function useAiWorldHostScene() {
  return useContext(AiWorldHostSceneContext);
}

export function useAiWorldHost(input: {
  identity: ApiIdentity;
  roomId?: string | undefined;
  enabled: boolean;
  publish?: PublishAiHostMessage | undefined;
}) {
  const [host, setHost] = useState<RoomAiHost | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [placementMode, setPlacementMode] = useState<AiWorldHostPlacementMode>("idle");
  const [ghost, setGhost] = useState<{ position: Vector3; rotationY: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [animationState, setAnimationState] = useState<AiWorldHostAnimationState>("idle");
  const [speechBubbleText, setSpeechBubbleText] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<RoomAiHostChatMessage[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");
  const [chatError, setChatError] = useState("");
  const placementModeRef = useRef<AiWorldHostPlacementMode>("idle");
  placementModeRef.current = placementMode;

  const applyHost = useCallback((next: RoomAiHost | null, options?: { clearPlacement?: boolean | undefined }) => {
    const clearPlacement = options?.clearPlacement ?? true;
    setHost(next);
    if (!next && clearPlacement) {
      setPlacementMode("idle");
      setGhost(null);
    }
  }, []);

  const applyRealtimeMessage = useCallback(
    (message: RoomAiHostRealtimeMessage) => {
      if (!input.enabled || !input.roomId || message.roomId !== input.roomId) return false;
      setHost((current) => applyAiHostRealtimeMessage(current, message));
      if (message.type === "room.ai-host.dismissed.v1") {
        applyHost(null, { clearPlacement: true });
        setPanelOpen(false);
        setSpeechBubbleText(null);
        setAnimationState("idle");
        setChatMessages([]);
        setStreamingReply("");
        setChatError("");
        return true;
      }
      return true;
    },
    [applyHost, input.enabled, input.roomId]
  );

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      if (!input.enabled || !input.roomId) {
        applyHost(null);
        setError("");
        setLoading(false);
        return null;
      }
      const showLoading = options?.showLoading ?? true;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const next = await getAiHost(input.identity, input.roomId);
        applyHost(next, { clearPlacement: placementModeRef.current === "idle" });
        return next;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load AI world host.");
        return null;
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [applyHost, input.enabled, input.identity, input.roomId]
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

  const cancelPlacement = useCallback(() => {
    setPlacementMode("idle");
    setGhost(null);
  }, []);

  const beginSummonPlacement = useCallback(
    (seed?: { position: Vector3; rotationY?: number | undefined }) => {
      setPlacementMode("summon");
      setGhost({
        position: seed?.position ?? { x: 0, y: 0, z: 0 },
        rotationY: seed?.rotationY ?? 0
      });
    },
    []
  );

  const beginReposition = useCallback(() => {
    if (!host) return;
    setPlacementMode("reposition");
    setGhost({ position: host.position, rotationY: host.rotationY });
  }, [host]);

  const updateGhostAt = useCallback((position: Vector3, rotationY?: number) => {
    setGhost((current) => ({
      position,
      rotationY: rotationY ?? current?.rotationY ?? 0
    }));
  }, []);

  const handleGroundClick = useCallback(
    (position: Vector3) => {
      if (placementMode === "idle") return false;
      setGhost((current) => ({
        position,
        rotationY: current?.rotationY ?? host?.rotationY ?? 0
      }));
      return true;
    },
    [host?.rotationY, placementMode]
  );

  const summon = useCallback(
    async (displayName: string, position: Vector3, rotationY = 0) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      setBusy(true);
      setError("");
      try {
        const result = await createAiHost(input.identity, input.roomId, {
          displayName,
          position,
          rotationY
        });
        applyHost(result.host);
        publishMessages(input.publish, result.realtimeMessages);
        setPlacementMode("idle");
        setGhost(null);
        setPanelOpen(true);
        return result.host;
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to summon AI guide.";
        setError(message);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [applyHost, input.identity, input.publish, input.roomId]
  );

  const confirmPlacement = useCallback(async () => {
    if (!ghost || placementMode === "idle") return null;
    if (placementMode === "summon") {
      throw new Error("Set a display name before placing the guide.");
    }
    if (!input.roomId || !host) return null;
    setBusy(true);
    setError("");
    try {
      const result = await patchAiHost(input.identity, input.roomId, {
        position: ghost.position,
        rotationY: ghost.rotationY
      });
      applyHost(result.host);
      publishMessages(input.publish, result.realtimeMessages);
      setPlacementMode("idle");
      setGhost(null);
      return result.host;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to move AI guide.";
      setError(message);
      throw err;
    } finally {
      setBusy(false);
    }
  }, [applyHost, ghost, host, input.identity, input.publish, input.roomId, placementMode]);

  const rename = useCallback(
    async (displayName: string) => {
      if (!input.roomId || !host) throw new Error("No AI guide in this room.");
      setBusy(true);
      setError("");
      try {
        const result = await patchAiHost(input.identity, input.roomId, { displayName });
        applyHost(result.host);
        publishMessages(input.publish, result.realtimeMessages);
        return result.host;
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to rename AI guide.";
        setError(message);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [applyHost, host, input.identity, input.publish, input.roomId]
  );

  const dismiss = useCallback(
    async (deleteFiles = false) => {
      if (!input.roomId || !host) return;
      setBusy(true);
      setError("");
      try {
        const result = await dismissAiHost(input.identity, input.roomId, deleteFiles);
        applyHost(null, { clearPlacement: true });
        publishMessages(input.publish, result.realtimeMessages);
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to dismiss AI guide.";
        setError(message);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [applyHost, host, input.identity, input.publish, input.roomId]
  );

  const hostId = host?.id ?? null;
  useEffect(() => {
    if (!input.enabled || !input.roomId || !hostId) {
      setChatMessages([]);
      return;
    }
    let cancelled = false;
    listAiHostChat(input.identity, input.roomId, { mode: "build-help", limit: 50 })
      .then((messages) => {
        if (!cancelled) setChatMessages(messages);
      })
      .catch(() => {
        // history is best-effort; chat still works without it
      });
    return () => {
      cancelled = true;
    };
  }, [hostId, input.enabled, input.identity, input.roomId]);

  const sendBuildHelp = useCallback(
    async (content: string, buildHelpContext?: AiHostBuildHelpContext) => {
      const trimmed = content.trim();
      if (!trimmed || !input.roomId) return;
      setChatError("");
      setChatStreaming(true);
      setStreamingReply("");
      setAnimationState("thinking");
      setPanelOpen(true);

      const optimisticUser: RoomAiHostChatMessage = {
        id: `local_${Date.now()}`,
        roomId: input.roomId,
        userId: input.identity.userId,
        mode: "build-help",
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString()
      };
      setChatMessages((prev) => [...prev, optimisticUser]);

      let acc = "";
      try {
        const finalMessage = await streamAiHostChat(
          input.identity,
          input.roomId,
          { mode: "build-help", content: trimmed, ...(buildHelpContext ? { buildHelpContext } : {}) },
          {
            onDelta: (text) => {
              acc += text;
              setStreamingReply(acc);
              setSpeechBubbleText(speechBubbleSnippet(acc));
              setAnimationState("speaking");
            },
            onError: (payload) => {
              setChatError(payload.message || "The guide is taking a break. Try again in a moment.");
            }
          }
        );
        if (finalMessage) {
          setChatMessages((prev) => [...prev, finalMessage]);
          setSpeechBubbleText(speechBubbleSnippet(finalMessage.content));
        }
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to reach the AI guide.";
        setChatError(message);
      } finally {
        setChatStreaming(false);
        setStreamingReply("");
        setAnimationState("idle");
      }
    },
    [input.identity, input.roomId]
  );

  const scene = useMemo<AiWorldHostSceneConfig>(
    () => ({
      host,
      placementMode,
      ghost,
      animationState,
      speechBubbleText,
      onHostInteract: () => setPanelOpen(true)
    }),
    [animationState, ghost, host, placementMode, speechBubbleText]
  );

  return {
    host,
    loading,
    error,
    busy,
    placementMode,
    ghost,
    panelOpen,
    setPanelOpen,
    animationState,
    setAnimationState,
    speechBubbleText,
    setSpeechBubbleText,
    chatMessages,
    chatStreaming,
    streamingReply,
    chatError,
    scene,
    refresh,
    handleRealtimeMessage: (message: RealtimeMessage) => {
      if (!message.type.startsWith("room.ai-host.")) return false;
      return applyRealtimeMessage(message as RoomAiHostRealtimeMessage);
    },
    handleGroundClick,
    cancelPlacement,
    beginSummonPlacement,
    beginReposition,
    updateGhostAt,
    actions: {
      summon,
      confirmPlacement,
      rename,
      dismiss,
      sendBuildHelp
    }
  };
}

/** Ground Y for host placement clicks (manifest floor + build pieces when present). */
export function aiHostPlacementPosition(
  manifest: RoomManifest,
  x: number,
  z: number,
  buildPieces: BuildPiece[],
  fallbackY: number
): Vector3 {
  const ctx = createGroundHeightContext(manifest, buildPieces);
  const y = groundHeightAt(x, z, ctx, fallbackY, "walk");
  return { x, y, z };
}

/** Central FFA hub placement (origin XZ + ground-aware Y). */
export function aiHostHubPlacementPosition(
  manifest: RoomManifest,
  buildPieces: BuildPiece[],
  fallbackY: number
): Vector3 {
  return aiHostPlacementPosition(manifest, 0, 0, buildPieces, fallbackY);
}
