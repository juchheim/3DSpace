"use client";

import type { RoomManifest } from "@3dspace/contracts";
import { projectPositionTo2D } from "@3dspace/room-engine";
import type { ParticipantView } from "./RoomClient";

export function RoomView2D({
  manifest,
  participants,
  onMoveToPoint
}: {
  manifest: RoomManifest;
  participants: ParticipantView[];
  onMoveToPoint(point: { x: number; y: number }): void;
}) {
  function handlePointer(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    onMoveToPoint({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100
    });
  }

  return (
    <div className="map2d">
      <svg role="img" aria-label={`${manifest.name} top-down 2D analog`} viewBox="0 0 100 100" onPointerDown={handlePointer}>
        <rect x="2" y="2" width="96" height="96" rx="5" fill="#f6edcf" stroke="#17201a" strokeOpacity="0.28" strokeWidth="1" />
        {manifest.walls.map((wall) => {
          const start = projectPositionTo2D(manifest, wall.start);
          const end = projectPositionTo2D(manifest, wall.end);
          return <line key={wall.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#17201a" strokeWidth="1.6" />;
        })}
        {manifest.wallAnchors.map((anchor) => {
          const point = projectPositionTo2D(manifest, anchor.position);
          return (
            <g key={anchor.id}>
              <rect x={point.x - 3} y={point.y - 1.4} width="6" height="2.8" rx="0.7" fill="#eb5e28" opacity="0.78" />
              <text x={point.x} y={point.y - 2.4} textAnchor="middle" fontSize="2.2" fill="#17201a">{anchor.label}</text>
            </g>
          );
        })}
        {participants.map((participant) => {
          const point = projectPositionTo2D(manifest, participant.state.position);
          return (
            <g key={participant.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={participant.local ? 3.2 : 2.7}
                fill={participant.local ? "#eb5e28" : "#2f6b4f"}
                stroke={participant.state.media?.speaking ? "#005fcc" : "#fffaf0"}
                strokeWidth="1.2"
              />
              {participant.state.media?.cameraEnabled ? <rect x={point.x + 2.5} y={point.y - 2.2} width="4" height="3" rx="0.6" fill="#17201a" /> : null}
              <text x={point.x} y={point.y + 6} textAnchor="middle" fontSize="2.4" fill="#17201a">{participant.displayName}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
