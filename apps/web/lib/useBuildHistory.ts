"use client";

import { useCallback, useEffect, useRef } from "react";
import type {
  BuildPiece,
  BuildPieceEdge,
  BuildPieceKind,
  BuildPieceMaterial,
  BuildPieceRotation
} from "@3dspace/contracts";
import type { z } from "zod";
import type { CreateBuildPieceRequestSchema } from "@3dspace/contracts";

const MAX_HISTORY = 50;

type BuildPlacementInput = z.infer<typeof CreateBuildPieceRequestSchema>;

type BuildActions = {
  place(
    kind: BuildPieceKind,
    cell: { ix: number; iz: number },
    level: number,
    edge?: BuildPieceEdge | undefined,
    rotation?: BuildPieceRotation | undefined,
    materialId?: BuildPieceMaterial | undefined
  ): Promise<BuildPiece>;
  placeBatch(placements: BuildPlacementInput[]): Promise<BuildPiece[]>;
  destroy(pieceId: string): Promise<void>;
};

function callPlace(actions: BuildActions, placement: BuildPlacementInput) {
  return actions.place(
    placement.kind,
    placement.cell,
    placement.level,
    placement.edge,
    placement.rotation,
    placement.materialId
  );
}

type HistoryEntry = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

function placementFromPiece(piece: BuildPiece): BuildPlacementInput {
  return {
    kind: piece.kind,
    cell: piece.cell,
    level: piece.level,
    ...(piece.edge ? { edge: piece.edge } : {}),
    rotation: piece.rotation,
    materialId: piece.materialId
  };
}

export function useBuildHistory(
  actions: BuildActions,
  getPiecesById: () => Record<string, BuildPiece>,
  options?: { onConflict?: (message: string) => void }
) {
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const getPiecesByIdRef = useRef(getPiecesById);
  getPiecesByIdRef.current = getPiecesById;

  const slotOwnedBy = useCallback(
    (pieceId: string, expectedUserId: string) => {
      const current = getPiecesByIdRef.current()[pieceId];
      return !current || current.createdByUserId === expectedUserId;
    },
    []
  );

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, []);

  const push = useCallback((entry: HistoryEntry) => {
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > MAX_HISTORY) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, []);

  const recordPlace = useCallback(
    (piece: BuildPiece) => {
      const placement = placementFromPiece(piece);
      const ownerId = piece.createdByUserId;
      push({
        undo: async () => {
          if (!slotOwnedBy(piece.id, ownerId)) {
            options?.onConflict?.("Someone else changed that piece — undo skipped.");
            return;
          }
          await actions.destroy(piece.id);
        },
        redo: async () => {
          await callPlace(actions, placement);
        }
      });
    },
    [actions, options, push, slotOwnedBy]
  );

  const recordPlaceBatch = useCallback(
    (pieces: BuildPiece[]) => {
      if (pieces.length === 0) return;
      const snapshots = pieces.map((piece) => ({
        id: piece.id,
        placement: placementFromPiece(piece),
        ownerId: piece.createdByUserId
      }));
      push({
        undo: async () => {
          for (const snap of snapshots) {
            if (!slotOwnedBy(snap.id, snap.ownerId)) {
              options?.onConflict?.("Someone else changed that piece — undo skipped.");
              return;
            }
            await actions.destroy(snap.id);
          }
        },
        redo: async () => {
          await actions.placeBatch(snapshots.map((snap) => snap.placement));
        }
      });
    },
    [actions, options, push, slotOwnedBy]
  );

  const recordDestroy = useCallback(
    (piece: BuildPiece) => {
      const placement = placementFromPiece(piece);
      const ownerId = piece.createdByUserId;
      push({
        undo: async () => {
          await callPlace(actions, placement);
        },
        redo: async () => {
          if (!slotOwnedBy(piece.id, ownerId)) {
            options?.onConflict?.("Someone else changed that piece — redo skipped.");
            return;
          }
          await actions.destroy(piece.id);
        }
      });
    },
    [actions, options, push, slotOwnedBy]
  );

  const undo = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return false;
    await entry.undo();
    redoStackRef.current.push(entry);
    return true;
  }, []);

  const redo = useCallback(async () => {
    const entry = redoStackRef.current.pop();
    if (!entry) return false;
    await entry.redo();
    undoStackRef.current.push(entry);
    return true;
  }, []);

  useEffect(() => {
    getPiecesByIdRef.current = getPiecesById;
  }, [getPiecesById]);

  const canUndo = useCallback(() => undoStackRef.current.length > 0, []);
  const canRedo = useCallback(() => redoStackRef.current.length > 0, []);

  return {
    clear,
    recordPlace,
    recordPlaceBatch,
    recordDestroy,
    undo,
    redo,
    canUndo,
    canRedo
  };
}
