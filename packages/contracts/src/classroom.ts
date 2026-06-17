import { z } from "zod";
import * as foundation from "./foundation.js";
import * as room from "./room.js";
const dependencies = { ...foundation, ...room } as typeof foundation & typeof room;
const {
  ApiErrorCodeSchema,
  AvatarAirborneStateSchema,
  AvatarMovementSchema,
  AvatarStateMessageSchema,
  BuildDestroyPolicySchema,
  BuildLogicPieceSchema,
  BuildPieceEdgeSchema,
  BuildPieceKindSchema,
  BuildPieceMaterialSchema,
  BuildPieceRotationSchema,
  BuildPieceSchema,
  ClassMembershipSchema,
  ClassSchema,
  ClearWhiteboardResponseSchema,
  CommitWhiteboardStrokeResponseSchema,
  CreateBuildFloorTextureUploadRequestSchema,
  CreateBuildFloorTextureUploadResponseSchema,
  EraseWhiteboardStrokesResponseSchema,
  EscapeSessionSchema,
  EscapeSessionStatusSchema,
  ImageFloorTextureSpanCellsSchema,
  InviteSchema,
  ListWhiteboardStrokesResponseSchema,
  LogicChannelStateSchema,
  LogicConfigSchema,
  LogicPieceKindSchema,
  LogicRoleSchema,
  LogicSignalKindSchema,
  LogicStateSchema,
  MeetingNotesDownloadFormatSchema,
  MeetingNotesSegmentSchema,
  MeetingNotesSessionDetailSchema,
  MeetingNotesSessionListResponseSchema,
  MeetingNotesSessionSchema,
  MeetingNotesSessionStatusSchema,
  PhysicsTuningSchema,
  PoseSchema,
  QualityLevelSchema,
  RequestWhiteboardSnapshotResponseSchema,
  RoleSchema,
  RoomBuildBatchMessageV1Schema,
  RoomBuildRealtimeMessageSchema,
  RoomBuildRemoveMessageV1Schema,
  RoomBuildUpsertMessageV1Schema,
  RoomCapabilitiesSchema,
  RoomLogicRealtimeMessageSchema,
  RoomManifestSchema,
  RoomObjectCategorySchema,
  RoomObjectParameterFieldSchema,
  RoomObjectParameterSchemaMapSchema,
  RoomObjectProceduralRenderPropsSchema,
  RoomObjectRealtimeDispatchResponseSchema,
  RoomObjectRealtimeGrabMessageSchema,
  RoomObjectRealtimeInboundSchema,
  RoomObjectRealtimeMessageSchema,
  RoomObjectRealtimeParameterMessageSchema,
  RoomObjectRealtimePoseMessageSchema,
  RoomObjectRealtimeReleaseMessageSchema,
  RoomObjectRealtimeRemoveMessageSchema,
  RoomObjectRealtimeTouchMessageSchema,
  RoomObjectRealtimeUpsertMessageSchema,
  RoomObjectRendererSchema,
  RoomObjectSchema,
  RoomObjectSourceSchema,
  RoomObjectStatusSchema,
  RoomObjectTemplateSchema,
  RoomObjectTouchPolicySchema,
  RoomObjectUploadKindSchema,
  RoomObjectsSettingsSchema,
  RoomSchema,
  RoomSessionMessageV1Schema,
  RoomSessionResponseSchema,
  RoomSettingsSchema,
  RoomWithManifestSchema,
  RotationSchema,
  SharedBrowserControlLeaseMessageV1Schema,
  SharedBrowserControlLeaseRequestSchema,
  SharedBrowserControlLeaseSchema,
  SharedBrowserHistoryMessageV1Schema,
  SharedBrowserHistoryRequestSchema,
  SharedBrowserHyperbeamQualitySchema,
  SharedBrowserHyperbeamSessionSchema,
  SharedBrowserKeyEventSchema,
  SharedBrowserNavigateMessageV1Schema,
  SharedBrowserNavigateRequestSchema,
  SharedBrowserPointerBatchSchema,
  SharedBrowserPointerEventSchema,
  SharedBrowserPointerMessageV1Schema,
  SharedBrowserRealtimeDispatchResponseSchema,
  SharedBrowserRealtimeMessageSchema,
  SharedBrowserSessionMessageV1Schema,
  SharedBrowserSessionResponseSchema,
  SharedBrowserSessionSchema,
  SharedBrowserSessionStatusSchema,
  SharedBrowserStateMessageV1Schema,
  SharedBrowserWallObjectStateSchema,
  SpatialAudioConfigSchema,
  StartMeetingNotesSessionResponseSchema,
  UploadMeetingNotesAudioChunkResponseSchema,
  UserSchema,
  Vector3Schema,
  ViewModeSchema,
  WallAttachmentDownloadResponseSchema,
  WallAttachmentSchema,
  WallObjectCreationPolicySchema,
  WallObjectPlacementSchema,
  WallObjectSchema,
  WallObjectSourceSchema,
  WallObjectStatusSchema,
  WallObjectTypeSchema,
  WallPlaybackStateMessageSchema,
  WhiteboardClearedMessageV1Schema,
  WhiteboardCursorMessageV1Schema,
  WhiteboardPointSchema,
  WhiteboardRealtimeMessageSchema,
  WhiteboardSnapshotReadyMessageV1Schema,
  WhiteboardSnapshotSchema,
  WhiteboardStrokeCommitMessageV1Schema,
  WhiteboardStrokeDeltaMessageV1Schema,
  WhiteboardStrokeEraseMessageV1Schema,
  WhiteboardStrokeSchema,
  WhiteboardTextPayloadSchema,
  WhiteboardToolSchema,
  WhiteboardWallObjectStateSchema,
  WorldSkinAssetFileNameSchema,
  WorldSkinBuiltinSlugSchema,
  WorldSkinDayNightModeSchema,
  WorldSkinDomeCeilingSchema,
  WorldSkinLightingPresetSchema,
  WorldSkinMaterialOverrideSchema,
  WorldSkinOverridesSchema,
  WorldSkinPanoramaSliceSchema,
  WorldSkinPanoramaWallSchema,
  WorldSkinUploaderStatusResponseSchema,
  WorldSkinWallIdSchema
} = dependencies;export const ClassroomHelpRequestSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  note: z.string().max(500).optional(),
  kind: z.enum(["help", "hallpass"]).default("help"),
  status: z.enum(["raised", "acknowledged", "closed", "cancelled"]),
  approvedAt: z.string().optional(),
  returnedAt: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
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
  "student-share",
  "slide-deck",
  "exit-ticket"
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

