import { existsSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SharedBrowserSession } from "@3dspace/contracts";
import { loadConfig } from "../src/config.js";
import { PuppeteerSharedBrowserDriver } from "../src/shared-browser/puppeteer-driver.js";
import type { NavigationGuardSettings } from "../src/shared-browser/ssrf.js";

// The bundled Chromium is large and may be absent in some CI lanes. Gate the
// whole suite on its presence rather than failing when it cannot launch.
let chromiumAvailable = false;
try {
  const { default: puppeteer } = await import("puppeteer");
  const path = puppeteer.executablePath();
  chromiumAvailable = Boolean(path) && existsSync(path);
} catch {
  chromiumAvailable = false;
}

const describeIfChromium = chromiumAvailable ? describe : describe.skip;

function makeSession(): SharedBrowserSession {
  const now = new Date().toISOString();
  return {
    id: "sb-int-1",
    roomId: "room-1",
    wallObjectId: "wo-1",
    createdByUserId: "user-1",
    status: "starting",
    currentUrl: "https://example.invalid/",
    title: "",
    viewport: { width: 800, height: 600 },
    lastInputAt: now,
    createdAt: now,
    updatedAt: now
  };
}

// Allow loopback so the driver can reach the test HTTP server without hitting
// the network or tripping the SSRF guard.
const localGuard: NavigationGuardSettings = {
  allowlistEnabled: false,
  allowlist: [],
  blockedHostSuffixes: [],
  allowInsecureLocal: true
};

describeIfChromium("PuppeteerSharedBrowserDriver (integration)", () => {
  let server: http.Server;
  let baseUrl: string;
  let driver: PuppeteerSharedBrowserDriver;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const page = req.url === "/two" ? "Page Two" : "Page One";
      res.setHeader("content-type", "text/html");
      res.end(`<!doctype html><html><head><title>${page}</title></head><body>${page}</body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    driver = new PuppeteerSharedBrowserDriver({ config: loadConfig({}) });
  }, 60_000);

  afterAll(async () => {
    await driver?.close?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("launches a page and reports url + title", async () => {
    const result = await driver.start({
      session: makeSession(),
      startUrl: `${baseUrl}/`,
      navigationGuard: localGuard
    });
    expect(result.url).toBe(`${baseUrl}/`);
    expect(result.title).toBe("Page One");
  }, 60_000);

  it("navigates to a new url within the live session", async () => {
    const result = await driver.navigate("sb-int-1", `${baseUrl}/two`);
    expect(result.url).toBe(`${baseUrl}/two`);
    expect(result.title).toBe("Page Two");
  }, 30_000);

  it("walks history back to the first page", async () => {
    const result = await driver.history("sb-int-1", "back");
    expect(result.title).toBe("Page One");
  }, 30_000);

  it("throws when operating on a stopped session", async () => {
    await driver.stop("sb-int-1");
    await expect(driver.navigate("sb-int-1", `${baseUrl}/`)).rejects.toThrow(/not live/);
  }, 30_000);
});
