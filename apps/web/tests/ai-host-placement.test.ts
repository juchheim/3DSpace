import { describe, expect, it } from "vitest";
import { createFreeForAllManifest } from "@3dspace/room-engine";
import { aiHostHubPlacementPosition, aiHostPlacementPosition } from "../lib/useAiWorldHost";

describe("aiHostPlacementPosition", () => {
  it("places hub at origin with manifest floor Y when no build pieces", () => {
    const manifest = createFreeForAllManifest({ roomId: "room-test" });
    const hub = aiHostHubPlacementPosition(manifest, [], 0);
    expect(hub.x).toBe(0);
    expect(hub.z).toBe(0);
    expect(hub.y).toBeGreaterThanOrEqual(0);
  });

  it("matches explicit origin placement", () => {
    const manifest = createFreeForAllManifest({ roomId: "room-test" });
    const hub = aiHostHubPlacementPosition(manifest, [], 0);
    const explicit = aiHostPlacementPosition(manifest, 0, 0, [], 0);
    expect(hub).toEqual(explicit);
  });
});
