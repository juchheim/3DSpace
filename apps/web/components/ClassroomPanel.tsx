"use client";

import { anchorAcceptsWallObjectType } from "@3dspace/room-engine";
import { useMemo, useState } from "react";
import type { ClassroomAction, ClassroomBoardAccessGrant, ClassroomHelpRequest, ClassroomState, Role, RoomManifest, RoomSettings } from "@3dspace/contracts";

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
  roomSettings,
  currentUserId,
  onRunAction
}: {
  role: Role;
  state: ClassroomState | null;
  loading: boolean;
  error: string;
  activeHelpRequest: ClassroomHelpRequest | null;
  manifest?: RoomManifest | null | undefined;
  roomSettings?: RoomSettings | null | undefined;
  currentUserId?: string | undefined;
  onRunAction(action: ClassroomAction): Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedAnchorsByRequestId, setSelectedAnchorsByRequestId] = useState<Record<string, string>>({});

  const teacherQueue = useMemo(
    () =>
      (state?.helpRequests ?? []).filter((request) => request.status === "raised" || request.status === "acknowledged"),
    [state?.helpRequests]
  );
  const activeBoardGrant = useMemo<ClassroomBoardAccessGrant | null>(
    () =>
      (state?.boardAccessGrants ?? []).find(
        (grant) =>
          (!currentUserId || grant.userId === currentUserId) &&
          grant.status === "active" &&
          (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now())
      ) ?? null,
    [currentUserId, state?.boardAccessGrants]
  );

  function allowedGrantTypes(anchorId: string) {
    const anchor = manifest?.wallAnchors.find((candidate) => candidate.id === anchorId);
    if (!anchor || !roomSettings) return [];
    const next: Array<
      "image.file" | "video.file" | "audio.file" | "note" | "camera.live" | "microphone.live" | "browser-tab.live"
    > = [];
    if (roomSettings.allowStudentUploads) {
      if (anchorAcceptsWallObjectType(anchor, "image.file")) next.push("image.file");
      if (anchorAcceptsWallObjectType(anchor, "video.file")) next.push("video.file");
      if (anchorAcceptsWallObjectType(anchor, "audio.file")) next.push("audio.file");
    }
    if (anchorAcceptsWallObjectType(anchor, "note")) next.push("note");
    if (roomSettings.allowLiveStudentShares) {
      if (anchorAcceptsWallObjectType(anchor, "camera.live")) next.push("camera.live");
      if (anchorAcceptsWallObjectType(anchor, "microphone.live")) next.push("microphone.live");
      if (anchorAcceptsWallObjectType(anchor, "browser-tab.live") || anchorAcceptsWallObjectType(anchor, "screen.live")) {
        next.push("browser-tab.live");
      }
    }
    return next;
  }

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
            (() => {
              const selectedAnchorId = selectedAnchorsByRequestId[request.id] ?? manifest?.wallAnchors[0]?.id ?? "";
              const grantTypes = selectedAnchorId ? allowedGrantTypes(selectedAnchorId) : [];
              const busyId = `grant-${request.id}`;
              return (
                <li key={request.id} className="classroom-help-item" data-testid={`help-request-${request.id}`}>
                  <div className="classroom-help-meta">
                    <span className="classroom-help-name">{request.displayName}</span>
                    <span className={`tag${request.status === "raised" ? " tag-help" : ""}`}>{statusLabel(request.status)}</span>
                  </div>
                  {request.note ? <p className="classroom-help-note">{request.note}</p> : null}
                  {manifest?.wallAnchors.length ? (
                    <div className="classroom-grant-row">
                      <select
                        className="anchor-select-compact"
                        value={selectedAnchorId}
                        aria-label={`Grant board for ${request.displayName}`}
                        onChange={(event) =>
                          setSelectedAnchorsByRequestId((current) => ({
                            ...current,
                            [request.id]: event.target.value
                          }))
                        }
                      >
                        {manifest.wallAnchors.map((anchor) => (
                          <option key={anchor.id} value={anchor.id}>
                            {anchor.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="hud-btn"
                        disabled={busy === busyId || !selectedAnchorId || grantTypes.length === 0}
                        data-testid={`grant-board-${request.id}`}
                        onClick={async () => {
                          if (!selectedAnchorId || grantTypes.length === 0) return;
                          if (request.status === "raised") {
                            await run(request.id, { type: "acknowledge-help", requestId: request.id });
                          }
                          await run(busyId, {
                            type: "grant-board-access",
                            userId: request.userId,
                            wallAnchorId: selectedAnchorId,
                            requestId: request.id,
                            allowedObjectTypes: grantTypes
                          });
                        }}
                      >
                        Grant board
                      </button>
                    </div>
                  ) : null}
                  {selectedAnchorId && grantTypes.length === 0 ? <p className="small">That board has no student-share actions enabled.</p> : null}
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
              );
            })()
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
      {activeBoardGrant && manifest ? (
        <p className="classroom-help-note">
          Board access granted: {manifest.wallAnchors.find((anchor) => anchor.id === activeBoardGrant.wallAnchorId)?.label ?? "Selected board"}
        </p>
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
    </div>
  );
}
