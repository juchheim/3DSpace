"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BuildLogicPiece,
  BuildPieceEdge,
  LogicConfigInput,
  LogicPieceKind,
  LogicState,
  RoomLogicRealtimeMessage
} from "@3dspace/contracts";
import { logicPieceStableId } from "@3dspace/room-engine";
import {
  clearLogicPieces,
  createLogicPiece,
  deleteLogicPiece,
  getLogicState,
  listLogicPieces,
  patchLogicPieceNodeState,
  updateLogicPiece
} from "./api";

export type LogicPlaceOptions = {
  config?: LogicConfigInput | undefined;
  linkId?: string | undefined;
};
import {
  applyLogicRealtimeToPieces,
  applyLogicStatePatch,
  mergeLogicPiece
} from "./logic-pieces-realtime";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

const REFRESH_INTERVAL_MS = 30_000;

type PublishLogicMessage = (message: RealtimeMessage) => void;

function publishMessages(publish: PublishLogicMessage | undefined, messages: RoomLogicRealtimeMessage[]) {
  for (const message of messages) {
    publish?.(message);
  }
}

export function useLogicPieces(input: {
  identity: ApiIdentity;
  roomId?: string | undefined;
  enabled: boolean;
  publish?: PublishLogicMessage | undefined;
}) {
  const [piecesById, setPiecesById] = useState<Record<string, BuildLogicPiece>>({});
  const [logicState, setLogicState] = useState<LogicState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const upsertLocal = useCallback((piece: BuildLogicPiece) => {
    setPiecesById((current) => {
      const merged = mergeLogicPiece(current[piece.id], piece);
      if (merged === current[piece.id]) return current;
      return { ...current, [piece.id]: merged };
    });
  }, []);

  const applyRealtimeMessage = useCallback(
    (message: RoomLogicRealtimeMessage) => {
      if (!input.enabled || !input.roomId || message.roomId !== input.roomId) return false;
      if (message.type === "room.logic.state.v1") {
        setLogicState((current) =>
          current ? applyLogicStatePatch(current, message) : { roomId: input.roomId!, channels: message.channels ?? {}, nodes: message.nodes ?? {}, updatedAt: new Date().toISOString() }
        );
        return true;
      }
      setPiecesById((current) => applyLogicRealtimeToPieces(current, message));
      return true;
    },
    [input.enabled, input.roomId]
  );

  const applyRealtimeMessages = useCallback(
    (messages: RoomLogicRealtimeMessage[]) => {
      for (const message of messages) {
        applyRealtimeMessage(message);
      }
    },
    [applyRealtimeMessage]
  );

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      if (!input.enabled || !input.roomId) {
        setPiecesById({});
        setLogicState(null);
        setError("");
        setLoading(false);
        return [];
      }

      const showLoading = options?.showLoading ?? true;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const [pieces, state] = await Promise.all([
          listLogicPieces(input.identity, input.roomId),
          getLogicState(input.identity, input.roomId)
        ]);
        setPiecesById(() => {
          const next: Record<string, BuildLogicPiece> = {};
          for (const piece of pieces) {
            next[piece.id] = piece;
          }
          return next;
        });
        setLogicState(state);
        return pieces;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load logic pieces.");
        return [];
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [input.enabled, input.identity, input.roomId]
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

  const place = useCallback(
    async (
      kind: LogicPieceKind,
      cell: { ix: number; iz: number },
      level: number,
      edge?: BuildPieceEdge | undefined,
      channelId?: string | undefined,
      options?: LogicPlaceOptions
    ) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const stableId = logicPieceStableId({ kind, cell, level, edge });
      const previous = piecesById[stableId];
      const linkId = options?.linkId;
      const optimistic: BuildLogicPiece = {
        id: stableId,
        roomId: input.roomId,
        kind,
        cell,
        level,
        ...(edge ? { edge } : {}),
        rotation: 0,
        ...(channelId ? { channelId } : {}),
        ...(linkId ? { linkId } : {}),
        config: (options?.config ?? {}) as BuildLogicPiece["config"],
        createdByUserId: input.identity.userId,
        createdAt: previous?.createdAt ?? new Date().toISOString()
      };
      upsertLocal(optimistic);
      try {
        const result = await createLogicPiece(input.identity, input.roomId, {
          kind,
          cell,
          level,
          edge,
          channelId,
          ...(linkId ? { linkId } : {}),
          ...(options?.config ? { config: options.config } : {})
        });
        upsertLocal(result.piece);
        applyRealtimeMessages(result.realtimeMessages);
        publishMessages(input.publish, result.realtimeMessages);
        return result.piece;
      } catch (err) {
        if (previous) upsertLocal(previous);
        else {
          setPiecesById((current) => {
            if (!(stableId in current)) return current;
            const next = { ...current };
            delete next[stableId];
            return next;
          });
        }
        throw err;
      }
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId, piecesById, upsertLocal]
  );

  const update = useCallback(
    async (
      pieceId: string,
      patch: { channelId?: string; linkId?: string; config?: LogicConfigInput }
    ) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const previous = piecesById[pieceId];
      if (previous) {
        const optimistic: BuildLogicPiece = {
          ...previous,
          ...(patch.channelId !== undefined ? { channelId: patch.channelId } : {}),
          ...(patch.linkId !== undefined ? { linkId: patch.linkId } : {}),
          ...(patch.config !== undefined ? { config: patch.config as BuildLogicPiece["config"] } : {})
        };
        upsertLocal(optimistic);
      }
      try {
        const result = await updateLogicPiece(input.identity, input.roomId, pieceId, patch);
        upsertLocal(result.piece);
        applyRealtimeMessages(result.realtimeMessages);
        publishMessages(input.publish, result.realtimeMessages);
        return result.piece;
      } catch (err) {
        if (previous) upsertLocal(previous);
        throw err;
      }
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId, piecesById, upsertLocal]
  );

  const destroy = useCallback(
    async (pieceId: string) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const previous = piecesById[pieceId];
      setPiecesById((current) => {
        if (!(pieceId in current)) return current;
        const next = { ...current };
        delete next[pieceId];
        return next;
      });
      try {
        const result = await deleteLogicPiece(input.identity, input.roomId, pieceId);
        applyRealtimeMessages(result.realtimeMessages);
        publishMessages(input.publish, result.realtimeMessages);
      } catch (err) {
        if (previous) upsertLocal(previous);
        else void refresh({ showLoading: false });
        throw err;
      }
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId, piecesById, refresh, upsertLocal]
  );

  const patchNodeState = useCallback(
    async (pieceId: string, patch: { open?: boolean; on?: boolean; armed?: boolean }) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const result = await patchLogicPieceNodeState(input.identity, input.roomId, pieceId, patch);
      setLogicState(result.state);
      applyRealtimeMessages(result.realtimeMessages);
      publishMessages(input.publish, result.realtimeMessages);
      return result.state;
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId]
  );

  const clearAll = useCallback(async () => {
    if (!input.roomId) throw new Error("Room is not ready.");
    const previous = piecesById;
    const previousState = logicState;
    setPiecesById({});
    setLogicState(
      previousState
        ? { ...previousState, channels: {}, nodes: {}, updatedAt: new Date().toISOString() }
        : null
    );
    try {
      const result = await clearLogicPieces(input.identity, input.roomId);
      applyRealtimeMessages(result.realtimeMessages);
      publishMessages(input.publish, result.realtimeMessages);
    } catch (err) {
      setPiecesById(previous);
      setLogicState(previousState);
      throw err;
    }
  }, [applyRealtimeMessages, input.identity, input.publish, input.roomId, logicState, piecesById]);

  const pieces = useMemo(
    () => Object.values(piecesById).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [piecesById]
  );

  return {
    pieces,
    piecesById,
    logicState,
    loading,
    error,
    setError,
    refresh,
    handleRealtimeMessage: (message: RealtimeMessage) => {
      if (!("type" in message) || !message.type.startsWith("room.logic.")) return false;
      return applyRealtimeMessage(message as RoomLogicRealtimeMessage);
    },
    actions: { place, update, destroy, clearAll, patchNodeState }
  };
}
