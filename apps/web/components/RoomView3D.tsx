"use client";

import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import { memo, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  DoubleSide,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type Group,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  Vector3
} from "three";
import { useWorldSkinContext, DEFAULT_LIGHTING, DEFAULT_BACKGROUND } from "./worldSkins/SkinLayer";
import { DYNAMIC_WALL_ANCHOR_MIN_HEIGHT_M } from "@3dspace/contracts";
import type {
  AvatarAppearance,
  AvatarReactionSlug,
  BuildPiece,
  BuildPieceEdge,
  BuildPieceKind,
  BuildPieceMaterial,
  BuildPieceRotation,
  ClassroomGroup,
  ClassroomPrivateCheck,
  ClassroomSpotlight,
  CreateDynamicWallAnchorRequest,
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
import { BuildPlacementController } from "./BuildPlacementController";
import type { BuildModeController } from "../lib/useBuildMode";
import { WallObjectCard } from "./WallObjectCard";
import { SharedBrowserWallSurface } from "./SharedBrowser/SharedBrowserWallSurface";
import type { WhiteboardController } from "../lib/useWhiteboards";
import type { SharedBrowserController } from "../lib/useSharedBrowser";
import type { ApiIdentity } from "../lib/identity";
import {
  useWallObjectHtmlResolutionScale,
  WALL_OBJECT_DISTANCE_FACTOR,
  wallObjectSurfacePixelSize
} from "../lib/wallObjectSurface";
import { boardPlacementWalls, FFA_MAIN_RADIUS, FFA_WALL_HEIGHT, FFA_WALL_THICKNESS, FFA_EXIT_HALF_ARC, FFA_PERIMETER_SEGMENTS } from "@3dspace/room-engine";

type Wall = z.infer<typeof WallPlaneSchema>;
type Anchor = z.infer<typeof WallAnchorSchema>;
type ConstrainedPlacement = Pick<WallObjectPlacement, "x" | "y" | "width" | "height" | "zIndex" | "fit">;
type WallObjectSurfaceStyle = CSSProperties & { "--wall-surface-font-size": string };
const WALL_OBJECT_SURFACE_OFFSET = 0.045;
const WALL_OBJECT_LAYER_OFFSET = 0.002;
const PRIVATE_CHECK_SURFACE_OFFSET = 0.038;
const WALL_ANCHOR_LABEL_OFFSET = 0.03;
const WALL_ANCHOR_SURFACE_OFFSET = 0.04;
const WALL_SURFACE_MIN_VISIBLE_DISTANCE = 0.02;
const WALL_SURFACE_SELF_OCCLUSION_DISTANCE = 0.45;
const WALL_INTERSECTION_EPSILON = 0.0001;
export const DYNAMIC_BOARD_DEFAULT_WIDTH = 8.0;
export const DYNAMIC_BOARD_DEFAULT_HEIGHT = 5.0;
const DYNAMIC_BOARD_WALL_INSET = 0.1;
const DYNAMIC_BOARD_ACCEPTS: CreateDynamicWallAnchorRequest["accepts"] = [
  "image",
  "video",
  "audio",
  "image.file",
  "video.file",
  "audio.file",
  "camera.live",
  "microphone.live",
  "browser-tab.live",
  "web.browser.shared",
  "web.embed",
  "web.link",
  "whiteboard",
  "note",
  "poll",
  "timer"
];

type DynamicBoardPlacementConfig = {
  active: boolean;
  busy?: boolean;
  boardSize: { width: number; height: number };
  onPlace(body: CreateDynamicWallAnchorRequest): void | Promise<void>;
};

type BuildSceneConfig = {
  roomId: string;
  userId: string;
  buildMode: BuildModeController;
  pieces: BuildPiece[];
  piecesById: Record<string, BuildPiece>;
  actions: {
    place(
      kind: BuildPieceKind,
      cell: { ix: number; iz: number },
      level: number,
      edge?: BuildPieceEdge,
      rotation?: BuildPieceRotation,
      materialId?: BuildPieceMaterial
    ): Promise<unknown>;
    placeBatch(
      placements: Array<{
        kind: BuildPieceKind;
        cell: { ix: number; iz: number };
        level: number;
        edge?: BuildPieceEdge;
        rotation?: BuildPieceRotation;
        materialId?: BuildPieceMaterial;
      }>
    ): Promise<unknown>;
    destroy(pieceId: string): Promise<unknown>;
  };
  onStatus?(message: string): void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function anchorYaw(normal: { x: number; z: number }) {
  return Math.atan2(normal.x, normal.z);
}

function cross2D(ax: number, az: number, bx: number, bz: number) {
  return ax * bz - az * bx;
}

function pointToWallSegmentDistanceSq(point: Vector3, wall: Wall) {
  const sx = wall.start.x;
  const sz = wall.start.z;
  const ex = wall.end.x;
  const ez = wall.end.z;
  const dx = ex - sx;
  const dz = ez - sz;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= WALL_INTERSECTION_EPSILON) {
    const px = point.x - sx;
    const pz = point.z - sz;
    return px * px + pz * pz;
  }
  const t = clamp(((point.x - sx) * dx + (point.z - sz) * dz) / lengthSq, 0, 1);
  const nearestX = sx + dx * t;
  const nearestZ = sz + dz * t;
  const px = point.x - nearestX;
  const pz = point.z - nearestZ;
  return px * px + pz * pz;
}

function wallIntersectionTOnLineOfSight(from: Vector3, to: Vector3, wall: Wall) {
  const rx = to.x - from.x;
  const rz = to.z - from.z;
  const sx = wall.end.x - wall.start.x;
  const sz = wall.end.z - wall.start.z;
  const denominator = cross2D(rx, rz, sx, sz);
  if (Math.abs(denominator) <= WALL_INTERSECTION_EPSILON) return null;

  const qpx = wall.start.x - from.x;
  const qpz = wall.start.z - from.z;
  const t = cross2D(qpx, qpz, sx, sz) / denominator;
  const u = cross2D(qpx, qpz, rx, rz) / denominator;
  if (t <= WALL_INTERSECTION_EPSILON || t >= 1 - WALL_INTERSECTION_EPSILON || u < 0 || u > 1) return null;
  return t;
}

function wallBlocksOverlayLineOfSight(from: Vector3, to: Vector3, anchor: Anchor, wall: Wall) {
  if (wall.passable) return false;
  if (wall.anchorIds.includes(anchor.id)) return false;

  const selfOcclusionDistanceSq = WALL_SURFACE_SELF_OCCLUSION_DISTANCE * WALL_SURFACE_SELF_OCCLUSION_DISTANCE;
  if (pointToWallSegmentDistanceSq(to, wall) <= selfOcclusionDistanceSq) return false;

  const intersectionT = wallIntersectionTOnLineOfSight(from, to, wall);
  if (intersectionT === null) return false;

  const intersectionY = from.y + (to.y - from.y) * intersectionT;
  const wallBottomY = Math.min(wall.start.y, wall.end.y);
  const wallTopY = wallBottomY + wall.height;
  return intersectionY >= wallBottomY - WALL_SURFACE_SELF_OCCLUSION_DISTANCE && intersectionY <= wallTopY + WALL_SURFACE_SELF_OCCLUSION_DISTANCE;
}

/** Keep Drei Html board overlays below room HUD (z-index 18–20). */
const WALL_OBJECT_HTML_Z_INDEX_RANGE: [number, number] = [15, 0];

function wallSurfaceVisibleFromCamera(cameraPosition: Vector3, target: Vector3, anchor: Anchor, normal: Vector3, walls: Wall[]) {
  const signedDistance = cameraPosition.clone().sub(
    new Vector3(anchor.position.x, anchor.position.y, anchor.position.z)
  ).dot(normal);
  if (signedDistance <= WALL_SURFACE_MIN_VISIBLE_DISTANCE) return false;
  return !walls.some((wall) => wallBlocksOverlayLineOfSight(cameraPosition, target, anchor, wall));
}

function useOverlayVisibility(computeVisible: () => boolean) {
  const [visible, setVisible] = useState(true);
  const visibleRef = useRef(true);

  useFrame(() => {
    const nextVisible = computeVisible();
    if (nextVisible === visibleRef.current) return;
    visibleRef.current = nextVisible;
    setVisible(nextVisible);
  });

  return visible;
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
  recordingActive = false,
  activeHelpRequestUserIds,
  onSelfClick,
  localWaveTriggered = false,
  onLocalWaveComplete,
  onWallObjectControl,
  onWallObjectRemove,
  onWallObjectStopShare,
  onWallObjectModerate,
  onWallObjectFullscreen,
  whiteboardController,
  whiteboardParticipantNames,
  canWriteWhiteboard,
  sharedBrowserController,
  sharedBrowserIdentity,
  sharedBrowserRoomId,
  dynamicBoardPlacement,
  hallpassZone,
  dynamicWallAnchors,
  roomObjects,
  roomObjectTemplatesById,
  roomObjectGrabs,
  myActiveRoomObjectGrabId,
  roomObjectRole,
  roomObjectCurrentUserId,
  roomObjectMemberGroupIds,
  selectedRoomObjectId,
  onSelectRoomObject,
  roomObjectActions,
  buildScene
}: {
  manifest: RoomManifest;
  dynamicWallAnchors?: Anchor[];
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
  recordingActive?: boolean;
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
  whiteboardController?: WhiteboardController;
  whiteboardParticipantNames?: Record<string, string>;
  canWriteWhiteboard?: (object: WallObject) => boolean;
  sharedBrowserController?: SharedBrowserController;
  sharedBrowserIdentity?: ApiIdentity;
  sharedBrowserRoomId?: string;
  dynamicBoardPlacement?: DynamicBoardPlacementConfig | null | undefined;
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
  buildScene?: BuildSceneConfig | null | undefined;
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
  const mergedManifest = useMemo(
    () => dynamicWallAnchors?.length
      ? { ...manifest, wallAnchors: [...manifest.wallAnchors, ...dynamicWallAnchors] }
      : manifest,
    [manifest, dynamicWallAnchors]
  );
  const boardPlacementWallSet = useMemo(
    () => boardPlacementWalls(manifest, buildScene?.pieces ?? []),
    [manifest, buildScene?.pieces]
  );
  const boardWalls = dynamicBoardPlacement?.active ? boardPlacementWallSet : manifest.walls;

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
        <RoomGeometry
          manifest={mergedManifest}
          onMoveToPoint={onMoveToPoint}
          wallObjects={wallObjects}
          spotlightAnchorId={spotlight?.anchorId}
          dynamicBoardPlacement={dynamicBoardPlacement}
          boardPlacementWalls={boardWalls}
          overlayOcclusionWalls={boardPlacementWallSet}
        />
        {roomObjects &&
        roomObjectTemplatesById &&
        roomObjectGrabs &&
        roomObjectRole &&
        roomObjectCurrentUserId &&
        roomObjectMemberGroupIds &&
        onSelectRoomObject &&
        roomObjectActions ? (
          <RoomObjectsLayer
            manifest={mergedManifest}
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
        {buildScene ? (
          <BuildPlacementController
            manifest={mergedManifest}
            roomId={buildScene.roomId}
            userId={buildScene.userId}
            buildMode={buildScene.buildMode}
            pieces={buildScene.pieces}
            piecesById={buildScene.piecesById}
            localAvatarPosition={localParticipantPosition ?? { x: 0, y: 0, z: 0 }}
            actions={buildScene.actions}
            {...(buildScene.onStatus ? { onStatus: buildScene.onStatus } : {})}
          />
        ) : null}
        <WallObjectLayer
          manifest={mergedManifest}
          wallObjects={wallObjects}
          overlayOcclusionWalls={boardPlacementWallSet}
          assetUrls={assetUrls}
          wallMediaStreams={wallMediaStreams}
          canManageWallObjects={canManageWallObjects}
          currentUserId={currentUserId}
          quality={quality}
          {...(onWallObjectControl ? { onWallObjectControl } : {})}
          {...(onWallObjectRemove ? { onWallObjectRemove } : {})}
          {...(onWallObjectStopShare ? { onWallObjectStopShare } : {})}
          {...(onWallObjectModerate ? { onWallObjectModerate } : {})}
          {...(onWallObjectFullscreen ? { onWallObjectFullscreen } : {})}
          {...(whiteboardController ? { whiteboardController } : {})}
          {...(whiteboardParticipantNames ? { whiteboardParticipantNames } : {})}
          {...(canWriteWhiteboard ? { canWriteWhiteboard } : {})}
          {...(sharedBrowserController ? { sharedBrowserController } : {})}
          {...(sharedBrowserIdentity ? { sharedBrowserIdentity } : {})}
          {...(sharedBrowserRoomId ? { sharedBrowserRoomId } : {})}
        />
        <GroupTargetLayer
          manifest={mergedManifest}
          groups={classroomGroups}
          podsEnabled={podsEnabled}
          podRadiusMeters={podRadiusMeters}
          drawPodPartitions={drawPodPartitions}
          {...(localParticipantPosition ? { localParticipantPosition } : {})}
          {...(getAudioMode ? { getAudioMode } : {})}
        />
        {hallpassZone ? <HallpassZoneMarker zone={hallpassZone} /> : null}
        <PrivateCheckLayer manifest={mergedManifest} privateChecks={privateChecks} />
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
                recordingActive={recordingActive}
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
        return <PrivateCheckSurface key={`private-check-${anchor.id}`} anchor={anchor} walls={manifest.walls} checks={checks} />;
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
  overlayOcclusionWalls,
  assetUrls,
  wallMediaStreams,
  canManageWallObjects,
  currentUserId,
  quality,
  onWallObjectControl,
  onWallObjectRemove,
  onWallObjectStopShare,
  onWallObjectModerate,
  onWallObjectFullscreen,
  whiteboardController,
  whiteboardParticipantNames,
  canWriteWhiteboard,
  sharedBrowserController,
  sharedBrowserIdentity,
  sharedBrowserRoomId
}: {
  manifest: RoomManifest;
  wallObjects: WallObject[];
  overlayOcclusionWalls: Wall[];
  assetUrls: Record<string, string>;
  wallMediaStreams: Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>;
  canManageWallObjects: boolean;
  currentUserId?: string | undefined;
  quality: QualityLevel;
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
  whiteboardController?: WhiteboardController;
  whiteboardParticipantNames?: Record<string, string>;
  canWriteWhiteboard?: (object: WallObject) => boolean;
  sharedBrowserController?: SharedBrowserController;
  sharedBrowserIdentity?: ApiIdentity;
  sharedBrowserRoomId?: string;
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
              walls={overlayOcclusionWalls}
              object={object}
              assetUrl={assetUrls[object.id]}
              videoStream={wallMediaStreams[object.id]?.videoStream}
              audioStream={wallMediaStreams[object.id]?.audioStream}
              canManage={canManageWallObjects}
              currentUserId={currentUserId}
              quality={quality}
              {...(onWallObjectControl ? { onControl: onWallObjectControl } : {})}
              {...(onWallObjectRemove ? { onRemove: onWallObjectRemove } : {})}
              {...(onWallObjectStopShare ? { onStopShare: onWallObjectStopShare } : {})}
              {...(onWallObjectModerate ? { onModerate: onWallObjectModerate } : {})}
              {...(onWallObjectFullscreen ? { onFullscreen: onWallObjectFullscreen } : {})}
              {...(whiteboardController ? { whiteboardController } : {})}
              {...(whiteboardParticipantNames ? { whiteboardParticipantNames } : {})}
              {...(canWriteWhiteboard ? { canWriteWhiteboard } : {})}
              {...(sharedBrowserController ? { sharedBrowserController } : {})}
              {...(sharedBrowserIdentity ? { sharedBrowserIdentity } : {})}
              {...(sharedBrowserRoomId ? { sharedBrowserRoomId } : {})}
            />
          );
        })}
    </group>
  );
}

