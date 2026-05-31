import type { BuildLogicPiece, LogicSignalKind, RoomManifest } from "@3dspace/contracts";
import {
  isTeleporterArmed,
  teleportLandingPosition,
  teleportTarget
} from "@3dspace/room-engine";
import { logicTeleporterDisarmed, logicTeleporterNoTarget, logicRejected } from "../errors.js";
import type { Repository } from "../repository.js";
import type { ApplyLogicSignalResult } from "./channel-bus.js";

const teleporterDebounceAt = new Map<string, number>();

export type ApplyTeleporterSignalResult = ApplyLogicSignalResult & {
  teleportTo?: { x: number; y: number; z: number };
};

export async function applyTeleporterSignal(
  repository: Repository,
  roomId: string,
  manifest: RoomManifest,
  piece: BuildLogicPiece,
  kind: LogicSignalKind
): Promise<ApplyTeleporterSignalResult> {
  if (piece.kind !== "teleporter") {
    throw logicRejected("expected a teleporter piece");
  }
  if (kind !== "stepOn" && kind !== "stepOff") {
    throw logicRejected("teleporters only accept step-on/off signals");
  }
  if (kind === "stepOff") {
    const state = await repository.getLogicState(roomId);
    return { state, channelPatch: {}, nodePatch: {} };
  }

  const debounceMs = piece.config?.debounceMs ?? 250;
  const key = `${roomId}:${piece.id}:${kind}`;
  const nowMs = Date.now();
  const lastAt = teleporterDebounceAt.get(key) ?? 0;
  if (nowMs - lastAt < debounceMs) {
    throw logicRejected("signal debounced");
  }
  teleporterDebounceAt.set(key, nowMs);

  const current = await repository.getLogicState(roomId);
  if (!isTeleporterArmed(current.nodes, piece.id)) {
    throw logicTeleporterDisarmed();
  }

  const allPieces = await repository.listLogicPiecesForRoom(roomId);
  const target = teleportTarget(piece, allPieces);
  if (!target) {
    throw logicTeleporterNoTarget();
  }

  const buildPieces = await repository.listBuildPiecesForRoom(roomId);
  const teleportTo = teleportLandingPosition(manifest, buildPieces, target);

  return {
    state: current,
    channelPatch: {},
    nodePatch: {},
    teleportTo
  };
}
