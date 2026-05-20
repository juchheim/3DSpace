"use client";

import type { ClassroomState, LessonRun, LessonStep, RoomManifest } from "@3dspace/contracts";
import { LessonTimerHud } from "./LessonTimerHud";

function bodyForStep(step: LessonStep, state: ClassroomState | null, manifest: RoomManifest | null | undefined, currentUserId: string) {
  const payload = step.payload;
  if (payload.kind === "instruction") return payload.data.body;
  if (payload.kind === "focus-board") return payload.data.instruction ?? "Look at the highlighted board.";
  if (payload.kind === "private-check") return "Answer the active check in the classroom panel.";
  if (payload.kind === "group-work") {
    const group = state?.groups.find((candidate) => candidate.memberUserIds.includes(currentUserId) && candidate.status === "active");
    return group ? `You are in ${group.label}.` : "Move into your assigned group.";
  }
  if (payload.kind === "student-share") {
    const anchor = manifest?.wallAnchors.find((candidate) => candidate.id === payload.data.wallAnchorId);
    return payload.data.userId === currentUserId
      ? `Your turn to share to ${anchor?.label ?? "the selected board"}.`
      : "A classmate is sharing to the board.";
  }
  if (payload.kind === "timer") return payload.data.label || "Timer running.";
  return "";
}

export function LessonStudentCallout({
  run,
  currentStep,
  state,
  manifest,
  currentUserId
}: {
  run: LessonRun | null;
  currentStep: LessonStep | null;
  state: ClassroomState | null;
  manifest?: RoomManifest | null | undefined;
  currentUserId: string;
}) {
  if (!run || !currentStep || (run.status !== "running" && run.status !== "paused")) return null;
  const body = bodyForStep(currentStep, state, manifest, currentUserId);
  const stepNumber = run.currentStepIndex >= 0 ? run.currentStepIndex + 1 : 1;

  return (
    <section className="lesson-callout" data-testid="lesson-student-callout" aria-label="Current lesson step">
      <div className="lesson-callout__meta">
        <span>Step {stepNumber} of {run.steps.length}</span>
        <span>{run.status === "paused" ? "Paused" : "Current"}</span>
      </div>
      <h2>{currentStep.title}</h2>
      {body ? <p>{body}</p> : null}
      <LessonTimerHud run={run} step={currentStep} />
    </section>
  );
}
