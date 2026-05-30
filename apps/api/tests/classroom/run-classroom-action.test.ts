import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { runClassroomAction } from "../../src/classroom/run-classroom-action";
import { MemoryRepository } from "../../src/repository";
import { addStudentMember, createClassAndRoom } from "../helpers/app";
import { breakoutPodsLessonConfig, enableRoomPods, lessonConfig } from "../helpers/classroom";

async function setupClassroom(teacherId: string, opts: { lessons?: boolean; breakoutPods?: boolean } = {}) {
  const repository = new MemoryRepository();
  const config = opts.lessons && opts.breakoutPods ? breakoutPodsLessonConfig() : opts.lessons ? lessonConfig() : lessonConfig();
  const app = await buildApp({ config, repository });
  const { classRecord, roomWithManifest } = await createClassAndRoom(app, teacherId);
  return { app, repository, classRecord, roomWithManifest };
}

describe("runClassroomAction", () => {
  it("persists a raised hand for a student actor", async () => {
    const { app, repository, classRecord, roomWithManifest } = await setupClassroom("teacher-run-action-raise");
    await addStudentMember(app, classRecord.id, "teacher-run-action-raise", "student-run-action-raise", "Avery");

    const state = await runClassroomAction({
      repository,
      roomId: roomWithManifest.room.id,
      classId: classRecord.id,
      actor: { userId: "student-run-action-raise", displayName: "Avery", role: "student" },
      action: { type: "raise-hand", expectedVersion: 1, note: "Need help at station 2" },
      lessonsEnabled: true,
      breakoutPodsEnabled: false,
      studentMediaPermissionsEnabled: false,
      roomSettings: roomWithManifest.room.settings
    });

    expect(state.helpRequests).toHaveLength(1);
    expect(state.helpRequests[0]).toMatchObject({
      userId: "student-run-action-raise",
      displayName: "Avery",
      kind: "help",
      status: "raised",
      note: "Need help at station 2"
    });

    const persisted = await repository.getClassroomState(roomWithManifest.room.id);
    expect(persisted.helpRequests[0]?.id).toBe(state.helpRequests[0]?.id);
    await app.close();
  });

  it("replaces an active board grant for the same student", async () => {
    const { app, repository, classRecord, roomWithManifest } = await setupClassroom("teacher-run-action-grant");
    await addStudentMember(app, classRecord.id, "teacher-run-action-grant", "student-run-action-grant", "Avery");
    const firstAnchorId = roomWithManifest.manifest.wallAnchors[0]!.id;
    const secondAnchorId = roomWithManifest.manifest.wallAnchors[1]!.id;

    const firstGrantState = await runClassroomAction({
      repository,
      roomId: roomWithManifest.room.id,
      classId: classRecord.id,
      actor: { userId: "teacher-run-action-grant", displayName: "Ms. Rivera", role: "teacher" },
      action: {
        type: "grant-board-access",
        expectedVersion: 1,
        userId: "student-run-action-grant",
        wallAnchorId: firstAnchorId,
        allowedObjectTypes: ["note"]
      },
      lessonsEnabled: true,
      breakoutPodsEnabled: false,
      studentMediaPermissionsEnabled: false,
      roomSettings: roomWithManifest.room.settings
    });

    const secondGrantState = await runClassroomAction({
      repository,
      roomId: roomWithManifest.room.id,
      classId: classRecord.id,
      actor: { userId: "teacher-run-action-grant", displayName: "Ms. Rivera", role: "teacher" },
      action: {
        type: "grant-board-access",
        expectedVersion: firstGrantState.version,
        userId: "student-run-action-grant",
        wallAnchorId: secondAnchorId,
        allowedObjectTypes: ["image.file", "note"]
      },
      lessonsEnabled: true,
      breakoutPodsEnabled: false,
      studentMediaPermissionsEnabled: false,
      roomSettings: roomWithManifest.room.settings
    });

    const activeGrants = secondGrantState.boardAccessGrants.filter((grant) => grant.status === "active");
    const revokedGrants = secondGrantState.boardAccessGrants.filter((grant) => grant.status === "revoked");
    expect(activeGrants).toHaveLength(1);
    expect(activeGrants[0]).toMatchObject({
      userId: "student-run-action-grant",
      wallAnchorId: secondAnchorId,
      allowedObjectTypes: ["image.file", "note"]
    });
    expect(revokedGrants).toHaveLength(1);
    expect(revokedGrants[0]?.wallAnchorId).toBe(firstAnchorId);
    await app.close();
  });

  it("starts a group-work lesson step and auto-enables pods when the room allows it", async () => {
    const { app, repository, classRecord, roomWithManifest } = await setupClassroom("teacher-run-action-lesson", {
      lessons: true,
      breakoutPods: true
    });
    await addStudentMember(app, classRecord.id, "teacher-run-action-lesson", "student-run-action-lesson", "Avery");
    await enableRoomPods(app, roomWithManifest.room.id, "teacher-run-action-lesson");

    const teacherActor = { userId: "teacher-run-action-lesson", displayName: "Ms. Rivera", role: "teacher" as const };

    let state = await runClassroomAction({
      repository,
      roomId: roomWithManifest.room.id,
      classId: classRecord.id,
      actor: teacherActor,
      action: { type: "init-lesson-run", expectedVersion: 1, title: "Pods lesson" },
      lessonsEnabled: true,
      breakoutPodsEnabled: true,
      studentMediaPermissionsEnabled: false,
      roomSettings: roomWithManifest.room.settings
    });

    state = await runClassroomAction({
      repository,
      roomId: roomWithManifest.room.id,
      classId: classRecord.id,
      actor: teacherActor,
      action: {
        type: "add-lesson-step",
        expectedVersion: state.version,
        step: {
          kind: "group-work",
          title: "Collaborate",
          payload: {
            kind: "group-work",
            data: {
              newGroup: {
                label: "Pod A",
                color: "#389060",
                memberUserIds: ["student-run-action-lesson"],
                targetPosition: { x: 3, y: 0, z: 3 }
              },
              releaseOnAdvance: false
            }
          }
        }
      },
      lessonsEnabled: true,
      breakoutPodsEnabled: true,
      studentMediaPermissionsEnabled: false,
      roomSettings: roomWithManifest.room.settings
    });

    state = await runClassroomAction({
      repository,
      roomId: roomWithManifest.room.id,
      classId: classRecord.id,
      actor: teacherActor,
      action: {
        type: "add-lesson-step",
        expectedVersion: state.version,
        step: {
          kind: "instruction",
          title: "Debrief",
          payload: { kind: "instruction", data: { body: "Discuss the work." } }
        }
      },
      lessonsEnabled: true,
      breakoutPodsEnabled: true,
      studentMediaPermissionsEnabled: false,
      roomSettings: roomWithManifest.room.settings
    });

    state = await runClassroomAction({
      repository,
      roomId: roomWithManifest.room.id,
      classId: classRecord.id,
      actor: teacherActor,
      action: { type: "start-lesson-run", expectedVersion: state.version },
      lessonsEnabled: true,
      breakoutPodsEnabled: true,
      studentMediaPermissionsEnabled: false,
      roomSettings: roomWithManifest.room.settings
    });

    expect(state.podsRuntime.podsEnabled).toBe(true);
    expect(state.groups[0]).toMatchObject({
      label: "Pod A",
      status: "active",
      memberUserIds: ["student-run-action-lesson"]
    });
    expect(state.lessonRun?.timeline[0]?.emittedActionIds).toContain("toggle-pods");
    await app.close();
  });
});
