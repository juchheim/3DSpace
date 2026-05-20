"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassroomAction, ClassroomState, LessonRun, LessonStep, LessonStepInput, LessonStepKind, LessonStepPayload, RoomManifest, WallObjectType } from "@3dspace/contracts";
import { HudCard } from "./HudCard";
import type { LessonStepStatus } from "../lib/useLessonRun";

type ParticipantOption = {
  id: string;
  displayName: string;
  role: "teacher" | "student";
};

const STEP_KINDS: Array<{ kind: LessonStepKind; label: string }> = [
  { kind: "instruction", label: "Instruction" },
  { kind: "focus-board", label: "Focus Board" },
  { kind: "private-check", label: "Private Check" },
  { kind: "group-work", label: "Group Work" },
  { kind: "timer", label: "Timer" },
  { kind: "student-share", label: "Student Share" }
];

const SHARE_TYPES: WallObjectType[] = ["note", "image.file", "whiteboard", "camera.live", "screen.live"];
const DEFAULT_GROUP_COLOR = "#389060";
const DEFAULT_GROUP_HOLD = { enabled: true, mode: "hard" as const, radiusMeters: 2.5 };

function firstAnchorId(manifest: RoomManifest | null | undefined) {
  return manifest?.wallAnchors[0]?.id ?? "";
}

function firstStudentId(participants: ParticipantOption[]) {
  return participants.find((participant) => participant.role === "student")?.id ?? participants[0]?.id ?? "";
}

function defaultStep(kind: LessonStepKind, manifest: RoomManifest | null | undefined, participants: ParticipantOption[]): LessonStepInput {
  const anchorId = firstAnchorId(manifest);
  const studentId = firstStudentId(participants);
  if (kind === "focus-board") {
    return {
      kind,
      title: "Look at the board",
      payload: { kind, data: { anchorId, mode: "highlight", title: "Look here", instruction: "Use this board for the next prompt." } }
    };
  }
  if (kind === "private-check") {
    return {
      kind,
      title: "Quick check",
      payload: {
        kind,
        data: {
          question: "What do you notice?",
          promptType: "short-answer",
          choices: [],
          target: { kind: "all", userIds: [] },
          wallAnchorId: anchorId || undefined,
          autoCloseOnAdvance: true
        }
      }
    };
  }
  if (kind === "group-work") {
    return {
      kind,
      title: "Group work",
      payload: {
        kind,
        data: {
          newGroup: {
            label: "Team A",
            color: DEFAULT_GROUP_COLOR,
            memberUserIds: participants.filter((p) => p.role === "student").map((p) => p.id),
            targetWallAnchorId: anchorId || undefined,
            hold: anchorId ? DEFAULT_GROUP_HOLD : undefined
          },
          releaseOnAdvance: true
        }
      }
    };
  }
  if (kind === "timer") {
    return { kind, title: "Work timer", payload: { kind, data: { durationSeconds: 60, label: "Work time", placement: "hud", autoAdvanceOnComplete: false } } };
  }
  if (kind === "student-share") {
    return {
      kind,
      title: "Student share",
      payload: {
        kind,
        data: {
          userId: studentId,
          wallAnchorId: anchorId,
          allowedObjectTypes: ["note"],
          acknowledgeHandIfRaised: true,
          revokeOnAdvance: true
        }
      }
    };
  }
  return { kind, title: "Instruction", payload: { kind: "instruction", data: { body: "Share the next direction with students." } } };
}

function stepKindLabel(kind: LessonStepKind) {
  return STEP_KINDS.find((candidate) => candidate.kind === kind)?.label ?? kind;
}

function isNonArchivedGroup(group: NonNullable<ClassroomState["groups"]>[number]) {
  return group.status !== "archived";
}

function groupTargetBoardLabel(
  targetWallAnchorId: string | undefined,
  manifest: RoomManifest | null | undefined
) {
  if (!targetWallAnchorId) return "";
  return manifest?.wallAnchors.find((anchor) => anchor.id === targetWallAnchorId)?.label ?? targetWallAnchorId;
}

