import { describe, expect, it } from "vitest";
import {
  ClassroomActionSchema,
  ClassroomStateSchema,
  LessonRunSchema,
  LessonStepPayloadSchema
} from "../src/index";

const now = "2026-05-19T12:00:00.000Z";

describe("lesson run contracts", () => {
  it("parses every discovery step kind and applies documented defaults", () => {
    expect(LessonStepPayloadSchema.parse({ kind: "instruction", data: {} }).data.body).toBe("");
    expect(LessonStepPayloadSchema.parse({ kind: "focus-board", data: { anchorId: "board-1" } }).data.mode).toBe("highlight");
    expect(
      LessonStepPayloadSchema.parse({
        kind: "private-check",
        data: { question: "Ready?", promptType: "short-answer" }
      }).data.autoCloseOnAdvance
    ).toBe(true);
    expect(
      LessonStepPayloadSchema.parse({
        kind: "group-work",
        data: { newGroup: { label: "Team", color: "#389060" } }
      }).data.releaseOnAdvance
    ).toBe(true);
    expect(LessonStepPayloadSchema.parse({ kind: "timer", data: { durationSeconds: 60 } }).data.placement).toBe("hud");
    expect(
      LessonStepPayloadSchema.parse({
        kind: "student-share",
        data: { userId: "student-1", wallAnchorId: "board-1" }
      }).data.revokeOnAdvance
    ).toBe(true);
  });

  it("round-trips a lesson run through classroom state", () => {
    const run = LessonRunSchema.parse({
      id: "lesson-1",
      title: "Forces",
      status: "running",
      currentStepIndex: 0,
      createdByUserId: "teacher-1",
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      steps: [
        {
          id: "step-1",
          kind: "instruction",
          title: "Opening",
          payload: { kind: "instruction", data: { body: "Read the prompt." } },
          createdAt: now,
          updatedAt: now
        }
      ],
      timeline: [{ stepId: "step-1", startedAt: now }]
    });

    const state = ClassroomStateSchema.parse({
      roomId: "room-1",
      version: 1,
      lessonRun: run,
      createdAt: now,
      updatedAt: now
    });
    expect(ClassroomStateSchema.parse(JSON.parse(JSON.stringify(state))).lessonRun).toEqual(state.lessonRun);
  });

  it("rejects mixed step kind and payload combinations", () => {
    expect(() =>
      LessonRunSchema.parse({
        id: "lesson-1",
        title: "Bad",
        createdByUserId: "teacher-1",
        createdAt: now,
        updatedAt: now,
        steps: [
          {
            id: "step-1",
            kind: "instruction",
            title: "Mismatched",
            payload: { kind: "timer", data: { durationSeconds: 30 } },
            createdAt: now,
            updatedAt: now
          }
        ]
      })
    ).toThrow();
  });

  it("accepts lesson actions on the existing classroom action envelope", () => {
    const action = ClassroomActionSchema.parse({
      type: "add-lesson-step",
      expectedVersion: 3,
      step: {
        kind: "timer",
        title: "Think time",
        payload: { kind: "timer", data: { durationSeconds: 45 } }
      }
    });
    expect(action.type).toBe("add-lesson-step");
  });
});
