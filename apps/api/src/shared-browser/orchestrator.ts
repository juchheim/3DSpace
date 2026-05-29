import type {
  RoomSettings,
  SharedBrowserControlLease,
  SharedBrowserKeyEvent,
  SharedBrowserPointerEvent,
  SharedBrowserRealtimeMessage,
  SharedBrowserSession,
  SharedBrowserWallObjectState
} from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { newId, nowIso, type Repository } from "../repository.js";
import { assertNavigationAllowed, type NavigationGuardSettings } from "./ssrf.js";
import { StubSharedBrowserDriver } from "./stub-driver.js";
import type { SharedBrowserDriver } from "./types.js";

export type SharedBrowserActor = { userId: string; displayName: string };

export type CreateSharedBrowserSessionInput = {
  sessionId: string;
  roomId: string;
  wallObjectId: string;
  createdBy: SharedBrowserActor;
  startUrl: string;
  settings: RoomSettings["sharedBrowsers"];
};

export type SharedBrowserResult = {
  session: SharedBrowserSession;
  realtimeMessages: SharedBrowserRealtimeMessage[];
};

/**
 * Lifecycle hook for video delivery (Phase 5). The orchestrator calls these as
 * sessions activate/deactivate so the video manager can start/stop the LiveKit
 * publisher or JPEG fallback. Both are fire-and-forget — failures must not break
 * the session mutation.
 */
export interface SharedBrowserVideoLifecycle {
  onSessionActive(session: SharedBrowserSession): void;
  onSessionInactive(sessionId: string): void;
}

export type SharedBrowserOrchestratorOptions = {
  repository: Repository;
  config: AppConfig;
  /** Defaults to the no-Chromium stub. Phase 3 injects the Puppeteer driver. */
  driver?: SharedBrowserDriver;
  /** Phase 5 video delivery hook. Omitted in tests / when video is disabled. */
  video?: SharedBrowserVideoLifecycle;
};

function leaseActive(lease: SharedBrowserControlLease | undefined, atIso: string): boolean {
  return !!lease && lease.expiresAt > atIso;
}

export class SharedBrowserOrchestrator {
  private readonly repository: Repository;
  private readonly config: AppConfig;
  private readonly driver: SharedBrowserDriver;
  private readonly video: SharedBrowserVideoLifecycle | undefined;

  constructor(options: SharedBrowserOrchestratorOptions) {
    this.repository = options.repository;
    this.config = options.config;
    this.driver = options.driver ?? new StubSharedBrowserDriver();
    this.video = options.video;
  }

  guardSettings(settings: RoomSettings["sharedBrowsers"]): NavigationGuardSettings {
    return {
      allowlistEnabled: settings.navigationAllowlistEnabled,
      allowlist: settings.navigationAllowlist,
      blockedHostSuffixes: this.config.tuning.sharedBrowserBlockedHostSuffixes,
      // The shared browser never navigates to loopback/private hosts, even in
      // dev — there is no legitimate target there and it would open an SSRF hole.
      allowInsecureLocal: false
    };
  }

  private stateCache(session: SharedBrowserSession): SharedBrowserWallObjectState {
    return {
      sessionStatus: session.status,
      currentUrl: session.currentUrl,
      title: session.title,
      ...(session.controlLease
        ? { controlUserId: session.controlLease.userId, controlDisplayName: session.controlLease.displayName }
        : {}),
      lastActivityAt: session.lastInputAt
    };
  }

  /** Mirror the session's runtime snapshot onto the wall object's `state` field. */
  private async syncWallObjectState(session: SharedBrowserSession): Promise<void> {
    const existing = await this.repository.getWallObject(session.roomId, session.wallObjectId);
    if (!existing) return;
    await this.repository.updateWallObject(session.roomId, session.wallObjectId, {
      updatedByUserId: session.createdByUserId,
      state: { ...existing.state, ...this.stateCache(session) }
    });
  }

