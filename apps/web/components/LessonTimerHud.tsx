"use client";

import { useEffect, useRef, useState } from "react";
import type { LessonRun, LessonStep } from "@3dspace/contracts";

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function LessonTimerHud({ run, currentStep, onComplete }: { run: LessonRun; currentStep: LessonStep | null; onComplete?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const completedTimerKey = useRef("");
  const timer = run.activeTimer?.placement === "hud" ? run.activeTimer : null;
  const startedAtRaw = timer?.startedAt ?? run.updatedAt;
  const parsedStartedAt = Date.parse(startedAtRaw);
  const startedAt = Number.isFinite(parsedStartedAt) ? parsedStartedAt : Date.now();

  useEffect(() => {
    if (!timer) return;
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [timer]);

  const remaining = timer ? Math.max(0, timer.durationSeconds - Math.floor((now - startedAt) / 1000)) : 0;

  useEffect(() => {
    if (!timer) {
      completedTimerKey.current = "";
      return;
    }
    const timerKey = `${timer.stepId}:${timer.startedAt}`;
    if (!timer.autoAdvanceOnComplete || currentStep?.id !== timer.stepId || remaining > 0) return;
    if (completedTimerKey.current === timerKey) return;
    completedTimerKey.current = timerKey;
    onComplete?.();
  }, [currentStep?.id, onComplete, remaining, timer]);

  if (!timer) return null;
  const title = timer.label || (currentStep?.id === timer.stepId ? timer.title : "Timer");

  return (
    <div className="lesson-timer" data-testid="lesson-timer-hud" aria-label="Lesson timer">
      <span>{title}</span>
      <strong>{formatSeconds(remaining)}</strong>
    </div>
  );
}
