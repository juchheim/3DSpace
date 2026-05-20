"use client";

import { useMemo, useState } from "react";
import type { ClassroomAction, ClassroomPrivateCheck, ClassroomPrivateCheckResponse, ClassroomState, Role, RoomManifest } from "@3dspace/contracts";
import { HudCard } from "./HudCard";

function checkStatusLabel(status: ClassroomPrivateCheck["status"]) {
  if (status === "draft") return "Draft";
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  return "Archived";
}

function promptTypeLabel(promptType: ClassroomPrivateCheck["promptType"]) {
  if (promptType === "multiple-choice") return "Multiple choice";
  if (promptType === "short-answer") return "Short answer";
  return "Confidence";
}

function responseSummary(check: ClassroomPrivateCheck, response: ClassroomPrivateCheckResponse) {
  if (check.promptType === "multiple-choice") {
    return check.choices.find((choice) => choice.id === response.choiceId)?.label ?? "No choice selected";
  }
  if (check.promptType === "confidence") {
    return typeof response.confidence === "number" ? `${response.confidence}/5` : "No confidence selected";
  }
  return response.answer || "No answer";
}

function ownResponse(check: ClassroomPrivateCheck, currentUserId?: string) {
  return check.responses.find((response) => response.userId === currentUserId) ?? null;
}

const initialChoiceText = "A\nB\nC\nD";

