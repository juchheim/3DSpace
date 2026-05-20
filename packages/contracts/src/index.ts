import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

export const RoleSchema = z.enum(["teacher", "student"]);
export const ViewModeSchema = z.enum(["3d", "2d"]);
export const QualityLevelSchema = z.enum(["low", "medium", "high"]);
export const AttachmentKindSchema = z.enum(["image", "video", "audio", "future"]);
export const MembershipStatusSchema = z.enum(["active", "invited", "removed"]);
export const AttachmentStatusSchema = z.enum(["pending_upload", "ready", "rejected"]);
export const DistanceModelSchema = z.enum(["linear", "inverse", "exponential"]);
export const WallObjectCreationPolicySchema = z.enum(["teacher-only", "student-request", "student-direct"]);
export const WallObjectModerationPolicySchema = z.enum(["pre", "post", "off"]);
export const WallObjectTypeSchema = z.enum([
  "image.file",
  "video.file",
  "audio.file",
  "camera.live",
  "microphone.live",
  "screen.live",
  "browser-tab.live",
  "web.embed",
  "web.link",
  "document.file",
  "slides.file",
  "whiteboard",
  "note",
  "poll",
  "timer",
  "future"
]);
export const WallObjectStatusSchema = z.enum([
  "draft",
  "pending_upload",
  "pending_moderation",
  "active",
  "paused",
  "source_ended",
  "failed",
  "removed",
  "rejected"
]);

export const Vector2Schema = z.object({
  x: z.number(),
  y: z.number()
});

export const Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

export const RotationSchema = z.object({
  y: z.number()
});

export const SpatialAudioConfigSchema = z.object({
  enabled: z.boolean(),
  distanceModel: DistanceModelSchema,
  refDistance: z.number().positive(),
  maxDistance: z.number().positive(),
  rolloffFactor: z.number().nonnegative()
});

export const RoomBoundsSchema = z.object({
  minX: z.number(),
  maxX: z.number(),
  minZ: z.number(),
  maxZ: z.number()
});

export const SpawnPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  position: Vector3Schema,
  rotation: RotationSchema
});

export const WallAnchorSchema = z.object({
  id: z.string(),
  label: z.string(),
  position: Vector3Schema,
  normal: Vector3Schema,
  width: z.number().positive(),
  height: z.number().positive(),
  metadata: z.record(z.unknown()).default({})
});

export const WallPlaneSchema = z.object({
  id: z.string(),
  label: z.string(),
  start: Vector3Schema,
  end: Vector3Schema,
  height: z.number().positive(),
  anchorIds: z.array(z.string()).default([])
});

export const RoomFeatureSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  config: z.record(z.unknown()).default({})
});

export const RoomCapabilitiesSchema = z.object({
  maxParticipants: z.number().int().positive(),
  avatarSendHz: z.number().positive(),
  interpolationMs: z.number().nonnegative(),
  qualityLevels: z.array(QualityLevelSchema),
  twoDAnalog: z.boolean(),
  cameraBillboards: z.boolean(),
  spatialAudio: z.boolean(),
  wallAttachments: z.boolean(),
  wallObjects: z.boolean().default(false),
  wallLiveShares: z.boolean().default(false),
  wallWebLinks: z.boolean().default(false),
  wallWebEmbeds: z.boolean().default(false),
  roomEvents: z.boolean()
});

export const RoomProjectionSchema = z.object({
  kind: z.literal("top-down-v1"),
  scale: z.number().positive(),
  origin: Vector2Schema
});

export const FloorTierSchema = z.object({
  minZ: z.number(),
  maxZ: z.number(),
  floorY: z.number().nonnegative()
});

export const RoomManifestSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  dimensions: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
    height: z.number().positive()
  }),
  bounds: RoomBoundsSchema,
  spawnPoints: z.array(SpawnPointSchema).min(1),
  walls: z.array(WallPlaneSchema),
  wallAnchors: z.array(WallAnchorSchema),
  tiers: z.array(FloorTierSchema).default([]),
  projection: RoomProjectionSchema,
  capabilities: RoomCapabilitiesSchema,
  spatialAudio: SpatialAudioConfigSchema,
  features: z.array(RoomFeatureSchema).default([]),
  createdAt: z.string()
});

