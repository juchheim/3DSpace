import {
  getRoomTypeFeatureFlags,
  LogicConfigSchema,
  type BuildLogicPiece,
  type LogicPieceKind,
  type RoomManifest,
  type RoomSettings
} from "@3dspace/contracts";
import type { BuildPieceEdge, BuildPieceRotation } from "@3dspace/contracts";
import {
  isLogicPlacementAllowed,
  LOGIC_MAX_PIECES_PER_ROOM,
  LOGIC_MAX_PIECES_PER_USER,
  logicPieceStableId
} from "@3dspace/room-engine";
import type { AppConfig } from "../config.js";
import { logicCapExceeded, logicDisabled, logicNotFound, logicRejected } from "../errors.js";
import type { Repository } from "../repository.js";

export type LogicPiecePlacement = {
  kind: LogicPieceKind;
  cell: { ix: number; iz: number };
  level: number;
  edge?: BuildPieceEdge | undefined;
  rotation?: BuildPieceRotation | undefined;
  channelId?: string | undefined;
  linkId?: string | undefined;
  config?: BuildLogicPiece["config"] | undefined;
};

/** Zod-defaulted logic config for new or unset pieces (never use raw `{}`). */
export function defaultLogicConfig(): BuildLogicPiece["config"] {
  return LogicConfigSchema.parse({});
}

export function logicPiecePlacementKey(placement: LogicPiecePlacement) {
  return `${placement.kind}:${placement.cell.ix},${placement.cell.iz}:${placement.level}:${placement.edge ?? ""}`;
}

function logicEnvEnabled(config: AppConfig, roomType: string | null | undefined) {
  if (roomType === "escape-room") return config.tuning.enableEscapeRoom;
  return false;
}

export function assertLogicEnabled(
  config: AppConfig,
  room: { type?: string | null; settings: RoomSettings }
) {
  if (!logicEnvEnabled(config, room.type)) {
    throw logicDisabled();
  }
  if (!getRoomTypeFeatureFlags(room.type).logic) {
    throw logicDisabled();
  }
  if (!room.settings.logicEnabled) {
    throw logicDisabled();
  }
}

export function assertLogicPlayMode(room: { settings: RoomSettings }) {
  if (!room.settings.playModeEnabled) {
    throw logicRejected("play mode is not enabled");
  }
}

export function assertLogicPlacementAllowed(
  manifest: RoomManifest,
  placement: LogicPiecePlacement
) {
  const probe = {
    kind: placement.kind,
    cell: placement.cell,
    level: placement.level,
    edge: placement.edge
  };
  const result = isLogicPlacementAllowed(manifest, probe);
  if (!result.ok) {
    throw logicRejected(result.reason);
  }
}

export async function enforceLogicCaps(
  repository: Repository,
  roomId: string,
  userId: string,
  newSlots: number
) {
  if (newSlots <= 0) return;
  const roomCount = await repository.countLogicPiecesForRoom(roomId);
  if (roomCount + newSlots > LOGIC_MAX_PIECES_PER_ROOM) {
    throw logicCapExceeded("room");
  }
  const userCount = await repository.countLogicPiecesForUser(roomId, userId);
  if (userCount + newSlots > LOGIC_MAX_PIECES_PER_USER) {
    throw logicCapExceeded("user");
  }
}

export async function requireLogicPiece(repository: Repository, roomId: string, pieceId: string) {
  const piece = await repository.getLogicPiece(roomId, pieceId);
  if (!piece) throw logicNotFound();
  return piece;
}

export function placementStableId(placement: LogicPiecePlacement) {
  return logicPieceStableId({
    kind: placement.kind,
    cell: placement.cell,
    level: placement.level,
    edge: placement.edge
  });
}

export function isNewLogicSlot(
  pieces: BuildLogicPiece[],
  placement: LogicPiecePlacement
) {
  const id = placementStableId(placement);
  return !pieces.some((piece) => piece.id === id);
}
