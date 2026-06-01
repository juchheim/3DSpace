"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AvatarStateMessage, BuildLogicPiece, LogicSignalKind } from "@3dspace/contracts";
import {
  avatarCellFromPosition,
  findNearestInteractableLogicPiece,
  findProximityZonesContaining,
  findStepOnLogicPieces,
  isInteractLogicKind,
  teleportTarget
} from "@3dspace/room-engine";

export type LogicDetectionEvent = {
  pieceId: string;
  kind: LogicSignalKind;
  pieceKind: BuildLogicPiece["kind"];
  at: number;
};

/** After landing from a teleporter, ignore step-on until the player leaves the pad. */
export const TELEPORTER_LANDING_SUPPRESS_MS = 750;

function debounceMsFor(piece: BuildLogicPiece) {
  return piece.config?.debounceMs ?? 250;
}

export function useLogicDetection(input: {
  enabled: boolean;
  pieces: BuildLogicPiece[];
  getAvatarState: () => AvatarStateMessage | null;
  onEvent: (event: LogicDetectionEvent) => void;
  onSignal?: ((pieceId: string, kind: LogicSignalKind) => void | Promise<void>) | undefined;
  onNearestInteractableChange?: ((piece: BuildLogicPiece | null) => void) | undefined;
}) {
  const piecesRef = useRef(input.pieces);
  const onEventRef = useRef(input.onEvent);
  const onSignalRef = useRef(input.onSignal);
  const onNearestRef = useRef(input.onNearestInteractableChange);
  piecesRef.current = input.pieces;
  onEventRef.current = input.onEvent;
  onSignalRef.current = input.onSignal;
  onNearestRef.current = input.onNearestInteractableChange;

  const lastFireAtRef = useRef(new Map<string, number>());
  const stepOnActiveRef = useRef(new Set<string>());
  const stepOnSuppressUntilRef = useRef(new Map<string, number>());

  /** Treat pads as already stepped-on (no stepOn signal) until `ms` elapses or the player leaves. */
  const suppressStepOn = useCallback((pieceIds: string[], ms = TELEPORTER_LANDING_SUPPRESS_MS) => {
    const until = Date.now() + ms;
    for (const id of pieceIds) {
      stepOnSuppressUntilRef.current.set(id, until);
      stepOnActiveRef.current.add(id);
    }
  }, []);

  const emit = useCallback(
    (piece: BuildLogicPiece, kind: LogicSignalKind) => {
      if (piece.kind === "teleporter" && kind === "stepOn") {
        const target = teleportTarget(piece, piecesRef.current);
        if (target) suppressStepOn([target.id]);
      }
      const event: LogicDetectionEvent = {
        pieceId: piece.id,
        kind,
        pieceKind: piece.kind,
        at: Date.now()
      };
      onEventRef.current(event);
      void onSignalRef.current?.(piece.id, kind);
    },
    [suppressStepOn]
  );

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
    if (!input.enabled) {
      onNearestRef.current?.(null);
      return;
    }
    const stepOnActive = stepOnActiveRef.current;
    const proximityActive = new Set<string>();
    let nearestId: string | null = null;
    const fire = (piece: BuildLogicPiece, kind: LogicSignalKind) => {
      fireIfAllowed(piece, kind);
    };

    let frame = 0;
    const tick = () => {
      const state = input.getAvatarState();
      if (state) {
        const { x, y, z } = state.position;
        const cell = avatarCellFromPosition(x, y, z);

        const nearest = findNearestInteractableLogicPiece(piecesRef.current, state.position);
        if ((nearest?.id ?? null) !== nearestId) {
          nearestId = nearest?.id ?? null;
          onNearestRef.current?.(nearest ?? null);
        }

        const onPieces = findStepOnLogicPieces(piecesRef.current, cell);
        const onIds = new Set(onPieces.map((piece) => piece.id));
        const now = Date.now();

        for (const id of [...stepOnActive]) {
          if (!onIds.has(id)) {
            stepOnActive.delete(id);
            stepOnSuppressUntilRef.current.delete(id);
            const piece = piecesRef.current.find((p) => p.id === id);
            if (piece) fire(piece, "stepOff");
          }
        }
        for (const piece of onPieces) {
          if (stepOnActive.has(piece.id)) continue;
          const suppressUntil = stepOnSuppressUntilRef.current.get(piece.id) ?? 0;
          if (now < suppressUntil) {
            stepOnActive.add(piece.id);
            continue;
          }
          stepOnActive.add(piece.id);
          fire(piece, "stepOn");
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
      stepOnSuppressUntilRef.current.clear();
      proximityActive.clear();
      lastFireAtRef.current.clear();
      onNearestRef.current?.(null);
    };
  }, [fireIfAllowed, input.enabled, input.getAvatarState]);

  return { tryInteract, interactPiece, suppressStepOn };
}
