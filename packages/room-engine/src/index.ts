import type {
  AvatarStateMessage,
  BuildPiece,
  Role,
  RoomCapabilities,
  RoomManifest,
  RoomType,
  SpatialAudioConfig,
  Vector3,
  ViewMode
} from "@3dspace/contracts";
import { RoomManifestSchema } from "@3dspace/contracts";
import { isAngleWithinFreeForAllExitArc } from "./free-for-all-build-mask.js";

export {
  BUILD_CELL_SIZE,
  BUILD_FLOOR_THICKNESS,
  BUILD_ID_PREFIX,
  BUILD_LEVEL_HEIGHT,
  BUILD_MAX_LEVEL,
  BUILD_MAX_PIECES_PER_ROOM,
  BUILD_MAX_PIECES_PER_USER,
  BUILD_SPAWN_KEEP_OUT_RADIUS,
  BUILD_STEP_UP_MAX,
  BUILD_ENABLE_EASED_FALL,
  BUILD_FALL_GRAVITY,
  BUILD_PLACEMENT_RATE_LIMIT_MS,
  BUILD_WALL_HEIGHT,
  BUILD_WALL_THICKNESS,
  boardPlacementWalls,
  buildCellFootprint,
  buildPieceColliders,
  buildPieceStableId,
  rampClimbFromRotation,
  cellToWorldCenter,
  collectCollisionWalls,
  freeForAllBuildMask,
  isBuildAllowedAt,
  isAngleWithinFreeForAllExitArc,
  levelToY,
  worldToCell,
  type AxisAlignedRect,
  type BuildPieceColliders,
  type FloorTop,
  type FreeForAllBuildMask,
  type RampSurface,
  type WallCollider
} from "./build.js";

export {
  AVATAR_STAND_HEIGHT,
  avatarOverlapsWallVerticalSpan,
  manifestWallToCollider,
  resolveWallCollisionsV2,
  WALL_AVATAR_RADIUS
} from "./wall-collision.js";

import {
  buildGroundHeightContext,
  groundHeightAt
} from "./ground-height.js";

export {
  BuildSurfaceIndex,
  buildGroundHeightContext,
  groundHeightAt,
  groundHeightAtSurface,
  rampHeightAt,
  type GroundHeightContext,
  type GroundHeightMode
} from "./ground-height.js";

type WallPlane = RoomManifest["walls"][number];
type WallAnchor = RoomManifest["wallAnchors"][number];
type SpawnPoint = RoomManifest["spawnPoints"][number];

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
  maxDistance: 32,
  rolloffFactor: 1.4
};

/** Standard widescreen display aspect (16:9). */
export const WIDESCREEN_ASPECT = 16 / 9;

/** Primary front-board width in world meters. */
export const PRIMARY_BOARD_WIDTH = 9.2 * 1.1;

/** Primary front-board height in world meters (20% shorter than prior 16:9 at 9.6 m, then scaled up 10%, plus a slight height bump). */
export const PRIMARY_BOARD_HEIGHT = widescreenHeight(9.6) * 0.8 * 1.1 * 1.05;

/** Center of the primary front board on the front wall. */
export const PRIMARY_BOARD_CENTER_X = -0.6;
export const PRIMARY_BOARD_CENTER_Y = 4.5;

/** Front media board on the front wall (left of main board). */
export const FRONT_MEDIA_WIDTH = 3.0;
export const FRONT_MEDIA_CENTER_X = -7.8;
export const FRONT_MEDIA_CENTER_Y = 1.4;

/** Baseline width for side/back secondary boards before per-anchor scaling. */
const SECONDARY_BOARD_BASE_WIDTH = 10.8;
/** Additional height trim applied after 16:9 sizing. */
const SECONDARY_BOARD_HEIGHT_SCALE = 0.95;
/** Extra height trim for left/right resource rails only. */
const RESOURCE_RAIL_HEIGHT_SCALE = 0.95;
/** Additional height trim for the right resource rail only. */
const RIGHT_RESOURCE_RAIL_EXTRA_HEIGHT_SCALE = 0.97;
/** Small reposition nudge (m) — along-wall left uses multiples of this from inside the room. */
const RESOURCE_RAIL_NUDGE_UP = 0.2;
const RESOURCE_RAIL_NUDGE_ALONG = RESOURCE_RAIL_NUDGE_UP;
/** Additional along-wall shift toward the right when facing each side wall (m). */
const RESOURCE_RAIL_NUDGE_RIGHT = 2;
/** Fine along-wall shift back toward the left when facing each side wall (m). */
const RESOURCE_RAIL_NUDGE_LEFT = 0.5;
/** Width trim for the right resource rail only. */
const RIGHT_RESOURCE_RAIL_WIDTH_SCALE = 0.97;
/** Extra along-wall shift toward the right for the right resource rail only (m). */
const RIGHT_RESOURCE_RAIL_NUDGE_RIGHT = 0.4;

/** Left resource rail — 5% smaller than baseline. */
export const LEFT_RESOURCE_RAIL_WIDTH = SECONDARY_BOARD_BASE_WIDTH * 0.95;
export const LEFT_RESOURCE_RAIL_HEIGHT =
  widescreenHeight(LEFT_RESOURCE_RAIL_WIDTH) * SECONDARY_BOARD_HEIGHT_SCALE * RESOURCE_RAIL_HEIGHT_SCALE;
export const LEFT_RESOURCE_RAIL_CENTER_X = -14.92;
export const LEFT_RESOURCE_RAIL_CENTER_Y = 4.4 + RESOURCE_RAIL_NUDGE_UP;
export const LEFT_RESOURCE_RAIL_CENTER_Z =
  -1 - 2 * RESOURCE_RAIL_NUDGE_ALONG + RESOURCE_RAIL_NUDGE_RIGHT - RESOURCE_RAIL_NUDGE_LEFT;

/** Right resource rail and back display — 10% smaller than baseline. */
export const SECONDARY_BOARD_WIDTH = SECONDARY_BOARD_BASE_WIDTH * 0.9;
export const SECONDARY_BOARD_HEIGHT = widescreenHeight(SECONDARY_BOARD_WIDTH) * SECONDARY_BOARD_HEIGHT_SCALE;
export const RIGHT_RESOURCE_RAIL_WIDTH = SECONDARY_BOARD_WIDTH * RIGHT_RESOURCE_RAIL_WIDTH_SCALE;
export const RIGHT_RESOURCE_RAIL_HEIGHT =
  SECONDARY_BOARD_HEIGHT * RESOURCE_RAIL_HEIGHT_SCALE * RIGHT_RESOURCE_RAIL_EXTRA_HEIGHT_SCALE;
export const RIGHT_RESOURCE_RAIL_CENTER_X = 14.92;
export const RIGHT_RESOURCE_RAIL_CENTER_Y = 4.4 + RESOURCE_RAIL_NUDGE_UP;
export const RIGHT_RESOURCE_RAIL_CENTER_Z =
  1 + 3 * RESOURCE_RAIL_NUDGE_ALONG - RESOURCE_RAIL_NUDGE_RIGHT + RESOURCE_RAIL_NUDGE_LEFT - RIGHT_RESOURCE_RAIL_NUDGE_RIGHT;
export const BACK_DISPLAY_CENTER_X = 0;
export const BACK_DISPLAY_CENTER_Y = 4.3;
export const BACK_DISPLAY_CENTER_Z = 14.92;