export const AvatarAppearanceSchema = z.object({
  hairTop:     z.string(),
  hairFront:   z.string(),
  headSide:    z.string(),
  hairBack:    z.string(),
  faceSkin:    z.string(),
  faceAccent:  z.string(),
  collar:      z.string(),
  shirtFront:  z.string(),
  shirtBelly:  z.string(),
  shirtBack:   z.string(),
  shirtSide:   z.string(),
  shoulderTop: z.string(),
  shoulderCap: z.string(),
  sleeve:      z.string(),
  hand:        z.string(),
  thigh:       z.string(),
  shin:        z.string(),
  legSide:     z.string(),
  legBack:     z.string(),
  shoeTop:     z.string(),
  shoeToe:     z.string(),
  shoeSide:    z.string(),
  shoeSole:    z.string(),
});

export type AvatarAppearance = z.infer<typeof AvatarAppearanceSchema>;

export const AvatarAppearanceMessageSchema = z.object({
  type:          z.literal("avatar.appearance.v1"),
  participantId: z.string(),
  appearance:    AvatarAppearanceSchema,
});

export type AvatarAppearanceMessage = z.infer<typeof AvatarAppearanceMessageSchema>;

export const UserSchema = z.object({
  id: z.string(),
  externalAuthId: z.string(),
  displayName: z.string(),
  avatar: z.object({
    color: z.string(),
    initials: z.string(),
    appearance: AvatarAppearanceSchema.nullable().optional()
  }),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ClassSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  teacherUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CreateClassRequestSchema = z.object({
  name: z.string().min(1).max(120)
});

export const UpdateClassRequestSchema = z.object({
  name: z.string().min(1).max(120).optional()
});

export const ClassMembershipSchema = z.object({
  id: z.string(),
  classId: z.string(),
  userId: z.string(),
  role: RoleSchema,
  status: MembershipStatusSchema,
  displayName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const UpsertClassMemberRequestSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(120),
  role: RoleSchema,
  status: MembershipStatusSchema.default("active")
});

export const InviteSchema = z.object({
  id: z.string(),
  code: z.string(),
  classId: z.string(),
  roomId: z.string().optional(),
  role: RoleSchema,
  expiresAt: z.string().optional(),
  usedAt: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string()
});

export const CreateInviteRequestSchema = z.object({
  role: RoleSchema.default("student"),
  roomId: z.string().optional(),
  expiresInMinutes: z.number().int().positive().max(60 * 24 * 30).optional()
});

export const AcceptInviteResponseSchema = z.object({
  invite: InviteSchema,
  class: ClassSchema,
  membership: ClassMembershipSchema,
  roomId: z.string().optional()
});

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
  maxActiveLiveShares: z.number().int().positive().default(4)
});

export const RoomSchema = z.object({
  id: z.string(),
  classId: z.string(),
  name: z.string(),
  activeManifestVersion: z.number().int().positive(),
  settings: RoomSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CreateRoomRequestSchema = z.object({
  classId: z.string().min(1),
  name: z.string().min(1).max(120)
});

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

export const AvatarMovementSchema = z.enum(["idle", "walking"]);

export const AvatarStateMessageSchema = z.object({
  type: z.literal("avatar.state.v1"),
  sentAt: z.number().int(),
  participantId: z.string(),
  position: Vector3Schema,
  rotation: RotationSchema,
  movement: AvatarMovementSchema,
  viewMode: ViewModeSchema,
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

export const CreateWallAttachmentResponseSchema = z.object({
  attachment: WallAttachmentSchema,
  upload: z.object({
    url: z.string(),
    method: z.literal("PUT"),
    headers: z.record(z.string())
  })
});

export const WallAttachmentDownloadResponseSchema = z.object({
  attachment: WallAttachmentSchema,
  download: z.object({
    url: z.string(),
    method: z.literal("GET"),
    headers: z.record(z.string()),
    expiresInSeconds: z.number().int().positive()
  })
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
    "reopen-poll"
  ]),
  positionSeconds: z.number().nonnegative().optional(),
  rate: z.number().positive().max(4).optional(),
  muted: z.boolean().optional(),
  choiceId: z.string().min(1).optional()
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

export const ClassroomHelpRequestSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  note: z.string().max(500).optional(),
  status: z.enum(["raised", "acknowledged", "closed", "cancelled"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedByUserId: z.string().optional()
});

export const ClassroomBoardAccessGrantSchema = z.object({
  id: z.string(),
  userId: z.string(),
  wallAnchorId: z.string(),
  requestId: z.string().optional(),
  allowedObjectTypes: z.array(WallObjectTypeSchema).default([]),
  status: z.enum(["active", "revoked", "expired"]),
  expiresAt: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ClassroomGroupHoldSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["soft", "hard"]).default("soft"),
  radiusMeters: z.number().positive().default(2)
});

export const ClassroomGroupSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(80),
  color: z.string().min(1).max(40),
  memberUserIds: z.array(z.string()).default([]),
  targetPosition: Vector3Schema.optional(),
  targetWallAnchorId: z.string().optional(),
  hold: ClassroomGroupHoldSchema.optional(),
  status: z.enum(["active", "released", "archived"]),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ClassroomSpotlightSchema = z.object({
  targetType: z.enum(["wall-anchor", "wall-object"]),
  anchorId: z.string().optional(),
  objectId: z.string().optional(),
  title: z.string().max(160).optional(),
  instruction: z.string().max(500).optional(),
  mode: z.enum(["highlight", "guide", "force"]),
  createdByUserId: z.string(),
  startedAt: z.string(),
  expiresAt: z.string().optional()
});

export const ClassroomPrivateCheckChoiceSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(200)
});

export const ClassroomPrivateCheckResponseSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  choiceId: z.string().optional(),
  answer: z.string().max(2000).optional(),
  confidence: z.number().min(1).max(5).optional(),
  submittedAt: z.string()
});

