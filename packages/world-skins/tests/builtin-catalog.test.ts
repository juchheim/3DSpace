import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  WorldSkinSchema,
  WORLD_SKIN_PANORAMA_SLICES_DEFAULT
} from "@3dspace/contracts";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(here, "../catalog/builtin.json"), "utf8")
) as unknown[];

const EXPECTED_THEMED_SLUGS = [
  "mars-surface",
  "cell-interior",
  "roman-forum",
  "rainforest-canopy",
  "art-studio"
] as const;

describe("world skins builtin catalog", () => {
  it("contains default-theater plus the five Phase A themed skins", () => {
    expect(catalog).toHaveLength(6);
    expect(catalog.some((s) => (s as Record<string, unknown>).slug === "default-theater")).toBe(true);
    for (const slug of EXPECTED_THEMED_SLUGS) {
      expect(catalog.some((s) => (s as Record<string, unknown>).slug === slug)).toBe(true);
    }
  });

  it("parses every entry against WorldSkinSchema", () => {
    for (const entry of catalog) {
      expect(() => WorldSkinSchema.parse(entry)).not.toThrow();
    }
  });

  it("has props: [] on every entry (Phase A — no glTF props)", () => {
    for (const entry of catalog) {
      const skin = WorldSkinSchema.parse(entry);
      expect(skin.overrides.props).toHaveLength(0);
    }
  });

  it("has panoramaWall at 8192×1024 with default slices on every entry", () => {
    for (const entry of catalog) {
      const skin = WorldSkinSchema.parse(entry);
      const pw = skin.overrides.panoramaWall;
      expect(pw).toBeDefined();
      expect(pw!.widthPx).toBe(8192);
      expect(pw!.heightPx).toBe(1024);
      expect(pw!.slices).toMatchObject(WORLD_SKIN_PANORAMA_SLICES_DEFAULT);
    }
  });

  it("has floor, lighting, and ambient on every entry", () => {
    for (const entry of catalog) {
      const skin = WorldSkinSchema.parse(entry);
      expect(skin.overrides.floor).toBeDefined();
      expect(skin.overrides.lighting).toBeDefined();
      expect(skin.overrides.ambient).toBeDefined();
    }
  });

  it("has panoramaWall storageKey pointing at the R2 prefix for each slug", () => {
    for (const entry of catalog) {
      const skin = WorldSkinSchema.parse(entry);
      expect(skin.overrides.panoramaWall!.storageKey).toBe(
        `world-skins/${skin.slug}/v1/panorama.webp`
      );
    }
  });

  it("roman-forum has lightingNight for day/night toggle", () => {
    const forum = catalog.find((s) => (s as Record<string, unknown>).slug === "roman-forum");
    const skin = WorldSkinSchema.parse(forum);
    expect(skin.overrides.lightingNight).toBeDefined();
  });

  it("cell-interior has avatarScale < 1 for microscopic feel", () => {
    const cell = catalog.find((s) => (s as Record<string, unknown>).slug === "cell-interior");
    const skin = WorldSkinSchema.parse(cell);
    expect(skin.overrides.avatarScale).toBeLessThan(1);
  });

  it("mars-surface has walkSpeedMultiplier < 1 for low gravity", () => {
    const mars = catalog.find((s) => (s as Record<string, unknown>).slug === "mars-surface");
    const skin = WorldSkinSchema.parse(mars);
    expect(skin.overrides.walkSpeedMultiplier).toBeLessThan(1);
  });

  it("rainforest-canopy has optional domeCeiling with R2 storage key", () => {
    const rainforest = catalog.find((s) => (s as Record<string, unknown>).slug === "rainforest-canopy");
    const skin = WorldSkinSchema.parse(rainforest);
    expect(skin.overrides.domeCeiling?.textureStorageKey).toBe(
      "world-skins/rainforest-canopy/v1/dome.webp"
    );
  });
});
