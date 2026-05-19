"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassroomAction, ClassroomBoardAccessGrant, ClassroomHelpRequest, ClassroomState, Role, RoomManifest } from "@3dspace/contracts";
import type { ParticipantView } from "./RoomClient";
import {
  allowedBoardGrantTypesForAnchor,
  BOARD_GRANT_PRESETS,
  BOARD_GRANT_TYPE_OPTIONS,
  isBoardGrantActive,
  isSupportedBoardGrantType,
  summarizeBoardGrantTypes,
  type SupportedBoardGrantType
} from "../lib/classroomGrants";

function statusLabel(status: ClassroomHelpRequest["status"]) {
  if (status === "raised") return "Raised";
  if (status === "acknowledged") return "Acknowledged";
  if (status === "closed") return "Closed";
  return "Cancelled";
}

function activeHelpRequestMap(state?: ClassroomState | null | undefined) {
  return new Map(
    (state?.helpRequests ?? [])
      .filter((request) => request.status === "raised" || request.status === "acknowledged")
      .map((request) => [request.userId, request] as const)
  );
}

function activeGrantMap(state?: ClassroomState | null | undefined) {
  const now = Date.now();
  const next = new Map<string, ClassroomBoardAccessGrant[]>();
  for (const grant of state?.boardAccessGrants ?? []) {
    if (!isBoardGrantActive(grant, now)) continue;
    next.set(grant.userId, [...(next.get(grant.userId) ?? []), grant]);
  }
  return next;
}

function sortParticipants(
  participants: ParticipantView[],
  role: Role,
  activeHelpRequests: Map<string, ClassroomHelpRequest>,
  activeGrants: Map<string, ClassroomBoardAccessGrant[]>
) {
  return [...participants].sort((left, right) => {
    if (role === "teacher") {
      const leftHelp = activeHelpRequests.has(left.id);
      const rightHelp = activeHelpRequests.has(right.id);
      if (leftHelp !== rightHelp) return leftHelp ? -1 : 1;

      const leftGrant = activeGrants.has(left.id);
      const rightGrant = activeGrants.has(right.id);
      if (leftGrant !== rightGrant) return leftGrant ? -1 : 1;

      const leftTeacher = left.role === "teacher";
      const rightTeacher = right.role === "teacher";
      if (leftTeacher !== rightTeacher) return leftTeacher ? 1 : -1;
    } else if (left.local !== right.local) {
      return left.local ? -1 : 1;
    }

    return left.displayName.localeCompare(right.displayName);
  });
}

