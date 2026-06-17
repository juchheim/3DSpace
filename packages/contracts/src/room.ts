import { z } from "zod";
import * as foundation from "./foundation.js";
import type { RoomType } from "./foundation.js";

const {
  AttachmentKindSchema,
  AttachmentStatusSchema,
  AvatarAppearanceSchema,
  AvatarBodySlugSchema,
  AvatarEquippedAccessoriesSchema,
  BuildDestroyPolicySchema,
  DynamicWallAnchorSchema,
  PoseSchema,
  QualityLevelSchema,
  RoleSchema,
  RoomCapabilitiesSchema,
  RoomManifestSchema,
  RoomObjectSchema,
  RoomObjectTouchPolicySchema,
  RoomObjectsSettingsSchema,
  RoomTypeSchema,
  RotationSchema,
  SpatialAudioConfigSchema,
  Vector3Schema,
  ViewModeSchema,
  WallObjectCreationPolicySchema,
  WallObjectModerationPolicySchema,
  WallObjectStatusSchema,
  WallObjectTypeSchema,
  WorldSkinDayNightModeSchema,
  isVerseRoomType
} = foundation;
export type RoomTypeFeatureFlags = {
  classroomState: boolean;
  peoplePanelTeacherControls: boolean;
  lessons: boolean;
  privateChecks: boolean;
  groups: boolean;
  focus: boolean;
  hallPass: boolean;
  whisper: boolean;
  breakoutPods: boolean;
  studentMediaControls: boolean;
  worldSkins: boolean;
  dynamicBoards: boolean;
  openJoin: boolean;
  aiMeetingNotes: boolean;
  aiObjects: boolean;
  aiWorldHost: boolean;
  whiteboards: boolean;
  sharedBrowsers: boolean;
  liveCaptions: boolean;
  translation: boolean;
  building: boolean;
  logic: boolean;
  physics: boolean;
};

const NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS: RoomTypeFeatureFlags = Object.freeze({
  classroomState: false,
  peoplePanelTeacherControls: false,
  lessons: false,
  privateChecks: false,
  groups: false,
  focus: false,
  hallPass: false,
  whisper: false,
  breakoutPods: false,
  studentMediaControls: false,
  worldSkins: false,
  dynamicBoards: false,
  openJoin: false,
  aiMeetingNotes: false,
  aiObjects: false,
  aiWorldHost: false,
  whiteboards: true,
  sharedBrowsers: false,
  liveCaptions: false,
  translation: false,
  building: false,
  logic: false,
  physics: false
});

const CLASSROOM_ROOM_TYPE_FEATURE_FLAGS: RoomTypeFeatureFlags = Object.freeze({
  classroomState: true,
  peoplePanelTeacherControls: true,
  lessons: true,
  privateChecks: true,
  groups: true,
  focus: true,
  hallPass: true,
  whisper: true,
  breakoutPods: true,
  studentMediaControls: true,
  worldSkins: true,
  dynamicBoards: false,
  openJoin: false,
  aiMeetingNotes: false,
  aiObjects: false,
  aiWorldHost: false,
  whiteboards: true,
  sharedBrowsers: false,
  liveCaptions: false,
  translation: false,
  building: false,
  logic: false,
  physics: false
});

const FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS: RoomTypeFeatureFlags = Object.freeze({
  classroomState: false,
  peoplePanelTeacherControls: false,
  lessons: false,
  privateChecks: false,
  groups: false,
  focus: false,
  hallPass: false,
  whisper: false,
  breakoutPods: false,
  studentMediaControls: false,
  worldSkins: false,
  dynamicBoards: true,
  openJoin: true,
  aiMeetingNotes: true,
  aiObjects: true,
  aiWorldHost: true,
  whiteboards: true,
  sharedBrowsers: true,
  liveCaptions: true,
  translation: true,
  building: true,
  logic: false,
  physics: true
});

const ESCAPE_ROOM_ROOM_TYPE_FEATURE_FLAGS: RoomTypeFeatureFlags = Object.freeze({
  classroomState: false,
  peoplePanelTeacherControls: false,
  lessons: false,
  privateChecks: false,
  groups: false,
  focus: false,
  hallPass: false,
  whisper: false,
  breakoutPods: false,
  studentMediaControls: false,
  worldSkins: true,
  dynamicBoards: true,
  openJoin: false,
  aiMeetingNotes: false,
  aiObjects: true,
  aiWorldHost: false,
  whiteboards: true,
  sharedBrowsers: false,
  liveCaptions: false,
  translation: false,
  building: true,
  logic: true,
  physics: false
});

/** Dream IXR verses: build tools, wall boards, and classroom lessons (when env-enabled). */
const VERSE_ROOM_TYPE_FEATURE_FLAGS: RoomTypeFeatureFlags = Object.freeze({
  classroomState: true,
  peoplePanelTeacherControls: true,
  lessons: true,
  privateChecks: true,
  groups: true,
  focus: true,
  hallPass: false,
  whisper: false,
  breakoutPods: false,
  studentMediaControls: false,
  worldSkins: false,
  dynamicBoards: true,
  openJoin: false,
  aiMeetingNotes: true,
  aiObjects: false,
  aiWorldHost: true,
  whiteboards: true,
  sharedBrowsers: true,
  liveCaptions: false,
  translation: true,
  building: true,
  logic: false,
  physics: true
});

/**
 * Future room types should not inherit classroom controls unless they opt in here.
 */
export function getRoomTypeFeatureFlags(roomType: RoomType | string | null | undefined): RoomTypeFeatureFlags {
  if (isVerseRoomType(roomType)) return VERSE_ROOM_TYPE_FEATURE_FLAGS;
  switch (roomType) {
    case "classroom":
      return CLASSROOM_ROOM_TYPE_FEATURE_FLAGS;
    case "free-for-all":
      return FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS;
    case "escape-room":
      return ESCAPE_ROOM_ROOM_TYPE_FEATURE_FLAGS;
    default:
      return NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS;
  }
}

export const SharedBrowserHyperbeamQualitySchema = z.enum(["sharp", "smooth", "blocky"]);

export const SharedBrowserHyperbeamSessionSchema = z.object({
  sessionId: z.string().min(1),
  /** Present while the Hyperbeam VM is live; omitted when paused. */
  embedUrl: z.string().url().optional()
});

