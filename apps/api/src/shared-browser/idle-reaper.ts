import type { AppConfig } from "../config.js";
import type { Repository } from "../repository.js";
import type { SharedBrowserOrchestrator } from "./orchestrator.js";

type Logger = { error: (obj: unknown, msg?: string) => void };

export type SharedBrowserIdleReaperOptions = {
  repository: Repository;
  orchestrator: SharedBrowserOrchestrator;
  config: AppConfig;
  /** Sweep cadence; defaults to 60s. */
  intervalMs?: number;
  logger?: Logger;
};

/**
 * Periodically pauses shared browser sessions whose `lastInputAt` is older than
 * `SHARED_BROWSER_IDLE_PAUSE_MINUTES`. Paused sessions keep their DB row so a
 * participant can `resume` them; the live Chromium page is torn down to free RAM.
 */
export class SharedBrowserIdleReaper {
  private readonly repository: Repository;
  private readonly orchestrator: SharedBrowserOrchestrator;
  private readonly config: AppConfig;
  private readonly intervalMs: number;
  private readonly logger: Logger | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: SharedBrowserIdleReaperOptions) {
    this.repository = options.repository;
    this.orchestrator = options.orchestrator;
    this.config = options.config;
    this.intervalMs = options.intervalMs ?? 60_000;
    this.logger = options.logger;
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
      if (await this.orchestrator.pauseSession(session)) paused += 1;
    }
    return paused;
  }
}
