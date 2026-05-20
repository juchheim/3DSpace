"use client";

import { useCallback, useMemo } from "react";
import type { ClassroomAction, ClassroomState, LessonRun, LessonStep } from "@3dspace/contracts";

export type LessonStepStatus = "not-run" | "current" | "completed" | "drifted";

export function useLessonRun(input: {
  state: ClassroomState | null;
  loading: boolean;
  error: string;
  role: "teacher" | "student";
  runAction(action: ClassroomAction): Promise<ClassroomState>;
}) {
  const run = input.state?.lessonRun ?? null;
  const currentStep = useMemo(() => {
    if (!run || run.currentStepIndex < 0) return null;
    return run.steps[run.currentStepIndex] ?? null;
  }, [run]);
  const previousStep = useMemo(() => {
    if (!run || run.currentStepIndex <= 0) return null;
    return run.steps[run.currentStepIndex - 1] ?? null;
  }, [run]);
  const nextStep = useMemo(() => {
    if (!run || run.currentStepIndex < 0) return null;
    return run.steps[run.currentStepIndex + 1] ?? null;
  }, [run]);

  const stepStatus = useCallback(
    (stepIndex: number): LessonStepStatus => {
      if (!run) return "not-run";
      if (stepIndex === run.currentStepIndex && (run.status === "running" || run.status === "paused")) return "current";
      const step = run.steps[stepIndex];
      if (!step) return "not-run";
      const records = run.timeline.filter((record) => record.stepId === step.id && record.completedAt);
      if (records.some((record) => record.drifted)) return "drifted";
      return records.length > 0 ? "completed" : "not-run";
    },
    [run]
  );

  const runLessonAction = useCallback(
    (action: ClassroomAction) => {
      const withVersion = input.state?.version && action.expectedVersion === undefined
        ? ({ ...action, expectedVersion: input.state.version } as ClassroomAction)
        : action;
      return input.runAction(withVersion);
    },
    [input.runAction, input.state?.version]
  );

  return {
    run: run as LessonRun | null,
    currentStep: currentStep as LessonStep | null,
    nextStep: nextStep as LessonStep | null,
    previousStep: previousStep as LessonStep | null,
    isTeacher: input.role === "teacher",
    loading: input.loading,
    error: input.error,
    runAction: runLessonAction,
    stepStatus
  };
}