export const PhysicsTuningSchema = z.object({
  enabled: z.boolean().default(false),
  gravity: z.number().min(0).max(100).default(24),
  moveSpeed: z.number().positive().max(20).default(3.2),
  jumpHeight: z.number().min(0).max(10).default(1.3),
  maxFallSpeed: z.number().positive().max(200).default(40),
  airControl: z.number().min(0).max(1).default(0.6),
  coyoteTimeMs: z.number().int().min(0).max(500).default(120),
  capsuleRadius: z.number().positive().max(2).default(0.4),
  capsuleHeight: z.number().positive().max(4).default(1.6),
  maxSlopeClimbDeg: z.number().min(0).max(89).default(50),
  autoStepHeight: z.number().min(0).max(2).default(0.6),
  snapToGroundDist: z.number().min(0).max(2).default(0.3)
});

export const PhysicsRoomOverrideSchema = PhysicsTuningSchema.partial();

export const RoomSettingsSchema = z.object({
  maxParticipants: z.number().int().positive(),
  defaultViewMode: ViewModeSchema,
  defaultQuality: QualityLevelSchema,
  enable2DAnalog: z.boolean(),
  enableWallAttachments: z.boolean(),
  enableWallObjects: z.boolean().default(true),
  wallObjectCreation: WallObjectCreationPolicySchema.default("teacher-only"),
  wallObjectModeration: WallObjectModerationPolicySchema.default("pre"),
  allowLiveStudentShares: z.boolean().default(false),
  allowStudentUploads: z.boolean().default(false),
  allowWebLinks: z.boolean().default(true),
  allowEmbeds: z.boolean().default(false),
  maxActiveWallObjects: z.number().int().positive().default(20),
  maxActiveLiveShares: z.number().int().positive().default(4),
  hallpass: z.object({
    enabled: z.boolean().default(true),
    maxConcurrent: z.number().int().min(0).max(10).default(1),
    perPeriodLimit: z.number().int().min(0).max(20).default(2)
  }).default({ enabled: true, maxConcurrent: 1, perPeriodLimit: 2 }),
  pods: z.object({
    enabled: z.boolean().default(true),
    podRadiusMeters: z.number().positive().max(8).default(3),
    podMurmurFloor: z.number().min(0).max(1).default(0.08),
    drawPartitions: z.boolean().default(false)
  }).default({ enabled: true, podRadiusMeters: 3, podMurmurFloor: 0.08, drawPartitions: false }),
  roomObjects: RoomObjectsSettingsSchema.default({
    enabled: true,
    maxActive: 8,
    customUploadsEnabled: false,
    maxUploadSizeBytes: 15 * 1024 * 1024,
    defaultTouchPolicy: "teacher-only"
  }),
  worldSkins: z.object({
    enabled: z.boolean().default(true),
    skinId: z.string().nullable().default(null),
    skinDayNightMode: WorldSkinDayNightModeSchema.default("day"),
    ambientGainOverride: z.number().min(0).max(1).nullable().default(null)
  }).default({
    enabled: true,
    skinId: null,
    skinDayNightMode: "day",
    ambientGainOverride: null
  }),
  studentMedia: z.object({
    camerasEnabled: z.boolean().default(true),
    microphonesEnabled: z.boolean().default(true)
  }).default({
    camerasEnabled: true,
    microphonesEnabled: true
  }),
  aiMeetingNotes: z.object({
    enabled: z.boolean().default(true),
    autoStartOnFirstJoin: z.boolean().default(false),
    maxSessionDurationMinutes: z.number().int().positive().max(360).default(120),
    retentionDays: z.number().int().positive().max(365).default(30)
  }).default({
    enabled: true,
    autoStartOnFirstJoin: false,
    maxSessionDurationMinutes: 120,
    retentionDays: 30
  }),
  whiteboards: z.object({
    enabled: z.boolean().default(true),
    maxActivePerRoom: z.number().int().min(0).max(16).default(4),
    maxStrokesPerBoard: z.number().int().min(100).max(50_000).default(10_000),
    maxPointsPerStroke: z.number().int().min(50).max(5_000).default(2_000),
    showRemoteCursors: z.boolean().default(true),
    cursorBroadcastHz: z.number().int().min(5).max(30).default(20),
    allowStudentDraw: z.boolean().default(true),
    snapshotEvery: z.number().int().min(50).max(2_000).default(500)
  }).default({
    enabled: true,
    maxActivePerRoom: 4,
    maxStrokesPerBoard: 10_000,
    maxPointsPerStroke: 2_000,
    showRemoteCursors: true,
    cursorBroadcastHz: 20,
    allowStudentDraw: true,
    snapshotEvery: 500
  }),
  aiObjects: z.object({
    enabled: z.boolean().default(true),
    maxConcurrentJobsPerRoom: z.number().int().positive().max(8).default(3),
    maxConcurrentJobsPerUser: z.number().int().positive().max(4).default(1),
    maxJobsPerUserPerDay: z.number().int().positive().max(200).default(20),
    allowMeshy: z.boolean().default(false),
    meshyRefineTextures: z.boolean().default(true),
    defaultPolycountTarget: z.number().int().positive().max(200000).default(15000)
  }).default({
    enabled: true,
    maxConcurrentJobsPerRoom: 3,
    maxConcurrentJobsPerUser: 1,
    maxJobsPerUserPerDay: 20,
    allowMeshy: false,
    meshyRefineTextures: true,
    defaultPolycountTarget: 15000
  }),
  aiWorldHost: z.object({
    enabled: z.boolean().default(true),
    maxFilesPerRoom: z.number().int().positive().max(50).default(10),
    maxFileSizeBytes: z.number().int().positive().max(20_000_000).default(5_000_000),
    maxMessagesPerUserPerHour: z.number().int().positive().max(500).default(60),
    maxContextMessages: z.number().int().positive().max(50).default(20),
    allowedMimeTypes: z.array(z.string()).default([
      "application/pdf",
      "text/plain",
      "text/markdown"
    ])
  }).default({
    enabled: true,
    maxFilesPerRoom: 10,
    maxFileSizeBytes: 5_000_000,
    maxMessagesPerUserPerHour: 60,
    maxContextMessages: 20,
    allowedMimeTypes: ["application/pdf", "text/plain", "text/markdown"]
  }),
  sharedBrowsers: z.object({
    enabled: z.boolean().default(true),
    maxActivePerRoom: z.number().int().min(0).max(4).default(2),
    defaultStartUrl: z.string().url().default("https://www.wikipedia.org"),
    viewportWidth: z.number().int().min(640).max(1920).default(1280),
    viewportHeight: z.number().int().min(360).max(1080).default(720),
    idlePauseMinutes: z.number().int().min(1).max(240).default(15),
    navigationAllowlistEnabled: z.boolean().default(false),
    navigationAllowlist: z.array(z.string()).default([]),
    controlLeaseSeconds: z.number().int().min(10).max(600).default(120),
    hyperbeamQuality: SharedBrowserHyperbeamQualitySchema.default("smooth"),
    hyperbeamFramerate: z.number().int().min(24).max(60).default(30)
  }).default({
    enabled: true,
    maxActivePerRoom: 2,
    defaultStartUrl: "https://www.wikipedia.org",
    viewportWidth: 1280,
    viewportHeight: 720,
    idlePauseMinutes: 15,
    navigationAllowlistEnabled: false,
    navigationAllowlist: [],
    controlLeaseSeconds: 120,
    hyperbeamQuality: "smooth",
    hyperbeamFramerate: 30
  }),
  physics: PhysicsRoomOverrideSchema.default({}),
  buildingEnabled: z.boolean().default(true),
  buildDestroyPolicy: BuildDestroyPolicySchema.default("anyone"),
  /** When true, structural edits are blocked server-side (escape-room play test). */
  playModeEnabled: z.boolean().default(false),
  /** When true, logic/trigger pieces may be authored (escape rooms). */
  logicEnabled: z.boolean().default(true),
  translation: z.object({
    enabled: z.boolean().default(true),
    defaultTargetLanguage: z.string().optional(),
    voiceEnabled: z.boolean().default(true)
  }).default({ enabled: true, voiceEnabled: true })
});

