import { isVerseRoomType, PhysicsTuningSchema, QualityLevelSchema, ViewModeSchema } from "@3dspace/contracts";

function envNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const physicsDefaults = PhysicsTuningSchema.parse({});

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
export const AUTH_REQUIRED =
  process.env.NEXT_PUBLIC_E2E_DEV_AUTH !== "true" &&
  process.env.NEXT_PUBLIC_AUTH_REQUIRED !== "false" &&
  (process.env.NEXT_PUBLIC_AUTH_REQUIRED === "true" || Boolean(process.env.NEXT_PUBLIC_API_URL));
export const API_AUTH_START_URL = `${API_URL}/v1/auth/google/start`;

export const CLIENT_TUNING = {
  defaultViewMode: ViewModeSchema.parse(process.env.DEFAULT_VIEW_MODE ?? "3d"),
  defaultQuality: QualityLevelSchema.parse(process.env.DEFAULT_3D_QUALITY ?? "low"),
  enableClassroomLessons: process.env.NEXT_PUBLIC_ENABLE_CLASSROOM_LESSONS === "true",
  enableBreakoutPods: process.env.NEXT_PUBLIC_ENABLE_BREAKOUT_PODS === "true",
  enableRoomObjects: process.env.NEXT_PUBLIC_ENABLE_ROOM_OBJECTS === "true",
  enableAvatarReactions: process.env.NEXT_PUBLIC_ENABLE_AVATAR_REACTIONS !== "false",
  enableHallPass: process.env.NEXT_PUBLIC_ENABLE_HALL_PASS === "true",
  enableWhisper: process.env.NEXT_PUBLIC_ENABLE_WHISPER === "true",
  enableWorldSkins: process.env.NEXT_PUBLIC_ENABLE_WORLD_SKINS === "true",
  enableStudentMediaPermissions: process.env.NEXT_PUBLIC_ENABLE_STUDENT_MEDIA_PERMISSIONS === "true",
  enableWorkforceTraining: process.env.NEXT_PUBLIC_ENABLE_WORKFORCE_TRAINING === "true",
  enableFreeForAll: process.env.NEXT_PUBLIC_ENABLE_FREE_FOR_ALL === "true",
  enableFreeForAllBuilding: process.env.NEXT_PUBLIC_ENABLE_FREE_FOR_ALL_BUILDING === "true",
  enableEscapeRoom: process.env.NEXT_PUBLIC_ENABLE_ESCAPE_ROOM === "true",
  enableVerseBuilding: process.env.NEXT_PUBLIC_ENABLE_VERSE_BUILDING === "true",
  enableAiMeetingNotes: process.env.NEXT_PUBLIC_ENABLE_AI_MEETING_NOTES === "true",
  enableAiWorldHost: process.env.NEXT_PUBLIC_ENABLE_AI_WORLD_HOST === "true",
  enableAvatarAccessories: process.env.NEXT_PUBLIC_ENABLE_AVATAR_ACCESSORIES === "true",
  enableAvatarBodies: process.env.NEXT_PUBLIC_ENABLE_AVATAR_BODIES === "true",
  enableAvatarGlbRecolor: process.env.NEXT_PUBLIC_ENABLE_AVATAR_GLB_RECOLOR === "true",
  enableLiveCaptions: process.env.NEXT_PUBLIC_ENABLE_LIVE_CAPTIONS === "true",
  enableTranslation: process.env.NEXT_PUBLIC_ENABLE_TRANSLATION === "true",
  enableAiObjectGeneration: process.env.NEXT_PUBLIC_ENABLE_AI_OBJECT_GENERATION === "true",
  enableWhiteboards: process.env.NEXT_PUBLIC_ENABLE_WHITEBOARDS !== "false",
  enableSharedBrowsers: process.env.NEXT_PUBLIC_ENABLE_SHARED_BROWSERS === "true",
  sharedBrowserHyperbeamRegion: process.env.NEXT_PUBLIC_SHARED_BROWSER_HYPERBEAM_REGION?.trim() || undefined,
  /** When true, Hyperbeam buffers frames for smoother motion (higher latency). */
  sharedBrowserHyperbeamPlayoutDelay: process.env.NEXT_PUBLIC_SHARED_BROWSER_HYPERBEAM_PLAYOUT_DELAY === "true",
  physics: {
    enablePhysics: process.env.NEXT_PUBLIC_ENABLE_PHYSICS === "true",
    gravity: envNumber(process.env.NEXT_PUBLIC_PHYSICS_GRAVITY, physicsDefaults.gravity),
    moveSpeed: envNumber(process.env.NEXT_PUBLIC_PHYSICS_MOVE_SPEED, physicsDefaults.moveSpeed),
    jumpHeight: envNumber(process.env.NEXT_PUBLIC_PHYSICS_JUMP_HEIGHT, physicsDefaults.jumpHeight),
    maxFallSpeed: envNumber(process.env.NEXT_PUBLIC_PHYSICS_MAX_FALL_SPEED, physicsDefaults.maxFallSpeed),
    airControl: envNumber(process.env.NEXT_PUBLIC_PHYSICS_AIR_CONTROL, physicsDefaults.airControl),
    coyoteTimeMs: envNumber(process.env.NEXT_PUBLIC_PHYSICS_COYOTE_TIME_MS, physicsDefaults.coyoteTimeMs),
    capsuleRadius: envNumber(process.env.NEXT_PUBLIC_PHYSICS_CAPSULE_RADIUS, physicsDefaults.capsuleRadius),
    capsuleHeight: envNumber(process.env.NEXT_PUBLIC_PHYSICS_CAPSULE_HEIGHT, physicsDefaults.capsuleHeight),
    maxSlopeClimbDeg: envNumber(process.env.NEXT_PUBLIC_PHYSICS_MAX_SLOPE_CLIMB_DEG, physicsDefaults.maxSlopeClimbDeg),
    autoStepHeight: envNumber(process.env.NEXT_PUBLIC_PHYSICS_AUTO_STEP_HEIGHT, physicsDefaults.autoStepHeight),
    snapToGroundDist: envNumber(process.env.NEXT_PUBLIC_PHYSICS_SNAP_TO_GROUND_DIST, physicsDefaults.snapToGroundDist)
  }
};

/** Mirrors API `buildingEnvEnabled` — world-building env gate per room type. */
export function buildingEnvEnabled(roomType: string | null | undefined): boolean {
  if (roomType === "free-for-all") return CLIENT_TUNING.enableFreeForAllBuilding;
  if (roomType === "escape-room") return CLIENT_TUNING.enableEscapeRoom;
  if (isVerseRoomType(roomType)) return CLIENT_TUNING.enableVerseBuilding;
  return false;
}

/** Physics env gate for Free-for-All and Dream IXR verse rooms. */
export function physicsEnvEnabled(roomType: string | null | undefined): boolean {
  if (!CLIENT_TUNING.physics.enablePhysics) return false;
  if (roomType === "free-for-all" || isVerseRoomType(roomType)) return true;
  return false;
}