const WallObjectSurface = memo(function WallObjectSurface({
  anchor,
  walls,
  object,
  assetUrl,
  videoStream,
  audioStream,
  canManage,
  currentUserId,
  quality,
  onControl,
  onRemove,
  onStopShare,
  onModerate,
  onFullscreen,
  whiteboardController,
  whiteboardParticipantNames,
  canWriteWhiteboard,
  sharedBrowserController,
  sharedBrowserIdentity,
  sharedBrowserRoomId
}: {
  anchor: Anchor;
  walls: Wall[];
  object: WallObject;
  assetUrl?: string | undefined;
  videoStream?: MediaStream | null | undefined;
  audioStream?: MediaStream | null | undefined;
  canManage: boolean;
  currentUserId?: string | undefined;
  quality: QualityLevel;
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
  whiteboardController?: WhiteboardController;
  whiteboardParticipantNames?: Record<string, string>;
  canWriteWhiteboard?: (object: WallObject) => boolean;
  sharedBrowserController?: SharedBrowserController;
  sharedBrowserIdentity?: ApiIdentity;
  sharedBrowserRoomId?: string;
}) {
  const { camera } = useThree();
  const normal = useMemo(() => new Vector3(anchor.normal.x, anchor.normal.y, anchor.normal.z).normalize(), [anchor.normal.x, anchor.normal.y, anchor.normal.z]);
  const right = useMemo(() => {
    const tangent = new Vector3(0, 1, 0).cross(normal);
    if (tangent.lengthSq() < 1e-6) return new Vector3(1, 0, 0);
    return tangent.normalize();
  }, [normal]);
  const rotation = useMemo<[number, number, number]>(() => {
    return [0, anchorYaw(anchor.normal), 0];
  }, [anchor.normal.x, anchor.normal.z]);
  const placement = useMemo(() => constrainPlacement(object.placement), [object.placement]);
  const hideHeader = anchor.metadata?.hideObjectHeader === true;
  const surfaceWidth = placement.width * anchor.width;
  const surfaceHeight = placement.height * anchor.height;
  const htmlResolutionScale = useWallObjectHtmlResolutionScale(quality);
  const effectiveResolutionScale =
    object.type === "web.browser.shared" ? Math.min(3, htmlResolutionScale + 0.5) : htmlResolutionScale;
  const displayAspectRatio = surfaceWidth / surfaceHeight;
  const surfaceStyle = useMemo<WallObjectSurfaceStyle>(() => {
    const { widthPx, heightPx, baseHeightPx } = wallObjectSurfacePixelSize(
      surfaceWidth,
      surfaceHeight,
      effectiveResolutionScale
    );
    const fontRatio = object.type === "poll" ? 0.18 : 0.28;
    const fontMax = object.type === "poll" ? 80 : 96;
    return {
      width: `${widthPx}px`,
      height: `${heightPx}px`,
      "--wall-surface-font-size": `${clamp(baseHeightPx * fontRatio, 20, fontMax) * effectiveResolutionScale}px`
    };
  }, [effectiveResolutionScale, object.type, surfaceHeight, surfaceWidth]);
  const mountStyle = useMemo<CSSProperties>(
    () => ({
      transform: `scale(${1 / effectiveResolutionScale})`,
      transformOrigin: "center center"
    }),
    [effectiveResolutionScale]
  );
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
  const targetPoint = useMemo(() => new Vector3(position[0], position[1], position[2]), [position]);
  const visible = useOverlayVisibility(() => wallSurfaceVisibleFromCamera(camera.position, targetPoint, anchor, normal, walls));
  const useSharedBrowserMesh =
    object.type === "web.browser.shared" &&
    Boolean(sharedBrowserController && sharedBrowserIdentity && sharedBrowserRoomId);

  if (useSharedBrowserMesh && sharedBrowserController) {
    return (
      <group position={position} rotation={rotation}>
        {visible ? (
          <SharedBrowserWallSurface
            object={object}
            controller={sharedBrowserController}
            surfaceWidth={surfaceWidth}
            surfaceHeight={surfaceHeight}
            displayAspectRatio={displayAspectRatio}
            embedVisible={visible}
            htmlResolutionScale={effectiveResolutionScale}
            {...(currentUserId ? { currentUserId } : {})}
          />
        ) : null}
      </group>
    );
  }

  return (
    <group position={position} rotation={rotation}>
      {visible ? (
        <Html
          center
          transform
          distanceFactor={WALL_OBJECT_DISTANCE_FACTOR}
          className="wall-object-html wall-object-html--board"
          style={surfaceStyle}
          zIndexRange={WALL_OBJECT_HTML_Z_INDEX_RANGE}
        >
          <div className="wall-object-surface-mount" style={mountStyle}>
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
              {...(whiteboardController ? { whiteboardController } : {})}
              {...(whiteboardParticipantNames ? { whiteboardParticipantNames } : {})}
              {...(canWriteWhiteboard ? { canWriteWhiteboard } : {})}
              {...(sharedBrowserController ? { sharedBrowserController } : {})}
              {...(sharedBrowserIdentity ? { sharedBrowserIdentity } : {})}
              {...(sharedBrowserRoomId ? { sharedBrowserRoomId } : {})}
              {...(object.type === "web.browser.shared"
                ? { hyperbeamEmbedVisible: visible, displayAspectRatio }
                : {})}
              hideHeader={hideHeader}
            />
          </div>
        </Html>
      ) : null}
    </group>
  );
});