const FULL_WALL_OBJECT_ACCEPTS = [
  "image",
  "video",
  "audio",
  "image.file",
  "video.file",
  "audio.file",
  "camera.live",
  "microphone.live",
  "screen.live",
  "browser-tab.live",
  "web.embed",
  "web.link",
  "web.browser.shared",
  "document.file",
  "slides.file",
  "whiteboard",
  "note",
  "poll",
  "timer",
  "future"
] as const;

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

  // Classroom layout: 30×30 m square shell, two raised rear tiers.
  // All wall panels share the same height so panorama skins map cleanly.
  // Back wall remains split into five collinear panels only for texture unwrap slices.
  const manifest: RoomManifest = {
    id: input.id ?? `${input.roomId}:manifest:v${input.version ?? 1}`,
    roomId: input.roomId,
    version: input.version ?? 1,
    name: input.name ?? "Default Classroom",
    dimensions: {
      width: 30,
      depth: 30,
      height: 8
    },
    bounds: {
      minX: -13.5,
      maxX: 13.5,
      minZ: -13.5,
      maxZ: 13.5
    },
    tiers: [
      { minZ: 4.0, maxZ: 8.5, floorY: 0.5 },
      // Upper terrace runs flush to the back wall (z = ±depth/2).
      { minZ: 8.5, maxZ: 15.0, floorY: 1.0 }
    ],
    spawnPoints: [
      // Teacher — front stage
      { id: "spawn-teacher", label: "Teacher", position: { x: 0, y: 0, z: -7.5 }, rotation: { y: Math.PI } },
      // Front row — ground level (y=0, z=2.0)
      { id: "spawn-front-1", label: "Front 1", position: { x: -12, y: 0, z: 2.0 }, rotation: { y: Math.PI } },
      { id: "spawn-front-2", label: "Front 2", position: { x: -9,  y: 0, z: 2.0 }, rotation: { y: Math.PI } },
      { id: "spawn-front-3", label: "Front 3", position: { x: -6,  y: 0, z: 2.0 }, rotation: { y: Math.PI } },
      { id: "spawn-front-4", label: "Front 4", position: { x: -3,  y: 0, z: 2.0 }, rotation: { y: Math.PI } },
      { id: "spawn-front-5", label: "Front 5", position: { x:  0,  y: 0, z: 2.0 }, rotation: { y: Math.PI } },
      { id: "spawn-front-6", label: "Front 6", position: { x:  3,  y: 0, z: 2.0 }, rotation: { y: Math.PI } },
      { id: "spawn-front-7", label: "Front 7", position: { x:  6,  y: 0, z: 2.0 }, rotation: { y: Math.PI } },
      { id: "spawn-front-8", label: "Front 8", position: { x:  9,  y: 0, z: 2.0 }, rotation: { y: Math.PI } },
      { id: "spawn-front-9", label: "Front 9", position: { x: 12,  y: 0, z: 2.0 }, rotation: { y: Math.PI } },
      // Middle row — tier 1 (y=0.5, z=5.8)
      { id: "spawn-mid-1", label: "Mid 1", position: { x: -12, y: 0.5, z: 5.8 }, rotation: { y: Math.PI } },
      { id: "spawn-mid-2", label: "Mid 2", position: { x: -9,  y: 0.5, z: 5.8 }, rotation: { y: Math.PI } },
      { id: "spawn-mid-3", label: "Mid 3", position: { x: -6,  y: 0.5, z: 5.8 }, rotation: { y: Math.PI } },
      { id: "spawn-mid-4", label: "Mid 4", position: { x: -3,  y: 0.5, z: 5.8 }, rotation: { y: Math.PI } },
      { id: "spawn-mid-5", label: "Mid 5", position: { x:  0,  y: 0.5, z: 5.8 }, rotation: { y: Math.PI } },
      { id: "spawn-mid-6", label: "Mid 6", position: { x:  3,  y: 0.5, z: 5.8 }, rotation: { y: Math.PI } },
      { id: "spawn-mid-7", label: "Mid 7", position: { x:  6,  y: 0.5, z: 5.8 }, rotation: { y: Math.PI } },
      { id: "spawn-mid-8", label: "Mid 8", position: { x:  9,  y: 0.5, z: 5.8 }, rotation: { y: Math.PI } },
      { id: "spawn-mid-9", label: "Mid 9", position: { x: 12,  y: 0.5, z: 5.8 }, rotation: { y: Math.PI } },
      // Back row — tier 2 (y=1.0, z=10.8), with ~4 m clearance behind it.
      { id: "spawn-back-1",  label: "Back 1",  position: { x: -12.0, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-2",  label: "Back 2",  position: { x:  -9.8, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-3",  label: "Back 3",  position: { x:  -7.6, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-4",  label: "Back 4",  position: { x:  -5.4, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-5",  label: "Back 5",  position: { x:  -3.2, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-6",  label: "Back 6",  position: { x:  -1.0, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-7",  label: "Back 7",  position: { x:   1.0, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-8",  label: "Back 8",  position: { x:   3.2, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-9",  label: "Back 9",  position: { x:   5.4, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-10", label: "Back 10", position: { x:   7.6, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-11", label: "Back 11", position: { x:   9.8, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } },
      { id: "spawn-back-12", label: "Back 12", position: { x:  12.0, y: 1.0, z: 10.8 }, rotation: { y: Math.PI } }
    ],
    walls: [
      { id: "wall-front", label: "Front wall", start: { x: -15, y: 0, z: -15 }, end: { x: 15, y: 0, z: -15 }, height: 8, anchorIds: ["anchor-board", "anchor-media-left"] },
      { id: "wall-left",  label: "Left wall",  start: { x: -15, y: 0, z: -15 }, end: { x: -15, y: 0, z: 15 }, height: 8, anchorIds: ["anchor-left"] },
      { id: "wall-right", label: "Right wall", start: { x:  15, y: 0, z: -15 }, end: { x:  15, y: 0, z: 15 }, height: 8, anchorIds: ["anchor-right"] },
      { id: "wall-back-lo", label: "Back left outer",  start: { x: -15, y: 0, z: 15 }, end: { x: -9, y: 0, z: 15 }, height: 8, anchorIds: [] },
      { id: "wall-back-li", label: "Back left inner",  start: { x:  -9, y: 0, z: 15 }, end: { x: -3, y: 0, z: 15 }, height: 8, anchorIds: [] },
      { id: "wall-back-c",  label: "Back center",      start: { x:  -3, y: 0, z: 15 }, end: { x:  3, y: 0, z: 15 }, height: 8, anchorIds: ["anchor-back"] },
      { id: "wall-back-ri", label: "Back right inner", start: { x:   3, y: 0, z: 15 }, end: { x:  9, y: 0, z: 15 }, height: 8, anchorIds: [] },
      { id: "wall-back-ro", label: "Back right outer", start: { x:   9, y: 0, z: 15 }, end: { x: 15, y: 0, z: 15 }, height: 8, anchorIds: [] }
    ],
    wallAnchors: [
      {
        id: "anchor-board",
        label: "Main board",
        // 10.12 m wide × ~4.99 m tall, aligned to default theater chalkboard artwork
        position: { x: PRIMARY_BOARD_CENTER_X, y: PRIMARY_BOARD_CENTER_Y, z: -14.92 },
        normal: { x: 0, y: 0, z: 1 },
        width: PRIMARY_BOARD_WIDTH,
        height: PRIMARY_BOARD_HEIGHT,
        metadata: {
          accepts: ["image", "video", "audio", "image.file", "video.file", "audio.file", "camera.live", "microphone.live", "screen.live", "browser-tab.live", "web.link", "whiteboard", "note", "poll", "timer"],
          capacity: 4,
          layout: "grid",
          defaultRole: "primary-display",
          hideSurface: true,
          hideObjectHeader: true,
          supportsInteraction: true,
          moderationPolicy: "teacher-only",
          priority: "primary"
        }
      },
      {
        id: "anchor-media-left",
        label: "Front media",
        position: { x: FRONT_MEDIA_CENTER_X, y: FRONT_MEDIA_CENTER_Y, z: -14.92 },
        normal: { x: 0, y: 0, z: 1 },
        width: FRONT_MEDIA_WIDTH,
        height: widescreenHeight(FRONT_MEDIA_WIDTH),
        metadata: {
          accepts: ["image", "audio", "image.file", "audio.file", "microphone.live", "web.link", "whiteboard", "note", "timer"],
          capacity: 3,
          layout: "stack",
          defaultRole: "resource-rail",
          hideSurface: true,
          supportsInteraction: true,
          moderationPolicy: "teacher-only"
        }
      },
      {
        id: "anchor-back",
        label: "Back display",
        position: { x: BACK_DISPLAY_CENTER_X, y: BACK_DISPLAY_CENTER_Y, z: BACK_DISPLAY_CENTER_Z },
        normal: { x: 0, y: 0, z: -1 },
        width: SECONDARY_BOARD_WIDTH,
        height: SECONDARY_BOARD_HEIGHT,
        metadata: {
          accepts: [...FULL_WALL_OBJECT_ACCEPTS],
          capacity: 4,
          layout: "grid",
          defaultRole: "student-share",
          hideSurface: true,
          supportsInteraction: true,
          moderationPolicy: "student-request"
        }
      },
      {
        id: "anchor-left",
        label: "Left resource rail",
        position: { x: LEFT_RESOURCE_RAIL_CENTER_X, y: LEFT_RESOURCE_RAIL_CENTER_Y, z: LEFT_RESOURCE_RAIL_CENTER_Z },
        normal: { x: 1, y: 0, z: 0 },
        width: LEFT_RESOURCE_RAIL_WIDTH,
        height: LEFT_RESOURCE_RAIL_HEIGHT,
        metadata: {
          accepts: [...FULL_WALL_OBJECT_ACCEPTS],
          capacity: 6,
          layout: "rail",
          defaultRole: "resource-rail",
          hideSurface: true,
          supportsInteraction: true,
          moderationPolicy: "student-request"
        }
      },
      {
        id: "anchor-right",
        label: "Right resource rail",
        position: { x: RIGHT_RESOURCE_RAIL_CENTER_X, y: RIGHT_RESOURCE_RAIL_CENTER_Y, z: RIGHT_RESOURCE_RAIL_CENTER_Z },
        normal: { x: -1, y: 0, z: 0 },
        width: RIGHT_RESOURCE_RAIL_WIDTH,
        height: RIGHT_RESOURCE_RAIL_HEIGHT,
        metadata: {
          accepts: [...FULL_WALL_OBJECT_ACCEPTS],
          capacity: 6,
          layout: "rail",
          defaultRole: "resource-rail",
          hideSurface: true,
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
    // Left of teacher stage, well inside bounds and clear of all spawn points.
    hallpassHoldingZone: { minX: -13, maxX: -11, minZ: -11, maxZ: -9 },
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

// ── Workforce Training layout ──────────────────────────────────────────────
// Central training room (40×40 m) sits at the origin. A 4 m-wide U-shaped
// hallway wraps the left, back, and right sides (no hallway on the front wall).
// One 10×10 side room hangs off the outer edge of each hallway segment.
// The three hallway segments meet at the back corners, forming one continuous
// circulation path: left hallway ↔ back hallway ↔ right hallway. The corner
// connector squares stay inside the controlled perimeter via short outer caps.

export const WT_CENTRAL_WIDTH = 40;   // x ∈ [-20, 20]
export const WT_CENTRAL_DEPTH = 40;   // z ∈ [-20, 20]
export const WT_WALL_HEIGHT   = 8;
export const WT_HALLWAY_WIDTH = 4;
export const WT_SIDE_ROOM_SIZE = 10;
export const WT_ENTRANCE_WIDTH = 3;   // doorway opening width on each entrance wall
export const WT_BOARD_WIDTH   = 6;
export const WT_BOARD_HEIGHT  = widescreenHeight(WT_BOARD_WIDTH); // ≈ 3.375

// Derived boundaries (not exported — computed from constants above)
const WT_CX = WT_CENTRAL_WIDTH / 2;             // 20  central room half-width
const WT_CZ = WT_CENTRAL_DEPTH / 2;             // 20  central room half-depth
const WT_OX = WT_CX + WT_HALLWAY_WIDTH;         // 24  outer hallway x edge
const WT_OZ = WT_CZ + WT_HALLWAY_WIDTH;         // 24  outer hallway z edge
const WT_SX = WT_OX + WT_SIDE_ROOM_SIZE;        // 34  side-room outer x edge
const WT_SZ = WT_OZ + WT_SIDE_ROOM_SIZE;        // 34  side-room outer z edge
const WT_SR = WT_SIDE_ROOM_SIZE / 2;            //  5  side-room half-size
const WT_EH = WT_ENTRANCE_WIDTH / 2;            //  1.5 entrance half-width
// Doorways are intentionally off-center so the matching boards can live on the
// longer uninterrupted wall segment instead of overlapping the opening.
const WT_CENTRAL_SIDE_ENTRANCE_CENTER_Z = -8;
const WT_CENTRAL_SIDE_ENTRANCE_MIN_Z = WT_CENTRAL_SIDE_ENTRANCE_CENTER_Z - WT_EH;
const WT_CENTRAL_SIDE_ENTRANCE_MAX_Z = WT_CENTRAL_SIDE_ENTRANCE_CENTER_Z + WT_EH;
const WT_CENTRAL_BACK_ENTRANCE_CENTER_X = -8;
const WT_CENTRAL_BACK_ENTRANCE_MIN_X = WT_CENTRAL_BACK_ENTRANCE_CENTER_X - WT_EH;
const WT_CENTRAL_BACK_ENTRANCE_MAX_X = WT_CENTRAL_BACK_ENTRANCE_CENTER_X + WT_EH;
const WT_SIDE_ROOM_ENTRANCE_CENTER_Z = -3;
const WT_SIDE_ROOM_ENTRANCE_MIN_Z = WT_SIDE_ROOM_ENTRANCE_CENTER_Z - WT_EH;
const WT_SIDE_ROOM_ENTRANCE_MAX_Z = WT_SIDE_ROOM_ENTRANCE_CENTER_Z + WT_EH;
const WT_BACK_SIDE_ROOM_ENTRANCE_CENTER_X = -3;
const WT_BACK_SIDE_ROOM_ENTRANCE_MIN_X = WT_BACK_SIDE_ROOM_ENTRANCE_CENTER_X - WT_EH;
const WT_BACK_SIDE_ROOM_ENTRANCE_MAX_X = WT_BACK_SIDE_ROOM_ENTRANCE_CENTER_X + WT_EH;
const WT_CENTRAL_SIDE_BOARD_CENTER_Z = (WT_CENTRAL_SIDE_ENTRANCE_MAX_Z + WT_CZ) / 2;
const WT_CENTRAL_BACK_BOARD_CENTER_X = (WT_CENTRAL_BACK_ENTRANCE_MAX_X + WT_CX) / 2;
const WT_SIDE_ROOM_HALL_BOARD_CENTER_Z = (WT_SIDE_ROOM_ENTRANCE_MAX_Z + WT_SR) / 2;
const WT_BACK_SIDE_ROOM_HALL_BOARD_CENTER_X = (WT_BACK_SIDE_ROOM_ENTRANCE_MAX_X + WT_SR) / 2;

const WT_WALL_THICKNESS = 0.3;

function wtWall(
  id: string,
  label: string,
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  h: number,
  anchorIds: string[]
): RoomManifest["walls"][number] {
  return { id, label, start, end, height: h, anchorIds, passable: false, thickness: WT_WALL_THICKNESS };
}

function buildWorkforceTrainingWalls(): RoomManifest["walls"] {
  const h = WT_WALL_HEIGHT;
  const w = (id: string, label: string, start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }, anchorIds: string[] = []) =>
    wtWall(id, label, start, end, h, anchorIds);

  return [
    // ── Central room ──────────────────────────────────────────────────────
    w("c-front",    "Central front",           { x: -WT_CX, y: 0, z: -WT_CZ }, { x:  WT_CX, y: 0, z: -WT_CZ }, ["wt-anchor-c-front"]),
    // Left wall (x=-20): entrance shifted toward the front so the board can sit on the back half.
    w("c-left-a",  "Central left (south)",     { x: -WT_CX, y: 0, z: -WT_CZ }, { x: -WT_CX, y: 0, z: WT_CENTRAL_SIDE_ENTRANCE_MIN_Z }),
    w("c-left-b",  "Central left (north)",     { x: -WT_CX, y: 0, z: WT_CENTRAL_SIDE_ENTRANCE_MAX_Z }, { x: -WT_CX, y: 0, z:  WT_CZ }, ["wt-anchor-c-left"]),
    // Right wall (x=20): same front-shifted doorway / back-half board treatment.
    w("c-right-a", "Central right (south)",    { x:  WT_CX, y: 0, z: -WT_CZ }, { x:  WT_CX, y: 0, z: WT_CENTRAL_SIDE_ENTRANCE_MIN_Z }),
    w("c-right-b", "Central right (north)",    { x:  WT_CX, y: 0, z: WT_CENTRAL_SIDE_ENTRANCE_MAX_Z }, { x:  WT_CX, y: 0, z:  WT_CZ }, ["wt-anchor-c-right"]),
    // Back wall (z=20): entrance shifted left so the board can sit on the east segment.
    w("c-back-a",  "Central back (west)",      { x: -WT_CX, y: 0, z:  WT_CZ }, { x: WT_CENTRAL_BACK_ENTRANCE_MIN_X, y: 0, z:  WT_CZ }),
    w("c-back-b",  "Central back (east)",      { x: WT_CENTRAL_BACK_ENTRANCE_MAX_X, y: 0, z:  WT_CZ }, { x:  WT_CX, y: 0, z:  WT_CZ }, ["wt-anchor-c-back"]),

    // ── Outer hallway walls ────────────────────────────────────────────────
    // Left outer wall split into south/north sections so the side-room entrance
    // gap (z ∈ [-5, 5]) is governed exclusively by sr-left-hall-a/b.
    w("h-left-outer-s",    "Left hallway outer (south)",  { x: -WT_OX, y: 0, z: -WT_CZ }, { x: -WT_OX, y: 0, z: -WT_SR }),
    w("h-left-outer-n",    "Left hallway outer (north)",  { x: -WT_OX, y: 0, z:  WT_SR }, { x: -WT_OX, y: 0, z:  WT_CZ }),
    // Back outer hallway wall (z=24): side-room entrance shifted left to match the room door.
    w("h-back-outer-a",    "Back hallway outer (west)",   { x: -WT_CX, y: 0, z:  WT_OZ }, { x: WT_BACK_SIDE_ROOM_ENTRANCE_MIN_X, y: 0, z:  WT_OZ }),
    w("h-back-outer-b",    "Back hallway outer (east)",   { x: WT_BACK_SIDE_ROOM_ENTRANCE_MAX_X, y: 0, z:  WT_OZ }, { x:  WT_CX, y: 0, z:  WT_OZ }),
    // Back-corner caps keep the connector squares inside the hallway perimeter.
    w("h-back-corner-left-west",   "Back-left hallway outer wall",  { x: -WT_OX, y: 0, z: WT_CZ }, { x: -WT_OX, y: 0, z: WT_OZ }),
    w("h-back-corner-left-north",  "Back-left hallway top wall",    { x: -WT_OX, y: 0, z: WT_OZ }, { x: -WT_CX, y: 0, z: WT_OZ }),
    // Right outer wall split into south/north sections (same reason as left)
    w("h-right-outer-s",   "Right hallway outer (south)", { x:  WT_OX, y: 0, z: -WT_CZ }, { x:  WT_OX, y: 0, z: -WT_SR }),
    w("h-right-outer-n",   "Right hallway outer (north)", { x:  WT_OX, y: 0, z:  WT_SR }, { x:  WT_OX, y: 0, z:  WT_CZ }),
    w("h-back-corner-right-east",  "Back-right hallway outer wall", { x: WT_OX, y: 0, z: WT_CZ }, { x: WT_OX, y: 0, z: WT_OZ }),
    w("h-back-corner-right-north", "Back-right hallway top wall",   { x: WT_CX, y: 0, z: WT_OZ }, { x: WT_OX, y: 0, z: WT_OZ }),
    // Front caps close the U-shape at the front corners
    w("h-front-cap-left",  "Left hallway front cap",      { x: -WT_OX, y: 0, z: -WT_CZ }, { x: -WT_CX, y: 0, z: -WT_CZ }),
    w("h-front-cap-right", "Right hallway front cap",     { x:  WT_CX, y: 0, z: -WT_CZ }, { x:  WT_OX, y: 0, z: -WT_CZ }),

    // ── Left side room (x ∈ [-34, -24], z ∈ [-5, 5]) ─────────────────────
    w("sr-left-outer",  "Left side room outer wall",              { x: -WT_SX, y: 0, z: -WT_SR }, { x: -WT_SX, y: 0, z:  WT_SR }, ["wt-anchor-sl-outer"]),
    w("sr-left-top",    "Left side room top wall",                { x: -WT_SX, y: 0, z:  WT_SR }, { x: -WT_OX, y: 0, z:  WT_SR }, ["wt-anchor-sl-top"]),
    w("sr-left-bot",    "Left side room bottom wall",             { x: -WT_SX, y: 0, z: -WT_SR }, { x: -WT_OX, y: 0, z: -WT_SR }, ["wt-anchor-sl-bot"]),
    // Hallway-facing wall (x=-24): entrance shifted toward the south/front.
    w("sr-left-hall-a", "Left side room hallway wall (north)",    { x: -WT_OX, y: 0, z: WT_SIDE_ROOM_ENTRANCE_MAX_Z }, { x: -WT_OX, y: 0, z:  WT_SR }, ["wt-anchor-sl-hall"]),
    w("sr-left-hall-b", "Left side room hallway wall (south)",    { x: -WT_OX, y: 0, z: -WT_SR }, { x: -WT_OX, y: 0, z: WT_SIDE_ROOM_ENTRANCE_MIN_Z }),

    // ── Back side room (x ∈ [-5, 5], z ∈ [24, 34]) ───────────────────────
    // Hallway-facing wall (z=24): entrance shifted toward the west/left.
    w("sr-back-hall-a", "Back side room hallway wall (west)",     { x: -WT_SR, y: 0, z:  WT_OZ }, { x: WT_BACK_SIDE_ROOM_ENTRANCE_MIN_X, y: 0, z:  WT_OZ }),
    w("sr-back-hall-b", "Back side room hallway wall (east)",     { x: WT_BACK_SIDE_ROOM_ENTRANCE_MAX_X, y: 0, z:  WT_OZ }, { x:  WT_SR, y: 0, z:  WT_OZ }, ["wt-anchor-sb-hall"]),
    w("sr-back-outer",  "Back side room outer wall",              { x: -WT_SR, y: 0, z:  WT_SZ }, { x:  WT_SR, y: 0, z:  WT_SZ }, ["wt-anchor-sb-outer"]),
    w("sr-back-left",   "Back side room left wall",               { x: -WT_SR, y: 0, z:  WT_OZ }, { x: -WT_SR, y: 0, z:  WT_SZ }, ["wt-anchor-sb-left"]),
    w("sr-back-right",  "Back side room right wall",              { x:  WT_SR, y: 0, z:  WT_OZ }, { x:  WT_SR, y: 0, z:  WT_SZ }, ["wt-anchor-sb-right"]),

    // ── Right side room (x ∈ [24, 34], z ∈ [-5, 5]) ──────────────────────
    // Hallway-facing wall (x=24): entrance shifted toward the south/front.
    w("sr-right-hall-a", "Right side room hallway wall (north)",  { x:  WT_OX, y: 0, z: WT_SIDE_ROOM_ENTRANCE_MAX_Z }, { x:  WT_OX, y: 0, z:  WT_SR }, ["wt-anchor-sr-hall"]),
    w("sr-right-hall-b", "Right side room hallway wall (south)",  { x:  WT_OX, y: 0, z: -WT_SR }, { x:  WT_OX, y: 0, z: WT_SIDE_ROOM_ENTRANCE_MIN_Z }),
    w("sr-right-outer",  "Right side room outer wall",            { x:  WT_SX, y: 0, z: -WT_SR }, { x:  WT_SX, y: 0, z:  WT_SR }, ["wt-anchor-sr-outer"]),
    w("sr-right-top",    "Right side room top wall",              { x:  WT_OX, y: 0, z:  WT_SR }, { x:  WT_SX, y: 0, z:  WT_SR }, ["wt-anchor-sr-top"]),
    w("sr-right-bot",    "Right side room bottom wall",           { x:  WT_OX, y: 0, z: -WT_SR }, { x:  WT_SX, y: 0, z: -WT_SR }, ["wt-anchor-sr-bot"]),
  ];
}

function buildWorkforceTrainingAnchors(): RoomManifest["wallAnchors"] {
  const y = 4.0;
  const d = 0.1; // inset from wall surface
  const w = WT_BOARD_WIDTH;
  const h = WT_BOARD_HEIGHT;
  const accepts = [...FULL_WALL_OBJECT_ACCEPTS];
  const meta = (moderationPolicy: string) => ({
    accepts,
    capacity: 4,
    layout: "grid",
    defaultRole: "resource-rail",
    hideSurface: true,
    supportsInteraction: true,
    moderationPolicy
  });

  return [
    // ── Central room ──────────────────────────────────────────────────────
    {
      id: "wt-anchor-c-front", label: "Central room front board",
      position: { x: 0, y, z: -WT_CZ + d }, normal: { x: 0, y: 0, z: 1 },
      width: PRIMARY_BOARD_WIDTH, height: PRIMARY_BOARD_HEIGHT,
      metadata: { accepts, capacity: 4, layout: "grid", defaultRole: "primary-display", hideSurface: true, hideObjectHeader: true, supportsInteraction: true, moderationPolicy: "teacher-only", priority: "primary" }
    },
    {
      id: "wt-anchor-c-left", label: "Central room left board",
      position: { x: -WT_CX + d, y, z: WT_CENTRAL_SIDE_BOARD_CENTER_Z }, normal: { x: 1, y: 0, z: 0 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-c-right", label: "Central room right board",
      position: { x: WT_CX - d, y, z: WT_CENTRAL_SIDE_BOARD_CENTER_Z }, normal: { x: -1, y: 0, z: 0 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-c-back", label: "Central room back board",
      position: { x: WT_CENTRAL_BACK_BOARD_CENTER_X, y, z: WT_CZ - d }, normal: { x: 0, y: 0, z: -1 },
      width: w, height: h, metadata: meta("student-request")
    },

    // ── Left side room (center: x=-29, z=0) ───────────────────────────────
    {
      id: "wt-anchor-sl-outer", label: "Left side room outer board",
      position: { x: -WT_SX + d, y, z: 0 }, normal: { x: 1, y: 0, z: 0 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-sl-top", label: "Left side room top board",
      position: { x: -(WT_OX + WT_SX) / 2, y, z: WT_SR - d }, normal: { x: 0, y: 0, z: -1 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-sl-bot", label: "Left side room bottom board",
      position: { x: -(WT_OX + WT_SX) / 2, y, z: -WT_SR + d }, normal: { x: 0, y: 0, z: 1 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-sl-hall", label: "Left side room hallway board",
      position: { x: -WT_OX - d, y, z: WT_SIDE_ROOM_HALL_BOARD_CENTER_Z }, normal: { x: -1, y: 0, z: 0 },
      width: w, height: h, metadata: meta("student-request")
    },

    // ── Back side room (center: x=0, z=29) ────────────────────────────────
    {
      id: "wt-anchor-sb-hall", label: "Back side room hallway board",
      position: { x: WT_BACK_SIDE_ROOM_HALL_BOARD_CENTER_X, y, z: WT_OZ + d }, normal: { x: 0, y: 0, z: 1 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-sb-outer", label: "Back side room outer board",
      position: { x: 0, y, z: WT_SZ - d }, normal: { x: 0, y: 0, z: -1 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-sb-left", label: "Back side room left board",
      position: { x: -WT_SR + d, y, z: (WT_OZ + WT_SZ) / 2 }, normal: { x: 1, y: 0, z: 0 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-sb-right", label: "Back side room right board",
      position: { x: WT_SR - d, y, z: (WT_OZ + WT_SZ) / 2 }, normal: { x: -1, y: 0, z: 0 },
      width: w, height: h, metadata: meta("student-request")
    },

    // ── Right side room (center: x=29, z=0) ───────────────────────────────
    {
      id: "wt-anchor-sr-hall", label: "Right side room hallway board",
      position: { x: WT_OX + d, y, z: WT_SIDE_ROOM_HALL_BOARD_CENTER_Z }, normal: { x: 1, y: 0, z: 0 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-sr-outer", label: "Right side room outer board",
      position: { x: WT_SX - d, y, z: 0 }, normal: { x: -1, y: 0, z: 0 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-sr-top", label: "Right side room top board",
      position: { x: (WT_OX + WT_SX) / 2, y, z: WT_SR - d }, normal: { x: 0, y: 0, z: -1 },
      width: w, height: h, metadata: meta("student-request")
    },
    {
      id: "wt-anchor-sr-bot", label: "Right side room bottom board",
      position: { x: (WT_OX + WT_SX) / 2, y, z: -WT_SR + d }, normal: { x: 0, y: 0, z: 1 },
      width: w, height: h, metadata: meta("student-request")
    },
  ];
}

export function createWorkforceTrainingManifest(input: {
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
    spatialAudio: { ...DEFAULT_SPATIAL_AUDIO, ...input.config?.spatialAudio }
  };

  // Trainee spawn grid: 5×5 inside the central room, x ∈ [-9, 9], z ∈ [-3, 9].
  const traineeSpawns: RoomManifest["spawnPoints"] = [];
  const xPositions = [-9, -4.5, 0, 4.5, 9];
  const zPositions = [-3, 0, 3, 6, 9];
  let traineeIndex = 1;
  for (const z of zPositions) {
    for (const x of xPositions) {
      traineeSpawns.push({
        id: `spawn-trainee-${traineeIndex++}`,
        label: `Trainee ${traineeIndex - 1}`,
        position: { x, y: 0, z },
        rotation: { y: Math.PI }
      });
    }
  }

  const manifest: RoomManifest = {
    id: input.id ?? `${input.roomId}:manifest:v${input.version ?? 1}`,
    roomId: input.roomId,
    version: input.version ?? 1,
    name: input.name ?? "Workforce Training",
    dimensions: {
      width:  68, // x ∈ [-34, 34]
      depth:  54, // z ∈ [-20, 34]
      height: WT_WALL_HEIGHT
    },
    bounds: { minX: -WT_SX, maxX: WT_SX, minZ: -WT_CZ, maxZ: WT_SZ },
    tiers: [],
    spawnPoints: [
      { id: "spawn-instructor", label: "Instructor", position: { x: 0, y: 0, z: -17 }, rotation: { y: 0 } },
      ...traineeSpawns
    ],
    walls: buildWorkforceTrainingWalls(),
    wallAnchors: buildWorkforceTrainingAnchors(),
    projection: { kind: "top-down-v1", scale: 1, origin: { x: 0, y: 0 } },
    capabilities: createRoomCapabilities(config),
    spatialAudio: config.spatialAudio,
    features: [
      { key: "screen-share",    enabled: false, config: { preparedTrackKind: "screen" } },
      { key: "computer-audio",  enabled: false, config: { preparedTrackKind: "system-audio" } },
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

// ── Free-for-All layout ──────────────────────────────────────────────────────
// Circular main room (Ø ~46 m) centered on origin. Four cardinal exits open
// into short 6 m halls leading to four 14×14 m medium adjoining rooms. All
// walls are thick + impassable (matches workforce-training collision style).

export const FFA_MAIN_RADIUS = 23;
export const FFA_WALL_HEIGHT = 8;
export const FFA_WALL_THICKNESS = 0.3;
export const FFA_HALL_LENGTH = 6;
export const FFA_HALL_WIDTH = 4;
export const FFA_ADJOINING_SIZE = 14;
export const FFA_PERIMETER_SEGMENTS = 32;
export const FFA_EXIT_HALF_ARC = FFA_HALL_WIDTH / FFA_MAIN_RADIUS / 2;
export const FFA_CENTRAL_SQUARE_SIZE = 12;
/** Taller hub walls so 12 m boards can use the full central square faces. */
export const FFA_CENTRAL_SQUARE_WALL_HEIGHT = 12;
export const FFA_STATIC_BOARD_WIDTH = 6;
export const FFA_STATIC_BOARD_HEIGHT = widescreenHeight(FFA_STATIC_BOARD_WIDTH);
export const FFA_BOARD_WALL_INSET = 0.1;

function circleWallSegments(args: {
  centerX: number;
  centerZ: number;
  radius: number;
  segmentCount: number;
  thickness: number;
  height: number;
  gaps: { angleRad: number; halfWidthRad: number }[];
  idPrefix: string;
}): WallPlane[] {
  const segments: WallPlane[] = [];
  const step = (2 * Math.PI) / args.segmentCount;
  for (let i = 0; i < args.segmentCount; i++) {
    const startAngle = i * step;
    const endAngle = startAngle + step;
    const midAngle = (startAngle + endAngle) / 2;
    // Use halfWidthRad + step/2 so segments that straddle a gap edge are also removed.
    // Without the step/2 buffer, a gap narrower than step/2 removes no segments at all.
    const inGap = args.gaps.some((g) => {
      const diff = ((midAngle - g.angleRad + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      return Math.abs(diff) < g.halfWidthRad + step / 2;
    });
    if (inGap) continue;
    segments.push({
      id: `${args.idPrefix}-${i}`,
      label: `Perimeter ${i}`,
      start: {
        x: args.centerX + args.radius * Math.cos(startAngle),
        y: 0,
        z: args.centerZ + args.radius * Math.sin(startAngle)
      },
      end: {
        x: args.centerX + args.radius * Math.cos(endAngle),
        y: 0,
        z: args.centerZ + args.radius * Math.sin(endAngle)
      },
      height: args.height,
      anchorIds: [],
      passable: false,
      thickness: args.thickness
    });
  }
  return segments;
}

function buildFreeForAllWalls(): WallPlane[] {
  const walls: WallPlane[] = [];
  const centralHalf = FFA_CENTRAL_SQUARE_SIZE / 2;
  // Central cubed wall ring (plan-required square zone boundary in the cylindrical hub).
  walls.push(
    {
      id: "ffa-central-north",
      label: "Central square north",
      start: { x: -centralHalf, y: 0, z: -centralHalf },
      end: { x: centralHalf, y: 0, z: -centralHalf },
      height: FFA_CENTRAL_SQUARE_WALL_HEIGHT,
      anchorIds: [],
      passable: false,
      thickness: FFA_WALL_THICKNESS
    },
    {
      id: "ffa-central-east",
      label: "Central square east",
      start: { x: centralHalf, y: 0, z: -centralHalf },
      end: { x: centralHalf, y: 0, z: centralHalf },
      height: FFA_CENTRAL_SQUARE_WALL_HEIGHT,
      anchorIds: [],
      passable: false,
      thickness: FFA_WALL_THICKNESS
    },
    {
      id: "ffa-central-south",
      label: "Central square south",
      start: { x: centralHalf, y: 0, z: centralHalf },
      end: { x: -centralHalf, y: 0, z: centralHalf },
      height: FFA_CENTRAL_SQUARE_WALL_HEIGHT,
      anchorIds: [],
      passable: false,
      thickness: FFA_WALL_THICKNESS
    },
    {
      id: "ffa-central-west",
      label: "Central square west",
      start: { x: -centralHalf, y: 0, z: centralHalf },
      end: { x: -centralHalf, y: 0, z: -centralHalf },
      height: FFA_CENTRAL_SQUARE_WALL_HEIGHT,
      anchorIds: [],
      passable: false,
      thickness: FFA_WALL_THICKNESS
    }
  );
  // Cardinal exit angles: east = 0, south = π/2, west = π, north = 3π/2
  const exits = [
    { angle: 0, label: "east" },
    { angle: Math.PI / 2, label: "south" },
    { angle: Math.PI, label: "west" },
    { angle: (3 * Math.PI) / 2, label: "north" }
  ];

  // Circular perimeter with 4 gaps
  walls.push(
    ...circleWallSegments({
      centerX: 0,
      centerZ: 0,
      radius: FFA_MAIN_RADIUS,
      segmentCount: FFA_PERIMETER_SEGMENTS,
      thickness: FFA_WALL_THICKNESS,
      height: FFA_WALL_HEIGHT,
      gaps: exits.map((e) => ({ angleRad: e.angle, halfWidthRad: FFA_EXIT_HALF_ARC })),
      idPrefix: "ffa-perim"
    })
  );

  // For each cardinal direction: hall side walls + adjoining room perimeter
  for (const exit of exits) {
    const cos = Math.cos(exit.angle);
    const sin = Math.sin(exit.angle);
    // Perpendicular direction (for hall width)
    const perpCos = -sin;
    const perpSin = cos;
    const hw = FFA_HALL_WIDTH / 2;

    const hallStart = FFA_MAIN_RADIUS;
    const hallEnd = FFA_MAIN_RADIUS + FFA_HALL_LENGTH;

    // Hall side walls (two parallel walls along the exit direction)
    for (const side of [-1, 1]) {
      const offX = side * hw * perpCos;
      const offZ = side * hw * perpSin;
      walls.push({
        id: `ffa-hall-${exit.label}-side-${side > 0 ? "a" : "b"}`,
        label: `${exit.label} hall side`,
        start: { x: hallStart * cos + offX, y: 0, z: hallStart * sin + offZ },
        end: { x: hallEnd * cos + offX, y: 0, z: hallEnd * sin + offZ },
        height: FFA_WALL_HEIGHT,
        anchorIds: [],
        passable: false,
        thickness: FFA_WALL_THICKNESS
      });
    }

    // Adjoining room center
    const roomCenterX = (hallEnd + FFA_ADJOINING_SIZE / 2) * cos;
    const roomCenterZ = (hallEnd + FFA_ADJOINING_SIZE / 2) * sin;
    const half = FFA_ADJOINING_SIZE / 2;
    const doorHalfWidth = FFA_HALL_WIDTH / 2;

    // Entrance wall (the face toward the hall) – split into two segments around the doorway
    const entranceDist = hallEnd;
    const eX = entranceDist * cos;
    const eZ = entranceDist * sin;
    // Left segment: from left corner to left door edge
    walls.push({
      id: `ffa-adj-${exit.label}-entrance-l`,
      label: `${exit.label} adj entrance left`,
      start: { x: eX + half * perpCos, y: 0, z: eZ + half * perpSin },
      end: { x: eX + doorHalfWidth * perpCos, y: 0, z: eZ + doorHalfWidth * perpSin },
      height: FFA_WALL_HEIGHT,
      anchorIds: [],
      passable: false,
      thickness: FFA_WALL_THICKNESS
    });
    // Right segment: from right door edge to right corner
    walls.push({
      id: `ffa-adj-${exit.label}-entrance-r`,
      label: `${exit.label} adj entrance right`,
      start: { x: eX - doorHalfWidth * perpCos, y: 0, z: eZ - doorHalfWidth * perpSin },
      end: { x: eX - half * perpCos, y: 0, z: eZ - half * perpSin },
      height: FFA_WALL_HEIGHT,
      anchorIds: [],
      passable: false,
      thickness: FFA_WALL_THICKNESS
    });

    // Back wall (opposite the entrance)
    const backDist = hallEnd + FFA_ADJOINING_SIZE;
    const bX = backDist * cos;
    const bZ = backDist * sin;
    walls.push({
      id: `ffa-adj-${exit.label}-back`,
      label: `${exit.label} adj back`,
      start: { x: bX + half * perpCos, y: 0, z: bZ + half * perpSin },
      end: { x: bX - half * perpCos, y: 0, z: bZ - half * perpSin },
      height: FFA_WALL_HEIGHT,
      anchorIds: [`ffa-adj-${exit.label}-anchor`],
      passable: false,
      thickness: FFA_WALL_THICKNESS
    });

    // Two side walls of the adjoining room
    for (const side of [-1, 1]) {
      const sX = eX + side * half * perpCos;
      const sZ = eZ + side * half * perpSin;
      walls.push({
        id: `ffa-adj-${exit.label}-side-${side > 0 ? "a" : "b"}`,
        label: `${exit.label} adj side`,
        start: { x: sX, y: 0, z: sZ },
        end: { x: sX + FFA_ADJOINING_SIZE * cos, y: 0, z: sZ + FFA_ADJOINING_SIZE * sin },
        height: FFA_WALL_HEIGHT,
        anchorIds: [],
        passable: false,
        thickness: FFA_WALL_THICKNESS
      });
    }

    // Suppress unused roomCenterX/Z — used conceptually for layout documentation
    void roomCenterX;
    void roomCenterZ;
  }

  return walls;
}

function buildFreeForAllStaticAnchors(): WallAnchor[] {
  const anchors: WallAnchor[] = [];
  const exits = [
    { angle: 0, label: "east" },
    { angle: Math.PI / 2, label: "south" },
    { angle: Math.PI, label: "west" },
    { angle: (3 * Math.PI) / 2, label: "north" }
  ];

  const FULL_ACCEPTS = [
    "image", "video", "audio",
    "image.file", "video.file", "audio.file",
    "camera.live", "microphone.live", "screen.live", "browser-tab.live",
    "web.embed", "web.link", "document.file", "slides.file",
    "whiteboard", "note", "poll", "timer", "future"
  ];

  for (const exit of exits) {
    const cos = Math.cos(exit.angle);
    const sin = Math.sin(exit.angle);
    const backDist =
      FFA_MAIN_RADIUS + FFA_HALL_LENGTH + FFA_ADJOINING_SIZE - FFA_WALL_THICKNESS / 2 - FFA_BOARD_WALL_INSET;
    // Normal points inward (toward room center, i.e. opposite of exit direction)
    anchors.push({
      id: `ffa-adj-${exit.label}-anchor`,
      label: `${exit.label.charAt(0).toUpperCase() + exit.label.slice(1)} Board`,
      position: { x: backDist * cos, y: 4.0, z: backDist * sin },
      normal: { x: -cos, y: 0, z: -sin },
      width: FFA_STATIC_BOARD_WIDTH,
      height: FFA_STATIC_BOARD_HEIGHT,
      metadata: {
        accepts: FULL_ACCEPTS,
        capacity: 4,
        layout: "grid",
        supportsInteraction: true,
        moderationPolicy: "student-request",
        hideSurface: true,
        hideObjectHeader: true
      }
    });
  }

  return anchors;
}

function buildFreeForAllSpawnPoints(): SpawnPoint[] {
  const spawns: SpawnPoint[] = [];
  const innerRadius = 10;
  const count = 8;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI;
    const x = innerRadius * Math.cos(angle);
    const z = innerRadius * Math.sin(angle);
    // Face toward center
    const facingY = Math.atan2(-x, -z);
    spawns.push({
      id: `spawn-ffa-${i + 1}`,
      label: `Participant ${i + 1}`,
      position: { x, y: 0, z },
      rotation: { y: facingY }
    });
  }
  return spawns;
}

export function createFreeForAllManifest(input: {
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
    spatialAudio: { ...DEFAULT_SPATIAL_AUDIO, ...input.config?.spatialAudio }
  };

  const manifest: RoomManifest = {
    id: input.id ?? `${input.roomId}:manifest:v${input.version ?? 1}`,
    roomId: input.roomId,
    version: input.version ?? 1,
    name: input.name ?? "Free-for-All",
    dimensions: {
      // Outer extents: radius + hall + room = 23 + 6 + 14 = 43 m to each side → 86 m square
      width: 86,
      depth: 86,
      height: FFA_CENTRAL_SQUARE_WALL_HEIGHT
    },
    bounds: {
      minX: -43, maxX: 43,
      minZ: -43, maxZ: 43
    },
    tiers: [],
    spawnPoints: buildFreeForAllSpawnPoints(),
    walls: buildFreeForAllWalls(),
    wallAnchors: buildFreeForAllStaticAnchors(),
    projection: { kind: "top-down-v1", scale: 1, origin: { x: 0, y: 0 } },
    capabilities: createRoomCapabilities(config),
    spatialAudio: config.spatialAudio,
    features: [
      { key: "screen-share", enabled: false, config: { preparedTrackKind: "screen" } },
      { key: "computer-audio", enabled: false, config: { preparedTrackKind: "system-audio" } },
      {
        key: "wall-objects",
        enabled: true,
        config: {
          creationDefault: "student-direct",
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

/** Minimum along-wall gap between dynamic board centers (meters). */
export const DYNAMIC_BOARD_PLACEMENT_MIN_GAP_M = 0.1;

export type DynamicBoardPlacementAnchor = {
  position: { x: number; z: number };
  width: number;
  wallId?: string;
};

function projectPointAlongWall(
  wall: { start: { x: number; z: number }; end: { x: number; z: number } },
  point: { x: number; z: number }
) {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  const relX = point.x - wall.start.x;
  const relZ = point.z - wall.start.z;
  return {
    along: relX * ux + relZ * uz,
    perpendicular: Math.abs(relX * uz - relZ * ux)
  };
}

function wallSpanIntervalsOverlap(
  aAlong: number,
  aWidth: number,
  bAlong: number,
  bWidth: number,
  minGapMeters: number
) {
  const a0 = aAlong - aWidth / 2;
  const a1 = aAlong + aWidth / 2;
  const b0 = bAlong - bWidth / 2;
  const b1 = bAlong + bWidth / 2;
  return a1 + minGapMeters > b0 && b1 + minGapMeters > a0;
}

/**
 * Rejects dynamic board placement only when spans overlap along the same wall segment.
 * Anchors on other walls are ignored (including corner false positives from xz distance).
 */
export function validateDynamicBoardPlacement(
  manifest: { walls: RoomManifest["walls"] },
  existingAnchors: DynamicBoardPlacementAnchor[],
  proposed: { wallId: string; center: { x: number; z: number }; width: number },
  options?: { minGapMeters?: number; offWallToleranceMeters?: number }
): { ok: true } | { ok: false; reason: "wall-not-found" | "overlaps-anchor" } {
  const wall = manifest.walls.find((candidate) => candidate.id === proposed.wallId);
  if (!wall) return { ok: false, reason: "wall-not-found" };

  const minGap = options?.minGapMeters ?? DYNAMIC_BOARD_PLACEMENT_MIN_GAP_M;
  const offWallTolerance = options?.offWallToleranceMeters ?? 1.25;
  const proposedProjection = projectPointAlongWall(wall, proposed.center);

  for (const anchor of existingAnchors) {
    if (anchor.wallId && anchor.wallId !== proposed.wallId) continue;

    const anchorProjection = projectPointAlongWall(wall, anchor.position);
    if (!anchor.wallId && anchorProjection.perpendicular > offWallTolerance) continue;

    if (
      wallSpanIntervalsOverlap(
        proposedProjection.along,
        proposed.width,
        anchorProjection.along,
        anchor.width,
        minGap
      )
    ) {
      return { ok: false, reason: "overlaps-anchor" };
    }
  }

  return { ok: true };
}

/** Returns the floor elevation (y) for a given z coordinate based on the manifest's tier definitions. */
export function floorYFromZ(manifest: RoomManifest, z: number): number {
  if (!manifest.tiers?.length) return 0;
  // Walk tiers from highest minZ down — first match wins (tiers must not overlap).
  const sorted = [...manifest.tiers].sort((a, b) => b.minZ - a.minZ);
  const tier = sorted.find((t) => z >= t.minZ);
  return tier?.floorY ?? 0;
}

export function clampPositionToBounds(manifest: RoomManifest, position: Vector3): Vector3 {
  const { x, z } = clampXZToBounds(manifest, position.x, position.z);
  return {
    x,
    y: floorYFromZ(manifest, z),
    z
  };
}

export function clampXZToBounds(manifest: RoomManifest, x: number, z: number) {
  return {
    x: Math.min(Math.max(x, manifest.bounds.minX), manifest.bounds.maxX),
    z: Math.min(Math.max(z, manifest.bounds.minZ), manifest.bounds.maxZ)
  };
}

export function createGroundHeightContext(manifest: RoomManifest, pieces: BuildPiece[]) {
  return buildGroundHeightContext(manifest, pieces, (z) => floorYFromZ(manifest, z));
}

import {
  AVATAR_STAND_HEIGHT,
  manifestWallToCollider,
  resolveWallCollisionsV2
} from "./wall-collision.js";

/**
 * Push `newPos` back so the avatar cannot enter any non-passable wall volume.
 * Ground-level avatar height; equivalent to `resolveWallCollisionsV2` at y=0.
 */
export function resolveWallCollisions(
  oldPos: { x: number; z: number },
  newPos: { x: number; z: number },
  walls: RoomManifest["walls"]
): { x: number; z: number } {
  return resolveWallCollisionsV2(
    oldPos,
    newPos,
    walls.map((wall) => manifestWallToCollider(wall)),
    0,
    AVATAR_STAND_HEIGHT
  );
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

/**
 * Returns a non-overlapping position for the Nth member of a group centered at `center`.
 * Slot 0 = center, slots 1–6 = ring at 1.5 m, slots 7–18 = outer ring at 3.0 m.
 * The y coordinate is inherited from the center so all members stay on the same tier.
 */
export function computeGroupMemberPosition(center: Vector3, memberIndex: number): Vector3 {
  if (memberIndex === 0) return { x: center.x, y: center.y, z: center.z };
  if (memberIndex <= 6) {
    const angle = ((memberIndex - 1) / 6) * (Math.PI * 2);
    return { x: center.x + Math.sin(angle) * 1.5, y: center.y, z: center.z + Math.cos(angle) * 1.5 };
  }
  const angle = ((memberIndex - 7) / 12) * (Math.PI * 2);
  return { x: center.x + Math.sin(angle) * 3.0, y: center.y, z: center.z + Math.cos(angle) * 3.0 };
}

export function computeGroupTargetPositionFromAnchor(manifest: RoomManifest, anchorId: string, offsetMeters = 2.6): Vector3 | null {
  const anchor = manifest.wallAnchors.find((candidate) => candidate.id === anchorId);
  if (!anchor) return null;
  return clampPositionToBounds(manifest, {
    x: anchor.position.x + anchor.normal.x * offsetMeters,
    y: 0,
    z: anchor.position.z + anchor.normal.z * offsetMeters
  });
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

/** Maps a 2D viewBox delta (percent of map width/depth) to world-space XZ movement. */
export function delta2DToWorldXZ(manifest: RoomManifest, delta: { dx: number; dy: number }) {
  const width = manifest.bounds.maxX - manifest.bounds.minX;
  const depth = manifest.bounds.maxZ - manifest.bounds.minZ;
  return {
    dx: (delta.dx / 100) * width,
    dz: (delta.dy / 100) * depth
  };
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

/** Walkable floor center in XZ (matches movement / camera yaw convention). */
export function roomCenterXZ(manifest: RoomManifest): { x: number; z: number } {
  return {
    x: (manifest.bounds.minX + manifest.bounds.maxX) / 2,
    z: (manifest.bounds.minZ + manifest.bounds.maxZ) / 2
  };
}

/** Yaw so the avatar faces `toward` from `from` (same atan2 as click-to-move). */
export function rotationFacingPosition(from: Vector3, toward: { x: number; z: number }): { y: number } {
  return { y: Math.atan2(toward.x - from.x, toward.z - from.z) };
}

export function rotationFacingRoomCenter(manifest: RoomManifest, position: Vector3): { y: number } {
  return rotationFacingPosition(position, roomCenterXZ(manifest));
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
  buildPieces?: BuildPiece[];
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

  let position = spawn.position;
  if (input.buildPieces && input.buildPieces.length > 0) {
    const groundCtx = createGroundHeightContext(input.manifest, input.buildPieces);
    position = {
      ...position,
      y: groundHeightAt(position.x, position.z, groundCtx, position.y, "snap")
    };
  }

  return {
    type: "avatar.state.v1",
    sentAt: input.sentAt ?? Date.now(),
    participantId: input.participantId,
    position,
    rotation: rotationFacingRoomCenter(input.manifest, position),
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
export function applyDefaultWallAnchorDimensions(
  manifest: RoomManifest,
  roomType: RoomType = "classroom"
): RoomManifest {
  if (roomType !== "classroom") return manifest;
  const template = createDefaultRoomManifest({
    roomId: manifest.roomId,
    name: manifest.name,
    version: manifest.version
  });
  const defaultsById = new Map(
    template.wallAnchors.map((anchor) => [
      anchor.id,
      { width: anchor.width, height: anchor.height, position: anchor.position }
    ])
  );

  return {
    ...manifest,
    wallAnchors: manifest.wallAnchors.map((anchor) => {
      const defaults = defaultsById.get(anchor.id);
      return defaults ? { ...anchor, ...defaults } : anchor;
    })
  };
}

/** Merge the current default room geometry into a stored manifest. */
export function applyDefaultRoomGeometry(
  manifest: RoomManifest,
  roomType: RoomType = "classroom"
): RoomManifest {
  if (roomType !== "classroom") return manifest;
  const template = createDefaultRoomManifest({
    roomId: manifest.roomId,
    name: manifest.name,
    version: manifest.version
  });

  return RoomManifestSchema.parse({
    ...manifest,
    dimensions: template.dimensions,
    bounds: template.bounds,
    tiers: template.tiers,
    spawnPoints: template.spawnPoints,
    walls: template.walls,
    wallAnchors: template.wallAnchors,
    hallpassHoldingZone: template.hallpassHoldingZone
  });
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
  isBoardGrantActive
} from "./classroom";
export {
  anchorAcceptsWallObjectType,
  anchorHasOccupyingWallObject,
  anchorSupportsCreateOption,
  baseAcceptedKind,
  fileInputAcceptForAnchor,
  fileKindForWallObjectType,
  isOccupyingWallObjectStatus
} from "./wallAnchorPolicy";
export type { WallAnchorCreateOption } from "./wallAnchorPolicy";
export { canTouchRoomObject } from "./roomObjectTouch";
export {
  createInitialPollState,
  isValidPollChoiceId,
  normalizePollInlineData,
  pollTotalVotes,
  pollVoteCounts,
  readPollState
} from "./poll";
export type { PollChoice, PollState } from "./poll";
