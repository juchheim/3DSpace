"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Edges, Grid, Html } from "@react-three/drei";
import type { BuildPiece, BuildPieceKind, RoomManifest } from "@3dspace/contracts";
import type { ThreeEvent } from "@react-three/fiber";
import {
  BUILD_CELL_SIZE,
  BUILD_FLOOR_THICKNESS,
  BUILD_PLACEMENT_RATE_LIMIT_MS,
  buildPieceStableId,
  isBuildFloorPieceKind,
  levelToY,
  worldToCell
} from "@3dspace/room-engine";
import { getBuildStamp, stampToPlacementTargets } from "../lib/buildStamps";
import {
  avatarStandingLevel,
  buildPlacementPreviewPiece,
  buildPlacementStatusMessage,
  checkBuildCapsForPlacements,
  evaluateBuildPlacement,
  placementTargetKey,
  resolveBuildPlacementTarget,
  type BuildPlacementTarget
} from "../lib/buildPlacement";
import type { BuildModeController, BuildTool } from "../lib/useBuildMode";
import { BuildLayer } from "./BuildLayer";
import { BuildPieceMesh } from "./BuildPieceMesh";

const DRAG_BATCH_INTERVAL_MS = BUILD_PLACEMENT_RATE_LIMIT_MS;
const GHOST_TRAIL_MAX = 4;
const GRID_RADIUS_CELLS = 8;
const DRAG_CLICK_SUPPRESS_MS = 250;
/** Max cells per side of an image-floor drag rectangle (keeps preview evaluation cheap). */
const IMAGE_FLOOR_RECT_MAX_SPAN = 24;

/** Drag-rectangle preview for the image-floor tool. */
type ImageFloorRectGhost = {
  minIx: number;
  maxIx: number;
  minIz: number;
  maxIz: number;
  level: number;
  /** Cells that would actually be placed (occupied same-texture cells are skipped). */
  placeableCount: number;
  totalCount: number;
  valid: boolean;
  reason?: string | undefined;
};

type BuildActions = {
  place(
    kind: BuildPieceKind,
    cell: { ix: number; iz: number },
    level: number,
    edge?: import("@3dspace/contracts").BuildPieceEdge,
    rotation?: import("@3dspace/contracts").BuildPieceRotation,
    materialId?: import("@3dspace/contracts").BuildPieceMaterial,
    textureStorageKey?: string
  ): Promise<unknown>;
  placeBatch(
    placements: Array<{
      kind: BuildPieceKind;
      cell: { ix: number; iz: number };
      level: number;
      edge?: import("@3dspace/contracts").BuildPieceEdge;
      rotation?: import("@3dspace/contracts").BuildPieceRotation;
      materialId?: import("@3dspace/contracts").BuildPieceMaterial;
      textureStorageKey?: string;
    }>
  ): Promise<unknown>;
  destroy(pieceId: string): Promise<unknown>;
};

function pieceFromIntersection(event: ThreeEvent<PointerEvent>): BuildPiece | null {
  let object = event.object;
  while (object) {
    if (object.userData?.buildPiece) {
      return object.userData.buildPiece as BuildPiece;
    }
    object = object.parent as typeof object;
  }
  return null;
}

