import { describe, expect, it } from "vitest";

import {
  placedWorldAssetRenderScale,
  sampleWorldAssetPlacementScale,
  worldAssetBySlug,
  WORLD_ASSET_CATALOG
} from "../lib/worldAssetCatalog";

describe("worldAssetCatalog", () => {
  it("includes the tree World Builder object with scale variance", () => {
    const tree = worldAssetBySlug("tree");
    expect(tree).toBeDefined();
    expect(tree?.displayName).toBe("Tree");
    expect(tree?.glbUrl).toBe("/objects/tree.glb");
    expect(tree?.thumbnailUrl).toBe("/objects/thumbnails/tree.jpg");
    expect(tree?.scaleVariance).toBe(0.15);
    expect(WORLD_ASSET_CATALOG.some((asset) => asset.slug === "tree")).toBe(true);
  });

  it("samples tree placement scale within ±15%", () => {
    for (let i = 0; i < 40; i++) {
      const scale = sampleWorldAssetPlacementScale("tree");
      expect(scale).toBeGreaterThanOrEqual(0.85);
      expect(scale).toBeLessThanOrEqual(1.15);
    }
  });

  it("leaves fixed-scale assets at their catalog scale", () => {
    expect(sampleWorldAssetPlacementScale("folding-chair")).toBe(1);
    expect(sampleWorldAssetPlacementScale("table-6-walnut")).toBe(0.8);
  });

  it("uses persisted instance scale when rendering", () => {
    expect(placedWorldAssetRenderScale({ slug: "tree", scale: 1.08 })).toBe(1.08);
    expect(placedWorldAssetRenderScale({ slug: "table-6-walnut" })).toBe(0.8);
  });
});