  private stateMessage(session: SharedBrowserSession, senderId: string): SharedBrowserRealtimeMessage {
    return {
      type: "room.shared-browser.state.v1",
      roomId: session.roomId,
      wallObjectId: session.wallObjectId,
      currentUrl: session.currentUrl,
      title: session.title,
      status: session.status,
      controlLease: session.controlLease ?? null,
      sentAt: Date.now(),
      senderId
    };
  }

  async createSession(input: CreateSharedBrowserSessionInput): Promise<SharedBrowserResult> {
    const guard = this.guardSettings(input.settings);
    await assertNavigationAllowed(input.startUrl, guard);

    const now = nowIso();
    const session: SharedBrowserSession = {
      id: input.sessionId,
      roomId: input.roomId,
      wallObjectId: input.wallObjectId,
      createdByUserId: input.createdBy.userId,
      status: "starting",
      currentUrl: input.startUrl,
      title: "",
      viewport: { width: input.settings.viewportWidth, height: input.settings.viewportHeight },
      livekit: { participantIdentity: `shared-browser:${input.wallObjectId}` },
      lastInputAt: now,
      createdAt: now,
      updatedAt: now
    };
    await this.repository.createSharedBrowserSession(session);

    // Launch the driver and flip to active. The stub is instant; the Puppeteer
    // driver (Phase 3) may move this to a background task and leave the row in
    // "starting" until the page loads.
    let active: SharedBrowserSession;
    try {
      const result = await this.driver.start({ session, startUrl: input.startUrl, navigationGuard: guard });
      active = await this.repository.updateSharedBrowserSession(session.id, {
        status: "active",
        currentUrl: result.url,
        title: result.title,
        updatedAt: nowIso()
      });
    } catch (error) {
      active = await this.repository.updateSharedBrowserSession(session.id, {
        status: "error",
        errorCode: "driver_start_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: nowIso()
      });
    }
    await this.syncWallObjectState(active);
    if (active.status === "active") this.video?.onSessionActive(active);

    const senderId = input.createdBy.userId;
    return {
      session: active,
      realtimeMessages: [
        {
          type: "room.shared-browser.session.v1",
          roomId: active.roomId,
          wallObjectId: active.wallObjectId,
          status: active.status,
          sentAt: Date.now(),
          senderId
        },
        this.stateMessage(active, senderId)
      ]
    };
  }

  private async requireSession(roomId: string, wallObjectId: string): Promise<SharedBrowserSession> {
    const session = await this.repository.getSharedBrowserSessionByWallObject(wallObjectId);
    if (!session || session.roomId !== roomId) throw notFound("Shared browser session not found");
    return session;
  }

  private async ensureLiveSession(
    session: SharedBrowserSession,
    settings: RoomSettings["sharedBrowsers"]
  ): Promise<{ session: SharedBrowserSession; recovered: boolean }> {
    const live = this.driver.isLive?.(session.id) ?? true;
    if (session.status === "active" && live) {
      return { session, recovered: false };
    }

    try {
      const result = await this.driver.start({
        session,
        startUrl: session.currentUrl,
        navigationGuard: this.guardSettings(settings)
      });
      const updated = await this.repository.updateSharedBrowserSession(session.id, {
        status: "active",
        currentUrl: result.url,
        title: result.title,
        lastInputAt: nowIso(),
        errorCode: undefined,
        errorMessage: undefined,
        updatedAt: nowIso()
      });
      await this.syncWallObjectState(updated);
      this.video?.onSessionActive(updated);
      return { session: updated, recovered: true };
    } catch (error) {
      const updated = await this.repository.updateSharedBrowserSession(session.id, {
        status: "error",
        errorCode: "driver_start_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: nowIso()
      });
      await this.syncWallObjectState(updated);
      return { session: updated, recovered: false };
    }
  }

  async hydrate(roomId: string, wallObjectId: string): Promise<SharedBrowserResult> {
    const session = await this.requireSession(roomId, wallObjectId);
    return { session, realtimeMessages: [] };
  }

