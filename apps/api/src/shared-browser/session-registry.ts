import type { Browser, BrowserContext, CDPSession, Page } from "puppeteer";
import type { NavigationGuardSettings } from "./ssrf.js";

/** Live Chromium handles for one session. The DB row remains the source of truth for metadata. */
export type LiveSharedBrowserSession = {
  browser: Browser;
  /** Incognito context isolating this session's cookies/storage from other sessions. */
  context: BrowserContext;
  page: Page;
  cdp?: CDPSession;
  /** Cleared when `screencastLoop` is asked to stop (page closed / session torn down). */
  screencastActive: boolean;
  /** Guard settings captured at start; used to re-validate redirect hops. */
  guard: NavigationGuardSettings;
  viewport: { width: number; height: number };
};

/** In-memory map of `sessionId → live Chromium handles`. */
export class LiveSessionRegistry {
  private readonly sessions = new Map<string, LiveSharedBrowserSession>();

  set(sessionId: string, handle: LiveSharedBrowserSession): void {
    this.sessions.set(sessionId, handle);
  }

  get(sessionId: string): LiveSharedBrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  ids(): string[] {
    return [...this.sessions.keys()];
  }
}
