import type { BuildPiece } from "@3dspace/contracts";

/** Strip invalid `edge` values so persisted Mongo docs pass `BuildPieceSchema`. */
export function normalizeBuildPiece(piece: BuildPiece): BuildPiece {
  if (piece.kind === "wall") {
    return piece;
  }
  if (piece.edge === undefined) {
    return piece;
  }
  const { edge: _edge, ...rest } = piece;
  return rest;
}
