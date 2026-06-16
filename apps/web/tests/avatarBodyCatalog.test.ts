import { describe, expect, it } from "vitest";
import { getBuiltinAvatarBodyBySlug, getBuiltinAvatarBodyCatalog } from "@3dspace/avatar-bodies";
import {
  avatarBodyCatalogForRoom,
  avatarBodyModelScale,
  BUILTIN_AVATAR_BODY_CATALOG
} from "../lib/avatarBodyCatalog";

const TARGET_HEIGHT = 1.7;

function renderedHeight(meshHeight: number, entryNativeHeight: number) {
  return meshHeight * (TARGET_HEIGHT / entryNativeHeight);
}

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
    expect(filtered.some((entry) => entry.slug === "student-female")).toBe(true);
    expect(filtered.some((entry) => entry.slug === "student-male-2")).toBe(true);
    expect(filtered.some((entry) => entry.slug === "student-female-2")).toBe(true);
  });
});

describe("avatarBodyModelScale", () => {
  it("renders student bodies shorter than teachers at the same target height", () => {
    const teacher = getBuiltinAvatarBodyBySlug("teacher-male")!;
    const student = getBuiltinAvatarBodyBySlug("student-male")!;

    // Measured mesh heights from the optimized GLBs (feet → top).
    const teacherMeshHeight = 1.65;
    const studentMeshHeight = 1.64;

    const teacherRendered = renderedHeight(teacherMeshHeight, teacher.nativeHeight);
    const studentRendered = renderedHeight(studentMeshHeight, student.nativeHeight);

    expect(teacherRendered).toBeCloseTo(TARGET_HEIGHT, 2);
    expect(studentRendered).toBeLessThan(teacherRendered);
    expect(studentRendered / teacherRendered).toBeCloseTo(0.88, 2);
    expect(avatarBodyModelScale(student)).toBeLessThan(avatarBodyModelScale(teacher));
  });

  it("keeps all student variants shorter than teacher variants", () => {
    const catalog = getBuiltinAvatarBodyCatalog();
    const teachers = catalog.filter((entry) => entry.slug.startsWith("teacher-"));
    const students = catalog.filter((entry) => entry.slug.startsWith("student-"));

    const teacherScale = Math.max(...teachers.map((entry) => avatarBodyModelScale(entry)));
    const studentScale = Math.max(...students.map((entry) => avatarBodyModelScale(entry)));
    expect(studentScale).toBeLessThan(teacherScale);
  });
});
