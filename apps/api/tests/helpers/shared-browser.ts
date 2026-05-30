import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { SharedBrowserOrchestrator } from "../../src/shared-browser/orchestrator.js";
import type { DriverStartOptions, SharedBrowserDriver } from "../../src/shared-browser/types.js";
import type { TestApp } from "./app";
import { authHeaders } from "./app";

class MockHyperbeamSharedBrowserDriver implements SharedBrowserDriver {
  async start(options: DriverStartOptions) {
    return {
      url: options.startUrl,
      title: "example",
      hyperbeam: {
        sessionId: `hb_${options.session.id}`,
        embedUrl: "https://embed.hyperbeam.test/session?token=viewer",
        adminToken: "admin"
      }
    };
  }
  async stop() {}
  isLive() {
    return true;
  }
  async navigate(_sessionId: string, url: string) {
    return { url, title: "example" };
  }
  async history() {
    return { url: "https://example.com/", title: "example" };
  }
}

class FailingSharedBrowserDriver implements SharedBrowserDriver {
  async start() {
    throw new Error("shared browser driver failed to start");
  }
  async stop() {}
  isLive() {
    return false;
  }
  async navigate() {
    throw new Error("Shared browser session is not live");
  }
  async history() {
    return { url: "", title: "" };
  }
}

function sharedBrowserConfig() {
  return loadConfig({
    NODE_ENV: "test",
    ENABLE_FREE_FOR_ALL: "true",
    FREE_FOR_ALL_PASSWORD: "open-sesame",
    ENABLE_SHARED_BROWSERS: "true"
  } as NodeJS.ProcessEnv);
}

const FFA_ANCHOR = "ffa-adj-east-anchor";

export async function buildSharedBrowserApp(repository: MemoryRepository = new MemoryRepository()) {
  const config = sharedBrowserConfig();
  return buildApp({
    config,
    repository,
    sharedBrowserOrchestrator: new SharedBrowserOrchestrator({ repository, config })
  });
}

export async function buildHyperbeamSharedBrowserApp(repository: MemoryRepository = new MemoryRepository()) {
  const config = sharedBrowserConfig();
  return buildApp({
    config,
    repository,
    sharedBrowserOrchestrator: new SharedBrowserOrchestrator({
      repository,
      config,
      driver: new MockHyperbeamSharedBrowserDriver()
    })
  });
}

export async function buildFailingSharedBrowserApp(repository: MemoryRepository = new MemoryRepository()) {
  const config = sharedBrowserConfig();
  return buildApp({
    config,
    repository,
    sharedBrowserOrchestrator: new SharedBrowserOrchestrator({
      repository,
      config,
      driver: new FailingSharedBrowserDriver()
    })
  });
}

export async function createSharedBrowser(
  app: TestApp,
  roomId: string,
  teacherId: string,
  startUrl = "https://1.1.1.1/",
  wallAnchorId = FFA_ANCHOR
) {
  return app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/wall-objects`,
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: {
      type: "web.browser.shared",
      title: "Shared Browser",
      wallAnchorId,
      placement: { row: 0, column: 0 },
      source: { kind: "inline", data: { startUrl } }
    }
  });
}

