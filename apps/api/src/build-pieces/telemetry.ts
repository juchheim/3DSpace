import type { BuildPiece } from "@3dspace/contracts";
import { BUILD_ROOM_EVENT_TYPES } from "@3dspace/contracts";
import type { Repository } from "../repository.js";

export async function recordBuildPiecePlaced(
  repository: Repository,
  roomId: string,
  userId: string,
  piece: BuildPiece
) {
  await repository.recordRoomEvent({
    roomId,
    type: BUILD_ROOM_EVENT_TYPES.piecePlaced,
    payload: {
      pieceId: piece.id,
      kind: piece.kind,
      cell: piece.cell,
      level: piece.level,
      ...(piece.edge ? { edge: piece.edge } : {}),
      materialId: piece.materialId
    },
    createdByUserId: userId
  });
}

export async function recordBuildPiecesPlacedBatch(
  repository: Repository,
  roomId: string,
  userId: string,
  pieces: BuildPiece[]
) {
  if (pieces.length === 0) return;
  await repository.recordRoomEvent({
    roomId,
    type: BUILD_ROOM_EVENT_TYPES.piecesBatch,
    payload: {
      count: pieces.length,
      pieceIds: pieces.map((piece) => piece.id)
    },
    createdByUserId: userId
  });
  for (const piece of pieces) {
    await recordBuildPiecePlaced(repository, roomId, userId, piece);
  }
}

export async function recordBuildPieceRemoved(
  repository: Repository,
  roomId: string,
  userId: string,
  piece: BuildPiece
) {
  await repository.recordRoomEvent({
    roomId,
    type: BUILD_ROOM_EVENT_TYPES.pieceRemoved,
    payload: {
      pieceId: piece.id,
      kind: piece.kind,
      cell: piece.cell,
      level: piece.level,
      ...(piece.edge ? { edge: piece.edge } : {})
    },
    createdByUserId: userId
  });
}

export async function recordBuildPiecesCleared(
  repository: Repository,
  roomId: string,
  userId: string,
  clearedCount: number
) {
  await repository.recordRoomEvent({
    roomId,
    type: BUILD_ROOM_EVENT_TYPES.piecesCleared,
    payload: { clearedCount },
    createdByUserId: userId
  });
}