const PrivateCheckSurface = memo(function PrivateCheckSurface({
  anchor,
  walls,
  checks
}: {
  anchor: Anchor;
  walls: Wall[];
  checks: ClassroomPrivateCheck[];
}) {
  const { camera } = useThree();
  const normal = useMemo(() => new Vector3(anchor.normal.x, anchor.normal.y, anchor.normal.z).normalize(), [anchor.normal.x, anchor.normal.y, anchor.normal.z]);
  const rotation = useMemo<[number, number, number]>(() => {
    return [0, anchorYaw(anchor.normal), 0];
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
  const targetPoint = useMemo(() => new Vector3(position[0], position[1], position[2]), [position]);
  const visible = useOverlayVisibility(() => wallSurfaceVisibleFromCamera(camera.position, targetPoint, anchor, normal, walls));

  return (
    <group position={position} rotation={rotation}>
      {visible ? (
        <Html center transform distanceFactor={WALL_OBJECT_DISTANCE_FACTOR} className="private-check-html" style={surfaceStyle} zIndexRange={[220, 0]}>
          <div className="private-check-board-card">
            <span className="private-check-board-kicker">Active check</span>
            <strong>{check.question}</strong>
            <span>{check.promptType === "multiple-choice" ? "Choose an answer in the checks panel." : check.promptType === "confidence" ? "Rate confidence in the checks panel." : "Respond in the checks panel."}</span>
            {checks.length > 1 ? <em>+{checks.length - 1} more open check{checks.length === 2 ? "" : "s"}</em> : null}
          </div>
        </Html>
      ) : null}
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

const TIER_WOOD_SKIRT = "#6d5340";
const TIER_WOOD_NOSING = "#8f7048";
const FLOOR_TILE_REPEAT_PER_M = 0.4;

function floorTileRepeat(width: number, depth: number): [number, number] {
  return [width * FLOOR_TILE_REPEAT_PER_M, depth * FLOOR_TILE_REPEAT_PER_M];
}

function configureFloorTileTexture(
  texture: Texture,
  width: number,
  depth: number,
  gl: { capabilities: { getMaxAnisotropy(): number } }
) {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...floorTileRepeat(width, depth));
  texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
}

function worldFloorUv(x: number, z: number, roomWidth: number, roomDepth: number): [number, number] {
  return [(x + roomWidth / 2) * FLOOR_TILE_REPEAT_PER_M, (z + roomDepth / 2) * FLOOR_TILE_REPEAT_PER_M];
}

/** Theater terrace profile: gentle front riser, wood skirt, tiled deck when textured. */
function buildTierGeometry(
  tier: { minZ: number; maxZ: number; floorY: number },
  prevFloorY: number,
  roomWidth: number,
  roomDepth: number
) {
  const hw = roomWidth / 2;
  const rh = tier.floorY - prevFloorY;
  const bevel = rh * 0.35;

  const pos = new Float32Array([
    -hw, prevFloorY, tier.minZ - bevel,
    -hw, tier.floorY, tier.minZ,
    -hw, tier.floorY, tier.maxZ,
    -hw, prevFloorY, tier.maxZ,
    hw, prevFloorY, tier.minZ - bevel,
    hw, tier.floorY, tier.minZ,
    hw, tier.floorY, tier.maxZ,
    hw, prevFloorY, tier.maxZ
  ]);

  const uv = new Float32Array(8 * 2);
  for (let i = 0; i < 8; i++) {
    const [u, v] = worldFloorUv(pos[i * 3]!, pos[i * 3 + 2]!, roomWidth, roomDepth);
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }

  const idx = new Uint16Array([
    1, 2, 6, 1, 6, 5,
    0, 1, 5, 0, 5, 4,
    2, 3, 7, 2, 7, 6,
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 4, 7, 0, 7, 3
  ]);

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("uv", new BufferAttribute(uv, 2));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.clearGroups();
  geo.addGroup(0, 6, 0);
  geo.addGroup(6, idx.length - 6, 1);
  geo.computeVertexNormals();
  return geo;
}

function floorDoubleClickHandler(onMoveToPoint: (point: { x: number; z: number }) => void) {
  return (event: { stopPropagation(): void; point: { x: number; z: number } }) => {
    event.stopPropagation();
    onMoveToPoint({ x: event.point.x, z: event.point.z });
  };
}

function TierStepNosing({
  tier,
  roomWidth,
  onMoveToPoint
}: {
  tier: { minZ: number; maxZ: number; floorY: number };
  roomWidth: number;
  onMoveToPoint(point: { x: number; z: number }): void;
}) {
  const inset = 0.35;
  return (
    <mesh
      position={[0, tier.floorY + 0.018, tier.minZ + 0.07]}
      receiveShadow
      onDoubleClick={floorDoubleClickHandler(onMoveToPoint)}
    >
      <boxGeometry args={[roomWidth - inset * 2, 0.055, 0.11]} />
      <meshStandardMaterial color={TIER_WOOD_NOSING} roughness={0.72} metalness={0.02} />
    </mesh>
  );
}

function TierMesh({
  tier,
  prevFloorY,
  roomWidth,
  roomDepth,
  color,
  roughness = 0.92,
  onMoveToPoint
}: {
  tier: { minZ: number; maxZ: number; floorY: number };
  prevFloorY: number;
  roomWidth: number;
  roomDepth: number;
  color: string;
  roughness?: number;
  onMoveToPoint(point: { x: number; z: number }): void;
}) {
  const geometry = useMemo(
    () => buildTierGeometry(tier, prevFloorY, roomWidth, roomDepth),
    [tier, prevFloorY, roomWidth, roomDepth]
  );

  return (
    <group>
      <mesh geometry={geometry} receiveShadow onDoubleClick={floorDoubleClickHandler(onMoveToPoint)}>
        <meshStandardMaterial attach="material-0" color={color} roughness={roughness} />
        <meshStandardMaterial attach="material-1" color={TIER_WOOD_SKIRT} roughness={0.86} metalness={0.02} />
      </mesh>
      <TierStepNosing tier={tier} roomWidth={roomWidth} onMoveToPoint={onMoveToPoint} />
    </group>
  );
}

function TierMeshTextured({
  tier,
  prevFloorY,
  roomWidth,
  roomDepth,
  textureUrl,
  skirtColor = TIER_WOOD_SKIRT,
  roughness = 0.92,
  onMoveToPoint
}: {
  tier: { minZ: number; maxZ: number; floorY: number };
  prevFloorY: number;
  roomWidth: number;
  roomDepth: number;
  textureUrl: string;
  skirtColor?: string;
  roughness?: number;
  onMoveToPoint(point: { x: number; z: number }): void;
}) {
  const { gl } = useThree();
  const texture = useLoader(TextureLoader, textureUrl);
  const geometry = useMemo(
    () => buildTierGeometry(tier, prevFloorY, roomWidth, roomDepth),
    [tier, prevFloorY, roomWidth, roomDepth]
  );

  const deckTexture = useMemo(() => {
    const clone = texture.clone();
    configureFloorTileTexture(clone, roomWidth, roomDepth, gl);
    return clone;
  }, [texture, roomWidth, roomDepth, gl]);

  useEffect(() => () => deckTexture.dispose(), [deckTexture]);

  return (
    <group>
      <mesh geometry={geometry} receiveShadow onDoubleClick={floorDoubleClickHandler(onMoveToPoint)}>
        <meshStandardMaterial attach="material-0" map={deckTexture} roughness={roughness} />
        <meshStandardMaterial attach="material-1" color={skirtColor} roughness={0.86} metalness={0.02} />
      </mesh>
      <TierStepNosing tier={tier} roomWidth={roomWidth} onMoveToPoint={onMoveToPoint} />
    </group>
  );
}

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
        <>
          <hemisphereLight
            args={[
              l.hemisphereSkyColor as string,
              (l.hemisphereGroundColor ?? "#000000") as string,
              l.hemisphereIntensity ?? 1
            ]}
          />
          <ambientLight color={l.ambientColor} intensity={l.ambientIntensity} />
        </>
      ) : (
        <ambientLight color={l.ambientColor} intensity={l.ambientIntensity} />
      )}
      <directionalLight
        color={l.directionalColor}
        intensity={l.directionalIntensity}
        position={l.directionalPosition}
      />
      {l.directionalFillIntensity !== undefined && l.directionalFillIntensity > 0 ? (
        <directionalLight
          color={(l.directionalFillColor ?? l.directionalColor) as string}
          intensity={l.directionalFillIntensity}
          position={(l.directionalFillPosition ?? [0, 10, 14]) as [number, number, number]}
        />
      ) : null}
    </>
  );
}

