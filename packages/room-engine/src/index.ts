import type {
  AvatarStateMessage,
  Role,
  RoomCapabilities,
  RoomManifest,
  SpatialAudioConfig,
  Vector3,
  ViewMode
} from "@3dspace/contracts";
import { RoomManifestSchema } from "@3dspace/contracts";

export type RoomEngineConfig = {
  maxParticipants: number;
  avatarSendHz: number;
  interpolationMs: number;
  defaultQuality: "low" | "medium" | "high";
  enable2DAnalog: boolean;
  enableWallAttachments: boolean;
  spatialAudio: SpatialAudioConfig;
};

export const DEFAULT_SPATIAL_AUDIO: SpatialAudioConfig = {
  enabled: true,
  distanceModel: "inverse",
  refDistance: 1,
  maxDistance: 24,
  rolloffFactor: 1.4
};

/** Standard widescreen display aspect (16:9). */
export const WIDESCREEN_ASPECT = 16 / 9;

/** Primary front-board width in world meters (height follows 16:9). */
export const PRIMARY_BOARD_WIDTH = 4.8;

export function widescreenHeight(width: number): number {
  return (width * 9) / 16;
}

export function widescreenWidth(height: number): number {
  return (height * 16) / 9;
}

export const DEFAULT_ROOM_ENGINE_CONFIG: RoomEngineConfig = {
  maxParticipants: 30,
  avatarSendHz: 12,
  interpolationMs: 120,
  defaultQuality: "low",
  enable2DAnalog: true,
  enableWallAttachments: true,
  spatialAudio: DEFAULT_SPATIAL_AUDIO
};

export function createRoomCapabilities(config: RoomEngineConfig = DEFAULT_ROOM_ENGINE_CONFIG): RoomCapabilities {
  return {
    maxParticipants: config.maxParticipants,
    avatarSendHz: config.avatarSendHz,
    interpolationMs: config.interpolationMs,
    qualityLevels: ["low", "medium", "high"],
    twoDAnalog: config.enable2DAnalog,
    cameraBillboards: true,
    spatialAudio: config.spatialAudio.enabled,
    wallAttachments: config.enableWallAttachments,
    wallObjects: true,
    wallLiveShares: true,
    wallWebLinks: true,
    wallWebEmbeds: false,
    roomEvents: true
  };
}

