import { describe, expect, it } from "vitest";
import type { AvatarBodyCatalogEntry } from "@3dspace/contracts";
import { validateAvatarBodySlug } from "../../src/avatar-bodies/validate-body.js";

const catalog: AvatarBodyCatalogEntry[] = [
  {
    slug: "azure-vanguard",
    displayName: "Azure Vanguard",
    glbUrl: "/avatars/azure-vanguard.glb",
    nativeHeight: 1.69,
    clips: { idle: "Idle_12", walking: "Walking", running: "Running" },
    zoneMaskUrl: "/avatars/azure-vanguard-zone-mask.png",
    neutralAlbedoUrl: "/avatars/azure-vanguard-albedo-neutral.jpg"
  },
  {
    slug: "teacher-male",
    displayName: "Teacher (male)",
    glbUrl: "/avatars/teacher-male.glb",
    nativeHeight: 1.65,
    clips: {
      idle: "Idle_11",
      walking: "Walking",
      running: "Running",
      sit: "Look_Back_and_Sit",
      standFromSit: "Sit_to_Stand_Transition_M"
    },
    zoneMaskUrl: "/avatars/teacher-male-zone-mask.png",
    neutralAlbedoUrl: "/avatars/teacher-male-albedo-neutral.jpg",
    verseOnly: true
  }
];

describe("validateAvatarBodySlug", () => {
  it("accepts slugs present in the catalog without a contracts enum gate", () => {
    expect(validateAvatarBodySlug("teacher-male", catalog)).toBe("teacher-male");
  });

  it("normalizes legacy teacher slugs to the renamed catalog entries", () => {
    expect(validateAvatarBodySlug("teacher-white-male", catalog)).toBe("teacher-male");
  });

  it("rejects unknown slugs", () => {
    expect(() => validateAvatarBodySlug("missing-body", catalog)).toThrow(/Unknown avatar body slug/);
  });
});
