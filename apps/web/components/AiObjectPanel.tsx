"use client";

import { useRef, useState } from "react";
import type { AiObjectJob } from "@3dspace/contracts";
import { HudCard } from "./HudCard";

const STATUS_LABEL: Record<AiObjectJob["status"], string> = {
  queued: "Queued…",
  refining: "Refining prompt…",
  composing: "Generating…",
  validating: "Validating…",
  ready: "Ready",
  error: "Error",
  cancelled: "Cancelled",
  rejected: "Rejected"
};

const ACTIVE_STATUSES = new Set<AiObjectJob["status"]>(["queued", "refining", "composing", "validating"]);

type Controller = {
  jobs: AiObjectJob[];
  loading: boolean;
  error: string;
  hasActiveJob: boolean;
  generate(prompt: string): Promise<void>;
  cancel(jobId: string): Promise<void>;
  remove(jobId: string): Promise<void>;
  place(jobId: string): Promise<void>;
  download(job: AiObjectJob): Promise<void>;
};

function JobRow({ job, onPlace, onCancel, onRemove, onDownload }: {
  job: AiObjectJob;
  onPlace: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onDownload: () => void;
}) {
  const active = ACTIVE_STATUSES.has(job.status);
  return (
    <div className={`ai-object-panel__job ai-object-panel__job--${job.status}`}>
      <div className="ai-object-panel__job-header">
        <span className="ai-object-panel__job-prompt" title={job.prompt}>
          {job.prompt.length > 48 ? `${job.prompt.slice(0, 48)}…` : job.prompt}
        </span>
        <span className="ai-object-panel__job-status">{STATUS_LABEL[job.status]}</span>
      </div>
      {active ? (
        <div className="ai-object-panel__job-progress">
          <div className="ai-object-panel__spinner" aria-hidden="true" />
        </div>
      ) : null}
      {(job.status === "error" || job.status === "rejected") ? (
        <p className="ai-object-panel__job-error">{job.errorMessage ?? "Generation failed."}</p>
      ) : null}
      <div className="ai-object-panel__job-actions">
        {job.status === "ready" ? (
          <>
            <button type="button" className="ai-object-panel__button ai-object-panel__button--primary" onClick={onPlace}>
              Place in room
            </button>
            <button type="button" className="ai-object-panel__button ai-object-panel__button--ghost" onClick={onDownload}>
              Download .glb
            </button>
          </>
        ) : null}
        {active ? (
          <button type="button" className="ai-object-panel__button ai-object-panel__button--ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        {!active ? (
          <button type="button" className="ai-object-panel__button ai-object-panel__button--ghost ai-object-panel__button--small" onClick={onRemove} aria-label="Remove">
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AiObjectPanel({
  controller
}: {
  controller: Controller;
}) {
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeJobs = controller.jobs.filter((j) => ACTIVE_STATUSES.has(j.status));
  const recentJobs = controller.jobs.filter((j) => !ACTIVE_STATUSES.has(j.status)).slice(0, 5);

  const handleSubmit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await controller.generate(trimmed);
      setPrompt("");
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const badge = activeJobs.length > 0 ? activeJobs.length : controller.jobs.filter((j) => j.status === "ready").length || undefined;

  return (
    <HudCard
      title="Generate 3D Object"
      badge={badge}
      ariaLabel="AI 3D object generator"
      defaultCollapsed
      forceExpanded={activeJobs.length > 0}
      hasAlert={Boolean(controller.error)}
    >
      <div className="ai-object-panel">
        {controller.error ? (
          <p className="ai-object-panel__error">{controller.error}</p>
        ) : null}

        <div className="ai-object-panel__form">
          <textarea
            ref={inputRef}
            className="ai-object-panel__textarea"
            placeholder="Describe an object (e.g. &quot;a wooden chair&quot;)"
            maxLength={500}
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            disabled={submitting}
          />
          <button
            type="button"
            className="ai-object-panel__button ai-object-panel__button--primary"
            disabled={submitting || !prompt.trim()}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Generating…" : "Generate"}
          </button>
        </div>

        {activeJobs.length > 0 ? (
          <div className="ai-object-panel__jobs">
            {activeJobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                onPlace={() => void controller.place(job.id)}
                onCancel={() => void controller.cancel(job.id)}
                onRemove={() => void controller.remove(job.id)}
                onDownload={() => void controller.download(job)}
              />
            ))}
          </div>
        ) : null}

        {recentJobs.length > 0 ? (
          <div className="ai-object-panel__jobs">
            <p className="ai-object-panel__label">Recent</p>
            {recentJobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                onPlace={() => void controller.place(job.id)}
                onCancel={() => void controller.cancel(job.id)}
                onRemove={() => void controller.remove(job.id)}
                onDownload={() => void controller.download(job)}
              />
            ))}
          </div>
        ) : null}

        {controller.jobs.length === 0 && !controller.loading ? (
          <p className="ai-object-panel__copy">
            Describe any object and AI will generate a 3D model you can place in the room.
          </p>
        ) : null}
      </div>
    </HudCard>
  );
}
