import { describe, expect, it } from "vitest";
import { activeStudentMemberships, buildLessonRecap } from "../../src/classroom/lesson-runtime";
import type { ClassMembership, ClassroomState, LessonRun } from "@3dspace/contracts";

function studentMembership(userId: string): ClassMembership {
  return {
    id: `member-${userId}`,
    classId: "class-1",
    userId,
    displayName: userId,
    role: "student",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function teacherMembership(userId: string): ClassMembership {
  return { ...studentMembership(userId), role: "teacher" };
}

const emptyState = { privateChecks: [] } as ClassroomState;
const emptyRun = {
  id: "run-1",
  title: "Solo lesson",
  timeline: []
} as LessonRun;

describe("lesson recap attendance", () => {
  it("excludes the class teacher even when their membership role is student", () => {
    const teacherId = "teacher-solo";
    const memberships = [teacherMembership(teacherId)];
    memberships[0]!.role = "student";

    expect(activeStudentMemberships(memberships, teacherId)).toHaveLength(0);

    const recap = buildLessonRecap({
      memberships,
      room: { id: "room-1", classId: "class-1" },
      state: emptyState,
      run: emptyRun,
      teacherUserId: teacherId
    });

    expect(recap.attendance.total).toBe(0);
    expect(recap.attendance.knownParticipantIds).toEqual([]);
  });

  it("counts active students but not the class teacher", () => {
    const recap = buildLessonRecap({
      memberships: [
        teacherMembership("teacher-1"),
        studentMembership("student-1"),
        studentMembership("student-2")
      ],
      room: { id: "room-1", classId: "class-1" },
      state: emptyState,
      run: emptyRun,
      teacherUserId: "teacher-1"
    });

    expect(recap.attendance.total).toBe(2);
    expect(recap.attendance.knownParticipantIds).toEqual(["student-1", "student-2"]);
  });
});