function brokenAssetMessage(step: LessonStep, manifest: RoomManifest | null | undefined, state: ClassroomState | null, participants: ParticipantOption[]) {
  const anchorIds = new Set((manifest?.wallAnchors ?? []).map((anchor) => anchor.id));
  const userIds = new Set(participants.map((participant) => participant.id));
  const payload = step.payload;
  if (payload.kind === "focus-board" && !anchorIds.has(payload.data.anchorId)) return "This step references a missing board.";
  if (payload.kind === "private-check" && payload.data.wallAnchorId && !anchorIds.has(payload.data.wallAnchorId)) return "This check references a missing board.";
  if (payload.kind === "group-work") {
    if (payload.data.existingGroupId && !state?.groups.some((group) => group.id === payload.data.existingGroupId)) return "This step references a missing group.";
    if (payload.data.newGroup?.targetWallAnchorId && !anchorIds.has(payload.data.newGroup.targetWallAnchorId)) return "This group target references a missing board.";
  }
  if (payload.kind === "timer" && payload.data.placement === "wall" && !anchorIds.has(payload.data.wallAnchorId ?? "")) return "This timer references a missing board.";
  if (payload.kind === "student-share") {
    if (!userIds.has(payload.data.userId)) return "This share step references a missing student.";
    if (!anchorIds.has(payload.data.wallAnchorId)) return "This share step references a missing board.";
  }
  return "";
}

