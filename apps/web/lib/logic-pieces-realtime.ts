import type { BuildLogicPiece, LogicState, RoomLogicRealtimeMessage } from "@3dspace/contracts";

export function mergeLogicPiece(existing: BuildLogicPiece | undefined, incoming: BuildLogicPiece) {
  if (!existing) return incoming;
  return incoming;
}

export function applyLogicRealtimeToPieces(
  piecesById: Record<string, BuildLogicPiece>,
  message: RoomLogicRealtimeMessage
): Record<string, BuildLogicPiece> {
  if (message.type === "room.logic.upsert.v1") {
    return {
      ...piecesById,
      [message.piece.id]: mergeLogicPiece(piecesById[message.piece.id], message.piece)
    };
  }

  if (message.type === "room.logic.remove.v1") {
    if (!(message.pieceId in piecesById)) return piecesById;
    const next = { ...piecesById };
    delete next[message.pieceId];
    return next;
  }

  return piecesById;
}

export function applyLogicStatePatch(
  state: LogicState,
  message: Extract<RoomLogicRealtimeMessage, { type: "room.logic.state.v1" }>
): LogicState {
  const isFullReset =
    message.channels !== undefined &&
    message.nodes !== undefined &&
    Object.keys(message.channels).length === 0 &&
    Object.keys(message.nodes).length === 0;

  return {
    ...state,
    ...(message.channels !== undefined
      ? { channels: isFullReset ? message.channels : { ...state.channels, ...message.channels } }
      : {}),
    ...(message.nodes !== undefined
      ? { nodes: isFullReset ? message.nodes : { ...state.nodes, ...message.nodes } }
      : {}),
    updatedAt: new Date().toISOString()
  };
}
