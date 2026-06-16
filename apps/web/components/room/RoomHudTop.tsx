import type { ReactNode } from "react";
import { FpsMonitor } from "./FpsMonitor";

type RoomHudTopProps = {
  leaving: boolean;
  roomName: string;
  roomRoleLabel: string;
  status: string;
  meetingNotesActive: boolean;
  liveCaptionsEnabled: boolean;
  liveCaptionsContributorCount: number;
  translationEnabled: boolean;
  translationSharing: boolean;
  showInviteControl: boolean;
  inviteControl?: ReactNode;
  podsVisible: boolean;
  role: "teacher" | "student";
  studentPositionedGroup:
    | {
        color?: string | null | undefined;
      }
    | null;
  classroomLoading: boolean;
  onDisablePods(): void;
  viewMode: "2d" | "3d";
  manifestReady: boolean;
  canUse2D: boolean;
  onViewModeChange(mode: "2d" | "3d"): void;
  onLeave(): void;
};

export function RoomHudTop({
  leaving,
  roomName,
  roomRoleLabel,
  status,
  meetingNotesActive,
  liveCaptionsEnabled,
  liveCaptionsContributorCount,
  translationEnabled,
  translationSharing,
  showInviteControl,
  inviteControl,
  podsVisible,
  role,
  studentPositionedGroup,
  classroomLoading,
  onDisablePods,
  viewMode,
  manifestReady,
  canUse2D,
  onViewModeChange,
  onLeave
}: RoomHudTopProps) {
  return (
    <header className="room-hud-top">
      <button type="button" className="room-exit-btn" disabled={leaving} onClick={onLeave}>
        {leaving ? "Leaving..." : "← Lobby"}
      </button>
      <div className="room-hud-top-sep" />
      <span className="room-hud-name">{roomName}</span>
      <span className="room-hud-meta">{roomRoleLabel} · {status}</span>
      {meetingNotesActive ? (
        <span className="room-hud-rec-badge" data-testid="meeting-notes-rec-badge">
          REC
        </span>
      ) : null}
      {liveCaptionsEnabled && liveCaptionsContributorCount > 0 ? (
        <span className="room-hud-cc-badge" data-testid="live-captions-cc-badge">
          CC
        </span>
      ) : null}
      {translationEnabled && translationSharing ? (
        <span className="room-hud-tr-badge" data-testid="translation-sharing-badge">
          TR
        </span>
      ) : null}
      {showInviteControl ? (
        <>
          <div className="room-hud-top-sep" />
          {inviteControl}
        </>
      ) : null}
      {podsVisible ? (
        <>
          <div className="room-hud-top-sep" />
          <div className="hud-pill--pods" data-testid="pods-indicator">
            {role === "student" && studentPositionedGroup ? (
              <>
                <span
                  className="group-dot"
                  style={{ background: studentPositionedGroup.color ?? "#4678b4" }}
                />
                <span>Pods on</span>
              </>
            ) : role === "student" ? (
              <span>Pods on · unassigned</span>
            ) : (
              <>
                <span>Pods on</span>
                <button
                  type="button"
                  className="hud-pill--pods__off"
                  disabled={classroomLoading}
                  onClick={onDisablePods}
                >
                  off
                </button>
              </>
            )}
          </div>
        </>
      ) : null}
      <div className="room-hud-top-fill" />
      <FpsMonitor />
      <div className="room-hud-top-sep" />
      <div className="toggle" aria-label="View mode">
        <button
          aria-pressed={viewMode === "3d"}
          onClick={() => onViewModeChange("3d")}
          disabled={!manifestReady}
        >
          3D
        </button>
        <button
          aria-pressed={viewMode === "2d"}
          onClick={() => onViewModeChange("2d")}
          disabled={!canUse2D}
        >
          2D
        </button>
      </div>
    </header>
  );
}
