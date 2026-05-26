import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parameterSchemaToJson, RoomObjectTemplateSchema } from "@3dspace/contracts";

const here = dirname(fileURLToPath(import.meta.url));
const heroDraft = JSON.parse(
  readFileSync(join(here, "../catalog/hero-draft.json"), "utf8")
) as Record<string, unknown>;
const builtin = JSON.parse(readFileSync(join(here, "../catalog/builtin.json"), "utf8")) as Record<string, unknown>[];

describe("room object builtin catalog", () => {
  it("ships the Phase 0 hero plus additional procedural builtins", () => {
    expect(builtin).toHaveLength(3);
    const entry = builtin[0] as Record<string, unknown>;
    expect(entry.slug).toBe("water-molecule");
    expect(entry.proceduralId).toBe("water-molecule");
    expect(entry.renderer).toBe("procedural");

    expect(builtin.some((template) => template.slug === "caffeine-molecule")).toBe(true);
    expect(builtin.some((template) => template.slug === "earth-globe")).toBe(true);
  });

  it("matches hero-draft fields used at runtime", () => {
    const draftJson = parameterSchemaToJson(heroDraft.parameterSchema as never);
    const entry = RoomObjectTemplateSchema.parse(builtin[0]);

    expect(entry.slug).toBe(heroDraft.slug);
    expect(entry.displayName).toBe(heroDraft.displayName);
    expect(entry.description).toBe(heroDraft.description);
    expect(entry.proceduralId).toBe(heroDraft.proceduralId);
    expect(entry.defaultPose).toEqual(heroDraft.defaultPose);
    expect(entry.defaultScale).toBe(heroDraft.defaultScale);
    expect(entry.parameterSchemaJson).toBe(draftJson);
    expect(entry.defaultParameters).toEqual(heroDraft.defaultParameters);
    expect(entry.thumbnailUrl).toBe("/room-objects/thumbnails/water-molecule.png");
    expect(entry.triangleCount).toBe(18600);
  });

  it("validates the caffeine presentation molecule", () => {
    const entry = RoomObjectTemplateSchema.parse(
      builtin.find((template) => template.slug === "caffeine-molecule")
    );

    expect(entry.displayName).toBe("Caffeine molecule (C₈H₁₀N₄O₂)");
    expect(entry.proceduralId).toBe("caffeine-molecule");
    expect(entry.defaultParameters).toEqual({
      modelStyle: "ball-and-stick",
      ringGuideVisible: true,
      heteroAtomLabelsVisible: true,
      palette: "cpk"
    });
    expect(entry.thumbnailUrl).toBe("/room-objects/thumbnails/caffeine-molecule.png");
    expect(entry.triangleCount).toBe(42000);
  });

  it("validates the procedural Earth globe teaching object", () => {
    const entry = RoomObjectTemplateSchema.parse(
      builtin.find((template) => template.slug === "earth-globe")
    );

    expect(entry.displayName).toBe("Rotating Earth globe");
    expect(entry.category).toBe("geography");
    expect(entry.proceduralId).toBe("earth-globe");
    expect(entry.kinematic).toBe(true);
    expect(entry.defaultParameters).toEqual({
      solarMode: "realtime",
      timeFlowMode: "physical-accelerated",
      customYear: 2026,
      dayOfYear: 172,
      utcHour: 12,
      utcMinute: 0,
      rotationPeriodSeconds: 90,
      nightLightsVisible: true,
      bathymetryVisible: true,
      iceVisible: true,
      cloudsVisible: true,
      terrainReliefVisible: true,
      solarMarkersVisible: true,
      terminatorGuideVisible: true,
      elevationMarkersVisible: true,
      graticuleVisible: true,
      atmosphereVisible: true
    });
    expect(entry.parameterSchemaJson).toContain("Live UTC date/time");
    expect(entry.parameterSchemaJson).toContain("Accelerated physical day");
    expect(entry.parameterSchemaJson).toContain("Cloud layer");
    expect(entry.parameterSchemaJson).toContain("Terrain relief");
    expect(entry.parameterSchemaJson).toContain("Subsolar markers");
    expect(entry.parameterSchemaJson).toContain("Terminator guide");
    expect(entry.parameterSchemaJson).toContain("true-scale radial terrain displacement");
    expect(entry.thumbnailUrl).toBe("/room-objects/textures/earth-blue-marble-jan-5400.jpg");
    expect(entry.triangleCount).toBe(33000);
  });
});
