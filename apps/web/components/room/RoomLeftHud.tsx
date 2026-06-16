import type { ComponentProps } from "react";
import type { AvatarReactionSlug } from "@3dspace/contracts";
import { MediaControls } from "../MediaControls";
import { MovementPad } from "../MovementPad";

type StudentGroupSummary = {
  color?: string | null;
  label: string;
  memberCount: number;
};

type HallpassStatus =
  | {
      mode: "active";
      elapsedLabel: string;
      busy: boolean;
    }
  | {
      mode: "limit";
    }
  | {
      mode: "request";
      pending: boolean;
      busy: boolean;
    };

type RoomLeftHudProps = {
  showPlayModeToggle: boolean;
  playModeBusy: boolean;
  playModeEnabled: boolean;
  onTogglePlayMode(): void;
  showSpotlightIndicator: boolean;
  spotlightAnchorLabel: string;
  spotlightModeLabel: string;
  showStudentClassroomState: boolean;
  studentGroup: StudentGroupSummary | null;
  handRaised: boolean;
  hostSingular: string;
  hallpassStatus: HallpassStatus | null;
  onRequestHallpass(): void;
  onReturnFromHallpass(): void;
  showPodControls: boolean;
  showGoToPod: boolean;
  onMoveToPod(): void;
  showBroadcastToggle: boolean;
  broadcastActive: boolean;
  onToggleBroadcast(): void;
  avatarColor: string;
  initials: string;
  displayName: string;
  roomRoleLabel: string;
  roomName: string;
  mediaControlsProps: ComponentProps<typeof MediaControls>;
  viewMode: "2d" | "3d";
  firstPerson: boolean;
  manifestReady: boolean;
  onSetFirstPerson(): void;
  onSetThirdPerson(): void;
  avatarEditorOpen: boolean;
  avatarEditorLocked: boolean;
  onToggleAvatarEditor(): void;
  mediaPermissionText: string;
  reactionsEnabled: boolean;
  reactionsLocked: boolean;
  onFireReaction(slug: AvatarReactionSlug): void;
  showWhisperToggle: boolean;
  whisperMode: "normal" | "whisper";
  whisperSuggested: boolean;
  onToggleWhisper(): void;
  movementPadProps: ComponentProps<typeof MovementPad>;
};

const REACTION_SLUGS = [
  "thumbs-up",
  "confused",
  "question",
  "me",
  "pause",
  "celebrate"
] as const satisfies readonly AvatarReactionSlug[];

