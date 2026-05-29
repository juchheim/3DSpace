import type { SharedBrowserKeyEvent, SharedBrowserPointerEvent } from "@3dspace/contracts";
import type { DriverStartOptions, SharedBrowserDriver } from "./types.js";

/**
 * No-Chromium driver. Tracks the current URL/title in memory and derives a
 * title from the hostname. Used in tests and as the Phase 2 default before the
 * Puppeteer driver lands. Pointer/keyboard/screencast are no-ops.
 */
export class StubSharedBrowserDriver implements SharedBrowserDriver {
  private urls = new Map<string, string>();

  private titleFor(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  async start(options: DriverStartOptions): Promise<{ url: string; title: string }> {
    this.urls.set(options.session.id, options.startUrl);
    return { url: options.startUrl, title: this.titleFor(options.startUrl) };
  }

  async stop(sessionId: string): Promise<void> {
    this.urls.delete(sessionId);
  }

  isLive(sessionId: string): boolean {
    return this.urls.has(sessionId);
  }

  async navigate(sessionId: string, url: string): Promise<{ url: string; title: string }> {
    this.urls.set(sessionId, url);
    return { url, title: this.titleFor(url) };
  }

  async history(sessionId: string): Promise<{ url: string; title: string }> {
    const url = this.urls.get(sessionId) ?? "";
    return { url, title: this.titleFor(url) };
  }

  async pointer(_sessionId: string, _events: SharedBrowserPointerEvent[]): Promise<void> {
    // no-op
  }

  async keyboard(_sessionId: string, _events: SharedBrowserKeyEvent[]): Promise<void> {
    // no-op
  }

  async screencastLoop(_sessionId: string, _onFrame: (jpeg: Buffer) => void): Promise<void> {
    // no-op — the stub never produces frames.
  }
}
