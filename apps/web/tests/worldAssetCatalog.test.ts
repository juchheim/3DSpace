import { describe, expect, it } from "vitest";

import {
  isPodiumWorldAsset,
  hasPodiumNotebook,
  placedAssetHasDeskNotebook,
  placedAssetHasPodiumNotebook,
  placedAssetIsPodium,
  placedAssetIsSittable,
  placedWorldAssetRenderScale,
  sampleWorldAssetPlacementScale,
  scatterWorldAssetOffsets,
  worldAssetBySlug,
  WORLD_ASSET_CATALOG,
  WORLD_OBJECT_CATALOG,
  WORLD_SCENE_CATALOG,
  worldAssetCategory
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

  it("partitions catalog entries into object and scene tabs", () => {
    expect(WORLD_OBJECT_CATALOG.every((asset) => worldAssetCategory(asset) === "object")).toBe(true);
    expect(WORLD_SCENE_CATALOG.every((asset) => worldAssetCategory(asset) === "scene")).toBe(true);
    expect(WORLD_OBJECT_CATALOG.some((asset) => asset.slug === "tree")).toBe(true);
    expect(WORLD_OBJECT_CATALOG.some((asset) => asset.slug === "vienna-market")).toBe(false);
    expect(WORLD_SCENE_CATALOG.some((asset) => asset.slug === "vienna-market")).toBe(true);
    expect(WORLD_ASSET_CATALOG).toHaveLength(WORLD_OBJECT_CATALOG.length + WORLD_SCENE_CATALOG.length);
  });

  it("requires static trimesh colliders on every scene catalog entry", () => {
    expect(WORLD_SCENE_CATALOG.length).toBeGreaterThan(0);
    expect(WORLD_SCENE_CATALOG.every((asset) => asset.staticCollider === true)).toBe(true);
  });

  it("includes the Vienna Market scene", () => {
    const market = worldAssetBySlug("vienna-market");
    expect(market).toBeDefined();
    expect(market?.displayName).toBe("Vienna Market");
    expect(market?.glbUrl).toBe("/objects/vienna-market.glb");
    expect(market?.thumbnailUrl).toBe("/objects/thumbnails/vienna-market.jpg");
    expect(market?.staticCollider).toBe(true);
    expect(worldAssetCategory(market!)).toBe("scene");
  });

  it("includes the Classroom scene", () => {
    const classroom = worldAssetBySlug("classroom-simple");
    expect(classroom).toBeDefined();
    expect(classroom?.displayName).toBe("Classroom");
    expect(classroom?.glbUrl).toBe("/objects/classroom-simple.glb");
    expect(classroom?.thumbnailUrl).toBe("/objects/thumbnails/classroom-simple.jpg");
    expect(classroom?.staticCollider).toBe(true);
    expect(worldAssetCategory(classroom!)).toBe("scene");
  });

  it("includes the Mars scene", () => {
    const mars = worldAssetBySlug("mars");
    expect(mars).toBeDefined();
    expect(mars?.displayName).toBe("Mars");
    expect(mars?.glbUrl).toBe("/objects/mars.glb");
    expect(mars?.thumbnailUrl).toBe("/objects/thumbnails/mars.jpg");
    expect(mars?.scale).toBe(1.75);
    expect(mars?.staticCollider).toBe(true);
    expect(worldAssetCategory(mars!)).toBe("scene");
  });

  it("includes the Escher Head scene", () => {
    const escher = worldAssetBySlug("escher-head");
    expect(escher).toBeDefined();
    expect(escher?.displayName).toBe("Escher Head");
    expect(escher?.glbUrl).toBe("/objects/escher-head.glb");
    expect(escher?.thumbnailUrl).toBe("/objects/thumbnails/escher-head.jpg");
    expect(escher?.scale).toBe(1.6);
    expect(escher?.staticCollider).toBe(true);
    expect(worldAssetCategory(escher!)).toBe("scene");
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

  it("podiumStandPose returns a point behind the presenter (audience side) at asset yaw", () => {
    const asset: PlacedChair = {
      id: "p1",
      slug: "podium",
      position: { x: 0, y: 0, z: 0 },
      yaw: 0
    };
    const pose = podiumStandPose(asset);
    // yaw=0: forwardX=0, forwardZ=1 → presenter stands at z > 0 (on audience side), faces audience (+π)
    expect(pose.position.x).toBeCloseTo(0, 5);
    expect(pose.position.z).toBeGreaterThan(0);
    expect(pose.rotationY).toBeCloseTo(Math.PI, 5);
  });

  it("podiumStandPose respects non-zero yaw", () => {
    const asset: PlacedChair = {
      id: "p2",
      slug: "podium",
      position: { x: 5, y: 0, z: 5 },
      yaw: Math.PI / 2
    };
    const pose = podiumStandPose(asset);
    // yaw=π/2: forwardX=1, forwardZ≈0 → presenter is at x > 5
    expect(pose.position.x).toBeGreaterThan(5);
    expect(pose.rotationY).toBeCloseTo(Math.PI / 2 + Math.PI, 5);
  });
});

describe("custom-asset interactive roles", () => {
  const customWith = (objectRole?: "chair" | "podium"): PlacedChair => ({
    id: "ca1",
    slug: "ca-123", // a library asset id, not a catalog slug
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    custom: {
      glbUrl: "https://cdn/x.glb",
      placement: "other",
      ...(objectRole ? { objectRole } : {})
    }
  });

  it("treats a custom asset classified as a chair as sittable with a notebook", () => {
    const chair = customWith("chair");
    expect(placedAssetIsSittable(chair)).toBe(true);
    expect(placedAssetHasDeskNotebook(chair)).toBe(true);
    expect(placedAssetIsPodium(chair)).toBe(false);
    expect(placedAssetHasPodiumNotebook(chair)).toBe(false);
  });

  it("treats a custom asset classified as a podium as a presenter station with a notebook", () => {
    const podium = customWith("podium");
    expect(placedAssetIsPodium(podium)).toBe(true);
    expect(placedAssetHasPodiumNotebook(podium)).toBe(true);
    expect(placedAssetIsSittable(podium)).toBe(false);
    expect(placedAssetHasDeskNotebook(podium)).toBe(false);
  });

  it("treats an unclassified custom object as a plain, non-interactive prop", () => {
    const prop = customWith(undefined);
    expect(placedAssetIsSittable(prop)).toBe(false);
    expect(placedAssetIsPodium(prop)).toBe(false);
    expect(placedAssetHasDeskNotebook(prop)).toBe(false);
    expect(placedAssetHasPodiumNotebook(prop)).toBe(false);
  });

  it("falls back to the catalog slug for built-in (non-custom) placements", () => {
    const desk: PlacedChair = { id: "d", slug: "school-desk-chair2", position: { x: 0, y: 0, z: 0 }, yaw: 0 };
    expect(placedAssetIsSittable(desk)).toBe(true);
    expect(placedAssetHasDeskNotebook(desk)).toBe(true);
    const podium: PlacedChair = { id: "p", slug: "podium", position: { x: 0, y: 0, z: 0 }, yaw: 0 };
    expect(placedAssetIsPodium(podium)).toBe(true);
    expect(placedAssetHasPodiumNotebook(podium)).toBe(true);
  });
});
