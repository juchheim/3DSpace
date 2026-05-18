"use client";

import { anchorAcceptsWallObjectType } from "@3dspace/room-engine";
import { useMemo, useState } from "react";
import type { ClassroomAction, ClassroomBoardAccessGrant, ClassroomHelpRequest, ClassroomState, Role, RoomManifest } from "@3dspace/contracts";

const GRANT_TYPE_OPTIONS: Array<{
  type: "image.file" | "video.file" | "audio.file" | "note" | "camera.live" | "microphone.live" | "browser-tab.live";
  label: string;
  description: string;
}> = [
  { type: "image.file", label: "Image upload", description: "Photos, screenshots, and scanned work." },
  { type: "video.file", label: "Video upload", description: "Recorded demos or short clips." },
  { type: "audio.file", label: "Audio upload", description: "Voice recordings or other audio files." },
  { type: "note", label: "Sticky note", description: "Quick typed response on the board." },
  { type: "camera.live", label: "Camera", description: "Live camera feed pinned to the board." },
  { type: "microphone.live", label: "Microphone", description: "Live audio share for speaking." },
  { type: "browser-tab.live", label: "Screen share", description: "Share a browser tab or screen live." }
];

const GRANT_PRESETS: Array<{
  id: "work" | "live" | "all";
  label: string;
  description: string;
  includes: Array<"image.file" | "video.file" | "audio.file" | "note" | "camera.live" | "microphone.live" | "browser-tab.live">;
}> = [
  {
    id: "work",
    label: "Work share",
    description: "Uploads plus a note.",
    includes: ["image.file", "video.file", "audio.file", "note"]
  },
  {
    id: "live",
    label: "Live share",
    description: "Camera, mic, and screen.",
    includes: ["camera.live", "microphone.live", "browser-tab.live"]
  },
  {
    id: "all",
    label: "Everything",
    description: "All supported options on this board.",
    includes: ["image.file", "video.file", "audio.file", "note", "camera.live", "microphone.live", "browser-tab.live"]
  }
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
  onRunAction
}: {
  role: Role;
  state: ClassroomState | null;
  loading: boolean;
  error: string;
  activeHelpRequest: ClassroomHelpRequest | null;
  manifest?: RoomManifest | null | undefined;
  currentUserId?: string | undefined;
  onRunAction(action: ClassroomAction): Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedAnchorsByRequestId, setSelectedAnchorsByRequestId] = useState<Record<string, string>>({});
  const [selectedGrantTypesByRequestId, setSelectedGrantTypesByRequestId] = useState<Record<string, string[]>>({});

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
    if (!anchor) return [];
    const next: Array<
      "image.file" | "video.file" | "audio.file" | "note" | "camera.live" | "microphone.live" | "browser-tab.live"
    > = [];
    if (anchorAcceptsWallObjectType(anchor, "image.file")) next.push("image.file");
    if (anchorAcceptsWallObjectType(anchor, "video.file")) next.push("video.file");
    if (anchorAcceptsWallObjectType(anchor, "audio.file")) next.push("audio.file");
    if (anchorAcceptsWallObjectType(anchor, "note")) next.push("note");
    if (anchorAcceptsWallObjectType(anchor, "camera.live")) next.push("camera.live");
    if (anchorAcceptsWallObjectType(anchor, "microphone.live")) next.push("microphone.live");
    if (anchorAcceptsWallObjectType(anchor, "browser-tab.live") || anchorAcceptsWallObjectType(anchor, "screen.live")) {
      next.push("browser-tab.live");
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
              const selectedGrantTypes = selectedGrantTypesByRequestId[request.id] ?? grantTypes;
              const selectedCount = selectedGrantTypes.filter((type) => grantTypes.includes(type as (typeof grantTypes)[number])).length;
              const busyId = `grant-${request.id}`;
              return (
                <li key={request.id} className="classroom-help-item" data-testid={`help-request-${request.id}`}>
                  <div className="classroom-help-meta">
                    <span className="classroom-help-name">{request.displayName}</span>
                    <span className={`tag${request.status === "raised" ? " tag-help" : ""}`}>{statusLabel(request.status)}</span>
                  </div>
                  {request.note ? <p className="classroom-help-note">{request.note}</p> : null}
                  {manifest?.wallAnchors.length ? (
                    <div className="classroom-grant-panel">
                      <div className="classroom-grant-header">
                        <span>Grant board access</span>
                        <span>{selectedCount} selected</span>
                      </div>
                      <select
                        className="anchor-select-compact"
                        value={selectedAnchorId}
                        aria-label={`Grant board for ${request.displayName}`}
                        onChange={(event) => {
                          const nextAnchorId = event.target.value;
                          const nextGrantTypes = allowedGrantTypes(nextAnchorId);
                          setSelectedAnchorsByRequestId((current) => ({
                            ...current,
                            [request.id]: nextAnchorId
                          }));
                          setSelectedGrantTypesByRequestId((current) => ({
                            ...current,
                            [request.id]: nextGrantTypes
                          }));
                        }}
                      >
                        {manifest.wallAnchors.map((anchor) => (
                          <option key={anchor.id} value={anchor.id}>
                            {anchor.label}
                          </option>
                        ))}
                      </select>
                      {grantTypes.length > 0 ? (
                        <>
                          <div className="classroom-grant-presets" role="group" aria-label={`Grant presets for ${request.displayName}`}>
                            {GRANT_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                className="classroom-preset-btn"
                                onClick={() =>
                                  setSelectedGrantTypesByRequestId((current) => ({
                                    ...current,
                                    [request.id]: grantTypes.filter((type) => preset.includes.includes(type as (typeof preset.includes)[number]))
                                  }))
                                }
                              >
                                <span className="classroom-preset-btn__label">{preset.label}</span>
                                <span className="classroom-preset-btn__description">{preset.description}</span>
                              </button>
                            ))}
                          </div>
                          <div className="classroom-grant-types" role="group" aria-label={`Allowed communication types for ${request.displayName}`}>
                            {GRANT_TYPE_OPTIONS.filter((option) => grantTypes.includes(option.type)).map((option) => {
                              const checked = selectedGrantTypes.includes(option.type);
                              return (
                                <label key={option.type} className={`classroom-grant-option${checked ? " classroom-grant-option--checked" : ""}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) =>
                                      setSelectedGrantTypesByRequestId((current) => {
                                        const previous = current[request.id] ?? grantTypes;
                                        const next = event.target.checked
                                          ? [...previous, option.type]
                                          : previous.filter((entry) => entry !== option.type);
                                        return {
                                          ...current,
                                          [request.id]: [...new Set(next)]
                                        };
                                      })
                                    }
                                  />
                                  <span className="classroom-grant-option__body">
                                    <span className="classroom-grant-option__label">{option.label}</span>
                                    <span className="classroom-grant-option__description">{option.description}</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="hud-btn"
                        disabled={busy === busyId || !selectedAnchorId || selectedGrantTypes.length === 0}
                        data-testid={`grant-board-${request.id}`}
                        onClick={async () => {
                          if (!selectedAnchorId || selectedGrantTypes.length === 0) return;
                          if (request.status === "raised") {
                            await run(request.id, { type: "acknowledge-help", requestId: request.id });
                          }
                          await run(busyId, {
                            type: "grant-board-access",
                            userId: request.userId,
                            wallAnchorId: selectedAnchorId,
                            requestId: request.id,
                            allowedObjectTypes: selectedGrantTypes as Array<
                              "image.file" | "video.file" | "audio.file" | "note" | "camera.live" | "microphone.live" | "browser-tab.live"
                            >
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
