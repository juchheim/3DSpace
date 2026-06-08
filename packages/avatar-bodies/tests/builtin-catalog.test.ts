import { describe, expect, it } from "vitest";
import {
  DEFAULT_AVATAR_BODY_SLUG,
  getBuiltinAvatarBodyBySlug,
  getBuiltinAvatarBodyCatalog,
  resolveAvatarBodySlug
} from "../src/builtin-catalog";

describe("avatar body builtin catalog", () => {
  it("loads the shipped bodies", () => {
    const catalog = getBuiltinAvatarBodyCatalog();
    expect(catalog.map((entry) => entry.slug)).toEqual([
      "azure-vanguard",
      "azure-vanguard-hd",
      "ixr-female-20k"
    ]);
  });

  it("resolves unknown slugs to the default body", () => {
    expect(resolveAvatarBodySlug(undefined)).toBe(DEFAULT_AVATAR_BODY_SLUG);
    expect(resolveAvatarBodySlug("missing-body")).toBe(DEFAULT_AVATAR_BODY_SLUG);
  });

  it("finds catalog entries by slug", () => {
    expect(getBuiltinAvatarBodyBySlug("ixr-female-20k")?.clips.idle).toBe("Idle_11");
  });
});
