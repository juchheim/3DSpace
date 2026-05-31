import { describe, expect, it, vi, afterEach } from "vitest";

describe("buildingEnvEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadBuildingGate() {
    const mod = await import("../lib/config");
    return mod.buildingEnvEnabled;
  }

  it("enables FFA building only when NEXT_PUBLIC_ENABLE_FREE_FOR_ALL_BUILDING is true", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_FREE_FOR_ALL_BUILDING", "true");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_ESCAPE_ROOM", "false");
    const buildingEnvEnabled = await loadBuildingGate();
    expect(buildingEnvEnabled("free-for-all")).toBe(true);
    expect(buildingEnvEnabled("escape-room")).toBe(false);
    expect(buildingEnvEnabled("classroom")).toBe(false);
  });

  it("enables escape-room building only when NEXT_PUBLIC_ENABLE_ESCAPE_ROOM is true", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_FREE_FOR_ALL_BUILDING", "false");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_ESCAPE_ROOM", "true");
    const buildingEnvEnabled = await loadBuildingGate();
    expect(buildingEnvEnabled("escape-room")).toBe(true);
    expect(buildingEnvEnabled("free-for-all")).toBe(false);
  });
});
