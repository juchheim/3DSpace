"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { BufferAttribute, BufferGeometry, ClampToEdgeWrapping, SRGBColorSpace, Texture, TextureLoader, type MeshStandardMaterial, Vector3 } from "three";
import { useWorldSkinContext, DEFAULT_LIGHTING, DEFAULT_BACKGROUND } from "./worldSkins/SkinLayer";
import type {
  AvatarAppearance,
  AvatarReactionSlug,
  ClassroomGroup,
  ClassroomPrivateCheck,
  ClassroomSpotlight,
  ParticipantAudioMode,
  QualityLevel,
  Role,
  RoomManifest,
  RoomObject,
  RoomObjectTemplate,
  WallAnchorSchema,
  WallObject,
  WallObjectPlacement,
  WallPlaneSchema
} from "@3dspace/contracts";
import type { z } from "zod";
import type { ParticipantView } from "./RoomClient";
import { BlockyAvatar } from "./BlockyAvatar";
import { RoomObjectsLayer } from "./RoomObjectsLayer";
import { WallObjectCard } from "./WallObjectCard";

type Wall = z.infer<typeof WallPlaneSchema>;
type Anchor = z.infer<typeof WallAnchorSchema>;
type ConstrainedPlacement = Pick<WallObjectPlacement, "x" | "y" | "width" | "height" | "zIndex" | "fit">;
type WallObjectSurfaceStyle = CSSProperties & { "--wall-surface-font-size": string };

// drei Html transform sizing: worldMeters = px * distanceFactor / 400
const WALL_OBJECT_DISTANCE_FACTOR = 8;
const WALL_OBJECT_SURFACE_OFFSET = 0.045;
const WALL_OBJECT_LAYER_OFFSET = 0.002;
const PRIVATE_CHECK_SURFACE_OFFSET = 0.038;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function constrainPlacement(placement: WallObjectPlacement): ConstrainedPlacement {
  const width = clamp(finiteOr(placement.width, 1), 0.01, 1);
  const height = clamp(finiteOr(placement.height, 1), 0.01, 1);

  return {
    x: clamp(finiteOr(placement.x, 0), 0, 1 - width),
    y: clamp(finiteOr(placement.y, 0), 0, 1 - height),
    width,
    height,
    zIndex: finiteOr(placement.zIndex, 0),
    fit: placement.fit
  };
}

function isActiveGroup(group: ClassroomGroup) {
  return group.status === "active";
}

function isActivePodGroup(group: ClassroomGroup) {
  return group.status === "active" && Boolean(group.targetPosition);
}

function pointInsidePod(group: ClassroomGroup, point: { x: number; z: number } | undefined, podRadiusMeters: number) {
  if (!group.targetPosition || !point) return false;
  return Math.hypot(point.x - group.targetPosition.x, point.z - group.targetPosition.z) <= podRadiusMeters;
}

