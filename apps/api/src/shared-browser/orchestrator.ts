import type {
  RoomSettings,
  SharedBrowserControlLease,
  SharedBrowserRealtimeMessage,
  SharedBrowserSession,
  SharedBrowserWallObjectState
} from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { conflict, notFound } from "../errors.js";
import { newId, nowIso, type Repository, type SharedBrowserSessionPatch } from "../repository.js";
import { hyperbeamGetVm, hyperbeamTerminateVm } from "./hyperbeam-api.js";
import { HyperbeamSharedBrowserDriver } from "./hyperbeam-driver.js";
import { assertNavigationAllowed, type NavigationGuardSettings } from "./ssrf.js";
import { StubSharedBrowserDriver } from "./stub-driver.js";
import type { DriverStartResult, SharedBrowserDriver } from "./types.js";

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

export type SharedBrowserOrchestratorOptions = {
  repository: Repository;
  config: AppConfig;
  /** Defaults to stub when omitted; production uses Hyperbeam when `HYPERBEAM_API_KEY` is set. */
  driver?: SharedBrowserDriver;
};

function leaseActive(lease: SharedBrowserControlLease | undefined, atIso: string): boolean {
  return !!lease && lease.expiresAt > atIso;
}

export class SharedBrowserOrchestrator {
  private readonly repository: Repository;
  private readonly config: AppConfig;
  private readonly driver: SharedBrowserDriver;

