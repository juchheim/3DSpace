import { describe, expect, it } from "vitest";
import type { SharedBrowserSession } from "@3dspace/contracts";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/repository.js";
import { SharedBrowserIdleReaper } from "../src/shared-browser/idle-reaper.js";
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
}

describe("SharedBrowserIdleReaper.sweep", () => {
  it("pauses sessions idle past the threshold and leaves fresh ones alone", async () => {
    const repository = new MemoryRepository();
    const config = loadConfig({ SHARED_BROWSER_IDLE_PAUSE_MINUTES: "15" });
    const driver = new StopSpyDriver();
    const orchestrator = new SharedBrowserOrchestrator({ repository, config, driver });
    const reaper = new SharedBrowserIdleReaper({ repository, orchestrator, config });

    const now = Date.now();
    const staleIso = new Date(now - 20 * 60_000).toISOString();
    const freshIso = new Date(now - 5 * 60_000).toISOString();

    await repository.createSharedBrowserSession(makeSession({ id: "stale", lastInputAt: staleIso }));
    await repository.createSharedBrowserSession(makeSession({ id: "fresh", wallObjectId: "wo-2", lastInputAt: freshIso }));

    const paused = await reaper.sweep(now);

    expect(paused).toBe(1);
    expect(driver.stopped).toEqual(["stale"]);
    expect((await repository.getSharedBrowserSession("stale"))?.status).toBe("paused");
    expect((await repository.getSharedBrowserSession("fresh"))?.status).toBe("active");
  });

  it("does not re-pause already paused sessions", async () => {
    const repository = new MemoryRepository();
    const config = loadConfig({ SHARED_BROWSER_IDLE_PAUSE_MINUTES: "15" });
    const driver = new StopSpyDriver();
    const orchestrator = new SharedBrowserOrchestrator({ repository, config, driver });
    const reaper = new SharedBrowserIdleReaper({ repository, orchestrator, config });

    const staleIso = new Date(Date.now() - 60 * 60_000).toISOString();
    await repository.createSharedBrowserSession(makeSession({ id: "p", status: "paused", lastInputAt: staleIso }));

    const paused = await reaper.sweep();
    expect(paused).toBe(0);
    expect(driver.stopped).toEqual([]);
  });
});