export function BuildPlacementController({
  manifest,
  roomId,
  userId,
  buildMode,
  pieces,
  piecesById,
  localAvatarPosition,
  actions,
  onStatus,
  boardPlacementPassthrough = false,
  placementSuspended = false
}: {
  manifest: RoomManifest;
  roomId: string;
  userId: string;
  buildMode: BuildModeController;
  pieces: BuildPiece[];
  piecesById: Record<string, BuildPiece>;
  localAvatarPosition: { x: number; y: number; z: number };
  actions: BuildActions;
  onStatus?(message: string): void;
  boardPlacementPassthrough?: boolean;
  /** When true, render pieces only — world-asset placement owns pointer input. */
  placementSuspended?: boolean;
}) {
  const [ghost, setGhost] = useState<{ pieces: BuildPiece[]; valid: boolean; reason?: string } | null>(null);
  const stampMode = Boolean(buildMode.selectedStampId);
  const activeStamp = buildMode.selectedStampId ? getBuildStamp(buildMode.selectedStampId) : undefined;
  const [ghostTrail, setGhostTrail] = useState<BuildPiece[]>([]);
  const [highlightedPieceId, setHighlightedPieceId] = useState<string | null>(null);
  const dragTargetsRef = useRef<Map<string, BuildPlacementTarget>>(new Map());
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const lastBatchAtRef = useRef(0);
  const lastSinglePlaceAtRef = useRef(0);
  const pendingBatchRef = useRef<BuildPlacementTarget[]>([]);
  const lastTrailKeyRef = useRef("");
  // Image-floor tool: click-drag sweeps out a rectangle of tiles committed on release.
  const imageFloorRectMode = buildMode.tool === "image-floor" && !stampMode;
  const floorTextureKey = buildMode.tool === "image-floor" ? buildMode.floorTexture?.storageKey : undefined;
  const rectAnchorRef = useRef<{ ix: number; iz: number; level: number } | null>(null);
  const rectTargetsRef = useRef<BuildPlacementTarget[]>([]);
  const [rectGhost, setRectGhost] = useState<ImageFloorRectGhost | null>(null);

  const planeSize = useMemo(
    () =>
      [
        Math.max(manifest.dimensions.width, manifest.bounds.maxX - manifest.bounds.minX) + 8,
        Math.max(manifest.dimensions.depth, manifest.bounds.maxZ - manifest.bounds.minZ) + 8
      ] as [number, number],
    [manifest]
  );

  // Raise the build plane to the level the avatar is standing on. With a single ground-level
  // plane, the floor you stand on occludes the ground point of the cell at its edge, so the
  // nearest cell is unreachable; lifting the plane to your level makes that cell selectable.
  // Destroy keeps the plane at the ground so it never occludes lower pieces you want to remove.
  const standingLevel = avatarStandingLevel(localAvatarPosition.y);
  const placementPlaneY = buildMode.tool === "destroy" && !stampMode ? 0 : levelToY(standingLevel);

  const gridCenter = useMemo(
    () =>
      [
        Math.round(localAvatarPosition.x / BUILD_CELL_SIZE) * BUILD_CELL_SIZE,
        placementPlaneY + 0.02,
        Math.round(localAvatarPosition.z / BUILD_CELL_SIZE) * BUILD_CELL_SIZE
      ] as [number, number, number],
    [localAvatarPosition.x, localAvatarPosition.z, placementPlaneY]
  );

  const previewPlacement = useCallback(
    (target: BuildPlacementTarget) => {
      const augmentedPieces: Record<string, BuildPiece> = { ...piecesById };
      for (const pending of pendingBatchRef.current) {
        const previewPiece = buildPlacementPreviewPiece(roomId, pending, userId);
        augmentedPieces[previewPiece.id] = previewPiece;
      }
      return evaluateBuildPlacement(manifest, target, roomId, userId, augmentedPieces);
    },
    [manifest, piecesById, roomId, userId]
  );

  const stampTargetsFromHit = useCallback(
    (hitX: number, hitZ: number): BuildPlacementTarget[] => {
      if (!activeStamp) return [];
      const anchor = worldToCell(hitX, hitZ);
      return stampToPlacementTargets(activeStamp, anchor, buildMode.rotation, buildMode.materialId);
    },
    [activeStamp, buildMode.materialId, buildMode.rotation]
  );

  const evaluateStampTargets = useCallback(
    (targets: BuildPlacementTarget[]) => {
      const augmentedPieces: Record<string, BuildPiece> = { ...piecesById };
      const previews: BuildPiece[] = [];
      let firstReason: string | undefined;
      let allAllowed = true;
      for (const target of targets) {
        const preview = buildPlacementPreviewPiece(roomId, target, userId);
        previews.push(preview);
        augmentedPieces[preview.id] = preview;
      }
      for (const target of targets) {
        const result = evaluateBuildPlacement(manifest, target, roomId, userId, augmentedPieces);
        if (!result.allowed) {
          allAllowed = false;
          firstReason ??= result.reason;
        }
      }
      const capCheck = checkBuildCapsForPlacements(Object.values(piecesById), userId, targets);
      if (!capCheck.ok) {
        allAllowed = false;
        firstReason ??= capCheck.reason;
      }
      return { previews, allowed: allAllowed, reason: firstReason };
    },
    [manifest, piecesById, roomId, userId]
  );

  const targetFromHit = useCallback(
    (
      tool: Exclude<BuildTool, "destroy">,
      hitX: number,
      hitY: number,
      hitZ: number,
      surfacePiece: BuildPiece | null
    ): BuildPlacementTarget => {
      // Include in-flight (not-yet-committed) drag pieces so a wall aligns to the run being
      // dragged, not just to walls the server has already confirmed.
      const existingPieces: Record<string, BuildPiece> = { ...piecesById };
      for (const pending of pendingBatchRef.current) {
        const previewPiece = buildPlacementPreviewPiece(roomId, pending, userId);
        existingPieces[previewPiece.id] = previewPiece;
      }
      return resolveBuildPlacementTarget({
        tool,
        hitX,
        hitY,
        hitZ,
        rotation: buildMode.rotation,
        materialId: buildMode.materialId,
        surfacePiece,
        rampRotationOverride: buildMode.rampRotationOverride,
        ...(tool === "image-floor" && floorTextureKey ? { textureStorageKey: floorTextureKey } : {}),
        // The raycast `hitY` is the ground under the cursor; the level we build at when the
        // cursor lands on empty ground comes from where the avatar is standing.
        baseLevel: avatarStandingLevel(localAvatarPosition.y),
        // Avatar X/Z let a placed wall orient its front toward the player.
        avatarX: localAvatarPosition.x,
        avatarZ: localAvatarPosition.z,
        existingPieces
      });
    },
    [
      buildMode.materialId,
      buildMode.rampRotationOverride,
      buildMode.rotation,
      floorTextureKey,
      localAvatarPosition.x,
      localAvatarPosition.y,
      localAvatarPosition.z,
      piecesById,
      roomId,
      userId
    ]
  );

  /**
   * Recompute the image-floor drag rectangle between the anchor cell and the cursor cell.
   * Cells already covered by the same texture are skipped silently so sweeping across an
   * existing region simply extends it; cells blocked for other reasons surface a message.
   */
  const updateImageFloorRect = useCallback(
    (cursorIx: number, cursorIz: number) => {
      const anchor = rectAnchorRef.current;
      if (!anchor) return;
      const clampSpan = (value: number, from: number) =>
        Math.max(from - (IMAGE_FLOOR_RECT_MAX_SPAN - 1), Math.min(from + (IMAGE_FLOOR_RECT_MAX_SPAN - 1), value));
      const cursorX = clampSpan(cursorIx, anchor.ix);
      const cursorZ = clampSpan(cursorIz, anchor.iz);
      const minIx = Math.min(anchor.ix, cursorX);
      const maxIx = Math.max(anchor.ix, cursorX);
      const minIz = Math.min(anchor.iz, cursorZ);
      const maxIz = Math.max(anchor.iz, cursorZ);

      const targets: BuildPlacementTarget[] = [];
      let blockedReason: string | undefined;
      let totalCount = 0;
      for (let iz = minIz; iz <= maxIz; iz++) {
        for (let ix = minIx; ix <= maxIx; ix++) {
          totalCount += 1;
          const target: BuildPlacementTarget = {
            kind: "image-floor",
            cell: { ix, iz },
            level: anchor.level,
            rotation: buildMode.rotation,
            materialId: buildMode.materialId,
            ...(floorTextureKey ? { textureStorageKey: floorTextureKey } : {})
          };
          // A cell already holding this exact texture needs no re-upsert.
          const stableId = buildPieceStableId({ kind: "image-floor", cell: { ix, iz }, level: anchor.level });
          const existing = piecesById[stableId];
          if (
            existing?.kind === "image-floor" &&
            (existing.textureStorageKey ?? "") === (floorTextureKey ?? "")
          ) {
            continue;
          }
          const result = evaluateBuildPlacement(manifest, target, roomId, userId, piecesById);
          if (result.allowed) {
            targets.push(target);
          } else if (result.reason !== "slot-occupied") {
            blockedReason ??= result.reason;
          }
        }
      }

      let valid = Boolean(floorTextureKey);
      let reason: string | undefined;
      if (!floorTextureKey) {
        reason = "floor-texture-missing";
      } else if (targets.length > 0) {
        const capCheck = checkBuildCapsForPlacements(Object.values(piecesById), userId, targets);
        if (!capCheck.ok) {
          valid = false;
          reason = capCheck.reason;
        }
      }
      if (valid && blockedReason && targets.length === 0) {
        valid = false;
        reason = blockedReason;
      }

      rectTargetsRef.current = valid ? targets : [];
      setRectGhost({
        minIx,
        maxIx,
        minIz,
        maxIz,
        level: anchor.level,
        placeableCount: valid ? targets.length : 0,
        totalCount,
        valid,
        reason
      });
    },
    [buildMode.materialId, buildMode.rotation, floorTextureKey, manifest, piecesById, roomId, userId]
  );

  const commitImageFloorRect = useCallback(async () => {
    const targets = rectTargetsRef.current;
    const hadGhost = rectGhost;
    rectAnchorRef.current = null;
    rectTargetsRef.current = [];
    setRectGhost(null);
    if (!floorTextureKey) {
      onStatus?.(buildPlacementStatusMessage("floor-texture-missing"));
      return;
    }
    if (hadGhost && !hadGhost.valid) {
      onStatus?.(buildPlacementStatusMessage(hadGhost.reason));
      return;
    }
    if (targets.length === 0) {
      onStatus?.("Floor already covers that area.");
      return;
    }
    try {
      await actions.placeBatch(targets);
      onStatus?.(`Laid ${targets.length} floor tile${targets.length === 1 ? "" : "s"}.`);
    } catch (err) {
      onStatus?.(err instanceof Error ? err.message : "Unable to place floor tiles.");
    }
  }, [actions, floorTextureKey, onStatus, rectGhost]);

  const flushPendingBatch = useCallback(async () => {
    const batch = pendingBatchRef.current;
    pendingBatchRef.current = [];
    if (batch.length === 0) return;
    const capCheck = checkBuildCapsForPlacements(Object.values(piecesById), userId, batch);
    if (!capCheck.ok) {
      onStatus?.(buildPlacementStatusMessage(capCheck.reason));
      return;
    }
    try {
      await actions.placeBatch(batch);
      onStatus?.(`Placed ${batch.length} piece${batch.length === 1 ? "" : "s"}.`);
    } catch (err) {
      onStatus?.(err instanceof Error ? err.message : "Unable to place build pieces.");
    }
  }, [actions, onStatus, piecesById, userId]);

  const scheduleBatchPlacement = useCallback(
    (target: BuildPlacementTarget) => {
      const key = placementTargetKey(target);
      if (dragTargetsRef.current.has(key)) return;
      dragTargetsRef.current.set(key, target);
      pendingBatchRef.current.push(target);
      didDragRef.current = true;

      const now = Date.now();
      if (now - lastBatchAtRef.current >= DRAG_BATCH_INTERVAL_MS) {
        lastBatchAtRef.current = now;
        void flushPendingBatch();
      }
    },
    [flushPendingBatch]
  );

  const updateGhostFromHit = useCallback(
    (hitX: number, hitY: number, hitZ: number, surfacePiece: BuildPiece | null, tool: BuildTool) => {
      if (tool === "destroy" && !stampMode) {
        setGhost(null);
        return;
      }
      if (stampMode && activeStamp) {
        const stampResult = evaluateStampTargets(stampTargetsFromHit(hitX, hitZ));
        setGhost({
          pieces: stampResult.previews,
          valid: stampResult.allowed,
          ...(stampResult.reason ? { reason: stampResult.reason } : {})
        });
        return;
      }
      const target = targetFromHit(tool as Exclude<BuildTool, "destroy">, hitX, hitY, hitZ, surfacePiece);
      const preview = previewPlacement(target);
      // The image-floor tool needs an image picked first; show the ghost as blocked until then.
      const missingTexture = tool === "image-floor" && !floorTextureKey;
      setGhost({
        pieces: [preview.piece],
        valid: preview.allowed && !missingTexture,
        ...(missingTexture ? { reason: "floor-texture-missing" } : preview.reason ? { reason: preview.reason } : {})
      });
      if (draggingRef.current && preview.allowed && !stampMode) {
        const trailKey = placementTargetKey(target);
        if (trailKey !== lastTrailKeyRef.current) {
          lastTrailKeyRef.current = trailKey;
          setGhostTrail((prev) => [...prev, preview.piece].slice(-GHOST_TRAIL_MAX));
        }
      }
    },
    [activeStamp, evaluateStampTargets, floorTextureKey, previewPlacement, stampMode, stampTargetsFromHit, targetFromHit]
  );

  const tryDragPlacement = useCallback(
    (hitX: number, hitY: number, hitZ: number, surfacePiece: BuildPiece | null) => {
      // Image-floor drags sweep a rectangle committed on release instead of painting cells.
      if (!draggingRef.current || buildMode.tool === "destroy" || buildMode.tool === "image-floor" || stampMode)
        return;
      const target = targetFromHit(buildMode.tool, hitX, hitY, hitZ, surfacePiece);
      const preview = previewPlacement(target);
      if (preview.allowed) {
        scheduleBatchPlacement(target);
      }
    },
    [buildMode.tool, previewPlacement, scheduleBatchPlacement, stampMode, targetFromHit]
  );

  const handleSurfacePointer = useCallback(
    (event: ThreeEvent<PointerEvent>, surfacePiece: BuildPiece | null) => {
      if (!buildMode.enabled) return;
      event.stopPropagation();
      if (buildMode.tool === "destroy" && !stampMode) {
        if (surfacePiece) setHighlightedPieceId(surfacePiece.id);
        setGhost(null);
        return;
      }
      // When a floor/ramp above the standing level intercepts the ray, treat the hit as
      // landing on the placement plane at the current level instead of the upper surface.
      const effectivePiece =
        surfacePiece &&
        (isBuildFloorPieceKind(surfacePiece.kind) || surfacePiece.kind === "ramp") &&
        surfacePiece.level > standingLevel
          ? null
          : surfacePiece;
      const hitY = effectivePiece !== surfacePiece ? placementPlaneY : event.point.y;
      // While sweeping out an image-floor rectangle, the rect ghost replaces the cell ghost.
      if (imageFloorRectMode && draggingRef.current && rectAnchorRef.current) {
        const cursorCell = worldToCell(event.point.x, event.point.z);
        updateImageFloorRect(cursorCell.ix, cursorCell.iz);
        setGhost(null);
        return;
      }
      updateGhostFromHit(event.point.x, hitY, event.point.z, effectivePiece, buildMode.tool);
      tryDragPlacement(event.point.x, hitY, event.point.z, effectivePiece);
    },
    [
      buildMode.enabled,
      buildMode.tool,
      imageFloorRectMode,
      placementPlaneY,
      standingLevel,
      tryDragPlacement,
      updateGhostFromHit,
      updateImageFloorRect
    ]
  );

  const commitPlacement = useCallback(
    async (target: BuildPlacementTarget) => {
      const now = Date.now();
      if (now - lastSinglePlaceAtRef.current < BUILD_PLACEMENT_RATE_LIMIT_MS) {
        onStatus?.("Slow down…");
        return;
      }
      const preview = previewPlacement(target);
      if (!preview.allowed) {
        onStatus?.(preview.message ?? buildPlacementStatusMessage(preview.reason));
        return;
      }
      lastSinglePlaceAtRef.current = now;
      try {
        await actions.place(
          target.kind,
          target.cell,
          target.level,
          target.edge,
          target.rotation,
          target.materialId,
          target.textureStorageKey
        );
        onStatus?.("Piece placed.");
      } catch (err) {
        onStatus?.(err instanceof Error ? err.message : "Unable to place piece.");
      }
    },
    [actions, onStatus, previewPlacement]
  );

  const commitStampPlacement = useCallback(
    async (hitX: number, hitZ: number) => {
      const now = Date.now();
      if (now - lastSinglePlaceAtRef.current < BUILD_PLACEMENT_RATE_LIMIT_MS) {
        onStatus?.("Slow down…");
        return;
      }
      const targets = stampTargetsFromHit(hitX, hitZ);
      const stampResult = evaluateStampTargets(targets);
      if (!stampResult.allowed) {
        onStatus?.(buildPlacementStatusMessage(stampResult.reason));
        return;
      }
      lastSinglePlaceAtRef.current = now;
      try {
        await actions.placeBatch(targets);
        onStatus?.(`Placed stamp (${targets.length} pieces).`);
      } catch (err) {
        onStatus?.(err instanceof Error ? err.message : "Unable to place stamp.");
      }
    },
    [actions, evaluateStampTargets, onStatus, stampTargetsFromHit]
  );

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>, surfacePiece: BuildPiece | null) => {
      if (!buildMode.enabled || event.button !== 0) return;
      event.stopPropagation();
      if (buildMode.tool === "destroy" && !stampMode) return;
      draggingRef.current = true;
      didDragRef.current = false;
      dragTargetsRef.current.clear();
      pendingBatchRef.current = [];
      setGhostTrail([]);
      lastTrailKeyRef.current = "";
      const effectivePiece =
        surfacePiece &&
        (isBuildFloorPieceKind(surfacePiece.kind) || surfacePiece.kind === "ramp") &&
        surfacePiece.level > standingLevel
          ? null
          : surfacePiece;
      const hitY = effectivePiece !== surfacePiece ? placementPlaneY : event.point.y;
      if (imageFloorRectMode) {
        // Anchor the drag rectangle; level comes from the resolved target so the rect
        // sits on the surface under the cursor (or the standing level on empty ground).
        const anchorTarget = targetFromHit("image-floor", event.point.x, hitY, event.point.z, effectivePiece);
        rectAnchorRef.current = { ix: anchorTarget.cell.ix, iz: anchorTarget.cell.iz, level: anchorTarget.level };
        updateImageFloorRect(anchorTarget.cell.ix, anchorTarget.cell.iz);
        setGhost(null);
        return;
      }
      updateGhostFromHit(event.point.x, hitY, event.point.z, effectivePiece, buildMode.tool);
    },
    [
      buildMode.enabled,
      buildMode.tool,
      imageFloorRectMode,
      placementPlaneY,
      stampMode,
      standingLevel,
      targetFromHit,
      updateGhostFromHit,
      updateImageFloorRect
    ]
  );

  const handlePointerUp = useCallback(async () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (rectAnchorRef.current) {
      // Image-floor: the whole rectangle (even a single click's 1×1) commits here,
      // so the follow-up click event must not place a second piece.
      suppressClickUntilRef.current = Date.now() + DRAG_CLICK_SUPPRESS_MS;
      await commitImageFloorRect();
      return;
    }
    if (didDragRef.current) {
      suppressClickUntilRef.current = Date.now() + DRAG_CLICK_SUPPRESS_MS;
    }
    await flushPendingBatch();
    dragTargetsRef.current.clear();
    setGhostTrail([]);
    lastTrailKeyRef.current = "";
  }, [commitImageFloorRect, flushPendingBatch]);

  useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerUp]);

  // Abandon any in-progress rectangle when the tool or stamp selection changes.
  useEffect(() => {
    if (!imageFloorRectMode) {
      rectAnchorRef.current = null;
      rectTargetsRef.current = [];
      setRectGhost(null);
    }
  }, [imageFloorRectMode]);

  const handleClick = useCallback(
    async (event: ThreeEvent<MouseEvent>, surfacePiece: BuildPiece | null) => {
      if (!buildMode.enabled) return;
      event.stopPropagation();
      if (Date.now() < suppressClickUntilRef.current || didDragRef.current) {
        didDragRef.current = false;
        return;
      }

      if (buildMode.tool === "destroy" && !stampMode) {
        if (!surfacePiece) return;
        try {
          await actions.destroy(surfacePiece.id);
          onStatus?.("Piece removed.");
        } catch (err) {
          onStatus?.(err instanceof Error ? err.message : "Unable to remove piece.");
        }
        return;
      }

      if (stampMode) {
        await commitStampPlacement(event.point.x, event.point.z);
        return;
      }

      // Image-floor placement is committed by pointer-up (rectangle flow), never by click.
      if (imageFloorRectMode) return;

      // When a floor/ramp above the standing level intercepts the ray, treat the hit as
      // landing on the placement plane at the current level instead of the upper surface.
      const effectivePiece =
        surfacePiece &&
        (isBuildFloorPieceKind(surfacePiece.kind) || surfacePiece.kind === "ramp") &&
        surfacePiece.level > standingLevel
          ? null
          : surfacePiece;
      const hitY = effectivePiece !== surfacePiece ? placementPlaneY : event.point.y;

      const target = targetFromHit(
        buildMode.tool as Exclude<BuildTool, "destroy">,
        event.point.x,
        hitY,
        event.point.z,
        effectivePiece
      );
      await commitPlacement(target);
    },
    [
      actions,
      buildMode.enabled,
      buildMode.tool,
      commitPlacement,
      commitStampPlacement,
      imageFloorRectMode,
      onStatus,
      placementPlaneY,
      stampMode,
      standingLevel,
      targetFromHit
    ]
  );

  // Geometry for the image-floor drag-rectangle preview.
  const rectGhostBox = rectGhost
    ? (() => {
        const widthCells = rectGhost.maxIx - rectGhost.minIx + 1;
        const depthCells = rectGhost.maxIz - rectGhost.minIz + 1;
        return {
          centerX: ((rectGhost.minIx + rectGhost.maxIx) / 2 + 0.5) * BUILD_CELL_SIZE,
          centerZ: ((rectGhost.minIz + rectGhost.maxIz) / 2 + 0.5) * BUILD_CELL_SIZE,
          y: levelToY(rectGhost.level) + BUILD_FLOOR_THICKNESS / 2 + 0.01,
          width: widthCells * BUILD_CELL_SIZE,
          depth: depthCells * BUILD_CELL_SIZE,
          widthCells,
          depthCells
        };
      })()
    : null;

  if (!buildMode.enabled || placementSuspended) {
    return <BuildLayer pieces={pieces} pointerEventsPassThrough={boardPlacementPassthrough} />;
  }

  return (
    <group>
      <BuildLayer
        pieces={pieces}
        interactive
        highlightedPieceId={highlightedPieceId}
        onPiecePointerMove={(piece, event) => handleSurfacePointer(event, piece)}
        onPiecePointerOut={() => setHighlightedPieceId(null)}
        onPiecePointerDown={(piece, event) => handlePointerDown(event, piece)}
        onPieceClick={(piece, event) => void handleClick(event, piece)}
      />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, placementPlaneY + 0.001, 0]}
        onPointerMove={(event) => handleSurfacePointer(event, pieceFromIntersection(event))}
        onPointerOut={() => {
          setGhost(null);
          setHighlightedPieceId(null);
        }}
        onPointerDown={(event) => handlePointerDown(event, null)}
        onClick={(event) => void handleClick(event, null)}
      >
        <planeGeometry args={planeSize} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <Grid
        position={gridCenter}
        args={[GRID_RADIUS_CELLS * 2 * BUILD_CELL_SIZE, GRID_RADIUS_CELLS * 2 * BUILD_CELL_SIZE]}
        cellSize={BUILD_CELL_SIZE}
        cellThickness={0.6}
        sectionSize={BUILD_CELL_SIZE * 4}
        sectionThickness={1.1}
        fadeDistance={GRID_RADIUS_CELLS * BUILD_CELL_SIZE * 1.4}
        fadeStrength={1}
        infiniteGrid={false}
        cellColor="#7fd4a8"
        sectionColor="#b8ffe0"
      />

      {ghostTrail.map((piece, index) => (
        <BuildPieceMesh key={`${piece.id}-trail-${index}`} piece={piece} ghost valid trail />
      ))}

      {rectGhost && rectGhostBox ? (
        <group>
          <mesh position={[rectGhostBox.centerX, rectGhostBox.y, rectGhostBox.centerZ]}>
            <boxGeometry args={[rectGhostBox.width, BUILD_FLOOR_THICKNESS, rectGhostBox.depth]} />
            <meshStandardMaterial
              color={rectGhost.valid ? "#6dff9a" : "#ff6b6b"}
              transparent
              opacity={0.28}
              depthWrite={false}
            />
            <Edges color={rectGhost.valid ? "#6dff9a" : "#ff6b6b"} linewidth={2} />
          </mesh>
          <Html
            position={[rectGhostBox.centerX, rectGhostBox.y + 1.4, rectGhostBox.centerZ]}
            center
            distanceFactor={14}
          >
            <div className="build-ghost-tooltip">
              {rectGhost.valid
                ? `${rectGhostBox.widthCells * BUILD_CELL_SIZE}m × ${rectGhostBox.depthCells * BUILD_CELL_SIZE}m · ${
                    rectGhost.placeableCount
                  } new tile${rectGhost.placeableCount === 1 ? "" : "s"}`
                : buildPlacementStatusMessage(rectGhost.reason)}
            </div>
          </Html>
        </group>
      ) : null}

      {ghost ? (
        <group>
          {ghost.pieces.map((piece) => (
            <BuildPieceMesh key={`ghost-${piece.id}`} piece={piece} ghost valid={ghost.valid} />
          ))}
          {!ghost.valid && ghost.reason ? (
            <Html
              position={[
                ghost.pieces[0]!.cell.ix * BUILD_CELL_SIZE + BUILD_CELL_SIZE / 2,
                2.2,
                ghost.pieces[0]!.cell.iz * BUILD_CELL_SIZE + BUILD_CELL_SIZE / 2
              ]}
              center
              distanceFactor={14}
            >
              <div className="build-ghost-tooltip">{buildPlacementStatusMessage(ghost.reason)}</div>
            </Html>
          ) : null}
        </group>
      ) : null}
    </group>
  );
}