export function createDefaultRoomManifest(input: {
  id?: string;
  roomId: string;
  name?: string;
  version?: number;
  createdAt?: string;
  config?: Partial<RoomEngineConfig>;
}): RoomManifest {
  const config: RoomEngineConfig = {
    ...DEFAULT_ROOM_ENGINE_CONFIG,
    ...input.config,
    spatialAudio: {
      ...DEFAULT_SPATIAL_AUDIO,
      ...input.config?.spatialAudio
    }
  };

  const manifest: RoomManifest = {
    id: input.id ?? `${input.roomId}:manifest:v${input.version ?? 1}`,
    roomId: input.roomId,
    version: input.version ?? 1,
    name: input.name ?? "Default Classroom",
    dimensions: {
      width: 16,
      depth: 12,
      height: 4
    },
    bounds: {
      minX: -7.2,
      maxX: 7.2,
      minZ: -5.2,
      maxZ: 5.2
    },
    spawnPoints: [
      { id: "spawn-teacher", label: "Teacher", position: { x: 0, y: 0, z: -2.2 }, rotation: { y: Math.PI } },
      { id: "spawn-student-back-left", label: "Student Back Left", position: { x: -4.8, y: 0, z: 3.4 }, rotation: { y: Math.PI } },
      { id: "spawn-student-back-mid-left", label: "Student Back Mid Left", position: { x: -1.6, y: 0, z: 3.8 }, rotation: { y: Math.PI } },
      { id: "spawn-student-back-mid-right", label: "Student Back Mid Right", position: { x: 1.6, y: 0, z: 3.8 }, rotation: { y: Math.PI } },
      { id: "spawn-student-back-right", label: "Student Back Right", position: { x: 4.8, y: 0, z: 3.4 }, rotation: { y: Math.PI } },
      { id: "spawn-student-mid-left", label: "Student Mid Left", position: { x: -4, y: 0, z: 2 }, rotation: { y: Math.PI } },
      { id: "spawn-student-mid-center", label: "Student Mid Center", position: { x: 0, y: 0, z: 2.4 }, rotation: { y: Math.PI } },
      { id: "spawn-student-mid-right", label: "Student Mid Right", position: { x: 4, y: 0, z: 2 }, rotation: { y: Math.PI } }
    ],
    walls: [
      { id: "wall-front", label: "Front wall", start: { x: -8, y: 0, z: -6 }, end: { x: 8, y: 0, z: -6 }, height: 4, anchorIds: ["anchor-board", "anchor-media-left"] },
      { id: "wall-back", label: "Back wall", start: { x: -8, y: 0, z: 6 }, end: { x: 8, y: 0, z: 6 }, height: 4, anchorIds: ["anchor-back"] },
      { id: "wall-left", label: "Left wall", start: { x: -8, y: 0, z: -6 }, end: { x: -8, y: 0, z: 6 }, height: 4, anchorIds: ["anchor-left"] },
      { id: "wall-right", label: "Right wall", start: { x: 8, y: 0, z: -6 }, end: { x: 8, y: 0, z: 6 }, height: 4, anchorIds: ["anchor-right"] }
    ],
    wallAnchors: [
      {
        id: "anchor-board",
        label: "Main board",
        position: { x: 0, y: 2, z: -5.92 },
        normal: { x: 0, y: 0, z: 1 },
        width: PRIMARY_BOARD_WIDTH,
        height: widescreenHeight(PRIMARY_BOARD_WIDTH),
        metadata: {
          accepts: ["image", "video", "image.file", "video.file", "camera.live", "microphone.live", "screen.live", "browser-tab.live", "web.link", "note", "poll", "timer"],
          capacity: 4,
          layout: "grid",
          defaultRole: "primary-display",
          supportsInteraction: true,
          moderationPolicy: "teacher-only",
          priority: "primary"
        }
      },
      {
        id: "anchor-media-left",
        label: "Front media",
        position: { x: -5.6, y: 2, z: -5.92 },
        normal: { x: 0, y: 0, z: 1 },
        width: 2.2,
        height: widescreenHeight(2.2),
        metadata: {
          accepts: ["image", "audio", "image.file", "audio.file", "microphone.live", "web.link", "note", "timer"],
          capacity: 3,
          layout: "stack",
          defaultRole: "resource-rail",
          supportsInteraction: true,
          moderationPolicy: "teacher-only"
        }
      },
      {
        id: "anchor-back",
        label: "Back display",
        position: { x: 4.5, y: 2, z: 5.92 },
        normal: { x: 0, y: 0, z: -1 },
        width: 2.5,
        height: widescreenHeight(2.5),
        metadata: {
          accepts: ["image", "video", "audio", "image.file", "video.file", "audio.file", "camera.live", "screen.live", "browser-tab.live", "web.link", "note", "poll", "timer"],
          capacity: 4,
          layout: "grid",
          defaultRole: "student-share",
          supportsInteraction: true,
          moderationPolicy: "student-request"
        }
      },
      {
        id: "anchor-left",
        label: "Left resource rail",
        position: { x: -7.92, y: 2, z: 0 },
        normal: { x: 1, y: 0, z: 0 },
        width: 3.4,
        height: widescreenHeight(3.4),
        metadata: {
          accepts: ["image", "image.file", "document.file", "slides.file", "web.link", "note", "poll", "timer"],
          capacity: 6,
          layout: "rail",
          defaultRole: "resource-rail",
          supportsInteraction: true,
          moderationPolicy: "student-request"
        }
      },
      {
        id: "anchor-right",
        label: "Right resource rail",
        position: { x: 7.92, y: 2, z: 0 },
        normal: { x: -1, y: 0, z: 0 },
        width: 3.4,
        height: widescreenHeight(3.4),
        metadata: {
          accepts: ["image", "image.file", "document.file", "slides.file", "web.link", "note", "poll", "timer"],
          capacity: 6,
          layout: "rail",
          defaultRole: "resource-rail",
          supportsInteraction: true,
          moderationPolicy: "student-request"
        }
      }
    ],
    projection: {
      kind: "top-down-v1",
      scale: 1,
      origin: { x: 0, y: 0 }
    },
    capabilities: createRoomCapabilities(config),
    spatialAudio: config.spatialAudio,
    features: [
      { key: "screen-share", enabled: false, config: { preparedTrackKind: "screen" } },
      { key: "computer-audio", enabled: false, config: { preparedTrackKind: "system-audio" } },
      { key: "wall-attachments", enabled: config.enableWallAttachments, config: { supportedKinds: ["image", "video", "audio"] } },
      {
        key: "wall-objects",
        enabled: true,
        config: {
          creationDefault: "teacher-only",
          maxActivePerRoom: 20,
          maxActiveLiveShares: 4,
          supportedTypes: ["image.file", "video.file", "audio.file", "camera.live", "microphone.live", "screen.live", "browser-tab.live", "web.link", "note", "poll", "timer"]
        }
      }
    ],
    createdAt: input.createdAt ?? new Date().toISOString()
  };

  return RoomManifestSchema.parse(manifest);
}