export const ClassroomPrivateCheckTargetSchema = z.object({
  kind: z.enum(["all", "group", "users"]).default("all"),
  groupId: z.string().optional(),
  userIds: z.array(z.string()).default([])
});

export const ClassroomPrivateCheckSchema = z.object({
  id: z.string(),
  question: z.string().min(1).max(1000),
  promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
  choices: z.array(ClassroomPrivateCheckChoiceSchema).default([]),
  target: ClassroomPrivateCheckTargetSchema.default({ kind: "all", userIds: [] }),
  status: z.enum(["draft", "open", "closed", "archived"]),
  visibility: z.enum(["teacher-only", "anonymous-aggregate"]).default("teacher-only"),
  responses: z.array(ClassroomPrivateCheckResponseSchema).default([]),
  wallAnchorId: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const LessonStepKindSchema = z.enum([
  "instruction",
  "focus-board",
  "private-check",
  "group-work",
  "timer",
  "student-share"
]);

export const LessonStepInstructionPayloadSchema = z.object({
  body: z.string().max(2000).default("")
});

export const LessonStepFocusBoardPayloadSchema = z.object({
  anchorId: z.string(),
  objectId: z.string().optional(),
  mode: z.enum(["highlight", "guide", "force"]).default("highlight"),
  title: z.string().max(160).optional(),
  instruction: z.string().max(500).optional()
});

export const LessonStepPrivateCheckPayloadSchema = z.object({
  question: z.string().min(1).max(1000),
  promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
  choices: z.array(ClassroomPrivateCheckChoiceSchema).default([]),
  target: ClassroomPrivateCheckTargetSchema.default({ kind: "all", userIds: [] }),
  wallAnchorId: z.string().optional(),
  autoCloseOnAdvance: z.boolean().default(true)
});

export const LessonStepGroupWorkPayloadSchema = z.object({
  existingGroupId: z.string().optional(),
  newGroup: z
    .object({
      label: z.string().min(1).max(80),
      color: z.string().min(1).max(40),
      memberUserIds: z.array(z.string()).default([]),
      targetPosition: Vector3Schema.optional(),
      targetWallAnchorId: z.string().optional(),
      hold: ClassroomGroupHoldSchema.optional()
    })
    .optional(),
  releaseOnAdvance: z.boolean().default(true)
}).refine((value) => Boolean(value.existingGroupId) !== Boolean(value.newGroup), {
  message: "Provide existingGroupId or newGroup, not both."
});

export const LessonStepTimerPayloadSchema = z.object({
  durationSeconds: z.number().int().min(5).max(60 * 60),
  label: z.string().max(80).default(""),
  placement: z.enum(["hud", "wall"]).default("hud"),
  wallAnchorId: z.string().optional(),
  autoAdvanceOnComplete: z.boolean().default(false)
});

export const LessonStepStudentSharePayloadSchema = z.object({
  userId: z.string(),
  wallAnchorId: z.string(),
  allowedObjectTypes: z.array(WallObjectTypeSchema).default([]),
  acknowledgeHandIfRaised: z.boolean().default(true),
  revokeOnAdvance: z.boolean().default(true),
  expiresAt: z.string().optional()
});

export const LessonStepPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instruction"), data: LessonStepInstructionPayloadSchema }),
  z.object({ kind: z.literal("focus-board"), data: LessonStepFocusBoardPayloadSchema }),
  z.object({ kind: z.literal("private-check"), data: LessonStepPrivateCheckPayloadSchema }),
  z.object({ kind: z.literal("group-work"), data: LessonStepGroupWorkPayloadSchema }),
  z.object({ kind: z.literal("timer"), data: LessonStepTimerPayloadSchema }),
  z.object({ kind: z.literal("student-share"), data: LessonStepStudentSharePayloadSchema })
]);