function LessonStepEditor({
  step,
  manifest,
  state,
  participants,
  onSave
}: {
  step: LessonStep;
  manifest: RoomManifest | null | undefined;
  state: ClassroomState | null;
  participants: ParticipantOption[];
  onSave(input: { title: string; notes?: string; payload: LessonStepPayload }): Promise<void>;
}) {
  const [title, setTitle] = useState(step.title);
  const [notes, setNotes] = useState(step.notes ?? "");
  const [payload, setPayload] = useState<LessonStepPayload>(step.payload);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(step.title);
    setNotes(step.notes ?? "");
    setPayload(step.payload);
    // Only reset when the selected step changes, not on every server sync.
    // Including step.title/notes/payload caused real-time updates to wipe
    // in-progress edits because new object references triggered the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  function setData(patch: Record<string, unknown>) {
    setPayload((current) => ({ ...current, data: { ...current.data, ...patch } } as LessonStepPayload));
  }

  function setGroupDraft(
    updater: (
      current: NonNullable<Extract<LessonStepPayload, { kind: "group-work" }>["data"]["newGroup"]>
    ) => NonNullable<Extract<LessonStepPayload, { kind: "group-work" }>["data"]["newGroup"]>
  ) {
    if (payload.kind !== "group-work") return;
    const currentGroup = payload.data.newGroup ?? {
      label: "Team",
      color: DEFAULT_GROUP_COLOR,
      memberUserIds: [],
      targetWallAnchorId: firstAnchorId(manifest) || undefined,
      hold: firstAnchorId(manifest) ? DEFAULT_GROUP_HOLD : undefined
    };
    setData({ existingGroupId: undefined, newGroup: updater(currentGroup) });
  }

  async function save() {
    setSaving(true);
    try {
      const next: { title: string; notes?: string; payload: LessonStepPayload } = { title: title.trim() || step.title, payload };
      if (notes.trim()) next.notes = notes.trim();
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lesson-editor" data-testid="lesson-step-editor">
      <label>
        <span>Title</span>
        <input data-testid="lesson-step-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        <span>Teacher notes</span>
        <textarea value={notes} maxLength={2000} rows={2} onChange={(event) => setNotes(event.target.value)} />
      </label>

      {payload.kind === "instruction" ? (
        <label>
          <span>Student instruction</span>
          <textarea
            data-testid="lesson-instruction-body"
            rows={4}
            maxLength={2000}
            value={payload.data.body}
            onChange={(event) => setData({ body: event.target.value })}
          />
        </label>
      ) : null}

      {payload.kind === "focus-board" ? (
        <>
          <label>
            <span>Board</span>
            <select value={payload.data.anchorId} onChange={(event) => setData({ anchorId: event.target.value })}>
              {(manifest?.wallAnchors ?? []).map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
            </select>
          </label>
          <label>
            <span>Mode</span>
            <select value={payload.data.mode} onChange={(event) => setData({ mode: event.target.value })}>
              <option value="highlight">Highlight</option>
              <option value="guide">Guide</option>
              <option value="force">Force</option>
            </select>
          </label>
          <label>
            <span>Prompt</span>
            <textarea rows={3} maxLength={500} value={payload.data.instruction ?? ""} onChange={(event) => setData({ instruction: event.target.value })} />
          </label>
        </>
      ) : null}

      {payload.kind === "private-check" ? (
        <>
          <label>
            <span>Question</span>
            <textarea
              data-testid="lesson-private-check-question"
              rows={3}
              maxLength={1000}
              value={payload.data.question}
              onChange={(event) => setData({ question: event.target.value })}
            />
          </label>
          <label>
            <span>Prompt type</span>
            <select value={payload.data.promptType} onChange={(event) => setData({ promptType: event.target.value })}>
              <option value="short-answer">Short answer</option>
              <option value="multiple-choice">Multiple choice</option>
              <option value="confidence">Confidence</option>
            </select>
          </label>
          <label>
            <span>Board</span>
            <select value={payload.data.wallAnchorId ?? ""} onChange={(event) => setData({ wallAnchorId: event.target.value || undefined })}>
              <option value="">No board</option>
              {(manifest?.wallAnchors ?? []).map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
            </select>
          </label>
          {payload.data.promptType === "multiple-choice" ? (
            <label>
              <span>Choices, one per line</span>
              <textarea
                rows={4}
                value={payload.data.choices.map((choice) => choice.label).join("\n")}
                onChange={(event) =>
                  setData({
                    choices: event.target.value
                      .split("\n")
                      .map((label, index) => ({ id: `choice-${index + 1}`, label: label.trim() }))
                      .filter((choice) => choice.label)
                  })
                }
              />
            </label>
          ) : null}
          <label className="lesson-check-row">
            <input type="checkbox" checked={payload.data.autoCloseOnAdvance} onChange={(event) => setData({ autoCloseOnAdvance: event.target.checked })} />
            <span>Close check on advance</span>
          </label>
        </>
      ) : null}

      {payload.kind === "group-work" ? (
        <>
          <label>
            <span>Source</span>
            <select
              value={payload.data.existingGroupId ? "existing" : "new"}
              onChange={(event) => {
                if (event.target.value === "existing") {
                  const existingGroup = (state?.groups ?? []).find(isNonArchivedGroup);
                  setData({ existingGroupId: existingGroup?.id ?? "", newGroup: undefined });
                  return;
                }
                setData({
                  existingGroupId: undefined,
                  newGroup: {
                    label: "Team A",
                    color: DEFAULT_GROUP_COLOR,
                    memberUserIds: participants.filter((participant) => participant.role === "student").map((participant) => participant.id),
                    targetWallAnchorId: firstAnchorId(manifest) || undefined,
                    hold: firstAnchorId(manifest) ? DEFAULT_GROUP_HOLD : undefined
                  }
                });
              }}
            >
              <option value="new">Create lesson group</option>
              <option value="existing" disabled={!state?.groups.some(isNonArchivedGroup)}>Reuse existing group</option>
            </select>
          </label>
          {payload.data.existingGroupId ? (
            <>
              <label>
                <span>Group</span>
                <select value={payload.data.existingGroupId} onChange={(event) => setData({ existingGroupId: event.target.value, newGroup: undefined })}>
                  {(state?.groups ?? []).filter(isNonArchivedGroup).map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                </select>
              </label>
              {(() => {
                const existingGroup = (state?.groups ?? []).find((group) => group.id === payload.data.existingGroupId);
                if (!existingGroup) return <p className="small">This step references a missing group.</p>;
                const boardLabel = groupTargetBoardLabel(existingGroup.targetWallAnchorId, manifest);
                return (
                  <p className="small">
                    {existingGroup.memberUserIds.length} member{existingGroup.memberUserIds.length === 1 ? "" : "s"}
                    {boardLabel ? ` • board: ${boardLabel}` : ""}
                    {existingGroup.hold?.enabled ? " • locked in room" : ""}
                  </p>
                );
              })()}
            </>
          ) : null}
          {payload.data.newGroup ? (
            <>
          <label>
            <span>Group label</span>
            <input
              value={payload.data.newGroup?.label ?? ""}
              onChange={(event) => setGroupDraft((current) => ({ ...current, label: event.target.value }))}
            />
          </label>
          <label>
            <span>Color</span>
            <input
              value={payload.data.newGroup?.color ?? DEFAULT_GROUP_COLOR}
              onChange={(event) => setGroupDraft((current) => ({ ...current, color: event.target.value }))}
            />
          </label>
          <label>
            <span>Work board</span>
            <select
              value={payload.data.newGroup.targetWallAnchorId ?? ""}
              onChange={(event) =>
                setGroupDraft((current) => ({
                  ...current,
                  targetWallAnchorId: event.target.value || undefined,
                  hold: event.target.value ? current.hold ?? DEFAULT_GROUP_HOLD : current.hold
                }))
              }
            >
              <option value="">No board</option>
              {(manifest?.wallAnchors ?? []).map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
            </select>
          </label>
          <div className="lesson-member-list">
            {participants.filter((participant) => participant.role === "student").map((participant) => {
              const members = payload.data.newGroup?.memberUserIds ?? [];
              const checked = members.includes(participant.id);
              return (
                <label key={participant.id} className="lesson-check-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const nextMembers = event.target.checked ? [...members, participant.id] : members.filter((id) => id !== participant.id);
                      setGroupDraft((current) => ({ ...current, memberUserIds: nextMembers }));
                    }}
                  />
                  <span>{participant.displayName}</span>
                </label>
              );
            })}
          </div>
          <label className="lesson-check-row">
            <input
              type="checkbox"
              checked={Boolean(payload.data.newGroup.hold?.enabled)}
              onChange={(event) =>
                setGroupDraft((current) => ({
                  ...current,
                  hold: event.target.checked ? { ...(current.hold ?? DEFAULT_GROUP_HOLD), enabled: true, mode: "hard", radiusMeters: current.hold?.radiusMeters ?? DEFAULT_GROUP_HOLD.radiusMeters } : undefined
                }))
              }
            />
            <span>Lock students into the group zone</span>
          </label>
          {payload.data.newGroup.hold?.enabled ? (
            <label>
              <span>Zone radius (m)</span>
              <input
                type="number"
                min={1}
                max={6}
                step={0.5}
                value={payload.data.newGroup.hold.radiusMeters}
                onChange={(event) =>
                  setGroupDraft((current) => ({
                    ...current,
                    hold: {
                      enabled: true,
                      mode: "hard",
                      radiusMeters: Number(event.target.value)
                    }
                  }))
                }
              />
            </label>
          ) : null}
          {payload.data.newGroup.targetWallAnchorId ? (
            <p className="small">Students will be sent to a working zone near this board when the step starts.</p>
          ) : null}
            </>
          ) : null}
          <label className="lesson-check-row">
            <input type="checkbox" checked={payload.data.releaseOnAdvance} onChange={(event) => setData({ releaseOnAdvance: event.target.checked })} />
            <span>Release on advance</span>
          </label>
        </>
      ) : null}

      {payload.kind === "timer" ? (
        <>
          <label>
            <span>Label</span>
            <input value={payload.data.label} maxLength={80} onChange={(event) => setData({ label: event.target.value })} />
          </label>
          <label>
            <span>Seconds</span>
            <input type="number" min={5} max={3600} value={payload.data.durationSeconds} onChange={(event) => setData({ durationSeconds: Number(event.target.value) })} />
          </label>
          <label>
            <span>Placement</span>
            <select value={payload.data.placement} onChange={(event) => setData({ placement: event.target.value })}>
              <option value="hud">HUD</option>
              <option value="wall">Wall</option>
            </select>
          </label>
          {payload.data.placement === "wall" ? (
            <label>
              <span>Board</span>
              <select value={payload.data.wallAnchorId ?? firstAnchorId(manifest)} onChange={(event) => setData({ wallAnchorId: event.target.value })}>
                {(manifest?.wallAnchors ?? []).map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
              </select>
            </label>
          ) : null}
          <label className="lesson-check-row">
            <input type="checkbox" checked={payload.data.autoAdvanceOnComplete} onChange={(event) => setData({ autoAdvanceOnComplete: event.target.checked })} />
            <span>Auto-advance locally</span>
          </label>
        </>
      ) : null}

      {payload.kind === "student-share" ? (
        <>
          <label>
            <span>Student</span>
            <select value={payload.data.userId} onChange={(event) => setData({ userId: event.target.value })}>
              {participants.filter((participant) => participant.role === "student").map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}
            </select>
          </label>
          <label>
            <span>Board</span>
            <select value={payload.data.wallAnchorId} onChange={(event) => setData({ wallAnchorId: event.target.value })}>
              {(manifest?.wallAnchors ?? []).map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
            </select>
          </label>
          <div className="lesson-member-list">
            {SHARE_TYPES.map((type) => {
              const checked = payload.data.allowedObjectTypes.includes(type);
              return (
                <label key={type} className="lesson-check-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...payload.data.allowedObjectTypes, type]
                        : payload.data.allowedObjectTypes.filter((candidate) => candidate !== type);
                      setData({ allowedObjectTypes: next });
                    }}
                  />
                  <span>{type}</span>
                </label>
              );
            })}
          </div>
          <label className="lesson-check-row">
            <input type="checkbox" checked={payload.data.revokeOnAdvance} onChange={(event) => setData({ revokeOnAdvance: event.target.checked })} />
            <span>Revoke on advance</span>
          </label>
        </>
      ) : null}

      <button type="button" className="hud-btn" data-testid="save-lesson-step" disabled={saving} onClick={() => void save()}>
        Save Step
      </button>
    </div>
  );
}

export function LessonAuthoringPanel({
  run,
  state,
  manifest,
  participants,
  loading,
  error,
  runAction,
  stepStatus
}: {
  run: LessonRun | null;
  state: ClassroomState | null;
  manifest?: RoomManifest | null | undefined;
  participants: ParticipantOption[];
  loading: boolean;
  error: string;
  runAction(action: ClassroomAction): Promise<unknown>;
  stepStatus(stepIndex: number): LessonStepStatus;
}) {
  const [title, setTitle] = useState("Untitled lesson");
  const [selectedStepId, setSelectedStepId] = useState("");
  const [busy, setBusy] = useState("");
  const selectedStep = useMemo(() => run?.steps.find((step) => step.id === selectedStepId) ?? run?.steps[0] ?? null, [run, selectedStepId]);
  const brokenMessage = selectedStep ? brokenAssetMessage(selectedStep, manifest, state, participants) : "";

  useEffect(() => {
    if (run?.title) setTitle(run.title);
    if (run?.steps.length && !run.steps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(run.steps[0]?.id ?? "");
    }
  }, [run, selectedStepId]);

  async function execute(label: string, action: ClassroomAction) {
    setBusy(label);
    try {
      await runAction(action);
    } finally {
      setBusy("");
    }
  }

  if (!run) {
    return (
      <HudCard title="Lesson" badge={loading ? "…" : "Off"} ariaLabel="Lesson authoring">
        {error ? <p className="small">{error}</p> : null}
        <label>
          <span>Lesson title</span>
          <input data-testid="lesson-run-title" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <button
          type="button"
          className="hud-btn"
          data-testid="init-lesson-run"
          disabled={busy === "init"}
          onClick={() => void execute("init", { type: "init-lesson-run", title: title.trim() || "Untitled lesson" })}
        >
          Create Lesson
        </button>
      </HudCard>
    );
  }

  return (
    <HudCard title="Lesson Script" badge={`${run.steps.length}`} ariaLabel="Lesson authoring">
      {error ? <p className="small">{error}</p> : null}
      <label>
        <span>Lesson title</span>
        <input
          data-testid="lesson-run-title"
          value={title}
          maxLength={160}
          onBlur={() => {
            if (title.trim() && title.trim() !== run.title) void execute("title", { type: "set-lesson-run-title", title: title.trim() });
          }}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="lesson-add-grid" aria-label="Add lesson step">
        {STEP_KINDS.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            className="hud-btn"
            data-testid={`add-lesson-step-${entry.kind}`}
            disabled={busy === entry.kind || run.status === "ended" || run.status === "abandoned"}
            onClick={() => void execute(entry.kind, { type: "add-lesson-step", step: defaultStep(entry.kind, manifest, participants) })}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <ol className="lesson-step-list" data-testid="lesson-step-list">
        {run.steps.map((step, index) => {
          const status = stepStatus(index);
          return (
            <li key={step.id} className={`lesson-step-row ${selectedStep?.id === step.id ? "selected" : ""} ${status}`} data-testid={`lesson-step-${index}`}>
              <button type="button" className="lesson-step-main" onClick={() => setSelectedStepId(step.id)}>
                <span>{index + 1}</span>
                <strong>{step.title}</strong>
                <em>{stepKindLabel(step.kind)}</em>
              </button>
              <div className="lesson-step-row__actions">
                <button type="button" className="hud-btn" disabled={index === 0} onClick={() => void execute(`up-${step.id}`, { type: "move-lesson-step", from: index, to: index - 1 })}>Up</button>
                <button type="button" className="hud-btn" disabled={index === run.steps.length - 1} onClick={() => void execute(`down-${step.id}`, { type: "move-lesson-step", from: index, to: index + 1 })}>Down</button>
                <button type="button" className="hud-btn" onClick={() => void execute(`remove-${step.id}`, { type: "remove-lesson-step", stepId: step.id })}>Remove</button>
              </div>
            </li>
          );
        })}
      </ol>
      {brokenMessage ? <p className="lesson-broken" data-testid="lesson-broken-step">{brokenMessage}</p> : null}
      {selectedStep ? (
        <LessonStepEditor
          key={selectedStep.id}
          step={selectedStep}
          manifest={manifest}
          state={state}
          participants={participants}
          onSave={(input) => execute(`save-${selectedStep.id}`, { type: "update-lesson-step", stepId: selectedStep.id, ...input })}
        />
      ) : null}
    </HudCard>
  );
}