  constructor(options: SharedBrowserOrchestratorOptions) {
    this.repository = options.repository;
    this.config = options.config;
    this.driver = options.driver ?? new StubSharedBrowserDriver();
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

  private usesHyperbeam(): boolean {
    return Boolean(this.config.tuning.hyperbeamApiKey);
  }

  private patchFromDriverStart(result: DriverStartResult): SharedBrowserSessionPatch {
    const patch: SharedBrowserSessionPatch = {
      status: "active",
      currentUrl: result.url,
      title: result.title,
      lastInputAt: nowIso(),
      errorCode: undefined,
      errorMessage: undefined,
      updatedAt: nowIso()
    };
    if (result.hyperbeam) {
      patch.hyperbeam = {
        sessionId: result.hyperbeam.sessionId,
        ...(result.hyperbeam.embedUrl ? { embedUrl: result.hyperbeam.embedUrl } : {})
      };
      patch.unsetLivekit = true;
    }
    return patch;
  }

  private async terminateRemoteHyperbeam(hyperbeamSessionId: string): Promise<void> {
    const apiKey = this.config.tuning.hyperbeamApiKey;
    if (!apiKey) return;
    try {
      await hyperbeamTerminateVm(this.config.tuning.hyperbeamApiBase, apiKey, hyperbeamSessionId);
    } catch {
      // best-effort
    }
  }

  private async startDriver(
    session: SharedBrowserSession,
    startUrl: string,
    settings: RoomSettings["sharedBrowsers"]
  ): Promise<DriverStartResult> {
    if (
      session.hyperbeam?.sessionId &&
      this.driver instanceof HyperbeamSharedBrowserDriver
    ) {
      const attached = await this.driver.attachExisting(session.id, session.hyperbeam.sessionId);
      if (attached) {
        return {
          url: session.currentUrl,
          title: session.title,
          hyperbeam: {
            sessionId: session.hyperbeam.sessionId,
            embedUrl: session.hyperbeam.embedUrl ?? "",
            adminToken: "" // re-attach uses in-memory admin token from Hyperbeam GET /vm
          }
        };
      }
      await this.terminateRemoteHyperbeam(session.hyperbeam.sessionId);
    }
    return this.driver.start({
      session,
      startUrl,
      navigationGuard: this.guardSettings(settings)
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
    const senderId = input.createdBy.userId;
    const session: SharedBrowserSession = {
      id: input.sessionId,
      roomId: input.roomId,
      wallObjectId: input.wallObjectId,
      createdByUserId: input.createdBy.userId,
      status: "starting",
      currentUrl: input.startUrl,
      title: "",
      viewport: { width: input.settings.viewportWidth, height: input.settings.viewportHeight },
      lastInputAt: now,
      createdAt: now,
      updatedAt: now
    };

    // Lazy start: persist the session as paused and defer Hyperbeam until someone
    // resumes, navigates, or sends input. This avoids launching a browser for
    // every board placed on a wall while the room is empty or unused.
    if (this.config.tuning.sharedBrowserLazyStart) {
      const paused: SharedBrowserSession = { ...session, status: "paused", updatedAt: now };
      await this.repository.createSharedBrowserSession(paused);
      await this.syncWallObjectState(paused);
      return {
        session: paused,
        realtimeMessages: [
          {
            type: "room.shared-browser.session.v1",
            roomId: paused.roomId,
            wallObjectId: paused.wallObjectId,
            status: paused.status,
            sentAt: Date.now(),
            senderId
          },
          this.stateMessage(paused, senderId)
        ]
      };
    }

    await this.repository.createSharedBrowserSession(session);

    // Eager start: launch Hyperbeam immediately on board creation.
    let active: SharedBrowserSession;
    try {
      const result = await this.startDriver(session, input.startUrl, input.settings);
      active = await this.repository.updateSharedBrowserSession(session.id, this.patchFromDriverStart(result));
    } catch (error) {
      active = await this.repository.updateSharedBrowserSession(session.id, {
        status: "error",
        errorCode: "driver_start_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: nowIso()
      });
    }
    await this.syncWallObjectState(active);

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

  /**
   * Tear down the live Hyperbeam VM and mark paused.
   * Idempotent for already-paused/stopped sessions.
   */
  async pauseSession(session: SharedBrowserSession): Promise<boolean> {
    if (session.status === "paused" || session.status === "stopped") return false;
    try {
      await this.driver.stop(session.id);
    } catch {
      // best-effort teardown
    }
    if (session.hyperbeam?.sessionId) {
      await this.terminateRemoteHyperbeam(session.hyperbeam.sessionId);
    }
    const updated = await this.repository.updateSharedBrowserSession(session.id, {
      status: "paused",
      updatedAt: nowIso(),
      unsetHyperbeam: true,
      unsetLivekit: true
    });
    await this.syncWallObjectState(updated);
    return true;
  }

  /** Pause every live browser in rooms with no recent participant heartbeats. */
  async pauseLiveSessionsInEmptyRooms(): Promise<number> {
    if (!this.config.tuning.sharedBrowserPauseWhenRoomEmpty) return 0;
    const live = await this.repository.listLiveSharedBrowserSessions();
    const byRoom = new Map<string, SharedBrowserSession[]>();
    for (const session of live) {
      const list = byRoom.get(session.roomId) ?? [];
      list.push(session);
      byRoom.set(session.roomId, list);
    }
    let paused = 0;
    for (const [roomId, sessions] of byRoom) {
      const occupants = await this.repository.countActiveRoomParticipants(roomId);
      if (occupants > 0) continue;
      for (const session of sessions) {
        if (await this.pauseSession(session)) paused += 1;
      }
    }
    return paused;
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
    const live = this.driver.isLive?.(session.id) ?? session.status === "active";
    if (session.status === "active" && live) {
      return { session, recovered: false };
    }

    try {
      const result = await this.startDriver(session, session.currentUrl, settings);
      const updated = await this.repository.updateSharedBrowserSession(session.id, this.patchFromDriverStart(result));
      await this.syncWallObjectState(updated);
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

  /**
   * Refresh the client embed URL from Hyperbeam (e.g. after token expiry).
   * No-op when the session has no live Hyperbeam VM.
   */
  async refreshEmbed(roomId: string, wallObjectId: string): Promise<SharedBrowserResult> {
    const session = await this.requireSession(roomId, wallObjectId);
    const hyperbeamSessionId = session.hyperbeam?.sessionId;
    if (!hyperbeamSessionId || session.status !== "active") {
      throw conflict("Shared browser is not live");
    }
    const apiKey = this.config.tuning.hyperbeamApiKey;
    if (!apiKey) throw conflict("Hyperbeam is not configured");

    const remote = await hyperbeamGetVm(
      this.config.tuning.hyperbeamApiBase,
      apiKey,
      hyperbeamSessionId
    );
    if (!remote || remote.termination_date) {
      throw conflict("Hyperbeam session is no longer live");
    }

    const updated = await this.repository.updateSharedBrowserSession(session.id, {
      hyperbeam: { sessionId: remote.session_id, embedUrl: remote.embed_url },
      updatedAt: nowIso()
    });
    await this.syncWallObjectState(updated);
    return { session: updated, realtimeMessages: [] };
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
      const result = await this.startDriver(session, session.currentUrl, settings);
      updated = await this.repository.updateSharedBrowserSession(session.id, this.patchFromDriverStart(result));
    } catch (error) {
      updated = await this.repository.updateSharedBrowserSession(session.id, {
        status: "error",
        errorCode: "driver_resume_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: nowIso()
      });
    }
    await this.syncWallObjectState(updated);
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

  /** Stop and remove a session (wall object delete). Safe to call repeatedly. */
  async stopSession(wallObjectId: string): Promise<void> {
    const session = await this.repository.getSharedBrowserSessionByWallObject(wallObjectId);
    if (!session) return;
    try {
      await this.driver.stop(session.id);
    } catch {
      // best-effort teardown
    }
    if (session.hyperbeam?.sessionId) {
      await this.terminateRemoteHyperbeam(session.hyperbeam.sessionId);
    }
    await this.repository.deleteSharedBrowserSession(session.id);
  }

  /** Allocate a session id (used by the wall-object create flow). */
  static newSessionId(): string {
    return newId("sbsession");
  }
}