export const LessonSlideLayoutSchema = z.enum([
  "title",
  "bullets",
  "big-fact",
  "quote",
  "image",
  "image-text"
]);

export const LessonSlideSchema = z.object({
  id: z.string().min(1),
  layout: LessonSlideLayoutSchema.default("title"),
  title: z.string().max(160).default(""),
  body: z.string().max(1200).default(""),
  imageAttachmentId: z.string().optional(),
  imageUrl: z.string().url().optional(),
  /** Teacher-only presenter notes; stripped from student payloads and the wall object. */
  speakerNotes: z.string().max(1000).optional()
});

export const LessonSlideDeckThemeSchema = z.enum(["midnight", "paper", "chalkboard"]);

export const LessonStepSlideDeckPayloadSchema = z.object({
  wallAnchorId: z.string().min(1),
  theme: LessonSlideDeckThemeSchema.default("midnight"),
  slides: z.array(LessonSlideSchema).min(1).max(40),
  spotlightBoard: z.boolean().default(true),
  removeOnAdvance: z.boolean().default(true)
});

export const LessonStepExitTicketChoiceSchema = ClassroomPrivateCheckChoiceSchema;

export const LessonStepExitTicketPayloadSchema = z.object({
  reflectionPrompt: z.string().min(1).max(500),
  includeConfidence: z.boolean().default(true),
  confidenceRange: z
    .object({ min: z.number().int().min(1), max: z.number().int().min(2).max(10) })
    .default({ min: 1, max: 5 }),
  whatsNext: z
    .object({
      question: z.string().min(1).max(500),
      choices: z.array(LessonStepExitTicketChoiceSchema).min(2).max(6)
    })
    .optional(),
  requiredToEnd: z.boolean().default(false),
  autoCloseOnAdvance: z.boolean().default(true),
  wallAnchorId: z.string().optional()
});

