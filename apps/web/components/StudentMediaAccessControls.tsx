"use client";

import { useState } from "react";
import type { ClassroomAction, ClassroomState } from "@3dspace/contracts";

type StudentMediaRuntime = NonNullable<ClassroomState["studentMediaRuntime"]>;

export function StudentMediaAccessControls({
  userId,
  displayName,
  studentMediaRuntime,
  onRunAction
}: {
  userId: string;
  displayName: string;
  studentMediaRuntime: StudentMediaRuntime | null | undefined;
  onRunAction(action: ClassroomAction): Promise<void>;
}) {
  const [busy, setBusy] = useState("");

  const {
    camerasEnabled = true,
    microphonesEnabled = true,
    cameraEnabledUserIds = [],
    microphoneEnabledUserIds = []
  } = studentMediaRuntime ?? {};
  const studentCameraEnabled = cameraEnabledUserIds.includes(userId);
  const studentMicEnabled = microphoneEnabledUserIds.includes(userId);
  const perStudentVisible = !camerasEnabled || !microphonesEnabled;

  async function run(label: string, action: ClassroomAction) {
    setBusy(label);
    try {
      await onRunAction(action);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="classroom-grant-panel">
        <div className="classroom-grant-header">
          <span>Student media</span>
        </div>
        <div className="classroom-help-meta">
          <span className="classroom-help-name">All cameras</span>
          <div className="classroom-help-actions">
            <span className={`tag${camerasEnabled ? " active" : ""}`}>{camerasEnabled ? "on" : "off"}</span>
            <button
              type="button"
              className="hud-btn"
              disabled={busy === "global-camera"}
              data-testid="media-global-camera"
              onClick={() => void run("global-camera", { type: "set-student-media-global", medium: "camera", enabled: !camerasEnabled })}
            >
              {camerasEnabled ? "Mute all" : "Allow all"}
            </button>
          </div>
        </div>
        <div className="classroom-help-meta">
          <span className="classroom-help-name">All mics</span>
          <div className="classroom-help-actions">
            <span className={`tag${microphonesEnabled ? " active" : ""}`}>{microphonesEnabled ? "on" : "off"}</span>
            <button
              type="button"
              className="hud-btn"
              disabled={busy === "global-mic"}
              data-testid="media-global-mic"
              onClick={() => void run("global-mic", { type: "set-student-media-global", medium: "microphone", enabled: !microphonesEnabled })}
            >
              {microphonesEnabled ? "Mute all" : "Allow all"}
            </button>
          </div>
        </div>
      </div>
      {perStudentVisible ? (
        <div className="classroom-grant-panel">
          <div className="classroom-grant-header">
            <span>For {displayName}</span>
          </div>
          {!camerasEnabled ? (
            <div className="classroom-help-meta">
              <span className="classroom-help-name">Camera</span>
              <div className="classroom-help-actions">
                <span className={`tag${studentCameraEnabled ? " active" : ""}`}>{studentCameraEnabled ? "on" : "off"}</span>
                <button
                  type="button"
                  className="hud-btn"
                  disabled={busy === `student-camera-${userId}`}
                  data-testid={`media-student-camera-${userId}`}
                  onClick={() => void run(`student-camera-${userId}`, { type: "set-student-media-access", userId, medium: "camera", enabled: !studentCameraEnabled })}
                >
                  {studentCameraEnabled ? "Revoke" : "Allow"}
                </button>
              </div>
            </div>
          ) : null}
          {!microphonesEnabled ? (
            <div className="classroom-help-meta">
              <span className="classroom-help-name">Mic</span>
              <div className="classroom-help-actions">
                <span className={`tag${studentMicEnabled ? " active" : ""}`}>{studentMicEnabled ? "on" : "off"}</span>
                <button
                  type="button"
                  className="hud-btn"
                  disabled={busy === `student-mic-${userId}`}
                  data-testid={`media-student-mic-${userId}`}
                  onClick={() => void run(`student-mic-${userId}`, { type: "set-student-media-access", userId, medium: "microphone", enabled: !studentMicEnabled })}
                >
                  {studentMicEnabled ? "Revoke" : "Allow"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
