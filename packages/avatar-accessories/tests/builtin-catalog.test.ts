import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AvatarAccessoryCatalogEntrySchema,
  AvatarEquippedAccessoriesSchema
} from "@3dspace/contracts";
import { getBuiltinAvatarAccessoryCatalog } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(here, "../catalog/builtin.json"), "utf8")
) as unknown[];

describe("avatar accessories builtin catalog", () => {
  it("ships the bowler-hat head accessory", () => {
    expect(catalog).toHaveLength(1);
    const entry = catalog[0] as Record<string, unknown>;
    expect(entry.slug).toBe("bowler-hat");
    expect(entry.slot).toBe("head");
    expect(entry.attachBone).toBe("Head");
    expect(entry.glbUrl).toBe("/avatar-accessories/bowler-hat.glb");
  });

  it("parses every entry against AvatarAccessoryCatalogEntrySchema", () => {
    for (const entry of catalog) {
      expect(() => AvatarAccessoryCatalogEntrySchema.parse(entry)).not.toThrow();
    }
  });

  it("getBuiltinAvatarAccessoryCatalog returns parsed entries", () => {
    const items = getBuiltinAvatarAccessoryCatalog();
    expect(items).toHaveLength(1);
    expect(items[0]?.slug).toBe("bowler-hat");
    expect(items[0]?.localPosition).toEqual({ x: 0, y: 0.08, z: 0 });
  });

  it("default equipped accessories parse as head: null", () => {
    expect(AvatarEquippedAccessoriesSchema.parse(undefined)).toEqual({ head: null });
    expect(AvatarEquippedAccessoriesSchema.parse({})).toEqual({ head: null });
  });
});