export const LessonStepPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instruction"), data: LessonStepInstructionPayloadSchema }),
  z.object({ kind: z.literal("focus-board"), data: LessonStepFocusBoardPayloadSchema }),
  z.object({ kind: z.literal("private-check"), data: LessonStepPrivateCheckPayloadSchema }),
  z.object({ kind: z.literal("group-work"), data: LessonStepGroupWorkPayloadSchema }),
  z.object({ kind: z.literal("timer"), data: LessonStepTimerPayloadSchema }),
  z.object({ kind: z.literal("student-share"), data: LessonStepStudentSharePayloadSchema }),
  z.object({ kind: z.literal("slide-deck"), data: LessonStepSlideDeckPayloadSchema }),
  z.object({ kind: z.literal("exit-ticket"), data: LessonStepExitTicketPayloadSchema })
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
  createdWallObjectId: z.string().optional(),
  createdExitTicket: z.object({
    reflectionCheckId: z.string(),
    confidenceCheckId: z.string().optional(),
    whatsNextCheckId: z.string().optional()
  }).optional()
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

export const ClassroomPodsRuntimeSchema = z.object({
  podsEnabled: z.boolean().default(false),
  broadcastFromUserIds: z.array(z.string()).default([])
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
  reactionsLocked: z.boolean().default(false).optional(),
  podsRuntime: ClassroomPodsRuntimeSchema.default({
    podsEnabled: false,
    broadcastFromUserIds: []
  }).optional(),
  whisper: z.object({
    allowed: z.boolean().default(false),
    maxRadiusMeters: z.number().positive().max(20).default(3),
    autoEnableInGroupWork: z.boolean().default(true)
  }).default({ allowed: false, maxRadiusMeters: 3, autoEnableInGroupWork: true }).optional(),
  studentMediaRuntime: z.object({
    camerasEnabled: z.boolean().default(true),
    microphonesEnabled: z.boolean().default(true),
    cameraEnabledUserIds: z.array(z.string()).default([]),
    microphoneEnabledUserIds: z.array(z.string()).default([])
  }).default({
    camerasEnabled: true,
    microphonesEnabled: true,
    cameraEnabledUserIds: [],
    microphoneEnabledUserIds: []
  }).optional(),
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

export const ClassroomSetRoomSkinActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-room-skin"),
  skinId: z.string().nullable()
});

export const ClassroomSetRoomSkinDayNightActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-room-skin-day-night"),
  mode: WorldSkinDayNightModeSchema
});

export const ClassroomTogglePodsActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("toggle-pods"),
  enabled: z.boolean()
});

export const ClassroomSetStudentBroadcastActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-broadcast"),
  userId: z.string().min(1),
  enabled: z.boolean()
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
  type: z.literal("end-lesson-run"),
  force: z.boolean().default(false)
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

export const ClassroomSetReactionsLockedActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-reactions-locked"),
  locked: z.boolean()
});

export const ClassroomRequestHallpassActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("request-hallpass")
});

export const ClassroomApproveHallpassActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("approve-hallpass"),
  requestId: z.string().min(1)
});

export const ClassroomDenyHallpassActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("deny-hallpass"),
  requestId: z.string().min(1)
});

export const ClassroomReturnFromHallpassActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("return-from-hallpass"),
  requestId: z.string().optional()
});

export const ClassroomUpdateWhisperSettingsActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("update-whisper-settings"),
  allowed: z.boolean().optional(),
  maxRadiusMeters: z.number().positive().max(20).optional(),
  autoEnableInGroupWork: z.boolean().optional()
});

export const ClassroomSetStudentMediaGlobalActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-media-global"),
  medium: z.enum(["camera", "microphone"]),
  enabled: z.boolean()
});

export const ClassroomSetStudentMediaAccessActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-media-access"),
  userId: z.string().min(1),
  medium: z.enum(["camera", "microphone"]),
  enabled: z.boolean()
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
  ClassroomSetRoomSkinActionSchema,
  ClassroomSetRoomSkinDayNightActionSchema,
  ClassroomTogglePodsActionSchema,
  ClassroomSetStudentBroadcastActionSchema,
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
  ClassroomSetAvatarEditorLockedActionSchema,
  ClassroomSetReactionsLockedActionSchema,
  ClassroomRequestHallpassActionSchema,
  ClassroomApproveHallpassActionSchema,
  ClassroomDenyHallpassActionSchema,
  ClassroomReturnFromHallpassActionSchema,
  ClassroomUpdateWhisperSettingsActionSchema,
  ClassroomSetStudentMediaGlobalActionSchema,
  ClassroomSetStudentMediaAccessActionSchema
]);

export const LessonRecapSchema = z.object({
  lessonRunId: z.string(),
  roomId: z.string(),
  title: z.string(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  attendance: z.object({
    knownParticipantIds: z.array(z.string()),
    total: z.number().int().nonnegative()
  }),
  steps: z.array(z.object({
    stepId: z.string(),
    kind: LessonStepKindSchema,
    title: z.string(),
    drifted: z.boolean(),
    driftReason: z.string().optional()
  })),
  privateChecks: z.array(z.object({
    checkId: z.string(),
    question: z.string(),
    promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
    responseCount: z.number().int().nonnegative(),
    choiceCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
    confidenceAverage: z.number().optional()
  })),
  exitTicket: z.object({
    stepId: z.string(),
    submittedCount: z.number().int().nonnegative(),
    expectedCount: z.number().int().nonnegative(),
    confidenceAverage: z.number().optional(),
    whatsNextChoices: z.array(ClassroomPrivateCheckChoiceSchema).optional(),
    reflections: z.array(z.object({
      userId: z.string(),
      displayName: z.string(),
      answer: z.string(),
      confidence: z.number().optional(),
      whatsNextChoiceId: z.string().optional(),
      submittedAt: z.string()
    }))
  }).optional()
});
export type LessonRecap = z.infer<typeof LessonRecapSchema>;

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

export const RoomSkinMessageSchema = z.object({
  type: z.literal("room.skin.v1"),
  skinId: z.string().nullable(),
  version: z.number().int().positive().optional(),
  dayNight: WorldSkinDayNightModeSchema.default("day"),
  crossfadeMs: z.number().int().min(0).max(5000).default(1000)
});
export type RoomSkinMessage = z.infer<typeof RoomSkinMessageSchema>;

export const RoomPlayModeMessageSchema = z.object({
  type: z.literal("room.play-mode.v1"),
  roomId: z.string(),
  playModeEnabled: z.boolean(),
  sentAt: z.number().int(),
  senderId: z.string()
});
export type RoomPlayModeMessage = z.infer<typeof RoomPlayModeMessageSchema>;

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

export const AuthUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string().email().optional()
});

export const AuthSessionExchangeRequestSchema = z.object({
  code: z.string().min(1)
});

export const AuthSessionExchangeResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),
  refreshExpiresAt: z.string(),
  user: AuthUserSchema
});

export const AuthSessionRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1)
});

export const AuthSessionRefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),
  refreshExpiresAt: z.string()
});

export const AuthMeResponseSchema = z.object({
  user: AuthUserSchema
});

