import {
  getRoomTypeFeatureFlags,
  type BuildPiece,
  type BuildPieceEdge,
  type BuildPieceKind,
  type BuildPieceMaterial,
  type BuildPieceRotation,
  type RoomSettings
} from "@3dspace/contracts";
import {
  BUILD_MAX_PIECES_PER_ROOM,
  BUILD_MAX_PIECES_PER_USER,
  buildPieceStableId,
  isBuildAllowedAt
} from "@3dspace/room-engine";
import type { AuthContext } from "../auth.js";
import type { AppConfig } from "../config.js";
import { buildCapExceeded, buildDestroyDenied, buildDisabled, buildNotFound, buildRejected, buildWallHasBoards } from "../errors.js";
import { actorIsRoomTeacher } from "../policy/wall-objects.js";
import type { Repository } from "../repository.js";

export type BuildPiecePlacement = {
  kind: BuildPieceKind;
  cell: { ix: number; iz: number };
  level: number;
  edge?: BuildPieceEdge | undefined;
  rotation?: BuildPieceRotation | undefined;
  materialId?: BuildPieceMaterial | undefined;
};

export function buildPiecePlacementKey(placement: BuildPiecePlacement) {
  return `${placement.kind}:${placement.cell.ix},${placement.cell.iz}:${placement.level}:${placement.edge ?? ""}`;
}

export function dedupeBuildPlacements(placements: BuildPiecePlacement[]) {
  const byKey = new Map<string, BuildPiecePlacement>();
  for (const placement of placements) {
    byKey.set(buildPiecePlacementKey(placement), placement);
  }
  return [...byKey.values()];
}

export function matchesBuildPiecePlacement(piece: BuildPiece, placement: BuildPiecePlacement) {
  return (
    piece.kind === placement.kind &&
    piece.cell.ix === placement.cell.ix &&
    piece.cell.iz === placement.cell.iz &&
    piece.level === placement.level &&
    (piece.edge ?? undefined) === (placement.edge ?? undefined)
  );
}

export function assertBuildingEnabled(
  config: AppConfig,
  room: { type?: string | null; settings: RoomSettings }
) {
  if (!config.tuning.enableFreeForAllBuilding) {
    throw buildDisabled();
  }
  if (!getRoomTypeFeatureFlags(room.type).building) {
    throw buildDisabled();
  }
  if (!room.settings.buildingEnabled) {
    throw buildDisabled();
  }
}

export function assertBuildAllowed(
  manifest: Parameters<typeof isBuildAllowedAt>[0],
  placement: BuildPiecePlacement
) {
  const probe = {
    id: buildPieceStableId({
      kind: placement.kind,
      cell: placement.cell,
      level: placement.level,
      edge: placement.edge
    }),
    kind: placement.kind,
    cell: placement.cell,
    level: placement.level,
    edge: placement.edge,
    rotation: placement.rotation ?? 0,
    materialId: placement.materialId ?? "stone"
  };
  const result = isBuildAllowedAt(manifest, probe);
  if (!result.ok) {
    throw buildRejected(result.reason);
  }
}

export async function enforceBuildCaps(
  repository: Repository,
  roomId: string,
  userId: string,
  placements: BuildPiecePlacement[]
) {
  const uniquePlacements = dedupeBuildPlacements(placements);
  const existing = await repository.listBuildPiecesForRoom(roomId);
  let newSlots = 0;
  for (const placement of uniquePlacements) {
    if (!existing.some((piece) => matchesBuildPiecePlacement(piece, placement))) {
      newSlots += 1;
    }
  }
  if (newSlots === 0) return;

  const roomCount = await repository.countBuildPiecesForRoom(roomId);
  if (roomCount + newSlots > BUILD_MAX_PIECES_PER_ROOM) {
    throw buildCapExceeded("room");
  }

  const userCount = await repository.countBuildPiecesForUser(roomId, userId);
  if (userCount + newSlots > BUILD_MAX_PIECES_PER_USER) {
    throw buildCapExceeded("user");
  }
}

export async function requireBuildPiece(repository: Repository, roomId: string, pieceId: string) {
  const piece = await repository.getBuildPiece(roomId, pieceId);
  if (!piece) {
    throw buildNotFound();
  }
  return piece;
}

export async function assertCanDestroyBuildPiece(
  repository: Repository,
  roomId: string,
  piece: BuildPiece,
  auth: AuthContext,
  settings: RoomSettings
) {
  if (settings.buildDestroyPolicy === "anyone") {
    return;
  }
  const { teacher } = await actorIsRoomTeacher(repository, roomId, auth);
  if (teacher || piece.createdByUserId === auth.userId) {
    return;
  }
  throw buildDestroyDenied();
}

/** Orphan policy B: wall pieces with a dynamic board cannot be destroyed until the board is removed. */
export async function assertBuildWallHasNoBoards(repository: Repository, roomId: string, piece: BuildPiece) {
  if (piece.kind !== "wall") return;
  const anchors = await repository.listDynamicWallAnchorsForRoom(roomId);
  if (anchors.some((anchor) => anchor.wallId === piece.id)) {
    throw buildWallHasBoards();
  }
}
