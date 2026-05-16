"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarStateMessage, RoomManifest, ViewMode } from "@3dspace/contracts";
import { clampPositionToBounds, createAvatarState, unprojectPointFrom2D } from "@3dspace/room-engine";

export function useAvatarMovement(input: {
  manifest: RoomManifest | null;
  participantId: string;
  viewMode: ViewMode;
  media: { cameraEnabled: boolean; microphoneEnabled: boolean; speaking: boolean };
}) {
  const [avatarState, setAvatarState] = useState<AvatarStateMessage | null>(null);
  const keys = useRef(new Set<string>());
  const touchVector = useRef({ x: 0, z: 0 });
  const stateRef = useRef<AvatarStateMessage | null>(null);

  useEffect(() => {
    if (!input.manifest) return;
    const next = createAvatarState({
      manifest: input.manifest,
      participantId: input.participantId,
      spawnIndex: input.participantId.length % input.manifest.spawnPoints.length,
      viewMode: input.viewMode
    });
    stateRef.current = next;
    setAvatarState(next);
  }, [input.manifest, input.participantId]);

  useEffect(() => {
    stateRef.current = stateRef.current
      ? {
          ...stateRef.current,
          viewMode: input.viewMode,
          media: input.media
        }
      : null;
    setAvatarState(stateRef.current);
  }, [input.viewMode, input.media.cameraEnabled, input.media.microphoneEnabled, input.media.speaking]);

  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
        keys.current.add(event.code);
        event.preventDefault();
      }
    }

    function up(event: KeyboardEvent) {
      keys.current.delete(event.code);
    }

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (!input.manifest) return;
    let frame = 0;
    let last = performance.now();

    function tick(now: number) {
      const deltaSeconds = Math.min((now - last) / 1000, 0.05);
      last = now;
      const current = stateRef.current;
      if (current) {
        let dx = touchVector.current.x;
        let dz = touchVector.current.z;
        if (keys.current.has("ArrowLeft") || keys.current.has("KeyA")) dx -= 1;
        if (keys.current.has("ArrowRight") || keys.current.has("KeyD")) dx += 1;
        if (keys.current.has("ArrowUp") || keys.current.has("KeyW")) dz -= 1;
        if (keys.current.has("ArrowDown") || keys.current.has("KeyS")) dz += 1;
        const magnitude = Math.hypot(dx, dz);
        const moving = magnitude > 0;
        const speed = 3.2;
        const nextPosition = moving
          ? clampPositionToBounds(input.manifest!, {
              x: current.position.x + (dx / magnitude) * speed * deltaSeconds,
              y: 0,
              z: current.position.z + (dz / magnitude) * speed * deltaSeconds
            })
          : current.position;
        const next = {
          ...current,
          sentAt: Date.now(),
          position: nextPosition,
          rotation: moving ? { y: Math.atan2(dx, dz) } : current.rotation,
          movement: moving ? ("walking" as const) : ("idle" as const),
          viewMode: input.viewMode,
          media: input.media
        };
        stateRef.current = next;
        setAvatarState(next);
      }
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [input.manifest, input.viewMode, input.media.cameraEnabled, input.media.microphoneEnabled, input.media.speaking]);

  const setTouchVector = useCallback((vector: { x: number; z: number }) => {
    touchVector.current = vector;
  }, []);

  const moveTo2DPoint = useCallback(
    (point: { x: number; y: number }) => {
      if (!input.manifest || !stateRef.current) return;
      const nextPosition = unprojectPointFrom2D(input.manifest, point);
      const next = {
        ...stateRef.current,
        position: nextPosition,
        rotation: { y: Math.atan2(nextPosition.x - stateRef.current.position.x, nextPosition.z - stateRef.current.position.z) },
        sentAt: Date.now(),
        movement: "walking" as const
      };
      stateRef.current = next;
      setAvatarState(next);
    },
    [input.manifest]
  );

  const moveTo3DPoint = useCallback(
    (point: { x: number; z: number }) => {
      if (!input.manifest || !stateRef.current) return;
      const nextPosition = clampPositionToBounds(input.manifest, { x: point.x, y: 0, z: point.z });
      const next = {
        ...stateRef.current,
        position: nextPosition,
        rotation: { y: Math.atan2(nextPosition.x - stateRef.current.position.x, nextPosition.z - stateRef.current.position.z) },
        sentAt: Date.now(),
        movement: "walking" as const
      };
      stateRef.current = next;
      setAvatarState(next);
    },
    [input.manifest]
  );

  return { avatarState, setTouchVector, moveTo2DPoint, moveTo3DPoint };
}
