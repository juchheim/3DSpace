"use client";

import { useMemo, useState } from "react";
import type {
  AvatarReactionSlug,
  ClassroomAction,
  ClassroomBoardAccessGrant,
  ClassroomHelpRequest,
  ClassroomState,
  Role,
  RoomManifest
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
  onOpenBoardAccess?(userId: string): void;
  onRunAction(action: ClassroomAction): Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const teacherQueue = useMemo(
    () => (state?.helpRequests ?? []).filter((r) => r.status === "raised" || r.status === "acknowledged"),
    [state?.helpRequests]
  );
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
    return (
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
