"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AvatarReactionSlug,
  ClassroomAction,
  ClassroomBoardAccessGrant,
  ClassroomHelpRequest,
  ClassroomState,
  Role,
  RoomManifest,
  RoomSettings
} from "@3dspace/contracts";
import { isBoardGrantActive, summarizeBoardGrantTypes } from "../lib/classroomGrants";
import { CLIENT_TUNING } from "../lib/config";
import type { ReactionLogEntry } from "../lib/useAvatarReactions";
import { HudCard } from "./HudCard";

const REACTION_SLUGS: { slug: AvatarReactionSlug; emoji: string }[] = [
  { slug: "thumbs-up", emoji: "👍" },
  { slug: "confused",  emoji: "😕" },
  { slug: "question",  emoji: "❓" },
  { slug: "me",        emoji: "🙋" },
  { slug: "pause",     emoji: "🤚" },
  { slug: "celebrate", emoji: "🎉" }
];

function statusLabel(status: ClassroomHelpRequest["status"]) {
  if (status === "raised") return "Raised";
  if (status === "acknowledged") return "Acknowledged";
  if (status === "closed") return "Closed";
  return "Cancelled";
}

function ElapsedTimer({ sinceIso, warnAfterSeconds }: { sinceIso: string; warnAfterSeconds?: number }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(sinceIso).getTime()) / 1000));
  useEffect(() => {
    const start = new Date(sinceIso).getTime();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [sinceIso]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const warn = warnAfterSeconds !== undefined && elapsed >= warnAfterSeconds;
  return <span className={`hallpass-timer${warn ? " hallpass-timer--warn" : ""}`}>{m > 0 ? `${m}m ` : ""}{s}s{warn ? " ⚠" : ""}</span>;
}

export function ClassroomPanel({
  role,
  state,
  loading,
  error,
  activeHelpRequest,
  manifest,
  currentUserId,
  boardAccessUserId = "",
  reactionLog = [],
  hallpassSettings,
  onOpenBoardAccess,
  onRunAction
}: {
  role: Role;
  state: ClassroomState | null;
  loading: boolean;
  error: string;
  activeHelpRequest: ClassroomHelpRequest | null;
  manifest?: RoomManifest | null | undefined;
  currentUserId?: string | undefined;
  boardAccessUserId?: string | undefined;
  reactionLog?: ReactionLogEntry[];
  hallpassSettings?: RoomSettings["hallpass"] | undefined;
  onOpenBoardAccess?(userId: string): void;
  onRunAction(action: ClassroomAction): Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const teacherQueue = useMemo(
    () => (state?.helpRequests ?? []).filter((r) => r.kind !== "hallpass" && (r.status === "raised" || r.status === "acknowledged")),
    [state?.helpRequests]
  );
  const pendingHallpasses = useMemo(
    () => (state?.helpRequests ?? []).filter((r) => r.kind === "hallpass" && r.status === "raised"),
    [state?.helpRequests]
  );
  const currentlyOutPasses = useMemo(
    () => (state?.helpRequests ?? []).filter((r) => r.kind === "hallpass" && r.status === "acknowledged"),
    [state?.helpRequests]
  );
  const todayCompletedPasses = useMemo(() => {
    const todayPrefix = new Date().toISOString().slice(0, 10);
    return (state?.helpRequests ?? []).filter(
      (r) => r.kind === "hallpass" && r.status === "closed" && typeof r.returnedAt === "string" && r.returnedAt.startsWith(todayPrefix)
    );
  }, [state?.helpRequests]);
  const activeBoardGrant = useMemo<ClassroomBoardAccessGrant | null>(
    () =>
      (state?.boardAccessGrants ?? []).find(
        (grant) => (!currentUserId || grant.userId === currentUserId) && isBoardGrantActive(grant)
      ) ?? null,
    [currentUserId, state?.boardAccessGrants]
  );

  async function run(label: string, action: ClassroomAction) {
    setBusy(label);
    try {
      await onRunAction(action);
      if (action.type === "raise-hand") setNote("");
    } finally {
      setBusy("");
    }
  }

  if (role === "teacher") {
    const showHallPasses = CLIENT_TUNING.enableHallPass && hallpassSettings?.enabled;
    const totalTodayMinutes = todayCompletedPasses.reduce((sum, r) => sum + Math.round((r.durationSeconds ?? 0) / 60), 0);
    const limitReached = hallpassSettings !== undefined && hallpassSettings.maxConcurrent > 0 && currentlyOutPasses.length >= hallpassSettings.maxConcurrent;
    return (
      <>
        <HudCard title="Help Queue" badge={loading ? "…" : teacherQueue.length} ariaLabel="Help queue">
          {error ? <p className="small">{error}</p> : null}
          {teacherQueue.length === 0 ? <p className="small">No raised hands right now.</p> : null}
          <ul className="classroom-help-list" role="list">
            {teacherQueue.map((request) => (
              <li key={request.id} className="classroom-help-item" data-testid={`help-request-${request.id}`}>
                <div className="classroom-help-meta">
                  <span className="classroom-help-name">{request.displayName}</span>
                  <span className={`tag${request.status === "raised" ? " tag-help" : ""}`}>{statusLabel(request.status)}</span>
                </div>
                {request.note ? <p className="classroom-help-note">{request.note}</p> : null}
                <div className="classroom-help-actions">
                  <button
                    type="button"
                    className="hud-btn"
                    disabled={busy === request.id || request.status === "acknowledged"}
                    data-testid={`acknowledge-help-${request.id}`}
                    onClick={() => void run(request.id, { type: "acknowledge-help", requestId: request.id })}
                  >
                    Ack
                  </button>
                  <button
                    type="button"
                    className="hud-btn"
                    disabled={busy === request.id}
                    data-testid={`close-help-${request.id}`}
                    onClick={() => void run(request.id, { type: "close-help", requestId: request.id })}
                  >
                    Close
                  </button>
                  {manifest && onOpenBoardAccess ? (
                    <button
                      type="button"
                      className={`hud-btn${boardAccessUserId === request.userId ? " hud-btn--active" : ""}`}
                      data-testid={`board-access-help-${request.userId}`}
                      aria-pressed={boardAccessUserId === request.userId}
                      onClick={() => onOpenBoardAccess(request.userId)}
                    >
                      Board Access
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {CLIENT_TUNING.enableAvatarReactions ? (
            <div className="reaction-heat">
              <div className="reaction-heat-counts">
                {REACTION_SLUGS.map(({ slug, emoji }) => (
                  <span key={slug} className="reaction-heat-item">
                    <span>{emoji}</span>
                    <span>{reactionLog.filter((e) => e.reaction === slug).length}</span>
                  </span>
                ))}
                <span className="reaction-heat-window">last 60s</span>
              </div>
              <button
                type="button"
                className="hud-btn"
                disabled={busy === "reactions-lock"}
                onClick={() => void run("reactions-lock", { type: "set-reactions-locked", locked: !state?.reactionsLocked })}
              >
                {state?.reactionsLocked ? "Unmute reactions" : "Mute reactions"}
              </button>
            </div>
          ) : null}
        </HudCard>
        {showHallPasses ? (
          <HudCard
            title="Hall passes"
            badge={loading ? "…" : currentlyOutPasses.length + pendingHallpasses.length || undefined}
            ariaLabel="Hall passes"
            defaultCollapsed
          >
            {pendingHallpasses.length > 0 ? (
              <>
                <p className="small" style={{ fontWeight: 600, marginBottom: 2 }}>Pending</p>
                {limitReached ? (
                  <p className="small" style={{ color: "var(--hud-tx-m)" }}>Limit reached — {hallpassSettings?.maxConcurrent} already out</p>
                ) : null}
                <ul className="classroom-help-list" role="list">
                  {pendingHallpasses.map((request) => (
                    <li key={request.id} className="classroom-help-item">
                      <div className="classroom-help-meta">
                        <span className="classroom-help-name">{request.displayName}</span>
                      </div>
                      <div className="classroom-help-actions">
                        <button
                          type="button"
                          className="hud-btn"
                          disabled={busy === `hp-approve-${request.id}` || limitReached}
                          title={limitReached ? "Concurrent limit reached" : undefined}
                          onClick={() => void run(`hp-approve-${request.id}`, { type: "approve-hallpass", requestId: request.id })}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="hud-btn"
                          disabled={busy === `hp-deny-${request.id}`}
                          onClick={() => void run(`hp-deny-${request.id}`, { type: "deny-hallpass", requestId: request.id })}
                        >
                          Deny
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {currentlyOutPasses.length > 0 ? (
              <>
                <p className="small" style={{ fontWeight: 600, marginBottom: 2 }}>Currently out</p>
                <ul className="classroom-help-list" role="list">
                  {currentlyOutPasses.map((request) => (
                    <li key={request.id} className="classroom-help-item">
                      <div className="classroom-help-meta">
                        <span className="classroom-help-name">{request.displayName}</span>
                        {request.approvedAt ? <ElapsedTimer sinceIso={request.approvedAt} warnAfterSeconds={10 * 60} /> : null}
                      </div>
                      <div className="classroom-help-actions">
                        <button
                          type="button"
                          className="hud-btn"
                          disabled={busy === `hp-return-${request.id}`}
                          onClick={() => void run(`hp-return-${request.id}`, { type: "return-from-hallpass", requestId: request.id })}
                        >
                          Mark returned
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {pendingHallpasses.length === 0 && currentlyOutPasses.length === 0 ? (
              <p className="small">No active hall passes.</p>
            ) : null}
            {todayCompletedPasses.length > 0 ? (
              <p className="small" style={{ marginTop: 4, color: "var(--hud-tx-m)" }}>
                Today: {todayCompletedPasses.length} pass{todayCompletedPasses.length !== 1 ? "es" : ""} · {totalTodayMinutes} min total
              </p>
            ) : null}
          </HudCard>
        ) : null}
      </>
    );
  }

  return (
    <HudCard title="Help" badge={loading ? "…" : activeHelpRequest ? statusLabel(activeHelpRequest.status) : "Ready"} ariaLabel="Classroom tools">
      {error ? <p className="small">{error}</p> : null}
      {activeBoardGrant && manifest ? (
        <div className="classroom-grant-panel">
          <div className="classroom-grant-header">
            <span>Board access granted</span>
            <span>{manifest.wallAnchors.find((anchor) => anchor.id === activeBoardGrant.wallAnchorId)?.label ?? "Selected board"}</span>
          </div>
          <p className="classroom-help-note">You can share: {summarizeBoardGrantTypes(activeBoardGrant.allowedObjectTypes)}.</p>
          <p className="classroom-help-note">
            {activeBoardGrant.expiresAt
              ? `Access expires ${new Date(activeBoardGrant.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
              : "Access stays active until your teacher revokes it."}
          </p>
        </div>
      ) : null}
      <label className="classroom-note-field">
        <span className="classroom-note-label">Note for your teacher</span>
        <textarea
          className="classroom-note-input"
          rows={3}
          maxLength={500}
          placeholder="Need help with problem 3"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={Boolean(activeHelpRequest)}
        />
      </label>
      {activeHelpRequest?.note ? <p className="classroom-help-note">Current note: {activeHelpRequest.note}</p> : null}
      {activeHelpRequest ? (
        <div className="classroom-help-actions">
          <span className={`tag${activeHelpRequest.status === "raised" ? " tag-help" : ""}`}>{statusLabel(activeHelpRequest.status)}</span>
          <button
            type="button"
            className="hud-btn"
            disabled={busy === "cancel-help"}
            data-testid="cancel-help-button"
            onClick={() => void run("cancel-help", { type: "cancel-help", requestId: activeHelpRequest.id })}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="hud-btn"
          disabled={busy === "raise-hand"}
          data-testid="raise-hand-button"
          onClick={() =>
            void run("raise-hand", {
              type: "raise-hand",
              ...(note.trim() ? { note: note.trim() } : {})
            })
          }
        >
          Raise hand
        </button>
      )}
    </HudCard>
  );
}
