import { describe, expect, it } from "vitest";

import type { PlacedChair } from "../lib/usePlacedChairs";
import { buildWorldAssetTrimeshColliderSpecs, worldAssetPhysicsCacheKey } from "../lib/worldAssetPhysics";

const mockMesh = {
  vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2])
};

describe("worldAssetPhysics", () => {
  it("builds trimesh specs for static collider assets with loaded mesh", () => {
    const asset: PlacedChair = {
      id: "asset-1",
      slug: "vienna-market",
      position: { x: 2, y: 0, z: 3 },
      yaw: 0,
      scale: 1
    };
    const meshByUrl = new Map([["/objects/vienna-market.glb", mockMesh]]);
    const specs = buildWorldAssetTrimeshColliderSpecs([asset], meshByUrl);

    expect(specs).toHaveLength(1);
    expect(specs[0]?.kind).toBe("trimesh");
    expect(specs[0]?.id).toBe("world-asset:asset-1");
    expect(specs[0]?.vertices[0]).toBe(2);
    expect(specs[0]?.vertices[2]).toBe(3);
  });

  it("skips static collider assets until mesh is ready", () => {
    const asset: PlacedChair = {
      id: "asset-1",
      slug: "vienna-market",
      position: { x: 0, y: 0, z: 0 },
      yaw: 0
    };
    const specs = buildWorldAssetTrimeshColliderSpecs([asset], new Map());
    expect(specs).toHaveLength(0);
  });

  it("changes cache key when mesh readiness changes", () => {
    const asset: PlacedChair = {
      id: "asset-1",
      slug: "vienna-market",
      position: { x: 0, y: 0, z: 0 },
      yaw: 0
    };
    const url = "/objects/vienna-market.glb";
    const before = worldAssetPhysicsCacheKey([asset], new Map([[url, false]]));
    const after = worldAssetPhysicsCacheKey([asset], new Map([[url, true]]));
    expect(before).not.toBe(after);
  });
});
