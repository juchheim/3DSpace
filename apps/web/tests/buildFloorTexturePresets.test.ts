import { describe, expect, it } from "vitest";
import {
  BUILD_FLOOR_TEXTURE_PRESETS,
  isBuildFloorTexturePresetFileName
} from "../lib/buildFloorTexturePresets";

describe("buildFloorTexturePresets", () => {
  it("ships grass, dirt, and concrete presets for the Image Floor tool", () => {
    expect(BUILD_FLOOR_TEXTURE_PRESETS.map((preset) => preset.slug)).toEqual([
      "grass-v2",
      "floor-dirt-v3",
      "floor-slight-marbled-concrete"
    ]);
    for (const preset of BUILD_FLOOR_TEXTURE_PRESETS) {
      expect(preset.url.startsWith("/build/floor-textures/")).toBe(true);
      expect(preset.fileName.length).toBeGreaterThan(0);
    }
  });

  it("recognizes preset file names", () => {
    expect(isBuildFloorTexturePresetFileName("grass-v2.png")).toBe(true);
    expect(isBuildFloorTexturePresetFileName("floor-slight-marbled-concrete.jpg")).toBe(true);
    expect(isBuildFloorTexturePresetFileName("custom-floor.webp")).toBe(false);
    expect(isBuildFloorTexturePresetFileName(undefined)).toBe(false);
  });
});