export function RoomView3D({
  manifest,
  participants,
  localParticipantId,
  quality,
  cameraYawRef,
  cameraPitchRef,
  bindCamera,
  onMoveToPoint,
  firstPerson = false,
  wallObjects = [],
  assetUrls = {},
  wallMediaStreams = {},
  canManageWallObjects = false,
  currentUserId,
  classroomGroups = [],
  podsEnabled = false,
  podRadiusMeters = 3,
  drawPodPartitions = false,
  privateChecks = [],
  spotlight,
  getAppearance,
  getReaction,
  getAudioMode,
  activeHelpRequestUserIds,
  onSelfClick,
  localWaveTriggered = false,
  onLocalWaveComplete,
  onWallObjectControl,
  onWallObjectRemove,
  onWallObjectStopShare,
  onWallObjectModerate,
  onWallObjectFullscreen,
  hallpassZone,
  roomObjects,
  roomObjectTemplatesById,
  roomObjectGrabs,
  myActiveRoomObjectGrabId,
  roomObjectRole,
  roomObjectCurrentUserId,
  roomObjectMemberGroupIds,
  selectedRoomObjectId,
  onSelectRoomObject,
  roomObjectActions
}: {
  manifest: RoomManifest;
  participants: ParticipantView[];
  localParticipantId: string;
  quality: QualityLevel;
  cameraYawRef: MutableRefObject<number>;
  cameraPitchRef: MutableRefObject<number>;
  bindCamera(element: HTMLElement | null): void | (() => void);
  onMoveToPoint(point: { x: number; z: number }): void;
  firstPerson?: boolean;
  wallObjects?: WallObject[];
  assetUrls?: Record<string, string>;
  wallMediaStreams?: Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>;
  canManageWallObjects?: boolean;
  currentUserId?: string | undefined;
  classroomGroups?: ClassroomGroup[];
  podsEnabled?: boolean;
  podRadiusMeters?: number;
  drawPodPartitions?: boolean;
  privateChecks?: ClassroomPrivateCheck[];
  spotlight?: ClassroomSpotlight | null | undefined;
  getAppearance: (participantId: string) => AvatarAppearance;
  getReaction?: (participantId: string) => AvatarReactionSlug | undefined;
  getAudioMode?: (participantId: string) => { mode: ParticipantAudioMode; radiusMeters: number } | undefined;
  activeHelpRequestUserIds?: ReadonlySet<string>;
  onSelfClick?: () => void;
  localWaveTriggered?: boolean;
  onLocalWaveComplete?: () => void;
  onWallObjectControl?: (
    objectId: string,
    action: "play" | "pause" | "mute" | "unmute" | "seek" | "vote" | "close-poll" | "reopen-poll",
    positionSeconds?: number,
    choiceId?: string
  ) => void;
  onWallObjectRemove?: (objectId: string) => void | Promise<void>;
  onWallObjectStopShare?: (objectId: string) => void | Promise<void>;
  onWallObjectModerate?: (objectId: string, action: "approve" | "reject") => void | Promise<void>;
  onWallObjectFullscreen?: (objectId: string) => void;
  hallpassZone?: RoomManifest["hallpassHoldingZone"];
  roomObjects?: RoomObject[];
  roomObjectTemplatesById?: Record<string, RoomObjectTemplate>;
  roomObjectGrabs?: Map<string, { holderUserId: string; expiresAt: string }>;
  myActiveRoomObjectGrabId?: string | null;
  roomObjectRole?: Role;
  roomObjectCurrentUserId?: string;
  roomObjectMemberGroupIds?: string[];
  selectedRoomObjectId?: string | null;
  onSelectRoomObject?: (objectId: string | null) => void;
  roomObjectActions?: {
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
}) {
  const dpr = quality === "high" ? 1.8 : quality === "medium" ? 1.4 : 1;
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const activeGroupByParticipantId = useMemo(() => {
    const map = new Map<string, ClassroomGroup>();
    for (const group of classroomGroups) {
      if (!isActiveGroup(group)) continue;
      for (const memberId of group.memberUserIds) {
        map.set(memberId, group);
      }
    }
    return map;
  }, [classroomGroups]);
  const podGroupByParticipantId = useMemo(() => {
    const map = new Map<string, ClassroomGroup>();
    for (const group of classroomGroups) {
      if (!isActivePodGroup(group)) continue;
      for (const memberId of group.memberUserIds) {
        map.set(memberId, group);
      }
    }
    return map;
  }, [classroomGroups]);
  const localParticipantPosition = participants.find((participant) => participant.id === localParticipantId)?.state.position;
  const localPodGroup = podsEnabled ? (podGroupByParticipantId.get(localParticipantId) ?? null) : null;

  useEffect(() => bindCamera(canvasElement), [bindCamera, canvasElement]);

  return (
    <div className="canvas-wrap">
      <Canvas
        camera={{ position: [0, 12, 14], fov: 48 }}
        dpr={dpr}
        gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
        onCreated={({ gl }) => setCanvasElement(gl.domElement)}
      >
        <SceneAtmosphere />
        <RoomGeometry manifest={manifest} onMoveToPoint={onMoveToPoint} wallObjects={wallObjects} spotlightAnchorId={spotlight?.anchorId} />
        {roomObjects &&
        roomObjectTemplatesById &&
        roomObjectGrabs &&
        roomObjectRole &&
        roomObjectCurrentUserId &&
        roomObjectMemberGroupIds &&
        onSelectRoomObject &&
        roomObjectActions ? (
          <RoomObjectsLayer
            manifest={manifest}
            objects={roomObjects}
            templatesById={roomObjectTemplatesById}
            grabs={roomObjectGrabs}
            myActiveGrabObjectId={myActiveRoomObjectGrabId ?? null}
            role={roomObjectRole}
            currentUserId={roomObjectCurrentUserId}
            memberGroupIds={roomObjectMemberGroupIds}
            participants={participants}
            classroomGroups={classroomGroups}
            getAppearance={getAppearance}
            selectedObjectId={selectedRoomObjectId ?? null}
            onSelectObject={onSelectRoomObject}
            actions={roomObjectActions}
          />
        ) : null}
        <WallObjectLayer
          manifest={manifest}
          wallObjects={wallObjects}
          assetUrls={assetUrls}
          wallMediaStreams={wallMediaStreams}
          canManageWallObjects={canManageWallObjects}
          currentUserId={currentUserId}
          {...(onWallObjectControl ? { onWallObjectControl } : {})}
          {...(onWallObjectRemove ? { onWallObjectRemove } : {})}
          {...(onWallObjectStopShare ? { onWallObjectStopShare } : {})}
          {...(onWallObjectModerate ? { onWallObjectModerate } : {})}
          {...(onWallObjectFullscreen ? { onWallObjectFullscreen } : {})}
        />
        <GroupTargetLayer
          manifest={manifest}
          groups={classroomGroups}
          podsEnabled={podsEnabled}
          podRadiusMeters={podRadiusMeters}
          drawPodPartitions={drawPodPartitions}
          {...(localParticipantPosition ? { localParticipantPosition } : {})}
          {...(getAudioMode ? { getAudioMode } : {})}
        />
        {hallpassZone ? <HallpassZoneMarker zone={hallpassZone} /> : null}
        <PrivateCheckLayer manifest={manifest} privateChecks={privateChecks} />
        {(() => {
          const { skin } = useWorldSkinContext();
          const avatarScale = skin?.overrides.avatarScale ?? 1;
          return participants.map((participant) => {
            const group = activeGroupByParticipantId.get(participant.id);
            const podGroup = podGroupByParticipantId.get(participant.id) ?? null;
            const isLocal = participant.id === localParticipantId;
            const crossPodOutlineColor =
              podsEnabled && localPodGroup && !isLocal && podGroup?.id !== localPodGroup.id
                ? podGroup?.color ?? "#9aa49d"
                : undefined;
            return (
              <BlockyAvatar
                key={participant.id}
                participant={participant}
                {...(group?.color ? { groupColor: group.color } : {})}
                {...(crossPodOutlineColor ? { crossPodOutlineColor } : {})}
                appearance={getAppearance(participant.id)}
                helpRequestActive={activeHelpRequestUserIds?.has(participant.id) ?? false}
                waveTriggered={isLocal ? localWaveTriggered : !!(participant.state.waving)}
                onWaveComplete={isLocal && onLocalWaveComplete ? onLocalWaveComplete : () => {}}
                avatarScale={avatarScale}
                {...(() => { const r = getReaction?.(participant.id); return r ? { reaction: r } : {}; })()}
                {...(() => { const m = getAudioMode?.(participant.id); return m ? { audioMode: m.mode, whisperRadiusMeters: m.radiusMeters } : {}; })()}
                {...(isLocal && onSelfClick && !firstPerson ? { onClick: onSelfClick } : {})}
                {...(isLocal && firstPerson ? { hidden: true } : {})}
              />
            );
          });
        })()}
        <FollowLocalAvatarCamera
          participants={participants}
          localParticipantId={localParticipantId}
          cameraYawRef={cameraYawRef}
          cameraPitchRef={cameraPitchRef}
          firstPerson={firstPerson}
        />
      </Canvas>
    </div>
  );
}

function GroupTargetLayer({
  manifest,
  groups,
  podsEnabled,
  podRadiusMeters,
  drawPodPartitions,
  localParticipantPosition,
  getAudioMode
}: {
  manifest: RoomManifest;
  groups: ClassroomGroup[];
  podsEnabled: boolean;
  podRadiusMeters: number;
  drawPodPartitions: boolean;
  localParticipantPosition?: { x: number; y?: number; z: number };
  getAudioMode?: (participantId: string) => { mode: ParticipantAudioMode; radiusMeters: number } | undefined;
}) {
  return (
    <group>
      {groups
        .filter(isActivePodGroup)
        .map((group) => (
          podsEnabled ? (
            <PodFloor
              key={`group-target-${group.id}`}
              group={group}
              manifest={manifest}
              podRadiusMeters={podRadiusMeters}
              drawPodPartitions={drawPodPartitions}
              highlightLocalParticipant={pointInsidePod(group, localParticipantPosition, podRadiusMeters)}
              hasBroadcast={group.memberUserIds.some((memberId) => getAudioMode?.(memberId)?.mode === "broadcast")}
            />
          ) : (
            <GroupTargetMarker key={`group-target-${group.id}`} group={group} manifest={manifest} />
          )
        ))}
    </group>
  );
}

function PrivateCheckLayer({
  manifest,
  privateChecks
}: {
  manifest: RoomManifest;
  privateChecks: ClassroomPrivateCheck[];
}) {
  const checksByAnchor = useMemo(() => {
    const groups = new Map<string, ClassroomPrivateCheck[]>();
    for (const check of privateChecks) {
      if (check.status !== "open" || !check.wallAnchorId) continue;
      groups.set(check.wallAnchorId, [...(groups.get(check.wallAnchorId) ?? []), check]);
    }
    return groups;
  }, [privateChecks]);

  return (
    <group>
      {manifest.wallAnchors.map((anchor) => {
        const checks = checksByAnchor.get(anchor.id) ?? [];
        if (checks.length === 0) return null;
        return <PrivateCheckSurface key={`private-check-${anchor.id}`} anchor={anchor} checks={checks} />;
      })}
    </group>
  );
}

function GroupTargetMarker({
  group,
  manifest
}: {
  group: ClassroomGroup;
  manifest: RoomManifest;
}) {
  const boardLabel = group.targetWallAnchorId
    ? manifest.wallAnchors.find((anchor) => anchor.id === group.targetWallAnchorId)?.label ?? group.targetWallAnchorId
    : "";

  return (
    <group position={[group.targetPosition!.x, 0.02, group.targetPosition!.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.6, 2.5, 32]} />
        <meshBasicMaterial color={group.color} transparent opacity={0.22} />
      </mesh>
      <Billboard position={[0, 1.6, 0]}>
        <Html center distanceFactor={6}>
          <div className="group-target-label">
            <strong>{group.label}</strong>
            {boardLabel ? <span>{boardLabel}</span> : null}
          </div>
        </Html>
      </Billboard>
    </group>
  );
}

function PodFloor({
  group,
  manifest,
  podRadiusMeters,
  drawPodPartitions,
  highlightLocalParticipant,
  hasBroadcast
}: {
  group: ClassroomGroup;
  manifest: RoomManifest;
  podRadiusMeters: number;
  drawPodPartitions: boolean;
  highlightLocalParticipant: boolean;
  hasBroadcast: boolean;
}) {
  const boardLabel = group.targetWallAnchorId
    ? manifest.wallAnchors.find((anchor) => anchor.id === group.targetWallAnchorId)?.label ?? group.targetWallAnchorId
    : "";
  const groupColor = group.color ?? "#4678b4";
  const panelSpecs = [
    { position: [0, 0.3, -podRadiusMeters] as const, rotation: [0, 0, 0] as const, size: [podRadiusMeters * 1.15, 0.6, 0.08] as const },
    { position: [-podRadiusMeters, 0.3, -podRadiusMeters * 0.1] as const, rotation: [0, Math.PI / 2, 0] as const, size: [podRadiusMeters * 1.55, 0.6, 0.08] as const },
    { position: [podRadiusMeters, 0.3, -podRadiusMeters * 0.1] as const, rotation: [0, Math.PI / 2, 0] as const, size: [podRadiusMeters * 1.55, 0.6, 0.08] as const },
    { position: [0, 0.3, podRadiusMeters * 0.72] as const, rotation: [0, 0, 0] as const, size: [podRadiusMeters * 0.9, 0.6, 0.08] as const }
  ];

  return (
    <group position={[group.targetPosition!.x, 0, group.targetPosition!.z]}>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[podRadiusMeters, 48]} />
        <meshBasicMaterial color={groupColor} transparent opacity={highlightLocalParticipant ? 0.32 : 0.18} />
      </mesh>
      <mesh position={[0, 0.017, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(0.01, podRadiusMeters - 0.12), podRadiusMeters, 64]} />
        <meshBasicMaterial color={groupColor} transparent opacity={highlightLocalParticipant ? 0.42 : 0.28} />
      </mesh>
      {drawPodPartitions
        ? panelSpecs.map((panel, index) => (
            <mesh key={`pod-partition-${group.id}-${index}`} position={panel.position} rotation={panel.rotation}>
              <boxGeometry args={panel.size} />
              <meshBasicMaterial color={groupColor} transparent opacity={0.12} />
            </mesh>
          ))
        : null}
      <Billboard position={[0, 1.72, 0]}>
        <Html center distanceFactor={6}>
          <div
            className="group-target-label group-target-label--pod"
            data-testid={`pod-floor-${group.id}`}
            data-has-broadcast={hasBroadcast ? "true" : "false"}
          >
            <strong>{group.label}</strong>
            <span>{group.memberUserIds.length} {group.memberUserIds.length === 1 ? "member" : "members"}</span>
            {boardLabel ? <span>{boardLabel}</span> : null}
            {hasBroadcast ? <em className="group-target-label__pill">Broadcast</em> : null}
          </div>
        </Html>
      </Billboard>
    </group>
  );
}

