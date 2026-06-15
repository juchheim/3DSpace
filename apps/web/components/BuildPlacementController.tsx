"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Edges, Grid, Html } from "@react-three/drei";
import type { BuildPiece, BuildPieceKind, RoomManifest } from "@3dspace/contracts";
import { DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS } from "@3dspace/contracts";
import type { ThreeEvent } from "@react-three/fiber";
import {
  BUILD_CELL_SIZE,
  BUILD_FLOOR_THICKNESS,
  BUILD_LEVEL_HEIGHT,
  BUILD_PLACEMENT_RATE_LIMIT_MS,
  buildPieceStableId,
  isBuildCellFixtureKind,
  isBuildFloorPieceKind,
  levelToY,
  worldToCell
} from "@3dspace/room-engine";
import { getBuildStamp, stampToPlacementTargets } from "../lib/buildStamps";
import {
  buildPlacementPreviewPiece,
  buildPlacementStatusMessage,
  checkBuildCapsForPlacements,
  evaluateBuildPlacement,
  findSurfacePieceAtCell,
  placementTargetKey,
  resolveBuildPlacementTarget,
  type BuildPlacementTarget
} from "../lib/buildPlacement";
import { useStablePlacementLevel } from "../lib/useStablePlacementLevel";
import type { BuildModeController, BuildTool } from "../lib/useBuildMode";
import { BuildLayer } from "./BuildLayer";
import { BuildPieceMesh } from "./BuildPieceMesh";

const DRAG_BATCH_INTERVAL_MS = BUILD_PLACEMENT_RATE_LIMIT_MS;
const GHOST_TRAIL_MAX = 4;
const GRID_RADIUS_CELLS = 8;
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
    textureStorageKey?: string,
    textureSpanCells?: import("@3dspace/contracts").ImageFloorTextureSpanCells
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
      textureSpanCells?: import("@3dspace/contracts").ImageFloorTextureSpanCells;
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

