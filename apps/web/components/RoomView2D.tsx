"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AvatarAppearance,
  AvatarReactionSlug,
  ClassroomGroup,
  ClassroomPrivateCheck,
  ClassroomSpotlight,
  ParticipantAudioMode,
  Role,
  RoomManifest,
  RoomObject,
  RoomObjectTemplate,
  WallObject
} from "@3dspace/contracts";
import { computeGroupMemberPosition, projectAnchorRectTo2D, projectPositionTo2D } from "@3dspace/room-engine";
import type { ParticipantView } from "./RoomClient";
import { useWorldSkinContext } from "./worldSkins/SkinLayer";
import { RoomObjectIcon2D } from "./RoomObjectIcon2D";
import { canGrabRoomObject, canTouchRoomObject, snapPosition, snapScale, snapYaw } from "../lib/roomObjectInteraction";
import { WallObjectCard } from "./WallObjectCard";

function anchorPrivateChecks(privateChecks: ClassroomPrivateCheck[], anchorId: string) {
  return privateChecks.filter((check) => check.status === "open" && check.wallAnchorId === anchorId);
}

const REACTION_EMOJI_2D: Record<AvatarReactionSlug, string> = {
  "thumbs-up": "👍",
  "confused":  "😕",
  "question":  "❓",
  "me":        "🙋",
  "pause":     "🤚",
  "celebrate": "🎉"
};

type GrabInfo = { holderUserId: string; expiresAt: string };

type RoomObjectActions = {
  beginGrab(objectId: string): Promise<boolean>;
  publishPose(objectId: string, pose: import("@3dspace/contracts").Pose, scale: number): void;
  endGrab(objectId: string, finalPose: import("@3dspace/contracts").Pose, finalScale: number): Promise<void>;
  update(objectId: string, patch: { colorTintHex?: string }): Promise<unknown>;
  remove(objectId: string): Promise<void>;
  reset(objectId: string): Promise<unknown>;
  setTouch(
    objectId: string,
    touchPolicy: import("@3dspace/contracts").RoomObjectTouchPolicy,
    grants?: { userIds?: string[]; groupIds?: string[] }
  ): Promise<unknown>;
  setParameters(objectId: string, parameters: Record<string, unknown>): void;
};