/** Apply {@link RoomSettingsSchema} defaults to persisted room settings (e.g. `roomObjects` opt-in). */
export function parseRoomSettings(input: unknown): z.infer<typeof RoomSettingsSchema> {
  return RoomSettingsSchema.parse(input);
}

export const RoomSchema = z.object({
  id: z.string(),
  classId: z.string(),
  name: z.string(),
  type: RoomTypeSchema.default("classroom"),
  activeManifestVersion: z.number().int().positive(),
  settings: RoomSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CreateRoomRequestSchema = z.object({
  classId: z.string().min(1),
  name: z.string().min(1).max(120),
  type: RoomTypeSchema.optional(),
  freeForAllPassword: z.string().min(1).optional()
});

export const JoinFreeForAllSessionRequestSchema = z.object({
  freeForAllPassword: z.string().min(1).optional()
});

export const MeetingNotesSessionStatusSchema = z.enum([
  "starting",
  "recording",
  "finalizing",
  "ready",
  "error",
  "cancelled"
]);

export const MeetingNotesSegmentSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  roomId: z.string().min(1),
  speakerUserId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
  isFinal: z.boolean(),
  language: z.string().optional(),
  createdAt: z.string().datetime()
});

export const MeetingNotesSessionSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  startedByUserId: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  status: MeetingNotesSessionStatusSchema,
  transcriptStorageKeys: z.object({
    txt: z.string().optional(),
    vtt: z.string().optional(),
    srt: z.string().optional()
  }).optional(),
  summaryStorageKey: z.string().optional(),
  summaryGeneratedAt: z.string().datetime().optional(),
  durationSec: z.number().int().nonnegative().optional(),
  participantUserIds: z.array(z.string()).default([]),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const MeetingNotesSessionDetailSchema = MeetingNotesSessionSchema.extend({
  segments: z.array(MeetingNotesSegmentSchema).default([])
});

export const MeetingNotesSessionListResponseSchema = z.object({
  sessions: z.array(MeetingNotesSessionSchema).default([])
});

export const StartMeetingNotesSessionResponseSchema = z.object({
  session: MeetingNotesSessionSchema,
  realtimeMessages: z.array(z.unknown()).default([])
});

export const PatchMeetingNotesSessionRequestSchema = z.object({
  action: z.enum(["stop", "cancel"])
});

export const UpdateMeetingNotesSummaryRequestSchema = z.object({
  action: z.literal("resummarize")
});

export const UploadMeetingNotesAudioChunkRequestSchema = z.object({
  participantId: z.string().min(1),
  startedAtMs: z.number().int().nonnegative(),
  endedAtMs: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  audioBase64: z.string().min(1)
});

export const UploadMeetingNotesAudioChunkResponseSchema = z.object({
  accepted: z.boolean(),
  segment: MeetingNotesSegmentSchema.optional(),
  realtimeMessages: z.array(z.unknown()).default([])
});

// ─── AI World Host (Free-for-All) ───────────────────────────────────────────

export const RoomAiHostDisplayNameSchema = z.string().min(3).max(24);

/** Legacy World Host avatar slugs — all normalize to `"lp"` on read. */
const LEGACY_ROOM_AI_HOST_AVATARS = new Set([
  "simple-bot",
  "meshy-lp-robot",
  "model-lp",
  "retro-robot",
  "sprocket-bot"
]);

function migrateRoomAiHostAvatar(value: unknown): "lp" {
  if (value === "lp") return "lp";
  if (typeof value === "string" && LEGACY_ROOM_AI_HOST_AVATARS.has(value)) return "lp";
  return value as "lp";
}

/**
 * Which 3D avatar represents the World Host. Only `"lp"` — the lightweight
 * textured robot GLB (~7 MB, ~10k tris). Legacy slug values parse as `"lp"`.
 */
export const RoomAiHostAvatarSchema = z.preprocess(migrateRoomAiHostAvatar, z.literal("lp")).default("lp");

export const RoomAiHostSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  displayName: RoomAiHostDisplayNameSchema,
  avatar: RoomAiHostAvatarSchema,
  position: Vector3Schema,
  rotationY: z.number(),
  createdByUserId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const RoomAiHostFileStatusSchema = z.enum(["uploading", "processing", "ready", "failed"]);

export const RoomAiHostFileSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  uploadedByUserId: z.string().min(1),
  originalFileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  storageKey: z.string().min(1),
  extractedTextStorageKey: z.string().optional(),
  status: RoomAiHostFileStatusSchema,
  errorMessage: z.string().optional(),
  pageCount: z.number().int().nonnegative().optional(),
  charCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const RoomAiHostFileChunkSchema = z.object({
  id: z.string().min(1),
  fileId: z.string().min(1),
  roomId: z.string().min(1),
  index: z.number().int().nonnegative(),
  text: z.string()
});

export const RoomAiHostChatModeSchema = z.enum(["build-help", "file-study"]);

export const RoomAiHostChatRoleSchema = z.enum(["user", "assistant", "system"]);

function requireRoomAiHostFileIdWhenFileStudy(
  data: { mode: z.infer<typeof RoomAiHostChatModeSchema>; fileId?: string | undefined },
  ctx: z.RefinementCtx
) {
  if (data.mode === "file-study" && !data.fileId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "fileId is required when mode is file-study",
      path: ["fileId"]
    });
  }
}

export const RoomAiHostChatMessageSchema = z
  .object({
    id: z.string().min(1),
    roomId: z.string().min(1),
    userId: z.string().min(1),
    mode: RoomAiHostChatModeSchema,
    fileId: z.string().optional(),
    role: RoomAiHostChatRoleSchema,
    content: z.string(),
    createdAt: z.string().datetime()
  })
  .superRefine(requireRoomAiHostFileIdWhenFileStudy);