export const LessonStepSchema = z.object({
  id: z.string(),
  kind: LessonStepKindSchema,
  title: z.string().min(1).max(120),
  notes: z.string().max(2000).optional(),
  payload: LessonStepPayloadSchema,
  createdAt: z.string(),
  updatedAt: z.string()
}).refine((value) => value.kind === value.payload.kind, {
  message: "Step kind must match payload kind."
});

export const LessonRunStepRecordSchema = z.object({
  stepId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  drifted: z.boolean().default(false),
  driftReason: z.string().optional(),
  emittedActionIds: z.array(z.string()).default([]),
  createdCheckId: z.string().optional(),
  createdGroupId: z.string().optional(),
  createdGrantId: z.string().optional(),
  createdWallObjectId: z.string().optional()
});

export const LessonActiveTimerSchema = z.object({
  stepId: z.string(),
  title: z.string().min(1).max(120),
  label: z.string().max(80).default(""),
  durationSeconds: z.number().int().min(5).max(60 * 60),
  placement: z.enum(["hud", "wall"]),
  wallAnchorId: z.string().optional(),
  wallObjectId: z.string().optional(),
  autoAdvanceOnComplete: z.boolean().default(false),
  startedAt: z.string()
});

export const LessonRunStatusSchema = z.enum(["draft", "ready", "running", "paused", "ended", "abandoned"]);

export const LessonRunSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(160).default("Untitled lesson"),
  status: LessonRunStatusSchema.default("draft"),
  steps: z.array(LessonStepSchema).default([]),
  currentStepIndex: z.number().int().min(-1).default(-1),
  timeline: z.array(LessonRunStepRecordSchema).default([]),
  activeTimer: LessonActiveTimerSchema.nullable().default(null),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const LessonStepInputSchema = z.object({
  kind: LessonStepKindSchema,
  title: z.string().min(1).max(120),
  notes: z.string().max(2000).optional(),
  payload: LessonStepPayloadSchema
}).refine((value) => value.kind === value.payload.kind, {
  message: "Step kind must match payload kind."
});

export const ClassroomStateSchema = z.object({
  roomId: z.string(),
  version: z.number().int().positive(),
  helpRequests: z.array(ClassroomHelpRequestSchema).default([]),
  boardAccessGrants: z.array(ClassroomBoardAccessGrantSchema).default([]),
  privateChecks: z.array(ClassroomPrivateCheckSchema).default([]),
  groups: z.array(ClassroomGroupSchema).default([]),
  spotlight: ClassroomSpotlightSchema.nullable().default(null),
  lessonRun: LessonRunSchema.nullable().default(null),
  avatarEditorLocked: z.boolean().default(false).optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const ClassroomActionBaseSchema = z.object({
  expectedVersion: z.number().int().positive().optional()
});

export const ClassroomRaiseHandActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("raise-hand"),
  note: z.string().max(500).optional()
});

export const ClassroomCancelHelpActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("cancel-help"),
  requestId: z.string().optional()
});

export const ClassroomAcknowledgeHelpActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("acknowledge-help"),
  requestId: z.string().min(1)
});

export const ClassroomCloseHelpActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("close-help"),
  requestId: z.string().min(1)
});

export const ClassroomGrantBoardAccessActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("grant-board-access"),
  userId: z.string().min(1),
  wallAnchorId: z.string().min(1),
  requestId: z.string().optional(),
  allowedObjectTypes: z.array(WallObjectTypeSchema).default([]),
  expiresAt: z.string().optional()
});

export const ClassroomRevokeBoardAccessActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("revoke-board-access"),
  grantId: z.string().min(1)
});

export const ClassroomCreatePrivateCheckActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("create-private-check"),
  question: z.string().min(1).max(1000),
  promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
  choices: z.array(ClassroomPrivateCheckChoiceSchema).default([]),
  target: ClassroomPrivateCheckTargetSchema.default({ kind: "all", userIds: [] }),
  visibility: z.enum(["teacher-only", "anonymous-aggregate"]).default("teacher-only"),
  wallAnchorId: z.string().optional()
});

export const ClassroomOpenPrivateCheckActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("open-private-check"),
  checkId: z.string().min(1)
});

export const ClassroomClosePrivateCheckActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("close-private-check"),
  checkId: z.string().min(1)
});

export const ClassroomReopenPrivateCheckActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("reopen-private-check"),
  checkId: z.string().min(1)
});

export const ClassroomSubmitPrivateCheckActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("submit-private-check"),
  checkId: z.string().min(1),
  choiceId: z.string().optional(),
  answer: z.string().max(2000).optional(),
  confidence: z.number().min(1).max(5).optional()
});

export const ClassroomCreateGroupActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("create-group"),
  label: z.string().min(1).max(80),
  color: z.string().min(1).max(40),
  memberUserIds: z.array(z.string()).default([]),
  targetPosition: Vector3Schema.optional(),
  targetWallAnchorId: z.string().optional(),
  hold: ClassroomGroupHoldSchema.optional(),
  status: z.enum(["active", "released", "archived"]).default("active")
});

export const ClassroomUpdateGroupActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("update-group"),
  groupId: z.string().min(1),
  label: z.string().min(1).max(80).optional(),
  color: z.string().min(1).max(40).optional(),
  targetPosition: z.union([Vector3Schema, z.null()]).optional(),
  targetWallAnchorId: z.string().optional(),
  hold: ClassroomGroupHoldSchema.optional(),
  status: z.enum(["active", "released", "archived"]).optional()
});

export const ClassroomAssignGroupActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("assign-group"),
  groupId: z.string().min(1),
  memberUserIds: z.array(z.string()).default([])
});

export const ClassroomReleaseGroupActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("release-group"),
  groupId: z.string().min(1)
});

export const ClassroomSetSpotlightActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-spotlight"),
  targetType: z.enum(["wall-anchor", "wall-object"]),
  anchorId: z.string().optional(),
  objectId: z.string().optional(),
  title: z.string().max(160).optional(),
  instruction: z.string().max(500).optional(),
  mode: z.enum(["highlight", "guide", "force"]),
  expiresAt: z.string().optional()
});

export const ClassroomClearSpotlightActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("clear-spotlight")
});

export const ClassroomInitLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("init-lesson-run"),
  title: z.string().min(1).max(160).optional()
});

export const ClassroomSetLessonRunTitleActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-lesson-run-title"),
  title: z.string().min(1).max(160)
});

export const ClassroomAddLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("add-lesson-step"),
  index: z.number().int().min(0).optional(),
  step: LessonStepInputSchema
});

export const ClassroomUpdateLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("update-lesson-step"),
  stepId: z.string().min(1),
  title: z.string().min(1).max(120).optional(),
  notes: z.string().max(2000).optional(),
  payload: LessonStepPayloadSchema.optional()
});

export const ClassroomMoveLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("move-lesson-step"),
  from: z.number().int().min(0),
  to: z.number().int().min(0)
});

export const ClassroomRemoveLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("remove-lesson-step"),
  stepId: z.string().min(1)
});

export const ClassroomStartLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("start-lesson-run")
});

export const ClassroomAdvanceLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("advance-lesson-step")
});

export const ClassroomRetreatLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("retreat-lesson-step")
});

export const ClassroomPauseLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("pause-lesson-run")
});

export const ClassroomResumeLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("resume-lesson-run")
});

export const ClassroomEndLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("end-lesson-run")
});

export const ClassroomAbandonLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("abandon-lesson-run")
});

export const ClassroomClearLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("clear-lesson-run")
});

export const ClassroomSetAvatarEditorLockedActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-avatar-editor-locked"),
  locked: z.boolean()
});

