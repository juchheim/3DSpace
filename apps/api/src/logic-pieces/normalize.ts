import type { BuildLogicPiece } from "@3dspace/contracts";
import { logicPieceRequiresEdge } from "@3dspace/room-engine";

/** Strip invalid `edge` values so persisted Mongo docs pass `BuildLogicPieceSchema`. */
export function normalizeLogicPiece(piece: BuildLogicPiece): BuildLogicPiece {
  if (logicPieceRequiresEdge(piece.kind)) {
    return piece;
  }
  if (piece.edge === undefined) {
    return piece;
  }
  const { edge: _edge, ...rest } = piece;
  return rest;
}