function HallpassZoneMarker({ zone }: { zone: NonNullable<RoomManifest["hallpassHoldingZone"]> }) {
  const cx = (zone.minX + zone.maxX) / 2;
  const cz = (zone.minZ + zone.maxZ) / 2;
  const radius = Math.min((zone.maxX - zone.minX) / 2, (zone.maxZ - zone.minZ) / 2);

  return (
    <group position={[cx, 0.02, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 32]} />
        <meshBasicMaterial color="#4a90e2" transparent opacity={0.2} />
      </mesh>
      <Billboard position={[0, 1.4, 0]}>
        <Html center distanceFactor={6}>
          <div className="hallpass-zone-label">Hall pass</div>
        </Html>
      </Billboard>
    </group>
  );
}

function WallObjectLayer({
  manifest,
  wallObjects,
  assetUrls,
  wallMediaStreams,
  canManageWallObjects,
  currentUserId,
  onWallObjectControl,
  onWallObjectRemove,
  onWallObjectStopShare,
  onWallObjectModerate,
  onWallObjectFullscreen
}: {
  manifest: RoomManifest;
  wallObjects: WallObject[];
  assetUrls: Record<string, string>;
  wallMediaStreams: Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>;
  canManageWallObjects: boolean;
  currentUserId?: string | undefined;
  onWallObjectControl?: (
    objectId: string,
    action: "play" | "pause" | "mute" | "unmute" | "seek" | "vote" | "close-poll" | "reopen-poll",
    positionSeconds?: number,
    choiceId?: string
  ) => void;
  onWallObjectRemove?: (objectId: string) => void | Promise<void>;
  onWallObjectStopShare?: (objectId: string) => void | Promise<void>;
  onWallObjectModerate?: (objectId: string, action: "approve" | "reject") => void | Promise<void>;
  onWallObjectFullscreen?: (objectId: string) => void;
}) {
  return (
    <group>
      {wallObjects
        .filter((object) => object.status !== "removed")
        .map((object) => {
          const anchor = manifest.wallAnchors.find((candidate) => candidate.id === object.wallAnchorId);
          if (!anchor) return null;
          return (
            <WallObjectSurface
              key={object.id}
              anchor={anchor}
              object={object}
              assetUrl={assetUrls[object.id]}
              videoStream={wallMediaStreams[object.id]?.videoStream}
              audioStream={wallMediaStreams[object.id]?.audioStream}
              canManage={canManageWallObjects}
              currentUserId={currentUserId}
              {...(onWallObjectControl ? { onControl: onWallObjectControl } : {})}
              {...(onWallObjectRemove ? { onRemove: onWallObjectRemove } : {})}
              {...(onWallObjectStopShare ? { onStopShare: onWallObjectStopShare } : {})}
              {...(onWallObjectModerate ? { onModerate: onWallObjectModerate } : {})}
              {...(onWallObjectFullscreen ? { onFullscreen: onWallObjectFullscreen } : {})}
            />
          );
        })}
    </group>
  );
}