export const AiHostBuildHelpContextSchema = z.object({
  buildModeEnabled: z.boolean().optional(),
  selectedTool: z.string().nullable().optional(),
  pieceCount: z.number().int().nonnegative().optional(),
  lastBuildRejectionReason: z.string().nullable().optional()
});

export const GetRoomAiHostResponseSchema = z.object({
  host: RoomAiHostSchema.nullable()
});

export const CreateRoomAiHostRequestSchema = z.object({
  displayName: RoomAiHostDisplayNameSchema,
  avatar: RoomAiHostAvatarSchema.optional(),
  position: Vector3Schema,
  rotationY: z.number().optional()
});

export const PatchRoomAiHostRequestSchema = z
  .object({
    displayName: RoomAiHostDisplayNameSchema.optional(),
    avatar: RoomAiHostAvatarSchema.optional(),
    position: Vector3Schema.optional(),
    rotationY: z.number().optional()
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.avatar !== undefined ||
      value.position !== undefined ||
      value.rotationY !== undefined,
    { message: "At least one of displayName, avatar, position, or rotationY is required" }
  );

export const DismissRoomAiHostQuerySchema = z.object({
  deleteFiles: z.coerce.boolean().optional().default(false)
});

export const ListRoomAiHostFilesResponseSchema = z.object({
  files: z.array(RoomAiHostFileSchema).default([])
});

export const CreateRoomAiHostFileUploadTargetRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive()
});

export const CreateRoomAiHostFileUploadTargetResponseSchema = z.object({
  fileId: z.string().min(1),
  storageKey: z.string().min(1),
  upload: z.object({
    url: z.string().url(),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()).default({})
  })
});

export const RegisterRoomAiHostFileRequestSchema = z.object({
  fileId: z.string().min(1),
  storageKey: z.string().min(1),
  originalFileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive()
});

export const ListRoomAiHostChatQuerySchema = z.object({
  mode: RoomAiHostChatModeSchema.optional(),
  fileId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

export const ListRoomAiHostChatResponseSchema = z.object({
  messages: z.array(RoomAiHostChatMessageSchema).default([])
});

export const SendRoomAiHostChatRequestSchema = z
  .object({
    mode: RoomAiHostChatModeSchema,
    fileId: z.string().optional(),
    content: z.string().min(1).max(8000),
    buildHelpContext: AiHostBuildHelpContextSchema.optional()
  })
  .superRefine(requireRoomAiHostFileIdWhenFileStudy);

export const RoomAiHostUpdatedMessageV1Schema = z.object({
  type: z.literal("room.ai-host.updated.v1"),
  roomId: z.string(),
  host: RoomAiHostSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomAiHostDismissedMessageV1Schema = z.object({
  type: z.literal("room.ai-host.dismissed.v1"),
  roomId: z.string(),
  deleteFiles: z.boolean().default(false),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomAiHostFileUpdatedMessageV1Schema = z.object({
  type: z.literal("room.ai-host.file.updated.v1"),
  roomId: z.string(),
  file: RoomAiHostFileSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomAiHostFileRemovedMessageV1Schema = z.object({
  type: z.literal("room.ai-host.file.removed.v1"),
  roomId: z.string(),
  fileId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomAiHostRealtimeMessageSchema = z.discriminatedUnion("type", [
  RoomAiHostUpdatedMessageV1Schema,
  RoomAiHostDismissedMessageV1Schema,
  RoomAiHostFileUpdatedMessageV1Schema,
  RoomAiHostFileRemovedMessageV1Schema
]);

export const RoomAiHostMutationResponseSchema = z.object({
  host: RoomAiHostSchema,
  realtimeMessages: z.array(RoomAiHostRealtimeMessageSchema).default([])
});

export const DismissRoomAiHostResponseSchema = z.object({
  dismissed: z.literal(true),
  realtimeMessages: z.array(RoomAiHostRealtimeMessageSchema).default([])
});

export const RegisterRoomAiHostFileResponseSchema = z.object({
  file: RoomAiHostFileSchema,
  realtimeMessages: z.array(RoomAiHostRealtimeMessageSchema).default([])
});

export const DeleteRoomAiHostFileResponseSchema = z.object({
  deleted: z.literal(true),
  realtimeMessages: z.array(RoomAiHostRealtimeMessageSchema).default([])
});

export const MeetingNotesDownloadFormatSchema = z.enum(["txt", "vtt", "srt", "md"]);

export const UpdateRoomRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  settings: RoomSettingsSchema.partial().optional()
});

export const RoomWithManifestSchema = z.object({
  room: RoomSchema,
  manifest: RoomManifestSchema
});

export const DeleteRoomResponseSchema = z.object({
  roomId: z.string(),
  deleted: z.literal(true)
});

export const AvatarMovementSchema = z.enum(["idle", "walking", "running"]);
export const AvatarAirborneStateSchema = z.enum(["grounded", "jumping", "falling"]);

export const AvatarStateMessageSchema = z.object({
  type: z.literal("avatar.state.v1"),
  sentAt: z.number().int(),
  participantId: z.string(),
  position: Vector3Schema,
  rotation: RotationSchema,
  movement: AvatarMovementSchema,
  /** True when walk/run plays in reverse (backpedaling in 3D view). */
  locomotionReversed: z.boolean().optional(),
  airborneState: AvatarAirborneStateSchema.optional(),
  viewMode: ViewModeSchema,
  waving: z.boolean().optional(),
  media: z.object({
    cameraEnabled: z.boolean(),
    microphoneEnabled: z.boolean(),
    speaking: z.boolean()
  }).optional()
});

export const JoinRoomSessionRequestSchema = z.object({
  viewMode: ViewModeSchema.default("3d"),
  inviteCode: z.string().optional()
});

export const RoomSessionResponseSchema = z.object({
  token: z.string(),
  livekitUrl: z.string(),
  participantIdentity: z.string(),
  participantId: z.string(),
  role: RoleSchema,
  room: RoomSchema,
  manifest: RoomManifestSchema,
  capabilities: RoomCapabilitiesSchema,
  avatarAppearance: AvatarAppearanceSchema.nullable(),
  avatarAccessories: AvatarEquippedAccessoriesSchema.nullable().optional(),
  avatarBodySlug: AvatarBodySlugSchema.default("azure-vanguard"),
  tuning: z.object({
    avatarSendHz: z.number(),
    interpolationMs: z.number(),
    spatialAudio: SpatialAudioConfigSchema,
    media: z.object({
      defaultCameraEnabled: z.boolean(),
      defaultMicEnabled: z.boolean(),
      maxVideoWidth: z.number().int(),
      maxVideoHeight: z.number().int(),
      maxVideoFps: z.number().int()
    })
  })
});

export const WallAttachmentSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  wallAnchorId: z.string(),
  kind: AttachmentKindSchema,
  fileName: z.string(),
  contentType: z.string(),
  storageKey: z.string(),
  status: AttachmentStatusSchema,
  publicUrl: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CreateWallAttachmentRequestSchema = z.object({
  wallAnchorId: z.string().min(1),
  kind: AttachmentKindSchema,
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  metadata: z.record(z.unknown()).default({})
});

export const FinalizeWallAttachmentRequestSchema = z.object({
  metadata: z.record(z.unknown()).default({})
});

export const UpdateWallAttachmentRequestSchema = z.object({
  status: AttachmentStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional()
});

export const SignedUploadTargetSchema = z.object({
  url: z.string(),
  method: z.literal("PUT"),
  headers: z.record(z.string())
});

export const SignedDownloadTargetSchema = z.object({
  url: z.string(),
  method: z.literal("GET"),
  headers: z.record(z.string()),
  expiresInSeconds: z.number().int().positive()
});

export const CreateWorldSkinUploadResponseSchema = z.object({
  storageKey: z.string().min(1),
  assetPath: z.string().min(1),
  upload: SignedUploadTargetSchema
});

export const CreateWallAttachmentResponseSchema = z.object({
  attachment: WallAttachmentSchema,
  upload: SignedUploadTargetSchema
});

export const WallAttachmentDownloadResponseSchema = z.object({
  attachment: WallAttachmentSchema,
  download: SignedDownloadTargetSchema
});

export const WallObjectSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("asset"),
    attachmentId: z.string().min(1),
    url: z.string().optional()
  }),
  z.object({
    kind: z.literal("livekit-track"),
    participantIdentity: z.string().min(1),
    participantId: z.string().min(1),
    trackSource: z.enum(["camera", "microphone", "screen_share", "screen_share_audio"]),
    publicationSid: z.string().optional(),
    publicationName: z.string().optional()
  }),
  z.object({
    kind: z.literal("web-url"),
    url: z.string().url(),
    embedMode: z.enum(["link", "iframe"])
  }),
  z.object({
    kind: z.literal("inline"),
    data: z.record(z.unknown()).default({})
  })
]);

export const WallObjectPlacementSchema = z.object({
  x: z.number().min(0).max(1).default(0),
  y: z.number().min(0).max(1).default(0),
  width: z.number().positive().max(1).default(1),
  height: z.number().positive().max(1).default(1),
  zIndex: z.number().int().default(0),
  fit: z.enum(["contain", "cover", "stretch"]).default("contain")
});

export const WallObjectSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  wallAnchorId: z.string(),
  type: WallObjectTypeSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  source: WallObjectSourceSchema,
  placement: WallObjectPlacementSchema,
  state: z.record(z.unknown()).default({}),
  permissions: z.record(z.unknown()).default({}),
  status: WallObjectStatusSchema,
  moderation: z.record(z.unknown()).default({}),
  createdByUserId: z.string(),
  updatedByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive()
});

export const ListWallObjectsQuerySchema = z.object({
  status: WallObjectStatusSchema.optional(),
  anchorId: z.string().optional(),
  includeRemoved: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional()
});

export const CreateWallObjectRequestSchema = z.object({
  wallAnchorId: z.string().min(1),
  type: WallObjectTypeSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  source: WallObjectSourceSchema,
  placement: WallObjectPlacementSchema.default({}),
  state: z.record(z.unknown()).default({}),
  permissions: z.record(z.unknown()).default({}),
  moderation: z.record(z.unknown()).default({}),
  status: WallObjectStatusSchema.optional()
});

export const UpdateWallObjectRequestSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).optional(),
  placement: WallObjectPlacementSchema.optional(),
  state: z.record(z.unknown()).optional(),
  permissions: z.record(z.unknown()).optional(),
  moderation: z.record(z.unknown()).optional(),
  status: WallObjectStatusSchema.optional()
});