  async navigate(
    roomId: string,
    wallObjectId: string,
    url: string,
    actor: SharedBrowserActor,
    settings: RoomSettings["sharedBrowsers"]
  ): Promise<SharedBrowserResult> {
    const current = await this.requireSession(roomId, wallObjectId);
    const ensured = await this.ensureLiveSession(current, settings);
    const session = ensured.session;
    if (session.status !== "active") {
      throw conflict(session.errorMessage || "Shared browser session is unavailable");
    }
    await assertNavigationAllowed(url, this.guardSettings(settings));
    const result = await this.driver.navigate(session.id, url);
    const updated = await this.repository.updateSharedBrowserSession(session.id, {
      currentUrl: result.url,
      title: result.title,
      lastInputAt: nowIso(),
      status: session.status,
      updatedAt: nowIso()
    });
    await this.syncWallObjectState(updated);
    return {
      session: updated,
      realtimeMessages: [
        {
          type: "room.shared-browser.navigate.v1",
          roomId,
          wallObjectId,
          url: result.url,
          navigatedByUserId: actor.userId,
          sentAt: Date.now(),
          senderId: actor.userId
        },
        this.stateMessage(updated, actor.userId)
      ]
    };
  }

  async history(
    roomId: string,
    wallObjectId: string,
    action: "back" | "forward" | "refresh",
    actor: SharedBrowserActor,
    settings: RoomSettings["sharedBrowsers"]
  ): Promise<SharedBrowserResult> {
    const current = await this.requireSession(roomId, wallObjectId);
    const ensured = await this.ensureLiveSession(current, settings);
    const session = ensured.session;
    if (session.status !== "active") {
      throw conflict(session.errorMessage || "Shared browser session is unavailable");
    }
    const result = await this.driver.history(session.id, action);
    const updated = await this.repository.updateSharedBrowserSession(session.id, {
      currentUrl: result.url,
      title: result.title,
      lastInputAt: nowIso(),
      updatedAt: nowIso()
    });
    await this.syncWallObjectState(updated);
    return {
      session: updated,
      realtimeMessages: [
        {
          type: "room.shared-browser.history.v1",
          roomId,
          wallObjectId,
          action,
          actedByUserId: actor.userId,
          sentAt: Date.now(),
          senderId: actor.userId
        },
        this.stateMessage(updated, actor.userId)
      ]
    };
  }

  async controlLease(
    roomId: string,
    wallObjectId: string,
    action: "take" | "release" | "renew",
    actor: SharedBrowserActor,
    settings: RoomSettings["sharedBrowsers"]
  ): Promise<SharedBrowserResult> {
    const session = await this.requireSession(roomId, wallObjectId);
    const now = nowIso();
    const expiresAt = new Date(Date.now() + settings.controlLeaseSeconds * 1000).toISOString();
    const heldByActor = session.controlLease?.userId === actor.userId && leaseActive(session.controlLease, now);
    let nextLease: SharedBrowserControlLease | undefined;
    let leaseChanged = true;

    if (action === "take") {
      // Free-for-All is cooperative: "take" is always a takeover. Anyone can grab
      // keyboard control from whoever currently holds it. The previous holder is
      // notified via the control-lease realtime broadcast and simply loses typing.
      nextLease = { userId: actor.userId, displayName: actor.displayName, expiresAt };
    } else if (action === "renew") {
      // Renew only refreshes the lease if the actor still holds it. If someone
      // else took over, renew is a no-op so the 8s client renewal cannot silently
      // steal control back into a tug-of-war.
      if (!heldByActor) {
        return { session, realtimeMessages: [] };
      }
      nextLease = { userId: actor.userId, displayName: actor.displayName, expiresAt };
    } else {
      // release — only the current holder can clear the lease; otherwise no-op.
      if (session.controlLease && !heldByActor) {
        return { session, realtimeMessages: [] };
      }
      nextLease = undefined;
      leaseChanged = Boolean(session.controlLease);
    }

    if (!leaseChanged) {
      return { session, realtimeMessages: [] };
    }

    const updated = await this.repository.updateSharedBrowserSession(session.id, {
      controlLease: nextLease,
      lastInputAt: now,
      updatedAt: now
    });
    await this.syncWallObjectState(updated);
    return {
      session: updated,
      realtimeMessages: [
        {
          type: "room.shared-browser.control-lease.v1",
          roomId,
          wallObjectId,
          controlLease: nextLease ?? null,
          sentAt: Date.now(),
          senderId: actor.userId
        }
      ]
    };
  }