// Renders 4 solid arc sections forming the circular FFA main hub perimeter wall,
// with gaps at the 4 cardinal exits. Each section is a closed prism: outer + inner
// cylindrical surfaces, top + bottom ring caps, and end caps at each exit edge.
//
// Angle convention — Three.js CylinderGeometry u-space (CCW from +Z when viewed
// from above):  South(+Z)=0, East(+X)=π/2, North(-Z)=π, West(-X)=3π/2
//
// FFA_EXIT_HALF_ARC = hall_width / (2 * radius), so the visual gap exactly aligns
// with the hall side walls.
//
// RingGeometry (XY plane) is rotated -π/2 around X to lay flat in XZ.
// Under that rotation, ring thetaStart = cylinderThetaStart − π/2.
//
// PlaneGeometry end caps use rotation.y = theta − π/2 so local-X spans radially
// (inner→outer) and local-Y spans vertically (floor→ceiling).
function PerimeterCylinder({ color }: { color: string }) {
  const halfT = FFA_WALL_THICKNESS / 2;
  const outerR = FFA_MAIN_RADIUS + halfT;
  const innerR = FFA_MAIN_RADIUS - halfT;
  const halfGap = FFA_EXIT_HALF_ARC; // aligns cylinder gap with hall side walls
  const arcLength = Math.PI / 2 - 2 * halfGap;
  const arcStarts = [
    halfGap,
    Math.PI / 2 + halfGap,
    Math.PI + halfGap,
    (3 * Math.PI) / 2 + halfGap
  ];

  return (
    <>
      {arcStarts.map((start, i) => {
        const arcEnd = start + arcLength;
        const ringStart = start - Math.PI / 2;
        return (
          <group key={i} position={[0, FFA_WALL_HEIGHT / 2, 0]}>
            {/* Outer cylindrical surface */}
            <mesh>
              <cylinderGeometry args={[outerR, outerR, FFA_WALL_HEIGHT, 48, 1, true, start, arcLength]} />
              <meshStandardMaterial color={color} side={DoubleSide} roughness={0.85} />
            </mesh>
            {/* Inner cylindrical surface */}
            <mesh>
              <cylinderGeometry args={[innerR, innerR, FFA_WALL_HEIGHT, 48, 1, true, start, arcLength]} />
              <meshStandardMaterial color={color} side={DoubleSide} roughness={0.85} />
            </mesh>
            {/* Top edge ring cap */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FFA_WALL_HEIGHT / 2, 0]}>
              <ringGeometry args={[innerR, outerR, 48, 1, ringStart, arcLength]} />
              <meshStandardMaterial color={color} side={DoubleSide} roughness={0.85} />
            </mesh>
            {/* Bottom edge ring cap */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -FFA_WALL_HEIGHT / 2, 0]}>
              <ringGeometry args={[innerR, outerR, 48, 1, ringStart, arcLength]} />
              <meshStandardMaterial color={color} side={DoubleSide} roughness={0.85} />
            </mesh>
            {/* Start end cap (exit-facing edge at arc start) */}
            <mesh
              position={[FFA_MAIN_RADIUS * Math.sin(start), 0, FFA_MAIN_RADIUS * Math.cos(start)]}
              rotation={[0, start - Math.PI / 2, 0]}
            >
              <planeGeometry args={[FFA_WALL_THICKNESS, FFA_WALL_HEIGHT]} />
              <meshStandardMaterial color={color} side={DoubleSide} roughness={0.85} />
            </mesh>
            {/* End end cap (exit-facing edge at arc end) */}
            <mesh
              position={[FFA_MAIN_RADIUS * Math.sin(arcEnd), 0, FFA_MAIN_RADIUS * Math.cos(arcEnd)]}
              rotation={[0, arcEnd - Math.PI / 2, 0]}
            >
              <planeGeometry args={[FFA_WALL_THICKNESS, FFA_WALL_HEIGHT]} />
              <meshStandardMaterial color={color} side={DoubleSide} roughness={0.85} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function RoomGeometry({
  manifest,
  onMoveToPoint,
  wallObjects,
  spotlightAnchorId,
  dynamicBoardPlacement,
  boardPlacementWalls: placementWalls,
  overlayOcclusionWalls
}: {
  manifest: RoomManifest;
  onMoveToPoint(point: { x: number; z: number }): void;
  wallObjects: WallObject[];
  spotlightAnchorId?: string | undefined;
  dynamicBoardPlacement?: DynamicBoardPlacementConfig | null | undefined;
  boardPlacementWalls: Wall[];
  overlayOcclusionWalls: Wall[];
}) {
  const anchorsWithObjects = useMemo(
    () => new Set(wallObjects.filter((object) => object.status !== "removed").map((object) => object.wallAnchorId)),
    [wallObjects]
  );

  // ── Skin context ────────────────────────────────────────────────────────────
  const { skin, panoramaUrl } = useWorldSkinContext();

  const floorTextureUrl = skin?.overrides.floor?.textureStorageKey ?? null;
  const floorColor = skin?.overrides.floor?.colorHex ?? "#d8c99f";
  const floorRoughness = skin?.overrides.floor?.roughness ?? 0.92;
  const tierOverride = skin?.overrides.tiers;
  const defaultTierColors = ["#cac0a2", "#bfb498"] as const;
  const domeCeiling = skin?.overrides.domeCeiling;
  const domeTextureUrl = domeCeiling?.textureStorageKey ?? null;
  const wallHeight = manifest.dimensions.height;
  const visibleWalls = useMemo(
    () => manifest.walls.filter((w) => !w.id.startsWith("ffa-perim")),
    [manifest.walls]
  );
  const hasFFAPerim = visibleWalls.length < manifest.walls.length;

  return (
    <group>
      {/* Floor — textured via Suspense/useLoader when a URL is present */}
      <Suspense
        fallback={
          <FloorMesh
            width={manifest.dimensions.width}
            depth={manifest.dimensions.depth}
            color={floorColor}
            roughness={floorRoughness}
            onMoveToPoint={onMoveToPoint}
          />
        }
      >
        {floorTextureUrl ? (
          <FloorMeshTextured
            width={manifest.dimensions.width}
            depth={manifest.dimensions.depth}
            textureUrl={floorTextureUrl}
            roughness={floorRoughness}
            onMoveToPoint={onMoveToPoint}
          />
        ) : (
          <FloorMesh
            width={manifest.dimensions.width}
            depth={manifest.dimensions.depth}
            color={floorColor}
            roughness={floorRoughness}
            onMoveToPoint={onMoveToPoint}
          />
        )}
      </Suspense>
      <gridHelper
        args={[Math.max(manifest.dimensions.width, manifest.dimensions.depth), 24, "#4c6b58", "#31473b"]}
        position={[0, 0.01, 0]}
      />
      {/* Raised rear terraces — tiled deck, wood skirt, bullnose at each step front */}
      {manifest.tiers?.map((tier, i) => {
        const prevFloorY = i === 0 ? 0 : manifest.tiers![i - 1]!.floorY;
        const color = tierOverride?.colorHex ?? defaultTierColors[i % defaultTierColors.length]!;
        const roughness = tierOverride?.roughness ?? floorRoughness;
        const tierTextureUrl = tierOverride?.textureStorageKey ?? floorTextureUrl;
        const tierProps = {
          tier,
          prevFloorY,
          roomWidth: manifest.dimensions.width,
          roomDepth: manifest.dimensions.depth,
          roughness,
          onMoveToPoint
        };
        return tierTextureUrl ? (
          <Suspense
            key={`tier-${i}`}
            fallback={
              <TierMesh {...tierProps} color={color} />
            }
          >
            <TierMeshTextured {...tierProps} textureUrl={tierTextureUrl} />
          </Suspense>
        ) : (
          <TierMesh key={`tier-${i}`} {...tierProps} color={color} />
        );
      })}
      {/* Walls — panorama texture loaded via Suspense/useLoader */}
      <Suspense
        fallback={
          <>
            {visibleWalls.map((wall) => (
              <WallMesh
                key={wall.id}
                wall={wall}
                skinWallColor={skin?.overrides.walls[wall.id]?.colorHex ?? null}
              />
            ))}
          </>
        }
      >
        {panoramaUrl ? (
          <WallsWithPanorama
            key={panoramaUrl}
            walls={visibleWalls}
            panoramaUrl={panoramaUrl}
            skin={skin}
            maxWorldHeight={skin?.overrides.panoramaWall?.maxWorldHeight ?? manifest.dimensions.height}
          />
        ) : (
          <>
            {visibleWalls.map((wall) => (
              <WallMesh
                key={wall.id}
                wall={wall}
                skinWallColor={skin?.overrides.walls[wall.id]?.colorHex ?? null}
              />
            ))}
          </>
        )}
      </Suspense>
      {hasFFAPerim && <PerimeterCylinder color="#8ea487" />}
      {dynamicBoardPlacement?.active ? (
        <DynamicBoardPlacementTargets
          walls={placementWalls}
          placement={dynamicBoardPlacement}
        />
      ) : null}
      {domeCeiling ? (
        <DomeCeilingMesh
          roomWidth={manifest.dimensions.width}
          roomDepth={manifest.dimensions.depth}
          wallHeight={wallHeight}
          textureUrl={domeTextureUrl}
        />
      ) : null}
      {manifest.wallAnchors.map((anchor) => (
        <AnchorMesh
          key={anchor.id}
          anchor={anchor}
          walls={overlayOcclusionWalls}
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

function wallOpacityFromCameraDistance(
  signedDistance: number,
  options?: { symmetric?: boolean; halfThickness?: number }
) {
  const distance = options?.symmetric
    ? Math.abs(signedDistance) - (options.halfThickness ?? 0)
    : signedDistance;

  if (distance >= 2) return 1;
  if (distance >= 0) return 0.18 + (distance / 2) * 0.82;
  return Math.max(0.06, 0.16 + distance * 0.55);
}

/** Inset wall panels slightly along the inward normal (matches prior box inner face). */
const WALL_PANEL_INSET = 0.06;

type PanoramaSlice = { u0: number; u1: number; v1: number };

const BACK_PANORAMA_U0 = 0.75;
const BACK_PANORAMA_U1 = 1;

function mirrorUInRange(u: number, min: number, max: number) {
  return min + max - u;
}

function wallPanoramaUEndpoints(wall: Wall, slice: PanoramaSlice | null) {
  if (!slice) return { uStart: 0, uEnd: 1 };

  if (wall.id.startsWith("wall-back")) {
    return {
      uStart: mirrorUInRange(slice.u0, BACK_PANORAMA_U0, BACK_PANORAMA_U1),
      uEnd: mirrorUInRange(slice.u1, BACK_PANORAMA_U0, BACK_PANORAMA_U1)
    };
  }

  if (wall.id === "wall-left") {
    return { uStart: slice.u1, uEnd: slice.u0 };
  }

  return { uStart: slice.u0, uEnd: slice.u1 };
}

/**
 * Build wall geometry directly in world space.
 * UVs are assigned in world space; back wall mirroring is applied across the whole band.
 */
function createWallPanelGeometry(
  wall: Wall,
  plane: WallPlane,
  slice: PanoramaSlice | null,
  verticalRepeat: number
) {
  const inward = plane.normal.clone().normalize();
  const inset = inward.clone().multiplyScalar(WALL_PANEL_INSET);
  const startBottom = new Vector3(wall.start.x, 0, wall.start.z).add(inset);
  const endBottom = new Vector3(wall.end.x, 0, wall.end.z).add(inset);
  const startTop = startBottom.clone().setY(wall.height);
  const endTop = endBottom.clone().setY(wall.height);

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([
        startBottom.x, startBottom.y, startBottom.z,
        endBottom.x, endBottom.y, endBottom.z,
        endTop.x, endTop.y, endTop.z,
        startTop.x, startTop.y, startTop.z
      ]),
      3
    )
  );

  const { uStart, uEnd } = wallPanoramaUEndpoints(wall, slice);
  const v1 = slice ? verticalRepeat : 1;
  geometry.setAttribute(
    "uv",
    new BufferAttribute(
      new Float32Array([
        uStart, 0,
        uEnd, 0,
        uEnd, v1,
        uStart, v1
      ]),
      2
    )
  );

  const span = endBottom.clone().sub(startBottom);
  const defaultNormal = span.clone().cross(new Vector3(0, wall.height, 0)).normalize();
  geometry.setIndex(
    defaultNormal.dot(inward) >= 0
      ? [0, 1, 2, 0, 2, 3]
      : [0, 2, 1, 0, 3, 2]
  );
  geometry.computeVertexNormals();

  return geometry;
}

function panoramaVerticalRepeat(wallHeight: number, maxWorldHeight: number) {
  return Math.min(1, wallHeight / maxWorldHeight);
}

function createSquareDomeGeometry(segments = 72) {
  const geometry = new PlaneGeometry(2, 2, segments, segments);
  const positions = geometry.getAttribute("position") as BufferAttribute;

  for (let i = 0; i < positions.count; i += 1) {
    const nx = positions.getX(i);
    const nz = positions.getY(i);
    const edgeDistance = Math.max(Math.abs(nx), Math.abs(nz));
    const domeT = Math.max(0, 1 - edgeDistance);
    const bubble = domeT * domeT * (3 - 2 * domeT);
    positions.setXYZ(i, nx, bubble, nz);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function domeCeilingScale(roomWidth: number, roomDepth: number): [number, number, number] {
  const overhang = 0.15;
  const domeRise = Math.max(10, Math.min(roomWidth, roomDepth) * 0.42);
  return [roomWidth / 2 + overhang, domeRise, roomDepth / 2 + overhang];
}

function DomeCeilingMesh({
  roomWidth,
  roomDepth,
  wallHeight,
  textureUrl
}: {
  roomWidth: number;
  roomDepth: number;
  wallHeight: number;
  textureUrl: string | null;
}) {
  const { gl } = useThree();
  const [texture, setTexture] = useState<Texture | null>(null);
  const domeScale = useMemo(() => domeCeilingScale(roomWidth, roomDepth), [roomDepth, roomWidth]);
  const geometry = useMemo(
    () => createSquareDomeGeometry(),
    []
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    if (!textureUrl) {
      setTexture((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }

    let cancelled = false;
    const loader = new TextureLoader();
    loader.load(
      textureUrl,
      (loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = SRGBColorSpace;
        loaded.wrapS = ClampToEdgeWrapping;
        loaded.wrapT = ClampToEdgeWrapping;
        loaded.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        loaded.needsUpdate = true;
        setTexture((prev) => {
          prev?.dispose();
          return loaded;
        });
      },
      undefined,
      () => {
        if (!cancelled) {
          setTexture((prev) => {
            prev?.dispose();
            return null;
          });
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [gl, textureUrl]);

  useEffect(() => {
    return () => {
      setTexture((prev) => {
        prev?.dispose();
        return null;
      });
    };
  }, []);

  if (!texture) return null;

  return (
    <mesh geometry={geometry} position={[0, wallHeight, 0]} scale={domeScale}>
      <meshBasicMaterial
        map={texture}
        side={DoubleSide}
        transparent={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Floor helpers ─────────────────────────────────────────────────────────────

function FloorMesh({ width, depth, color, roughness, onMoveToPoint }: {
  width: number; depth: number; color: string; roughness: number;
  onMoveToPoint(point: { x: number; z: number }): void;
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.02, 0]}
      receiveShadow
      onDoubleClick={(e) => { e.stopPropagation(); onMoveToPoint({ x: e.point.x, z: e.point.z }); }}
    >
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

/** Loads the floor texture via useLoader (Suspense) so it is guaranteed present when rendered. */
function FloorMeshTextured({ width, depth, textureUrl, roughness, onMoveToPoint }: {
  width: number; depth: number; textureUrl: string; roughness: number;
  onMoveToPoint(point: { x: number; z: number }): void;
}) {
  const { gl } = useThree();
  const t = useLoader(TextureLoader, textureUrl);
  useMemo(() => {
    configureFloorTileTexture(t, width, depth, gl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, width, depth, gl]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.02, 0]}
      receiveShadow
      onDoubleClick={(e) => { e.stopPropagation(); onMoveToPoint({ x: e.point.x, z: e.point.z }); }}
    >
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial map={t} roughness={roughness} />
    </mesh>
  );
}

// ── Walls with panorama texture ───────────────────────────────────────────────

/** Loads the panorama texture via useLoader (Suspense) and renders all walls with it. */
function WallsWithPanorama({
  walls,
  panoramaUrl,
  skin,
  maxWorldHeight
}: {
  walls: Wall[];
  panoramaUrl: string;
  skin: import("@3dspace/contracts").WorldSkin | null;
  maxWorldHeight: number;
}) {
  const { gl } = useThree();
  const t = useLoader(TextureLoader, panoramaUrl);
  useMemo(() => {
    t.colorSpace = SRGBColorSpace;
    t.wrapS = ClampToEdgeWrapping;
    t.wrapT = ClampToEdgeWrapping;
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    t.needsUpdate = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, gl]);

  return (
    <>
      {walls.map((wall) => {
        const slice = skin?.overrides.panoramaWall?.slices[wall.id as keyof typeof skin.overrides.panoramaWall.slices] ?? null;
        return (
          <WallMesh
            key={wall.id}
            wall={wall}
            panoramaTexture={t}
            slice={slice}
            maxWorldHeight={maxWorldHeight}
            skinWallColor={skin?.overrides.walls[wall.id]?.colorHex ?? null}
          />
        );
      })}
    </>
  );
}

// ── Dynamic board placement helpers ───────────────────────────────────────────

function snapBoardPlacement(value: number) {
  return Math.round(value / 0.25) * 0.25;
}

function wallSpan(wall: Wall) {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    dx,
    dz,
    length,
    ux: dx / length,
    uz: dz / length
  };
}

function normalFacingReference(wall: Wall, reference: Vector3) {
  const span = wallSpan(wall);
  const wallMidX = (wall.start.x + wall.end.x) / 2;
  const wallMidZ = (wall.start.z + wall.end.z) / 2;
  const n1 = new Vector3(-span.uz, 0, span.ux);
  const n2 = new Vector3(span.uz, 0, -span.ux);
  const toReference = new Vector3(reference.x - wallMidX, 0, reference.z - wallMidZ);
  return n1.dot(toReference) >= n2.dot(toReference) ? n1 : n2;
}

function dynamicBoardRequestFromWallClick(
  wall: Wall,
  point: Vector3,
  normal: Vector3,
  boardSize: { width: number; height: number }
): CreateDynamicWallAnchorRequest {
  const span = wallSpan(wall);
  const wallLengthSq = span.length * span.length;
  const projectedT = clamp(
    ((point.x - wall.start.x) * span.dx + (point.z - wall.start.z) * span.dz) / wallLengthSq,
    0,
    1
  );
  const wallX = wall.start.x + projectedT * span.dx;
  const wallZ = wall.start.z + projectedT * span.dz;
  const offset = (wall.thickness ?? 0) / 2 + DYNAMIC_BOARD_WALL_INSET;
  const width = Math.min(boardSize.width, span.length);
  const height = Math.min(boardSize.height, wall.height);
  const baseY = Math.min(wall.start.y, wall.end.y);
  const centerY = clamp(point.y, baseY + height / 2, baseY + wall.height - height / 2);
  const title = `Board on ${wall.label}`.slice(0, 80);

  return {
    wallId: wall.id,
    center: {
      x: snapBoardPlacement(wallX + normal.x * offset),
      y: snapBoardPlacement(centerY),
      z: snapBoardPlacement(wallZ + normal.z * offset)
    },
    normal: { x: normal.x, y: 0, z: normal.z },
    width,
    height,
    title,
    accepts: DYNAMIC_BOARD_ACCEPTS
  };
}

function DynamicBoardPlacementTargets({
  walls,
  placement
}: {
  walls: Wall[];
  placement: DynamicBoardPlacementConfig;
}) {
  return (
    <group>
      {walls
        .filter((wall) => wall.passable !== true && wall.height >= DYNAMIC_WALL_ANCHOR_MIN_HEIGHT_M)
        .map((wall) => (
          <DynamicBoardPlacementTarget key={wall.id} wall={wall} placement={placement} />
        ))}
    </group>
  );
}

function DynamicBoardPlacementTarget({
  wall,
  placement
}: {
  wall: Wall;
  placement: DynamicBoardPlacementConfig;
}) {
  const { camera } = useThree();
  const [preview, setPreview] = useState<CreateDynamicWallAnchorRequest | null>(null);
  const span = useMemo(() => wallSpan(wall), [wall]);
  const yaw = useMemo(() => Math.atan2(-span.dz, span.dx), [span.dx, span.dz]);
  const targetThickness = Math.max(wall.thickness ?? 0.08, 0.45);
  const position = useMemo<[number, number, number]>(() => {
    const baseY = Math.min(wall.start.y, wall.end.y);
    return [
      (wall.start.x + wall.end.x) / 2,
      baseY + wall.height / 2,
      (wall.start.z + wall.end.z) / 2
    ];
  }, [wall]);

  function placementRequest(event: ThreeEvent<PointerEvent>) {
    const normal = normalFacingReference(wall, camera.position);
    return dynamicBoardRequestFromWallClick(wall, event.point, normal, placement.boardSize);
  }

  function updatePreview(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    setPreview(placementRequest(event));
  }

  function placeBoard(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (placement.busy) return;
    void placement.onPlace(placementRequest(event as unknown as ThreeEvent<PointerEvent>));
  }

  return (
    <group>
      <mesh
        position={position}
        rotation={[0, yaw, 0]}
        onPointerMove={updatePreview}
        onPointerOver={updatePreview}
        onPointerOut={(event) => {
          event.stopPropagation();
          setPreview(null);
        }}
        onClick={placeBoard}
      >
        <boxGeometry args={[span.length, wall.height, targetThickness]} />
        <meshBasicMaterial
          color="#f1c40f"
          transparent
          opacity={preview ? 0.18 : 0.045}
          depthWrite={false}
        />
      </mesh>
      {preview ? (
        <group
          position={[preview.center.x, preview.center.y, preview.center.z]}
          rotation={[0, anchorYaw(preview.normal), 0]}
        >
          <mesh>
            <planeGeometry args={[preview.width, preview.height]} />
            <meshBasicMaterial color="#f6c85f" transparent opacity={0.48} side={DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

// ── Wall mesh ─────────────────────────────────────────────────────────────────

function WallMesh({
  wall,
  panoramaTexture,
  slice,
  maxWorldHeight,
  skinWallColor
}: {
  wall: Wall;
  panoramaTexture?: Texture | null;
  slice?: { u0: number; u1: number; v1: number } | null;
  maxWorldHeight?: number;
  skinWallColor?: string | null;
}) {
  const { camera } = useThree();
  const materialRef = useRef<MeshStandardMaterial | MeshBasicMaterial | null>(null);
  const plane = useMemo(() => wallPlane(wall), [wall]);
  const verticalRepeat = useMemo(
    () => panoramaVerticalRepeat(wall.height, maxWorldHeight ?? 8),
    [wall.height, maxWorldHeight]
  );
  const cameraOffset = useMemo(() => new Vector3(), []);

  const wallTexture = panoramaTexture && slice ? panoramaTexture : null;
  const thickness = wall.thickness ?? 0;
  const useBox = thickness > 0 && !wallTexture;

  // Box geometry dimensions and position for thick walls (no panorama).
  const boxArgs = useMemo<[number, number, number] | null>(() => {
    if (!useBox) return null;
    const spanX = Math.abs(wall.end.x - wall.start.x);
    const spanZ = Math.abs(wall.end.z - wall.start.z);
    return spanX > spanZ
      ? [spanX, wall.height, thickness]
      : [thickness, wall.height, spanZ];
  }, [useBox, wall, thickness]);

  const boxPosition = useMemo<[number, number, number] | null>(() => {
    if (!useBox) return null;
    return [
      (wall.start.x + wall.end.x) / 2,
      wall.height / 2,
      (wall.start.z + wall.end.z) / 2
    ];
  }, [useBox, wall]);

  const wallGeometry = useMemo(
    () => (useBox ? null : createWallPanelGeometry(wall, plane, slice ?? null, verticalRepeat)),
    [useBox, plane, slice, verticalRepeat, wall]
  );

  useEffect(() => {
    return () => { wallGeometry?.dispose(); };
  }, [wallGeometry]);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;

    const signedDistance = cameraOffset.copy(camera.position).sub(plane.point).dot(plane.normal);
    const opacity = wallOpacityFromCameraDistance(signedDistance, useBox ? {
      symmetric: true,
      halfThickness: thickness / 2
    } : undefined);
    material.opacity = opacity;
    material.transparent = opacity < 0.995;
    material.depthWrite = opacity > 0.85;
  });

  const baseColor = wallTexture ? "#ffffff" : (skinWallColor ?? "#8ea487");

  if (useBox) {
    return (
      <mesh position={boxPosition!}>
        <boxGeometry args={boxArgs!} />
        <meshStandardMaterial
          ref={materialRef}
          color={baseColor}
          roughness={0.85}
          side={DoubleSide}
          transparent
          opacity={1}
        />
      </mesh>
    );
  }

  return (
    <mesh geometry={wallGeometry!}>
      {wallTexture ? (
        <meshBasicMaterial
          ref={materialRef}
          color={baseColor}
          map={wallTexture}
          side={DoubleSide}
          transparent
          opacity={1}
          toneMapped={false}
        />
      ) : (
        <meshStandardMaterial
          ref={materialRef}
          color={baseColor}
          roughness={0.85}
          side={DoubleSide}
          transparent
          opacity={1}
        />
      )}
    </mesh>
  );
}

function anchorHidesSurface(anchor: Anchor) {
  return anchor.metadata?.hideSurface === true;
}

function AnchorMesh({ anchor, walls, showLabel, spotlighted }: { anchor: Anchor; walls: Wall[]; showLabel: boolean; spotlighted?: boolean }) {
  const hideSurface = anchorHidesSurface(anchor);
  const { camera } = useThree();
  const materialRef = useRef<MeshStandardMaterial | null>(null);
  const labelTarget = useMemo(
    () => new Vector3(anchor.position.x, anchor.position.y, anchor.position.z).add(new Vector3(anchor.normal.x, anchor.normal.y, anchor.normal.z).normalize().multiplyScalar(WALL_ANCHOR_LABEL_OFFSET)),
    [anchor.normal.x, anchor.normal.y, anchor.normal.z, anchor.position.x, anchor.position.y, anchor.position.z]
  );
  const plane = useMemo(
    () => ({
      point: new Vector3(anchor.position.x, anchor.position.y, anchor.position.z),
      normal: new Vector3(anchor.normal.x, anchor.normal.y, anchor.normal.z).normalize()
    }),
    [anchor.normal.x, anchor.normal.y, anchor.normal.z, anchor.position.x, anchor.position.y, anchor.position.z]
  );
  const cameraOffset = useMemo(() => new Vector3(), []);
  const rotation = useMemo<[number, number, number]>(() => {
    return [0, anchorYaw(anchor.normal), 0];
  }, [anchor.normal.x, anchor.normal.z]);

  useFrame(() => {
    if (hideSurface) return;
    const material = materialRef.current;
    if (!material) return;
    const signedDistance = cameraOffset.copy(camera.position).sub(plane.point).dot(plane.normal);
    const opacity = wallOpacityFromCameraDistance(signedDistance);
    material.opacity = opacity;
    material.transparent = opacity < 0.995;
    material.depthWrite = opacity > 0.85;
  });

  const showLabelOverlay = useOverlayVisibility(() => wallSurfaceVisibleFromCamera(camera.position, labelTarget, anchor, plane.normal, walls));

  const w = anchor.width;
  const h = anchor.height;
  const BORDER = 0.05;
  const BZ = 0.022;

  return (
    <group position={[anchor.position.x, anchor.position.y, anchor.position.z]} rotation={rotation}>
      {hideSurface ? null : (
        <mesh position={[0, 0, WALL_ANCHOR_SURFACE_OFFSET]}>
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
      )}
      {spotlighted ? (
        <>
          <mesh position={[0, h / 2 + BORDER, BZ + WALL_ANCHOR_SURFACE_OFFSET]}>
            <boxGeometry args={[w + BORDER * 4, BORDER * 2, 0.008]} />
            <meshBasicMaterial color="#f1c40f" />
          </mesh>
          <mesh position={[0, -(h / 2 + BORDER), BZ + WALL_ANCHOR_SURFACE_OFFSET]}>
            <boxGeometry args={[w + BORDER * 4, BORDER * 2, 0.008]} />
            <meshBasicMaterial color="#f1c40f" />
          </mesh>
          <mesh position={[-(w / 2 + BORDER), 0, BZ + WALL_ANCHOR_SURFACE_OFFSET]}>
            <boxGeometry args={[BORDER * 2, h, 0.008]} />
            <meshBasicMaterial color="#f1c40f" />
          </mesh>
          <mesh position={[w / 2 + BORDER, 0, BZ + WALL_ANCHOR_SURFACE_OFFSET]}>
            <boxGeometry args={[BORDER * 2, h, 0.008]} />
            <meshBasicMaterial color="#f1c40f" />
          </mesh>
        </>
      ) : null}
      {showLabel && showLabelOverlay ? (
        <group position={[0, 0, WALL_ANCHOR_LABEL_OFFSET + WALL_ANCHOR_SURFACE_OFFSET]}>
          <Html center transform distanceFactor={8} className="wall-anchor-label-html">
            <div className={`wall-anchor-label${spotlighted ? " wall-anchor-label--spotlight" : ""}`}>{anchor.label}</div>
          </Html>
        </group>
      ) : null}
    </group>
  );
}