export const ClassroomActionSchema = z.discriminatedUnion("type", [
  ClassroomRaiseHandActionSchema,
  ClassroomCancelHelpActionSchema,
  ClassroomAcknowledgeHelpActionSchema,
  ClassroomCloseHelpActionSchema,
  ClassroomGrantBoardAccessActionSchema,
  ClassroomRevokeBoardAccessActionSchema,
  ClassroomCreatePrivateCheckActionSchema,
  ClassroomOpenPrivateCheckActionSchema,
  ClassroomClosePrivateCheckActionSchema,
  ClassroomReopenPrivateCheckActionSchema,
  ClassroomSubmitPrivateCheckActionSchema,
  ClassroomCreateGroupActionSchema,
  ClassroomUpdateGroupActionSchema,
  ClassroomAssignGroupActionSchema,
  ClassroomReleaseGroupActionSchema,
  ClassroomSetSpotlightActionSchema,
  ClassroomClearSpotlightActionSchema,
  ClassroomInitLessonRunActionSchema,
  ClassroomSetLessonRunTitleActionSchema,
  ClassroomAddLessonStepActionSchema,
  ClassroomUpdateLessonStepActionSchema,
  ClassroomMoveLessonStepActionSchema,
  ClassroomRemoveLessonStepActionSchema,
  ClassroomStartLessonRunActionSchema,
  ClassroomAdvanceLessonStepActionSchema,
  ClassroomRetreatLessonStepActionSchema,
  ClassroomPauseLessonRunActionSchema,
  ClassroomResumeLessonRunActionSchema,
  ClassroomEndLessonRunActionSchema,
  ClassroomAbandonLessonRunActionSchema,
  ClassroomClearLessonRunActionSchema,
  ClassroomSetAvatarEditorLockedActionSchema
]);

export const ClassroomStateChangedRealtimeSchema = z.object({
  type: z.literal("classroom.state.changed.v1"),
  roomId: z.string(),
  version: z.number().int().positive(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const ClassroomStateRealtimeSchema = z.object({
  type: z.literal("classroom.state.v1"),
  roomId: z.string(),
  state: ClassroomStateSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomEventRequestSchema = z.object({
  type: z.string().min(1).max(120),
  payload: z.record(z.unknown()).default({})
});

export const RoomEventResponseSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  type: z.string(),
  persisted: z.boolean(),
  createdAt: z.string()
});

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  time: z.string()
});

export const ReadinessCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["ok", "degraded", "missing", "error"]),
  message: z.string()
});

export const ReadinessResponseSchema = z.object({
  status: z.enum(["ready", "degraded", "not_ready"]),
  checks: z.array(ReadinessCheckSchema)
});