const WallObjectSurface = memo(function WallObjectSurface({
  anchor,
  object,
  assetUrl,
  videoStream,
  audioStream,
  canManage,
  currentUserId,
  onControl,
  onRemove,
  onStopShare,
  onModerate,
  onFullscreen
}: {
  anchor: Anchor;
  object: WallObject;
  assetUrl?: string | undefined;
  videoStream?: MediaStream | null | undefined;
  audioStream?: MediaStream | null | undefined;
  canManage: boolean;
  currentUserId?: string | undefined;
  onControl?: (
    objectId: string,
    action: "play" | "pause" | "mute" | "unmute" | "seek" | "vote" | "close-poll" | "reopen-poll",
    positionSeconds?: number,
    choiceId?: string
  ) => void;
  onRemove?: (objectId: string) => void | Promise<void>;
  onStopShare?: (objectId: string) => void | Promise<void>;
  onModerate?: (objectId: string, action: "approve" | "reject") => void | Promise<void>;
  onFullscreen?: (objectId: string) => void;
}) {
  const normal = useMemo(() => new Vector3(anchor.normal.x, anchor.normal.y, anchor.normal.z).normalize(), [anchor.normal.x, anchor.normal.y, anchor.normal.z]);
  const right = useMemo(() => {
    if (Math.abs(anchor.normal.z) > 0.01) return new Vector3(1, 0, 0);
    return new Vector3(0, 0, anchor.normal.x > 0 ? -1 : 1);
  }, [anchor.normal.x, anchor.normal.z]);
  const rotation = useMemo<[number, number, number]>(() => {
    if (Math.abs(anchor.normal.x) > 0) return [0, anchor.normal.x > 0 ? Math.PI / 2 : -Math.PI / 2, 0];
    return [0, anchor.normal.z < 0 ? Math.PI : 0, 0];
  }, [anchor.normal.x, anchor.normal.z]);
  const placement = useMemo(() => constrainPlacement(object.placement), [object.placement]);
  const surfaceWidth = placement.width * anchor.width;
  const surfaceHeight = placement.height * anchor.height;
  const surfaceStyle = useMemo<WallObjectSurfaceStyle>(() => {
    const widthPx = (surfaceWidth * 400) / WALL_OBJECT_DISTANCE_FACTOR;
    const heightPx = (surfaceHeight * 400) / WALL_OBJECT_DISTANCE_FACTOR;
    return {
      width: `${widthPx}px`,
      height: `${heightPx}px`,
      "--wall-surface-font-size": `${clamp(heightPx * 0.28, 20, 96)}px`
    };
  }, [surfaceHeight, surfaceWidth]);
  const position = useMemo<[number, number, number]>(() => {
    const xOffset = (placement.x + placement.width / 2 - 0.5) * anchor.width;
    const yOffset = (0.5 - (placement.y + placement.height / 2)) * anchor.height;
    const layerOffset = clamp(placement.zIndex, 0, 6) * WALL_OBJECT_LAYER_OFFSET;
    const base = new Vector3(anchor.position.x, anchor.position.y, anchor.position.z)
      .add(right.clone().multiplyScalar(xOffset))
      .add(new Vector3(0, 1, 0).multiplyScalar(yOffset))
      .add(normal.clone().multiplyScalar(WALL_OBJECT_SURFACE_OFFSET + layerOffset));
    return [base.x, base.y, base.z];
  }, [anchor.height, anchor.position.x, anchor.position.y, anchor.position.z, anchor.width, normal, placement, right]);

  return (
    <group position={position} rotation={rotation}>
      <Html
        center
        transform
        distanceFactor={WALL_OBJECT_DISTANCE_FACTOR}
        className="wall-object-html wall-object-html--board"
        style={surfaceStyle}
        zIndexRange={[200, 0]}
      >
        <div className="wall-object-surface-mount">
          <WallObjectCard
            object={object}
            assetUrl={assetUrl}
            videoStream={videoStream}
            audioStream={audioStream}
            compact
            surface
            canManage={canManage}
            currentUserId={currentUserId}
            {...(onControl ? { onControl } : {})}
            {...(onRemove ? { onRemove } : {})}
            {...(onStopShare ? { onStopShare } : {})}
            {...(onModerate ? { onModerate } : {})}
            {...(onFullscreen ? { onFullscreen } : {})}
          />
        </div>
      </Html>
    </group>
  );
});

