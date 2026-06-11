"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClassroomAction, LessonRun, LessonStep, WallObject } from "@3dspace/contracts";
import { readSlideDeckState } from "@3dspace/room-engine";
import { HudCard } from "./HudCard";
import { LessonTimerHud } from "./LessonTimerHud";

function latestCurrentRecord(run: LessonRun, step: LessonStep | null) {
  if (!step) return null;
  for (let index = run.timeline.length - 1; index >= 0; index -= 1) {
    const record = run.timeline[index];
    if (record?.stepId === step.id && !record.completedAt) return record;
  }
  return null;
}

/** In-panel presenter remote for a live slide-deck step. */
function LessonSlideNavigator({
  step,
  object,
  onSetSlide
}: {
  step: LessonStep;
  object: WallObject;
  onSetSlide: (objectId: string, slideIndex: number) => void;
}) {
  if (step.payload.kind !== "slide-deck") return null;
  const slides = step.payload.data.slides;
  const slideState = readSlideDeckState(object.state, slides.length);
  const current = slides[slideState.index];
  const next = slides[slideState.index + 1];

  return (
    <div className="lesson-slide-nav" data-testid="lesson-slide-nav">
      <div className="lesson-slide-nav__head">
        <span className="lesson-run-kicker">Slides</span>
        <span className="lesson-slide-nav__count" data-testid="lesson-slide-nav-count">
          {slideState.index + 1} / {slides.length}
        </span>
      </div>
      {current ? (
        <p className="lesson-slide-nav__title">{current.title || `Slide ${slideState.index + 1}`}</p>
      ) : null}
      {current?.speakerNotes ? <p className="lesson-slide-nav__notes">{current.speakerNotes}</p> : null}
      <div className="lesson-slide-nav__btns">
        <button
          type="button"
          className="hud-btn"
          data-testid="lesson-slide-prev"
          disabled={slideState.index <= 0}
          onClick={() => onSetSlide(object.id, slideState.index - 1)}
        >
          ‹ Prev
        </button>
        <button
          type="button"
          className="hud-btn lesson-run-primary-btn"
          data-testid="lesson-slide-next"
          disabled={slideState.index >= slides.length - 1}
          onClick={() => onSetSlide(object.id, slideState.index + 1)}
        >
          Next ›
        </button>
      </div>
      {next ? (
        <p className="small">Next slide: {next.title || next.layout}</p>
      ) : (
        <p className="small">Last slide — advance the lesson when ready.</p>
      )}
    </div>
  );
}

