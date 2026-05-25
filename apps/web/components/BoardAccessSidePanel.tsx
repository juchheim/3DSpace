"use client";

import { useState } from "react";
import type { ClassroomAction, ClassroomBoardAccessGrant, ClassroomHelpRequest, ClassroomState, RoomManifest } from "@3dspace/contracts";
import { CLIENT_TUNING } from "../lib/config";
import { BoardAccessGrantControls } from "./BoardAccessGrantControls";
import { StudentMediaAccessControls } from "./StudentMediaAccessControls";

function statusLabel(status: ClassroomHelpRequest["status"]) {
  if (status === "raised") return "Raised";
  if (status === "acknowledged") return "Acknowledged";
  if (status === "closed") return "Closed";
  return "Cancelled";
}

export type BoardAccessPanelDock = "right-hud" | "left-people";

export function BoardAccessSidePanel({
  displayName,
  userId,
  helpRequest,
  activeGrants,
  manifest,
  studentMediaRuntime,
  error,
  showHelpActions = false,
  dock = "right-hud",
  onRunAction,
  onClose
}: {
  displayName: string;
  userId: string;
  helpRequest?: ClassroomHelpRequest | null | undefined;
  activeGrants: ClassroomBoardAccessGrant[];
  manifest: RoomManifest;
  studentMediaRuntime?: ClassroomState["studentMediaRuntime"];
  error?: string | undefined;
  showHelpActions?: boolean | undefined;
  dock?: BoardAccessPanelDock | undefined;
  onRunAction(action: ClassroomAction): Promise<void>;
  onClose(): void;
}) {
  const [busy, setBusy] = useState("");

  async function run(label: string, action: ClassroomAction) {
    setBusy(label);
    try {
      await onRunAction(action);
    } finally {
      setBusy("");
    }
  }

  return (
    <div
      className={`hud-panel student-detail-panel${dock === "left-people" ? " student-detail-panel--left-people" : ""}`}
      aria-label={`Board access for ${displayName}`}
    >
      <div className="student-detail-header">
        <div className="classroom-grant-header" style={{ flex: 1 }}>
          <span>Grant board access</span>
          <span>{displayName}</span>
        </div>
        <button type="button" className="student-detail-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {showHelpActions && helpRequest ? (
        <div className="classroom-grant-row">
          <div className="classroom-help-meta">
            <span className="classroom-help-name">{statusLabel(helpRequest.status)}</span>
            <span className={`tag${helpRequest.status === "raised" ? " tag-help" : ""}`}>hand</span>
          </div>
          {helpRequest.note ? <p className="classroom-help-note">{helpRequest.note}</p> : null}
          <div className="classroom-help-actions">
            <button
              type="button"
              className="hud-btn"
              disabled={busy === helpRequest.id || helpRequest.status === "acknowledged"}
              data-testid={`acknowledge-help-${helpRequest.id}`}
              onClick={() => void run(helpRequest.id, { type: "acknowledge-help", requestId: helpRequest.id })}
            >
              Ack
            </button>
            <button
              type="button"
              className="hud-btn"
              disabled={busy === helpRequest.id}
              data-testid={`close-help-${helpRequest.id}`}
              onClick={() => void run(helpRequest.id, { type: "close-help", requestId: helpRequest.id })}
            >
              Close
            </button>
          </div>
        </div>
      ) : helpRequest?.note ? (
        <p className="classroom-help-note">{helpRequest.note}</p>
      ) : !helpRequest ? (
        <p className="small">Select a board and share types to invite this student to present work.</p>
      ) : null}

      {CLIENT_TUNING.enableStudentMediaPermissions ? (
        <StudentMediaAccessControls
          userId={userId}
          displayName={displayName}
          studentMediaRuntime={studentMediaRuntime}
          onRunAction={onRunAction}
        />
      ) : null}
      <BoardAccessGrantControls
        userId={userId}
        displayName={displayName}
        helpRequest={helpRequest}
        activeGrants={activeGrants}
        manifest={manifest}
        onRunAction={onRunAction}
      />
      {error ? <p className="small">{error}</p> : null}
    </div>
  );
}