const PrivateCheckSurface = memo(function PrivateCheckSurface({
  anchor,
  checks
}: {
  anchor: Anchor;
  checks: ClassroomPrivateCheck[];
}) {
  const normal = useMemo(() => new Vector3(anchor.normal.x, anchor.normal.y, anchor.normal.z).normalize(), [anchor.normal.x, anchor.normal.y, anchor.normal.z]);
  const rotation = useMemo<[number, number, number]>(() => {
    if (Math.abs(anchor.normal.x) > 0) return [0, anchor.normal.x > 0 ? Math.PI / 2 : -Math.PI / 2, 0];
    return [0, anchor.normal.z < 0 ? Math.PI : 0, 0];
  }, [anchor.normal.x, anchor.normal.z]);
  const position = useMemo<[number, number, number]>(() => {
    const base = new Vector3(anchor.position.x, anchor.position.y, anchor.position.z).add(normal.clone().multiplyScalar(PRIVATE_CHECK_SURFACE_OFFSET));
    return [base.x, base.y, base.z];
  }, [anchor.position.x, anchor.position.y, anchor.position.z, normal]);
  const surfaceStyle = useMemo<WallObjectSurfaceStyle>(() => {
    const widthPx = ((anchor.width * 0.82) * 400) / WALL_OBJECT_DISTANCE_FACTOR;
    const heightPx = ((anchor.height * 0.44) * 400) / WALL_OBJECT_DISTANCE_FACTOR;
    return {
      width: `${widthPx}px`,
      height: `${heightPx}px`,
      "--wall-surface-font-size": `${clamp(heightPx * 0.24, 18, 56)}px`
    };
  }, [anchor.height, anchor.width]);
  const check = checks[0]!;

  return (
    <group position={position} rotation={rotation}>
      <Html center transform distanceFactor={WALL_OBJECT_DISTANCE_FACTOR} className="private-check-html" style={surfaceStyle} zIndexRange={[220, 0]}>
        <div className="private-check-board-card">
          <span className="private-check-board-kicker">Active check</span>
          <strong>{check.question}</strong>
          <span>{check.promptType === "multiple-choice" ? "Choose an answer in the checks panel." : check.promptType === "confidence" ? "Rate confidence in the checks panel." : "Respond in the checks panel."}</span>
          {checks.length > 1 ? <em>+{checks.length - 1} more open check{checks.length === 2 ? "" : "s"}</em> : null}
        </div>
      </Html>
    </group>
  );
});