export function clampPositionToBounds(manifest: RoomManifest, position: Vector3): Vector3 {
  return {
    x: Math.min(Math.max(position.x, manifest.bounds.minX), manifest.bounds.maxX),
    y: 0,
    z: Math.min(Math.max(position.z, manifest.bounds.minZ), manifest.bounds.maxZ)
  };
}

export function transformLocalMovementToWorld(rotationY: number, local: { x: number; z: number }) {
  const forwardX = Math.sin(rotationY);
  const forwardZ = Math.cos(rotationY);
  const rightX = Math.cos(rotationY);
  const rightZ = -Math.sin(rotationY);
  const forward = -local.z;
  const right = -local.x;

  return {
    x: right * rightX + forward * forwardX,
    z: right * rightZ + forward * forwardZ
  };
}

export function isWithinBounds(manifest: RoomManifest, position: Vector3) {
  return (
    position.x >= manifest.bounds.minX &&
    position.x <= manifest.bounds.maxX &&
    position.z >= manifest.bounds.minZ &&
    position.z <= manifest.bounds.maxZ
  );
}

export function projectPositionTo2D(manifest: RoomManifest, position: Vector3) {
  const width = manifest.bounds.maxX - manifest.bounds.minX;
  const depth = manifest.bounds.maxZ - manifest.bounds.minZ;

  return {
    x: ((position.x - manifest.bounds.minX) / width) * 100,
    y: ((position.z - manifest.bounds.minZ) / depth) * 100
  };
}

export function projectAnchorRectTo2D(
  manifest: RoomManifest,
  anchor: { position: Vector3; normal: Vector3; width: number; height: number }
) {
  const point = projectPositionTo2D(manifest, anchor.position);
  const boundsWidth = manifest.bounds.maxX - manifest.bounds.minX;
  const boundsDepth = manifest.bounds.maxZ - manifest.bounds.minZ;
  const onSideWall = Math.abs(anchor.normal.x) > 0.5;
  const rectWidth = onSideWall ? (anchor.width / boundsDepth) * 100 : (anchor.width / boundsWidth) * 100;
  const rectHeight = rectWidth / WIDESCREEN_ASPECT;

  return {
    x: point.x - rectWidth / 2,
    y: point.y - rectHeight / 2,
    width: rectWidth,
    height: rectHeight
  };
}

export function unprojectPointFrom2D(manifest: RoomManifest, point: { x: number; y: number }): Vector3 {
  const width = manifest.bounds.maxX - manifest.bounds.minX;
  const depth = manifest.bounds.maxZ - manifest.bounds.minZ;

  return clampPositionToBounds(manifest, {
    x: manifest.bounds.minX + (point.x / 100) * width,
    y: 0,
    z: manifest.bounds.minZ + (point.y / 100) * depth
  });
}

const SPAWN_OCCUPIED_RADIUS = 0.9;

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roleMatchesSpawn(spawn: RoomManifest["spawnPoints"][number], role?: Role) {
  if (!role) return true;
  const label = `${spawn.id} ${spawn.label}`.toLowerCase();
  const teacherSpawn = label.includes("teacher");
  return role === "teacher" ? teacherSpawn : !teacherSpawn;
}

function isSpawnOccupied(spawn: RoomManifest["spawnPoints"][number], occupiedPositions: Vector3[]) {
  const radiusSquared = SPAWN_OCCUPIED_RADIUS * SPAWN_OCCUPIED_RADIUS;
  return occupiedPositions.some((position) => {
    const dx = spawn.position.x - position.x;
    const dz = spawn.position.z - position.z;
    return dx * dx + dz * dz <= radiusSquared;
  });
}

export function selectSpawnPoint(input: {
  manifest: RoomManifest;
  participantId: string;
  role?: Role;
  occupiedPositions?: Vector3[];
}) {
  const candidates = input.manifest.spawnPoints.filter((spawn) => roleMatchesSpawn(spawn, input.role));
  const spawns = candidates.length > 0 ? candidates : input.manifest.spawnPoints;
  const start = stableHash(input.participantId) % spawns.length;
  const occupiedPositions = input.occupiedPositions ?? [];

  for (let offset = 0; offset < spawns.length; offset += 1) {
    const spawn = spawns[(start + offset) % spawns.length]!;
    if (!isSpawnOccupied(spawn, occupiedPositions)) return spawn;
  }

  return spawns[start] ?? input.manifest.spawnPoints[0]!;
}

