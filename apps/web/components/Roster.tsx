"use client";

import { calculateSpatialAudio } from "@3dspace/room-engine";
import type { ParticipantView } from "./RoomClient";

export function Roster({ participants }: { participants: ParticipantView[] }) {
  const local = participants.find((participant) => participant.local);

  return (
    <section className="stack" aria-label="Participant roster">
      <strong>Participants ({participants.length})</strong>
      <ul className="roster-list">
        {participants.map((participant) => {
          const audio = local && local.id !== participant.id ? calculateSpatialAudio(local.state.position, participant.state.position) : null;
          const position = participant.state.position;
          return (
            <li key={participant.id} className="roster-item" data-testid={`participant-${participant.id}`}>
              <div className="cluster">
                <span className="avatar-dot" style={{ background: participant.local ? "#eb5e28" : "#2f6b4f" }}>
                  {participant.displayName.slice(0, 2).toUpperCase()}
                </span>
                <span>{participant.displayName}</span>
              </div>
              <span className="small">
                {participant.role} · {participant.state.viewMode} · {participant.state.media?.cameraEnabled ? "camera on" : "camera off"} ·{" "}
                {participant.state.media?.microphoneEnabled ? "mic on" : "mic off"}
              </span>
              <span className="small" data-testid={`participant-${participant.id}-position`}>
                {participant.state.movement} · x {position.x.toFixed(1)} · z {position.z.toFixed(1)}
              </span>
              {audio ? <span className="small">Spatial audio gain {audio.gain.toFixed(2)}, pan {audio.pan.toFixed(2)}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
