import type { BuildLogicPiece } from "@3dspace/contracts";
import type { Repository } from "../repository.js";

export async function recordLogicPiecePlaced(
  repository: Repository,
  roomId: string,
  userId: string,
  piece: BuildLogicPiece
) {
  await repository.recordRoomEvent({
    roomId,
    type: "logic.piece.placed.v1",
    payload: { pieceId: piece.id, kind: piece.kind },
    createdByUserId: userId
  });
}

export async function recordLogicPieceRemoved(
  repository: Repository,
  roomId: string,
  userId: string,
  piece: BuildLogicPiece
) {
  await repository.recordRoomEvent({
    roomId,
    type: "logic.piece.removed.v1",
    payload: { pieceId: piece.id, kind: piece.kind },
    createdByUserId: userId
  });
}

export async function recordLogicPiecesCleared(
  repository: Repository,
  roomId: string,
  userId: string,
  count: number
) {
  await repository.recordRoomEvent({
    roomId,
    type: "logic.pieces.cleared.v1",
    payload: { count },
    createdByUserId: userId
  });
}
