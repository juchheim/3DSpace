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
  it("ships the bowler-hat head accessory and red-boxing-gloves hands accessory", () => {
    expect(catalog).toHaveLength(2);
    const bowler = catalog.find((entry) => (entry as Record<string, unknown>).slug === "bowler-hat") as Record<string, unknown>;
    const gloves = catalog.find((entry) => (entry as Record<string, unknown>).slug === "red-boxing-gloves") as Record<string, unknown>;
    expect(bowler?.slot).toBe("head");
    expect(bowler?.attachBone).toBe("Head");
    expect(bowler?.glbUrl).toBe("/avatar-accessories/bowler-hat.glb");
    expect(gloves?.slot).toBe("hands");
    expect(gloves?.attachBone).toBe("RightHand");
    expect(gloves?.pairedAttachBone).toBe("LeftHand");
    expect(gloves?.mirrorPaired).toBe(true);
    expect(gloves?.glbUrl).toBe("/avatar-accessories/red-boxing-glove.glb");
  });

  it("parses every entry against AvatarAccessoryCatalogEntrySchema", () => {
    for (const entry of catalog) {
      expect(() => AvatarAccessoryCatalogEntrySchema.parse(entry)).not.toThrow();
    }
  });

  it("getBuiltinAvatarAccessoryCatalog returns parsed entries", () => {
    const items = getBuiltinAvatarAccessoryCatalog();
    expect(items).toHaveLength(2);
    const bowler = items.find((entry) => entry.slug === "bowler-hat");
    expect(bowler?.localPosition).toEqual({ x: 0, y: 0.145, z: -0.06 });
    expect(bowler?.localScale).toBe(2.85);
    expect(bowler?.boneSpaceMetersPerUnit).toBe(0.01);
    expect(bowler?.hairSuppressionBones).toEqual([{ bone: "head_end", scale: 0.04 }]);
    const gloves = items.find((entry) => entry.slug === "red-boxing-gloves");
    expect(gloves?.slot).toBe("hands");
    expect(gloves?.mirrorPaired).toBe(true);
    expect(gloves?.localScale).toBe(10);
  });

  it("default equipped accessories parse as head/hands null", () => {
    expect(AvatarEquippedAccessoriesSchema.parse(undefined)).toEqual({ head: null, hands: null });
    expect(AvatarEquippedAccessoriesSchema.parse({})).toEqual({ head: null, hands: null });
  });
});