export function PrivateChecksPanel({
  role,
  state,
  loading,
  currentUserId,
  manifest,
  onRunAction
}: {
  role: Role;
  state: ClassroomState | null;
  loading: boolean;
  currentUserId?: string | undefined;
  manifest?: RoomManifest | null | undefined;
  onRunAction(action: ClassroomAction): Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [checkQuestion, setCheckQuestion] = useState("");
  const [checkPromptType, setCheckPromptType] = useState<ClassroomPrivateCheck["promptType"]>("multiple-choice");
  const [choiceText, setChoiceText] = useState(initialChoiceText);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [studentChoices, setStudentChoices] = useState<Record<string, string>>({});
  const [studentConfidence, setStudentConfidence] = useState<Record<string, number>>({});

  const privateChecks = state?.privateChecks ?? [];
  const activeStudentChecks = useMemo(
    () => privateChecks.filter((check) => check.status === "open"),
    [privateChecks]
  );
  const parsedChoices = useMemo(
    () =>
      choiceText
        .split("\n")
        .map((choice) => choice.trim())
        .filter(Boolean)
        .map((label, index) => ({ id: `choice_${index + 1}`, label })),
    [choiceText]
  );

  async function run(label: string, action: ClassroomAction) {
    setBusy(label);
    try {
      await onRunAction(action);
      return true;
    } catch {
      return false;
    } finally {
      setBusy("");
    }
  }

  function boardLabel(check: ClassroomPrivateCheck) {
    if (!check.wallAnchorId) return "";
    return manifest?.wallAnchors.find((anchor) => anchor.id === check.wallAnchorId)?.label ?? check.wallAnchorId;
  }

  async function createPrivateCheck() {
    const question = checkQuestion.trim();
    if (!question) return;
    const created = await run("create-private-check", {
      type: "create-private-check",
      question,
      promptType: checkPromptType,
      choices: checkPromptType === "multiple-choice" ? parsedChoices : [],
      target: { kind: "all", userIds: [] },
      visibility: "teacher-only"
    });
    if (created) {
      setCheckQuestion("");
      if (checkPromptType !== "multiple-choice") setChoiceText(initialChoiceText);
    }
  }

  async function submitPrivateCheck(check: ClassroomPrivateCheck) {
    const existing = ownResponse(check, currentUserId);
    const choiceId = studentChoices[check.id] ?? existing?.choiceId ?? "";
    const answer = studentAnswers[check.id] ?? existing?.answer ?? "";
    const confidence = studentConfidence[check.id] ?? existing?.confidence;
    const action: ClassroomAction = {
      type: "submit-private-check",
      checkId: check.id,
      ...(check.promptType === "multiple-choice" && choiceId ? { choiceId } : {}),
      ...(check.promptType === "short-answer" && answer.trim() ? { answer: answer.trim() } : {}),
      ...(check.promptType === "confidence" && typeof confidence === "number" ? { confidence } : {})
    };
    const submitted = await run(`submit-check-${check.id}`, action);
    if (submitted) {
      setStudentAnswers((current) => {
        const { [check.id]: _, ...rest } = current;
        return rest;
      });
    }
  }

  if (role === "teacher") {
    const openCount = privateChecks.filter((c) => c.status === "open").length;
    return (
      <HudCard title="Private Checks" badge={loading ? "…" : `${openCount} open`} ariaLabel="Private checks" defaultCollapsed={true}>
        <div className="classroom-check-create" data-testid="private-check-create">
          <label className="classroom-note-field">
            <span className="classroom-note-label">Question</span>
            <textarea
              className="classroom-note-input"
              rows={3}
              maxLength={1000}
              placeholder="What is one thing you learned?"
              value={checkQuestion}
              onChange={(event) => setCheckQuestion(event.target.value)}
            />
          </label>
          <label className="classroom-check-field">
            <span className="classroom-note-label">Type</span>
            <select
              className="classroom-check-select"
              value={checkPromptType}
              onChange={(event) => setCheckPromptType(event.target.value as ClassroomPrivateCheck["promptType"])}
            >
              <option value="multiple-choice">Multiple choice</option>
              <option value="short-answer">Short answer</option>
              <option value="confidence">Confidence</option>
            </select>
          </label>
          {checkPromptType === "multiple-choice" ? (
            <label className="classroom-note-field">
              <span className="classroom-note-label">Choices, one per line</span>
              <textarea
                className="classroom-note-input"
                rows={4}
                maxLength={900}
                value={choiceText}
                onChange={(event) => setChoiceText(event.target.value)}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="hud-btn"
            data-testid="create-private-check-button"
            disabled={busy === "create-private-check" || !checkQuestion.trim() || (checkPromptType === "multiple-choice" && parsedChoices.length < 2)}
            onClick={() => void createPrivateCheck()}
          >
            Create check
          </button>
        </div>
        {privateChecks.length === 0 ? <p className="small">No private checks yet.</p> : null}
        <ul className="classroom-help-list" role="list">
          {privateChecks.map((check) => (
            <li key={check.id} className="classroom-help-item" data-testid={`private-check-${check.id}`}>
              <div className="classroom-help-meta">
                <span className="classroom-help-name">{check.question}</span>
                <span className={`tag${check.status === "open" ? " active" : ""}`}>{checkStatusLabel(check.status)}</span>
              </div>
              <p className="classroom-help-note">
                {promptTypeLabel(check.promptType)} | {check.responses.length} response{check.responses.length === 1 ? "" : "s"}
              </p>
              {check.wallAnchorId ? <p className="classroom-help-note">Board: {boardLabel(check)}</p> : null}
              <div className="classroom-help-actions">
                {check.status === "open" ? (
                  <button
                    type="button"
                    className="hud-btn"
                    disabled={busy === `close-check-${check.id}`}
                    data-testid={`close-private-check-${check.id}`}
                    onClick={() => void run(`close-check-${check.id}`, { type: "close-private-check", checkId: check.id })}
                  >
                    Close
                  </button>
                ) : check.status === "closed" ? (
                  <button
                    type="button"
                    className="hud-btn"
                    disabled={busy === `reopen-check-${check.id}`}
                    data-testid={`reopen-private-check-${check.id}`}
                    onClick={() => void run(`reopen-check-${check.id}`, { type: "reopen-private-check", checkId: check.id })}
                  >
                    Reopen
                  </button>
                ) : check.status === "draft" ? (
                  <button
                    type="button"
                    className="hud-btn"
                    disabled={busy === `open-check-${check.id}`}
                    data-testid={`open-private-check-${check.id}`}
                    onClick={() => void run(`open-check-${check.id}`, { type: "open-private-check", checkId: check.id })}
                  >
                    Open
                  </button>
                ) : null}
              </div>
              {check.responses.length > 0 ? (
                <ul className="classroom-check-responses" role="list">
                  {check.responses.map((response) => (
                    <li key={`${check.id}-${response.userId}`} className="classroom-check-response">
                      <span>{response.displayName}</span>
                      <strong>{responseSummary(check, response)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="classroom-help-note">No responses yet.</p>
              )}
            </li>
          ))}
        </ul>
      </HudCard>
    );
  }

  return (
    <HudCard title="Private Checks" badge={loading ? "…" : activeStudentChecks.length} ariaLabel="Private checks" defaultCollapsed={true}>
      {activeStudentChecks.length === 0 ? <p className="small">No active checks right now.</p> : null}
      <ul className="classroom-help-list" role="list">
        {activeStudentChecks.map((check) => {
          const response = ownResponse(check, currentUserId);
          const selectedChoice = studentChoices[check.id] ?? response?.choiceId ?? "";
          const answer = studentAnswers[check.id] ?? response?.answer ?? "";
          const confidence = studentConfidence[check.id] ?? response?.confidence;
          const canSubmit =
            check.promptType === "multiple-choice"
              ? Boolean(selectedChoice)
              : check.promptType === "short-answer"
                ? Boolean(answer.trim())
                : typeof confidence === "number";
          return (
            <li key={check.id} className="classroom-help-item" data-testid={`student-private-check-${check.id}`}>
              <div className="classroom-help-meta">
                <span className="classroom-help-name">{check.question}</span>
                <span className="tag active">Open</span>
              </div>
              {check.wallAnchorId ? <p className="classroom-help-note">Board: {boardLabel(check)}</p> : null}
              {response ? <p className="classroom-help-note">Submitted: {responseSummary(check, response)}</p> : null}
              {check.promptType === "multiple-choice" ? (
                <div className="classroom-choice-list">
                  {check.choices.map((choice) => (
                    <label key={choice.id} className="classroom-choice-option">
                      <input
                        type="radio"
                        name={`private-check-${check.id}`}
                        value={choice.id}
                        checked={selectedChoice === choice.id}
                        onChange={() => setStudentChoices((current) => ({ ...current, [check.id]: choice.id }))}
                      />
                      <span>{choice.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {check.promptType === "short-answer" ? (
                <textarea
                  className="classroom-note-input"
                  rows={3}
                  maxLength={2000}
                  placeholder="Type your answer"
                  value={answer}
                  onChange={(event) => setStudentAnswers((current) => ({ ...current, [check.id]: event.target.value }))}
                />
              ) : null}
              {check.promptType === "confidence" ? (
                <label className="classroom-check-field">
                  <span className="classroom-note-label">Confidence</span>
                  <select
                    className="classroom-check-select"
                    value={confidence ?? ""}
                    onChange={(event) =>
                      setStudentConfidence((current) => ({ ...current, [check.id]: Number(event.target.value) }))
                    }
                  >
                    <option value="" disabled>Choose 1–5</option>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="hud-btn"
                disabled={busy === `submit-check-${check.id}` || !canSubmit}
                data-testid={`submit-private-check-${check.id}`}
                onClick={() => void submitPrivateCheck(check)}
              >
                {response ? "Update response" : "Submit"}
              </button>
            </li>
          );
        })}
      </ul>
    </HudCard>
  );
}
