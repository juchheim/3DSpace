import type { BuildPiece, RoomBuildRealtimeMessage } from "@3dspace/contracts";

export function mergeBuildPiece(existing: BuildPiece | undefined, incoming: BuildPiece) {
  if (!existing) return incoming;
  return incoming;
}

export function applyBuildRealtimeToPieces(
  piecesById: Record<string, BuildPiece>,
  message: RoomBuildRealtimeMessage
): Record<string, BuildPiece> {
  if (message.type === "room.build.upsert.v1") {
    return {
      ...piecesById,
      [message.piece.id]: mergeBuildPiece(piecesById[message.piece.id], message.piece)
    };
  }

  if (message.type === "room.build.remove.v1") {
    if (!(message.pieceId in piecesById)) return piecesById;
    const next = { ...piecesById };
    delete next[message.pieceId];
    return next;
  }

  if (message.type === "room.build.batch.v1") {
    if (message.pieces.length === 0) return {};
    const next = { ...piecesById };
    for (const piece of message.pieces) {
      next[piece.id] = mergeBuildPiece(piecesById[piece.id], piece);
    }
    return next;
  }

  return piecesById;
}
