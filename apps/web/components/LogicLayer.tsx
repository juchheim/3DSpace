"use client";

import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { BuildLogicPiece } from "@3dspace/contracts";
import type { ThreeEvent } from "@react-three/fiber";
import {
  BUILD_LEVEL_HEIGHT,
  BUILD_MAX_ACTIVE_LIGHTS,
  cellToWorldCenter,
  isLogicLightOn,
  logicChannelColor,
  primaryChannelForPiece
} from "@3dspace/room-engine";
import { LogicPieceMesh } from "./LogicPieceMesh";

/** Color a piece is tinted by: linkId for teleporters, else its primary channel. */
function channelColorForPiece(piece: BuildLogicPiece): string | null {
  const source = piece.kind === "teleporter" ? piece.linkId : primaryChannelForPiece(piece);
  return source ? logicChannelColor(source) : null;
}

function useNearestActiveLogicLightIds(
  pieces: BuildLogicPiece[],
  nodeStates: Record<string, Record<string, unknown>>
) {
  const camera = useThree((state) => state.camera);
  return useMemo(() => {
    const lights = pieces.filter(
      (piece) => piece.kind === "light" && isLogicLightOn(nodeStates, piece.id)
    );
    return [...lights]
      .sort((a, b) => {
        const ac = cellToWorldCenter(a.cell.ix, a.cell.iz);
        const bc = cellToWorldCenter(b.cell.ix, b.cell.iz);
        const ay = a.level * BUILD_LEVEL_HEIGHT + 1;
        const by = b.level * BUILD_LEVEL_HEIGHT + 1;
        const da =
          (ac.x - camera.position.x) ** 2 +
          (ay - camera.position.y) ** 2 +
          (ac.z - camera.position.z) ** 2;
        const db =
          (bc.x - camera.position.x) ** 2 +
          (by - camera.position.y) ** 2 +
          (bc.z - camera.position.z) ** 2;
        return da - db;
      })
      .slice(0, BUILD_MAX_ACTIVE_LIGHTS)
      .map((piece) => piece.id);
  }, [camera.position.x, camera.position.y, camera.position.z, nodeStates, pieces]);
}

export function LogicLayer({
  pieces,
  nodeStates = {},
  pulseAtByPieceId = {},
  selectedPieceId = null,
  onPieceClick
}: {
  pieces: BuildLogicPiece[];
  nodeStates?: Record<string, Record<string, unknown>>;
  pulseAtByPieceId?: Record<string, number>;
  selectedPieceId?: string | null;
  onPieceClick?: (piece: BuildLogicPiece, event: ThreeEvent<MouseEvent>) => void;
}) {
  const activeLightIds = useNearestActiveLogicLightIds(pieces, nodeStates);
  const activeLightSet = useMemo(() => new Set(activeLightIds), [activeLightIds]);

  return (
    <group>
      {pieces.map((piece) => (
        <LogicPieceMesh
          key={piece.id}
          piece={piece}
          nodeState={nodeStates[piece.id]}
          pulseAt={pulseAtByPieceId[piece.id]}
          emitRealLight={activeLightSet.has(piece.id)}
          channelColor={channelColorForPiece(piece)}
          selected={selectedPieceId === piece.id}
          {...(onPieceClick
            ? {
                onClick: (event: ThreeEvent<MouseEvent>) => {
                  event.stopPropagation();
                  onPieceClick(piece, event);
                }
              }
            : {})}
        />
      ))}
    </group>
  );
}
