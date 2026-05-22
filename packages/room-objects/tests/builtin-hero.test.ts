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
  it("ships the Phase 0 hero as the only builtin template", () => {
    expect(builtin).toHaveLength(1);
    const entry = builtin[0] as Record<string, unknown>;
    expect(entry.slug).toBe("water-molecule");
    expect(entry.proceduralId).toBe("water-molecule");
    expect(entry.renderer).toBe("procedural");
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
});
