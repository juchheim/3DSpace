"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BuildPiece,
  BuildPieceEdge,
  BuildPieceKind,
  BuildPieceMaterial,
  BuildPieceRotation,
  CreateBuildPieceRequestSchema,
  RoomBuildRealtimeMessage
} from "@3dspace/contracts";
import type { z } from "zod";
import { buildPieceStableId } from "@3dspace/room-engine";
import {
  buildPlacementStatusMessage,
  checkBuildCapsForPlacements,
  type BuildPlacementTarget
} from "./buildPlacement";
import {
  clearBuildPieces,
  createBuildPiece,
  createBuildPiecesBatch,
  deleteBuildPiece,
  listBuildPieces
} from "./api";
import { applyBuildRealtimeToPieces, mergeBuildPiece } from "./build-pieces-realtime";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

const REFRESH_INTERVAL_MS = 30_000;

type PublishBuildMessage = (message: RealtimeMessage) => void;
type BuildPiecePlacementInput = z.infer<typeof CreateBuildPieceRequestSchema>;

function publishMessages(publish: PublishBuildMessage | undefined, messages: RoomBuildRealtimeMessage[]) {
  for (const message of messages) {
    publish?.(message);
  }
}

function buildPlacementKey(input: BuildPiecePlacementInput) {
  return `${input.kind}:${input.cell.ix},${input.cell.iz}:${input.level}:${input.edge ?? ""}`;
}

function placementInputToTarget(placement: BuildPiecePlacementInput): BuildPlacementTarget {
  return {
    kind: placement.kind,
    cell: placement.cell,
    level: placement.level,
    ...(placement.edge ? { edge: placement.edge } : {}),
    rotation: placement.rotation ?? 0,
    materialId: placement.materialId ?? "stone"
  };
}

function dedupePlacementsLastWins(placements: BuildPiecePlacementInput[]) {
  const byKey = new Map<string, BuildPiecePlacementInput>();
  for (const placement of placements) {
    byKey.set(buildPlacementKey(placement), placement);
  }
  return [...byKey.values()];
}

function optimisticBuildPiece(input: {
  roomId: string;
  userId: string;
  kind: BuildPieceKind;
  cell: { ix: number; iz: number };
  level: number;
  edge?: BuildPieceEdge | undefined;
  rotation?: BuildPieceRotation | undefined;
  materialId?: BuildPieceMaterial | undefined;
  existing?: BuildPiece | undefined;
}): BuildPiece {
  const rotation = input.rotation ?? input.existing?.rotation ?? 0;
  const materialId = input.materialId ?? input.existing?.materialId ?? "stone";
  return {
    id: buildPieceStableId({
      kind: input.kind,
      cell: input.cell,
      level: input.level,
      edge: input.edge
    }),
    roomId: input.roomId,
    kind: input.kind,
    cell: input.cell,
    level: input.level,
    ...(input.edge ? { edge: input.edge } : {}),
    rotation,
    materialId,
    createdByUserId: input.existing?.createdByUserId ?? input.userId,
    createdAt: input.existing?.createdAt ?? new Date().toISOString()
  };
}

