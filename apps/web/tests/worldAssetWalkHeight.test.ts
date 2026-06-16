import { describe, expect, it } from "vitest";

import type { PlacedChair } from "../lib/usePlacedChairs";
import { worldAssetGroundHeightAt } from "../lib/worldAssetWalkHeight";

const flatSceneMesh = {
  vertices: new Float32Array([
    0, 0, 0,
    4, 0, 0,
    0, 0, 4
  ]),
  indices: new Uint32Array([0, 1, 2])
};

describe("worldAssetGroundHeightAt", () => {
  it("returns scene floor height inside a placed static-collider footprint", () => {
    const asset: PlacedChair = {
      id: "scene-1",
      slug: "vienna-market",
      position: { x: 1, y: 0.5, z: 2 },
      yaw: 0,
      scale: 1
    };
    const meshByUrl = new Map([["/objects/vienna-market.glb", flatSceneMesh]]);

    expect(worldAssetGroundHeightAt(2, 3, 0, [asset], meshByUrl, "snap")).toBeCloseTo(0.5, 5);
  });

  it("respects step-up limits in walk mode", () => {
    const asset: PlacedChair = {
      id: "scene-1",
      slug: "vienna-market",
      position: { x: 0, y: 2, z: 0 },
      yaw: 0,
      scale: 1
    };
    const meshByUrl = new Map([["/objects/vienna-market.glb", flatSceneMesh]]);

    expect(worldAssetGroundHeightAt(1, 1, 0, [asset], meshByUrl, "walk")).toBeNull();
    expect(worldAssetGroundHeightAt(1, 1, 1.5, [asset], meshByUrl, "walk")).toBeCloseTo(2, 5);
  });
});