  async resume(
    roomId: string,
    wallObjectId: string,
    actor: SharedBrowserActor,
    settings: RoomSettings["sharedBrowsers"]
  ): Promise<SharedBrowserResult> {
    const session = await this.requireSession(roomId, wallObjectId);
    if (session.status === "active" || session.status === "starting") {
      return { session, realtimeMessages: [] };
    }
    let updated: SharedBrowserSession;
    try {
      const result = await this.driver.start({ session, startUrl: session.currentUrl, navigationGuard: this.guardSettings(settings) });
      updated = await this.repository.updateSharedBrowserSession(session.id, {
        status: "active",
        currentUrl: result.url,
        title: result.title,
        lastInputAt: nowIso(),
        errorCode: undefined,
        errorMessage: undefined,
        updatedAt: nowIso()
      });
    } catch (error) {
      updated = await this.repository.updateSharedBrowserSession(session.id, {
        status: "error",
        errorCode: "driver_resume_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: nowIso()
      });
    }
    await this.syncWallObjectState(updated);
    if (updated.status === "active") this.video?.onSessionActive(updated);
    return {
      session: updated,
      realtimeMessages: [
        {
          type: "room.shared-browser.session.v1",
          roomId,
          wallObjectId,
          status: updated.status,
          sentAt: Date.now(),
          senderId: actor.userId
        },
        this.stateMessage(updated, actor.userId)
      ]
    };
  }

  /**
   * Apply a batch of pointer/keyboard input. Keyboard requires a live control
   * lease held by the actor; pointer events never do. Used by the realtime
   * ingress route (Phase 4).
   */
  async applyInput(
    roomId: string,
    wallObjectId: string,
    pointer: SharedBrowserPointerEvent[],
    keyboard: SharedBrowserKeyEvent[],
    actor: SharedBrowserActor,
    settings: RoomSettings["sharedBrowsers"]
  ): Promise<SharedBrowserResult> {
    const current = await this.requireSession(roomId, wallObjectId);
    const ensured = await this.ensureLiveSession(current, settings);
    const session = ensured.session;
    if (session.status !== "active") {
      return { session, realtimeMessages: [] };
    }
    if (keyboard.length > 0) {
      const now = nowIso();
      if (!leaseActive(session.controlLease, now) || session.controlLease!.userId !== actor.userId) {
        throw forbidden("Keyboard input requires the control lease");
      }
    }

    if (pointer.length > 0) await this.driver.pointer(session.id, pointer);
    if (keyboard.length > 0) await this.driver.keyboard(session.id, keyboard);

    const updated = await this.repository.updateSharedBrowserSession(session.id, {
      lastInputAt: nowIso(),
      updatedAt: nowIso()
    });

    const messages: SharedBrowserRealtimeMessage[] = [];
    if (pointer.length > 0) {
      messages.push({
        type: "room.shared-browser.pointer.v1",
        roomId,
        wallObjectId,
        authorUserId: actor.userId,
        pointer,
        sentAt: Date.now(),
        senderId: actor.userId
      });
    }
    return { session: updated, realtimeMessages: messages };
  }

  /** Stop and remove a session (wall object delete). Safe to call repeatedly. */
  async stopSession(wallObjectId: string): Promise<void> {
    const session = await this.repository.getSharedBrowserSessionByWallObject(wallObjectId);
    if (!session) return;
    this.video?.onSessionInactive(session.id);
    try {
      await this.driver.stop(session.id);
    } catch {
      // best-effort teardown
    }
    await this.repository.deleteSharedBrowserSession(session.id);
  }

  /** Allocate a session id (used by the wall-object create flow). */
  static newSessionId(): string {
    return newId("sbsession");
  }
}
