import { describe, expect, it } from "vitest";

import {
  isPodiumWorldAsset,
  hasPodiumNotebook,
  placedWorldAssetRenderScale,
  sampleWorldAssetPlacementScale,
  scatterWorldAssetOffsets,
  worldAssetBySlug,
  WORLD_ASSET_CATALOG
} from "../lib/worldAssetCatalog";
import { podiumStandPose } from "../lib/usePlacedChairs";
import type { PlacedChair } from "../lib/usePlacedChairs";

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
    for (const slug of ["tree", "tree-in-a-pot", "live-oak"] as const) {
      for (let i = 0; i < 40; i++) {
        const scale = sampleWorldAssetPlacementScale(slug);
        expect(scale).toBeGreaterThanOrEqual(0.85);
        expect(scale).toBeLessThanOrEqual(1.15);
      }
    }
  });

  it("includes the potted tree World Builder object with scale variance", () => {
    const potted = worldAssetBySlug("tree-in-a-pot");
    expect(potted).toBeDefined();
    expect(potted?.displayName).toBe("Tree in a Pot");
    expect(potted?.glbUrl).toBe("/objects/tree-in-a-pot.glb");
    expect(potted?.thumbnailUrl).toBe("/objects/thumbnails/tree-in-a-pot.jpg");
    expect(potted?.scaleVariance).toBe(0.15);
  });

  it("includes the Southern Live Oak World Builder object with scale variance", () => {
    const oak = worldAssetBySlug("live-oak");
    expect(oak).toBeDefined();
    expect(oak?.displayName).toBe("Southern Live Oak");
    expect(oak?.glbUrl).toBe("/objects/live-oak.glb");
    expect(oak?.thumbnailUrl).toBe("/objects/thumbnails/live-oak.jpg");
    expect(oak?.scaleVariance).toBe(0.15);
  });

  it("includes the Podium World Builder object", () => {
    const podium = worldAssetBySlug("podium");
    expect(podium).toBeDefined();
    expect(podium?.displayName).toBe("Podium");
    expect(podium?.glbUrl).toBe("/objects/podium.glb");
    expect(podium?.thumbnailUrl).toBe("/objects/thumbnails/podium.jpg");
    expect(podium?.scale).toBe(0.42);
    expect(WORLD_ASSET_CATALOG.some((asset) => asset.slug === "podium")).toBe(true);
  });

  it("includes the Tall Grass World Builder object with scatter + wind sway", () => {
    const grass = worldAssetBySlug("tall-grass");
    expect(grass).toBeDefined();
    expect(grass?.displayName).toBe("Tall Grass");
    expect(grass?.glbUrl).toBe("/objects/tall-grass.glb");
    expect(grass?.thumbnailUrl).toBe("/objects/thumbnails/tall-grass.jpg");
    expect(grass?.scaleVariance).toBe(0.25);
    expect(grass?.windSway).toBe(true);
    expect(grass?.scatter).toEqual({ defaultCount: 6, minCount: 1, maxCount: 12, areaSize: 2 });
  });

  it("strews the requested number of scatter offsets inside the square", () => {
    const scatter = { defaultCount: 6, minCount: 1, maxCount: 12, areaSize: 2 };
    for (const count of [1, 6, 12]) {
      const offsets = scatterWorldAssetOffsets(scatter, count);
      expect(offsets).toHaveLength(count);
      for (const offset of offsets) {
        expect(Math.abs(offset.dx)).toBeLessThanOrEqual(scatter.areaSize / 2);
        expect(Math.abs(offset.dz)).toBeLessThanOrEqual(scatter.areaSize / 2);
        expect(offset.yaw).toBeGreaterThanOrEqual(0);
        expect(offset.yaw).toBeLessThan(Math.PI * 2);
      }
    }
  });

  it("clamps scatter count to the catalog range", () => {
    const scatter = { defaultCount: 6, minCount: 1, maxCount: 12, areaSize: 2 };
    expect(scatterWorldAssetOffsets(scatter, 0)).toHaveLength(1);
    expect(scatterWorldAssetOffsets(scatter, 99)).toHaveLength(12);
  });

  it("spreads scatter offsets apart (jittered grid, not one clump)", () => {
    const scatter = { defaultCount: 6, minCount: 1, maxCount: 12, areaSize: 2 };
    const offsets = scatterWorldAssetOffsets(scatter, 9);
    // 9 patches on a 3×3 jittered grid: distinct cells keep centres ≥ ~13 cm apart.
    for (let i = 0; i < offsets.length; i++) {
      for (let j = i + 1; j < offsets.length; j++) {
        const d = Math.hypot(offsets[i]!.dx - offsets[j]!.dx, offsets[i]!.dz - offsets[j]!.dz);
        expect(d).toBeGreaterThan(0.1);
      }
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

describe("podium catalog flags", () => {
  it("isPodiumWorldAsset is true for podium, false for others", () => {
    expect(isPodiumWorldAsset("podium")).toBe(true);
    expect(isPodiumWorldAsset("school-desk-chair2")).toBe(false);
    expect(isPodiumWorldAsset("folding-chair")).toBe(false);
    expect(isPodiumWorldAsset("unknown-slug")).toBe(false);
  });

  it("hasPodiumNotebook is true for podium, false for others", () => {
    expect(hasPodiumNotebook("podium")).toBe(true);
    expect(hasPodiumNotebook("school-desk-chair2")).toBe(false);
    expect(hasPodiumNotebook("unknown-slug")).toBe(false);
  });

  it("podiumStandPose returns a point behind the origin at asset yaw", () => {
    const asset: PlacedChair = {
      id: "p1",
      slug: "podium",
      position: { x: 0, y: 0, z: 0 },
      yaw: 0
    };
    const pose = podiumStandPose(asset);
    // yaw=0: forwardX=0, forwardZ=1 → presenter is at z < 0 (behind)
    expect(pose.position.x).toBeCloseTo(0, 5);
    expect(pose.position.z).toBeLessThan(0);
    expect(pose.rotationY).toBeCloseTo(0, 5);
  });

  it("podiumStandPose respects non-zero yaw", () => {
    const asset: PlacedChair = {
      id: "p2",
      slug: "podium",
      position: { x: 5, y: 0, z: 5 },
      yaw: Math.PI / 2
    };
    const pose = podiumStandPose(asset);
    // yaw=π/2: forwardX=1, forwardZ≈0 → presenter is at x < 5
    expect(pose.position.x).toBeLessThan(5);
    expect(pose.rotationY).toBeCloseTo(Math.PI / 2, 5);
  });
});
