import type { Buffer } from "node:buffer";
import type { SharedBrowserSession } from "@3dspace/contracts";
import { type AppConfig, livekitConfigured } from "../config.js";
import { nowIso, type Repository } from "../repository.js";
import type { JpegFrameStore } from "./jpeg-fallback.js";
import type { SharedBrowserVideoLifecycle } from "./orchestrator.js";
import type { SharedBrowserLiveKitPublisher } from "./livekit-publisher.js";
import type { SharedBrowserDriver } from "./types.js";

type Logger = { error: (obj: unknown, msg?: string) => void };

type ActiveEntry = { publisher?: SharedBrowserLiveKitPublisher };

export type SharedBrowserVideoManagerOptions = {
  repository: Repository;
  driver: SharedBrowserDriver;
  config: AppConfig;
  frameStore: JpegFrameStore;
  logger?: Logger;
};

/**
 * Bridges driver screencast frames to a delivery channel. In production each
 * active session publishes a synthetic LiveKit video track; the JPEG fallback
 * (dev/QA only) stashes the latest frame for the `frame.jpg` route. The LiveKit
 * publisher is imported lazily so fallback-only deployments never load
 * `@livekit/rtc-node`.
 */
export class SharedBrowserVideoManager implements SharedBrowserVideoLifecycle {
  private readonly repository: Repository;
  private readonly driver: SharedBrowserDriver;
  private readonly config: AppConfig;
  private readonly frameStore: JpegFrameStore;
  private readonly logger: Logger | undefined;
  private readonly active = new Map<string, ActiveEntry>();

  constructor(options: SharedBrowserVideoManagerOptions) {
    this.repository = options.repository;
    this.driver = options.driver;
    this.config = options.config;
    this.frameStore = options.frameStore;
    this.logger = options.logger;
  }

  private useLiveKit(): boolean {
    return livekitConfigured(this.config) && !this.config.tuning.sharedBrowserUseJpegFallback;
  }

  onSessionActive(session: SharedBrowserSession): void {
    if (this.active.has(session.id)) return; // idempotent — already streaming
    const entry: ActiveEntry = {};
    this.active.set(session.id, entry);
    void this.startVideo(session, entry).catch((error) => {
      this.active.delete(session.id);
      this.logger?.error(error, "Shared browser video start failed");
    });
  }

  private async startVideo(session: SharedBrowserSession, entry: ActiveEntry): Promise<void> {
    if (!this.useLiveKit()) {
      await this.driver.screencastLoop(session.id, (jpeg: Buffer) => this.frameStore.set(session.id, jpeg));
      return;
    }
    const { SharedBrowserLiveKitPublisher } = await import("./livekit-publisher.js");
    const publisher = new SharedBrowserLiveKitPublisher({
      config: this.config,
      roomId: session.roomId,
      wallObjectId: session.wallObjectId,
      width: session.viewport.width,
      height: session.viewport.height
    });
    const { trackSid } = await publisher.start();
    if (!this.active.has(session.id)) {
      // Session was torn down while we were connecting — undo.
      await publisher.close().catch(() => undefined);
      return;
    }
    entry.publisher = publisher;
    await this.repository
      .updateSharedBrowserSession(session.id, {
        livekit: { participantIdentity: publisher.participantIdentity, ...(trackSid ? { trackSid } : {}) },
        updatedAt: nowIso()
      })
      .catch(() => undefined);
    await this.driver.screencastLoop(session.id, (jpeg: Buffer) => void publisher.pushJpeg(jpeg));
  }

  onSessionInactive(sessionId: string): void {
    const entry = this.active.get(sessionId);
    if (!entry) return;
    this.active.delete(sessionId);
    this.frameStore.delete(sessionId);
    if (entry.publisher) {
      void entry.publisher.close().catch((error) => this.logger?.error(error, "Shared browser video teardown failed"));
    }
  }

  async close(): Promise<void> {
    const entries = [...this.active.values()];
    this.active.clear();
    this.frameStore.clear();
    for (const entry of entries) {
      if (entry.publisher) await entry.publisher.close().catch(() => undefined);
    }
  }
}
