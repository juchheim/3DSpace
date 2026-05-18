"use client";

import { useMemo, useState } from "react";
import type { ClassroomAction, ClassroomHelpRequest, ClassroomState, Role } from "@3dspace/contracts";

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
  onRunAction
}: {
  role: Role;
  state: ClassroomState | null;
  loading: boolean;
  error: string;
  activeHelpRequest: ClassroomHelpRequest | null;
  onRunAction(action: ClassroomAction): Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const teacherQueue = useMemo(
    () =>
      (state?.helpRequests ?? []).filter((request) => request.status === "raised" || request.status === "acknowledged"),
    [state?.helpRequests]
  );

  async function run(label: string, action: ClassroomAction) {
    setBusy(label);
    try {
      await onRunAction(action);
      if (action.type === "raise-hand") setNote("");
    } catch {
      return;
    } finally {
      setBusy("");
    }
  }

  if (role === "teacher") {
    return (
      <div className="hud-card" aria-label="Classroom help queue">
        <div className="hud-heading">
          <span>Help Queue</span>
          <span>{loading ? "…" : teacherQueue.length}</span>
        </div>
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
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="hud-card" aria-label="Classroom help">
      <div className="hud-heading">
        <span>Help</span>
        <span>{loading ? "…" : activeHelpRequest ? statusLabel(activeHelpRequest.status) : "Ready"}</span>
      </div>
      {error ? <p className="small">{error}</p> : null}
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
    </div>
  );
}
