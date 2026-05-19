"use client";

import type { ClassroomGroup, ClassroomSpotlight, RoomManifest, WallObject } from "@3dspace/contracts";
import { computeGroupMemberPosition, projectAnchorRectTo2D, projectPositionTo2D } from "@3dspace/room-engine";
import type { ParticipantView } from "./RoomClient";
import { WallObjectCard } from "./WallObjectCard";

export function RoomView2D({
  manifest,
  participants,
  onMoveToPoint,
  wallObjects = [],
  assetUrls = {},
  wallMediaStreams = {},
  classroomGroups = [],
  spotlight,
  positioningMode = false
}: {
  manifest: RoomManifest;
  participants: ParticipantView[];
  onMoveToPoint(point: { x: number; y: number }): void;
  wallObjects?: WallObject[];
  assetUrls?: Record<string, string>;
  wallMediaStreams?: Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>;
  classroomGroups?: ClassroomGroup[];
  spotlight?: ClassroomSpotlight | null | undefined;
  positioningMode?: boolean;
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
          const rect = projectAnchorRectTo2D(manifest, anchor);
          const objects = wallObjects.filter((object) => object.wallAnchorId === anchor.id && object.status !== "removed");
          const hasLive = objects.some((object) => object.type.endsWith(".live") && object.status === "active");
          const isSpotlighted = spotlight?.anchorId === anchor.id;
          return (
            <g key={anchor.id} aria-label={isSpotlighted ? `${anchor.label} (focused)` : anchor.label}>
              {isSpotlighted ? (
                <rect
                  x={rect.x - 0.8}
                  y={rect.y - 0.8}
                  width={rect.width + 1.6}
                  height={rect.height + 1.6}
                  rx="1.2"
                  fill="none"
                  stroke="#f1c40f"
                  strokeWidth="1.4"
                  strokeDasharray="2.5 1.5"
                  opacity="0.92"
                />
              ) : null}
              <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="0.7" fill={isSpotlighted ? "#f1c40f" : hasLive ? "#005fcc" : "#eb5e28"} opacity="0.92" />
              <text x={point.x} y={rect.y - 0.6} textAnchor="middle" fontSize="2.2" fill={isSpotlighted ? "#5a4000" : "#17201a"}>{anchor.label}</text>
              {objects.length > 0 ? <text x={point.x} y={point.y + 0.75} textAnchor="middle" fontSize="2.1" fill={isSpotlighted ? "#17201a" : "#fffaf0"}>{objects.length}</text> : null}
            </g>
          );
        })}
        {classroomGroups.filter((g) => g.targetPosition && g.hold?.enabled).map((group) => {
          const center = projectPositionTo2D(manifest, group.targetPosition!);
          return (
            <g key={`zone-${group.id}`}>
              <circle cx={center.x} cy={center.y} r={5.5} fill={`${group.color}22`} stroke={group.color} strokeWidth="0.8" strokeDasharray="2 1.5" />
              {group.memberUserIds.map((userId, index) => {
                const memberPos = computeGroupMemberPosition(group.targetPosition!, index);
                const pt = projectPositionTo2D(manifest, memberPos);
                return <circle key={userId} cx={pt.x} cy={pt.y} r={1.6} fill={group.color} opacity={0.55} />;
              })}
            </g>
          );
        })}
        {positioningMode ? (
          <rect x="2" y="2" width="96" height="96" rx="5" fill="none" stroke="#e67e22" strokeWidth="1.5" strokeDasharray="4 3" pointerEvents="none" />
        ) : null}
        {participants.map((participant) => {
          const point = projectPositionTo2D(manifest, participant.state.position);
          const group = classroomGroups.find((g) => g.status === "active" && g.memberUserIds.includes(participant.id));
          const fillColor = group?.color ?? (participant.local ? "#eb5e28" : "#2f6b4f");
          return (
            <g key={participant.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={participant.local ? 3.2 : 2.7}
                fill={fillColor}
                stroke={participant.state.media?.speaking ? "#005fcc" : "#fffaf0"}
                strokeWidth="1.2"
              />
              {participant.state.media?.cameraEnabled ? <rect x={point.x + 2.5} y={point.y - 2.2} width="4" height="3" rx="0.6" fill="#17201a" /> : null}
              <text x={point.x} y={point.y + 6} textAnchor="middle" fontSize="2.4" fill="#17201a">{participant.displayName}</text>
            </g>
          );
        })}
      </svg>
      {wallObjects.length > 0 ? (
        <div className="wall-object-list" aria-label="Wall objects list">
          {wallObjects.map((object) => (
            <WallObjectCard
              key={object.id}
              object={object}
              compact
              assetUrl={assetUrls[object.id]}
              videoStream={wallMediaStreams[object.id]?.videoStream}
              audioStream={wallMediaStreams[object.id]?.audioStream}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