function FollowLocalAvatarCamera({
  participants,
  localParticipantId,
  cameraYawRef,
  cameraPitchRef,
  firstPerson
}: {
  participants: ParticipantView[];
  localParticipantId: string;
  cameraYawRef: MutableRefObject<number>;
  cameraPitchRef: MutableRefObject<number>;
  firstPerson: boolean;
}) {
  const { camera } = useThree();
  const desiredPosition = useMemo(() => new Vector3(), []);
  const lookAtTarget = useMemo(() => new Vector3(), []);
  const localParticipant = participants.find((participant) => participant.id === localParticipantId || participant.local);
  const followDistance = 2.85;
  const lookAtHeight = 1.08;
  const eyeHeight = 1.5;

  useFrame(() => {
    if (!localParticipant) return;

    const { position } = localParticipant.state;
    const avatarY = position.y ?? 0;
    const yaw = cameraYawRef.current;
    const pitch = cameraPitchRef.current;

    if (firstPerson) {
      camera.position.set(position.x, avatarY + eyeHeight, position.z);
      // Positive pitch tilts the camera arm up in third-person (looking down), so invert for look direction.
      lookAtTarget.set(
        position.x + Math.sin(yaw),
        avatarY + eyeHeight - Math.sin(pitch),
        position.z + Math.cos(yaw)
      );
    } else {
      const horizontalDistance = followDistance * Math.cos(pitch);
      // Clamp height so the camera never clips through the floor tier the avatar stands on.
      const height = Math.max(avatarY + 0.25, avatarY + lookAtHeight + followDistance * Math.sin(pitch));

      desiredPosition.set(
        position.x - Math.sin(yaw) * horizontalDistance,
        height,
        position.z - Math.cos(yaw) * horizontalDistance
      );
      lookAtTarget.set(position.x, avatarY + lookAtHeight, position.z);
      camera.position.copy(desiredPosition);
    }

    camera.lookAt(lookAtTarget);
  });

  return null;
}

/**
 * Renders one seating tier as a trapezoidal prism with a ~74° angled front riser
 * instead of a vertical face, giving a theater-seat look rather than a concrete block.
 */
/** Renders sky color, optional fog, and lights driven by the active WorldSkin. */
function SceneAtmosphere() {
  const { activeLighting } = useWorldSkinContext();
  const l = activeLighting ?? DEFAULT_LIGHTING;
  const bg = activeLighting?.backgroundColor ?? DEFAULT_BACKGROUND;

  return (
    <>
      <color attach="background" args={[bg]} />
      {l.fogColor !== undefined ? (
        <fog attach="fog" args={[l.fogColor, l.fogNear ?? 20, l.fogFar ?? 60]} />
      ) : null}
      {l.hemisphereSkyColor !== undefined ? (
        <hemisphereLight
          args={[
            l.hemisphereSkyColor as string,
            (l.hemisphereGroundColor ?? "#000000") as string,
            l.hemisphereIntensity ?? 1
          ]}
        />
      ) : (
        <ambientLight color={l.ambientColor} intensity={l.ambientIntensity} />
      )}
      <directionalLight
        color={l.directionalColor}
        intensity={l.directionalIntensity}
        position={l.directionalPosition}
      />
    </>
  );
}

