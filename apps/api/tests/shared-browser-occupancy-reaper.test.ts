import { describe, expect, it } from "vitest";
import type { SharedBrowserSession } from "@3dspace/contracts";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/repository.js";
import { SharedBrowserOccupancyReaper } from "../src/shared-browser/occupancy-reaper.js";
import { SharedBrowserOrchestrator } from "../src/shared-browser/orchestrator.js";
import type { SharedBrowserDriver } from "../src/shared-browser/types.js";

function makeSession(overrides: Partial<SharedBrowserSession> = {}): SharedBrowserSession {
  const now = new Date().toISOString();
  return {
    id: "sb-1",
    roomId: "room-1",
    wallObjectId: "wo-1",
    createdByUserId: "user-1",
    status: "active",
    currentUrl: "https://1.1.1.1/",
    title: "",
    viewport: { width: 1280, height: 720 },
    lastInputAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

class StopSpyDriver implements SharedBrowserDriver {
  stopped: string[] = [];
  async start() {
    return { url: "https://1.1.1.1/", title: "" };
  }
  async stop(sessionId: string) {
    this.stopped.push(sessionId);
  }
  async navigate() {
    return { url: "https://1.1.1.1/", title: "" };
  }
  async history() {
    return { url: "https://1.1.1.1/", title: "" };
  }
  isLive() {
    return true;
  }
}

describe("SharedBrowserOccupancyReaper.sweep", () => {
  it("pauses live browsers when the room has no active participants", async () => {
    const repository = new MemoryRepository();
    const config = loadConfig({ SHARED_BROWSER_PAUSE_WHEN_ROOM_EMPTY: "true" });
    const driver = new StopSpyDriver();
    const orchestrator = new SharedBrowserOrchestrator({ repository, config, driver });
    const reaper = new SharedBrowserOccupancyReaper({ orchestrator });

    await repository.createSharedBrowserSession(makeSession({ id: "live" }));

    const paused = await reaper.sweep();
    expect(paused).toBe(1);
    expect(driver.stopped).toEqual(["live"]);
    expect((await repository.getSharedBrowserSession("live"))?.status).toBe("paused");
  });

  it("leaves browsers running while participants are present", async () => {
    const repository = new MemoryRepository();
    const config = loadConfig({ SHARED_BROWSER_PAUSE_WHEN_ROOM_EMPTY: "true" });
    const driver = new StopSpyDriver();
    const orchestrator = new SharedBrowserOrchestrator({ repository, config, driver });
    const reaper = new SharedBrowserOccupancyReaper({ orchestrator });

    await repository.createSharedBrowserSession(makeSession({ id: "live" }));
    await repository.recordRoomSession({
      roomId: "room-1",
      participantIdentity: "user-1:room-1",
      userId: "user-1",
      role: "student",
      maxParticipants: 32
    });

    const paused = await reaper.sweep();
    expect(paused).toBe(0);
    expect(driver.stopped).toEqual([]);
    expect((await repository.getSharedBrowserSession("live"))?.status).toBe("active");
  });
});
