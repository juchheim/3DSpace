import type { AppConfig } from "../config.js";
import { HyperbeamSharedBrowserDriver } from "./hyperbeam-driver.js";
import { StubSharedBrowserDriver } from "./stub-driver.js";
import type { SharedBrowserDriver } from "./types.js";

/** Production Hyperbeam driver when configured; stub otherwise (tests / local without API key). */
export function buildSharedBrowserDriver(config: AppConfig): SharedBrowserDriver | undefined {
  if (!config.tuning.enableSharedBrowsers) return undefined;
  if (config.tuning.hyperbeamApiKey) {
    return new HyperbeamSharedBrowserDriver({ config });
  }
  return new StubSharedBrowserDriver();
}
