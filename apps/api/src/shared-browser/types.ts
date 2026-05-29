import type { SharedBrowserSession } from "@3dspace/contracts";
import type { NavigationGuardSettings } from "./ssrf.js";

export type DriverStartOptions = {
  session: SharedBrowserSession;
  startUrl: string;
  /** SSRF guard settings; the driver re-applies these to every redirect hop. */
  navigationGuard: NavigationGuardSettings;
};

export type DriverStartResult = {
  url: string;
  title: string;
  hyperbeam?: {
    sessionId: string;
    embedUrl: string;
    /** Server-only; never returned to API clients. */
    adminToken: string;
  };
};

/** Driver abstraction for the shared browser (Hyperbeam production, stub for tests). */
export interface SharedBrowserDriver {
  start(options: DriverStartOptions): Promise<DriverStartResult>;
  stop(sessionId: string): Promise<void>;
  isLive?(sessionId: string): boolean;
  navigate(sessionId: string, url: string): Promise<{ url: string; title: string }>;
  history(sessionId: string, action: "back" | "forward" | "refresh"): Promise<{ url: string; title: string }>;
  /** Tear down all live resources (called on app shutdown). Optional — the stub has none. */
  close?(): Promise<void>;
}
