"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Grid, Html } from "@react-three/drei";
import type { BuildPiece, BuildPieceKind, RoomManifest } from "@3dspace/contracts";
import type { ThreeEvent } from "@react-three/fiber";
import { BUILD_CELL_SIZE, BUILD_PLACEMENT_RATE_LIMIT_MS, levelToY, worldToCell } from "@3dspace/room-engine";
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

type BuildActions = {
  place(
    kind: BuildPieceKind,
    cell: { ix: number; iz: number },
    level: number,
    edge?: import("@3dspace/contracts").BuildPieceEdge,
    rotation?: import("@3dspace/contracts").BuildPieceRotation,
    materialId?: import("@3dspace/contracts").BuildPieceMaterial
  ): Promise<unknown>;
  placeBatch(
    placements: Array<{
      kind: BuildPieceKind;
      cell: { ix: number; iz: number };
      level: number;
      edge?: import("@3dspace/contracts").BuildPieceEdge;
      rotation?: import("@3dspace/contracts").BuildPieceRotation;
      materialId?: import("@3dspace/contracts").BuildPieceMaterial;
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
  boardPlacementPassthrough = false
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
        // The raycast `hitY` is the ground under the cursor; the level we build at when the
        // cursor lands on empty ground comes from where the avatar is standing.
        baseLevel: avatarStandingLevel(localAvatarPosition.y),
        existingPieces
      });
    },
    [
      buildMode.materialId,
      buildMode.rampRotationOverride,
      buildMode.rotation,
      localAvatarPosition.y,
      piecesById,
      roomId,
      userId
    ]
  );

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
      setGhost({
        pieces: [preview.piece],
        valid: preview.allowed,
        ...(preview.reason ? { reason: preview.reason } : {})
      });
      if (draggingRef.current && preview.allowed && !stampMode) {
        const trailKey = placementTargetKey(target);
        if (trailKey !== lastTrailKeyRef.current) {
          lastTrailKeyRef.current = trailKey;
          setGhostTrail((prev) => [...prev, preview.piece].slice(-GHOST_TRAIL_MAX));
        }
      }
    },
    [activeStamp, evaluateStampTargets, previewPlacement, stampMode, stampTargetsFromHit, targetFromHit]
  );

  const tryDragPlacement = useCallback(
    (
      event: ThreeEvent<PointerEvent>,
      surfacePiece: BuildPiece | null
    ) => {
      if (!draggingRef.current || buildMode.tool === "destroy" || stampMode) return;
      const target = targetFromHit(
        buildMode.tool,
        event.point.x,
        event.point.y,
        event.point.z,
        surfacePiece
      );
      const preview = previewPlacement(target);
      if (preview.allowed) {
        scheduleBatchPlacement(target);
      }
    },
    [buildMode.tool, previewPlacement, scheduleBatchPlacement, targetFromHit]
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
      updateGhostFromHit(event.point.x, event.point.y, event.point.z, surfacePiece, buildMode.tool);
      tryDragPlacement(event, surfacePiece);
    },
    [buildMode.enabled, buildMode.tool, tryDragPlacement, updateGhostFromHit]
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
          target.materialId
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
      updateGhostFromHit(event.point.x, event.point.y, event.point.z, surfacePiece, buildMode.tool);
      tryDragPlacement(event, surfacePiece);
    },
    [buildMode.enabled, buildMode.tool, tryDragPlacement, updateGhostFromHit]
  );

  const handlePointerUp = useCallback(async () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (didDragRef.current) {
      suppressClickUntilRef.current = Date.now() + DRAG_CLICK_SUPPRESS_MS;
    }
    await flushPendingBatch();
    dragTargetsRef.current.clear();
    setGhostTrail([]);
    lastTrailKeyRef.current = "";
  }, [flushPendingBatch]);

  useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerUp]);

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

      const target = targetFromHit(
        buildMode.tool as Exclude<BuildTool, "destroy">,
        event.point.x,
        event.point.y,
        event.point.z,
        surfacePiece
      );
      await commitPlacement(target);
    },
    [
      actions,
      buildMode.enabled,
      buildMode.tool,
      commitPlacement,
      commitStampPlacement,
      onStatus,
      stampMode,
      targetFromHit
    ]
  );

  if (!buildMode.enabled) {
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
