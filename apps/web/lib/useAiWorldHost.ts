"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  AiHostBuildHelpContext,
  BuildPiece,
  RoomAiHost,
  RoomAiHostChatMessage,
  RoomAiHostFile,
  RoomAiHostRealtimeMessage,
  RoomManifest,
  Vector3
} from "@3dspace/contracts";
import { createGroundHeightContext, groundHeightAt } from "@3dspace/room-engine";
import { applyAiHostRealtimeMessage, buildAiHostFileUpdatedMessage } from "./ai-host-realtime";
import {
  ApiError,
  createAiHost,
  deleteAiHostFile,
  dismissAiHost,
  getAiHost,
  listAiHostChat,
  listAiHostFiles,
  patchAiHost,
  reprocessAiHostFile,
  streamAiHostChat,
  uploadAiHostStudyFile
} from "./api";

function formatSpeechBubbleText(text: string): string {
  return text.trim().replace(/\n{3,}/g, "\n\n");
}
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

const REFRESH_INTERVAL_MS = 30_000;
const FILE_PROCESSING_POLL_MS = 2_000;
const FILE_PROCESSING_MAX_POLLS = 90;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type AiWorldHostPlacementMode = "idle" | "summon" | "reposition";

export type AiWorldHostAnimationState = "idle" | "thinking" | "speaking";

