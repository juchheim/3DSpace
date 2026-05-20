"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { BufferAttribute, BufferGeometry, type MeshStandardMaterial, Vector3 } from "three";
import type { AvatarAppearance, ClassroomGroup, ClassroomPrivateCheck, ClassroomSpotlight, QualityLevel, RoomManifest, WallAnchorSchema, WallObject, WallObjectPlacement, WallPlaneSchema } from "@3dspace/contracts";
import type { z } from "zod";
import type { ParticipantView } from "./RoomClient";
import { BlockyAvatar } from "./BlockyAvatar";
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

export function RoomView3D({
  manifest,
  participants,
  localParticipantId,
  quality,
  cameraYawRef,
  cameraPitchRef,
  bindCamera,
  onMoveToPoint,
  wallObjects = [],
  assetUrls = {},
  wallMediaStreams = {},
  canManageWallObjects = false,
  currentUserId,
  classroomGroups = [],
  privateChecks = [],
  spotlight,
  getAppearance,
  activeHelpRequestUserIds,
  onSelfClick,
  localWaveTriggered = false,
  onLocalWaveComplete,
  onWallObjectControl,
  onWallObjectRemove,
  onWallObjectStopShare,
  onWallObjectModerate
}: {
  manifest: RoomManifest;
  participants: ParticipantView[];
  localParticipantId: string;
  quality: QualityLevel;
  cameraYawRef: MutableRefObject<number>;
  cameraPitchRef: MutableRefObject<number>;
  bindCamera(element: HTMLElement | null): void | (() => void);
  onMoveToPoint(point: { x: number; z: number }): void;
  wallObjects?: WallObject[];
  assetUrls?: Record<string, string>;
  wallMediaStreams?: Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>;
  canManageWallObjects?: boolean;
  currentUserId?: string | undefined;
  classroomGroups?: ClassroomGroup[];
  privateChecks?: ClassroomPrivateCheck[];
  spotlight?: ClassroomSpotlight | null | undefined;
  getAppearance: (participantId: string) => AvatarAppearance;
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
}) {
  const dpr = quality === "high" ? 1.8 : quality === "medium" ? 1.4 : 1;
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => bindCamera(canvasElement), [bindCamera, canvasElement]);

  return (
    <div className="canvas-wrap">
      <Canvas
        camera={{ position: [0, 12, 14], fov: 48 }}
        dpr={dpr}
        gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
        onCreated={({ gl }) => setCanvasElement(gl.domElement)}
      >
        <color attach="background" args={["#16231d"]} />
        <ambientLight intensity={0.82} />
        <directionalLight position={[4, 8, 6]} intensity={1.4} />
        <RoomGeometry manifest={manifest} onMoveToPoint={onMoveToPoint} wallObjects={wallObjects} spotlightAnchorId={spotlight?.anchorId} />
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
        />
        <GroupTargetLayer manifest={manifest} groups={classroomGroups} />
        <PrivateCheckLayer manifest={manifest} privateChecks={privateChecks} />
        {participants.map((participant) => {
          const group = classroomGroups.find((g) => g.status === "active" && g.memberUserIds.includes(participant.id));
          const isLocal = participant.id === localParticipantId;
          return (
            <BlockyAvatar
              key={participant.id}
              participant={participant}
              {...(group?.color ? { groupColor: group.color } : {})}
              appearance={getAppearance(participant.id)}
              helpRequestActive={activeHelpRequestUserIds?.has(participant.id) ?? false}
              waveTriggered={isLocal ? localWaveTriggered : !!(participant.state.waving)}
              onWaveComplete={isLocal && onLocalWaveComplete ? onLocalWaveComplete : () => {}}
              {...(isLocal && onSelfClick ? { onClick: onSelfClick } : {})}
            />
          );
        })}
        <FollowLocalAvatarCamera
          participants={participants}
          localParticipantId={localParticipantId}
          cameraYawRef={cameraYawRef}
          cameraPitchRef={cameraPitchRef}
        />
      </Canvas>
    </div>
  );
}

function GroupTargetLayer({
  manifest,
  groups
}: {
  manifest: RoomManifest;
  groups: ClassroomGroup[];
}) {
  return (
    <group>
      {groups
        .filter((group) => group.status === "active" && group.targetPosition)
        .map((group) => (
          <GroupTargetMarker key={`group-target-${group.id}`} group={group} manifest={manifest} />
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
  onWallObjectModerate
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
  onModerate
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
  cameraPitchRef
}: {
  participants: ParticipantView[];
  localParticipantId: string;
  cameraYawRef: MutableRefObject<number>;
  cameraPitchRef: MutableRefObject<number>;
}) {
  const { camera } = useThree();
  const desiredPosition = useMemo(() => new Vector3(), []);
  const lookAtTarget = useMemo(() => new Vector3(), []);
  const localParticipant = participants.find((participant) => participant.id === localParticipantId || participant.local);
  const followDistance = 2.85;
  const lookAtHeight = 1.08;

  useFrame(() => {
    if (!localParticipant) return;

    const { position } = localParticipant.state;
    const avatarY = position.y ?? 0;
    const yaw = cameraYawRef.current;
    const pitch = cameraPitchRef.current;
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
    camera.lookAt(lookAtTarget);
  });

  return null;
}

/**
 * Renders one seating tier as a trapezoidal prism with a ~74° angled front riser
 * instead of a vertical face, giving a theater-seat look rather than a concrete block.
 */
function TierMesh({
  tier,
  prevFloorY,
  roomWidth,
  color,
  onMoveToPoint
}: {
  tier: { minZ: number; maxZ: number; floorY: number };
  prevFloorY: number;
  roomWidth: number;
  color: string;
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
      <meshStandardMaterial color={color} roughness={0.92} />
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
        <meshStandardMaterial color="#d8c99f" roughness={0.92} />
      </mesh>
      <gridHelper
        args={[Math.max(manifest.dimensions.width, manifest.dimensions.depth), 24, "#4c6b58", "#31473b"]}
        position={[0, 0.01, 0]}
      />
      {/* Raised tier platforms with angled front risers for a theater-seat appearance */}
      {manifest.tiers?.map((tier, i) => {
        const prevFloorY = i === 0 ? 0 : manifest.tiers![i - 1]!.floorY;
        const tierColors = ["#cac0a2", "#bfb498"];
        return (
          <TierMesh
            key={`tier-${i}`}
            tier={tier}
            prevFloorY={prevFloorY}
            roomWidth={manifest.dimensions.width}
            color={tierColors[i % tierColors.length]!}
            onMoveToPoint={onMoveToPoint}
          />
        );
      })}
      {manifest.walls.map((wall) => <WallMesh key={wall.id} wall={wall} />)}
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

function WallMesh({ wall }: { wall: Wall }) {
  const { camera } = useThree();
  const materialRef = useRef<MeshStandardMaterial | null>(null);
  const plane = useMemo(() => wallPlane(wall), [wall]);
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
  const midpoint = [(wall.start.x + wall.end.x) / 2, wall.height / 2, (wall.start.z + wall.end.z) / 2] as const;
  const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
  const cameraOffset = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;

    const signedDistance = cameraOffset.copy(camera.position).sub(plane.point).dot(plane.normal);
    const opacity = wallOpacityFromCameraDistance(signedDistance);
    material.opacity = opacity;
    material.transparent = opacity < 0.995;
    material.depthWrite = opacity > 0.85;
  });

  return (
    <mesh position={midpoint} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, wall.height, 0.12]} />
      <meshStandardMaterial ref={materialRef} color="#8ea487" roughness={0.85} transparent opacity={1} />
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

