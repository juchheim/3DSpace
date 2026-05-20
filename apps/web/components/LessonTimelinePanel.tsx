"use client";

import type { LessonRun } from "@3dspace/contracts";
import { HudCard } from "./HudCard";

function durationLabel(startedAt: string, completedAt?: string) {
  if (!completedAt) return "In progress";
  const delta = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
  return `${Math.round(delta / 1000)}s`;
}

export function LessonTimelinePanel({ run }: { run: LessonRun | null }) {
  if (!run || (run.status !== "ended" && run.status !== "abandoned")) return null;
  return (
    <HudCard title="Lesson Timeline" badge={run.timeline.length} ariaLabel="Lesson timeline">
      {run.timeline.length === 0 ? <p className="small">No steps ran.</p> : null}
      <ol className="lesson-timeline" data-testid="lesson-timeline">
        {run.timeline.map((record, index) => {
          const step = run.steps.find((candidate) => candidate.id === record.stepId);
          return (
            <li key={`${record.stepId}-${record.startedAt}-${index}`} className={record.drifted ? "lesson-timeline__item drifted" : "lesson-timeline__item"}>
              <span>{step?.title ?? "Removed step"}</span>
              <strong>{durationLabel(record.startedAt, record.completedAt)}</strong>
              {record.drifted ? <em>{record.driftReason ?? "Drifted"}</em> : null}
            </li>
          );
        })}
      </ol>
    </HudCard>
  );
}
