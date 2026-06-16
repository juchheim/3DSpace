import { describe, expect, it } from "vitest";
import { getBuiltinAvatarBodyCatalog } from "@3dspace/avatar-bodies";
import { avatarBodyCatalogForRoom, BUILTIN_AVATAR_BODY_CATALOG } from "../lib/avatarBodyCatalog";

describe("avatarBodyCatalogForRoom", () => {
  it("hides verse-only bodies outside verse rooms", () => {
    const catalog = getBuiltinAvatarBodyCatalog();
    const filtered = avatarBodyCatalogForRoom(catalog, false);
    expect(filtered.some((entry) => entry.slug === "teacher-male")).toBe(false);
    expect(filtered.some((entry) => entry.slug === "azure-vanguard")).toBe(true);
  });

  it("includes verse-only bodies in verse rooms", () => {
    const filtered = avatarBodyCatalogForRoom(BUILTIN_AVATAR_BODY_CATALOG, true);
    expect(filtered.some((entry) => entry.slug === "teacher-male")).toBe(true);
    expect(filtered.some((entry) => entry.slug === "teacher-female")).toBe(true);
    expect(filtered.some((entry) => entry.slug === "teacher-male-2")).toBe(true);
    expect(filtered.some((entry) => entry.slug === "teacher-female-2")).toBe(true);
    expect(filtered.some((entry) => entry.slug === "student-male")).toBe(true);
    expect(filtered.some((entry) => entry.slug === "student-female-2")).toBe(true);
  });
});
