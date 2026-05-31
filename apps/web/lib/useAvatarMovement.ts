"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type {
  AvatarStateMessage,
  BuildLogicPiece,
  BuildPiece,
  LogicState,
  Role,
  RoomManifest,
  Vector3,
  ViewMode
} from "@3dspace/contracts";
import {
  BUILD_ENABLE_EASED_FALL,
  BUILD_FALL_GRAVITY,
  clampXZToBounds,
  createAvatarState,
  createGroundHeightContext,
  floorYFromZ,
  groundHeightAt,
  selectSpawnPoint,
  transformLocalMovementToWorld,
  unprojectPointFrom2D,
  type GroundHeightContext,
  type WallCollider
} from "@3dspace/room-engine";
import {
  buildCollisionWallsCacheKey,
  resolveAvatarXZWithWalls,
  type CollisionWallsCache
} from "./avatar-movement-collision";
import { isKeyboardOwnedTarget } from "./isKeyboardOwnedTarget";

export function useAvatarMovement(input: {
  manifest: RoomManifest | null;
  participantId: string;
  role?: Role;
  occupiedPositions?: Vector3[];
  viewMode: ViewMode;
  cameraYawRef?: MutableRefObject<number>;
  media: { cameraEnabled: boolean; microphoneEnabled: boolean; speaking: boolean };
  lockedPosition?: Vector3 | null;
  walkSpeedMultiplier?: number;
  buildPiecesRef?: MutableRefObject<BuildPiece[]>;
  logicPiecesRef?: MutableRefObject<BuildLogicPiece[]>;
  logicNodesRef?: MutableRefObject<LogicState["nodes"]>;
}) {
  const [avatarState, setAvatarState] = useState<AvatarStateMessage | null>(null);
  const keys = useRef(new Set<string>());
  const touchVector = useRef({ x: 0, z: 0 });
  const stateRef = useRef<AvatarStateMessage | null>(null);
  const mediaRef = useRef(input.media);
  mediaRef.current = input.media;
  const lockedPositionRef = useRef<Vector3 | null>(input.lockedPosition ?? null);
  lockedPositionRef.current = input.lockedPosition ?? null;
  // Keep a mutable ref so the rAF loop always reads the latest value without restarting.
  const walkSpeedMultiplierRef = useRef(input.walkSpeedMultiplier ?? 1);
  walkSpeedMultiplierRef.current = input.walkSpeedMultiplier ?? 1;
  const collisionWallsKeyRef = useRef("");
  const collisionWallsRef = useRef<WallCollider[]>([]);
  const collisionWallsCache: CollisionWallsCache = {
    keyRef: collisionWallsKeyRef,
    wallsRef: collisionWallsRef
  };
  const groundHeightKeyRef = useRef("");
  const groundHeightContextRef = useRef<GroundHeightContext | null>(null);
  const verticalVelocityRef = useRef(0);

  function syncGroundHeightContext(manifest: NonNullable<typeof input.manifest>, pieces: BuildPiece[]) {
    const key = buildCollisionWallsCacheKey(manifest, pieces);
    const keyChanged = key !== groundHeightKeyRef.current;
    if (keyChanged) {
      groundHeightKeyRef.current = key;
      groundHeightContextRef.current = createGroundHeightContext(manifest, pieces);
    }
    return { ctx: groundHeightContextRef.current!, keyChanged };
  }

  function applyGroundHeight(
    manifest: NonNullable<typeof input.manifest>,
    pieces: BuildPiece[],
    position: { x: number; y: number; z: number },
    mode: "walk" | "snap" | "teleport" = "walk"
  ) {
    const { ctx } = syncGroundHeightContext(manifest, pieces);
    return {
      ...position,
      y: groundHeightAt(position.x, position.z, ctx, position.y, mode)
    };
  }

  useEffect(() => {
    if (!input.manifest) return;
    const buildPieces = input.buildPiecesRef?.current ?? [];
    const next = createAvatarState({
      manifest: input.manifest,
      participantId: input.participantId,
      ...(input.role ? { role: input.role } : {}),
      ...(input.occupiedPositions ? { occupiedPositions: input.occupiedPositions } : {}),
      viewMode: input.viewMode,
      ...(buildPieces.length > 0 ? { buildPieces } : {})
    });
    // 3D movement copies rotation from camera yaw each frame; initialize it from spawn facing.
    if (input.cameraYawRef) {
      input.cameraYawRef.current = next.rotation.y;
    }
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
      if (isKeyboardOwnedTarget(event.target)) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
        keys.current.add(event.code);
        event.preventDefault();
      }
    }

    function up(event: KeyboardEvent) {
      if (isKeyboardOwnedTarget(event.target)) return;
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
          const lockedPos = { x: locked.x, y: floorYFromZ(input.manifest!, locked.z), z: locked.z };
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
        // walkSpeedMultiplierRef: skin-driven multiplier (e.g. 0.38 for Mars low-gravity).
        // NOT applied to moveTo3DPoint teleports — teleporting slowly on Mars is wrong UX.
        const speed = 3.2 * walkSpeedMultiplierRef.current;
        const pieces = input.buildPiecesRef?.current ?? [];
        const { keyChanged: buildSurfacesChanged } = syncGroundHeightContext(input.manifest!, pieces);
        const rawNext = moving
          ? (() => {
              const { x, z } = clampXZToBounds(
                input.manifest!,
                current.position.x + (worldDelta.x / magnitude) * speed * deltaSeconds,
                current.position.z + (worldDelta.z / magnitude) * speed * deltaSeconds
              );
              return { x, y: current.position.y, z };
            })()
          : current.position;
        let resolved = rawNext;
        if (moving) {
          const collisionResolved = resolveAvatarXZWithWalls({
            manifest: input.manifest!,
            pieces,
            cache: collisionWallsCache,
            oldPos: { x: current.position.x, z: current.position.z },
            newPos: { x: rawNext.x, z: rawNext.z },
            avatarBaseY: current.position.y
          });
          resolved = { ...rawNext, x: collisionResolved.x, z: collisionResolved.z };
        }
        const groundMode = buildSurfacesChanged && pieces.length > 0 ? "snap" : "walk";
        let nextPosition = applyGroundHeight(input.manifest!, pieces, resolved, groundMode);
        if (BUILD_ENABLE_EASED_FALL && !buildSurfacesChanged) {
          const { ctx } = syncGroundHeightContext(input.manifest!, pieces);
          const groundY = groundHeightAt(resolved.x, resolved.z, ctx, resolved.y, "walk");
          if (current.position.y > groundY + 0.05) {
            verticalVelocityRef.current -= BUILD_FALL_GRAVITY * deltaSeconds;
            const easedY = Math.max(groundY, current.position.y + verticalVelocityRef.current * deltaSeconds);
            if (easedY <= groundY + 0.02) {
              verticalVelocityRef.current = 0;
            }
            nextPosition = { ...resolved, y: easedY };
          } else {
            verticalVelocityRef.current = 0;
          }
        } else if (buildSurfacesChanged) {
          verticalVelocityRef.current = 0;
        }
        let nextRotation = current.rotation;
        if (input.viewMode === "3d" && input.cameraYawRef) {
          nextRotation = { y: input.cameraYawRef.current };
        } else if (moving && input.viewMode === "2d") {
          nextRotation = { y: Math.atan2(worldDelta.x, worldDelta.z) };
        }
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
      const pieces = input.buildPiecesRef?.current ?? [];
      const projected = unprojectPointFrom2D(input.manifest, point);
      const nextPosition = applyGroundHeight(input.manifest, pieces, projected, "teleport");
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
      const current = stateRef.current;
      const { x: boundedX, z: boundedZ } = clampXZToBounds(input.manifest, point.x, point.z);
      const pieces = input.buildPiecesRef?.current ?? [];
      const collisionResolved = resolveAvatarXZWithWalls({
        manifest: input.manifest,
        pieces,
        cache: collisionWallsCache,
        oldPos: { x: current.position.x, z: current.position.z },
        newPos: { x: boundedX, z: boundedZ },
        avatarBaseY: current.position.y
      });
      const nextPosition = applyGroundHeight(
        input.manifest,
        pieces,
        {
          x: collisionResolved.x,
          y: current.position.y,
          z: collisionResolved.z
        },
        "teleport"
      );
      const nextRotationY = Math.atan2(nextPosition.x - current.position.x, nextPosition.z - current.position.z);
      if (input.cameraYawRef) input.cameraYawRef.current = nextRotationY;
      const next = {
        ...current,
        position: nextPosition,
        rotation: { y: nextRotationY },
        sentAt: Date.now(),
        movement: "walking" as const
      };
      stateRef.current = next;
      setAvatarState(next);
    },
    [input.manifest, input.cameraYawRef, input.buildPiecesRef]
  );

  const teleportToPosition = useCallback(
    (point: { x: number; y: number; z: number }) => {
      if (!input.manifest || !stateRef.current || lockedPositionRef.current) return;
      const pieces = input.buildPiecesRef?.current ?? [];
      const position = applyGroundHeight(input.manifest, pieces, point, "teleport");
      verticalVelocityRef.current = 0;
      const next = {
        ...stateRef.current,
        position,
        sentAt: Date.now(),
        movement: "idle" as const,
        viewMode: input.viewMode,
        media: mediaRef.current
      };
      stateRef.current = next;
      setAvatarState(next);
    },
    [input.manifest, input.buildPiecesRef, input.viewMode]
  );

  const returnToSpawn = useCallback(() => {
    if (!input.manifest || !stateRef.current || lockedPositionRef.current) return;
    const current = stateRef.current;
    const spawn = selectSpawnPoint({
      manifest: input.manifest,
      participantId: input.participantId,
      ...(input.role ? { role: input.role } : {}),
      ...(input.occupiedPositions ? { occupiedPositions: input.occupiedPositions } : {})
    });
    const pieces = input.buildPiecesRef?.current ?? [];
    const resolved = resolveAvatarXZWithWalls({
      manifest: input.manifest,
      pieces,
      cache: collisionWallsCache,
      oldPos: { x: current.position.x, z: current.position.z },
      newPos: { x: spawn.position.x, z: spawn.position.z },
      avatarBaseY: current.position.y
    });
    const position = applyGroundHeight(
      input.manifest,
      pieces,
      { x: resolved.x, y: spawn.position.y, z: resolved.z },
      "snap"
    );
    verticalVelocityRef.current = 0;
    const next = {
      ...stateRef.current,
      position,
      rotation: spawn.rotation,
      sentAt: Date.now(),
      movement: "idle" as const,
      viewMode: input.viewMode,
      media: mediaRef.current
    };
    if (input.cameraYawRef) input.cameraYawRef.current = spawn.rotation.y;
    stateRef.current = next;
    setAvatarState(next);
  }, [
    input.buildPiecesRef,
    input.cameraYawRef,
    input.manifest,
    input.occupiedPositions,
    input.participantId,
    input.role,
    input.viewMode
  ]);

  const getAvatarState = useCallback(() => stateRef.current, []);

  const tryMoveDelta = useCallback(
    (dx: number, dz: number) => {
      if (!input.manifest || !stateRef.current) return null;
      const current = stateRef.current;
      const pieces = input.buildPiecesRef?.current ?? [];
      const oldPos = { x: current.position.x, z: current.position.z };
      const requested = clampXZToBounds(input.manifest, oldPos.x + dx, oldPos.z + dz);
      const resolved = resolveAvatarXZWithWalls({
        manifest: input.manifest,
        pieces,
        cache: collisionWallsCache,
        logicPieces: input.logicPiecesRef?.current ?? [],
        logicNodes: input.logicNodesRef?.current ?? {},
        oldPos,
        newPos: requested,
        avatarBaseY: current.position.y
      });
      return {
        from: oldPos,
        requested,
        to: resolved,
        blocked: Math.hypot(resolved.x - requested.x, resolved.z - requested.z) > 0.05
      };
    },
    [input.buildPiecesRef, input.manifest]
  );

  return {
    avatarState,
    setTouchVector,
    moveTo2DPoint,
    moveTo3DPoint,
    returnToSpawn,
    getAvatarState,
    tryMoveDelta,
    teleportToPosition
  };
}
