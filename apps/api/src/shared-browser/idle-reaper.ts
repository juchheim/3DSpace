import type { AppConfig } from "../config.js";
import { nowIso, type Repository } from "../repository.js";
import type { SharedBrowserVideoLifecycle } from "./orchestrator.js";
import type { SharedBrowserDriver } from "./types.js";

type Logger = { error: (obj: unknown, msg?: string) => void };

export type SharedBrowserIdleReaperOptions = {
  repository: Repository;
  driver: SharedBrowserDriver;
  config: AppConfig;
  /** Sweep cadence; defaults to 60s. */
  intervalMs?: number;
  logger?: Logger;
  /** Phase 5 video delivery hook — torn down when a session is paused. */
  video?: SharedBrowserVideoLifecycle;
};

/**
 * Periodically pauses shared browser sessions whose `lastInputAt` is older than
 * `SHARED_BROWSER_IDLE_PAUSE_MINUTES`. Paused sessions keep their DB row so a
 * participant can `resume` them; the live Chromium page is torn down to free RAM.
 */
export class SharedBrowserIdleReaper {
  private readonly repository: Repository;
  private readonly driver: SharedBrowserDriver;
  private readonly config: AppConfig;
  private readonly intervalMs: number;
  private readonly logger: Logger | undefined;
  private readonly video: SharedBrowserVideoLifecycle | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: SharedBrowserIdleReaperOptions) {
    this.repository = options.repository;
    this.driver = options.driver;
    this.config = options.config;
    this.intervalMs = options.intervalMs ?? 60_000;
    this.logger = options.logger;
    this.video = options.video;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.sweep().catch((error) => this.logger?.error(error, "Shared browser idle reaper sweep failed"));
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Pause every session idle past the configured threshold. Exposed for tests. */
  async sweep(now: number = Date.now()): Promise<number> {
    const idleMinutes = this.config.tuning.sharedBrowserIdlePauseMinutes;
    const olderThanIso = new Date(now - idleMinutes * 60_000).toISOString();
    const stale = await this.repository.listStaleSharedBrowserSessions(olderThanIso);
    let paused = 0;
    for (const session of stale) {
      this.video?.onSessionInactive(session.id);
      await this.driver.stop(session.id).catch(() => undefined);
      await this.repository
        .updateSharedBrowserSession(session.id, { status: "paused", updatedAt: nowIso() })
        .catch(() => undefined);
      paused += 1;
    }
    return paused;
  }
}