function TierMesh({
  tier,
  prevFloorY,
  roomWidth,
  color,
  roughness = 0.92,
  onMoveToPoint
}: {
  tier: { minZ: number; maxZ: number; floorY: number };
  prevFloorY: number;
  roomWidth: number;
  color: string;
  roughness?: number;
  onMoveToPoint(point: { x: number; z: number }): void;
}) {
  const geometry = useMemo(() => {
    const hw = roomWidth / 2;
    const rh = tier.floorY - prevFloorY;
    // Bevel the front riser face at ~28% of rise height → ~74° face angle
    const bevel = rh * 0.28;

    // 8 vertices: left face (v0-v3) then right face (v4-v7)
    //   v0/v4 = bottom-front (inset by bevel)
    //   v1/v5 = top-front
    //   v2/v6 = top-back
    //   v3/v7 = bottom-back
    const pos = new Float32Array([
      -hw, prevFloorY, tier.minZ - bevel,  // 0
      -hw, tier.floorY, tier.minZ,          // 1
      -hw, tier.floorY, tier.maxZ,          // 2
      -hw, prevFloorY, tier.maxZ,           // 3
       hw, prevFloorY, tier.minZ - bevel,  // 4
       hw, tier.floorY, tier.minZ,          // 5
       hw, tier.floorY, tier.maxZ,          // 6
       hw, prevFloorY, tier.maxZ,           // 7
    ]);

    const idx = new Uint16Array([
      1, 2, 6,   1, 6, 5,   // top face    (+y)
      0, 1, 5,   0, 5, 4,   // front riser (−z/+y angled)
      2, 3, 7,   2, 7, 6,   // back face   (+z)
      0, 2, 1,   0, 3, 2,   // left cap    (−x)
      4, 5, 6,   4, 6, 7,   // right cap   (+x)
      0, 4, 7,   0, 7, 3,   // bottom face (−y)
    ]);

    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    return geo;
  }, [tier, prevFloorY, roomWidth]);

  return (
    <mesh
      geometry={geometry}
      receiveShadow
      onClick={(event) => {
        event.stopPropagation();
        onMoveToPoint({ x: event.point.x, z: event.point.z });
      }}
    >
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

function RoomGeometry({
  manifest,
  onMoveToPoint,
  wallObjects,
  spotlightAnchorId
}: {
  manifest: RoomManifest;
  onMoveToPoint(point: { x: number; z: number }): void;
  wallObjects: WallObject[];
  spotlightAnchorId?: string | undefined;
}) {
  const anchorsWithObjects = useMemo(
    () => new Set(wallObjects.filter((object) => object.status !== "removed").map((object) => object.wallAnchorId)),
    [wallObjects]
  );

  // ── Skin context ────────────────────────────────────────────────────────────
  const { skin, panoramaUrl } = useWorldSkinContext();
  const { gl } = useThree();

  // Load the panorama texture once per skin, dispose on change.
  const [panoramaTexture, setPanoramaTexture] = useState<Texture | null>(null);
  useEffect(() => {
    if (!panoramaUrl) {
      setPanoramaTexture(null);
      return;
    }
    let cancelled = false;
    const loader = new TextureLoader();
    loader.load(
      panoramaUrl,
      (t) => {
        if (cancelled) { t.dispose(); return; }
        t.colorSpace = SRGBColorSpace;
        t.wrapS = ClampToEdgeWrapping;
        t.wrapT = ClampToEdgeWrapping;
        t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        setPanoramaTexture(t);
      },
      undefined,
      () => { /* fail-open: wall falls back to solid color */ }
    );
    return () => {
      cancelled = true;
      setPanoramaTexture((prev) => { prev?.dispose(); return null; });
    };
  }, [panoramaUrl, gl]);

  // Load the floor texture (textureStorageKey), dispose on change.
  const floorTextureUrl = skin?.overrides.floor?.textureStorageKey ?? null;
  const [floorTexture, setFloorTexture] = useState<Texture | null>(null);
  useEffect(() => {
    if (!floorTextureUrl) {
      setFloorTexture(null);
      return;
    }
    let cancelled = false;
    const loader = new TextureLoader();
    loader.load(
      floorTextureUrl,
      (t) => {
        if (cancelled) { t.dispose(); return; }
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        setFloorTexture(t);
      },
      undefined,
      () => { /* fail-open: floor falls back to solid color */ }
    );
    return () => {
      cancelled = true;
      setFloorTexture((prev) => { prev?.dispose(); return null; });
    };
  }, [floorTextureUrl, gl]);

  const floorColor = skin?.overrides.floor?.colorHex ?? "#d8c99f";
  const floorRoughness = skin?.overrides.floor?.roughness ?? 0.92;
  const tierOverride = skin?.overrides.tiers;
  const defaultTierColors = ["#cac0a2", "#bfb498"] as const;

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          onMoveToPoint({ x: event.point.x, z: event.point.z });
        }}
      >
        <planeGeometry args={[manifest.dimensions.width, manifest.dimensions.depth]} />
        <meshStandardMaterial
          color={floorTexture ? "#ffffff" : floorColor}
          map={floorTexture ?? null}
          roughness={floorRoughness}
        />
      </mesh>
      <gridHelper
        args={[Math.max(manifest.dimensions.width, manifest.dimensions.depth), 24, "#4c6b58", "#31473b"]}
        position={[0, 0.01, 0]}
      />
      {/* Raised tier platforms with angled front risers for a theater-seat appearance */}
      {manifest.tiers?.map((tier, i) => {
        const prevFloorY = i === 0 ? 0 : manifest.tiers![i - 1]!.floorY;
        const color = tierOverride?.colorHex ?? defaultTierColors[i % defaultTierColors.length]!;
        const roughness = tierOverride?.roughness ?? 0.92;
        return (
          <TierMesh
            key={`tier-${i}`}
            tier={tier}
            prevFloorY={prevFloorY}
            roomWidth={manifest.dimensions.width}
            color={color}
            roughness={roughness}
            onMoveToPoint={onMoveToPoint}
          />
        );
      })}
      {manifest.walls.map((wall) => {
        const slice = skin?.overrides.panoramaWall?.slices[wall.id as keyof typeof skin.overrides.panoramaWall.slices] ?? null;
        const wallColorFallback = skin?.overrides.walls[wall.id]?.colorHex ?? null;
        return (
          <WallMesh
            key={wall.id}
            wall={wall}
            panoramaTexture={panoramaTexture}
            slice={slice}
            skinWallColor={wallColorFallback}
          />
        );
      })}
      {manifest.wallAnchors.map((anchor) => (
        <AnchorMesh
          key={anchor.id}
          anchor={anchor}
          showLabel={!anchorsWithObjects.has(anchor.id)}
          spotlighted={anchor.id === spotlightAnchorId}
        />
      ))}
      {manifest.spawnPoints.map((spawn) => (
        <mesh
          key={spawn.id}
          position={[spawn.position.x, (spawn.position.y ?? 0) + 0.03, spawn.position.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.22, 0.3, 24]} />
          <meshBasicMaterial color="#eb5e28" transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  );
}

type WallPlane = {
  point: Vector3;
  normal: Vector3;
};

function wallPlane(wall: Wall): WallPlane {
  const midpoint = new Vector3(
    (wall.start.x + wall.end.x) / 2,
    wall.height / 2,
    (wall.start.z + wall.end.z) / 2
  );
  const spanZ = Math.abs(wall.end.z - wall.start.z);

  if (spanZ < 0.01) {
    return { point: midpoint, normal: new Vector3(0, 0, midpoint.z < 0 ? 1 : -1) };
  }

  return { point: midpoint, normal: new Vector3(midpoint.x < 0 ? 1 : -1, 0, 0) };
}

function wallOpacityFromCameraDistance(signedDistance: number) {
  if (signedDistance >= 2) return 1;
  if (signedDistance >= 0) return 0.18 + (signedDistance / 2) * 0.82;
  return Math.max(0.06, 0.16 + signedDistance * 0.55);
}

function WallMesh({
  wall,
  panoramaTexture,
  slice,
  skinWallColor
}: {
  wall: Wall;
  panoramaTexture?: Texture | null;
  slice?: { u0: number; u1: number; v1: number } | null;
  skinWallColor?: string | null;
}) {
  const { camera } = useThree();
  const materialRef = useRef<MeshStandardMaterial | null>(null);
  const plane = useMemo(() => wallPlane(wall), [wall]);
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
  const midpoint = [(wall.start.x + wall.end.x) / 2, wall.height / 2, (wall.start.z + wall.end.z) / 2] as const;
  const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
  const cameraOffset = useMemo(() => new Vector3(), []);

  // Clone the shared panorama texture per wall with wall-specific UV offset/repeat.
  // Cloning shares the same GPU resource (no extra upload) — only the UV transform differs.
  const wallTexture = useMemo(() => {
    if (!panoramaTexture || !slice) return null;
    const t = panoramaTexture.clone();
    t.needsUpdate = true;
    t.offset.set(slice.u0, 0);
    t.repeat.set(slice.u1 - slice.u0, slice.v1);
    return t;
  }, [panoramaTexture, slice?.u0, slice?.u1, slice?.v1]);

  // Dispose the per-wall clone when it's replaced or the component unmounts.
  useEffect(() => {
    return () => { wallTexture?.dispose(); };
  }, [wallTexture]);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;

    const signedDistance = cameraOffset.copy(camera.position).sub(plane.point).dot(plane.normal);
    const opacity = wallOpacityFromCameraDistance(signedDistance);
    material.opacity = opacity;
    material.transparent = opacity < 0.995;
    material.depthWrite = opacity > 0.85;
  });

  // When a panorama texture is present use white base color (texture provides the color).
  const baseColor = wallTexture ? "#ffffff" : (skinWallColor ?? "#8ea487");

  return (
    <mesh position={midpoint} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, wall.height, 0.12]} />
      <meshStandardMaterial
        ref={materialRef}
        color={baseColor}
        map={wallTexture ?? null}
        roughness={0.85}
        transparent
        opacity={1}
      />
    </mesh>
  );
}

