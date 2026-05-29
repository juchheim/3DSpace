import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { HyperbeamSharedBrowserDriver, hyperbeamSessionTimeouts } from "../src/shared-browser/hyperbeam-driver.js";
import { ROOM_SESSION_PRESENCE_MS } from "../src/repository.js";
import type { SharedBrowserSession } from "@3dspace/contracts";

function sessionFixture(): SharedBrowserSession {
  const now = new Date().toISOString();
  return {
    id: "sbsession_test",
    roomId: "room_test",
    wallObjectId: "wo_test",
    createdByUserId: "user_test",
    status: "paused",
    currentUrl: "https://example.com/",
    title: "",
    viewport: { width: 1280, height: 720 },
    lastInputAt: now,
    createdAt: now,
    updatedAt: now
  };
}

describe("hyperbeamSessionTimeouts", () => {
  it("aligns offline with room presence TTL and empty with idle pause", () => {
    const config = loadConfig({
      HYPERBEAM_API_KEY: "hb_test_key",
      SHARED_BROWSER_IDLE_PAUSE_MINUTES: "15"
    } as NodeJS.ProcessEnv);
    expect(hyperbeamSessionTimeouts(config)).toEqual({
      offline: Math.max(60, Math.ceil(ROOM_SESSION_PRESENCE_MS / 1000)),
      empty: 15 * 60
    });
  });
});

describe("HyperbeamSharedBrowserDriver", () => {
  const config = loadConfig({
    HYPERBEAM_API_KEY: "hb_test_key",
    HYPERBEAM_API_BASE: "https://engine.hyperbeam.com",
    SHARED_BROWSER_HYPERBEAM_QUALITY: "smooth",
    SHARED_BROWSER_HYPERBEAM_FRAMERATE: "30",
    SHARED_BROWSER_IDLE_PAUSE_MINUTES: "15"
  } as NodeJS.ProcessEnv);

  it("creates a VM and registers it for navigate/stop", async () => {
    let createBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v0/vm") && init?.method === "POST") {
        createBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            session_id: "hb_sess_1",
            embed_url: "https://embed.hyperbeam.test/room?token=viewer",
            admin_token: "admin_tok"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/v0/vm/hb_sess_1") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ session_id: "hb_sess_1" }), { status: 200 });
      }
      if (url.endsWith("/tabs.update")) {
        return new Response(JSON.stringify({ id: 1, url: "https://example.org/", title: "Example" }), {
          status: 200
        });
      }
      if (url.endsWith("/tabs.query")) {
        return new Response(JSON.stringify([{ url: "https://example.org/", title: "Example" }]), {
          status: 200
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const driver = new HyperbeamSharedBrowserDriver({ config, fetchImpl });
    const session = sessionFixture();
    const started = await driver.start({
      session,
      startUrl: "https://example.com/",
      navigationGuard: { allowlistEnabled: false, allowlist: [], blockedHostSuffixes: [], allowInsecureLocal: false }
    });

    expect(createBody?.timeout).toEqual(hyperbeamSessionTimeouts(config));
    expect(started.hyperbeam?.sessionId).toBe("hb_sess_1");
    expect(started.hyperbeam?.embedUrl).toContain("embed.hyperbeam.test");
    expect(driver.isLive(session.id)).toBe(true);

    const navigated = await driver.navigate(session.id, "https://example.org/");
    expect(navigated.url).toBe("https://example.org/");

    await driver.stop(session.id);
    expect(driver.isLive(session.id)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://engine.hyperbeam.com/v0/vm/hb_sess_1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("runs history actions against the session admin API", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v0/vm") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            session_id: "hb_sess_2",
            embed_url: "https://embed.hyperbeam.test/s2?token=viewer",
            admin_token: "admin_tok"
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/tabs.goBack")) {
        return new Response("{}", { status: 200 });
      }
      if (url.endsWith("/tabs.query")) {
        return new Response(JSON.stringify([{ url: "https://example.com/back", title: "Back" }]), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const driver = new HyperbeamSharedBrowserDriver({ config, fetchImpl });
    const session = sessionFixture();
    await driver.start({
      session,
      startUrl: "https://example.com/",
      navigationGuard: { allowlistEnabled: false, allowlist: [], blockedHostSuffixes: [], allowInsecureLocal: false }
    });

    const result = await driver.history(session.id, "back");
    expect(result.url).toBe("https://example.com/back");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://embed.hyperbeam.test/s2/tabs.goBack",
      expect.objectContaining({ method: "POST" })
    );
  });
});
