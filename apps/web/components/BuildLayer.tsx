"use client";

import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { BuildPiece } from "@3dspace/contracts";
import type { ThreeEvent } from "@react-three/fiber";
import {
  BUILD_LEVEL_HEIGHT,
  BUILD_MAX_ACTIVE_LIGHTS,
  cellToWorldCenter
} from "@3dspace/room-engine";
import { BuildPieceMesh } from "./BuildPieceMesh";

function useNearestLightPieceIds(pieces: BuildPiece[]) {
  const camera = useThree((state) => state.camera);
  return useMemo(() => {
    const lights = pieces.filter((piece) => piece.kind === "light");
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
  }, [camera.position.x, camera.position.y, camera.position.z, pieces]);
}

export function BuildLayer({
  pieces,
  interactive = false,
  highlightedPieceId = null,
  pointerEventsPassThrough = false,
  onPiecePointerMove,
  onPiecePointerOut,
  onPiecePointerDown,
  onPieceClick
}: {
  pieces: BuildPiece[];
  interactive?: boolean;
  highlightedPieceId?: string | null;
  pointerEventsPassThrough?: boolean;
  onPiecePointerMove?: (piece: BuildPiece, event: ThreeEvent<PointerEvent>) => void;
  onPiecePointerOut?: (piece: BuildPiece, event: ThreeEvent<PointerEvent>) => void;
  onPiecePointerDown?: (piece: BuildPiece, event: ThreeEvent<PointerEvent>) => void;
  onPieceClick?: (piece: BuildPiece, event: ThreeEvent<MouseEvent>) => void;
}) {
  const activeLightIds = useNearestLightPieceIds(pieces);
  const activeLightSet = useMemo(() => new Set(activeLightIds), [activeLightIds]);

  return (
    <group>
      {pieces.map((piece) => (
        <BuildPieceMesh
          key={piece.id}
          piece={piece}
          interactive={interactive}
          emitRealLight={activeLightSet.has(piece.id)}
          pointerEventsPassThrough={pointerEventsPassThrough}
          highlighted={highlightedPieceId === piece.id}
          {...(onPiecePointerMove ? { onPointerMove: (event) => onPiecePointerMove(piece, event) } : {})}
          {...(onPiecePointerOut ? { onPointerOut: (event) => onPiecePointerOut(piece, event) } : {})}
          {...(onPiecePointerDown ? { onPointerDown: (event) => onPiecePointerDown(piece, event) } : {})}
          {...(onPieceClick ? { onClick: (event) => onPieceClick(piece, event) } : {})}
        />
      ))}
    </group>
  );
}