export function useBuildPieces(input: {
  identity: ApiIdentity;
  roomId?: string | undefined;
  enabled: boolean;
  publish?: PublishBuildMessage | undefined;
}) {
  const [piecesById, setPiecesById] = useState<Record<string, BuildPiece>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const upsertLocal = useCallback((piece: BuildPiece) => {
    setPiecesById((current) => {
      const merged = mergeBuildPiece(current[piece.id], piece);
      if (merged === current[piece.id]) return current;
      return { ...current, [piece.id]: merged };
    });
  }, []);

  const applyRealtimeMessage = useCallback(
    (message: RoomBuildRealtimeMessage) => {
      if (!input.enabled || !input.roomId || message.roomId !== input.roomId) return false;
      setPiecesById((current) => applyBuildRealtimeToPieces(current, message));
      return true;
    },
    [input.enabled, input.roomId]
  );

  const applyRealtimeMessages = useCallback(
    (messages: RoomBuildRealtimeMessage[]) => {
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
        setError("");
        setLoading(false);
        return [];
      }

      const showLoading = options?.showLoading ?? true;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const pieces = await listBuildPieces(input.identity, input.roomId);
        setPiecesById((current) => {
          const next: Record<string, BuildPiece> = {};
          for (const piece of pieces) {
            next[piece.id] = mergeBuildPiece(current[piece.id], piece);
          }
          return next;
        });
        return pieces;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load build pieces.");
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
    const onFocus = () => {
      void refresh({ showLoading: false });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [input.enabled, input.roomId, refresh]);

  const place = useCallback(
    async (
      kind: BuildPieceKind,
      cell: { ix: number; iz: number },
      level: number,
      edge?: BuildPieceEdge | undefined,
      rotation?: BuildPieceRotation | undefined,
      materialId?: BuildPieceMaterial | undefined
    ) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const stableId = buildPieceStableId({ kind, cell, level, edge });
      const previous = piecesById[stableId];
      upsertLocal(
        optimisticBuildPiece({
          roomId: input.roomId,
          userId: input.identity.userId,
          kind,
          cell,
          level,
          edge,
          rotation,
          materialId,
          existing: previous
        })
      );
      try {
        const result = await createBuildPiece(input.identity, input.roomId, {
          kind,
          cell,
          level,
          edge,
          rotation,
          materialId
        });
        upsertLocal(result.piece);
        applyRealtimeMessages(result.realtimeMessages);
        publishMessages(input.publish, result.realtimeMessages);
        return result.piece;
      } catch (err) {
        if (previous) {
          upsertLocal(previous);
        } else {
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

  const placeBatch = useCallback(
    async (placements: BuildPiecePlacementInput[]) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const uniquePlacements = dedupePlacementsLastWins(placements);
      const capCheck = checkBuildCapsForPlacements(
        Object.values(piecesById),
        input.identity.userId,
        uniquePlacements.map(placementInputToTarget)
      );
      if (!capCheck.ok) {
        throw new Error(buildPlacementStatusMessage(capCheck.reason));
      }
      const previousById = new Map<string, BuildPiece | undefined>();
      for (const placement of uniquePlacements) {
        const stableId = buildPieceStableId({
          kind: placement.kind,
          cell: placement.cell,
          level: placement.level,
          edge: placement.edge
        });
        previousById.set(
          stableId,
          piecesById[stableId]
            ? { ...piecesById[stableId] }
            : undefined
        );
        upsertLocal(
          optimisticBuildPiece({
            roomId: input.roomId,
            userId: input.identity.userId,
            kind: placement.kind,
            cell: placement.cell,
            level: placement.level,
            edge: placement.edge,
            rotation: placement.rotation,
            materialId: placement.materialId,
            existing: piecesById[stableId]
          })
        );
      }
      try {
        const result = await createBuildPiecesBatch(input.identity, input.roomId, {
          pieces: uniquePlacements
        });
        for (const piece of result.pieces) {
          upsertLocal(piece);
        }
        applyRealtimeMessages(result.realtimeMessages);
        publishMessages(input.publish, result.realtimeMessages);
        return result.pieces;
      } catch (err) {
        setPiecesById((current) => {
          const next = { ...current };
          for (const [stableId, previous] of previousById.entries()) {
            if (previous) {
              next[stableId] = previous;
            } else {
              delete next[stableId];
            }
          }
          return next;
        });
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
        const result = await deleteBuildPiece(input.identity, input.roomId, pieceId);
        applyRealtimeMessages(result.realtimeMessages);
        publishMessages(input.publish, result.realtimeMessages);
      } catch (err) {
        if (previous) {
          upsertLocal(previous);
        } else {
          void refresh({ showLoading: false });
        }
        throw err;
      }
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId, piecesById, refresh, upsertLocal]
  );

  const clearAll = useCallback(async () => {
    if (!input.roomId) throw new Error("Room is not ready.");
    const previous = piecesById;
    setPiecesById({});
    try {
      const result = await clearBuildPieces(input.identity, input.roomId);
      applyRealtimeMessages(result.realtimeMessages);
      publishMessages(input.publish, result.realtimeMessages);
    } catch (err) {
      setPiecesById(previous);
      throw err;
    }
  }, [applyRealtimeMessages, input.identity, input.publish, input.roomId, piecesById]);

  const pieces = useMemo(() => {
    return Object.values(piecesById).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }, [piecesById]);

  return {
    pieces,
    piecesById,
    loading,
    error,
    setError,
    refresh,
    handleRealtimeMessage: (message: RealtimeMessage) => {
      if (!("type" in message) || !message.type.startsWith("room.build.")) return false;
      return applyRealtimeMessage(message as RoomBuildRealtimeMessage);
    },
    actions: {
      place,
      placeBatch,
      destroy,
      clearAll
    }
  };
}