export const WallObjectControlRequestSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
  action: z.enum([
    "play",
    "pause",
    "seek",
    "mute",
    "unmute",
    "stop-share",
    "spotlight",
    "lock",
    "unlock",
    "approve",
    "reject",
    "vote",
    "close-poll",
    "reopen-poll",
    "set-slide"
  ]),
  positionSeconds: z.number().nonnegative().optional(),
  rate: z.number().positive().max(4).optional(),
  muted: z.boolean().optional(),
  choiceId: z.string().min(1).optional(),
  slideIndex: z.number().int().min(0).max(200).optional()
});

export const WhiteboardToolSchema = z.enum([
  "pen",
  "highlighter",
  "eraser",
  "line",
  "rectangle",
  "ellipse",
  "arrow",
  "text"
]);

export const WhiteboardPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  pressure: z.number().min(0).max(1).optional()
});

export const WhiteboardTextPayloadSchema = z.object({
  value: z.string().max(1024),
  fontSize: z.number().int().positive().max(256)
});

export const WhiteboardStrokeSchema = z.object({
  id: z.string().min(1),
  wallObjectId: z.string().min(1),
  roomId: z.string().min(1),
  authorUserId: z.string().min(1),
  tool: WhiteboardToolSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
  thickness: z.number().positive().max(64),
  points: z.array(WhiteboardPointSchema).min(1),
  text: WhiteboardTextPayloadSchema.optional(),
  z: z.number().int().nonnegative(),
  clearVersion: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});

export const WhiteboardSnapshotSchema = z.object({
  wallObjectId: z.string().min(1),
  roomId: z.string().min(1),
  snapshotZ: z.number().int().nonnegative(),
  storageKey: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});

export const WhiteboardWallObjectStateSchema = z.object({
  strokeCount: z.number().int().nonnegative().default(0),
  lastUpdatedAt: z.string().datetime().optional(),
  snapshotKey: z.preprocess((value) => value === null ? undefined : value, z.string().optional()),
  snapshotZ: z.preprocess((value) => value === null ? undefined : value, z.number().int().nonnegative().optional()),
  clearVersion: z.number().int().nonnegative().default(0)
});

export const ListWhiteboardStrokesQuerySchema = z.object({
  sinceZ: z.coerce.number().int().nonnegative().optional()
});

export const ListWhiteboardStrokesResponseSchema = z.object({
  snapshot: WhiteboardSnapshotSchema.nullable(),
  snapshotDownloadUrl: z.string().url().nullable(),
  strokes: z.array(WhiteboardStrokeSchema).default([]),
  clearVersion: z.number().int().nonnegative(),
  strokeCount: z.number().int().nonnegative()
});

