import type { SharedBrowserKeyEvent, SharedBrowserPointerEvent, SharedBrowserSession } from "@3dspace/contracts";
import type { NavigationGuardSettings } from "./ssrf.js";

export type DriverStartOptions = {
  session: SharedBrowserSession;
  startUrl: string;
  /** SSRF guard settings; the driver re-applies these to every redirect hop. */
  navigationGuard: NavigationGuardSettings;
};

/**
 * The single driver abstraction for the shared browser. v1 ships exactly two
 * implementations: a no-Chromium stub (used in tests and when the feature is
 * disabled) and the self-hosted Puppeteer driver (Phase 3). There is
 * intentionally NO third-party / SaaS backend — see the IMPL doc § D.
 */
export interface SharedBrowserDriver {
  start(options: DriverStartOptions): Promise<{ url: string; title: string }>;
  stop(sessionId: string): Promise<void>;
  navigate(sessionId: string, url: string): Promise<{ url: string; title: string }>;
  history(sessionId: string, action: "back" | "forward" | "refresh"): Promise<{ url: string; title: string }>;
  pointer(sessionId: string, events: SharedBrowserPointerEvent[]): Promise<void>;
  keyboard(sessionId: string, events: SharedBrowserKeyEvent[]): Promise<void>;
  /**
   * Begin a screencast loop, invoking `onFrame` with each JPEG buffer. Phase 5
   * wires this to LiveKit / the JPEG fallback. The stub never emits frames.
   */
  screencastLoop(sessionId: string, onFrame: (jpeg: Buffer) => void): Promise<void>;
  /** Tear down all live resources (called on app shutdown). Optional — the stub has none. */
  close?(): Promise<void>;
}
