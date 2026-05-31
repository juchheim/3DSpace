import type { BuildLogicPiece, LogicChannelState, LogicState } from "@3dspace/contracts";

import { logicRoleForKind } from "./logic.js";

export const LOGIC_PULSE_FRESH_MS = 500;

export function isChannelActive(channel: LogicChannelState | undefined, nowMs = Date.now()): boolean {
  if (!channel) return false;
  if (channel.latched) return true;
  return nowMs - channel.lastPulseAt < LOGIC_PULSE_FRESH_MS;
}

export function consumerChannelIds(piece: BuildLogicPiece): string[] {
  const requireAll = piece.config?.requireAll ?? [];
  if (requireAll.length > 0) return requireAll;
  if (piece.channelId) return [piece.channelId];
  return [];
}

export type ConsumerField = "open" | "on" | "armed";

export function consumerFieldForKind(kind: BuildLogicPiece["kind"]): ConsumerField | null {
  switch (kind) {
    case "door":
      return "open";
    case "light":
      return "on";
    case "teleporter":
      return "armed";
    default:
      return null;
  }
}

function channelsSatisfied(
  piece: BuildLogicPiece,
  channels: LogicState["channels"],
  nowMs: number
): boolean {
  const ids = consumerChannelIds(piece);
  if (ids.length === 0) return false;
  return ids.every((id) => isChannelActive(channels[id], nowMs));
}

function readBool(node: Record<string, unknown> | undefined, field: ConsumerField): boolean {
  return node?.[field] === true;
}

function withBool(node: Record<string, unknown>, field: ConsumerField, value: boolean) {
  return { ...node, [field]: value };
}

export function resolveConsumerNodeState(
  piece: BuildLogicPiece,
  prevNode: Record<string, unknown>,
  channels: LogicState["channels"],
  options: { nowMs?: number; toggleEdge?: boolean } = {}
): Record<string, unknown> {
  const field = consumerFieldForKind(piece.kind);
  if (!field) return prevNode;

  const listenMode = piece.config?.listenMode ?? "latch";
  const nowMs = options.nowMs ?? Date.now();
  const active = channelsSatisfied(piece, channels, nowMs);

  if (listenMode === "toggle") {
    if (!options.toggleEdge) return prevNode;
    return withBool(prevNode, field, !readBool(prevNode, field));
  }

  if (listenMode === "momentary" || listenMode === "latch") {
    return withBool(prevNode, field, active);
  }

  return prevNode;
}

export function resolveAllConsumerNodes(
  pieces: BuildLogicPiece[],
  channels: LogicState["channels"],
  prevNodes: LogicState["nodes"],
  options: { nowMs?: number; toggleEdge?: boolean } = {}
): LogicState["nodes"] {
  const next: LogicState["nodes"] = {};
  for (const piece of pieces) {
    if (logicRoleForKind(piece.kind) !== "consumer") continue;
    const field = consumerFieldForKind(piece.kind);
    if (!field) continue;
    const prevNode = prevNodes[piece.id] ?? {};
    const resolved = resolveConsumerNodeState(piece, prevNode, channels, options);
    if (readBool(resolved, field) !== readBool(prevNode, field) || JSON.stringify(resolved) !== JSON.stringify(prevNode)) {
      next[piece.id] = resolved;
    }
  }
  return next;
}

export function applyChannelPulse(
  channels: LogicState["channels"],
  channelId: string,
  nowMs = Date.now()
): LogicState["channels"] {
  return {
    ...channels,
    [channelId]: { latched: true, lastPulseAt: nowMs }
  };
}

export function applyChannelToggle(
  channels: LogicState["channels"],
  channelId: string,
  nowMs = Date.now()
): LogicState["channels"] {
  const current = channels[channelId];
  const latched = !(current?.latched ?? false);
  return {
    ...channels,
    [channelId]: { latched, lastPulseAt: nowMs }
  };
}

export function applyChannelSetLatched(
  channels: LogicState["channels"],
  channelId: string,
  latched: boolean,
  nowMs = Date.now()
): LogicState["channels"] {
  const current = channels[channelId];
  return {
    ...channels,
    [channelId]: {
      latched,
      lastPulseAt: latched ? (current?.lastPulseAt ?? nowMs) : 0
    }
  };
}

export function patchDiff<T extends Record<string, unknown>>(prev: T, next: T): Partial<T> {
  const diff: Partial<T> = {};
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      diff[key as keyof T] = next[key] as T[keyof T];
    }
  }
  return diff;
}