export type Role = z.infer<typeof RoleSchema>;
export type ViewMode = z.infer<typeof ViewModeSchema>;
export type QualityLevel = z.infer<typeof QualityLevelSchema>;
export type Vector3 = z.infer<typeof Vector3Schema>;
export type Rotation = z.infer<typeof RotationSchema>;
export type SpatialAudioConfig = z.infer<typeof SpatialAudioConfigSchema>;
export type RoomManifest = z.infer<typeof RoomManifestSchema>;
export type User = z.infer<typeof UserSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type ClassRecord = z.infer<typeof ClassSchema>;
export type ClassMembership = z.infer<typeof ClassMembershipSchema>;
export type Invite = z.infer<typeof InviteSchema>;
export type RoomRecord = z.infer<typeof RoomSchema>;
export type RoomWithManifest = z.infer<typeof RoomWithManifestSchema>;
export type PhysicsTuning = z.infer<typeof PhysicsTuningSchema>;
export type AvatarStateMessage = z.infer<typeof AvatarStateMessageSchema>;
export type AvatarMovement = z.infer<typeof AvatarMovementSchema>;
export type AvatarAirborneState = z.infer<typeof AvatarAirborneStateSchema>;
export type RoomSessionResponse = z.infer<typeof RoomSessionResponseSchema>;
export type MeetingNotesSessionStatus = z.infer<typeof MeetingNotesSessionStatusSchema>;
export type MeetingNotesSegment = z.infer<typeof MeetingNotesSegmentSchema>;
export type MeetingNotesSession = z.infer<typeof MeetingNotesSessionSchema>;
export type MeetingNotesSessionDetail = z.infer<typeof MeetingNotesSessionDetailSchema>;
export type MeetingNotesSessionListResponse = z.infer<typeof MeetingNotesSessionListResponseSchema>;
export type StartMeetingNotesSessionResponse = z.infer<typeof StartMeetingNotesSessionResponseSchema>;
export type UploadMeetingNotesAudioChunkResponse = z.infer<typeof UploadMeetingNotesAudioChunkResponseSchema>;
export type MeetingNotesDownloadFormat = z.infer<typeof MeetingNotesDownloadFormatSchema>;
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
export type WhiteboardTool = z.infer<typeof WhiteboardToolSchema>;
export type WhiteboardPoint = z.infer<typeof WhiteboardPointSchema>;
export type WhiteboardTextPayload = z.infer<typeof WhiteboardTextPayloadSchema>;
export type WhiteboardStroke = z.infer<typeof WhiteboardStrokeSchema>;
export type WhiteboardSnapshot = z.infer<typeof WhiteboardSnapshotSchema>;
export type WhiteboardWallObjectState = z.infer<typeof WhiteboardWallObjectStateSchema>;
export type ListWhiteboardStrokesResponse = z.infer<typeof ListWhiteboardStrokesResponseSchema>;
export type CommitWhiteboardStrokeResponse = z.infer<typeof CommitWhiteboardStrokeResponseSchema>;
export type EraseWhiteboardStrokesResponse = z.infer<typeof EraseWhiteboardStrokesResponseSchema>;
export type ClearWhiteboardResponse = z.infer<typeof ClearWhiteboardResponseSchema>;
export type RequestWhiteboardSnapshotResponse = z.infer<typeof RequestWhiteboardSnapshotResponseSchema>;
export type Pose = z.infer<typeof PoseSchema>;
export type RoomObjectTouchPolicy = z.infer<typeof RoomObjectTouchPolicySchema>;
export type RoomObjectStatus = z.infer<typeof RoomObjectStatusSchema>;
export type RoomObjectSource = z.infer<typeof RoomObjectSourceSchema>;
export type RoomObjectRenderer = z.infer<typeof RoomObjectRendererSchema>;
export type RoomObjectCategory = z.infer<typeof RoomObjectCategorySchema>;
export type RoomObjectParameterField = z.infer<typeof RoomObjectParameterFieldSchema>;
export type RoomObjectParameterSchemaMap = z.infer<typeof RoomObjectParameterSchemaMapSchema>;
export type RoomObjectTemplate = z.infer<typeof RoomObjectTemplateSchema>;
export type RoomObject = z.infer<typeof RoomObjectSchema>;
export type BuildPieceKind = z.infer<typeof BuildPieceKindSchema>;
export type LogicPieceKind = z.infer<typeof LogicPieceKindSchema>;
export type LogicRole = z.infer<typeof LogicRoleSchema>;
export type LogicConfig = z.infer<typeof LogicConfigSchema>;
export type LogicConfigInput = z.input<typeof LogicConfigSchema>;
export type BuildLogicPiece = z.infer<typeof BuildLogicPieceSchema>;
export type LogicChannelState = z.infer<typeof LogicChannelStateSchema>;
export type LogicState = z.infer<typeof LogicStateSchema>;
export type RoomLogicRealtimeMessage = z.infer<typeof RoomLogicRealtimeMessageSchema>;
export type LogicSignalKind = z.infer<typeof LogicSignalKindSchema>;
export type EscapeSession = z.infer<typeof EscapeSessionSchema>;
export type EscapeSessionStatus = z.infer<typeof EscapeSessionStatusSchema>;
export type RoomSessionRealtimeMessage = z.infer<typeof RoomSessionMessageV1Schema>;
export type BuildPieceEdge = z.infer<typeof BuildPieceEdgeSchema>;
export type BuildPieceRotation = z.infer<typeof BuildPieceRotationSchema>;
export type BuildPieceMaterial = z.infer<typeof BuildPieceMaterialSchema>;
export type ImageFloorTextureSpanCells = z.infer<typeof ImageFloorTextureSpanCellsSchema>;
export type BuildDestroyPolicy = z.infer<typeof BuildDestroyPolicySchema>;
export type BuildPiece = z.infer<typeof BuildPieceSchema>;
export type CreateBuildFloorTextureUploadRequest = z.infer<typeof CreateBuildFloorTextureUploadRequestSchema>;
export type CreateBuildFloorTextureUploadResponse = z.infer<typeof CreateBuildFloorTextureUploadResponseSchema>;
export type RoomBuildRealtimeMessage = z.infer<typeof RoomBuildRealtimeMessageSchema>;
export type RoomBuildUpsertMessageV1 = z.infer<typeof RoomBuildUpsertMessageV1Schema>;
export type RoomBuildRemoveMessageV1 = z.infer<typeof RoomBuildRemoveMessageV1Schema>;
export type RoomBuildBatchMessageV1 = z.infer<typeof RoomBuildBatchMessageV1Schema>;
export type RoomObjectsSettings = z.infer<typeof RoomObjectsSettingsSchema>;
export type RoomObjectUploadKind = z.infer<typeof RoomObjectUploadKindSchema>;
export type RoomObjectProceduralRenderProps = z.infer<typeof RoomObjectProceduralRenderPropsSchema>;
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type RoomObjectRealtimeMessage = z.infer<typeof RoomObjectRealtimeMessageSchema>;
export type RoomObjectRealtimeInbound = z.infer<typeof RoomObjectRealtimeInboundSchema>;
export type RoomObjectRealtimeDispatchResponse = z.infer<typeof RoomObjectRealtimeDispatchResponseSchema>;
export type RoomObjectRealtimeUpsertMessage = z.infer<typeof RoomObjectRealtimeUpsertMessageSchema>;
export type RoomObjectRealtimeRemoveMessage = z.infer<typeof RoomObjectRealtimeRemoveMessageSchema>;
export type RoomObjectRealtimeTouchMessage = z.infer<typeof RoomObjectRealtimeTouchMessageSchema>;
export type RoomObjectRealtimeGrabMessage = z.infer<typeof RoomObjectRealtimeGrabMessageSchema>;
export type RoomObjectRealtimePoseMessage = z.infer<typeof RoomObjectRealtimePoseMessageSchema>;
export type RoomObjectRealtimeReleaseMessage = z.infer<typeof RoomObjectRealtimeReleaseMessageSchema>;
export type RoomObjectRealtimeParameterMessage = z.infer<typeof RoomObjectRealtimeParameterMessageSchema>;
export type WallPlaybackStateMessage = z.infer<typeof WallPlaybackStateMessageSchema>;
export type WhiteboardCursorMessageV1 = z.infer<typeof WhiteboardCursorMessageV1Schema>;
export type WhiteboardStrokeDeltaMessageV1 = z.infer<typeof WhiteboardStrokeDeltaMessageV1Schema>;
export type WhiteboardStrokeCommitMessageV1 = z.infer<typeof WhiteboardStrokeCommitMessageV1Schema>;
export type WhiteboardStrokeEraseMessageV1 = z.infer<typeof WhiteboardStrokeEraseMessageV1Schema>;
export type WhiteboardClearedMessageV1 = z.infer<typeof WhiteboardClearedMessageV1Schema>;
export type WhiteboardSnapshotReadyMessageV1 = z.infer<typeof WhiteboardSnapshotReadyMessageV1Schema>;
export type WhiteboardRealtimeMessage = z.infer<typeof WhiteboardRealtimeMessageSchema>;
export type SharedBrowserHyperbeamQuality = z.infer<typeof SharedBrowserHyperbeamQualitySchema>;
export type SharedBrowserHyperbeamSession = z.infer<typeof SharedBrowserHyperbeamSessionSchema>;
export type SharedBrowserSessionStatus = z.infer<typeof SharedBrowserSessionStatusSchema>;
export type SharedBrowserControlLease = z.infer<typeof SharedBrowserControlLeaseSchema>;
export type SharedBrowserSession = z.infer<typeof SharedBrowserSessionSchema>;
export type SharedBrowserWallObjectState = z.infer<typeof SharedBrowserWallObjectStateSchema>;
export type SharedBrowserPointerEvent = z.infer<typeof SharedBrowserPointerEventSchema>;
export type SharedBrowserKeyEvent = z.infer<typeof SharedBrowserKeyEventSchema>;
export type SharedBrowserNavigateRequest = z.infer<typeof SharedBrowserNavigateRequestSchema>;
export type SharedBrowserHistoryRequest = z.infer<typeof SharedBrowserHistoryRequestSchema>;
export type SharedBrowserControlLeaseRequest = z.infer<typeof SharedBrowserControlLeaseRequestSchema>;
export type SharedBrowserPointerBatch = z.infer<typeof SharedBrowserPointerBatchSchema>;
export type SharedBrowserSessionResponse = z.infer<typeof SharedBrowserSessionResponseSchema>;
export type SharedBrowserRealtimeDispatchResponse = z.infer<typeof SharedBrowserRealtimeDispatchResponseSchema>;
export type SharedBrowserPointerMessageV1 = z.infer<typeof SharedBrowserPointerMessageV1Schema>;
export type SharedBrowserNavigateMessageV1 = z.infer<typeof SharedBrowserNavigateMessageV1Schema>;
export type SharedBrowserHistoryMessageV1 = z.infer<typeof SharedBrowserHistoryMessageV1Schema>;
export type SharedBrowserControlLeaseMessageV1 = z.infer<typeof SharedBrowserControlLeaseMessageV1Schema>;
export type SharedBrowserStateMessageV1 = z.infer<typeof SharedBrowserStateMessageV1Schema>;
export type SharedBrowserSessionMessageV1 = z.infer<typeof SharedBrowserSessionMessageV1Schema>;
export type SharedBrowserRealtimeMessage = z.infer<typeof SharedBrowserRealtimeMessageSchema>;
export type ClassroomHelpRequest = z.infer<typeof ClassroomHelpRequestSchema>;
export type ClassroomBoardAccessGrant = z.infer<typeof ClassroomBoardAccessGrantSchema>;
export type ClassroomGroupHold = z.infer<typeof ClassroomGroupHoldSchema>;
export type ClassroomGroup = z.infer<typeof ClassroomGroupSchema>;
export type ClassroomPodsRuntime = z.infer<typeof ClassroomPodsRuntimeSchema>;
export type ClassroomSpotlight = z.infer<typeof ClassroomSpotlightSchema>;
export type ClassroomPrivateCheckChoice = z.infer<typeof ClassroomPrivateCheckChoiceSchema>;
export type ClassroomPrivateCheckResponse = z.infer<typeof ClassroomPrivateCheckResponseSchema>;
export type ClassroomPrivateCheckTarget = z.infer<typeof ClassroomPrivateCheckTargetSchema>;
export type ClassroomPrivateCheck = z.infer<typeof ClassroomPrivateCheckSchema>;
export type LessonStepKind = z.infer<typeof LessonStepKindSchema>;
export type LessonSlideLayout = z.infer<typeof LessonSlideLayoutSchema>;
export type LessonSlide = z.infer<typeof LessonSlideSchema>;
export type LessonSlideDeckTheme = z.infer<typeof LessonSlideDeckThemeSchema>;
export type LessonStepSlideDeckPayload = z.infer<typeof LessonStepSlideDeckPayloadSchema>;
export type LessonStepPayload = z.infer<typeof LessonStepPayloadSchema>;
export type LessonStepExitTicketChoice = z.infer<typeof LessonStepExitTicketChoiceSchema>;
export type LessonStepExitTicketPayload = z.infer<typeof LessonStepExitTicketPayloadSchema>;
export type LessonStep = z.infer<typeof LessonStepSchema>;
export type LessonStepInput = z.infer<typeof LessonStepInputSchema>;
export type LessonRunStepRecord = z.infer<typeof LessonRunStepRecordSchema>;
export type LessonActiveTimer = z.infer<typeof LessonActiveTimerSchema>;
export type LessonRunStatus = z.infer<typeof LessonRunStatusSchema>;
export type LessonRun = z.infer<typeof LessonRunSchema>;
export type ClassroomState = z.infer<typeof ClassroomStateSchema>;
export type ClassroomAction = z.infer<typeof ClassroomActionSchema>;
export type ClassroomTogglePodsAction = z.infer<typeof ClassroomTogglePodsActionSchema>;
export type ClassroomSetStudentBroadcastAction = z.infer<typeof ClassroomSetStudentBroadcastActionSchema>;
export type ClassroomHelpRequestKind = z.infer<typeof ClassroomHelpRequestSchema>["kind"];
export type ClassroomStateChangedRealtimeMessage = z.infer<typeof ClassroomStateChangedRealtimeSchema>;
export type ClassroomStateRealtimeMessage = z.infer<typeof ClassroomStateRealtimeSchema>;
export type WorldSkinOverrides = z.infer<typeof WorldSkinOverridesSchema>;
export type WorldSkinLightingPreset = z.infer<typeof WorldSkinLightingPresetSchema>;
export type WorldSkinMaterialOverride = z.infer<typeof WorldSkinMaterialOverrideSchema>;
export type WorldSkinDomeCeiling = z.infer<typeof WorldSkinDomeCeilingSchema>;
export type WorldSkinPanoramaWall = z.infer<typeof WorldSkinPanoramaWallSchema>;
export type WorldSkinPanoramaSlice = z.infer<typeof WorldSkinPanoramaSliceSchema>;
export type WorldSkinWallId = z.infer<typeof WorldSkinWallIdSchema>;
export type WorldSkinDayNightMode = z.infer<typeof WorldSkinDayNightModeSchema>;
export type WorldSkinBuiltinSlug = z.infer<typeof WorldSkinBuiltinSlugSchema>;
export type WorldSkinAssetFileName = z.infer<typeof WorldSkinAssetFileNameSchema>;
export type WorldSkinUploaderStatus = z.infer<typeof WorldSkinUploaderStatusResponseSchema>;
export type ClassroomSetRoomSkinAction = z.infer<typeof ClassroomSetRoomSkinActionSchema>;
export type ClassroomSetRoomSkinDayNightAction = z.infer<typeof ClassroomSetRoomSkinDayNightActionSchema>;
export type ClassroomSetStudentMediaGlobalAction = z.infer<typeof ClassroomSetStudentMediaGlobalActionSchema>;
export type ClassroomSetStudentMediaAccessAction = z.infer<typeof ClassroomSetStudentMediaAccessActionSchema>;
