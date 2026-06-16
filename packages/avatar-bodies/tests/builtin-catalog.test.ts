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
      "sit-test",
      "ixr-female-20k",
      "teacher-white-male"
    ]);
  });

  it("resolves unknown slugs to the default body", () => {
    expect(resolveAvatarBodySlug(undefined)).toBe(DEFAULT_AVATAR_BODY_SLUG);
    expect(resolveAvatarBodySlug("missing-body")).toBe(DEFAULT_AVATAR_BODY_SLUG);
  });

  it("finds catalog entries by slug", () => {
    expect(getBuiltinAvatarBodyBySlug("ixr-female-20k")?.clips.idle).toBe("Idle_11");
  });

  it("marks teacher-white-male as verse-only with sit clips", () => {
    const entry = getBuiltinAvatarBodyBySlug("teacher-white-male");
    expect(entry?.verseOnly).toBe(true);
    expect(entry?.clips).toEqual({
      idle: "Idle_11",
      walking: "Walking",
      running: "Running",
      sit: "Look_Back_and_Sit",
      standFromSit: "Sit_to_Stand_Transition_M"
    });
  });

  it("maps sit-test clips to the correctly labeled animation data", () => {
    const clips = getBuiltinAvatarBodyBySlug("sit-test")?.clips;
    expect(clips).toEqual({
      idle: "Walking",
      walking: "Sit_to_standTransition_Female_2",
      running: "Look_Back_and_Sit",
      sit: "Idle_11",
      standFromSit: "Running"
    });
  });
});
