import type { BuildLogicPiece, LogicSignalKind, LogicState } from "@3dspace/contracts";
import {
  applyChannelPulse,
  applyChannelSetLatched,
  applyChannelToggle,
  isInteractLogicKind,
  isStepOnLogicKind,
  logicRoleForKind,
  patchDiff,
  resolveAllConsumerNodes
} from "@3dspace/room-engine";
import { logicRejected } from "../errors.js";
import type { Repository } from "../repository.js";

const signalDebounceAt = new Map<string, number>();

function debounceKey(roomId: string, pieceId: string, kind: LogicSignalKind) {
  return `${roomId}:${pieceId}:${kind}`;
}

function assertEmitterChannel(piece: BuildLogicPiece) {
  if (!piece.channelId) throw logicRejected("emitter has no channelId");
}

function assertSignalKind(piece: BuildLogicPiece, kind: LogicSignalKind) {
  if (kind === "interact" && !isInteractLogicKind(piece.kind)) {
    throw logicRejected("interact is only valid for buttons");
  }
  if ((kind === "stepOn" || kind === "stepOff") && !isStepOnLogicKind(piece.kind)) {
    throw logicRejected("step-on/off is only valid for plates and teleporters");
  }
  if ((kind === "proximityEnter" || kind === "proximityExit") && piece.kind !== "proximityZone") {
    throw logicRejected("proximity signals require a proximity zone");
  }
}

function applyEmitterToChannels(
  piece: BuildLogicPiece,
  kind: LogicSignalKind,
  channels: LogicState["channels"],
  nowMs: number
): LogicState["channels"] {
  assertEmitterChannel(piece);
  const channelId = piece.channelId!;
  const fireMode = piece.config?.fireMode ?? "pulse";

  if (kind === "stepOff" && fireMode === "whileHeld") {
    return applyChannelSetLatched(channels, channelId, false, nowMs);
  }
  if (kind === "stepOn" && fireMode === "whileHeld") {
    return applyChannelSetLatched(channels, channelId, true, nowMs);
  }
  if (kind === "proximityExit" && fireMode === "whileHeld") {
    return applyChannelSetLatched(channels, channelId, false, nowMs);
  }
  if (kind === "proximityEnter" && fireMode === "whileHeld") {
    return applyChannelSetLatched(channels, channelId, true, nowMs);
  }
  if (kind === "stepOff" || kind === "proximityExit") {
    return channels;
  }
  if (fireMode === "toggle") {
    return applyChannelToggle(channels, channelId, nowMs);
  }
  return applyChannelPulse(channels, channelId, nowMs);
}

export type ApplyLogicSignalResult = {
  state: LogicState;
  channelPatch: LogicState["channels"];
  nodePatch: LogicState["nodes"];
};

export async function pulseLogicChannel(
  repository: Repository,
  roomId: string,
  channelId: string,
  nowMs = Date.now()
): Promise<ApplyLogicSignalResult> {
  const current = await repository.getLogicState(roomId);
  const nextChannels = applyChannelPulse(current.channels, channelId, nowMs);
  const allPieces = await repository.listLogicPiecesForRoom(roomId);
  const nodePatch = resolveAllConsumerNodes(allPieces, nextChannels, current.nodes, { nowMs });
  const channelPatch = patchDiff(current.channels, nextChannels) as LogicState["channels"];
  const state = await repository.patchLogicState(roomId, {
    channels: channelPatch,
    nodes: nodePatch
  });
  return { state, channelPatch, nodePatch };
}

export async function applyLogicSignal(
  repository: Repository,
  roomId: string,
  piece: BuildLogicPiece,
  kind: LogicSignalKind
): Promise<ApplyLogicSignalResult> {
  if (piece.kind === "teleporter") {
    throw logicRejected("use applyTeleporterSignal for teleporter pads");
  }
  assertSignalKind(piece, kind);
  if (logicRoleForKind(piece.kind) !== "emitter") {
    throw logicRejected("only emitters accept interaction signals");
  }

  const debounceMs = piece.config?.debounceMs ?? 250;
  const key = debounceKey(roomId, piece.id, kind);
  const nowMs = Date.now();
  const lastAt = signalDebounceAt.get(key) ?? 0;
  if (nowMs - lastAt < debounceMs) {
    throw logicRejected("signal debounced");
  }
  signalDebounceAt.set(key, nowMs);

  const current = await repository.getLogicState(roomId);
  const nextChannels = applyEmitterToChannels(piece, kind, current.channels, nowMs);
  const allPieces = await repository.listLogicPiecesForRoom(roomId);
  const toggleEdge = kind === "interact" || kind === "stepOn" || kind === "proximityEnter";
  const nodePatch = resolveAllConsumerNodes(allPieces, nextChannels, current.nodes, {
    nowMs,
    toggleEdge
  });
  const channelPatch = patchDiff(current.channels, nextChannels) as LogicState["channels"];

  const state = await repository.patchLogicState(roomId, {
    channels: channelPatch,
    nodes: nodePatch
  });

  return { state, channelPatch, nodePatch };
}
