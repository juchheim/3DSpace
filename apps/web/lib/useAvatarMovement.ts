"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type {
  PhysicsTuning,
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
  buildPhysicsWorldSpec,
  clampXZToBounds,
  createAvatarState,
  createGroundHeightContext,
  floorYFromZ,
  groundHeightAt,
  physicsWorldSpecCacheKey,
  resolveSpawnRotation,
  selectSpawnPoint,
  transformLocalMovementToWorld,
  unprojectPointFrom2D,
  type ColliderSpec,
  type GroundHeightContext,
  type WallCollider
} from "@3dspace/room-engine";
import {
  buildCollisionWallsCacheKey,
  resolveAvatarXZWithWalls,
  type CollisionWallsCache
} from "./avatar-movement-collision";
import {
  AVATAR_SPRINT_SPEED_MULTIPLIER,
  isSprinting,
  wantsSprintJump
} from "./avatarSprint";
import { isKeyboardOwnedTarget } from "./isKeyboardOwnedTarget";
import { PhysicsController } from "./physics/PhysicsController";
import type { PlacedChair } from "./usePlacedChairs";
import { isStaticColliderWorldAsset, worldAssetGlbUrl } from "./worldAssetCatalog";
import { loadWorldAssetColliderMesh, type WorldAssetColliderMesh } from "./worldAssetColliderMesh";
import { buildWorldAssetTrimeshColliderSpecs, worldAssetPhysicsCacheKey } from "./worldAssetPhysics";

/** Radians per second while Q (left) or E (right) is held past {@link AVATAR_KEYBOARD_TURN_HOLD_MS}. */
export const AVATAR_KEYBOARD_TURN_SPEED_RAD_PER_SEC = 2.75;
/** Hold Q/E this long before rotation starts (short taps stay interact-only for E in play mode). */
export const AVATAR_KEYBOARD_TURN_HOLD_MS = 120;
/** Max E-key hold on release that still counts as sit/stand (longer than turn threshold). */
export const AVATAR_KEYBOARD_INTERACT_MAX_HOLD_MS = 450;

export type TurnKeyCode = "KeyQ" | "KeyE";

export function keyboardYawDelta(
  keys: ReadonlySet<string>,
  deltaSeconds: number,
  nowMs: number,
  turnKeyDownAtMs: Readonly<Partial<Record<TurnKeyCode, number>>> = {}
): number {
  const turnLeft =
    keys.has("KeyQ") && nowMs - (turnKeyDownAtMs.KeyQ ?? nowMs) >= AVATAR_KEYBOARD_TURN_HOLD_MS;
  const turnRight =
    keys.has("KeyE") && nowMs - (turnKeyDownAtMs.KeyE ?? nowMs) >= AVATAR_KEYBOARD_TURN_HOLD_MS;
  if (turnLeft === turnRight) return 0;
  return (turnLeft ? 1 : -1) * AVATAR_KEYBOARD_TURN_SPEED_RAD_PER_SEC * deltaSeconds;
}

function physicsAirborneState(grounded: boolean, vy: number) {
  if (grounded) return "grounded" as const;
  return vy > 0.05 ? ("jumping" as const) : ("falling" as const);
}