function AnchorMesh({ anchor, showLabel, spotlighted }: { anchor: Anchor; showLabel: boolean; spotlighted?: boolean }) {
  const { camera } = useThree();
  const materialRef = useRef<MeshStandardMaterial | null>(null);
  const plane = useMemo(
    () => ({
      point: new Vector3(anchor.position.x, anchor.position.y, anchor.position.z),
      normal: new Vector3(anchor.normal.x, anchor.normal.y, anchor.normal.z).normalize()
    }),
    [anchor.normal.x, anchor.normal.y, anchor.normal.z, anchor.position.x, anchor.position.y, anchor.position.z]
  );
  const cameraOffset = useMemo(() => new Vector3(), []);
  const rotation = useMemo<[number, number, number]>(() => {
    if (Math.abs(anchor.normal.x) > 0) return [0, anchor.normal.x > 0 ? Math.PI / 2 : -Math.PI / 2, 0];
    return [0, anchor.normal.z < 0 ? Math.PI : 0, 0];
  }, [anchor.normal.x, anchor.normal.z]);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;
    const signedDistance = cameraOffset.copy(camera.position).sub(plane.point).dot(plane.normal);
    const opacity = wallOpacityFromCameraDistance(signedDistance);
    material.opacity = opacity;
    material.transparent = opacity < 0.995;
    material.depthWrite = opacity > 0.85;
  });

  const w = anchor.width;
  const h = anchor.height;
  const BORDER = 0.05;
  const BZ = 0.022;

  return (
    <group position={[anchor.position.x, anchor.position.y, anchor.position.z]} rotation={rotation}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#263b31"
          emissive="#111c17"
          emissiveIntensity={1}
          roughness={0.6}
          transparent
          opacity={1}
        />
      </mesh>
      {spotlighted ? (
        <>
          <mesh position={[0, h / 2 + BORDER, BZ]}>
            <boxGeometry args={[w + BORDER * 4, BORDER * 2, 0.008]} />
            <meshBasicMaterial color="#f1c40f" />
          </mesh>
          <mesh position={[0, -(h / 2 + BORDER), BZ]}>
            <boxGeometry args={[w + BORDER * 4, BORDER * 2, 0.008]} />
            <meshBasicMaterial color="#f1c40f" />
          </mesh>
          <mesh position={[-(w / 2 + BORDER), 0, BZ]}>
            <boxGeometry args={[BORDER * 2, h, 0.008]} />
            <meshBasicMaterial color="#f1c40f" />
          </mesh>
          <mesh position={[w / 2 + BORDER, 0, BZ]}>
            <boxGeometry args={[BORDER * 2, h, 0.008]} />
            <meshBasicMaterial color="#f1c40f" />
          </mesh>
        </>
      ) : null}
      {showLabel ? (
        <Html center transform distanceFactor={8} className="wall-anchor-label-html">
          <div className={`wall-anchor-label${spotlighted ? " wall-anchor-label--spotlight" : ""}`}>{anchor.label}</div>
        </Html>
      ) : null}
    </group>
  );
}
