import type { BuildLogicPiece } from "@3dspace/contracts";
import type { Repository } from "../repository.js";
import { pulseLogicChannel, type ApplyLogicSignalResult } from "./channel-bus.js";

type TimerHandle = {
  timeout: ReturnType<typeof setTimeout>;
  interval?: ReturnType<typeof setInterval>;
};

export type LogicTimerFireResult = {
  roomId: string;
  pieceId: string;
  channelId: string;
  result: ApplyLogicSignalResult;
};

function timerKey(roomId: string, pieceId: string) {
  return `${roomId}:${pieceId}`;
}

export class LogicTimerScheduler {
  private readonly handles = new Map<string, TimerHandle>();

  constructor(private readonly repository: Repository) {}

  cancelRoom(roomId: string) {
    for (const [key, handle] of this.handles.entries()) {
      if (!key.startsWith(`${roomId}:`)) continue;
      clearTimeout(handle.timeout);
      if (handle.interval) clearInterval(handle.interval);
      this.handles.delete(key);
    }
  }

  cancelPiece(roomId: string, pieceId: string) {
    const key = timerKey(roomId, pieceId);
    const handle = this.handles.get(key);
    if (!handle) return;
    clearTimeout(handle.timeout);
    if (handle.interval) clearInterval(handle.interval);
    this.handles.delete(key);
  }

  clearForTests() {
    for (const handle of this.handles.values()) {
      clearTimeout(handle.timeout);
      if (handle.interval) clearInterval(handle.interval);
    }
    this.handles.clear();
  }

  async onSessionStart(roomId: string, onFire?: (payload: LogicTimerFireResult) => void) {
    this.cancelRoom(roomId);
    const pieces = await this.repository.listLogicPiecesForRoom(roomId);
    for (const piece of pieces) {
      if (piece.kind !== "timer") continue;
      if (piece.config?.triggerChannelId) continue;
      await this.armTimer(roomId, piece, onFire);
    }
  }

  async onChannelPulsed(
    roomId: string,
    channelIds: string[],
    onFire?: (payload: LogicTimerFireResult) => void
  ) {
    if (channelIds.length === 0) return;
    const idSet = new Set(channelIds);
    const pieces = await this.repository.listLogicPiecesForRoom(roomId);
    for (const piece of pieces) {
      if (piece.kind !== "timer") continue;
      const trigger = piece.config?.triggerChannelId;
      if (!trigger || !idSet.has(trigger)) continue;
      await this.armTimer(roomId, piece, onFire);
    }
  }

  async armTimer(
    roomId: string,
    piece: BuildLogicPiece,
    onFire?: (payload: LogicTimerFireResult) => void
  ) {
    if (piece.kind !== "timer" || !piece.channelId) return;

    const key = timerKey(roomId, piece.id);
    this.cancelPiece(roomId, piece.id);

    const delayMs = piece.config?.delayMs ?? 0;
    const intervalMs = piece.config?.intervalMs ?? 0;

    const fire = async () => {
      const result = await pulseLogicChannel(this.repository, roomId, piece.channelId!);
      onFire?.({ roomId, pieceId: piece.id, channelId: piece.channelId!, result });
    };

    const timeout = setTimeout(() => {
      void fire();
      if (intervalMs > 0) {
        const interval = setInterval(() => {
          void fire();
        }, intervalMs);
        interval.unref?.();
        const handle = this.handles.get(key);
        if (handle) handle.interval = interval;
      } else {
        this.handles.delete(key);
      }
    }, delayMs);
    timeout.unref?.();
    this.handles.set(key, { timeout });
  }
}
