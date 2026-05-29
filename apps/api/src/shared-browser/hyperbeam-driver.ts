import type { AppConfig } from "../config.js";
import { ROOM_SESSION_PRESENCE_MS } from "../repository.js";
import {
  hyperbeamCreateVm,
  hyperbeamEmbedBaseUrl,
  hyperbeamGetVm,
  hyperbeamSessionRequest,
  hyperbeamTerminateVm,
  titleFromUrl,
  type HyperbeamVmCreateBody
} from "./hyperbeam-api.js";
import type { DriverStartOptions, DriverStartResult, SharedBrowserDriver } from "./types.js";

type LiveHyperbeamSession = {
  hyperbeamSessionId: string;
  adminToken: string;
  baseUrl: string;
  currentUrl: string;
  title: string;
};

export type HyperbeamSharedBrowserDriverOptions = {
  config: AppConfig;
  fetchImpl?: typeof fetch;
};

/**
 * Hyperbeam-backed shared browser driver. The API creates cloud Chromium VMs via
 * the dispatch REST API and controls navigation through per-session admin endpoints.
 */
/** Hyperbeam VM timeouts aligned with 3DSpace reapers (see IMPL Hyperbeam Phase 6). */
export function hyperbeamSessionTimeouts(config: AppConfig) {
  const inactiveSeconds = Math.max(60, config.tuning.sharedBrowserIdlePauseMinutes * 60);
  const offlineSeconds = Math.max(60, Math.ceil(ROOM_SESSION_PRESENCE_MS / 1000));
  return { offline: offlineSeconds, inactive: inactiveSeconds };
}

const HYPERBEAM_REGIONS = new Set(["NA", "EU", "AS"]);

function hyperbeamRegion(region: string | undefined): string | undefined {
  const normalized = region?.trim().toUpperCase();
  if (!normalized || !HYPERBEAM_REGIONS.has(normalized)) return undefined;
  return normalized;
}

/**
 * Hyperbeam's default/free-tier `max_area` is 1280×720 (921,600 px). Requesting a
 * larger viewport returns a 400, so clamp to the cap preserving aspect ratio and
 * keeping each dimension divisible by 4 (a Hyperbeam create constraint).
 */
export const HYPERBEAM_MAX_VIEWPORT_AREA = 1280 * 720;

export function clampHyperbeamViewport(
  width: number,
  height: number,
  maxArea = HYPERBEAM_MAX_VIEWPORT_AREA
): { width: number; height: number } {
  const toMultipleOf4 = (value: number) => Math.max(540, Math.floor(value / 4) * 4);
  const area = width * height;
  if (area <= maxArea) {
    return { width: toMultipleOf4(width), height: toMultipleOf4(height) };
  }
  const scale = Math.sqrt(maxArea / area);
  return { width: toMultipleOf4(width * scale), height: toMultipleOf4(height * scale) };
}

export class HyperbeamSharedBrowserDriver implements SharedBrowserDriver {
  private readonly config: AppConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly live = new Map<string, LiveHyperbeamSession>();

  constructor(options: HyperbeamSharedBrowserDriverOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private requireApiKey(): string {
    const key = this.config.tuning.hyperbeamApiKey;
    if (!key) throw new Error("HYPERBEAM_API_KEY is not configured");
    return key;
  }

  private async sessionPost(
    live: LiveHyperbeamSession,
    path: string,
    body?: unknown
  ): Promise<Response> {
    return hyperbeamSessionRequest(
      live.baseUrl,
      live.adminToken,
      path,
      {
        method: "POST",
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      },
      this.fetchImpl
    );
  }

  private async readActiveTab(live: LiveHyperbeamSession): Promise<{ url: string; title: string }> {
    const response = await this.sessionPost(live, "tabs.query", { active: true, currentWindow: true });
    if (!response.ok) {
      return { url: live.currentUrl, title: live.title };
    }
    const tabs = (await response.json()) as Array<{ url?: string; title?: string }>;
    const tab = tabs[0];
    const url = tab?.url ?? live.currentUrl;
    const title = tab?.title ?? titleFromUrl(url);
    live.currentUrl = url;
    live.title = title;
    return { url, title };
  }

  private registerFromCreate(
    threeDSpaceSessionId: string,
    created: { session_id: string; embed_url: string; admin_token: string },
    url: string,
    title: string
  ): LiveHyperbeamSession {
    const live: LiveHyperbeamSession = {
      hyperbeamSessionId: created.session_id,
      adminToken: created.admin_token,
      baseUrl: hyperbeamEmbedBaseUrl(created.embed_url),
      currentUrl: url,
      title
    };
    this.live.set(threeDSpaceSessionId, live);
    return live;
  }

  async start(options: DriverStartOptions): Promise<DriverStartResult> {
    const apiKey = this.requireApiKey();
    const { session, startUrl } = options;
    const viewport = clampHyperbeamViewport(session.viewport.width, session.viewport.height);
    const body: HyperbeamVmCreateBody = {
      start_url: startUrl,
      width: viewport.width,
      height: viewport.height,
      fps: this.config.tuning.sharedBrowserHyperbeamFramerate,
      quality: { mode: this.config.tuning.sharedBrowserHyperbeamQuality },
      tag: session.wallObjectId,
      timeout: hyperbeamSessionTimeouts(this.config)
    };
    const region = hyperbeamRegion(this.config.tuning.sharedBrowserHyperbeamRegion);
    if (region) body.region = region;

    const created = await hyperbeamCreateVm(
      this.config.tuning.hyperbeamApiBase,
      apiKey,
      body,
      this.fetchImpl
    );
    const title = titleFromUrl(startUrl);
    this.registerFromCreate(session.id, created, startUrl, title);

    return {
      url: startUrl,
      title,
      hyperbeam: {
        sessionId: created.session_id,
        embedUrl: created.embed_url,
        adminToken: created.admin_token
      }
    };
  }

  async stop(threeDSpaceSessionId: string): Promise<void> {
    const live = this.live.get(threeDSpaceSessionId);
    this.live.delete(threeDSpaceSessionId);
    if (!live) return;
    const apiKey = this.requireApiKey();
    await hyperbeamTerminateVm(
      this.config.tuning.hyperbeamApiBase,
      apiKey,
      live.hyperbeamSessionId,
      this.fetchImpl
    );
  }

  isLive(threeDSpaceSessionId: string): boolean {
    return this.live.has(threeDSpaceSessionId);
  }

  async navigate(threeDSpaceSessionId: string, url: string): Promise<{ url: string; title: string }> {
    const live = this.live.get(threeDSpaceSessionId);
    if (!live) throw new Error("Shared browser session is not live");

    // Hyperbeam's session REST API mirrors the Chrome tabs API. The request body is
    // the JSON-encoded argument list: `tabs.update(updateProperties)` updates the
    // ACTIVE tab (body `[{ url }]`), while `tabs.update(tabId, updateProperties)` is
    // `[tabId, { url }]`. We must send the array form — a bare `{ url }` object (or a
    // `[null, { url }]` from a JS `undefined` tabId) is not a valid argument list and
    // the call no-ops, leaving the VM stranded on its blank start page.
    let response = await this.sessionPost(live, "tabs.update", [{ url }]);
    if (!response.ok) {
      response = await this.sessionPost(live, "tabs.update", [1, { url }]);
    }
    if (!response.ok) {
      live.currentUrl = url;
      live.title = titleFromUrl(url);
      return { url, title: live.title };
    }

    return this.readActiveTab(live);
  }

  async history(
    threeDSpaceSessionId: string,
    action: "back" | "forward" | "refresh"
  ): Promise<{ url: string; title: string }> {
    const live = this.live.get(threeDSpaceSessionId);
    if (!live) throw new Error("Shared browser session is not live");

    const path =
      action === "back" ? "tabs.goBack" : action === "forward" ? "tabs.goForward" : "tabs.reload";
    // Empty argument list = operate on the active tab (Chrome tabs API arg-list form).
    const response = await this.sessionPost(live, path, []);
    if (!response.ok) {
      return { url: live.currentUrl, title: live.title };
    }
    return this.readActiveTab(live);
  }

  /**
   * Re-attach to a persisted Hyperbeam session after process restart (best-effort).
   */
  async attachExisting(
    threeDSpaceSessionId: string,
    hyperbeamSessionId: string
  ): Promise<boolean> {
    const apiKey = this.requireApiKey();
    const remote = await hyperbeamGetVm(
      this.config.tuning.hyperbeamApiBase,
      apiKey,
      hyperbeamSessionId,
      this.fetchImpl
    );
    if (!remote || remote.termination_date) return false;
    const url = remote.embed_url;
    const live = this.registerFromCreate(
      threeDSpaceSessionId,
      {
        session_id: remote.session_id,
        embed_url: remote.embed_url,
        admin_token: remote.admin_token
      },
      url,
      titleFromUrl(url)
    );
    await this.readActiveTab(live).catch(() => undefined);
    return true;
  }

  async close(): Promise<void> {
    const ids = [...this.live.keys()];
    await Promise.all(ids.map((id) => this.stop(id).catch(() => undefined)));
  }
}
