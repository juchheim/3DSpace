import { Buffer } from "node:buffer";
import puppeteer, { type Browser, type KeyInput, type Page } from "puppeteer";
import type { SharedBrowserKeyEvent, SharedBrowserPointerEvent } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { LiveSessionRegistry } from "./session-registry.js";
import { assertNavigationAllowed, type NavigationGuardSettings } from "./ssrf.js";
import type { DriverStartOptions, SharedBrowserDriver } from "./types.js";

const NAV_TIMEOUT_MS = 30_000;

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check"
];

async function safeTitle(page: Page): Promise<string> {
  try {
    return await page.title();
  } catch {
    return "";
  }
}

/**
 * Self-hosted Chromium driver. Launches one headless browser process and gives
 * each session its own incognito context + page. There is intentionally NO
 * third-party / SaaS backend — bundled Chromium via Puppeteer only.
 */
export class PuppeteerSharedBrowserDriver implements SharedBrowserDriver {
  private browserPromise: Promise<Browser> | null = null;
  private readonly registry: LiveSessionRegistry;
  private readonly executablePath: string | undefined;

  constructor(options: { config: AppConfig; registry?: LiveSessionRegistry }) {
    this.registry = options.registry ?? new LiveSessionRegistry();
    this.executablePath = options.config.tuning.sharedBrowserChromiumExecutable || undefined;
  }

  private async browser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        headless: true,
        ...(this.executablePath ? { executablePath: this.executablePath } : {}),
        args: LAUNCH_ARGS
      });
    }
    return this.browserPromise;
  }

  async start(options: DriverStartOptions): Promise<{ url: string; title: string }> {
    const browser = await this.browser();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const viewport = { width: options.session.viewport.width, height: options.session.viewport.height };
    await page.setViewport(viewport);

    const cdp = await page.createCDPSession();
    await cdp.send("Page.setDownloadBehavior", { behavior: "deny" }).catch(() => undefined);

    await this.installNavigationGuard(page, options.navigationGuard);

    this.registry.set(options.session.id, {
      browser,
      context,
      page,
      cdp,
      screencastActive: false,
      guard: options.navigationGuard,
      viewport
    });

    return this.gotoSafe(page, options.startUrl);
  }

  /** Abort any main-frame navigation (including redirect hops) to a disallowed host. */
  private async installNavigationGuard(page: Page, guard: NavigationGuardSettings): Promise<void> {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      void (async () => {
        const isMainNavigation = req.isNavigationRequest() && req.frame() === page.mainFrame();
        if (!isMainNavigation) {
          await req.continue().catch(() => undefined);
          return;
        }
        try {
          await assertNavigationAllowed(req.url(), guard);
          await req.continue();
        } catch {
          await req.abort("blockedbyclient").catch(() => undefined);
        }
      })();
    });
  }

  private async gotoSafe(page: Page, url: string): Promise<{ url: string; title: string }> {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    } catch {
      // Blocked redirect, timeout, or transient error — keep whatever the page settled on.
    }
    return { url: page.url(), title: await safeTitle(page) };
  }

  async navigate(sessionId: string, url: string): Promise<{ url: string; title: string }> {
    const live = this.registry.get(sessionId);
    if (!live) throw new Error("Shared browser session is not live");
    return this.gotoSafe(live.page, url);
  }

  isLive(sessionId: string): boolean {
    return this.registry.has(sessionId);
  }

  async history(sessionId: string, action: "back" | "forward" | "refresh"): Promise<{ url: string; title: string }> {
    const live = this.registry.get(sessionId);
    if (!live) throw new Error("Shared browser session is not live");
    const { page } = live;
    try {
      if (action === "back") await page.goBack({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      else if (action === "forward") await page.goForward({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      else await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    } catch {
      // No history entry or transient error — fall through to the current state.
    }
    return { url: page.url(), title: await safeTitle(page) };
  }

  async pointer(sessionId: string, events: SharedBrowserPointerEvent[]): Promise<void> {
    const live = this.registry.get(sessionId);
    if (!live) return;
    const { page, viewport } = live;
    for (const event of events) {
      const x = Math.round(event.x * viewport.width);
      const y = Math.round(event.y * viewport.height);
      const button = event.button ?? "left";
      try {
        if (event.kind === "move") {
          await page.mouse.move(x, y);
        } else if (event.kind === "down") {
          await page.mouse.move(x, y);
          await page.mouse.down({ button });
        } else if (event.kind === "up") {
          await page.mouse.move(x, y);
          await page.mouse.up({ button });
        } else if (event.kind === "wheel") {
          await page.mouse.move(x, y);
          await page.mouse.wheel({ deltaX: event.deltaX ?? 0, deltaY: event.deltaY ?? 0 });
        }
      } catch {
        // Drop individual input errors rather than failing the whole batch.
      }
    }
  }

  async keyboard(sessionId: string, events: SharedBrowserKeyEvent[]): Promise<void> {
    const live = this.registry.get(sessionId);
    if (!live) return;
    const { page } = live;
    for (const event of events) {
      try {
        if (event.kind === "char") {
          if (event.text) await page.keyboard.sendCharacter(event.text);
        } else if (event.kind === "down") {
          await page.keyboard.down(event.key as KeyInput);
        } else if (event.kind === "up") {
          await page.keyboard.up(event.key as KeyInput);
        }
      } catch {
        // Ignore unknown keys / transient errors.
      }
    }
  }

  async screencastLoop(sessionId: string, onFrame: (jpeg: Buffer) => void): Promise<void> {
    const live = this.registry.get(sessionId);
    if (!live) return;
    const cdp = live.cdp ?? (await live.page.createCDPSession());
    live.cdp = cdp;
    live.screencastActive = true;
    cdp.on("Page.screencastFrame", (frame: { data: string; sessionId: number }) => {
      if (!live.screencastActive) return;
      try {
        onFrame(Buffer.from(frame.data, "base64"));
      } catch {
        // Consumer error — keep acking so the screencast does not stall.
      }
      void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 });
  }

  async stop(sessionId: string): Promise<void> {
    const live = this.registry.get(sessionId);
    if (!live) return;
    this.registry.delete(sessionId);
    live.screencastActive = false;
    if (live.cdp) await live.cdp.send("Page.stopScreencast").catch(() => undefined);
    await live.context.close().catch(() => undefined);
  }

  async close(): Promise<void> {
    for (const sessionId of this.registry.ids()) {
      await this.stop(sessionId);
    }
    if (this.browserPromise) {
      const browser = await this.browserPromise.catch(() => null);
      this.browserPromise = null;
      if (browser) await browser.close().catch(() => undefined);
    }
  }
}