export function LessonRunControls({
  run,
  currentStep,
  nextStep,
  runAction,
  loading,
  error,
  avatarEditorLocked = false,
  onToggleAvatarLock,
  onOpenRecap,
  slideDeckObject,
  onSetSlide
}: {
  run: LessonRun | null;
  currentStep: LessonStep | null;
  nextStep: LessonStep | null;
  runAction(action: ClassroomAction): Promise<unknown>;
  loading: boolean;
  error: string;
  avatarEditorLocked?: boolean;
  onToggleAvatarLock?: () => void;
  onOpenRecap?: () => void;
  slideDeckObject?: WallObject | null | undefined;
  onSetSlide?: ((objectId: string, slideIndex: number) => void) | undefined;
}) {
  const [busy, setBusy] = useState("");
  const [startAlert, setStartAlert] = useState(false);
  const prevCanStartRef = useRef(false);
  const currentRecord = useMemo(() => (run ? latestCurrentRecord(run, currentStep) : null), [currentStep, run]);

  const execute = useCallback(
    async (label: string, action: ClassroomAction) => {
      setBusy(label);
      try {
        await runAction(action);
      } finally {
        setBusy("");
      }
    },
    [runAction]
  );

  const autoAdvance = useCallback(() => {
    if (!run || run.status !== "running") return;
    if (document.visibilityState !== "visible") return;
    void execute("advance", { type: "advance-lesson-step" });
  }, [execute, run]);

  const canStart = Boolean(
    run && (run.status === "draft" || run.status === "ready") && run.steps.length > 0
  );
  const dismissStartAlert = useCallback(() => setStartAlert(false), []);

  useEffect(() => {
    if (canStart && !prevCanStartRef.current) {
      setStartAlert(true);
    } else if (!canStart) {
      setStartAlert(false);
    }
    prevCanStartRef.current = canStart;
  }, [canStart]);

  if (!run) return null;

  const isActive = run.status === "running" || run.status === "paused";
  const stepNumber = run.currentStepIndex >= 0 ? run.currentStepIndex + 1 : 0;
  const advanceLabel = run.currentStepIndex >= run.steps.length - 1 ? "Finish" : "Advance";

  return (
    <HudCard
      title="Lesson Run"
      badge={loading ? "…" : run.status}
      ariaLabel="Lesson run controls"
      defaultCollapsed
      hasAlert={startAlert}
      onAlertDismiss={dismissStartAlert}
    >
      {error ? <p className="small">{error}</p> : null}
      {isActive && currentStep ? (
        <div className="lesson-run-current" data-testid="lesson-run-current">
          <span className="lesson-run-kicker">Step {stepNumber} of {run.steps.length}</span>
          <h3>{currentStep.title}</h3>
          {currentStep.notes ? <p className="lesson-notes">{currentStep.notes}</p> : null}
          {currentRecord?.drifted ? <p className="lesson-drift" title={currentRecord.driftReason ?? "Step drifted"}>Drifted</p> : null}
          <LessonTimerHud run={run} currentStep={currentStep} onComplete={autoAdvance} />
          {currentStep.payload.kind === "slide-deck" && slideDeckObject && onSetSlide ? (
            <LessonSlideNavigator step={currentStep} object={slideDeckObject} onSetSlide={onSetSlide} />
          ) : null}
          {nextStep ? <p className="small">Next: {nextStep.title}</p> : <p className="small">Last step.</p>}
        </div>
      ) : (
        <p className="small">{run.steps.length} steps in this script.</p>
      )}
      <div className="lesson-controls">
        {canStart ? (
          <button
            type="button"
            className="hud-btn lesson-run-primary-btn"
            data-testid="start-lesson-run"
            disabled={busy === "start"}
            onClick={() => {
              dismissStartAlert();
              void execute("start", { type: "start-lesson-run" });
            }}
          >
            Start
          </button>
        ) : null}
        {run.status === "running" ? (
          <>
            <button
              type="button"
              className="hud-btn lesson-run-primary-btn"
              data-testid="advance-lesson-step"
              disabled={busy === "advance"}
              onClick={() => void execute("advance", { type: "advance-lesson-step" })}
            >
              {advanceLabel}
            </button>
            <button
              type="button"
              className="hud-btn"
              data-testid="retreat-lesson-step"
              disabled={busy === "back" || run.currentStepIndex <= 0}
              onClick={() => void execute("back", { type: "retreat-lesson-step" })}
            >
              Back
            </button>
            <button
              type="button"
              className="hud-btn"
              data-testid="pause-lesson-run"
              disabled={busy === "pause"}
              onClick={() => void execute("pause", { type: "pause-lesson-run" })}
            >
              Pause
            </button>
          </>
        ) : null}
        {run.status === "paused" ? (
          <button
            type="button"
            className="hud-btn lesson-run-primary-btn"
            data-testid="resume-lesson-run"
            disabled={busy === "resume"}
            onClick={() => void execute("resume", { type: "resume-lesson-run" })}
          >
            Resume
          </button>
        ) : null}
        {isActive ? (
          <button
            type="button"
            className="hud-btn"
            data-testid="end-lesson-run"
            disabled={busy === "end"}
            onClick={() => void execute("end", { type: "end-lesson-run", force: false })}
          >
            End
          </button>
        ) : null}
        {run.status === "ended" ? (
          <button
            type="button"
            className="hud-btn"
            data-testid="last-lesson-recap"
            onClick={() => onOpenRecap?.()}
          >
            Last lesson recap
          </button>
        ) : null}
        {run.status === "ended" || run.status === "abandoned" ? (
          <button
            type="button"
            className="hud-btn"
            data-testid="clear-lesson-run"
            disabled={busy === "clear"}
            onClick={() => void execute("clear", { type: "clear-lesson-run" })}
          >
            Clear
          </button>
        ) : null}
        {isActive && onToggleAvatarLock ? (
          <button
            type="button"
            className={`hud-btn${avatarEditorLocked ? " hud-btn--active" : ""}`}
            data-testid="toggle-avatar-lock"
            onClick={onToggleAvatarLock}
            title={avatarEditorLocked ? "Unlock avatar editor" : "Lock avatar editor"}
          >
            {avatarEditorLocked ? "🔒 Avatars" : "Avatar editing on"}
          </button>
        ) : null}
      </div>
    </HudCard>
  );
}
