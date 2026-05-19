"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { AvatarStateMessage, Role, RoomManifest, Vector3, ViewMode } from "@3dspace/contracts";
import { clampPositionToBounds, createAvatarState, transformLocalMovementToWorld, unprojectPointFrom2D } from "@3dspace/room-engine";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    const type = target.type.toLowerCase();
    const nonTextTypes = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "hidden", "image"]);
    return !nonTextTypes.has(type);
  }
  return false;
}

export function useAvatarMovement(input: {
  manifest: RoomManifest | null;
  participantId: string;
  role?: Role;
  occupiedPositions?: Vector3[];
  viewMode: ViewMode;
  cameraYawRef?: MutableRefObject<number>;
  media: { cameraEnabled: boolean; microphoneEnabled: boolean; speaking: boolean };
  lockedPosition?: Vector3 | null;
}) {
  const [avatarState, setAvatarState] = useState<AvatarStateMessage | null>(null);
  const keys = useRef(new Set<string>());
  const touchVector = useRef({ x: 0, z: 0 });
  const stateRef = useRef<AvatarStateMessage | null>(null);
  const mediaRef = useRef(input.media);
  mediaRef.current = input.media;
  const lockedPositionRef = useRef<Vector3 | null>(input.lockedPosition ?? null);
  lockedPositionRef.current = input.lockedPosition ?? null;

  useEffect(() => {
    if (!input.manifest) return;
    const next = createAvatarState({
      manifest: input.manifest,
      participantId: input.participantId,
      ...(input.role ? { role: input.role } : {}),
      ...(input.occupiedPositions ? { occupiedPositions: input.occupiedPositions } : {}),
      viewMode: input.viewMode
    });
    stateRef.current = next;
    setAvatarState(next);
  }, [input.manifest, input.participantId, input.role]);

  useEffect(() => {
    stateRef.current = stateRef.current
      ? {
          ...stateRef.current,
          viewMode: input.viewMode,
          media: mediaRef.current
        }
      : null;
    setAvatarState(stateRef.current);
  }, [input.viewMode, input.media.cameraEnabled, input.media.microphoneEnabled]);

  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
        keys.current.add(event.code);
        event.preventDefault();
      }
    }

    function up(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
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
        const locked = lockedPositionRef.current;
        if (locked) {
          const lockedPos = { x: locked.x, y: 0, z: locked.z };
          if (
            current.position.x !== lockedPos.x ||
            current.position.z !== lockedPos.z ||
            current.movement !== "idle"
          ) {
            const next = {
              ...current,
              sentAt: Date.now(),
              position: lockedPos,
              movement: "idle" as const,
              viewMode: input.viewMode,
              media: mediaRef.current
            };
            stateRef.current = next;
            setAvatarState(next);
          }
          frame = requestAnimationFrame(tick);
          return;
        }
        let localX = touchVector.current.x;
        let localZ = touchVector.current.z;
        if (keys.current.has("ArrowLeft") || keys.current.has("KeyA")) localX -= 1;
        if (keys.current.has("ArrowRight") || keys.current.has("KeyD")) localX += 1;
        if (keys.current.has("ArrowUp") || keys.current.has("KeyW")) localZ -= 1;
        if (keys.current.has("ArrowDown") || keys.current.has("KeyS")) localZ += 1;
        const movementYaw =
          input.viewMode === "3d" && input.cameraYawRef ? input.cameraYawRef.current : current.rotation.y;
        const worldDelta = transformLocalMovementToWorld(movementYaw, { x: localX, z: localZ });
        const magnitude = Math.hypot(worldDelta.x, worldDelta.z);
        const moving = magnitude > 0;
        const speed = 3.2;
        const nextPosition = moving
          ? clampPositionToBounds(input.manifest!, {
              x: current.position.x + (worldDelta.x / magnitude) * speed * deltaSeconds,
              y: 0,
              z: current.position.z + (worldDelta.z / magnitude) * speed * deltaSeconds
            })
          : current.position;
        const nextRotation =
          input.viewMode === "3d" && input.cameraYawRef
            ? { y: input.cameraYawRef.current }
            : current.rotation;
        const next = {
          ...current,
          sentAt: Date.now(),
          position: nextPosition,
          rotation: nextRotation,
          movement: moving ? ("walking" as const) : ("idle" as const),
          viewMode: input.viewMode,
          media: mediaRef.current
        };
        stateRef.current = next;
        setAvatarState(next);
      }
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [input.manifest, input.viewMode, input.cameraYawRef, input.media.cameraEnabled, input.media.microphoneEnabled]);

  const setTouchVector = useCallback((vector: { x: number; z: number }) => {
    touchVector.current = vector;
  }, []);

  const moveTo2DPoint = useCallback(
    (point: { x: number; y: number }) => {
      if (!input.manifest || !stateRef.current || lockedPositionRef.current) return;
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
      if (!input.manifest || !stateRef.current || lockedPositionRef.current) return;
      const nextPosition = clampPositionToBounds(input.manifest, { x: point.x, y: 0, z: point.z });
      const nextRotationY = Math.atan2(nextPosition.x - stateRef.current.position.x, nextPosition.z - stateRef.current.position.z);
      if (input.cameraYawRef) input.cameraYawRef.current = nextRotationY;
      const next = {
        ...stateRef.current,
        position: nextPosition,
        rotation: { y: nextRotationY },
        sentAt: Date.now(),
        movement: "walking" as const
      };
      stateRef.current = next;
      setAvatarState(next);
    },
    [input.manifest, input.cameraYawRef]
  );

  return { avatarState, setTouchVector, moveTo2DPoint, moveTo3DPoint };
}
