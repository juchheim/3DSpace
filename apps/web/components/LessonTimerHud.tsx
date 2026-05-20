"use client";

import { useEffect, useMemo, useState } from "react";
import type { LessonRun, LessonStep } from "@3dspace/contracts";

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function LessonTimerHud({ run, step, onComplete }: { run: LessonRun; step: LessonStep; onComplete?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const timer = step.kind === "timer" && step.payload.kind === "timer" && step.payload.data.placement === "hud"
    ? step.payload.data
    : null;
  const startedAt = useMemo(() => {
    let record = undefined as (typeof run.timeline)[number] | undefined;
    for (let index = run.timeline.length - 1; index >= 0; index -= 1) {
      const candidate = run.timeline[index];
      if (candidate?.stepId === step.id && !candidate.completedAt) {
        record = candidate;
        break;
      }
    }
    const raw = record?.startedAt ?? run.updatedAt;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }, [run.timeline, run.updatedAt, step.id]);

  useEffect(() => {
    if (!timer) return;
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [timer]);

  const remaining = timer ? Math.max(0, timer.durationSeconds - Math.floor((now - startedAt) / 1000)) : 0;

  useEffect(() => {
    if (!timer?.autoAdvanceOnComplete || remaining > 0) return;
    onComplete?.();
  }, [onComplete, remaining, timer?.autoAdvanceOnComplete]);

  if (!timer) return null;

  return (
    <div className="lesson-timer" data-testid="lesson-timer-hud" aria-label="Lesson timer">
      <span>{timer.label || step.title}</span>
      <strong>{formatSeconds(remaining)}</strong>
    </div>
  );
}