export type Role = z.infer<typeof RoleSchema>;
export type ViewMode = z.infer<typeof ViewModeSchema>;
export type QualityLevel = z.infer<typeof QualityLevelSchema>;
export type Vector3 = z.infer<typeof Vector3Schema>;
export type Rotation = z.infer<typeof RotationSchema>;
export type SpatialAudioConfig = z.infer<typeof SpatialAudioConfigSchema>;
export type RoomManifest = z.infer<typeof RoomManifestSchema>;
export type User = z.infer<typeof UserSchema>;
export type ClassRecord = z.infer<typeof ClassSchema>;
export type ClassMembership = z.infer<typeof ClassMembershipSchema>;
export type Invite = z.infer<typeof InviteSchema>;
export type RoomRecord = z.infer<typeof RoomSchema>;
export type RoomWithManifest = z.infer<typeof RoomWithManifestSchema>;
export type AvatarStateMessage = z.infer<typeof AvatarStateMessageSchema>;
export type RoomSessionResponse = z.infer<typeof RoomSessionResponseSchema>;
export type WallAttachment = z.infer<typeof WallAttachmentSchema>;
export type WallAttachmentDownloadResponse = z.infer<typeof WallAttachmentDownloadResponseSchema>;
export type RoomCapabilities = z.infer<typeof RoomCapabilitiesSchema>;
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;
export type WallObjectCreationPolicy = z.infer<typeof WallObjectCreationPolicySchema>;
export type WallObjectType = z.infer<typeof WallObjectTypeSchema>;
export type WallObjectStatus = z.infer<typeof WallObjectStatusSchema>;
export type WallObjectSource = z.infer<typeof WallObjectSourceSchema>;
export type WallObjectPlacement = z.infer<typeof WallObjectPlacementSchema>;
export type WallObject = z.infer<typeof WallObjectSchema>;
export type WallPlaybackStateMessage = z.infer<typeof WallPlaybackStateMessageSchema>;
export type ClassroomHelpRequest = z.infer<typeof ClassroomHelpRequestSchema>;
export type ClassroomBoardAccessGrant = z.infer<typeof ClassroomBoardAccessGrantSchema>;
export type ClassroomGroupHold = z.infer<typeof ClassroomGroupHoldSchema>;
export type ClassroomGroup = z.infer<typeof ClassroomGroupSchema>;
export type ClassroomSpotlight = z.infer<typeof ClassroomSpotlightSchema>;
export type ClassroomPrivateCheckChoice = z.infer<typeof ClassroomPrivateCheckChoiceSchema>;
export type ClassroomPrivateCheckResponse = z.infer<typeof ClassroomPrivateCheckResponseSchema>;
export type ClassroomPrivateCheckTarget = z.infer<typeof ClassroomPrivateCheckTargetSchema>;
export type ClassroomPrivateCheck = z.infer<typeof ClassroomPrivateCheckSchema>;
export type LessonStepKind = z.infer<typeof LessonStepKindSchema>;
export type LessonStepPayload = z.infer<typeof LessonStepPayloadSchema>;
export type LessonStep = z.infer<typeof LessonStepSchema>;
export type LessonStepInput = z.infer<typeof LessonStepInputSchema>;
export type LessonRunStepRecord = z.infer<typeof LessonRunStepRecordSchema>;
export type LessonActiveTimer = z.infer<typeof LessonActiveTimerSchema>;
export type LessonRunStatus = z.infer<typeof LessonRunStatusSchema>;
export type LessonRun = z.infer<typeof LessonRunSchema>;
export type ClassroomState = z.infer<typeof ClassroomStateSchema>;
export type ClassroomAction = z.infer<typeof ClassroomActionSchema>;
export type ClassroomStateChangedRealtimeMessage = z.infer<typeof ClassroomStateChangedRealtimeSchema>;
export type ClassroomStateRealtimeMessage = z.infer<typeof ClassroomStateRealtimeSchema>;

type ApiRoute = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  summary: string;
  tags: string[];
  request?: z.ZodTypeAny;
  response: z.ZodTypeAny;
};

