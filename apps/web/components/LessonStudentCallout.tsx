"use client";

import { useState } from "react";
import type {
  ClassroomAction,
  ClassroomPrivateCheck,
  ClassroomState,
  LessonRun,
  LessonStep,
  LessonStepExitTicketPayload,
  RoomManifest
} from "@3dspace/contracts";
import { LessonTimerHud } from "./LessonTimerHud";

const EXIT_TICKET_CONFIDENCE_PROMPT = "How confident do you feel about today's material?";

function bodyForStep(step: LessonStep, state: ClassroomState | null, manifest: RoomManifest | null | undefined, currentUserId: string) {
  const payload = step.payload;
  if (payload.kind === "instruction") return payload.data.body;
  if (payload.kind === "focus-board") return payload.data.instruction ?? "Look at the highlighted board.";
  if (payload.kind === "private-check") return "Answer the active check in the classroom panel.";
  if (payload.kind === "group-work") {
    const group = state?.groups.find((candidate) => candidate.memberUserIds.includes(currentUserId) && candidate.status === "active");
    const boardLabel = group?.targetWallAnchorId
      ? manifest?.wallAnchors.find((candidate) => candidate.id === group.targetWallAnchorId)?.label ?? "the assigned board"
      : "";
    if (!group) return "Move into your assigned group.";
    if (boardLabel && group.hold?.enabled) return `You are in ${group.label}. Work at ${boardLabel} with your group.`;
    if (boardLabel) return `You are in ${group.label}. Head to ${boardLabel}.`;
    return `You are in ${group.label}.`;
  }
  if (payload.kind === "student-share") {
    const anchor = manifest?.wallAnchors.find((candidate) => candidate.id === payload.data.wallAnchorId);
    return payload.data.userId === currentUserId
      ? `Your turn to share to ${anchor?.label ?? "the selected board"}.`
      : "A classmate is sharing to the board.";
  }
  if (payload.kind === "timer") return payload.data.label || "Timer running.";
  if (payload.kind === "exit-ticket") return "Share your reflection before the lesson ends.";
  return "";
}

function ownResponse(check: ClassroomPrivateCheck | null, currentUserId: string) {
  return check?.responses.find((response) => response.userId === currentUserId) ?? null;
}

function sameChoiceLabels(
  a: ClassroomPrivateCheck["choices"],
  b: NonNullable<LessonStepExitTicketPayload["whatsNext"]>["choices"]
) {
  if (a.length !== b.length) return false;
  return a.every((choice, index) => choice.label === b[index]?.label);
}

function findExitTicketChecks(step: LessonStep, state: ClassroomState | null) {
  if (step.payload.kind !== "exit-ticket") return null;
  const payload = step.payload.data;
  const openChecks = (state?.privateChecks ?? []).filter((check) => check.status === "open");
  const reflectionCheck =
    openChecks.find((check) => check.promptType === "short-answer" && check.question === payload.reflectionPrompt) ?? null;
  const confidenceCheck = payload.includeConfidence
    ? (openChecks.find((check) => check.promptType === "confidence" && check.question === EXIT_TICKET_CONFIDENCE_PROMPT) ?? null)
    : null;
  const whatsNextCheck = payload.whatsNext
    ? (openChecks.find(
        (check) =>
          check.promptType === "multiple-choice" &&
          check.question === payload.whatsNext?.question &&
          sameChoiceLabels(check.choices, payload.whatsNext.choices)
      ) ?? null)
    : null;

  return {
    payload,
    reflectionCheck,
    confidenceCheck,
    whatsNextCheck
  };
}