export function Roster({
  participants,
  classroomState,
  role,
  manifest,
  error,
  onRunAction
}: {
  participants: ParticipantView[];
  classroomState?: ClassroomState | null | undefined;
  role: Role;
  manifest?: RoomManifest | null | undefined;
  error?: string | undefined;
  onRunAction?(action: ClassroomAction): Promise<void>;
}) {
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedAnchorsByUserId, setSelectedAnchorsByUserId] = useState<Record<string, string>>({});
  const [selectedGrantTypesByUserId, setSelectedGrantTypesByUserId] = useState<Record<string, SupportedBoardGrantType[]>>({});

  const helpRequestsByUserId = useMemo(() => activeHelpRequestMap(classroomState), [classroomState]);
  const activeGrantsByUserId = useMemo(() => activeGrantMap(classroomState), [classroomState]);
  const sortedParticipants = useMemo(
    () => sortParticipants(participants, role, helpRequestsByUserId, activeGrantsByUserId),
    [activeGrantsByUserId, helpRequestsByUserId, participants, role]
  );
  const selectableParticipants = useMemo(
    () => sortedParticipants.filter((participant) => participant.role === "student"),
    [sortedParticipants]
  );

  useEffect(() => {
    if (role !== "teacher") return;
    if (selectableParticipants.length === 0) {
      setSelectedParticipantId("");
      return;
    }
    if (selectedParticipantId && selectableParticipants.some((participant) => participant.id === selectedParticipantId)) return;
    const nextSelectedId =
      selectableParticipants.find((participant) => helpRequestsByUserId.has(participant.id))?.id ??
      selectableParticipants.find((participant) => activeGrantsByUserId.has(participant.id))?.id ??
      selectableParticipants[0]?.id ??
      "";
    setSelectedParticipantId(nextSelectedId);
  }, [activeGrantsByUserId, helpRequestsByUserId, role, selectableParticipants, selectedParticipantId]);

  const selectedParticipant = useMemo(
    () => selectableParticipants.find((participant) => participant.id === selectedParticipantId) ?? null,
    [selectableParticipants, selectedParticipantId]
  );
  const selectedHelpRequest = selectedParticipant ? (helpRequestsByUserId.get(selectedParticipant.id) ?? null) : null;
  const selectedActiveGrants = selectedParticipant ? (activeGrantsByUserId.get(selectedParticipant.id) ?? []) : [];
  const selectedAnchorId =
    selectedParticipantId
      ? (selectedAnchorsByUserId[selectedParticipantId] ?? selectedActiveGrants[0]?.wallAnchorId ?? manifest?.wallAnchors[0]?.id ?? "")
      : "";
  const grantTypesForAnchor = useMemo(
    () => (selectedAnchorId ? allowedBoardGrantTypesForAnchor(manifest, selectedAnchorId) : []),
    [manifest, selectedAnchorId]
  );
  const selectedGrantTypes = useMemo(() => {
    if (!selectedParticipantId) return [];
    const storedGrantTypes = selectedGrantTypesByUserId[selectedParticipantId];
    if (storedGrantTypes) return storedGrantTypes.filter((type) => grantTypesForAnchor.includes(type));

    const activeGrantTypes = (selectedActiveGrants[0]?.allowedObjectTypes ?? []).filter(isSupportedBoardGrantType);
    const matchingActiveGrantTypes = activeGrantTypes.filter((type) => grantTypesForAnchor.includes(type));
    return matchingActiveGrantTypes.length > 0 ? matchingActiveGrantTypes : grantTypesForAnchor;
  }, [grantTypesForAnchor, selectedActiveGrants, selectedGrantTypesByUserId, selectedParticipantId]);

  function selectParticipant(participantId: string) {
    setSelectedParticipantId(participantId);
    if (!manifest) return;
    setSelectedAnchorsByUserId((current) => {
      if (current[participantId]) return current;
      const nextActiveGrant = activeGrantsByUserId.get(participantId)?.[0];
      return {
        ...current,
        [participantId]: nextActiveGrant?.wallAnchorId ?? manifest.wallAnchors[0]?.id ?? ""
      };
    });
    setSelectedGrantTypesByUserId((current) => {
      if (current[participantId]) return current;
      const nextActiveGrant = activeGrantsByUserId.get(participantId)?.[0];
      const nextAnchorId = nextActiveGrant?.wallAnchorId ?? manifest.wallAnchors[0]?.id ?? "";
      const allowedTypes = allowedBoardGrantTypesForAnchor(manifest, nextAnchorId);
      const seededGrantTypes =
        nextActiveGrant?.allowedObjectTypes.filter(isSupportedBoardGrantType).filter((type) => allowedTypes.includes(type)) ?? [];
      return {
        ...current,
        [participantId]: seededGrantTypes.length > 0 ? seededGrantTypes : allowedTypes
      };
    });
  }

  async function run(label: string, action: ClassroomAction) {
    if (!onRunAction) return;
    setBusy(label);
    try {
      await onRunAction(action);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="hud-card" aria-label="Participants">
      <div className="hud-heading">
        <span>People</span>
        <span>{sortedParticipants.length}</span>
      </div>
      <ul className="roster-compact" role="list">
        {sortedParticipants.map((p) => {
          const camOn = p.state.media?.cameraEnabled;
          const micOn = p.state.media?.microphoneEnabled;
          const speaking = p.state.media?.speaking;
          const hasHelpRequest = helpRequestsByUserId.has(p.id);
          const hasActiveGrant = activeGrantsByUserId.has(p.id);
          const selectable = role === "teacher" && p.role === "student";
          const selected = selectable && p.id === selectedParticipantId;
          const content = (
            <>
              <span
                className="avatar-dot"
                style={{ background: p.local ? "#eb5e28" : "#2f6b4f" }}
                aria-hidden="true"
              >
                {p.displayName.slice(0, 2).toUpperCase()}
              </span>
              <span className="roster-compact-name" title={p.displayName}>
                {p.displayName}
              </span>
              <span className="roster-compact-tags" aria-label={`${camOn ? "camera on" : "camera off"}, ${micOn ? "mic on" : "mic off"}`}>
                {hasHelpRequest ? <span className="tag tag-help">help</span> : null}
                {hasActiveGrant ? <span className="tag tag-board">board</span> : null}
                {camOn ? <span className="tag active">cam</span> : null}
                {micOn ? <span className={`tag${speaking ? " active" : ""}`}>mic</span> : null}
                {p.role === "teacher" ? <span className="tag">T</span> : null}
              </span>
            </>
          );
          return (
            <li
              key={p.id}
              className={`roster-compact-item${selected ? " roster-compact-item--selected" : ""}`}
              data-testid={`participant-${p.id}`}
            >
              {selectable ? (
                <button
                  type="button"
                  className={`roster-compact-button${selected ? " roster-compact-button--selected" : ""}`}
                  aria-pressed={selected}
                  aria-expanded={selected}
                  onClick={() => selectParticipant(p.id)}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
      {role === "teacher" && selectedParticipant && manifest && onRunAction ? (
        <div className="roster-detail-card">
          <div className="classroom-grant-header">
            <span>Board access</span>
            <span>{selectedParticipant.displayName}</span>
          </div>
          {selectedHelpRequest ? (
            <div className="classroom-grant-row">
              <div className="classroom-help-meta">
                <span className="classroom-help-name">{statusLabel(selectedHelpRequest.status)}</span>
                <span className={`tag${selectedHelpRequest.status === "raised" ? " tag-help" : ""}`}>hand</span>
              </div>
              {selectedHelpRequest.note ? <p className="classroom-help-note">{selectedHelpRequest.note}</p> : null}
              <div className="classroom-help-actions">
                <button
                  type="button"
                  className="hud-btn"
                  disabled={busy === selectedHelpRequest.id || selectedHelpRequest.status === "acknowledged"}
                  data-testid={`acknowledge-help-${selectedHelpRequest.id}`}
                  onClick={() => void run(selectedHelpRequest.id, { type: "acknowledge-help", requestId: selectedHelpRequest.id })}
                >
                  Ack
                </button>
                <button
                  type="button"
                  className="hud-btn"
                  disabled={busy === selectedHelpRequest.id}
                  data-testid={`close-help-${selectedHelpRequest.id}`}
                  onClick={() => void run(selectedHelpRequest.id, { type: "close-help", requestId: selectedHelpRequest.id })}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <p className="small">Select a board and share types to invite this student to present work.</p>
          )}

          {selectedActiveGrants.length > 0 ? (
            <div className="classroom-grant-presets">
              {selectedActiveGrants.map((grant) => (
                <div key={grant.id} className="classroom-active-grant">
                  <div className="classroom-help-meta">
                    <span className="classroom-help-name">
                      {manifest.wallAnchors.find((anchor) => anchor.id === grant.wallAnchorId)?.label ?? "Selected board"}
                    </span>
                    <span className="tag tag-board">active</span>
                  </div>
                  <p className="classroom-help-note">{summarizeBoardGrantTypes(grant.allowedObjectTypes)}</p>
                  <button
                    type="button"
                    className="hud-btn"
                    disabled={busy === `revoke-${grant.id}`}
                    data-testid={`revoke-board-${grant.id}`}
                    onClick={() => void run(`revoke-${grant.id}`, { type: "revoke-board-access", grantId: grant.id })}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {manifest.wallAnchors.length > 0 ? (
            <div className="classroom-grant-panel">
              <div className="classroom-grant-header">
                <span>{selectedActiveGrants.length > 0 ? "Replace board access" : "Grant board access"}</span>
                <span>{selectedGrantTypes.length} selected</span>
              </div>
              <select
                className="anchor-select-compact"
                value={selectedAnchorId}
                aria-label={`Grant board for ${selectedParticipant.displayName}`}
                onChange={(event) => {
                  const nextAnchorId = event.target.value;
                  const nextGrantTypes = allowedBoardGrantTypesForAnchor(manifest, nextAnchorId);
                  setSelectedAnchorsByUserId((current) => ({
                    ...current,
                    [selectedParticipant.id]: nextAnchorId
                  }));
                  setSelectedGrantTypesByUserId((current) => ({
                    ...current,
                    [selectedParticipant.id]: nextGrantTypes
                  }));
                }}
              >
                {manifest.wallAnchors.map((anchor) => (
                  <option key={anchor.id} value={anchor.id}>
                    {anchor.label}
                  </option>
                ))}
              </select>
              {grantTypesForAnchor.length > 0 ? (
                <>
                  <div className="classroom-grant-presets" role="group" aria-label={`Grant presets for ${selectedParticipant.displayName}`}>
                    {BOARD_GRANT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="classroom-preset-btn"
                        onClick={() =>
                          setSelectedGrantTypesByUserId((current) => ({
                            ...current,
                            [selectedParticipant.id]: grantTypesForAnchor.filter((type) => preset.includes.includes(type))
                          }))
                        }
                      >
                        <span className="classroom-preset-btn__label">{preset.label}</span>
                        <span className="classroom-preset-btn__description">{preset.description}</span>
                      </button>
                    ))}
                  </div>
                  <div className="classroom-grant-types" role="group" aria-label={`Allowed share types for ${selectedParticipant.displayName}`}>
                    {BOARD_GRANT_TYPE_OPTIONS.filter((option) => grantTypesForAnchor.includes(option.type)).map((option) => {
                      const checked = selectedGrantTypes.includes(option.type);
                      return (
                        <label key={option.type} className={`classroom-grant-option${checked ? " classroom-grant-option--checked" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setSelectedGrantTypesByUserId((current) => {
                                const previous = current[selectedParticipant.id] ?? grantTypesForAnchor;
                                const next = event.target.checked
                                  ? [...previous, option.type]
                                  : previous.filter((entry) => entry !== option.type);
                                return {
                                  ...current,
                                  [selectedParticipant.id]: [...new Set(next)]
                                };
                              })
                            }
                          />
                          <span className="classroom-grant-option__body">
                            <span className="classroom-grant-option__label">{option.label}</span>
                            {option.description ? <span className="classroom-grant-option__description">{option.description}</span> : null}
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
                disabled={busy === `grant-${selectedParticipant.id}` || !selectedAnchorId || selectedGrantTypes.length === 0}
                data-testid={`grant-board-${selectedParticipant.id}`}
                onClick={async () => {
                  if (!selectedAnchorId || selectedGrantTypes.length === 0) return;
                  if (selectedHelpRequest?.status === "raised") {
                    await run(selectedHelpRequest.id, { type: "acknowledge-help", requestId: selectedHelpRequest.id });
                  }
                  await run(`grant-${selectedParticipant.id}`, {
                    type: "grant-board-access",
                    userId: selectedParticipant.id,
                    wallAnchorId: selectedAnchorId,
                    requestId: selectedHelpRequest?.id,
                    allowedObjectTypes: selectedGrantTypes
                  });
                }}
              >
                {selectedActiveGrants.length > 0 ? "Update grant" : "Grant board"}
              </button>
            </div>
          ) : (
            <p className="small">This room does not have any wall boards to grant.</p>
          )}
          {selectedAnchorId && grantTypesForAnchor.length === 0 ? <p className="small">That board has no student-share actions enabled.</p> : null}
          {error ? <p className="small">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