export function createAvatarState(input: {
  participantId: string;
  manifest: RoomManifest;
  spawnIndex?: number;
  role?: Role;
  occupiedPositions?: Vector3[];
  viewMode?: ViewMode;
  sentAt?: number;
}): AvatarStateMessage {
  const spawn =
    input.spawnIndex !== undefined
      ? input.manifest.spawnPoints[input.spawnIndex] ?? input.manifest.spawnPoints[0]!
      : selectSpawnPoint({
          manifest: input.manifest,
          participantId: input.participantId,
          ...(input.role ? { role: input.role } : {}),
          ...(input.occupiedPositions ? { occupiedPositions: input.occupiedPositions } : {})
        });

  return {
    type: "avatar.state.v1",
    sentAt: input.sentAt ?? Date.now(),
    participantId: input.participantId,
    position: spawn.position,
    rotation: spawn.rotation,
    movement: "idle",
    viewMode: input.viewMode ?? "3d",
    media: {
      cameraEnabled: false,
      microphoneEnabled: false,
      speaking: false
    }
  };
}

export function interpolateAvatarState(previous: AvatarStateMessage, next: AvatarStateMessage, ratio: number): AvatarStateMessage {
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  const lerp = (a: number, b: number) => a + (b - a) * clampedRatio;

  return {
    ...next,
    sentAt: Math.round(lerp(previous.sentAt, next.sentAt)),
    position: {
      x: lerp(previous.position.x, next.position.x),
      y: lerp(previous.position.y, next.position.y),
      z: lerp(previous.position.z, next.position.z)
    },
    rotation: {
      y: lerp(previous.rotation.y, next.rotation.y)
    }
  };
}

export function calculateSpatialAudio(
  listener: Vector3,
  source: Vector3,
  config: SpatialAudioConfig = DEFAULT_SPATIAL_AUDIO
) {
  const dx = source.x - listener.x;
  const dz = source.z - listener.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const clampedDistance = Math.min(distance, config.maxDistance);
  const pan = Math.max(-1, Math.min(1, dx / Math.max(config.maxDistance, 1)));

  if (!config.enabled) {
    return { distance, gain: 1, pan: 0 };
  }

  if (config.distanceModel === "linear") {
    const range = Math.max(config.maxDistance - config.refDistance, 1);
    return {
      distance,
      gain: Math.max(0, 1 - (config.rolloffFactor * (clampedDistance - config.refDistance)) / range),
      pan
    };
  }

  if (config.distanceModel === "exponential") {
    return {
      distance,
      gain: Math.pow(Math.max(clampedDistance, config.refDistance) / config.refDistance, -config.rolloffFactor),
      pan
    };
  }

  return {
    distance,
    gain: config.refDistance / (config.refDistance + config.rolloffFactor * Math.max(clampedDistance - config.refDistance, 0)),
    pan
  };
}

/** Merge current default anchor dimensions into a stored manifest (geometry only). */
export function applyDefaultWallAnchorDimensions(manifest: RoomManifest): RoomManifest {
  const template = createDefaultRoomManifest({
    roomId: manifest.roomId,
    name: manifest.name,
    version: manifest.version
  });
  const dimensionsById = new Map(template.wallAnchors.map((anchor) => [anchor.id, { width: anchor.width, height: anchor.height }]));

  return {
    ...manifest,
    wallAnchors: manifest.wallAnchors.map((anchor) => {
      const dimensions = dimensionsById.get(anchor.id);
      return dimensions ? { ...anchor, ...dimensions } : anchor;
    })
  };
}

export function getWallAnchorAudioPosition(manifest: RoomManifest, wallAnchorId: string): Vector3 | undefined {
  const anchor = manifest.wallAnchors.find((candidate) => candidate.id === wallAnchorId);
  if (!anchor) return undefined;
  return {
    x: anchor.position.x,
    y: anchor.position.y,
    z: anchor.position.z
  };
}

export {
  anchorAcceptsWallObjectType,
  anchorHasOccupyingWallObject,
  anchorSupportsCreateOption,
  baseAcceptedKind,
  fileInputAcceptForAnchor,
  fileKindForWallObjectType,
  isOccupyingWallObjectStatus
} from "./wallAnchorPolicy.js";
export type { WallAnchorCreateOption } from "./wallAnchorPolicy.js";
export {
  createInitialPollState,
  isValidPollChoiceId,
  normalizePollInlineData,
  pollTotalVotes,
  pollVoteCounts,
  readPollState
} from "./poll.js";
export type { PollChoice, PollState } from "./poll.js";
