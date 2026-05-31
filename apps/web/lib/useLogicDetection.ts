"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AvatarStateMessage, BuildLogicPiece, LogicSignalKind } from "@3dspace/contracts";
import {
  avatarCellFromPosition,
  findNearestInteractableLogicPiece,
  findProximityZonesContaining,
  findStepOnLogicPieces,
  isInteractLogicKind
} from "@3dspace/room-engine";

export type LogicDetectionEvent = {
  pieceId: string;
  kind: LogicSignalKind;
  pieceKind: BuildLogicPiece["kind"];
  at: number;
};

function debounceMsFor(piece: BuildLogicPiece) {
  return piece.config?.debounceMs ?? 250;
}

export function useLogicDetection(input: {
  enabled: boolean;
  pieces: BuildLogicPiece[];
  getAvatarState: () => AvatarStateMessage | null;
  onEvent: (event: LogicDetectionEvent) => void;
  onSignal?: ((pieceId: string, kind: LogicSignalKind) => void | Promise<void>) | undefined;
}) {
  const piecesRef = useRef(input.pieces);
  const onEventRef = useRef(input.onEvent);
  const onSignalRef = useRef(input.onSignal);
  piecesRef.current = input.pieces;
  onEventRef.current = input.onEvent;
  onSignalRef.current = input.onSignal;

  const emit = useCallback((piece: BuildLogicPiece, kind: LogicSignalKind) => {
    const event: LogicDetectionEvent = {
      pieceId: piece.id,
      kind,
      pieceKind: piece.kind,
      at: Date.now()
    };
    onEventRef.current(event);
    void onSignalRef.current?.(piece.id, kind);
  }, []);

  const lastFireAtRef = useRef(new Map<string, number>());

  const fireIfAllowed = useCallback(
    (piece: BuildLogicPiece, kind: LogicSignalKind) => {
      const key = `${piece.id}:${kind}`;
      const debounce = debounceMsFor(piece);
      const now = Date.now();
      const last = lastFireAtRef.current.get(key) ?? 0;
      if (now - last < debounce) return false;
      lastFireAtRef.current.set(key, now);
      emit(piece, kind);
      return true;
    },
    [emit]
  );

  const tryInteract = useCallback(() => {
    if (!input.enabled) return false;
    const state = input.getAvatarState();
    if (!state) return false;
    const piece = findNearestInteractableLogicPiece(piecesRef.current, state.position);
    if (!piece) return false;
    return fireIfAllowed(piece, "interact");
  }, [fireIfAllowed, input.enabled, input.getAvatarState]);

  const interactPiece = useCallback(
    (pieceId: string) => {
      if (!input.enabled) return false;
      const piece = piecesRef.current.find((p) => p.id === pieceId);
      if (!piece || !isInteractLogicKind(piece.kind)) return false;
      return fireIfAllowed(piece, "interact");
    },
    [fireIfAllowed, input.enabled]
  );

  useEffect(() => {
    if (!input.enabled) return;
    const stepOnActive = new Set<string>();
    const proximityActive = new Set<string>();
    const fire = (piece: BuildLogicPiece, kind: LogicSignalKind) => {
      fireIfAllowed(piece, kind);
    };

    let frame = 0;
    const tick = () => {
      const state = input.getAvatarState();
      if (state) {
        const { x, y, z } = state.position;
        const cell = avatarCellFromPosition(x, y, z);
        const onPieces = findStepOnLogicPieces(piecesRef.current, cell);
        const onIds = new Set(onPieces.map((piece) => piece.id));

        for (const id of [...stepOnActive]) {
          if (!onIds.has(id)) {
            stepOnActive.delete(id);
            const piece = piecesRef.current.find((p) => p.id === id);
            if (piece) fire(piece, "stepOff");
          }
        }
        for (const piece of onPieces) {
          if (!stepOnActive.has(piece.id)) {
            stepOnActive.add(piece.id);
            fire(piece, "stepOn");
          }
        }

        const zones = findProximityZonesContaining(piecesRef.current, x, z, cell.level);
        const zoneIds = new Set(zones.map((piece) => piece.id));
        for (const id of [...proximityActive]) {
          if (!zoneIds.has(id)) {
            proximityActive.delete(id);
            const piece = piecesRef.current.find((p) => p.id === id);
            if (piece) fire(piece, "proximityExit");
          }
        }
        for (const piece of zones) {
          if (!proximityActive.has(piece.id)) {
            proximityActive.add(piece.id);
            fire(piece, "proximityEnter");
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stepOnActive.clear();
      proximityActive.clear();
      lastFireAtRef.current.clear();
    };
  }, [fireIfAllowed, input.enabled, input.getAvatarState]);

  return { tryInteract, interactPiece };
}