export const CommitWhiteboardStrokeRequestSchema = z.object({
  id: z.string().min(1),
  tool: WhiteboardToolSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
  thickness: z.number().positive().max(64),
  points: z.array(WhiteboardPointSchema).min(1),
  text: WhiteboardTextPayloadSchema.optional(),
  clearVersion: z.number().int().nonnegative()
});

export const WhiteboardCursorMessageV1Schema = z.object({
  type: z.literal("room.whiteboard.cursor.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  authorUserId: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  visible: z.boolean(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WhiteboardStrokeDeltaMessageV1Schema = z.object({
  type: z.literal("room.whiteboard.stroke-delta.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  strokeId: z.string(),
  authorUserId: z.string(),
  tool: WhiteboardToolSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
  thickness: z.number().positive().max(64),
  deltaPoints: z.array(WhiteboardPointSchema).min(1),
  text: WhiteboardTextPayloadSchema.optional(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WhiteboardStrokeCommitMessageV1Schema = z.object({
  type: z.literal("room.whiteboard.stroke-commit.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  stroke: WhiteboardStrokeSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WhiteboardStrokeEraseMessageV1Schema = z.object({
  type: z.literal("room.whiteboard.stroke-erase.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  strokeIds: z.array(z.string().min(1)).min(1),
  erasedByUserId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WhiteboardClearedMessageV1Schema = z.object({
  type: z.literal("room.whiteboard.cleared.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  clearedByUserId: z.string(),
  clearedAt: z.string().datetime(),
  clearVersion: z.number().int().nonnegative(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WhiteboardSnapshotReadyMessageV1Schema = z.object({
  type: z.literal("room.whiteboard.snapshot-ready.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  snapshotKey: z.string(),
  snapshotZ: z.number().int().nonnegative(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WhiteboardRealtimeMessageSchema = z.discriminatedUnion("type", [
  WhiteboardCursorMessageV1Schema,
  WhiteboardStrokeDeltaMessageV1Schema,
  WhiteboardStrokeCommitMessageV1Schema,
  WhiteboardStrokeEraseMessageV1Schema,
  WhiteboardClearedMessageV1Schema,
  WhiteboardSnapshotReadyMessageV1Schema
]);

export const CommitWhiteboardStrokeResponseSchema = z.object({
  stroke: WhiteboardStrokeSchema,
  realtimeMessages: z.array(WhiteboardRealtimeMessageSchema).default([])
});

export const EraseWhiteboardStrokesRequestSchema = z.object({
  strokeIds: z.array(z.string().min(1)).min(1).max(500)
});

export const EraseWhiteboardStrokesResponseSchema = z.object({
  erasedIds: z.array(z.string()),
  realtimeMessages: z.array(WhiteboardRealtimeMessageSchema).default([])
});

export const ClearWhiteboardResponseSchema = z.object({
  clearVersion: z.number().int().nonnegative(),
  realtimeMessages: z.array(WhiteboardRealtimeMessageSchema).default([])
});

export const RequestWhiteboardSnapshotResponseSchema = z.object({
  snapshot: WhiteboardSnapshotSchema.nullable(),
  realtimeMessages: z.array(WhiteboardRealtimeMessageSchema).default([])
});

// --- Shared Browser (Free-for-All room type) ---

export const SharedBrowserSessionStatusSchema = z.enum([
  "starting",
  "active",
  "paused",
  "error",
  "stopped"
]);

export const SharedBrowserControlLeaseSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  expiresAt: z.string().datetime()
});

export const SharedBrowserSessionSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  wallObjectId: z.string().min(1),
  createdByUserId: z.string().min(1),
  status: SharedBrowserSessionStatusSchema,
  currentUrl: z.string().url(),
  title: z.string().max(512).default(""),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }),
  controlLease: SharedBrowserControlLeaseSchema.optional(),
  hyperbeam: SharedBrowserHyperbeamSessionSchema.optional(),
  /** @deprecated Puppeteer/LiveKit path — removed in Hyperbeam migration (Phase 7). Kept for existing Mongo rows. */
  livekit: z.object({
    participantIdentity: z.string().min(1),
    trackSid: z.string().optional()
  }).optional(),
  lastInputAt: z.string().datetime(),
  lastFrameAt: z.string().datetime().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

/** Cached runtime snapshot stored on `WallObject.state` for the shared browser. */
export const SharedBrowserWallObjectStateSchema = z.object({
  sessionStatus: SharedBrowserSessionStatusSchema.default("starting"),
  currentUrl: z.string().default(""),
  title: z.string().default(""),
  controlUserId: z.string().optional(),
  controlDisplayName: z.string().optional(),
  lastActivityAt: z.string().datetime().optional()
});

export const SharedBrowserPointerEventSchema = z.object({
  kind: z.enum(["move", "down", "up", "wheel"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  button: z.enum(["left", "middle", "right"]).optional(),
  deltaX: z.number().optional(),
  deltaY: z.number().optional(),
  at: z.number().int()
});

export const SharedBrowserKeyEventSchema = z.object({
  kind: z.enum(["down", "up", "char"]),
  key: z.string().min(1).max(64),
  text: z.string().max(8).optional(),
  at: z.number().int()
});

export const SharedBrowserNavigateRequestSchema = z.object({
  url: z.string().url()
});

export const SharedBrowserHistoryRequestSchema = z.object({
  action: z.enum(["back", "forward", "refresh"])
});

export const SharedBrowserControlLeaseRequestSchema = z.object({
  action: z.enum(["take", "release", "renew"])
});

export const SharedBrowserPointerBatchSchema = z.object({
  wallObjectId: z.string().min(1),
  pointer: z.array(SharedBrowserPointerEventSchema).max(120).default([]),
  keyboard: z.array(SharedBrowserKeyEventSchema).max(120).default([])
});

// Realtime messages (see RoomBoardCreatedMessageV1Schema for envelope conventions).

export const SharedBrowserPointerMessageV1Schema = z.object({
  type: z.literal("room.shared-browser.pointer.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  authorUserId: z.string(),
  pointer: z.array(SharedBrowserPointerEventSchema).default([]),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const SharedBrowserNavigateMessageV1Schema = z.object({
  type: z.literal("room.shared-browser.navigate.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  url: z.string(),
  navigatedByUserId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const SharedBrowserHistoryMessageV1Schema = z.object({
  type: z.literal("room.shared-browser.history.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  action: z.enum(["back", "forward", "refresh"]),
  actedByUserId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const SharedBrowserControlLeaseMessageV1Schema = z.object({
  type: z.literal("room.shared-browser.control-lease.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  controlLease: SharedBrowserControlLeaseSchema.nullable(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const SharedBrowserStateMessageV1Schema = z.object({
  type: z.literal("room.shared-browser.state.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  currentUrl: z.string(),
  title: z.string(),
  status: SharedBrowserSessionStatusSchema,
  controlLease: SharedBrowserControlLeaseSchema.nullable().optional(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const SharedBrowserSessionMessageV1Schema = z.object({
  type: z.literal("room.shared-browser.session.v1"),
  roomId: z.string(),
  wallObjectId: z.string(),
  status: SharedBrowserSessionStatusSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const SharedBrowserRealtimeMessageSchema = z.discriminatedUnion("type", [
  SharedBrowserPointerMessageV1Schema,
  SharedBrowserNavigateMessageV1Schema,
  SharedBrowserHistoryMessageV1Schema,
  SharedBrowserControlLeaseMessageV1Schema,
  SharedBrowserStateMessageV1Schema,
  SharedBrowserSessionMessageV1Schema
]);

export const SharedBrowserSessionResponseSchema = z.object({
  session: SharedBrowserSessionSchema,
  realtimeMessages: z.array(SharedBrowserRealtimeMessageSchema).default([])
});

export const SharedBrowserRealtimeDispatchResponseSchema = z.object({
  session: SharedBrowserSessionSchema.nullable(),
  realtimeMessages: z.array(SharedBrowserRealtimeMessageSchema).default([])
});

export const CreateWallShareRequestSchema = z.object({
  wallAnchorId: z.string().min(1),
  type: z.enum(["camera.live", "microphone.live", "screen.live", "browser-tab.live"]),
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  placement: WallObjectPlacementSchema.default({}),
  state: z.record(z.unknown()).default({})
});

export const CreateWallShareResponseSchema = z.object({
  object: WallObjectSchema,
  publicationName: z.string(),
  recommendedTrackSource: z.enum(["camera", "microphone", "screen_share", "screen_share_audio"])
});

export const CreateWebResourceRequestSchema = z.object({
  wallAnchorId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).optional(),
  embedMode: z.enum(["link", "iframe"]).default("link"),
  placement: WallObjectPlacementSchema.default({})
});

export const WebResourcePreviewRequestSchema = z.object({
  url: z.string().url(),
  embedMode: z.enum(["link", "iframe"]).default("link")
});

export const WebResourcePreviewResponseSchema = z.object({
  url: z.string().url(),
  host: z.string(),
  title: z.string(),
  embedMode: z.enum(["link", "iframe"]),
  embeddable: z.boolean(),
  reason: z.string().optional()
});

export const WallObjectRealtimeUpsertSchema = z.object({
  type: z.literal("wall.object.upsert.v1"),
  roomId: z.string(),
  object: WallObjectSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WallObjectRealtimeRemoveSchema = z.object({
  type: z.literal("wall.object.remove.v1"),
  roomId: z.string(),
  objectId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WallPlaybackStateMessageSchema = z.object({
  type: z.literal("wall.playback.state.v1"),
  roomId: z.string(),
  objectId: z.string(),
  status: z.enum(["playing", "paused", "ended"]),
  positionSeconds: z.number().nonnegative(),
  rate: z.number().positive(),
  muted: z.boolean(),
  sentAt: z.number().int(),
  controlledByUserId: z.string()
});

export const WallShareEndedMessageSchema = z.object({
  type: z.literal("wall.share.ended.v1"),
  roomId: z.string(),
  objectId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WallModerationStateMessageSchema = z.object({
  type: z.literal("wall.moderation.state.v1"),
  roomId: z.string(),
  objectId: z.string(),
  status: WallObjectStatusSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeUpsertMessageSchema = z.object({
  type: z.literal("room.object.upsert.v1"),
  roomId: z.string(),
  object: RoomObjectSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeRemoveMessageSchema = z.object({
  type: z.literal("room.object.remove.v1"),
  roomId: z.string(),
  objectId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeTouchMessageSchema = z.object({
  type: z.literal("room.object.touch.v1"),
  roomId: z.string(),
  objectId: z.string(),
  touchPolicy: RoomObjectTouchPolicySchema,
  grantedUserIds: z.array(z.string()),
  grantedGroupIds: z.array(z.string()),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeGrabMessageSchema = z.object({
  type: z.literal("room.object.grab.v1"),
  roomId: z.string(),
  objectId: z.string(),
  holderUserId: z.string(),
  expiresAt: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimePoseMessageSchema = z.object({
  type: z.literal("room.object.pose.v1"),
  roomId: z.string(),
  objectId: z.string(),
  holderUserId: z.string(),
  pose: PoseSchema,
  scale: z.number().positive(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeReleaseMessageSchema = z.object({
  type: z.literal("room.object.release.v1"),
  roomId: z.string(),
  objectId: z.string(),
  holderUserId: z.string(),
  finalPose: PoseSchema,
  finalScale: z.number().positive(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeParameterMessageSchema = z.object({
  type: z.literal("room.object.parameter.v1"),
  roomId: z.string(),
  objectId: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeMessageSchema = z.discriminatedUnion("type", [
  RoomObjectRealtimeUpsertMessageSchema,
  RoomObjectRealtimeRemoveMessageSchema,
  RoomObjectRealtimeTouchMessageSchema,
  RoomObjectRealtimeGrabMessageSchema,
  RoomObjectRealtimePoseMessageSchema,
  RoomObjectRealtimeReleaseMessageSchema,
  RoomObjectRealtimeParameterMessageSchema
]);

export const RoomBoardCreatedMessageV1Schema = z.object({
  type: z.literal("room.board.created.v1"),
  roomId: z.string(),
  anchor: DynamicWallAnchorSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomBoardUpdatedMessageV1Schema = z.object({
  type: z.literal("room.board.updated.v1"),
  roomId: z.string(),
  anchor: DynamicWallAnchorSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomBoardRemovedMessageV1Schema = z.object({
  type: z.literal("room.board.removed.v1"),
  roomId: z.string(),
  anchorId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const MeetingNotesStartedMessageV1Schema = z.object({
  type: z.literal("room.meeting-notes.started.v1"),
  roomId: z.string(),
  sessionId: z.string(),
  session: MeetingNotesSessionSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const MeetingNotesEndedMessageV1Schema = z.object({
  type: z.literal("room.meeting-notes.ended.v1"),
  roomId: z.string(),
  sessionId: z.string(),
  session: MeetingNotesSessionSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const MeetingNotesSummaryReadyMessageV1Schema = z.object({
  type: z.literal("room.meeting-notes.summary-ready.v1"),
  roomId: z.string(),
  sessionId: z.string(),
  session: MeetingNotesSessionSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const MeetingNotesErrorMessageV1Schema = z.object({
  type: z.literal("room.meeting-notes.error.v1"),
  roomId: z.string(),
  sessionId: z.string(),
  errorMessage: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const MeetingNotesSegmentMessageV1Schema = z.object({
  type: z.literal("room.meeting-notes.segment.v1"),
  roomId: z.string(),
  sessionId: z.string(),
  segment: MeetingNotesSegmentSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const LiveCaptionsChunkMessageV1Schema = z.object({
  type: z.literal("room.captions.chunk.v1"),
  roomId: z.string(),
  participantId: z.string(),
  chunkId: z.string(),
  text: z.string().max(2000),
  isFinal: z.literal(true),
  startMs: z.number().int().nonnegative(),
  sentAt: z.number().int()
});

export const LiveCaptionsInterimMessageV1Schema = z.object({
  type: z.literal("room.captions.interim.v1"),
  roomId: z.string(),
  participantId: z.string(),
  chunkId: z.string(),
  text: z.string().max(2000),
  sentAt: z.number().int()
});

export const LiveCaptionsContributorMessageV1Schema = z.object({
  type: z.literal("room.captions.contributor.v1"),
  roomId: z.string(),
  participantId: z.string(),
  active: z.boolean(),
  sentAt: z.number().int()
});

export type RoomBoardCreatedMessageV1 = z.infer<typeof RoomBoardCreatedMessageV1Schema>;
export type RoomBoardUpdatedMessageV1 = z.infer<typeof RoomBoardUpdatedMessageV1Schema>;
export type RoomBoardRemovedMessageV1 = z.infer<typeof RoomBoardRemovedMessageV1Schema>;
export type MeetingNotesStartedMessageV1 = z.infer<typeof MeetingNotesStartedMessageV1Schema>;
export type MeetingNotesEndedMessageV1 = z.infer<typeof MeetingNotesEndedMessageV1Schema>;
export type MeetingNotesSummaryReadyMessageV1 = z.infer<typeof MeetingNotesSummaryReadyMessageV1Schema>;
export type MeetingNotesErrorMessageV1 = z.infer<typeof MeetingNotesErrorMessageV1Schema>;
export type MeetingNotesSegmentMessageV1 = z.infer<typeof MeetingNotesSegmentMessageV1Schema>;
export type RoomAiHostUpdatedMessageV1 = z.infer<typeof RoomAiHostUpdatedMessageV1Schema>;
export type RoomAiHostDismissedMessageV1 = z.infer<typeof RoomAiHostDismissedMessageV1Schema>;
export type RoomAiHostFileUpdatedMessageV1 = z.infer<typeof RoomAiHostFileUpdatedMessageV1Schema>;
export type RoomAiHostFileRemovedMessageV1 = z.infer<typeof RoomAiHostFileRemovedMessageV1Schema>;
export type LiveCaptionsChunkMessageV1 = z.infer<typeof LiveCaptionsChunkMessageV1Schema>;
export type LiveCaptionsInterimMessageV1 = z.infer<typeof LiveCaptionsInterimMessageV1Schema>;
export type LiveCaptionsContributorMessageV1 = z.infer<typeof LiveCaptionsContributorMessageV1Schema>;

export const TranslationUtteranceMessageV1Schema = z.object({
  type: z.literal("room.translation.utterance.v1"),
  roomId: z.string(),
  participantId: z.string(),
  utteranceId: z.string(),
  sourceLang: z.string(),
  text: z.string().max(2000),
  isFinal: z.boolean(),
  startMs: z.number().int().nonnegative(),
  sentAt: z.number().int()
});

export const TranslationLangMessageV1Schema = z.object({
  type: z.literal("room.translation.lang.v1"),
  roomId: z.string(),
  participantId: z.string(),
  targetLang: z.string(),
  active: z.boolean(),
  sentAt: z.number().int()
});

export type TranslationUtteranceMessageV1 = z.infer<typeof TranslationUtteranceMessageV1Schema>;
export type TranslationLangMessageV1 = z.infer<typeof TranslationLangMessageV1Schema>;

export const TranslateRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  sourceLang: z.string().min(2).max(20),
  targetLang: z.string().min(2).max(20),
  context: z.array(z.string().max(2000)).max(3).optional()
});

export const TranslateResponseSchema = z.object({
  translatedText: z.string(),
  sourceLang: z.string(),
  targetLang: z.string(),
  cached: z.boolean(),
  model: z.string()
});

export type TranslateRequest = z.infer<typeof TranslateRequestSchema>;
export type TranslateResponse = z.infer<typeof TranslateResponseSchema>;

export const TranslateSpeechRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  lang: z.string().min(2).max(20),
  voice: z.string().min(1).max(40).optional()
});
export type TranslateSpeechRequest = z.infer<typeof TranslateSpeechRequestSchema>;
// Response is binary audio (audio/mpeg) — not a JSON schema.

export const TRANSLATION_TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;

export function voiceForParticipant(participantId: string, voices: readonly string[] = TRANSLATION_TTS_VOICES): string {
  let h = 0;
  for (let i = 0; i < participantId.length; i++) h = (h * 31 + participantId.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % voices.length;
  return voices[idx] ?? voices[0]!;
}

export const TRANSLATION_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" },
  { code: "hi", label: "Hindi" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "sv", label: "Swedish" },
  { code: "tr", label: "Turkish" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
  { code: "id", label: "Indonesian" },
  { code: "uk", label: "Ukrainian" }
];

export function translationLanguageLabel(code: string): string {
  const normalized = code.split("-")[0]?.toLowerCase() ?? code.toLowerCase();
  const entry = TRANSLATION_LANGUAGES.find((lang) => lang.code === normalized);
  if (entry) return entry.label;
  const display = new Intl.DisplayNames(["en"], { type: "language" });
  try {
    const name = display.of(code);
    return name ?? code;
  } catch {
    return code;
  }
}

/** Client → server realtime dispatch (roomId comes from the URL). */
export const RoomObjectRealtimeInboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room.object.grab.v1"),
    objectId: z.string()
  }),
  z.object({
    type: z.literal("room.object.pose.v1"),
    objectId: z.string(),
    pose: PoseSchema,
    scale: z.number().positive()
  }),
  z.object({
    type: z.literal("room.object.release.v1"),
    objectId: z.string(),
    finalPose: PoseSchema,
    finalScale: z.number().positive()
  }),
  z.object({
    type: z.literal("room.object.parameter.v1"),
    objectId: z.string(),
    parameters: z.record(z.string(), z.unknown())
  })
]);

export const RoomObjectRealtimeDispatchResponseSchema = z.object({
  messages: z.array(RoomObjectRealtimeMessageSchema)
});
