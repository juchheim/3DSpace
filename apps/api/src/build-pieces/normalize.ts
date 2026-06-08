import type { BuildPiece } from "@3dspace/contracts";
import { buildPieceRequiresEdge } from "@3dspace/room-engine";

/** Strip invalid `edge` values so persisted Mongo docs pass `BuildPieceSchema`. */
export function normalizeBuildPiece(piece: BuildPiece): BuildPiece {
  if (buildPieceRequiresEdge(piece.kind)) {
    return piece;
  }
  if (piece.edge === undefined) {
    return piece;
  }
  const { edge: _edge, ...rest } = piece;
  return rest;
}