export function RoomLeftHud({
  showPlayModeToggle,
  playModeBusy,
  playModeEnabled,
  onTogglePlayMode,
  showSpotlightIndicator,
  spotlightAnchorLabel,
  spotlightModeLabel,
  showStudentClassroomState,
  studentGroup,
  handRaised,
  hostSingular,
  hallpassStatus,
  onRequestHallpass,
  onReturnFromHallpass,
  showPodControls,
  showGoToPod,
  onMoveToPod,
  showBroadcastToggle,
  broadcastActive,
  onToggleBroadcast,
  avatarColor,
  initials,
  displayName,
  roomRoleLabel,
  roomName,
  mediaControlsProps,
  viewMode,
  firstPerson,
  manifestReady,
  onSetFirstPerson,
  onSetThirdPerson,
  avatarEditorOpen,
  avatarEditorLocked,
  onToggleAvatarEditor,
  mediaPermissionText,
  reactionsEnabled,
  reactionsLocked,
  onFireReaction,
  showWhisperToggle,
  whisperMode,
  whisperSuggested,
  onToggleWhisper,
  movementPadProps
}: RoomLeftHudProps) {
  return (
    <div className="room-hud-left">
      {showPlayModeToggle ? (
        <div className="hud-panel">
          <button
            type="button"
            className="hud-btn hud-btn-pri"
            disabled={playModeBusy}
            onClick={onTogglePlayMode}
          >
            {playModeBusy ? "…" : playModeEnabled ? "Edit layout" : "Play test"}
          </button>
          {playModeEnabled ? (
            <p className="hud-ctx-sub" style={{ marginTop: "0.35rem" }}>
              Play mode — walking only. Players cannot edit structure.
            </p>
          ) : null}
        </div>
      ) : null}

      {showSpotlightIndicator ? (
        <div className="hud-panel hud-ctx-panel">
          <div className="hud-ctx-card">
            <span className="hud-ctx-lbl">Focus active</span>
            <span className="hud-ctx-val">{spotlightAnchorLabel}</span>
            <span className="hud-ctx-sub">{spotlightModeLabel}</span>
          </div>
        </div>
      ) : null}

      {showStudentClassroomState ? (
        <div className="hud-panel">
          {studentGroup ? (
            <div
              className="hud-ctx-card"
              style={{ borderBottom: handRaised ? "1px solid rgba(255,255,255,0.08)" : undefined }}
            >
              <span className="hud-ctx-lbl" style={{ color: studentGroup.color ?? "#4678b4" }}>
                My Group
              </span>
              <span className="hud-ctx-val">
                <span
                  className="hud-ctx-dot"
                  style={{ background: studentGroup.color ?? "#4678b4" }}
                />
                {studentGroup.label} · {studentGroup.memberCount} members
              </span>
            </div>
          ) : null}
          {handRaised ? (
            <div className="hud-ctx-card">
              <span className="hud-ctx-lbl acc">Hand raised</span>
              <span className="hud-ctx-sub">
                Waiting for your {hostSingular.toLowerCase()}
              </span>
            </div>
          ) : null}
          {hallpassStatus?.mode === "active" ? (
            <div className="hud-ctx-card">
              <div className="hallpass-hud-row">
                <span className="hud-ctx-lbl">Hall pass · {hallpassStatus.elapsedLabel}</span>
                <button
                  type="button"
                  className="hud-btn hallpass-btn--out"
                  disabled={hallpassStatus.busy}
                  onClick={onReturnFromHallpass}
                >
                  🚪 I&apos;m back
                </button>
              </div>
            </div>
          ) : hallpassStatus?.mode === "limit" ? (
            <div className="hud-ctx-card">
              <p className="hud-ctx-sub" style={{ fontSize: "10px" }}>
                You&apos;ve reached today&apos;s hall-pass limit.
              </p>
            </div>
          ) : hallpassStatus?.mode === "request" ? (
            <div className="hud-ctx-card">
              <button
                type="button"
                className="hud-btn"
                disabled={hallpassStatus.busy}
                onClick={onRequestHallpass}
              >
                {hallpassStatus.pending ? "🚪 Pending..." : "🚪 Step out"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showPodControls ? (
        <div className="hud-panel">
          {showGoToPod ? (
            <button type="button" className="hud-btn" onClick={onMoveToPod}>
              Go to my pod
            </button>
          ) : null}
          {showBroadcastToggle ? (
            <button
              type="button"
              className={`hud-btn hud-btn--broadcast${broadcastActive ? " hud-btn--active" : ""}`}
              data-testid="student-broadcast-toggle"
              onClick={onToggleBroadcast}
            >
              {broadcastActive ? "Broadcast on" : "Broadcast off"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="hud-panel">
        <div className="hud-id-card">
          <div className="hud-av" style={{ background: avatarColor }}>
            {initials}
          </div>
          <div className="hud-id-text">
            <div className="hud-id-name">{displayName}</div>
            <div className="hud-id-sub">
              {roomRoleLabel} · {roomName}
            </div>
          </div>
        </div>
        <MediaControls {...mediaControlsProps} />
        {viewMode === "3d" ? (
          <div className="hud-person-actions">
            <div className="hud-person-actions__cam-spacer" aria-hidden="true" />
            <div className="hud-person-actions__buttons">
              <div
                className="toggle hud-person-actions__perspective"
                aria-label="Camera perspective"
                title="First-person view (V)"
              >
                <button
                  type="button"
                  aria-pressed={firstPerson}
                  disabled={!manifestReady}
                  onClick={onSetFirstPerson}
                >
                  1P
                </button>
                <button
                  type="button"
                  aria-pressed={!firstPerson}
                  disabled={!manifestReady}
                  onClick={onSetThirdPerson}
                >
                  3P
                </button>
              </div>
              <button
                type="button"
                className={`avatar-editor__hud-btn hud-person-actions__avatar${avatarEditorOpen ? " avatar-editor__hud-btn--active" : ""}${avatarEditorLocked ? " avatar-editor__hud-btn--locked" : ""}`}
                onClick={onToggleAvatarEditor}
                aria-pressed={avatarEditorOpen}
                aria-label={avatarEditorLocked ? "Avatar editing paused during lesson" : "Edit your avatar"}
                disabled={avatarEditorLocked}
              >
                {avatarEditorLocked ? "🔒 Avatar" : "👤 Avatar"}
              </button>
            </div>
          </div>
        ) : null}
        {mediaPermissionText ? (
          <p
            className="hud-permission"
            style={{ padding: "4px 9px", fontSize: "9.5px", color: "var(--hud-tx-m)" }}
          >
            {mediaPermissionText}
          </p>
        ) : null}
      </div>

      {reactionsEnabled ? (
        <div className="hud-panel">
          <div className="hud-reactions" aria-label="Reactions">
            {REACTION_SLUGS.map((slug) => (
              <button
                key={slug}
                type="button"
                aria-label={slug}
                disabled={reactionsLocked}
                onClick={() => onFireReaction(slug)}
              >
                {slug === "thumbs-up"
                  ? "👍"
                  : slug === "confused"
                    ? "😕"
                    : slug === "question"
                      ? "❓"
                      : slug === "me"
                        ? "🙋"
                        : slug === "pause"
                          ? "🤚"
                          : "🎉"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showWhisperToggle ? (
        <div className="hud-panel">
          <button
            type="button"
            className={`hud-btn${whisperMode === "whisper" ? " hud-btn--active" : ""}${whisperSuggested ? " hud-btn--glow" : ""}`}
            onClick={onToggleWhisper}
          >
            {whisperMode === "whisper" ? "🔇 Whisper on" : "🔊 Normal"}
          </button>
          {whisperSuggested ? (
            <p className="hud-ctx-sub" style={{ fontSize: "10px", padding: "2px 0" }}>
              Suggested for group work
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="hud-panel dpad-card">
        <MovementPad {...movementPadProps} />
      </div>
    </div>
  );
}