/** Raycast hit piece for placement — overhead fixtures ignore walls/ceilings and aim at the ceiling plane. */
function effectiveSurfacePiece(
  surfacePiece: BuildPiece | null,
  standingLevel: number,
  fixturePlacement: boolean
): BuildPiece | null {
  if (!surfacePiece) return null;
  if (fixturePlacement) {
    return isBuildFloorPieceKind(surfacePiece.kind) || surfacePiece.kind === "ramp" ? surfacePiece : null;
  }
  if (
    (isBuildFloorPieceKind(surfacePiece.kind) || surfacePiece.kind === "ramp") &&
    surfacePiece.level > standingLevel
  ) {
    return null;
  }
  return surfacePiece;
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
  // One-shot: a drag's trailing synthetic click must not place an extra single piece.
  // Set on drag-end, consumed by the very next click, and cleared on the next pointerdown
  // so it can never poison a later genuine click (the old time-window could under/over-shoot).
  const ignoreNextClickRef = useRef(false);
  const lastBatchAtRef = useRef(0);
  const lastSinglePlaceAtRef = useRef(0);
  // Key of the last committed single/stamp target — used to throttle only *repeat* commits of
  // the same target (double-fire guard), so distinct placements in quick succession all land.
  const lastSinglePlaceKeyRef = useRef<string | null>(null);
  const pendingBatchRef = useRef<BuildPlacementTarget[]>([]);
  const lastTrailKeyRef = useRef("");
  // The exact target the single-piece ghost is currently previewing. Committing
  // this (rather than re-deriving from the click's own raycast) guarantees the
  // click places precisely what the green ghost shows — the click ray can resolve
  // to a different surface/cell than the last hover did.
  const currentGhostTargetRef = useRef<BuildPlacementTarget | null>(null);
  // Image-floor tool: click-drag sweeps out a rectangle of tiles committed on release.
  const imageFloorRectMode = buildMode.tool === "image-floor" && !stampMode;
  const floorTextureKey = buildMode.tool === "image-floor" ? buildMode.floorTexture?.storageKey : undefined;
  const floorTextureSpanCells =
    buildMode.tool === "image-floor" ? buildMode.floorTextureSpanCells : undefined;
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
  const standingLevel = useStablePlacementLevel(localAvatarPosition.y);
  const fixturePlacementActive =
    buildMode.tool !== "destroy" && !stampMode && isBuildCellFixtureKind(buildMode.tool);
  const placementPlaneY =
    buildMode.tool === "destroy" && !stampMode
      ? 0
      : fixturePlacementActive
        ? levelToY(standingLevel) + BUILD_LEVEL_HEIGHT - 0.02
        : levelToY(standingLevel);

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
        ...(tool === "image-floor" && floorTextureSpanCells
          ? { textureSpanCells: floorTextureSpanCells }
          : {}),
        // The raycast `hitY` is the ground under the cursor; the level we build at when the
        // cursor lands on empty ground comes from where the avatar is standing.
        baseLevel: standingLevel,
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
      floorTextureSpanCells,
      localAvatarPosition.x,
      localAvatarPosition.z,
      piecesById,
      roomId,
      standingLevel,
      userId
    ]
  );

  /**
   * Resolve the surface piece (floor/ramp) under a world X/Z from the *cell*, not from
   * whichever mesh the ray physically struck. Hovering a piece-top vs the build plane used
   * to flip `surfacePiece` (and thus the level/edge) as the cursor crossed a piece edge,
   * making the ghost jump. Deriving the surface from the cell — the same way the 2D /
   * place-ahead paths do — keeps the ghost stable for a given cursor cell. The
   * `effectiveSurfacePiece` rule still drops floors/ramps above the standing level so you
   * build at your own level, not on an upper floor.
   */
  const resolveSurfaceForPlacement = useCallback(
    (worldX: number, worldZ: number): BuildPiece | null => {
      const cell = worldToCell(worldX, worldZ);
      const surface = findSurfacePieceAtCell(pieces, cell, localAvatarPosition.y);
      return effectiveSurfacePiece(surface, standingLevel, fixturePlacementActive);
    },
    [fixturePlacementActive, localAvatarPosition.y, pieces, standingLevel]
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
            ...(floorTextureKey ? { textureStorageKey: floorTextureKey } : {}),
            ...(floorTextureSpanCells ? { textureSpanCells: floorTextureSpanCells } : {})
          };
          // A cell already holding this exact texture + span needs no re-upsert.
          const stableId = buildPieceStableId({ kind: "image-floor", cell: { ix, iz }, level: anchor.level });
          const existing = piecesById[stableId];
          if (
            existing?.kind === "image-floor" &&
            (existing.textureStorageKey ?? "") === (floorTextureKey ?? "") &&
            (existing.textureSpanCells ?? DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS) === floorTextureSpanCells
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
    [buildMode.materialId, buildMode.rotation, floorTextureKey, floorTextureSpanCells, manifest, piecesById, roomId, userId]
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
        currentGhostTargetRef.current = null;
        setGhost(null);
        return;
      }
      if (stampMode && activeStamp) {
        currentGhostTargetRef.current = null;
        const stampResult = evaluateStampTargets(stampTargetsFromHit(hitX, hitZ));
        setGhost({
          pieces: stampResult.previews,
          valid: stampResult.allowed,
          ...(stampResult.reason ? { reason: stampResult.reason } : {})
        });
        return;
      }
      const target = targetFromHit(tool as Exclude<BuildTool, "destroy">, hitX, hitY, hitZ, surfacePiece);
      // Record the previewed target so a click commits exactly this, not a freshly
      // re-derived (and possibly different) target from the click's own raycast.
      currentGhostTargetRef.current = target;
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
        // Destroy still picks the exact piece the ray struck (you remove what you point at).
        if (surfacePiece) setHighlightedPieceId(surfacePiece.id);
        setGhost(null);
        return;
      }
      // Resolve the surface from the cursor cell (not the hit mesh) so the ghost is stable.
      // `hitY` is the build plane at the standing level; the level itself comes from the
      // resolved surface or `baseLevel`, so it no longer depends on `event.point.y`.
      const x = event.point.x;
      const z = event.point.z;
      const effectivePiece = resolveSurfaceForPlacement(x, z);
      // While sweeping out an image-floor rectangle, the rect ghost replaces the cell ghost.
      if (imageFloorRectMode && draggingRef.current && rectAnchorRef.current) {
        const cursorCell = worldToCell(x, z);
        updateImageFloorRect(cursorCell.ix, cursorCell.iz);
        setGhost(null);
        return;
      }
      updateGhostFromHit(x, placementPlaneY, z, effectivePiece, buildMode.tool);
      tryDragPlacement(x, placementPlaneY, z, effectivePiece);
    },
    [
      buildMode.enabled,
      buildMode.tool,
      imageFloorRectMode,
      placementPlaneY,
      resolveSurfaceForPlacement,
      stampMode,
      tryDragPlacement,
      updateGhostFromHit,
      updateImageFloorRect
    ]
  );

  const commitPlacement = useCallback(
    async (target: BuildPlacementTarget) => {
      const now = Date.now();
      const key = placementTargetKey(target);
      // Throttle only a *repeat* of the same target (a double-fired event), so placing a
      // different piece immediately after another is never rejected with "Slow down…".
      if (key === lastSinglePlaceKeyRef.current && now - lastSinglePlaceAtRef.current < BUILD_PLACEMENT_RATE_LIMIT_MS) {
        return;
      }
      const preview = previewPlacement(target);
      if (!preview.allowed) {
        onStatus?.(preview.message ?? buildPlacementStatusMessage(preview.reason));
        return;
      }
      lastSinglePlaceAtRef.current = now;
      lastSinglePlaceKeyRef.current = key;
      try {
        await actions.place(
          target.kind,
          target.cell,
          target.level,
          target.edge,
          target.rotation,
          target.materialId,
          target.textureStorageKey,
          target.textureSpanCells
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
      const cell = worldToCell(hitX, hitZ);
      const key = `stamp:${cell.ix}:${cell.iz}`;
      // Same throttle policy as single placement: only block a repeat stamp at the same
      // anchor cell (double-fire), not a deliberate next stamp elsewhere.
      if (key === lastSinglePlaceKeyRef.current && now - lastSinglePlaceAtRef.current < BUILD_PLACEMENT_RATE_LIMIT_MS) {
        return;
      }
      const targets = stampTargetsFromHit(hitX, hitZ);
      const stampResult = evaluateStampTargets(targets);
      if (!stampResult.allowed) {
        onStatus?.(buildPlacementStatusMessage(stampResult.reason));
        return;
      }
      lastSinglePlaceAtRef.current = now;
      lastSinglePlaceKeyRef.current = key;
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
      // A fresh gesture begins — its click should count. (If this becomes a drag, the
      // drag-end re-arms the ignore so only the drag's trailing click is dropped.)
      ignoreNextClickRef.current = false;
      if (buildMode.tool === "destroy" && !stampMode) return;
      draggingRef.current = true;
      didDragRef.current = false;
      dragTargetsRef.current.clear();
      pendingBatchRef.current = [];
      setGhostTrail([]);
      lastTrailKeyRef.current = "";
      const x = event.point.x;
      const z = event.point.z;
      const effectivePiece = resolveSurfaceForPlacement(x, z);
      if (imageFloorRectMode) {
        // Anchor the drag rectangle; level comes from the resolved target so the rect
        // sits on the surface under the cursor (or the standing level on empty ground).
        const anchorTarget = targetFromHit("image-floor", x, placementPlaneY, z, effectivePiece);
        rectAnchorRef.current = { ix: anchorTarget.cell.ix, iz: anchorTarget.cell.iz, level: anchorTarget.level };
        updateImageFloorRect(anchorTarget.cell.ix, anchorTarget.cell.iz);
        setGhost(null);
        return;
      }
      updateGhostFromHit(x, placementPlaneY, z, effectivePiece, buildMode.tool);
    },
    [
      buildMode.enabled,
      buildMode.tool,
      imageFloorRectMode,
      placementPlaneY,
      resolveSurfaceForPlacement,
      stampMode,
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
      ignoreNextClickRef.current = true;
      await commitImageFloorRect();
      return;
    }
    if (didDragRef.current) {
      ignoreNextClickRef.current = true;
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
      // Swallow exactly the one synthetic click a drag emits on release; a fresh click
      // (its own pointerdown cleared the flag) always proceeds.
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false;
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

      // Commit exactly what the ghost is previewing (computed on the latest pointer
      // move / press), so a valid green ghost always places that piece — even if this
      // click's raycast resolves to a slightly different surface or cell. Fall back to
      // re-deriving from the click only if no ghost target was recorded.
      let target = currentGhostTargetRef.current;
      if (!target) {
        // Cell-based surface (same as the ghost) so the fallback matches what was previewed.
        const x = event.point.x;
        const z = event.point.z;
        target = targetFromHit(
          buildMode.tool as Exclude<BuildTool, "destroy">,
          x,
          placementPlaneY,
          z,
          resolveSurfaceForPlacement(x, z)
        );
      }
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
      resolveSurfaceForPlacement,
      stampMode,
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

  const placementActive = buildMode.enabled && !placementSuspended;
  // Only the destroy tool needs to pick a specific piece by ray. For every other tool the
  // build plane owns the cursor: making pieces raycast-transparent means the resolved world
  // X/Z always comes from the plane (no ~0.3 m parallax jump as the ray flips between a piece
  // top and the plane at a floor edge), so the ghost stays put. Cell-based surface resolution
  // (resolveSurfaceForPlacement) recovers the level/edge without needing the hit piece.
  const destroyToolActive = buildMode.tool === "destroy" && !stampMode;

  return (
    <group>
      <BuildLayer
        pieces={pieces}
        interactive={placementActive}
        highlightedPieceId={placementActive ? highlightedPieceId : null}
        pointerEventsPassThrough={
          placementActive ? !destroyToolActive : boardPlacementPassthrough
        }
        {...(placementActive
          ? {
              onPiecePointerMove: (piece: BuildPiece, event: ThreeEvent<PointerEvent>) =>
                handleSurfacePointer(event, piece),
              onPiecePointerOut: () => setHighlightedPieceId(null),
              onPiecePointerDown: (piece: BuildPiece, event: ThreeEvent<PointerEvent>) =>
                handlePointerDown(event, piece),
              onPieceClick: (piece: BuildPiece, event: ThreeEvent<MouseEvent>) => void handleClick(event, piece)
            }
          : {})}
      />

      {!placementActive ? null : (
        <>
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
        </>
      )}
    </group>
  );
}
