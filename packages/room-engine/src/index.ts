import type {
  AvatarStateMessage,
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
      { id: "spawn-teacher", label: "Teacher", position: { x: 0, y: 0, z: -2.2 }, rotation: { y: 0 } },
      { id: "spawn-a", label: "Student A", position: { x: -3.2, y: 0, z: 1.2 }, rotation: { y: Math.PI } },
      { id: "spawn-b", label: "Student B", position: { x: 0, y: 0, z: 1.6 }, rotation: { y: Math.PI } },
      { id: "spawn-c", label: "Student C", position: { x: 3.2, y: 0, z: 1.2 }, rotation: { y: Math.PI } }
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
        width: 6.8,
        height: 2.1,
        metadata: { accepts: ["image", "video"], priority: "primary" }
      },
      {
        id: "anchor-media-left",
        label: "Front media",
        position: { x: -5.6, y: 2, z: -5.92 },
        normal: { x: 0, y: 0, z: 1 },
        width: 2.2,
        height: 1.4,
        metadata: { accepts: ["image", "audio"] }
      },
      {
        id: "anchor-back",
        label: "Back display",
        position: { x: 4.5, y: 2, z: 5.92 },
        normal: { x: 0, y: 0, z: -1 },
        width: 2.5,
        height: 1.6,
        metadata: { accepts: ["image", "video", "audio"] }
      },
      {
        id: "anchor-left",
        label: "Left resource rail",
        position: { x: -7.92, y: 2, z: 0 },
        normal: { x: 1, y: 0, z: 0 },
        width: 3.4,
        height: 1.4,
        metadata: { accepts: ["image"] }
      },
      {
        id: "anchor-right",
        label: "Right resource rail",
        position: { x: 7.92, y: 2, z: 0 },
        normal: { x: -1, y: 0, z: 0 },
        width: 3.4,
        height: 1.4,
        metadata: { accepts: ["image"] }
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
      { key: "wall-attachments", enabled: config.enableWallAttachments, config: { supportedKinds: ["image", "video", "audio"] } }
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

export function unprojectPointFrom2D(manifest: RoomManifest, point: { x: number; y: number }): Vector3 {
  const width = manifest.bounds.maxX - manifest.bounds.minX;
  const depth = manifest.bounds.maxZ - manifest.bounds.minZ;

  return clampPositionToBounds(manifest, {
    x: manifest.bounds.minX + (point.x / 100) * width,
    y: 0,
    z: manifest.bounds.minZ + (point.y / 100) * depth
  });
}

export function createAvatarState(input: {
  participantId: string;
  manifest: RoomManifest;
  spawnIndex?: number;
  viewMode?: ViewMode;
  sentAt?: number;
}): AvatarStateMessage {
  const spawn = input.manifest.spawnPoints[input.spawnIndex ?? 0] ?? input.manifest.spawnPoints[0]!;

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
