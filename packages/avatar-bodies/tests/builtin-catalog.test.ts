import { describe, expect, it } from "vitest";
import {
  DEFAULT_AVATAR_BODY_SLUG,
  getBuiltinAvatarBodyBySlug,
  getBuiltinAvatarBodyCatalog,
  normalizeAvatarBodySlug,
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
      "teacher-male",
      "teacher-female",
      "teacher-male-2",
      "teacher-female-2",
      "student-male",
      "student-female-2"
    ]);
  });

  it("resolves unknown slugs to the default body", () => {
    expect(resolveAvatarBodySlug(undefined)).toBe(DEFAULT_AVATAR_BODY_SLUG);
    expect(resolveAvatarBodySlug("missing-body")).toBe(DEFAULT_AVATAR_BODY_SLUG);
  });

  it("finds catalog entries by slug", () => {
    expect(getBuiltinAvatarBodyBySlug("ixr-female-20k")?.clips.idle).toBe("Idle_11");
  });

  it("maps legacy teacher slugs to the renamed catalog entries", () => {
    expect(normalizeAvatarBodySlug("teacher-white-male")).toBe("teacher-male");
    expect(normalizeAvatarBodySlug("teacher-white-female")).toBe("teacher-female");
    expect(normalizeAvatarBodySlug("teacher-black-male")).toBe("teacher-male-2");
    expect(normalizeAvatarBodySlug("teacher-black-female")).toBe("teacher-female-2");
    expect(resolveAvatarBodySlug("teacher-white-male")).toBe("teacher-male");
  });

  it("marks teacher-male as verse-only with male sit clips", () => {
    const entry = getBuiltinAvatarBodyBySlug("teacher-male");
    expect(entry?.verseOnly).toBe(true);
    expect(entry?.displayName).toBe("Teacher (male)");
    expect(entry?.clips).toEqual({
      idle: "Idle_11",
      walking: "Walking",
      running: "Running",
      sit: "Look_Back_and_Sit",
      standFromSit: "Sit_to_Stand_Transition_M"
    });
  });

  it("marks teacher-female as verse-only with female sit clips", () => {
    const entry = getBuiltinAvatarBodyBySlug("teacher-female");
    expect(entry?.verseOnly).toBe(true);
    expect(entry?.displayName).toBe("Teacher (female)");
    expect(entry?.clips).toEqual({
      idle: "Idle_11",
      walking: "Walking",
      running: "Running",
      sit: "Look_Back_and_Sit",
      standFromSit: "Sit_to_standTransition_Female_2"
    });
  });

  it("marks teacher-male-2 as verse-only with male sit clips", () => {
    const entry = getBuiltinAvatarBodyBySlug("teacher-male-2");
    expect(entry?.verseOnly).toBe(true);
    expect(entry?.displayName).toBe("Teacher (male)");
    expect(entry?.clips).toEqual({
      idle: "Idle_11",
      walking: "Walking",
      running: "Running",
      sit: "Look_Back_and_Sit",
      standFromSit: "Sit_to_Stand_Transition_M"
    });
  });

  it("marks teacher-female-2 as verse-only with female sit clips", () => {
    const entry = getBuiltinAvatarBodyBySlug("teacher-female-2");
    expect(entry?.verseOnly).toBe(true);
    expect(entry?.displayName).toBe("Teacher (female)");
    expect(entry?.clips).toEqual({
      idle: "Idle_11",
      walking: "Walking",
      running: "Running",
      sit: "Look_Back_and_Sit",
      standFromSit: "Sit_to_standTransition_Female_2"
    });
  });

  it("marks student-male as verse-only with male sit clips", () => {
    const entry = getBuiltinAvatarBodyBySlug("student-male");
    expect(entry?.verseOnly).toBe(true);
    expect(entry?.displayName).toBe("Student (male)");
    expect(entry?.clips).toEqual({
      idle: "Idle_11",
      walking: "Walking",
      running: "Running",
      sit: "Look_Back_and_Sit",
      standFromSit: "Sit_to_Stand_Transition_M"
    });
  });

  it("marks student-female-2 as verse-only with female sit clips", () => {
    const entry = getBuiltinAvatarBodyBySlug("student-female-2");
    expect(entry?.verseOnly).toBe(true);
    expect(entry?.displayName).toBe("Student (female)");
    expect(entry?.clips).toEqual({
      idle: "Idle_11",
      walking: "Walking",
      running: "Running",
      sit: "Look_Back_and_Sit",
      standFromSit: "Sit_to_standTransition_Female_2"
    });
  });

  it("maps legacy student slugs to the renamed catalog entries", () => {
    expect(normalizeAvatarBodySlug("student-white-male")).toBe("student-male");
    expect(normalizeAvatarBodySlug("student-black-female")).toBe("student-female-2");
    expect(resolveAvatarBodySlug("student-white-male")).toBe("student-male");
    expect(resolveAvatarBodySlug("student-black-female")).toBe("student-female-2");
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
