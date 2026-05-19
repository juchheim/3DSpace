"use client";

import { useState } from "react";
import type { ClassroomAction, ClassroomSpotlight, ClassroomState, Role, RoomManifest } from "@3dspace/contracts";
import { HudCard } from "./HudCard";

const MODE_LABELS: Record<ClassroomSpotlight["mode"], string> = {
  highlight: "Highlight",
  guide: "Guide students",
  force: "Force focus"
};

export function FocusPanel({
  role,
  state,
  loading,
  manifest,
  currentUserId,
  onRunAction,
  onLookAtFocus
}: {
  role: Role;
  state: ClassroomState | null;
  loading: boolean;
  manifest?: RoomManifest | null | undefined;
  currentUserId?: string | undefined;
  onRunAction(action: ClassroomAction): Promise<void>;
  onLookAtFocus?(anchorId: string): void;
}) {
  const [busy, setBusy] = useState("");
  const [targetAnchorId, setTargetAnchorId] = useState("");
  const [mode, setMode] = useState<ClassroomSpotlight["mode"]>("highlight");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");

  const spotlight = state?.spotlight ?? null;
  const anchors = manifest?.wallAnchors ?? [];
  const focusedAnchor = spotlight?.anchorId
    ? anchors.find((a) => a.id === spotlight.anchorId)
    : null;

  async function run(label: string, action: ClassroomAction) {
    setBusy(label);
    try {
      await onRunAction(action);
    } finally {
      setBusy("");
    }
  }

  async function setFocus() {
    if (!targetAnchorId) return;
    await run("set-spotlight", {
      type: "set-spotlight",
      targetType: "wall-anchor",
      anchorId: targetAnchorId,
      mode,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(instruction.trim() ? { instruction: instruction.trim() } : {})
    });
    setTitle("");
    setInstruction("");
  }

  async function clearFocus() {
    await run("clear-spotlight", { type: "clear-spotlight" });
  }

  if (role === "teacher") {
    return (
      <HudCard
        title="Focus"
        badge={loading ? "…" : spotlight ? "Active" : "—"}
        ariaLabel="Board focus"
        defaultCollapsed={true}
      >
        {spotlight ? (
          <div className="classroom-grant-panel" data-testid="spotlight-active">
            <div className="classroom-grant-header">
              <span>Active focus</span>
              <span className="tag active">{MODE_LABELS[spotlight.mode]}</span>
            </div>
            {focusedAnchor ? (
              <p className="classroom-help-note">Board: {focusedAnchor.label}</p>
            ) : null}
            {spotlight.title ? <p className="classroom-help-note">{spotlight.title}</p> : null}
            {spotlight.instruction ? <p className="classroom-help-note small">{spotlight.instruction}</p> : null}
            <div className="classroom-help-actions">
              <button
                type="button"
                className="hud-btn"
                disabled={busy === "clear-spotlight"}
                data-testid="clear-spotlight-button"
                onClick={() => void clearFocus()}
              >
                Clear focus
              </button>
            </div>
          </div>
        ) : (
          <div className="classroom-check-create" data-testid="spotlight-form">
            <div className="classroom-check-field">
              <span className="classroom-note-label">Board</span>
              <select
                className="classroom-check-select"
                value={targetAnchorId}
                aria-label="Select board to focus"
                onChange={(event) => setTargetAnchorId(event.target.value)}
              >
                <option value="" disabled>Select board…</option>
                {anchors.map((anchor) => (
                  <option key={anchor.id} value={anchor.id}>{anchor.label}</option>
                ))}
              </select>
            </div>
            <div className="classroom-check-field">
              <span className="classroom-note-label">Mode</span>
              <div className="classroom-focus-modes" role="group" aria-label="Focus mode">
                {(["highlight", "guide", "force"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`hud-btn${mode === m ? " hud-btn--active" : ""}`}
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            <label className="classroom-note-field">
              <span className="classroom-note-label">Title <span className="classroom-note-optional">(optional)</span></span>
              <input
                className="classroom-note-input"
                type="text"
                maxLength={160}
                placeholder="Look at the diagram"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="classroom-note-field">
              <span className="classroom-note-label">Instruction <span className="classroom-note-optional">(optional)</span></span>
              <input
                className="classroom-note-input"
                type="text"
                maxLength={500}
                placeholder="Identify the labeled parts"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="hud-btn"
              disabled={busy === "set-spotlight" || !targetAnchorId}
              data-testid="set-spotlight-button"
              onClick={() => void setFocus()}
            >
              Focus class
            </button>
          </div>
        )}
      </HudCard>
    );
  }

  if (!spotlight) return null;

  return (
    <div className="spotlight-callout" role="status" aria-live="polite" data-testid="spotlight-callout">
      <div className="spotlight-callout__header">
        <span className="spotlight-callout__icon" aria-hidden="true">◉</span>
        <span className="spotlight-callout__title">{spotlight.title ?? "Your teacher is focusing the class"}</span>
      </div>
      {spotlight.instruction ? (
        <p className="spotlight-callout__instruction">{spotlight.instruction}</p>
      ) : null}
      {spotlight.mode === "force" ? (
        <p className="spotlight-callout__instruction">View locked by your teacher.</p>
      ) : spotlight.mode === "guide" && spotlight.anchorId && onLookAtFocus ? (
        <button
          type="button"
          className="hud-btn spotlight-callout__goto"
          onClick={() => onLookAtFocus(spotlight.anchorId!)}
        >
          Look at focus
        </button>
      ) : null}
    </div>
  );
}