function samePosition(a: Vector3, b: Vector3) {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** Backpedal in 3D: local +Z input while the avatar keeps facing camera yaw. */
export function locomotionReversed(viewMode: ViewMode, moving: boolean, localZ: number) {
  return moving && viewMode === "3d" && localZ > 0;
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
  /** When set with lockedPosition, keeps avatar yaw aligned (e.g. seated in a chair). */
  lockedRotationY?: number | null;
  walkSpeedMultiplier?: number;
  physicsTuning?: PhysicsTuning | undefined;
  buildPiecesRef?: MutableRefObject<BuildPiece[]>;
  logicPiecesRef?: MutableRefObject<BuildLogicPiece[]>;
  logicNodesRef?: MutableRefObject<LogicState["nodes"]>;
  worldAssetsRef?: MutableRefObject<PlacedChair[]>;
}) {
  const [avatarState, setAvatarState] = useState<AvatarStateMessage | null>(null);
  const keys = useRef(new Set<string>());
  const turnKeyDownAtMsRef = useRef<Partial<Record<TurnKeyCode, number>>>({});
  const touchVector = useRef({ x: 0, z: 0 });
  const stateRef = useRef<AvatarStateMessage | null>(null);
  const mediaRef = useRef(input.media);
  mediaRef.current = input.media;
  const lockedPositionRef = useRef<Vector3 | null>(input.lockedPosition ?? null);
  lockedPositionRef.current = input.lockedPosition ?? null;
  const lockedRotationYRef = useRef<number | null>(input.lockedRotationY ?? null);
  lockedRotationYRef.current = input.lockedRotationY ?? null;
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
  const physicsControllerRef = useRef<PhysicsController | null>(null);
  const physicsControllerInitRef = useRef<Promise<void> | null>(null);
  const physicsControllerGenerationRef = useRef(0);
  const physicsWorldSpecKeyRef = useRef("");
  const physicsWorldSpecRef = useRef<ColliderSpec[]>([]);
  const physicsColliderSyncKeyRef = useRef<string | null>(null);
  const worldAssetColliderMeshesRef = useRef<Map<string, WorldAssetColliderMesh>>(new Map());
  const worldAssetColliderMeshesGenerationRef = useRef(0);
  const jumpRequestedRef = useRef(false);
  const jumpSprintRef = useRef(false);

  function getBuildPieces() {
    return input.buildPiecesRef?.current ?? [];
  }

  function getLogicPieces() {
    return input.logicPiecesRef?.current ?? [];
  }

  function getLogicNodes() {
    return input.logicNodesRef?.current ?? {};
  }

  function getWorldAssets() {
    return input.worldAssetsRef?.current ?? [];
  }

  const pendingWorldAssetColliderLoadsRef = useRef(new Set<string>());

  /** Loads GLB triangle soup for catalog entries with `staticCollider: true` (required for scenes). */
  function ensureWorldAssetColliderMeshes(worldAssets: PlacedChair[]) {
    for (const asset of worldAssets) {
      if (!isStaticColliderWorldAsset(asset.slug)) continue;
      const glbUrl = worldAssetGlbUrl(asset.slug);
      if (worldAssetColliderMeshesRef.current.has(glbUrl)) continue;
      if (pendingWorldAssetColliderLoadsRef.current.has(glbUrl)) continue;
      pendingWorldAssetColliderLoadsRef.current.add(glbUrl);
      void loadWorldAssetColliderMesh(glbUrl)
        .then((mesh) => {
          pendingWorldAssetColliderLoadsRef.current.delete(glbUrl);
          worldAssetColliderMeshesRef.current.set(glbUrl, mesh);
          worldAssetColliderMeshesGenerationRef.current += 1;
        })
        .catch((error) => {
          pendingWorldAssetColliderLoadsRef.current.delete(glbUrl);
          console.error(`Failed to load world asset collider mesh ${glbUrl}`, error);
        });
    }
  }

  function syncPhysicsWorldSpec(
    manifest: NonNullable<typeof input.manifest>,
    pieces: BuildPiece[],
    logicPieces: BuildLogicPiece[],
    logicNodes: LogicState["nodes"],
    worldAssets: PlacedChair[]
  ) {
    const baseKey = physicsWorldSpecCacheKey(manifest, pieces, { pieces: logicPieces, nodes: logicNodes });
    const meshReadyByUrl = new Map<string, boolean>();
    for (const asset of worldAssets) {
      if (!isStaticColliderWorldAsset(asset.slug)) continue;
      const glbUrl = worldAssetGlbUrl(asset.slug);
      meshReadyByUrl.set(glbUrl, worldAssetColliderMeshesRef.current.has(glbUrl));
    }
    const assetKey = worldAssetPhysicsCacheKey(worldAssets, meshReadyByUrl);
    const key = `${baseKey}::${assetKey}::meshgen:${worldAssetColliderMeshesGenerationRef.current}`;
    if (key !== physicsWorldSpecKeyRef.current) {
      physicsWorldSpecKeyRef.current = key;
      const meshByUrl = worldAssetColliderMeshesRef.current;
      physicsWorldSpecRef.current = [
        ...buildPhysicsWorldSpec(manifest, pieces, { pieces: logicPieces, nodes: logicNodes }),
        ...buildWorldAssetTrimeshColliderSpecs(worldAssets, meshByUrl)
      ];
    }
    return { key, spec: physicsWorldSpecRef.current };
  }

  function physicsEnabled() {
    return Boolean(input.physicsTuning?.enabled) && input.viewMode === "3d";
  }

  function disposePhysicsController() {
    physicsControllerGenerationRef.current += 1;
    physicsControllerInitRef.current = null;
    physicsControllerRef.current?.dispose();
    physicsControllerRef.current = null;
    physicsColliderSyncKeyRef.current = null;
    jumpRequestedRef.current = false;
  }

  function ensurePhysicsController(
    manifest: NonNullable<typeof input.manifest>,
    current: AvatarStateMessage,
    tuning: PhysicsTuning
  ) {
    if (physicsControllerRef.current || physicsControllerInitRef.current) return;
    const generation = physicsControllerGenerationRef.current;
    const pieces = getBuildPieces();
    const logicPieces = getLogicPieces();
    const logicNodes = getLogicNodes();
    const worldAssets = getWorldAssets();
    ensureWorldAssetColliderMeshes(worldAssets);
    const { spec, key } = syncPhysicsWorldSpec(manifest, pieces, logicPieces, logicNodes, worldAssets);
    physicsControllerInitRef.current = PhysicsController.create({
      tuning,
      spec,
      cacheKey: key,
      initialPosition: current.position
    })
      .then((controller) => {
        if (physicsControllerGenerationRef.current !== generation) {
          controller.dispose();
          return;
        }
        physicsControllerRef.current = controller;
        physicsColliderSyncKeyRef.current = key;
        const latestPosition = stateRef.current?.position ?? current.position;
        if (!samePosition(latestPosition, current.position)) {
          controller.setPosition(latestPosition);
        }
      })
      .finally(() => {
        if (physicsControllerGenerationRef.current === generation) {
          physicsControllerInitRef.current = null;
        }
      });
  }

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
      if (event.code === "Space") {
        if (!event.repeat && physicsEnabled()) {
          jumpRequestedRef.current = true;
          jumpSprintRef.current = wantsSprintJump(keys.current, touchVector.current);
        }
        if (physicsEnabled()) {
          event.preventDefault();
        }
        return;
      }
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        keys.current.add(event.code);
        return;
      }
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"].includes(
          event.code
        )
      ) {
        keys.current.add(event.code);
        if ((event.code === "KeyQ" || event.code === "KeyE") && !event.repeat) {
          turnKeyDownAtMsRef.current[event.code] = performance.now();
        }
        event.preventDefault();
      }
    }

    function up(event: KeyboardEvent) {
      if (isKeyboardOwnedTarget(event.target)) return;
      keys.current.delete(event.code);
      if (event.code === "KeyQ" || event.code === "KeyE") {
        delete turnKeyDownAtMsRef.current[event.code];
      }
    }

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [input.physicsTuning?.enabled, input.viewMode]);

  useEffect(() => {
    if (!input.manifest || !physicsEnabled()) {
      disposePhysicsController();
      return;
    }

    return () => {
      disposePhysicsController();
    };
  }, [input.manifest, input.viewMode, input.physicsTuning?.enabled]);

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
          const lockedRotY = lockedRotationYRef.current ?? current.rotation.y;
          if (physicsEnabled() && input.physicsTuning) {
            if (physicsControllerRef.current) {
              physicsControllerRef.current.setPosition(lockedPos);
            } else {
              ensurePhysicsController(input.manifest!, current, input.physicsTuning);
            }
          }
          if (
            current.position.x !== lockedPos.x ||
            current.position.z !== lockedPos.z ||
            current.rotation.y !== lockedRotY ||
            current.movement !== "idle"
          ) {
            const next = {
              ...current,
              sentAt: Date.now(),
              position: lockedPos,
              rotation: { y: lockedRotY },
              movement: "idle" as const,
              locomotionReversed: false,
              airborneState: "grounded" as const,
              viewMode: input.viewMode,
              media: mediaRef.current
            };
            if (input.cameraYawRef && lockedRotationYRef.current !== null) {
              input.cameraYawRef.current = lockedRotY;
            }
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

        let avatarYaw =
          input.viewMode === "3d" && input.cameraYawRef ? input.cameraYawRef.current : current.rotation.y;
        const turnDelta = keyboardYawDelta(keys.current, deltaSeconds, now, turnKeyDownAtMsRef.current);
        if (turnDelta !== 0) {
          avatarYaw += turnDelta;
          if (input.cameraYawRef) {
            input.cameraYawRef.current = avatarYaw;
          }
        }
        const movementYaw = avatarYaw;
        const keyboardTurning = turnDelta !== 0;
        const worldDelta = transformLocalMovementToWorld(movementYaw, { x: localX, z: localZ });
        const magnitude = Math.hypot(worldDelta.x, worldDelta.z);
        const moving = magnitude > 0;
        const sprinting = isSprinting(keys.current, touchVector.current, moving);
        const pieces = getBuildPieces();
        const logicPieces = getLogicPieces();
        const logicNodes = getLogicNodes();

        if (physicsEnabled() && input.physicsTuning) {
          if (!physicsControllerRef.current) {
            ensurePhysicsController(input.manifest!, current, input.physicsTuning);
          } else {
            const worldAssets = getWorldAssets();
            ensureWorldAssetColliderMeshes(worldAssets);
            const { spec, key } = syncPhysicsWorldSpec(
              input.manifest!,
              pieces,
              logicPieces,
              logicNodes,
              worldAssets
            );
            physicsControllerRef.current.setTuning(input.physicsTuning);
            if (physicsColliderSyncKeyRef.current !== key) {
              physicsControllerRef.current.syncColliders(spec, key);
              physicsColliderSyncKeyRef.current = key;
            }
            if (jumpRequestedRef.current) {
              physicsControllerRef.current.requestJump(jumpSprintRef.current);
              jumpRequestedRef.current = false;
              jumpSprintRef.current = false;
            }
            const out = physicsControllerRef.current.step({
              moveX: worldDelta.x,
              moveZ: worldDelta.z,
              dtSeconds: deltaSeconds,
              sprinting
            });
            let nextPosition = out.position;
            if (pieces.length > 0 && (out.grounded || out.vy <= 0)) {
              nextPosition = applyGroundHeight(input.manifest!, pieces, out.position, "walk");
            }
            const next = {
              ...current,
              sentAt: Date.now(),
              position: nextPosition,
              rotation: { y: avatarYaw },
              movement: moving ? (sprinting ? ("running" as const) : ("walking" as const)) : ("idle" as const),
              locomotionReversed: locomotionReversed(input.viewMode, moving, localZ),
              airborneState: physicsAirborneState(out.grounded, out.vy),
              viewMode: input.viewMode,
              media: mediaRef.current
            };
            stateRef.current = next;
            setAvatarState(next);
            frame = requestAnimationFrame(tick);
            return;
          }
        }
        // walkSpeedMultiplierRef: skin-driven multiplier (e.g. 0.38 for Mars low-gravity).
        // NOT applied to moveTo3DPoint teleports — teleporting slowly on Mars is wrong UX.
        const speed =
          3.2 * walkSpeedMultiplierRef.current * (sprinting ? AVATAR_SPRINT_SPEED_MULTIPLIER : 1);
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
            logicPieces,
            logicNodes,
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
        let nextRotation = { y: avatarYaw };
        if (!keyboardTurning && moving && input.viewMode === "2d") {
          nextRotation = { y: Math.atan2(worldDelta.x, worldDelta.z) };
        }
        const next = {
          ...current,
          sentAt: Date.now(),
          position: nextPosition,
          rotation: nextRotation,
          movement: moving ? (sprinting ? ("running" as const) : ("walking" as const)) : ("idle" as const),
          locomotionReversed: locomotionReversed(input.viewMode, moving, localZ),
          airborneState: undefined,
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
  }, [
    input.manifest,
    input.viewMode,
    input.cameraYawRef,
    input.media.cameraEnabled,
    input.media.microphoneEnabled,
    input.physicsTuning
  ]);

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
        movement: "walking" as const,
        airborneState: undefined
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
        logicPieces: input.logicPiecesRef?.current ?? [],
        logicNodes: input.logicNodesRef?.current ?? {},
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
        movement: "walking" as const,
        airborneState: physicsEnabled() ? "grounded" as const : undefined
      };
      if (physicsEnabled() && physicsControllerRef.current) {
        physicsControllerRef.current.setPosition(nextPosition);
      }
      stateRef.current = next;
      setAvatarState(next);
    },
    [input.manifest, input.cameraYawRef, input.buildPiecesRef, input.viewMode, input.physicsTuning?.enabled]
  );

  const teleportToPosition = useCallback(
    (point: { x: number; y: number; z: number }, rotationY?: number) => {
      if (!input.manifest || !stateRef.current) return;
      const pieces = input.buildPiecesRef?.current ?? [];
      const position = applyGroundHeight(input.manifest, pieces, point, "teleport");
      verticalVelocityRef.current = 0;
      jumpRequestedRef.current = false;
      const next = {
        ...stateRef.current,
        position,
        ...(rotationY !== undefined ? { rotation: { y: rotationY } } : {}),
        sentAt: Date.now(),
        movement: "idle" as const,
        airborneState: physicsEnabled() ? "grounded" as const : undefined,
        viewMode: input.viewMode,
        media: mediaRef.current
      };
      if (rotationY !== undefined && input.cameraYawRef) {
        input.cameraYawRef.current = rotationY;
      }
      if (physicsEnabled() && physicsControllerRef.current) {
        physicsControllerRef.current.setPosition(position);
      }
      stateRef.current = next;
      setAvatarState(next);
    },
    [input.cameraYawRef, input.manifest, input.buildPiecesRef, input.viewMode, input.physicsTuning?.enabled]
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
      logicPieces: input.logicPiecesRef?.current ?? [],
      logicNodes: input.logicNodesRef?.current ?? {},
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
    jumpRequestedRef.current = false;
    const rotation = resolveSpawnRotation(input.manifest, position);
    const next = {
      ...stateRef.current,
      position,
      rotation,
      sentAt: Date.now(),
      movement: "idle" as const,
      airborneState: physicsEnabled() ? "grounded" as const : undefined,
      viewMode: input.viewMode,
      media: mediaRef.current
    };
    if (input.cameraYawRef) input.cameraYawRef.current = rotation.y;
    if (physicsEnabled() && physicsControllerRef.current) {
      physicsControllerRef.current.setPosition(position);
    }
    stateRef.current = next;
    setAvatarState(next);
  }, [
    input.buildPiecesRef,
    input.cameraYawRef,
    input.manifest,
    input.occupiedPositions,
    input.participantId,
    input.role,
    input.viewMode,
    input.physicsTuning?.enabled
  ]);

  const getAvatarState = useCallback(() => stateRef.current, []);

  const requestJump = useCallback(() => {
    if (!physicsEnabled()) return;
    jumpRequestedRef.current = true;
  }, [input.physicsTuning?.enabled, input.viewMode]);

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
    teleportToPosition,
    requestJump
  };
}
