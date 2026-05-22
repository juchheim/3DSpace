export const ROOM_OBJECT_GRAB_TTL_MS = 30_000;
export const ROOM_OBJECT_GRAB_REAPER_INTERVAL_MS = 5_000;

export type RoomObjectGrabRecord = {
  objectId: string;
  roomId: string;
  holderUserId: string;
  expiresAt: number;
  lastPoseAt: number;
};

export type RoomObjectGrabLockOptions = {
  now?: () => number;
  onReap?: (grab: RoomObjectGrabRecord) => void;
};

export class RoomObjectGrabLock {
  private grabs = new Map<string, RoomObjectGrabRecord>();
  private reaperTimer: NodeJS.Timeout | undefined;
  private readonly now: () => number;

  constructor(private readonly options: RoomObjectGrabLockOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  get(objectId: string) {
    return this.grabs.get(objectId);
  }

  claim(input: { objectId: string; roomId: string; holderUserId: string }) {
    const time = this.now();
    const record: RoomObjectGrabRecord = {
      objectId: input.objectId,
      roomId: input.roomId,
      holderUserId: input.holderUserId,
      expiresAt: time + ROOM_OBJECT_GRAB_TTL_MS,
      lastPoseAt: time
    };
    this.grabs.set(input.objectId, record);
    return record;
  }

  touchPose(objectId: string) {
    const existing = this.grabs.get(objectId);
    if (!existing) return undefined;
    const time = this.now();
    const updated = { ...existing, lastPoseAt: time, expiresAt: time + ROOM_OBJECT_GRAB_TTL_MS };
    this.grabs.set(objectId, updated);
    return updated;
  }

  release(objectId: string) {
    return this.grabs.delete(objectId);
  }

  sweepStale() {
    const cutoff = this.now() - ROOM_OBJECT_GRAB_TTL_MS;
    for (const [objectId, grab] of this.grabs.entries()) {
      if (grab.lastPoseAt < cutoff) {
        this.grabs.delete(objectId);
        this.options.onReap?.(grab);
      }
    }
  }

  startReaper() {
    if (this.reaperTimer) return;
    this.reaperTimer = setInterval(() => this.sweepStale(), ROOM_OBJECT_GRAB_REAPER_INTERVAL_MS);
    if (typeof this.reaperTimer === "object" && "unref" in this.reaperTimer) {
      this.reaperTimer.unref();
    }
  }

  stopReaper() {
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = undefined;
    }
  }
}
