import type { BuildPiece } from "@3dspace/contracts";
import { buildPieceRequiresCorner, buildPieceRequiresEdge } from "@3dspace/room-engine";

/** Strip invalid `edge` / `corner` values so persisted Mongo docs pass `BuildPieceSchema`. */
export function normalizeBuildPiece(piece: BuildPiece): BuildPiece {
  if (buildPieceRequiresEdge(piece.kind)) {
    return piece;
  }
  if (buildPieceRequiresCorner(piece.kind)) {
    if (piece.edge === undefined) {
      return piece;
    }
    const { edge: _edge, ...rest } = piece;
    return rest;
  }
  if (piece.edge === undefined && piece.corner === undefined) {
    return piece;
  }
  const { edge: _edge, corner: _corner, ...rest } = piece;
  return rest;
}
