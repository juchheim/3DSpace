import type { BuildPiece } from "@3dspace/contracts";
import { buildPieceRequiresEdge } from "@3dspace/room-engine";

/** Strip invalid fields and heal retired build-piece kinds for persisted Mongo docs. */
export function normalizeBuildPiece(piece: BuildPiece): BuildPiece {
  let normalized: BuildPiece =
    (piece.kind as string) === "ceiling-futuristic-dark"
      ? { ...piece, kind: "ceiling-futuristic" }
      : piece;
  if (!buildPieceRequiresEdge(normalized.kind) && normalized.edge !== undefined) {
    const { edge: _edge, ...rest } = normalized;
    normalized = rest;
  }
  if (normalized.kind !== "image-floor") {
    let next = normalized;
    if (normalized.textureStorageKey !== undefined) {
      const { textureStorageKey: _texture, ...rest } = next;
      next = rest;
    }
    if (normalized.textureSpanCells !== undefined) {
      const { textureSpanCells: _span, ...rest } = next;
      next = rest;
    }
    normalized = next;
  }
  return normalized;
}
