import { describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "../src/repository.js";
import { loadConfig } from "../src/config.js";
import { SharedBrowserOrchestrator } from "../src/shared-browser/orchestrator.js";
import type { SharedBrowserDriver, DriverStartOptions, DriverStartResult } from "../src/shared-browser/types.js";

vi.mock("../src/shared-browser/hyperbeam-api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/shared-browser/hyperbeam-api.js")>();
  return {
    ...actual,
    hyperbeamGetVm: vi.fn()
  };
});

import { hyperbeamGetVm } from "../src/shared-browser/hyperbeam-api.js";

class MockHyperbeamDriver implements SharedBrowserDriver {
  stopped: string[] = [];
  live = new Set<string>();

  async start(options: DriverStartOptions): Promise<DriverStartResult> {
    this.live.add(options.session.id);
    return {
      url: options.startUrl,
      title: "example",
      hyperbeam: {
        sessionId: `hb_${options.session.id}`,
        embedUrl: "https://embed.hyperbeam.test/?token=x",
        adminToken: "admin"
      }
    };
  }

  async stop(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
    this.live.delete(sessionId);
  }

  isLive(sessionId: string): boolean {
    return this.live.has(sessionId);
  }

  async navigate(sessionId: string, url: string) {
    if (!this.live.has(sessionId)) throw new Error("not live");
    return { url, title: "example" };
  }

  async history(sessionId: string) {
    return { url: "https://example.com/", title: "example" };
  }
}

describe("SharedBrowserOrchestrator (Hyperbeam)", () => {
  const config = loadConfig({
    HYPERBEAM_API_KEY: "hb_test",
    ENABLE_SHARED_BROWSERS: "true",
    SHARED_BROWSER_LAZY_START: "true"
  } as NodeJS.ProcessEnv);

  it("persists hyperbeam metadata on resume and clears it on pause", async () => {
    const repository = new MemoryRepository();
    const driver = new MockHyperbeamDriver();
    const orchestrator = new SharedBrowserOrchestrator({ repository, config, driver });
    const now = new Date().toISOString();

    await repository.createSharedBrowserSession({
      id: "sbsession_1",
      roomId: "room_1",
      wallObjectId: "wo_1",
      createdByUserId: "user_1",
      status: "paused",
      currentUrl: "https://example.com/",
      title: "",
      viewport: { width: 1280, height: 720 },
      lastInputAt: now,
      createdAt: now,
      updatedAt: now
    });

    const resumed = await orchestrator.resume("room_1", "wo_1", { userId: "user_1", displayName: "Ada" }, {
      enabled: true,
      maxActivePerRoom: 2,
      defaultStartUrl: "https://www.wikipedia.org",
      viewportWidth: 1280,
      viewportHeight: 720,
      idlePauseMinutes: 15,
      navigationAllowlistEnabled: false,
      navigationAllowlist: [],
      controlLeaseSeconds: 120,
      hyperbeamQuality: "smooth",
      hyperbeamFramerate: 30
    });

    expect(resumed.session.status).toBe("active");
    expect(resumed.session.hyperbeam?.sessionId).toBe("hb_sbsession_1");
    expect(resumed.session.hyperbeam?.embedUrl).toContain("embed.hyperbeam.test");
    expect(resumed.session.livekit).toBeUndefined();

    const paused = await orchestrator.pauseSession(resumed.session);
    expect(paused).toBe(true);
    expect(driver.stopped).toContain("sbsession_1");

    const stored = await repository.getSharedBrowserSession("sbsession_1");
    expect(stored?.status).toBe("paused");
    expect(stored?.hyperbeam).toBeUndefined();
  });

  it("refreshEmbed updates embedUrl from Hyperbeam GET /vm", async () => {
    vi.mocked(hyperbeamGetVm).mockResolvedValue({
      session_id: "hb_sbsession_1",
      embed_url: "https://embed.hyperbeam.test/refreshed?token=new",
      admin_token: "admin2"
    });

    const repository = new MemoryRepository();
    const driver = new MockHyperbeamDriver();
    const orchestrator = new SharedBrowserOrchestrator({ repository, config, driver });
    const now = new Date().toISOString();

    await repository.createSharedBrowserSession({
      id: "sbsession_1",
      roomId: "room_1",
      wallObjectId: "wo_1",
      createdByUserId: "user_1",
      status: "active",
      currentUrl: "https://example.com/",
      title: "example",
      viewport: { width: 1280, height: 720 },
      hyperbeam: { sessionId: "hb_sbsession_1", embedUrl: "https://embed.hyperbeam.test/old?token=old" },
      lastInputAt: now,
      createdAt: now,
      updatedAt: now
    });

    const refreshed = await orchestrator.refreshEmbed("room_1", "wo_1");
    expect(refreshed.session.hyperbeam?.embedUrl).toBe("https://embed.hyperbeam.test/refreshed?token=new");
  });
});