export function LessonStudentCallout({
  run,
  currentStep,
  state,
  manifest,
  currentUserId,
  onRunAction
}: {
  run: LessonRun | null;
  currentStep: LessonStep | null;
  state: ClassroomState | null;
  manifest?: RoomManifest | null | undefined;
  currentUserId: string;
  onRunAction?: (action: ClassroomAction) => Promise<unknown>;
}) {
  const [draftReflection, setDraftReflection] = useState<string | null>(null);
  const [draftConfidence, setDraftConfidence] = useState<number | null>(null);
  const [draftChoiceId, setDraftChoiceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState("");

  if (!run || !currentStep || (run.status !== "running" && run.status !== "paused")) return null;
  const body = bodyForStep(currentStep, state, manifest, currentUserId);
  const stepNumber = run.currentStepIndex >= 0 ? run.currentStepIndex + 1 : 1;
  const exitTicket = findExitTicketChecks(currentStep, state);
  const reflectionResponse = ownResponse(exitTicket?.reflectionCheck ?? null, currentUserId);
  const confidenceResponse = ownResponse(exitTicket?.confidenceCheck ?? null, currentUserId);
  const whatsNextResponse = ownResponse(exitTicket?.whatsNextCheck ?? null, currentUserId);
  const reflectionAnswer = draftReflection ?? reflectionResponse?.answer ?? "";
  const confidenceValue = draftConfidence ?? confidenceResponse?.confidence ?? null;
  const selectedChoiceId = draftChoiceId ?? whatsNextResponse?.choiceId ?? "";
  const missingChecks =
    currentStep.payload.kind === "exit-ticket" && (
      !exitTicket?.reflectionCheck ||
      (currentStep.payload.data.includeConfidence && !exitTicket.confidenceCheck) ||
      (currentStep.payload.data.whatsNext && !exitTicket.whatsNextCheck)
    );
  const canSubmitExitTicket =
    Boolean(exitTicket?.reflectionCheck) &&
    Boolean(reflectionAnswer.trim()) &&
    (!exitTicket?.confidenceCheck || typeof confidenceValue === "number") &&
    (!exitTicket?.whatsNextCheck || Boolean(selectedChoiceId));

  async function submitExitTicket() {
    if (!exitTicket?.reflectionCheck || !onRunAction) return;
    const trimmedAnswer = reflectionAnswer.trim();
    if (!trimmedAnswer) return;

    setBusy(true);
    setSubmitError("");
    setSubmitMessage("");
    try {
      await onRunAction({
        type: "submit-private-check",
        checkId: exitTicket.reflectionCheck.id,
        answer: trimmedAnswer
      });
      if (exitTicket.confidenceCheck && typeof confidenceValue === "number") {
        await onRunAction({
          type: "submit-private-check",
          checkId: exitTicket.confidenceCheck.id,
          confidence: confidenceValue
        });
      }
      if (exitTicket.whatsNextCheck && selectedChoiceId) {
        await onRunAction({
          type: "submit-private-check",
          checkId: exitTicket.whatsNextCheck.id,
          choiceId: selectedChoiceId
        });
      }
      setSubmitMessage("Submitted — see you tomorrow.");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not submit exit ticket.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="lesson-callout" data-testid="lesson-student-callout" aria-label="Current lesson step">
      <div className="lesson-callout__meta">
        <span>Step {stepNumber} of {run.steps.length}</span>
        <span>{run.status === "paused" ? "Paused" : "Current"}</span>
      </div>
      <h2>{currentStep.title}</h2>
      {body ? <p>{body}</p> : null}
      {currentStep.payload.kind === "exit-ticket" ? (
        <div className="lesson-callout-form">
          <label className="classroom-note-field">
            <span className="classroom-note-label">{currentStep.payload.data.reflectionPrompt}</span>
            <textarea
              className="classroom-note-input"
              rows={3}
              maxLength={2000}
              placeholder="Type your reflection"
              value={reflectionAnswer}
              onChange={(event) => {
                setDraftReflection(event.target.value);
                setSubmitError("");
                setSubmitMessage("");
              }}
            />
          </label>
          {exitTicket?.confidenceCheck ? (
            <label className="classroom-check-field">
              <span className="classroom-note-label">Confidence</span>
              <select
                className="classroom-check-select"
                value={confidenceValue ?? ""}
                onChange={(event) => {
                  setDraftConfidence(event.target.value ? Number(event.target.value) : null);
                  setSubmitError("");
                  setSubmitMessage("");
                }}
              >
                <option value="" disabled>Choose 1–5</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          ) : null}
          {exitTicket?.whatsNextCheck ? (
            <div className="lesson-callout-field">
              <span className="classroom-note-label">{exitTicket.whatsNextCheck.question}</span>
              <div className="classroom-choice-list">
                {exitTicket.whatsNextCheck.choices.map((choice) => (
                  <label key={choice.id} className="classroom-choice-option">
                    <input
                      type="radio"
                      name={`exit-ticket-${exitTicket.whatsNextCheck?.id}`}
                      value={choice.id}
                      checked={selectedChoiceId === choice.id}
                      onChange={() => {
                        setDraftChoiceId(choice.id);
                        setSubmitError("");
                        setSubmitMessage("");
                      }}
                    />
                    <span>{choice.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {missingChecks ? <p className="lesson-callout__status">Exit ticket is still opening. Try again in a moment.</p> : null}
          {submitError ? <p className="lesson-callout__status lesson-callout__status--error">{submitError}</p> : null}
          {submitMessage ? <p className="lesson-callout__status lesson-callout__status--success">{submitMessage}</p> : null}
          <div className="lesson-callout-actions">
            <button
              type="button"
              className="hud-btn"
              data-testid="submit-exit-ticket"
              disabled={busy || !canSubmitExitTicket || Boolean(missingChecks)}
              onClick={() => void submitExitTicket()}
            >
              {busy ? "Submitting..." : (reflectionResponse || confidenceResponse || whatsNextResponse) ? "Update exit ticket" : "Submit exit ticket"}
            </button>
          </div>
        </div>
      ) : null}
      <LessonTimerHud run={run} currentStep={currentStep} />
    </section>
  );
}
