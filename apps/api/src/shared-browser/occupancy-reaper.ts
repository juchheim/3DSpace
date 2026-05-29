import type { SharedBrowserOrchestrator } from "./orchestrator.js";

type Logger = { error: (obj: unknown, msg?: string) => void };

export type SharedBrowserOccupancyReaperOptions = {
  orchestrator: SharedBrowserOrchestrator;
  /** Sweep cadence; defaults to 30s (half the room-presence TTL). */
  intervalMs?: number;
  logger?: Logger;
};

/**
 * Periodically pauses live shared browser sessions in rooms with no recent
 * participant heartbeats. Complements the input-idle reaper: this frees RAM
 * when everyone leaves, even if the last interaction was recent.
 */
export class SharedBrowserOccupancyReaper {
  private readonly orchestrator: SharedBrowserOrchestrator;
  private readonly intervalMs: number;
  private readonly logger: Logger | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: SharedBrowserOccupancyReaperOptions) {
    this.orchestrator = options.orchestrator;
    this.intervalMs = options.intervalMs ?? 30_000;
    this.logger = options.logger;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.sweep().catch((error) => this.logger?.error(error, "Shared browser occupancy reaper sweep failed"));
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Exposed for tests. */
  async sweep(): Promise<number> {
    return this.orchestrator.pauseLiveSessionsInEmptyRooms();
  }
}
