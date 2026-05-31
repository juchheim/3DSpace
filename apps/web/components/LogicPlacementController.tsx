"use client";

import { useCallback, useMemo, useState } from "react";
import type { BuildLogicPiece, LogicConfigInput, RoomManifest } from "@3dspace/contracts";
import type { ThreeEvent } from "@react-three/fiber";
import { BUILD_CELL_SIZE, levelToY } from "@3dspace/room-engine";
import { avatarStandingLevel } from "../lib/buildPlacement";
import { logicPlacementPreviewId, resolveLogicPlacementTarget } from "../lib/logicPlacement";
import type { LogicModeController } from "../lib/useLogicMode";
import { LogicLayer } from "./LogicLayer";
import { LogicPieceMesh } from "./LogicPieceMesh";

export function LogicPlacementController({
  manifest,
  logicMode,
  pieces,
  piecesById,
  nodeStates = {},
  pulseAtByPieceId = {},
  selectedPieceId = null,
  localAvatarPosition,
  actions,
  onPieceClick,
  onStatus
}: {
  manifest: RoomManifest;
  logicMode: LogicModeController;
  pieces: BuildLogicPiece[];
  piecesById: Record<string, BuildLogicPiece>;
  nodeStates?: Record<string, Record<string, unknown>>;
  pulseAtByPieceId?: Record<string, number>;
  selectedPieceId?: string | null;
  localAvatarPosition: { x: number; y: number; z: number };
  actions: {
    place(
      kind: BuildLogicPiece["kind"],
      cell: { ix: number; iz: number },
      level: number,
      edge?: BuildLogicPiece["edge"],
      channelId?: string,
      options?: { config?: LogicConfigInput | undefined; linkId?: string | undefined }
    ): Promise<unknown>;
    destroy(pieceId: string): Promise<unknown>;
  };
  onPieceClick?: (piece: BuildLogicPiece, event: ThreeEvent<MouseEvent>) => void;
  onStatus?(message: string): void;
}) {
  const [ghost, setGhost] = useState<{ piece: BuildLogicPiece; valid: boolean } | null>(null);

  const planeSize = useMemo(
    () =>
      [
        Math.max(manifest.dimensions.width, manifest.bounds.maxX - manifest.bounds.minX) + 8,
        Math.max(manifest.dimensions.depth, manifest.bounds.maxZ - manifest.bounds.minZ) + 8
      ] as [number, number],
    [manifest]
  );

  const standingLevel = avatarStandingLevel(localAvatarPosition.y);
  const placementPlaneY = logicMode.tool === "destroy" ? 0 : levelToY(standingLevel);

  const targetFromHit = useCallback(
    (hitX: number, hitY: number, hitZ: number) =>
      resolveLogicPlacementTarget({
        kind: logicMode.tool === "destroy" ? "button" : logicMode.tool,
        hitX,
        hitY,
        hitZ,
        ...(logicMode.channelId ? { channelId: logicMode.channelId } : {}),
        baseLevel: standingLevel,
        existingPieces: piecesById
      }),
    [logicMode.channelId, logicMode.tool, piecesById, standingLevel]
  );

  const handlePointer = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!logicMode.enabled) return;
      event.stopPropagation();
      if (logicMode.tool === "destroy") {
        setGhost(null);
        return;
      }
      const target = targetFromHit(event.point.x, event.point.y, event.point.z);
      const id = logicPlacementPreviewId(target);
      setGhost({
        piece: {
          id,
          roomId: pieces[0]?.roomId ?? "",
          kind: target.kind,
          cell: target.cell,
          level: target.level,
          ...(target.edge ? { edge: target.edge } : {}),
          rotation: 0,
          ...(target.channelId ? { channelId: target.channelId } : {}),
          config: {} as BuildLogicPiece["config"],
          createdByUserId: "",
          createdAt: new Date().toISOString()
        },
        valid: !piecesById[id]
      });
    },
    [logicMode.enabled, logicMode.tool, pieces, piecesById, targetFromHit]
  );

  const handleClick = useCallback(
    async (event: ThreeEvent<MouseEvent>) => {
      if (!logicMode.enabled) return;
      event.stopPropagation();
      if (logicMode.tool === "destroy") return;
      const target = targetFromHit(event.point.x, event.point.y, event.point.z);
      const id = logicPlacementPreviewId(target);
      if (piecesById[id]) {
        onStatus?.("Logic slot already occupied.");
        return;
      }
      try {
        const { config, linkId } = logicMode.buildPlacementConfig();
        await actions.place(target.kind, target.cell, target.level, target.edge, target.channelId, {
          config,
          linkId
        });
        onStatus?.("Logic node placed.");
      } catch (err) {
        onStatus?.(err instanceof Error ? err.message : "Unable to place logic node.");
      }
    },
    [actions, logicMode, onStatus, piecesById, targetFromHit]
  );

  if (!logicMode.enabled) {
    return (
      <LogicLayer
        pieces={pieces}
        nodeStates={nodeStates}
        pulseAtByPieceId={pulseAtByPieceId}
        selectedPieceId={selectedPieceId}
        {...(onPieceClick ? { onPieceClick } : {})}
      />
    );
  }

  return (
    <group>
      <LogicLayer
        pieces={pieces}
        nodeStates={nodeStates}
        pulseAtByPieceId={pulseAtByPieceId}
        selectedPieceId={selectedPieceId}
        {...(onPieceClick ? { onPieceClick } : {})}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, placementPlaneY + 0.002, 0]}
        onPointerMove={handlePointer}
        onPointerOut={() => setGhost(null)}
        onClick={(event) => void handleClick(event)}
      >
        <planeGeometry args={planeSize} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {ghost ? <LogicPieceMesh piece={ghost.piece} ghost valid={ghost.valid} /> : null}
    </group>
  );
}
