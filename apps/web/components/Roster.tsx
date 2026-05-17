"use client";

import type { ParticipantView } from "./RoomClient";

export function Roster({ participants }: { participants: ParticipantView[] }) {
  return (
    <div className="hud-card" aria-label="Participants">
      <div className="hud-heading">
        <span>People</span>
        <span>{participants.length}</span>
      </div>
      <ul className="roster-compact" role="list">
        {participants.map((p) => {
          const camOn = p.state.media?.cameraEnabled;
          const micOn = p.state.media?.microphoneEnabled;
          const speaking = p.state.media?.speaking;
          return (
            <li key={p.id} className="roster-compact-item" data-testid={`participant-${p.id}`}>
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
                {camOn ? <span className="tag active">cam</span> : null}
                {micOn ? <span className={`tag${speaking ? " active" : ""}`}>mic</span> : null}
                {p.role === "teacher" ? <span className="tag">T</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
