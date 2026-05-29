import type { DriverStartOptions, SharedBrowserDriver } from "./types.js";

/**
 * Offline driver for tests and local dev without `HYPERBEAM_API_KEY`. Tracks URL/title
 * in memory only; navigation is not executed against a real browser.
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

  async history(sessionId: string, _action: "back" | "forward" | "refresh"): Promise<{ url: string; title: string }> {
    const url = this.urls.get(sessionId) ?? "";
    return { url, title: this.titleFor(url) };
  }
}
