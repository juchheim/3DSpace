"use client";

import type { BuildPiece } from "@3dspace/contracts";
import type { ThreeEvent } from "@react-three/fiber";
import { BuildPieceMesh } from "./BuildPieceMesh";

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
  return (
    <group>
      {pieces.map((piece) => (
        <BuildPieceMesh
          key={piece.id}
          piece={piece}
          interactive={interactive}
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