/** Scene props for Phase 3 `RetroRobotHostAvatar` — consumed via context, not RoomView3D edits from Phase 4. */
export type AiWorldHostSceneConfig = {
  host: RoomAiHost | null;
  placementMode: AiWorldHostPlacementMode;
  ghost: { position: Vector3; rotationY: number } | null;
  /** Avatar to render for the placement ghost (live host's, else the pending pick). */
  ghostAvatar: RoomAiHost["avatar"];
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
  const [pendingAvatar, setPendingAvatar] = useState<RoomAiHost["avatar"]>("model-lp");
  const [panelOpen, setPanelOpen] = useState(false);
  const [animationState, setAnimationState] = useState<AiWorldHostAnimationState>("idle");
  const [speechBubbleText, setSpeechBubbleText] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<RoomAiHostChatMessage[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");
  const [chatError, setChatError] = useState("");
  const [studyFiles, setStudyFiles] = useState<RoomAiHostFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState("");
  const [filesBusy, setFilesBusy] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [fileChatMessages, setFileChatMessages] = useState<RoomAiHostChatMessage[]>([]);
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
      if (message.type === "room.ai-host.file.updated.v1") {
        setStudyFiles((current) => {
          const rest = current.filter((file) => file.id !== message.file.id);
          return [...rest, message.file].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        return true;
      }
      if (message.type === "room.ai-host.file.removed.v1") {
        setStudyFiles((current) => current.filter((file) => file.id !== message.fileId));
        setActiveFileId((current) => (current === message.fileId ? null : current));
        setFileChatMessages((current) =>
          current.filter((entry) => entry.fileId !== message.fileId)
        );
        return true;
      }
      if (message.type === "room.ai-host.dismissed.v1") {
        applyHost(null, { clearPlacement: true });
        setSpeechBubbleText(null);
        setAnimationState("idle");
        setStreamingReply("");
        setChatError("");
        if (message.deleteFiles) {
          setStudyFiles([]);
          setActiveFileId(null);
          setFileChatMessages([]);
          setFilesError("");
          setPanelOpen(false);
        } else if (input.roomId) {
          void listAiHostFiles(input.identity, input.roomId).then((files) => {
            setStudyFiles(files);
            if (files.length > 0) setPanelOpen(true);
          });
        }
        return true;
      }
      return true;
    },
    [applyHost, input.enabled, input.identity, input.roomId]
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
    async (
      displayName: string,
      position: Vector3,
      rotationY = 0,
      avatar: RoomAiHost["avatar"] = "model-lp"
    ) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      setBusy(true);
      setError("");
      try {
        const result = await createAiHost(input.identity, input.roomId, {
          displayName,
          avatar,
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

  const setAvatar = useCallback(
    async (avatar: RoomAiHost["avatar"]) => {
      if (!input.roomId || !host) throw new Error("No AI guide in this room.");
      if (host.avatar === avatar) return host;
      setBusy(true);
      setError("");
      try {
        const result = await patchAiHost(input.identity, input.roomId, { avatar });
        applyHost(result.host);
        publishMessages(input.publish, result.realtimeMessages);
        return result.host;
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to change the guide's look.";
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
        setSpeechBubbleText(null);
        setAnimationState("idle");
        if (deleteFiles) {
          setStudyFiles([]);
          setActiveFileId(null);
          setFileChatMessages([]);
          setPanelOpen(false);
        } else {
          const files = await listAiHostFiles(input.identity, input.roomId);
          setStudyFiles(files);
          if (files.length > 0) setPanelOpen(true);
        }
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

  const pollStudyFileUntilSettled = useCallback(
    async (fileId: string) => {
      if (!input.roomId) return null;
      for (let attempt = 0; attempt < FILE_PROCESSING_MAX_POLLS; attempt += 1) {
        const files = await listAiHostFiles(input.identity, input.roomId);
        const match = files.find((entry) => entry.id === fileId);
        if (match && match.status !== "processing") {
          setStudyFiles(files);
          publishMessages(input.publish, [
            buildAiHostFileUpdatedMessage({
              roomId: input.roomId,
              file: match,
              senderId: input.identity.userId
            })
          ]);
          return match;
        }
        await sleep(FILE_PROCESSING_POLL_MS);
      }
      return null;
    },
    [input.identity, input.publish, input.roomId]
  );

  const refreshFiles = useCallback(async () => {
    if (!input.enabled || !input.roomId) {
      setStudyFiles([]);
      return [];
    }
    setFilesLoading(true);
    setFilesError("");
    try {
      const files = await listAiHostFiles(input.identity, input.roomId);
      setStudyFiles(files);
      return files;
    } catch (err) {
      setFilesError(err instanceof ApiError ? err.message : "Unable to load study files.");
      return [];
    } finally {
      setFilesLoading(false);
    }
  }, [input.enabled, input.identity, input.roomId]);

  const hostId = host?.id ?? null;
  const hasStudyFiles = studyFiles.length > 0;

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  useEffect(() => {
    if (!input.enabled || !input.roomId) return;
    if (!studyFiles.some((file) => file.status === "processing")) return;
    const interval = window.setInterval(() => {
      void refreshFiles();
    }, FILE_PROCESSING_POLL_MS);
    return () => window.clearInterval(interval);
  }, [input.enabled, input.roomId, refreshFiles, studyFiles]);

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

  useEffect(() => {
    if (!input.enabled || !input.roomId || !activeFileId) {
      setFileChatMessages([]);
      return;
    }
    let cancelled = false;
    listAiHostChat(input.identity, input.roomId, { mode: "file-study", fileId: activeFileId, limit: 50 })
      .then((messages) => {
        if (!cancelled) setFileChatMessages(messages);
      })
      .catch(() => {
        if (!cancelled) setFileChatMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFileId, input.enabled, input.identity, input.roomId]);

  const sendBuildHelp = useCallback(
    async (content: string, buildHelpContext?: AiHostBuildHelpContext) => {
      const trimmed = content.trim();
      if (!trimmed || !input.roomId) return;
      setChatError("");
      setChatStreaming(true);
      setStreamingReply("");
      setAnimationState("thinking");
      setPanelOpen(true);

      const optimisticId = `local_${Date.now()}`;
      const optimisticUser: RoomAiHostChatMessage = {
        id: optimisticId,
        roomId: input.roomId,
        userId: input.identity.userId,
        mode: "build-help",
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString()
      };
      setChatMessages((prev) => [...prev, optimisticUser]);

      let acc = "";
      let streamFailed = false;
      try {
        const finalMessage = await streamAiHostChat(
          input.identity,
          input.roomId,
          { mode: "build-help", content: trimmed, ...(buildHelpContext ? { buildHelpContext } : {}) },
          {
            onDelta: (text) => {
              acc += text;
              setStreamingReply(acc);
              setSpeechBubbleText(formatSpeechBubbleText(acc));
              setAnimationState("speaking");
            },
            onError: (payload) => {
              streamFailed = true;
              setChatError(payload.message || "The guide is taking a break. Try again in a moment.");
            }
          }
        );
        if (finalMessage) {
          setChatMessages((prev) => [...prev.filter((m) => m.id !== optimisticId), finalMessage]);
          setSpeechBubbleText(formatSpeechBubbleText(finalMessage.content));
        } else if (streamFailed) {
          setChatMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
      } catch (err) {
        streamFailed = true;
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to reach the AI guide.";
        setChatError(message);
        setChatMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      } finally {
        setChatStreaming(false);
        setStreamingReply("");
        setAnimationState("idle");
      }
    },
    [input.identity, input.roomId]
  );

  const sendFileStudy = useCallback(
    async (fileId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed || !input.roomId) return;
      setChatError("");
      setChatStreaming(true);
      setStreamingReply("");
      setAnimationState("thinking");
      setPanelOpen(true);

      const optimisticId = `local_${Date.now()}`;
      const optimisticUser: RoomAiHostChatMessage = {
        id: optimisticId,
        roomId: input.roomId,
        userId: input.identity.userId,
        mode: "file-study",
        fileId,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString()
      };
      setFileChatMessages((prev) => [...prev, optimisticUser]);

      let acc = "";
      let streamFailed = false;
      try {
        const finalMessage = await streamAiHostChat(
          input.identity,
          input.roomId,
          { mode: "file-study", fileId, content: trimmed },
          {
            onDelta: (text) => {
              acc += text;
              setStreamingReply(acc);
              setSpeechBubbleText(formatSpeechBubbleText(acc));
              setAnimationState("speaking");
            },
            onError: (payload) => {
              streamFailed = true;
              setChatError(payload.message || "The guide is taking a break. Try again in a moment.");
            }
          }
        );
        if (finalMessage) {
          setFileChatMessages((prev) => [...prev.filter((m) => m.id !== optimisticId), finalMessage]);
          setSpeechBubbleText(formatSpeechBubbleText(finalMessage.content));
        } else if (streamFailed) {
          setFileChatMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
      } catch (err) {
        streamFailed = true;
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to reach the AI guide.";
        setChatError(message);
        setFileChatMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      } finally {
        setChatStreaming(false);
        setStreamingReply("");
        setAnimationState("idle");
      }
    },
    [input.identity, input.roomId]
  );

  const uploadStudyFile = useCallback(
    async (file: File) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      setFilesBusy(true);
      setFilesError("");
      try {
        const result = await uploadAiHostStudyFile(input.identity, input.roomId, file);
        publishMessages(input.publish, result.realtimeMessages);
        let settled = result.file;
        if (settled.status === "processing") {
          const polled = await pollStudyFileUntilSettled(settled.id);
          if (polled) settled = polled;
        }
        setStudyFiles((current) => {
          const rest = current.filter((entry) => entry.id !== settled.id);
          return [...rest, settled].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        setActiveFileId(settled.id);
        return settled;
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to upload file.";
        setFilesError(message);
        throw err;
      } finally {
        setFilesBusy(false);
      }
    },
    [input.identity, input.publish, input.roomId, pollStudyFileUntilSettled]
  );

  const retryStudyFile = useCallback(
    async (fileId: string) => {
      if (!input.roomId) return;
      setFilesBusy(true);
      setFilesError("");
      try {
        const result = await reprocessAiHostFile(input.identity, input.roomId, fileId);
        publishMessages(input.publish, result.realtimeMessages);
        let settled = result.file;
        if (settled.status === "processing") {
          const polled = await pollStudyFileUntilSettled(fileId);
          if (polled) settled = polled;
        }
        setStudyFiles((current) => {
          const rest = current.filter((entry) => entry.id !== settled.id);
          return [...rest, settled].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        setActiveFileId(settled.id);
        return settled;
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to retry file processing.";
        setFilesError(message);
        throw err;
      } finally {
        setFilesBusy(false);
      }
    },
    [input.identity, input.publish, input.roomId, pollStudyFileUntilSettled]
  );

  const deleteStudyFile = useCallback(
    async (fileId: string) => {
      if (!input.roomId) return;
      setFilesBusy(true);
      setFilesError("");
      try {
        const result = await deleteAiHostFile(input.identity, input.roomId, fileId);
        publishMessages(input.publish, result.realtimeMessages);
        setStudyFiles((current) => current.filter((file) => file.id !== fileId));
        if (activeFileId === fileId) setActiveFileId(null);
        setFileChatMessages((current) => current.filter((entry) => entry.fileId !== fileId));
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to delete file.";
        setFilesError(message);
        throw err;
      } finally {
        setFilesBusy(false);
      }
    },
    [activeFileId, input.identity, input.publish, input.roomId]
  );

  const scene = useMemo<AiWorldHostSceneConfig>(
    () => ({
      host,
      placementMode,
      ghost,
      ghostAvatar: host?.avatar ?? pendingAvatar,
      animationState,
      speechBubbleText,
      onHostInteract: () => setPanelOpen(true)
    }),
    [animationState, ghost, host, pendingAvatar, placementMode, speechBubbleText]
  );

  return {
    host,
    loading,
    error,
    busy,
    placementMode,
    ghost,
    pendingAvatar,
    setPendingAvatar,
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
    studyFiles,
    hasStudyFiles,
    currentUserId: input.identity.userId,
    filesLoading,
    filesError,
    filesBusy,
    activeFileId,
    setActiveFileId,
    fileChatMessages,
    scene,
    refresh,
    refreshFiles,
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
      setAvatar,
      dismiss,
      sendBuildHelp,
      sendFileStudy,
      uploadStudyFile,
      retryStudyFile,
      deleteStudyFile
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

/** Default distance when summoning the guide in front of the local avatar. */
export const AI_HOST_SUMMON_DISTANCE_M = 2;

/** Place the guide one step ahead of the avatar, facing back toward them. */
export function aiHostPlacementInFrontOfAvatar(
  manifest: RoomManifest,
  avatarPosition: { x: number; y: number; z: number },
  avatarRotationY: number,
  buildPieces: BuildPiece[],
  fallbackY: number,
  distanceMeters = AI_HOST_SUMMON_DISTANCE_M
): { position: Vector3; rotationY: number } {
  const x = avatarPosition.x + Math.sin(avatarRotationY) * distanceMeters;
  const z = avatarPosition.z + Math.cos(avatarRotationY) * distanceMeters;
  return {
    position: aiHostPlacementPosition(manifest, x, z, buildPieces, fallbackY),
    rotationY: avatarRotationY + Math.PI
  };
}