export function RoomView2D({
  manifest,
  participants,
  onMoveToPoint,
  wallObjects = [],
  assetUrls = {},
  wallMediaStreams = {},
  classroomGroups = [],
  podsEnabled = false,
  podRadiusMeters = 3,
  privateChecks = [],
  spotlight,
  positioningMode = false,
  getReaction,
  getAudioMode,
  hallpassZone,
  roomObjects = [],
  roomObjectTemplatesById = {},
  roomObjectGrabs,
  myActiveRoomObjectGrabId,
  roomObjectRole,
  roomObjectCurrentUserId,
  roomObjectMemberGroupIds = [],
  selectedRoomObjectId = null,
  onSelectRoomObject,
  roomObjectActions,
  getAppearance
}: {
  manifest: RoomManifest;
  participants: ParticipantView[];
  onMoveToPoint(point: { x: number; y: number }): void;
  wallObjects?: WallObject[];
  assetUrls?: Record<string, string>;
  wallMediaStreams?: Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>;
  classroomGroups?: ClassroomGroup[];
  podsEnabled?: boolean;
  podRadiusMeters?: number;
  privateChecks?: ClassroomPrivateCheck[];
  spotlight?: ClassroomSpotlight | null | undefined;
  positioningMode?: boolean;
  getReaction?: (participantId: string) => AvatarReactionSlug | undefined;
  getAudioMode?: (participantId: string) => { mode: ParticipantAudioMode; radiusMeters: number } | undefined;
  hallpassZone?: RoomManifest["hallpassHoldingZone"];
  roomObjects?: RoomObject[];
  roomObjectTemplatesById?: Record<string, RoomObjectTemplate>;
  roomObjectGrabs?: Map<string, GrabInfo>;
  myActiveRoomObjectGrabId?: string | null;
  roomObjectRole?: Role;
  roomObjectCurrentUserId?: string;
  roomObjectMemberGroupIds?: string[];
  selectedRoomObjectId?: string | null;
  onSelectRoomObject?: (objectId: string | null) => void;
  roomObjectActions?: RoomObjectActions;
  getAppearance?: (participantId: string) => AvatarAppearance;
}) {
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const objectsEnabled = Boolean(
    roomObjectActions &&
      roomObjectRole &&
      roomObjectCurrentUserId &&
      onSelectRoomObject &&
      roomObjectGrabs
  );

  const selectedObject = useMemo(
    () => roomObjects.find((object) => object.id === selectedRoomObjectId) ?? null,
    [roomObjects, selectedRoomObjectId]
  );
  const selectedTemplate = selectedObject ? roomObjectTemplatesById[selectedObject.templateId] : undefined;

  useEffect(() => {
    if (!objectsEnabled || !selectedObject || !selectedTemplate || !roomObjectActions) return;
    const activeObject = selectedObject;
    const activeTemplate = selectedTemplate;

    const canGrab = canGrabRoomObject({
      object: activeObject,
      userId: roomObjectCurrentUserId!,
      role: roomObjectRole!,
      memberGroupIds: roomObjectMemberGroupIds
    });
    if (!canGrab) return;

    const isHolder = myActiveRoomObjectGrabId === activeObject.id;

    async function ensureGrab() {
      if (isHolder) return true;
      return roomObjectActions!.beginGrab(activeObject.id);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && event.target.closest(".room-object-html")) return;
      const bypass = event.shiftKey;
      const step = 0.25;
      const scaleStep = activeTemplate.defaultScale * 0.05;

      const mutate = async (nextPose: typeof activeObject.pose, nextScale: number) => {
        const pose = {
          position: snapPosition(manifest, nextPose.position, bypass),
          rotation: {
            ...nextPose.rotation,
            yaw: snapYaw(nextPose.rotation.yaw, bypass)
          }
        };
        const scale = snapScale(nextScale, activeTemplate.defaultScale, bypass);
        roomObjectActions!.publishPose(activeObject.id, pose, scale);
        await roomObjectActions!.endGrab(activeObject.id, pose, scale);
      };

      void (async () => {
        const grabbed = await ensureGrab();
        if (!grabbed) return;

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              position: { ...activeObject.pose.position, x: activeObject.pose.position.x - step }
            },
            activeObject.scale
          );
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              position: { ...activeObject.pose.position, x: activeObject.pose.position.x + step }
            },
            activeObject.scale
          );
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              position: { ...activeObject.pose.position, z: activeObject.pose.position.z - step }
            },
            activeObject.scale
          );
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              position: { ...activeObject.pose.position, z: activeObject.pose.position.z + step }
            },
            activeObject.scale
          );
        } else if (event.key === "[") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              rotation: {
                ...activeObject.pose.rotation,
                yaw: activeObject.pose.rotation.yaw - Math.PI / 12
              }
            },
            activeObject.scale
          );
        } else if (event.key === "]") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              rotation: {
                ...activeObject.pose.rotation,
                yaw: activeObject.pose.rotation.yaw + Math.PI / 12
              }
            },
            activeObject.scale
          );
        } else if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          await mutate(activeObject.pose, activeObject.scale + scaleStep);
        } else if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          await mutate(activeObject.pose, activeObject.scale - scaleStep);
        }
      })();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    manifest,
    myActiveRoomObjectGrabId,
    objectsEnabled,
    roomObjectActions,
    roomObjectCurrentUserId,
    roomObjectMemberGroupIds,
    roomObjectRole,
    selectedObject,
    selectedTemplate
  ]);

  // World skin context — floor map overlay + board darken
  const { skin } = useWorldSkinContext();
  const map2dUrl = skin?.overrides.map2dStorageKey ?? null;
  const boardDarkenOpacity = skin?.overrides.boardDarkenOpacity ?? 0;

  function handlePointer(event: React.PointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest(".room-object-icon-2d")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onMoveToPoint({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100
    });
  }

  return (
    <div className={`map2d${objectsEnabled ? " map2d--room-objects" : ""}`}>
      <svg role="img" aria-label={`${manifest.name} top-down 2D analog`} viewBox="0 0 100 100" onPointerDown={handlePointer}>
        <rect x="2" y="2" width="96" height="96" rx="5" fill="#f6edcf" stroke="#17201a" strokeOpacity="0.28" strokeWidth="1" />
        {/* Skin floor map — rendered below walls/anchors/participants */}
        {map2dUrl ? (
          <image
            href={map2dUrl}
            x="2" y="2"
            width="96" height="96"
            preserveAspectRatio="xMidYMid slice"
            opacity="0.88"
            style={{ pointerEvents: "none" }}
          />
        ) : null}
        {manifest.walls.map((wall) => {
          const start = projectPositionTo2D(manifest, wall.start);
          const end = projectPositionTo2D(manifest, wall.end);
          return <line key={wall.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#17201a" strokeWidth="1.6" />;
        })}
        {manifest.wallAnchors.map((anchor) => {
          const point = projectPositionTo2D(manifest, anchor.position);
          const rect = projectAnchorRectTo2D(manifest, anchor);
          const objects = wallObjects.filter((object) => object.wallAnchorId === anchor.id && object.status !== "removed");
          const checks = anchorPrivateChecks(privateChecks, anchor.id);
          const hasLive = objects.some((object) => object.type.endsWith(".live") && object.status === "active");
          const isSpotlighted = spotlight?.anchorId === anchor.id;
          const check = checks[0];
          return (
            <g key={anchor.id} aria-label={isSpotlighted ? `${anchor.label} (focused)` : anchor.label}>
              {/* Board-darken pass: subtle dark backing so anchor labels stay legible on busy skin textures */}
              {boardDarkenOpacity > 0 ? (
                <rect
                  x={rect.x - 1}
                  y={rect.y - 3}
                  width={rect.width + 2}
                  height={rect.height + 3.6}
                  rx="1"
                  fill="#17201a"
                  opacity={boardDarkenOpacity}
                  pointerEvents="none"
                  className="world-skin-board-darken"
                />
              ) : null}
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
              {check ? (
                <>
                  <rect x={rect.x} y={rect.y + rect.height + 1.2} width={rect.width} height={7.8} rx="0.9" fill="#fffaf0" stroke="#17201a" strokeOpacity="0.2" strokeWidth="0.5" />
                  <text x={point.x} y={rect.y + rect.height + 3.6} textAnchor="middle" fontSize="1.65" fill="#17201a">Active check</text>
                  <text x={point.x} y={rect.y + rect.height + 5.7} textAnchor="middle" fontSize="1.55" fill="#5b5347">
                    {check.question.length > 24 ? `${check.question.slice(0, 24)}…` : check.question}
                  </text>
                  {checks.length > 1 ? <text x={point.x} y={rect.y + rect.height + 7.1} textAnchor="middle" fontSize="1.45" fill="#5b5347">+{checks.length - 1} more</text> : null}
                </>
              ) : null}
            </g>
          );
        })}
        {classroomGroups.filter((group) => group.status === "active" && group.targetPosition).map((group) => {
          const center = projectPositionTo2D(manifest, group.targetPosition!);
          const radiusPoint = projectPositionTo2D(manifest, {
            x: group.targetPosition!.x + podRadiusMeters,
            y: group.targetPosition!.y,
            z: group.targetPosition!.z
          });
          const projectedPodRadius = Math.max(5.5, Math.abs(radiusPoint.x - center.x));
          const boardLabel = group.targetWallAnchorId
            ? manifest.wallAnchors.find((anchor) => anchor.id === group.targetWallAnchorId)?.label ?? group.targetWallAnchorId
            : "";
          return (
            <g key={`zone-${group.id}`}>
              <circle
                data-testid={`pod-zone-${group.id}`}
                cx={center.x}
                cy={center.y}
                r={podsEnabled ? projectedPodRadius : 5.5}
                fill={podsEnabled ? group.color : "none"}
                opacity={podsEnabled ? 0.24 : 1}
                stroke={group.color}
                strokeWidth="0.8"
                strokeDasharray={podsEnabled ? undefined : (group.hold?.enabled ? "2 1.5" : "1.4 1.4")}
              />
              {group.memberUserIds.map((userId, index) => {
                const memberPos = computeGroupMemberPosition(group.targetPosition!, index);
                const pt = projectPositionTo2D(manifest, memberPos);
                return <circle key={userId} cx={pt.x} cy={pt.y} r={1.6} fill={group.color} opacity={0.55} />;
              })}
              <text x={center.x} y={center.y - (podsEnabled ? projectedPodRadius + 2.8 : 6.8)} textAnchor="middle" fontSize={podsEnabled ? "4" : "2"} fill="#17201a">{group.label}</text>
              {boardLabel ? <text x={center.x} y={center.y - (podsEnabled ? projectedPodRadius - 0.6 : 4.5)} textAnchor="middle" fontSize={podsEnabled ? "3.2" : "1.6"} fill="#5b5347">{boardLabel}</text> : null}
            </g>
          );
        })}
        {hallpassZone ? (() => {
          const tl = projectPositionTo2D(manifest, { x: hallpassZone.minX, y: 0, z: hallpassZone.minZ });
          const br = projectPositionTo2D(manifest, { x: hallpassZone.maxX, y: 0, z: hallpassZone.maxZ });
          const cx = (tl.x + br.x) / 2;
          const cy = (tl.y + br.y) / 2;
          return (
            <g aria-label="Hall pass zone" pointerEvents="none">
              <rect
                x={tl.x} y={tl.y}
                width={br.x - tl.x} height={br.y - tl.y}
                rx="0.8"
                fill="#4a90e222"
                stroke="#4a90e2"
                strokeWidth="0.7"
                strokeDasharray="2 1.5"
              />
              <text x={cx} y={cy + 0.7} textAnchor="middle" fontSize="2" fill="#2255a4">Hall pass</text>
            </g>
          );
        })() : null}
        {objectsEnabled
          ? roomObjects.map((object) => {
              const template = roomObjectTemplatesById[object.templateId];
              if (!template) return null;
              const grab = roomObjectGrabs!.get(object.id);
              const holderId = grab?.holderUserId;
              const holderParticipant = holderId
                ? participants.find((participant) => participant.id === holderId)
                : undefined;
              const grabHolderColor = holderParticipant && getAppearance
                ? getAppearance(holderParticipant.id).shirtFront
                : "#f4b63f";

              return (
                <RoomObjectIcon2D
                  key={object.id}
                  manifest={manifest}
                  object={object}
                  template={template}
                  canGrab={canGrabRoomObject({
                    object,
                    userId: roomObjectCurrentUserId!,
                    role: roomObjectRole!,
                    memberGroupIds: roomObjectMemberGroupIds
                  })}
                  isGrabbed={Boolean(grab)}
                  grabHolderColor={grabHolderColor}
                  holderDisplayName={holderParticipant?.displayName}
                  localIsHolder={holderId === roomObjectCurrentUserId}
                  selected={selectedRoomObjectId === object.id}
                  actions={roomObjectActions!}
                  onSelect={() => onSelectRoomObject!(object.id)}
                  onAnnounce={setLiveAnnouncement}
                />
              );
            })
          : null}
        {positioningMode ? (
          <rect x="2" y="2" width="96" height="96" rx="5" fill="none" stroke="#e67e22" strokeWidth="1.5" strokeDasharray="4 3" pointerEvents="none" />
        ) : null}
        {/* Skin environment label — bottom-right corner, beneath participant dots */}
        {skin ? (
          <text
            x="97"
            y="98.5"
            textAnchor="end"
            fontSize="2.1"
            fill="#fffaf0"
            fillOpacity="0.55"
            pointerEvents="none"
            style={{ userSelect: "none" }}
          >
            Environment: {skin.label}
          </text>
        ) : null}
        {participants.map((participant) => {
          const point = projectPositionTo2D(manifest, participant.state.position);
          const group = classroomGroups.find((g) => g.status === "active" && g.memberUserIds.includes(participant.id));
          const fillColor = group?.color ?? (participant.local ? "#eb5e28" : "#2f6b4f");
          const reaction = getReaction?.(participant.id);
          const audioMode = getAudioMode?.(participant.id);
          const whisperCircleRadius = (() => {
            if (!audioMode || audioMode.mode !== "whisper") return null;
            const offsetPt = projectPositionTo2D(manifest, {
              x: participant.state.position.x + audioMode.radiusMeters,
              y: participant.state.position.y,
              z: participant.state.position.z
            });
            return Math.abs(offsetPt.x - point.x);
          })();
          return (
            <g key={participant.id}>
              {whisperCircleRadius !== null ? (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={whisperCircleRadius}
                  fill="none"
                  stroke="#4488cc"
                  strokeWidth="0.7"
                  strokeDasharray="1.8 1.2"
                  opacity="0.75"
                  pointerEvents="none"
                />
              ) : null}
              <circle
                cx={point.x}
                cy={point.y}
                r={participant.local ? 3.2 : 2.7}
                fill={fillColor}
                stroke={participant.state.media?.speaking ? "#005fcc" : "#fffaf0"}
                strokeWidth="1.2"
              />
              {participant.state.media?.cameraEnabled ? <rect x={point.x + 2.5} y={point.y - 2.2} width="4" height="3" rx="0.6" fill="#17201a" /> : null}
              {reaction ? <text x={point.x} y={point.y - 4.5} textAnchor="middle" fontSize="4.5">{REACTION_EMOJI_2D[reaction]}</text> : null}
              <text x={point.x} y={point.y + 6} textAnchor="middle" fontSize="2.4" fill="#17201a">{participant.displayName}</text>
            </g>
          );
        })}
      </svg>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

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