export const apiRoutes: ApiRoute[] = [
  { method: "get", path: "/health", summary: "Health check", tags: ["system"], response: HealthResponseSchema },
  { method: "get", path: "/ready", summary: "Readiness check", tags: ["system"], response: ReadinessResponseSchema },
  { method: "get", path: "/v1/classes", summary: "List classes visible to the current user", tags: ["classes"], response: z.array(ClassSchema) },
  { method: "post", path: "/v1/classes", summary: "Create a teacher-owned class", tags: ["classes"], request: CreateClassRequestSchema, response: ClassSchema },
  { method: "patch", path: "/v1/classes/{classId}", summary: "Update a teacher-owned class", tags: ["classes"], request: UpdateClassRequestSchema, response: ClassSchema },
  { method: "get", path: "/v1/classes/{classId}/members", summary: "List class memberships", tags: ["classes"], response: z.array(ClassMembershipSchema) },
  { method: "post", path: "/v1/classes/{classId}/members", summary: "Add or update a class membership", tags: ["classes"], request: UpsertClassMemberRequestSchema, response: ClassMembershipSchema },
  { method: "post", path: "/v1/classes/{classId}/invites", summary: "Create a class or room invite", tags: ["classes"], request: CreateInviteRequestSchema, response: InviteSchema },
  { method: "post", path: "/v1/invites/{inviteCode}/accept", summary: "Accept a class or room invite", tags: ["invites"], response: AcceptInviteResponseSchema },
  { method: "get", path: "/v1/rooms", summary: "List rooms visible to the current user", tags: ["rooms"], response: z.array(RoomSchema) },
  { method: "post", path: "/v1/rooms", summary: "Create a room for a class", tags: ["rooms"], request: CreateRoomRequestSchema, response: RoomWithManifestSchema },
  { method: "patch", path: "/v1/rooms/{roomId}", summary: "Update room metadata", tags: ["rooms"], request: UpdateRoomRequestSchema, response: RoomSchema },
  { method: "delete", path: "/v1/rooms/{roomId}", summary: "Delete a room and related data", tags: ["rooms"], response: DeleteRoomResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/manifest", summary: "Get active room manifest", tags: ["rooms"], response: RoomManifestSchema },
  { method: "post", path: "/v1/rooms/{roomId}/session", summary: "Join a room and receive LiveKit session data", tags: ["rooms"], request: JoinRoomSessionRequestSchema, response: RoomSessionResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/attachments", summary: "List wall attachments", tags: ["attachments"], response: z.array(WallAttachmentSchema) },
  { method: "post", path: "/v1/rooms/{roomId}/attachments", summary: "Create wall attachment metadata and signed upload URL", tags: ["attachments"], request: CreateWallAttachmentRequestSchema, response: CreateWallAttachmentResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/attachments/{attachmentId}/finalize", summary: "Finalize a wall attachment after signed upload", tags: ["attachments"], request: FinalizeWallAttachmentRequestSchema, response: WallAttachmentSchema },
  { method: "patch", path: "/v1/rooms/{roomId}/attachments/{attachmentId}", summary: "Update wall attachment metadata or moderation status", tags: ["attachments"], request: UpdateWallAttachmentRequestSchema, response: WallAttachmentSchema },
  { method: "get", path: "/v1/rooms/{roomId}/attachments/{attachmentId}/download", summary: "Create a signed wall attachment download URL", tags: ["attachments"], response: WallAttachmentDownloadResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/wall-objects", summary: "List visible wall objects", tags: ["wall-objects"], response: z.array(WallObjectSchema) },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects", summary: "Create a wall object", tags: ["wall-objects"], request: CreateWallObjectRequestSchema, response: WallObjectSchema },
  { method: "get", path: "/v1/rooms/{roomId}/wall-objects/{objectId}", summary: "Fetch one wall object", tags: ["wall-objects"], response: WallObjectSchema },
  { method: "patch", path: "/v1/rooms/{roomId}/wall-objects/{objectId}", summary: "Update a wall object", tags: ["wall-objects"], request: UpdateWallObjectRequestSchema, response: WallObjectSchema },
  { method: "delete", path: "/v1/rooms/{roomId}/wall-objects/{objectId}", summary: "Soft-remove a wall object", tags: ["wall-objects"], response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/control", summary: "Control playback or live source state for a wall object", tags: ["wall-objects"], request: WallObjectControlRequestSchema, response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-shares", summary: "Create live wall share intent", tags: ["wall-objects"], request: CreateWallShareRequestSchema, response: CreateWallShareResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-shares/{objectId}/end", summary: "Mark live wall share ended", tags: ["wall-objects"], response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/web-resources", summary: "Create safe wall web resource", tags: ["wall-objects"], request: CreateWebResourceRequestSchema, response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/web-resources/preview", summary: "Preview safe wall web resource support", tags: ["wall-objects"], request: WebResourcePreviewRequestSchema, response: WebResourcePreviewResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/classroom", summary: "Get classroom state visible to the current user", tags: ["classroom"], response: ClassroomStateSchema },
  { method: "post", path: "/v1/rooms/{roomId}/classroom/actions", summary: "Run a classroom state action", tags: ["classroom"], request: ClassroomActionSchema, response: ClassroomStateSchema },
  { method: "post", path: "/v1/rooms/{roomId}/events", summary: "Persist optional durable room events", tags: ["rooms"], request: RoomEventRequestSchema, response: RoomEventResponseSchema }
];

function asJsonSchema(schema: z.ZodTypeAny) {
  return zodToJsonSchema(schema, {
    target: "openApi3",
    $refStrategy: "none"
  }) as Record<string, unknown>;
}

export function createOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of apiRoutes) {
    paths[route.path] ??= {};
    paths[route.path]![route.method] = {
      summary: route.summary,
      tags: route.tags,
      requestBody: route.request
        ? {
            required: true,
            content: {
              "application/json": {
                schema: asJsonSchema(route.request)
              }
            }
          }
        : undefined,
      responses: {
        "200": {
          description: "Successful response",
          content: {
            "application/json": {
              schema: asJsonSchema(route.response)
            }
          }
        }
      }
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "3DSpace API",
      version: "0.1.0",
      description: "Versioned API contracts generated from shared Zod schemas."
    },
    paths
  };
}
