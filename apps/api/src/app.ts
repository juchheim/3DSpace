import { Buffer } from "node:buffer";
import cors from "@fastify/cors";
import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z, type ZodTypeAny } from "zod";
import {
  AcceptInviteResponseSchema,
  AvatarAppearanceSchema,
  ClassroomActionSchema,
  ClassroomStateSchema,
  CreateClassRequestSchema,
  CreateInviteRequestSchema,
  CreateRoomObjectRequestSchema,
  CreateRoomObjectResponseSchema,
  CreateRoomObjectTemplateRequestSchema,
  CreateRoomObjectTemplateResponseSchema,
  CreateRoomObjectUploadRequestSchema,
  CreateRoomObjectUploadResponseSchema,
  CreateWorldSkinUploadRequestSchema,
  CreateWorldSkinUploadResponseSchema,
  WorldSkinUploaderVerifyRequestSchema,
  WorldSkinUploaderVerifyResponseSchema,
  WorldSkinUploaderStatusQuerySchema,
  WorldSkinUploaderStatusResponseSchema,
  CreateRoomRequestSchema,
  CreateWallObjectRequestSchema,
  CreateWallShareRequestSchema,
  CreateWallAttachmentRequestSchema,
  CreateWebResourceRequestSchema,
  DeleteRoomResponseSchema,
  FinalizeWallAttachmentRequestSchema,
  HealthResponseSchema,
  JoinRoomSessionRequestSchema,
  JoinFreeForAllSessionRequestSchema,
  ListWorldSkinsResponseSchema,
  ListRoomObjectTemplatesQuerySchema,
  GetRoomObjectTemplateQuerySchema,
  ListWhiteboardStrokesQuerySchema,
  ListWhiteboardStrokesResponseSchema,
  WorldSkinSchema,
  RoomSkinMessageSchema,
  ListRoomObjectTemplatesResponseSchema,
  ListRoomObjectsQuerySchema,
  ListRoomObjectsResponseSchema,
  ListWallObjectsQuerySchema,
  LessonRunSchema,
  RoomEventRequestSchema,
  RoomSessionResponseSchema,
  RoomWithManifestSchema,
  RoomObjectRealtimeDispatchResponseSchema,
  RoomObjectRealtimeInboundSchema,
  RoomObjectResetResponseSchema,
  RoomObjectSchema,
  RoomObjectTemplateSchema,
  RoomObjectTouchRequestSchema,
  UpdateClassRequestSchema,
  UpdateRoomObjectRequestSchema,
  UpdateRoomRequestSchema,
  UpdateWallAttachmentRequestSchema,
  UpdateWallObjectRequestSchema,
  UpsertClassMemberRequestSchema,
  WallObjectControlRequestSchema,
  WallObjectSchema,
  WallObjectTypeSchema,
  WallAttachmentDownloadResponseSchema,
  WebResourcePreviewRequestSchema,
  WebResourcePreviewResponseSchema,
  createOpenApiDocument,
  type ClassMembership,
  type ClassroomAction,
  type ClassroomBoardAccessGrant,
  type ClassroomGroup,
  type ClassroomPrivateCheck,
  type ClassroomSpotlight,
  type ClassroomState,
  type LessonActiveTimer,
  type LessonRecap,
  type LessonRun,
  type LessonRunStepRecord,
  type LessonStep,
  type LessonStepInput,
  type WallAttachment,
  type RoomObjectRealtimeMessage,
  type WallObject,
  type WallObjectType,
  type WhiteboardRealtimeMessage,
  type WorldSkin,
  type RoomSettings,
  type RoomType,
  type DynamicWallAnchor,
  type CreateDynamicWallAnchorRequest,
  type UpdateDynamicWallAnchorRequest,
  CreateDynamicWallAnchorRequestSchema,
  UpdateDynamicWallAnchorRequestSchema,
  DynamicWallAnchorSchema,
  ListFreeForAllRoomsResponseSchema,
  MeetingNotesDownloadFormatSchema,
  MeetingNotesEndedMessageV1Schema,
  MeetingNotesErrorMessageV1Schema,
  MeetingNotesSegmentSchema,
  MeetingNotesSessionDetailSchema,
  MeetingNotesSessionListResponseSchema,
  MeetingNotesSessionSchema,
  MeetingNotesStartedMessageV1Schema,
  MeetingNotesSummaryReadyMessageV1Schema,
  PatchMeetingNotesSessionRequestSchema,
  RoomBoardCreatedMessageV1Schema,
  RoomBoardUpdatedMessageV1Schema,
  RoomBoardRemovedMessageV1Schema,
  StartMeetingNotesSessionResponseSchema,
  CommitWhiteboardStrokeRequestSchema,
  CommitWhiteboardStrokeResponseSchema,
  EraseWhiteboardStrokesRequestSchema,
  EraseWhiteboardStrokesResponseSchema,
  ClearWhiteboardResponseSchema,
  RequestWhiteboardSnapshotResponseSchema,
  SharedBrowserNavigateRequestSchema,
  SharedBrowserHistoryRequestSchema,
  SharedBrowserControlLeaseRequestSchema,
  SharedBrowserPointerBatchSchema,
  SharedBrowserSessionResponseSchema,
  SharedBrowserRealtimeDispatchResponseSchema,
  UpdateMeetingNotesSummaryRequestSchema,
  UploadMeetingNotesAudioChunkRequestSchema,
  UploadMeetingNotesAudioChunkResponseSchema,
  WhiteboardStrokeCommitMessageV1Schema,
  WhiteboardStrokeEraseMessageV1Schema,
  WhiteboardClearedMessageV1Schema,
  WhiteboardSnapshotReadyMessageV1Schema,
  getRoomTypeFeatureFlags
} from "@3dspace/contracts";
import {
  anchorHasOccupyingWallObject,
  applyDefaultWallAnchorDimensions,
  computeGroupTargetPositionFromAnchor,
  createDefaultRoomManifest,
  createFreeForAllManifest,
  createWorkforceTrainingManifest,
  createInitialPollState,
  isValidPollChoiceId,
  normalizePollInlineData,
  readPollState,
  validateDynamicBoardPlacement
} from "@3dspace/room-engine";
import { authenticate, type AuthContext } from "./auth.js";
import { loadConfig, livekitConfigured, storageConfigured, type AppConfig } from "./config.js";
import {
  badRequest,
  conflict,
  exitTicketIncomplete,
  forbidden,
  HttpError,
  notFound,
  notImplemented,
  roomObjectDisabled,
  roomObjectUploadRejected,
  worldSkinsDisabled,
  roomObjectTouchDenied,
  tooManyRequests,
  unprocessableEntity
} from "./errors.js";
import {
  buildRoomObjectTemplateSlug,
  validateCustomRoomObjectAsset,
  validateCustomRoomObjectThumbnail
} from "./room-objects/custom-template-upload.js";
import { seedBuiltinRoomObjectTemplates } from "./room-objects/builtin-catalog.js";
import { seedBuiltinWorldSkins } from "./world-skins/builtin-catalog.js";
import { RoomObjectGrabLock } from "./room-objects/grab-lock.js";
import { SharedBrowserOrchestrator, type SharedBrowserActor } from "./shared-browser/orchestrator.js";
import { PuppeteerSharedBrowserDriver } from "./shared-browser/puppeteer-driver.js";
import { SharedBrowserIdleReaper } from "./shared-browser/idle-reaper.js";
import { SharedBrowserVideoManager } from "./shared-browser/video-manager.js";
import { JpegFrameStore } from "./shared-browser/jpeg-fallback.js";
import type { SharedBrowserDriver } from "./shared-browser/types.js";
import {
  assertCanTouchRoomObject,
  assertRoomObjectNotLocked,
  assertRoomObjectsEnabled,
  clampRoomObjectPose,
  clampRoomObjectScale,
  enforceActiveRoomObjectCap,
  requireRoomObject,
  studentPatchKeysOnly
} from "./room-objects/helpers.js";
import {
  buildRoomObjectRemoveMessage,
  buildRoomObjectTouchMessage,
  buildRoomObjectUpsertMessage
} from "./room-objects/realtime-outbox.js";
import {
  clearRoomObjectParameterDebounceForTests,
  dispatchRoomObjectRealtimeMessage,
  forceReleaseRoomObjectGrab
} from "./room-objects/realtime-dispatch.js";
import {
  assertWorldSkinUploadContentType,
  assertWorldSkinUploaderPassword,
  isRequiredWorldSkinAsset,
  readUploaderPasswordHeader,
  worldSkinAssetPath,
  worldSkinAssetUrl,
  worldSkinStorageKey,
  worldSkinUploaderEnabled,
  WORLD_SKIN_ASSET_FILES
} from "./world-skins/uploader.js";
import { assertFreeForAllPassword } from "./free-for-all/password.js";
import { connectMongo, MongoRepository } from "./models/mongoose.js";
import { MemoryRepository, newId, nowIso, type Repository } from "./repository.js";
import { mintLiveKitToken } from "./services/livekit.js";
import {
  createDownloadTarget,
  createUploadTarget,
  getDevStoredObject,
  putDevStoredObject,
  readStoredObject,
  parseRoomObjectAssetStorageKey,
  roomObjectAssetUrl,
  roomObjectStorageKeyFor,
  storageKeyFor
} from "./services/storage.js";
import { maybeCompactWhiteboard } from "./whiteboards/snapshots.js";
import {
  normalizedWhiteboardStateUpdate,
  readWhiteboardState,
  stampedWhiteboardStroke,
  validateWhiteboardStrokeInput
} from "./whiteboards/validation.js";
import {
  meetingNotesStorageBase,
  summarizeMeetingNotes,
  transcriptSrt,
  transcriptText,
  transcriptVtt,
  transcribeAudioChunk,
  writeMeetingNotesArtifacts
} from "./meeting-notes/service.js";
import {
  aiObjectDownloadFilename,
  cancelJob as cancelAiObjectJob,
  deleteJob as deleteAiObjectJob,
  startJob as startAiObjectJob,
  startAiObjectRetentionReaper
} from "./ai-objects/index.js";
import {
  AiObjectJobSchema,
  ListAiObjectJobsResponseSchema,
  PatchAiObjectJobRequestSchema,
  PlaceAiObjectRequestSchema,
  PlaceAiObjectResponseSchema,
  StartAiObjectJobRequestSchema,
  StartAiObjectJobResponseSchema,
  type AiObjectJob
} from "@3dspace/contracts";

type BuildAppOptions = {
  config?: AppConfig;
  repository?: Repository;
  roomObjectGrabLock?: RoomObjectGrabLock;
  sharedBrowserOrchestrator?: SharedBrowserOrchestrator;
};

function normalizeRequestOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "");
}

function originAllowed(origin: string, allowedOrigins: AppConfig["corsAllowedOrigins"]) {
  const normalizedOrigin = normalizeRequestOrigin(origin);
  return allowedOrigins.some((allowedOrigin) =>
    typeof allowedOrigin === "string"
      ? normalizeRequestOrigin(allowedOrigin) === normalizedOrigin
      : allowedOrigin.test(normalizedOrigin)
  );
}

function meetingNotesTaskKey(roomId: string, sessionId: string) {
  return `${roomId}:${sessionId}`;
}

const ParamsWithClassId = z.object({ classId: z.string() });
const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndSessionId = z.object({ roomId: z.string(), sessionId: z.string() });
const ParamsWithRoomAndAttachmentId = z.object({ roomId: z.string(), attachmentId: z.string() });
const ParamsWithRoomAndObjectId = z.object({ roomId: z.string(), objectId: z.string() });
const ParamsWithTemplateId = z.object({ templateId: z.string() });
const ParamsWithRoomAndRunId = z.object({ roomId: z.string(), runId: z.string() });
const ParamsWithInviteCode = z.object({ inviteCode: z.string() });
const SESSION_JOIN_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_PODS_RUNTIME = {
  podsEnabled: false,
  broadcastFromUserIds: [] as string[]
};

type MeetingNotesAudioChunk = {
  participantId: string;
  startedAtMs: number;
  endedAtMs: number;
  mimeType: string;
  audio: Buffer;
};

function parseBody<T extends ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> {
  return schema.parse(request.body ?? {});
}

function parseParams<T extends ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> {
  return schema.parse(request.params ?? {});
}

function parseQuery<T extends ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> {
  return schema.parse(request.query ?? {});
}

async function requireUser(request: FastifyRequest, config: AppConfig, repository: Repository) {
  const auth = await authenticate(request, config);
  await repository.ensureUser(auth);
  return auth;
}

async function requireClassAccess(repository: Repository, classId: string, auth: AuthContext) {
  const record = await repository.getClass(classId);
  if (!record) throw notFound("Class not found");
  const membership = await repository.getMembership(classId, auth.userId);
  if (record.teacherUserId !== auth.userId && membership?.status !== "active") {
    throw forbidden("Class membership required");
  }
  return { record, membership };
}

async function requireClassTeacher(repository: Repository, classId: string, auth: AuthContext) {
  const { record, membership } = await requireClassAccess(repository, classId, auth);
  if (record.teacherUserId !== auth.userId && membership?.role !== "teacher") {
    throw forbidden("Teacher role required");
  }
  return record;
}

async function requireRoomAccess(repository: Repository, roomId: string, auth: AuthContext) {
  const room = await repository.getRoom(roomId);
  if (!room) throw notFound("Room not found");
  const access = await requireClassAccess(repository, room.classId, auth);
  const manifest = await repository.getActiveManifest(room.id);
  if (!manifest) throw notFound("Room manifest not found");
  return { room, manifest: applyDefaultWallAnchorDimensions(manifest, room.type), membership: access.membership };
}

async function requireRoomTeacher(repository: Repository, roomId: string, auth: AuthContext) {
  const room = await repository.getRoom(roomId);
  if (!room) throw notFound("Room not found");
  await requireClassTeacher(repository, room.classId, auth);
  return room;
}

async function assertMeetingNotesAvailable(repository: Repository, config: AppConfig, roomId: string, auth: AuthContext) {
  const { room } = await requireRoomAccess(repository, roomId, auth);
  if (!config.tuning.enableAiMeetingNotes) throw forbidden("AI meeting notes are disabled");
  if (!getRoomTypeFeatureFlags(room.type).aiMeetingNotes) throw forbidden("AI meeting notes are not available for this room type");
  if (!room.settings.aiMeetingNotes?.enabled) throw forbidden("AI meeting notes are disabled for this room");
  return room;
}

function assertAiObjectsEnabled(room: { type: string; settings: { aiObjects?: { enabled?: boolean } } }, config: AppConfig) {
  if (!config.tuning.enableAiObjectGeneration) throw forbidden("AI object generation is disabled");
  if (!getRoomTypeFeatureFlags(room.type).aiObjects) throw forbidden("AI object generation is not available for this room type");
  if (room.settings.aiObjects?.enabled === false) throw forbidden("AI object generation is disabled for this room");
}

async function buildMeetingNotesDetail(repository: Repository, roomId: string, sessionId: string) {
  const session = await repository.getMeetingNotesSession(roomId, sessionId);
  if (!session) throw notFound("Meeting notes session not found");
  const segments = await repository.listMeetingNotesSegments(sessionId);
  return MeetingNotesSessionDetailSchema.parse({ ...session, segments });
}

async function finalizeMeetingNotesSession(
  repository: Repository,
  config: AppConfig,
  room: { id: string; name: string; classId: string },
  sessionId: string
) {
  const session = await repository.getMeetingNotesSession(room.id, sessionId);
  if (!session) throw notFound("Meeting notes session not found");
  const segments = await repository.listMeetingNotesSegments(sessionId);
  const memberships = await repository.listMemberships(room.classId);
  const speakerNames = Object.fromEntries(memberships.map((membership) => [membership.userId, membership.displayName]));
  const participantNames = session.participantUserIds.map((userId) => speakerNames[userId] ?? userId);
  const txt = transcriptText(segments, speakerNames);
  const vtt = transcriptVtt(segments, speakerNames);
  const srt = transcriptSrt(segments, speakerNames);
  const summaryMd = await summarizeMeetingNotes(config, {
    roomName: room.name,
    startedAt: session.startedAt,
    participants: participantNames,
    transcriptText: txt
  });
  const storageBase = meetingNotesStorageBase(config, room.name, session.startedAt);
  const stored = await writeMeetingNotesArtifacts(config, {
    storageBase,
    transcriptTxt: txt,
    transcriptVtt: vtt,
    transcriptSrt: srt,
    summaryMd
  });
  return repository.updateMeetingNotesSession(room.id, sessionId, {
    status: "ready",
    endedAt: new Date().toISOString(),
    durationSec: Math.max(0, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)),
    transcriptStorageKeys: { txt: stored.txt, vtt: stored.vtt, srt: stored.srt },
    summaryStorageKey: stored.md,
    summaryGeneratedAt: new Date().toISOString()
  });
}

function roomSettings(config: AppConfig) {
  return {
    maxParticipants: config.tuning.maxRoomParticipants,
    defaultViewMode: config.tuning.defaultViewMode,
    defaultQuality: config.tuning.defaultQuality,
    enable2DAnalog: config.tuning.enable2DAnalog,
    enableWallAttachments: config.tuning.enableWallAttachments,
    enableWallObjects: config.tuning.enableWallObjects,
    wallObjectCreation: config.tuning.wallObjectCreationDefault,
    wallObjectModeration: "pre" as const,
    allowLiveStudentShares: config.tuning.enableWallStudentLiveShares,
    allowStudentUploads: config.tuning.enableWallStudentUploads,
    allowWebLinks: config.tuning.enableWallWebLinks,
    allowEmbeds: config.tuning.enableWallWebEmbeds,
    maxActiveWallObjects: config.tuning.wallObjectMaxActivePerRoom,
    maxActiveLiveShares: config.tuning.wallObjectMaxActiveLiveShares,
    hallpass: { enabled: true, maxConcurrent: 1, perPeriodLimit: 2 },
    pods: { enabled: true, podRadiusMeters: 3, podMurmurFloor: 0.08, drawPartitions: false },
    roomObjects: {
      enabled: true,
      maxActive: 8,
      customUploadsEnabled: config.tuning.enableRoomObjects,
      maxUploadSizeBytes: 15 * 1024 * 1024,
      defaultTouchPolicy: "teacher-only" as const
    },
    worldSkins: {
      enabled: true,
      skinId: null as string | null,
      skinDayNightMode: "day" as const,
      ambientGainOverride: null as number | null
    },
    studentMedia: {
      camerasEnabled: true,
      microphonesEnabled: true
    },
    aiMeetingNotes: {
      enabled: true,
      autoStartOnFirstJoin: false,
      maxSessionDurationMinutes: config.tuning.aiMeetingNotesMaxDurationMinutes,
      retentionDays: 30
    },
    whiteboards: {
      enabled: config.tuning.enableWhiteboards,
      maxActivePerRoom: config.tuning.whiteboardMaxActivePerRoom,
      maxStrokesPerBoard: 10_000,
      maxPointsPerStroke: config.tuning.whiteboardMaxPointsPerStroke,
      showRemoteCursors: true,
      cursorBroadcastHz: 20,
      allowStudentDraw: true,
      snapshotEvery: config.tuning.whiteboardSnapshotAtStrokes
    },
    aiObjects: {
      enabled: config.tuning.enableAiObjectGeneration,
      maxConcurrentJobsPerRoom: 3,
      maxConcurrentJobsPerUser: 1,
      maxJobsPerUserPerDay: config.tuning.aiObjectMaxJobsPerUserPerDay,
      allowMeshy: config.tuning.aiObjectProvider === "meshy",
      meshyRefineTextures: config.tuning.aiObjectMeshyRefineTextures,
      defaultPolycountTarget: 10000
    },
    sharedBrowsers: {
      enabled: config.tuning.enableSharedBrowsers,
      maxActivePerRoom: config.tuning.sharedBrowserMaxActivePerRoom,
      defaultStartUrl: "https://www.wikipedia.org",
      viewportWidth: config.tuning.sharedBrowserViewportWidth,
      viewportHeight: config.tuning.sharedBrowserViewportHeight,
      idlePauseMinutes: config.tuning.sharedBrowserIdlePauseMinutes,
      navigationAllowlistEnabled: false,
      navigationAllowlist: [] as string[],
      controlLeaseSeconds: 120
    }
  };
}

function rewriteWorldSkinAssetUrls(skin: WorldSkin, config: AppConfig): WorldSkin {
  const o = skin.overrides;
  return {
    ...skin,
    thumbnailStorageKey: worldSkinAssetUrl(config, skin.thumbnailStorageKey),
    overrides: {
      ...o,
      panoramaWall: o.panoramaWall
        ? { ...o.panoramaWall, storageKey: worldSkinAssetUrl(config, o.panoramaWall.storageKey) }
        : undefined,
      walls: Object.fromEntries(
        Object.entries(o.walls).map(([id, w]) => [
          id,
          w.textureStorageKey ? { ...w, textureStorageKey: worldSkinAssetUrl(config, w.textureStorageKey) } : w
        ])
      ),
      floor: o.floor?.textureStorageKey
        ? { ...o.floor, textureStorageKey: worldSkinAssetUrl(config, o.floor.textureStorageKey) }
        : o.floor,
      tiers: o.tiers?.textureStorageKey
        ? { ...o.tiers, textureStorageKey: worldSkinAssetUrl(config, o.tiers.textureStorageKey) }
        : o.tiers,
      domeCeiling: o.domeCeiling?.textureStorageKey
        ? {
            ...o.domeCeiling,
            textureStorageKey: worldSkinAssetUrl(config, o.domeCeiling.textureStorageKey)
          }
        : o.domeCeiling,
      sky: o.sky?.storageKey
        ? { ...o.sky, storageKey: worldSkinAssetUrl(config, o.sky.storageKey) }
        : o.sky,
      ambient: o.ambient
        ? { ...o.ambient, storageKey: worldSkinAssetUrl(config, o.ambient.storageKey) }
        : undefined,
      map2dStorageKey: o.map2dStorageKey ? worldSkinAssetUrl(config, o.map2dStorageKey) : undefined
    }
  };
}

function fileKindForWallObjectType(type: WallObjectType) {
  if (type === "image.file") return "image" as const;
  if (type === "video.file") return "video" as const;
  if (type === "audio.file") return "audio" as const;
  return undefined;
}

function wallObjectTypeForAttachmentKind(kind: WallAttachment["kind"]) {
  if (kind === "image") return "image.file" as const;
  if (kind === "video") return "video.file" as const;
  if (kind === "audio") return "audio.file" as const;
  return undefined;
}

function liveTrackSourceForWallObjectType(type: WallObjectType) {
  if (type === "camera.live") return "camera" as const;
  if (type === "microphone.live") return "microphone" as const;
  if (type === "screen.live" || type === "browser-tab.live") return "screen_share" as const;
  return undefined;
}

function isLiveWallObjectType(type: WallObjectType) {
  return Boolean(liveTrackSourceForWallObjectType(type));
}

function baseAcceptedKind(type: WallObjectType) {
  return fileKindForWallObjectType(type) ?? type.split(".")[0] ?? type;
}

function isTeacher(room: { classId: string }, membership: { role: string } | undefined, auth: AuthContext, classTeacherUserId?: string) {
  return membership?.role === "teacher" || classTeacherUserId === auth.userId || room.classId === "";
}

async function actorIsRoomTeacher(repository: Repository, roomId: string, auth: AuthContext) {
  const room = await repository.getRoom(roomId);
  if (!room) throw notFound("Room not found");
  const classRecord = await repository.getClass(room.classId);
  const membership = await repository.getMembership(room.classId, auth.userId);
  return { room, membership, teacher: membership?.role === "teacher" || classRecord?.teacherUserId === auth.userId };
}

function assertRoomObjectCustomUploadsEnabled(room: { settings: RoomSettings }) {
  if (room.settings.roomObjects?.customUploadsEnabled !== true) {
    throw forbidden("Custom room object uploads are disabled for this room");
  }
}

function roomObjectStoragePrefix(classId: string, kind: "assets" | "thumbnails") {
  return `room-objects/classes/${classId}/${kind}/`;
}

function normalizeHost(host: string) {
  return host.replace(/^www\./, "").toLowerCase();
}

function isAllowedEmbedHost(config: AppConfig, host: string) {
  const normalized = normalizeHost(host);
  return config.tuning.wallWebEmbedAllowlist.some((allowed) => {
    const allowedHost = normalizeHost(allowed);
    return normalized === allowedHost || normalized.endsWith(`.${allowedHost}`);
  });
}

function assertHttpsUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:") throw badRequest("Only https:// URLs are allowed for wall web resources");
  parsed.hash = "";
  return parsed;
}

async function buildRepository(config: AppConfig) {
  if (!config.mongoUri) {
    return new MemoryRepository();
  }

  const connection = await connectMongo(config.mongoUri, config.mongoDbName);
  return new MongoRepository(connection);
}

function assertWallObjectsEnabled(room: { settings: RoomSettings }, config: AppConfig) {
  if (!config.tuning.enableWallObjects || !room.settings.enableWallObjects) {
    throw forbidden("Wall objects are disabled for this room");
  }
}

function assertWhiteboardsEnabled(room: { type?: RoomType | string | null | undefined; settings: RoomSettings }, config: AppConfig) {
  if (!config.tuning.enableWhiteboards || !room.settings.whiteboards.enabled || !getRoomTypeFeatureFlags(room.type).whiteboards) {
    throw notFound("Whiteboards are unavailable for this room");
  }
}

function assertSharedBrowsersEnabled(room: { type?: RoomType | string | null | undefined; settings: RoomSettings }, config: AppConfig) {
  if (!config.tuning.enableSharedBrowsers || !room.settings.sharedBrowsers.enabled || !getRoomTypeFeatureFlags(room.type).sharedBrowsers) {
    throw notFound("Shared browsers are unavailable for this room");
  }
}

async function listRoomWallAnchors(
  repository: Repository,
  room: { id: string; type: RoomType },
  manifest: Awaited<ReturnType<Repository["getActiveManifest"]>>
) {
  if (!manifest) return [];
  if (room.type !== "free-for-all") return manifest.wallAnchors;
  const dynamicAnchors = await repository.listDynamicWallAnchorsForRoom(room.id);
  return [...manifest.wallAnchors, ...dynamicAnchors];
}

async function assertAnchorExists(
  repository: Repository,
  room: { id: string; type: RoomType },
  manifest: Awaited<ReturnType<Repository["getActiveManifest"]>>,
  wallAnchorId: string
) {
  const anchors = await listRoomWallAnchors(repository, room, manifest);
  if (!anchors.some((candidate) => candidate.id === wallAnchorId)) {
    throw badRequest("wallAnchorId does not exist in room manifest");
  }
}

async function assertAnchorAcceptsType(
  repository: Repository,
  room: { id: string; type: RoomType },
  manifest: Awaited<ReturnType<Repository["getActiveManifest"]>>,
  wallAnchorId: string,
  type: WallObjectType
) {
  const anchors = await listRoomWallAnchors(repository, room, manifest);
  const anchor = anchors.find((candidate) => candidate.id === wallAnchorId);
  if (!anchor) throw badRequest("wallAnchorId does not exist in room manifest");

  const accepts = Array.isArray(anchor.metadata.accepts) ? anchor.metadata.accepts.map(String) : [];
  if (accepts.length === 0 || accepts.includes(type) || accepts.includes("future")) return anchor;

  const broadKind = baseAcceptedKind(type);
  if (accepts.includes(broadKind)) return anchor;

  throw badRequest(`Wall anchor does not accept ${type}`);
}

async function assertAnchorAvailableForNewObject(repository: Repository, roomId: string, wallAnchorId: string) {
  const objects = await repository.listWallObjects(roomId, { anchorId: wallAnchorId, includeRemoved: true });
  if (anchorHasOccupyingWallObject(objects, wallAnchorId)) {
    throw conflict("This display already has wall content. Remove it before adding something else.");
  }
}

function validateAttachmentPolicy(config: AppConfig, body: { kind: WallAttachment["kind"]; contentType: string; metadata?: Record<string, unknown> }) {
  const sizeBytes = Number(body.metadata?.sizeBytes ?? 0);
  if (body.kind === "image") {
    if (!config.tuning.wallObjectAllowedImageTypes.includes(body.contentType)) throw badRequest("Image content type is not allowed");
    if (sizeBytes > config.tuning.wallObjectMaxImageBytes) throw badRequest("Image is larger than the configured wall object limit");
  }
  if (body.kind === "video") {
    if (!config.tuning.wallObjectAllowedVideoTypes.includes(body.contentType)) throw badRequest("Video content type is not allowed");
    if (sizeBytes > config.tuning.wallObjectMaxVideoBytes) throw badRequest("Video is larger than the configured wall object limit");
  }
  if (body.kind === "audio") {
    if (!config.tuning.wallObjectAllowedAudioTypes.includes(body.contentType)) throw badRequest("Audio content type is not allowed");
    if (sizeBytes > config.tuning.wallObjectMaxAudioBytes) throw badRequest("Audio is larger than the configured wall object limit");
  }
}

function isBoardAccessGrantActive(grant: ClassroomBoardAccessGrant, now = Date.now()) {
  if (grant.status !== "active") return false;
  if (!grant.expiresAt) return true;
  const expiresAt = Date.parse(grant.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function findApplicableBoardGrant(state: ClassroomState, input: { userId: string; wallAnchorId: string; type: WallObjectType }) {
  return state.boardAccessGrants.find(
    (grant) =>
      grant.userId === input.userId &&
      grant.wallAnchorId === input.wallAnchorId &&
      isBoardAccessGrantActive(grant) &&
      grant.allowedObjectTypes.includes(input.type)
  );
}

async function getApplicableBoardGrant(input: {
  repository: Repository;
  roomId: string;
  userId: string;
  wallAnchorId: string;
  type: WallObjectType;
}) {
  const state = sanitizeClassroomState(await input.repository.getClassroomState(input.roomId));
  return findApplicableBoardGrant(state, input);
}

async function assertWallObjectCreatePolicy(input: {
  repository: Repository;
  config: AppConfig;
  room: { id: string; settings: RoomSettings };
  auth: AuthContext;
  wallAnchorId: string;
  type: WallObjectType;
}) {
  const { teacher } = await actorIsRoomTeacher(input.repository, input.room.id, input.auth);
  if (teacher) return { teacher, granted: false };

  const grant = await getApplicableBoardGrant({
    repository: input.repository,
    roomId: input.room.id,
    userId: input.auth.userId,
    wallAnchorId: input.wallAnchorId,
    type: input.type
  });
  const granted = Boolean(grant);

  if (input.room.settings.wallObjectCreation === "teacher-only" && !granted) throw forbidden("Teacher role required to create wall objects");
  const isFile = Boolean(fileKindForWallObjectType(input.type));
  const isLive = isLiveWallObjectType(input.type);
  if (isFile && !input.room.settings.allowStudentUploads && !granted) throw forbidden("Student wall uploads are disabled");
  if (isLive && !input.room.settings.allowLiveStudentShares && !granted) throw forbidden("Student live wall shares are disabled");
  return { teacher, granted };
}

async function assertWallObjectManagePolicy(repository: Repository, roomId: string, auth: AuthContext, object: WallObject) {
  const { teacher } = await actorIsRoomTeacher(repository, roomId, auth);
  if (teacher) return { teacher };
  if (object.createdByUserId === auth.userId && ["draft", "pending_upload", "pending_moderation", "source_ended"].includes(object.status)) {
    return { teacher };
  }
  throw forbidden("Teacher role required to manage this wall object");
}

async function assertWhiteboardWritePolicy(input: {
  repository: Repository;
  room: { id: string; type?: RoomType | string | null | undefined; settings: RoomSettings };
  auth: AuthContext;
  wallAnchorId: string;
}) {
  const { teacher } = await actorIsRoomTeacher(input.repository, input.room.id, input.auth);
  if (teacher) return { teacher, granted: false };
  if (input.room.type !== "classroom") return { teacher: false, granted: false };
  if (!input.room.settings.whiteboards.allowStudentDraw) {
    throw forbidden("Student whiteboard drawing is disabled");
  }

  const grant = await getApplicableBoardGrant({
    repository: input.repository,
    roomId: input.room.id,
    userId: input.auth.userId,
    wallAnchorId: input.wallAnchorId,
    type: "whiteboard"
  });
  if (!grant) throw forbidden("You do not have draw access to this whiteboard");
  return { teacher: false, granted: true };
}

async function requireWhiteboardObject(repository: Repository, roomId: string, objectId: string) {
  const object = await repository.getWallObject(roomId, objectId);
  if (!object) throw notFound("Wall object not found");
  if (object.type !== "whiteboard") throw badRequest("Wall object is not a whiteboard");
  return object;
}

async function validateWallObjectSource(input: {
  repository: Repository;
  roomId: string;
  type: WallObjectType;
  source: WallObject["source"];
  requestedStatus: WallObject["status"];
}) {
  const fileKind = fileKindForWallObjectType(input.type);
  if (fileKind) {
    if (input.source.kind !== "asset") throw badRequest(`${input.type} requires an asset source`);
    const attachment = await input.repository.getAttachment(input.roomId, input.source.attachmentId);
    if (!attachment) throw badRequest("Wall object attachment source was not found");
    if (attachment.kind !== fileKind) throw badRequest("Wall object type does not match attachment kind");
    if (input.requestedStatus === "active" && attachment.status !== "ready") {
      throw conflict("Attachment must be finalized before it can become an active wall object");
    }
    return;
  }

  if (isLiveWallObjectType(input.type)) {
    if (input.source.kind !== "livekit-track") throw badRequest(`${input.type} requires a livekit-track source`);
    const expected = liveTrackSourceForWallObjectType(input.type);
    if (expected && input.source.trackSource !== expected) throw badRequest("Live wall object trackSource does not match type");
    return;
  }

  if (input.type === "web.link" || input.type === "web.embed") {
    if (input.source.kind !== "web-url") throw badRequest(`${input.type} requires a web-url source`);
    return;
  }

  if (input.type === "web.browser.shared") {
    if (input.source.kind !== "inline") throw badRequest("web.browser.shared requires an inline source");
    const startUrl = (input.source.data as { startUrl?: unknown }).startUrl;
    if (typeof startUrl !== "string" || startUrl.length === 0) {
      throw badRequest("web.browser.shared requires an inline source with a startUrl");
    }
    assertHttpsUrl(startUrl);
    return;
  }

  if (["note", "poll", "timer", "whiteboard"].includes(input.type)) {
    if (input.source.kind !== "inline") throw badRequest(`${input.type} requires an inline source`);
  }
}

function preparePollWallObjectInput(body: z.infer<typeof CreateWallObjectRequestSchema>) {
  if (body.type === "whiteboard") {
    return {
      source: { kind: "inline" as const, data: body.source.kind === "inline" ? body.source.data : {} },
      state: {
        ...(body.state ?? {}),
        ...readWhiteboardState({ state: body.state })
      }
    };
  }

  if (body.type !== "poll" || body.source.kind !== "inline") {
    return { source: body.source, state: body.state ?? {} };
  }

  const normalized = normalizePollInlineData(body.source.data);
  if (!normalized.question) throw badRequest("Poll question is required");
  if (normalized.choices.length < 2) throw badRequest("Polls require at least two choices");

  return {
    source: {
      kind: "inline" as const,
      data: {
        question: normalized.question,
        choices: normalized.choices
      }
    },
    state: {
      ...createInitialPollState(),
      ...(body.state ?? {})
    }
  };
}

async function enforceWallObjectLimits(repository: Repository, room: { id: string; settings: RoomSettings }, type: WallObjectType) {
  const active = await repository.listWallObjects(room.id, { status: "active" });
  if (active.length >= room.settings.maxActiveWallObjects) {
    throw conflict("Room has reached the active wall object limit");
  }
  if (type === "whiteboard") {
    const activeWhiteboards = active.filter((object) => object.type === "whiteboard");
    if (activeWhiteboards.length >= room.settings.whiteboards.maxActivePerRoom) {
      throw conflict("Room has reached the active whiteboard limit");
    }
  }
  if (isLiveWallObjectType(type)) {
    const activeLive = active.filter((object) => isLiveWallObjectType(object.type));
    if (activeLive.length >= room.settings.maxActiveLiveShares) {
      throw conflict("Room has reached the active live wall share limit");
    }
  }
  if (type === "web.browser.shared") {
    const activeBrowsers = active.filter((object) => object.type === "web.browser.shared");
    if (activeBrowsers.length >= room.settings.sharedBrowsers.maxActivePerRoom) {
      throw conflict("Room has reached the active shared browser limit");
    }
  }
}

type ClassroomActor = {
  userId: string;
  displayName: string;
  role: "teacher" | "student";
};

function requireTeacher(actor: ClassroomActor) {
  if (actor.role !== "teacher") throw forbidden("Teacher role required for this classroom action");
}

function assertRoomTypeSupportsClassroomState(room: { type?: RoomType | string | null | undefined }) {
  if (!getRoomTypeFeatureFlags(room.type).classroomState) {
    throw notFound("Classroom features are unavailable for this room type");
  }
}

function assertRoomObjectTemplateVisibleForRoomType(
  template: { visibleRoomTypes: RoomType[] },
  room: { type?: RoomType | string | null | undefined }
) {
  const roomType: RoomType =
    room.type === "workforce-training" ? "workforce-training" :
    room.type === "free-for-all" ? "free-for-all" :
    "classroom";
  if (!template.visibleRoomTypes.includes(roomType)) {
    throw notFound("Room object template is unavailable for this room type");
  }
}

async function assertRoomObjectTemplateResolvable(
  repository: Repository,
  auth: AuthContext,
  template: { id: string; source: string; visibleRoomTypes: RoomType[] },
  room: { type?: RoomType | string | null | undefined }
) {
  assertRoomObjectTemplateVisibleForRoomType(template, room);
  if (template.source === "ai-generated") {
    return;
  }
  const roomType: RoomType =
    room.type === "workforce-training" ? "workforce-training" :
    room.type === "free-for-all" ? "free-for-all" :
    "classroom";
  const visible = await repository.listRoomObjectTemplatesVisibleTo(auth.userId, roomType);
  if (!visible.some((entry) => entry.id === template.id)) {
    throw notFound("Room object template not found");
  }
}

async function resolveClassroomActor(input: {
  repository: Repository;
  room: { classId: string };
  membership: { role: string; displayName: string } | undefined;
  auth: AuthContext;
}): Promise<ClassroomActor> {
  const classRecord = await input.repository.getClass(input.room.classId);
  const teacher = input.membership?.role === "teacher" || classRecord?.teacherUserId === input.auth.userId;
  return {
    userId: input.auth.userId,
    displayName: input.membership?.displayName ?? input.auth.displayName,
    role: teacher ? "teacher" : "student"
  };
}

async function hydrateClassroomDisplayNames(repository: Repository, classId: string, state: ClassroomState) {
  const memberships = await repository.listMemberships(classId);
  const displayNames = new Map(memberships.map((membership) => [membership.userId, membership.displayName]));
  const resolvedDisplayName = (userId: string, current: string) => {
    const membershipDisplayName = displayNames.get(userId);
    if (!membershipDisplayName || membershipDisplayName === userId) return current;
    return membershipDisplayName;
  };
  return ClassroomStateSchema.parse({
    ...state,
    helpRequests: state.helpRequests.map((request) => ({
      ...request,
      displayName: resolvedDisplayName(request.userId, request.displayName)
    })),
    privateChecks: state.privateChecks.map((check) => ({
      ...check,
      responses: check.responses.map((response) => ({
        ...response,
        displayName: resolvedDisplayName(response.userId, response.displayName)
      }))
    }))
  });
}

function normalizeLegacyLessonRun(run: LessonRun | null | undefined) {
  if (run == null) return null;

  function stripNulls(value: unknown): unknown {
    if (value === null) return undefined;
    if (Array.isArray(value)) return value.map((entry) => stripNulls(entry));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).flatMap(([key, entry]) => {
          const normalized = stripNulls(entry);
          return normalized === undefined ? [] : [[key, normalized]];
        })
      );
    }
    return value;
  }

  const parsed = LessonRunSchema.safeParse(stripNulls(run));
  return parsed.success ? parsed.data : null;
}

function sanitizeClassroomState(state: ClassroomState): ClassroomState {
  const normalizedLessonRun = normalizeLegacyLessonRun(state.lessonRun);
  const podsRuntime = state.podsRuntime ?? DEFAULT_PODS_RUNTIME;

  return ClassroomStateSchema.parse({
    ...state,
    helpRequests: state.helpRequests.map((request) => ({
      id: request.id,
      userId: request.userId,
      displayName: request.displayName,
      ...(typeof request.note === "string" ? { note: request.note } : {}),
      kind: request.kind,
      status: request.status,
      ...(typeof request.approvedAt === "string" ? { approvedAt: request.approvedAt } : {}),
      ...(typeof request.returnedAt === "string" ? { returnedAt: request.returnedAt } : {}),
      ...(typeof request.durationSeconds === "number" ? { durationSeconds: request.durationSeconds } : {}),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      ...(typeof request.closedByUserId === "string" ? { closedByUserId: request.closedByUserId } : {})
    })),
    boardAccessGrants: state.boardAccessGrants.map((grant) => ({
      id: grant.id,
      userId: grant.userId,
      wallAnchorId: grant.wallAnchorId,
      ...(typeof grant.requestId === "string" ? { requestId: grant.requestId } : {}),
      allowedObjectTypes: grant.allowedObjectTypes,
      status: grant.status,
      ...(typeof grant.expiresAt === "string" ? { expiresAt: grant.expiresAt } : {}),
      createdByUserId: grant.createdByUserId,
      createdAt: grant.createdAt,
      updatedAt: grant.updatedAt
    })),
    privateChecks: state.privateChecks.map((check) => ({
      id: check.id,
      question: check.question,
      promptType: check.promptType,
      choices: check.choices.map((choice) => ({ id: choice.id, label: choice.label })),
      target: {
        kind: check.target.kind,
        ...(typeof check.target.groupId === "string" ? { groupId: check.target.groupId } : {}),
        userIds: check.target.userIds
      },
      status: check.status,
      visibility: check.visibility,
      responses: check.responses.map((response) => ({
        userId: response.userId,
        displayName: response.displayName,
        ...(typeof response.choiceId === "string" ? { choiceId: response.choiceId } : {}),
        ...(typeof response.answer === "string" ? { answer: response.answer } : {}),
        ...(typeof response.confidence === "number" ? { confidence: response.confidence } : {}),
        submittedAt: response.submittedAt
      })),
      ...(typeof check.wallAnchorId === "string" ? { wallAnchorId: check.wallAnchorId } : {}),
      createdByUserId: check.createdByUserId,
      createdAt: check.createdAt,
      updatedAt: check.updatedAt
    })),
    groups: state.groups.map((group) => ({
      id: group.id,
      label: group.label,
      color: group.color,
      memberUserIds: group.memberUserIds,
      ...(group.targetPosition ? { targetPosition: group.targetPosition } : {}),
      ...(typeof group.targetWallAnchorId === "string" ? { targetWallAnchorId: group.targetWallAnchorId } : {}),
      ...(group.hold
        ? {
            hold: {
              enabled: group.hold.enabled,
              mode: group.hold.mode,
              radiusMeters: group.hold.radiusMeters
            }
          }
        : {}),
      status: group.status,
      createdByUserId: group.createdByUserId,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    })),
    spotlight:
      state.spotlight && typeof state.spotlight === "object"
        ? {
            targetType: state.spotlight.targetType,
            ...(typeof state.spotlight.anchorId === "string" ? { anchorId: state.spotlight.anchorId } : {}),
            ...(typeof state.spotlight.objectId === "string" ? { objectId: state.spotlight.objectId } : {}),
            ...(typeof state.spotlight.title === "string" ? { title: state.spotlight.title } : {}),
            ...(typeof state.spotlight.instruction === "string" ? { instruction: state.spotlight.instruction } : {}),
            mode: state.spotlight.mode,
            createdByUserId: state.spotlight.createdByUserId,
            startedAt: state.spotlight.startedAt,
            ...(typeof state.spotlight.expiresAt === "string" ? { expiresAt: state.spotlight.expiresAt } : {})
          }
        : null,
    podsRuntime: {
      podsEnabled: podsRuntime.podsEnabled,
      broadcastFromUserIds: [...new Set(podsRuntime.broadcastFromUserIds.filter((userId) => typeof userId === "string" && userId.length > 0))]
    },
    lessonRun: normalizedLessonRun
  });
}

function ensurePodsRuntime(state: ClassroomState) {
  if (!state.podsRuntime) {
    state.podsRuntime = {
      podsEnabled: false,
      broadcastFromUserIds: []
    };
  }
  return state.podsRuntime;
}

function isActivePositionedGroup(group: ClassroomGroup) {
  return group.status === "active" && Boolean(group.targetPosition);
}

function hasActivePositionedGroups(state: ClassroomState) {
  return state.groups.some((group) => isActivePositionedGroup(group));
}

function findActivePositionedGroupForUser(state: ClassroomState, userId: string) {
  return state.groups.find((group) => isActivePositionedGroup(group) && group.memberUserIds.includes(userId));
}

function currentGroupIdForUser(state: ClassroomState, userId: string) {
  return state.groups.find((group) => group.status !== "archived" && group.memberUserIds.includes(userId))?.id;
}

function isCheckVisibleToStudent(state: ClassroomState, check: ClassroomPrivateCheck, userId: string) {
  if (check.target.kind === "all") return true;
  if (check.target.kind === "users") return check.target.userIds.includes(userId);
  if (check.target.kind === "group") return check.target.groupId === currentGroupIdForUser(state, userId);
  return false;
}

function filterClassroomStateForActor(state: ClassroomState, actor: ClassroomActor) {
  if (actor.role === "teacher") {
    return ClassroomStateSchema.parse(state);
  }

  const podsRuntime = state.podsRuntime ?? DEFAULT_PODS_RUNTIME;

  return ClassroomStateSchema.parse({
    ...state,
    helpRequests: state.helpRequests.filter((request) => request.userId === actor.userId),
    boardAccessGrants: state.boardAccessGrants.filter((grant) => grant.userId === actor.userId),
    privateChecks: state.privateChecks
      .filter((check) => isCheckVisibleToStudent(state, check, actor.userId))
      .map((check) => ({
        ...check,
        responses: check.responses.filter((response) => response.userId === actor.userId)
      })),
    podsRuntime: {
      podsEnabled: podsRuntime.podsEnabled,
      broadcastFromUserIds: podsRuntime.broadcastFromUserIds.includes(actor.userId) ? [actor.userId] : []
    },
    lessonRun: filterLessonRunForActor(state.lessonRun, actor)
  });
}

function findHelpRequest(state: ClassroomState, requestId: string) {
  const request = state.helpRequests.find((candidate) => candidate.id === requestId);
  if (!request) throw notFound("Help request not found");
  return request;
}

function findBoardGrant(state: ClassroomState, grantId: string) {
  const grant = state.boardAccessGrants.find((candidate) => candidate.id === grantId);
  if (!grant) throw notFound("Board access grant not found");
  return grant;
}

function findPrivateCheck(state: ClassroomState, checkId: string) {
  const check = state.privateChecks.find((candidate) => candidate.id === checkId);
  if (!check) throw notFound("Private check not found");
  return check;
}

function findGroup(state: ClassroomState, groupId: string) {
  const group = state.groups.find((candidate) => candidate.id === groupId);
  if (!group) throw notFound("Group not found");
  return group;
}

function validatePrivateCheckResponse(check: ClassroomPrivateCheck, action: Extract<ClassroomAction, { type: "submit-private-check" }>) {
  if (check.promptType === "multiple-choice") {
    if (!action.choiceId) throw badRequest("choiceId is required for multiple-choice checks");
    if (!check.choices.some((choice) => choice.id === action.choiceId)) {
      throw badRequest("choiceId does not exist on this check");
    }
    return;
  }
  if (check.promptType === "short-answer") {
    if (!action.answer?.trim()) throw badRequest("answer is required for short-answer checks");
    return;
  }
  if (check.promptType === "confidence") {
    if (typeof action.confidence !== "number") throw badRequest("confidence is required for confidence checks");
  }
}

const LESSON_ACTION_TYPES = new Set<ClassroomAction["type"]>([
  "init-lesson-run",
  "set-lesson-run-title",
  "add-lesson-step",
  "update-lesson-step",
  "move-lesson-step",
  "remove-lesson-step",
  "start-lesson-run",
  "advance-lesson-step",
  "retreat-lesson-step",
  "pause-lesson-run",
  "resume-lesson-run",
  "end-lesson-run",
  "abandon-lesson-run",
  "clear-lesson-run"
]);

function isLessonAction(action: ClassroomAction) {
  return LESSON_ACTION_TYPES.has(action.type);
}

function cloneLessonRun(run: LessonRun | null) {
  return run ? LessonRunSchema.parse(run) : null;
}

function requireLessonRun(state: ClassroomState) {
  if (!state.lessonRun) throw notFound("Lesson run not found");
  return state.lessonRun;
}

function lessonDraftStatus(run: LessonRun) {
  return run.steps.length > 0 ? "ready" : "draft";
}

function touchLessonRun(run: LessonRun, now: string) {
  run.updatedAt = now;
  if (run.status === "draft" || run.status === "ready") {
    run.status = lessonDraftStatus(run);
  }
}

function clampLessonInsertIndex(run: LessonRun, index: number | undefined) {
  if (index === undefined) return run.steps.length;
  return Math.min(Math.max(index, 0), run.steps.length);
}

function assertLessonCanEditIndex(run: LessonRun, index: number, operation: "add" | "update" | "move" | "remove") {
  if (run.status !== "running" && run.status !== "paused") return;
  if (operation === "update" && index === run.currentStepIndex) return;
  if (index <= run.currentStepIndex) {
    throw conflict("Only the current or upcoming lesson steps can be edited during a run");
  }
}

function makeLessonStep(input: LessonStepInput, now: string): LessonStep {
  return {
    id: newId("lessonstep"),
    kind: input.kind,
    title: input.title,
    notes: input.notes?.trim() || undefined,
    payload: input.payload,
    createdAt: now,
    updatedAt: now
  };
}

function currentLessonRecordIndex(run: LessonRun) {
  const currentStep = run.steps[run.currentStepIndex];
  if (!currentStep) return -1;
  for (let index = run.timeline.length - 1; index >= 0; index -= 1) {
    const record = run.timeline[index];
    if (record?.stepId === currentStep.id && !record.completedAt) return index;
  }
  return -1;
}

function lastLessonRecordForStep(run: LessonRun, stepId: string) {
  for (let index = run.timeline.length - 1; index >= 0; index -= 1) {
    const record = run.timeline[index];
    if (record?.stepId === stepId) return record;
  }
  return undefined;
}

function hasAnchor(stateManifest: Awaited<ReturnType<Repository["getActiveManifest"]>>, anchorId: string | undefined) {
  if (!anchorId) return false;
  return Boolean(stateManifest?.wallAnchors.some((anchor) => anchor.id === anchorId));
}

function hydrateGroupPlacementFromAnchor(
  manifest: Awaited<ReturnType<Repository["getActiveManifest"]>>,
  group: Pick<ClassroomGroup, "targetPosition" | "targetWallAnchorId" | "hold">
) {
  if (!manifest || !group.targetWallAnchorId) return true;
  const nextPosition = group.targetPosition ?? computeGroupTargetPositionFromAnchor(manifest, group.targetWallAnchorId);
  if (!nextPosition) return false;
  group.targetPosition = nextPosition;
  return true;
}

async function clearActiveLessonTimer(input: {
  repository: Repository;
  roomId: string;
  run: LessonRun;
  actor: ClassroomActor;
}): Promise<LessonEffectResult> {
  const activeTimer = input.run.activeTimer;
  if (!activeTimer) return {};

  input.run.activeTimer = null;
  if (activeTimer.placement !== "wall" || !activeTimer.wallObjectId) return {};

  const wallObject = await input.repository.getWallObject(input.roomId, activeTimer.wallObjectId);
  if (!wallObject || wallObject.status === "removed") {
    return { drifted: true, driftReason: "Wall timer was removed" };
  }
  if (wallObject.permissions?.lessonRunId !== input.run.id || wallObject.permissions?.lessonStepId !== activeTimer.stepId) {
    return { drifted: true, driftReason: "Wall timer ownership changed" };
  }
  await input.repository.softRemoveWallObject(input.roomId, wallObject.id, { updatedByUserId: input.actor.userId });
  return { emittedActionIds: ["remove-wall-timer"] };
}

function sameStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function spotlightForFocusStep(step: LessonStep, actor: ClassroomActor, now: string): ClassroomSpotlight {
  if (step.kind !== "focus-board" || step.payload.kind !== "focus-board") {
    throw badRequest("Lesson step is not a focus-board step");
  }
  return {
    targetType: step.payload.data.objectId ? "wall-object" : "wall-anchor",
    anchorId: step.payload.data.anchorId,
    objectId: step.payload.data.objectId,
    title: step.payload.data.title ?? step.title,
    instruction: step.payload.data.instruction,
    mode: step.payload.data.mode,
    createdByUserId: actor.userId,
    startedAt: now
  };
}

function spotlightMatchesStep(spotlight: ClassroomSpotlight | null, step: LessonStep) {
  if (!spotlight || step.kind !== "focus-board" || step.payload.kind !== "focus-board") return false;
  const expectedTargetType = step.payload.data.objectId ? "wall-object" : "wall-anchor";
  return (
    spotlight.targetType === expectedTargetType &&
    spotlight.anchorId === step.payload.data.anchorId &&
    spotlight.objectId === step.payload.data.objectId &&
    spotlight.mode === step.payload.data.mode &&
    spotlight.title === (step.payload.data.title ?? step.title) &&
    spotlight.instruction === step.payload.data.instruction
  );
}

function assignGroupMembers(state: ClassroomState, groupId: string, memberUserIds: string[], now: string) {
  const assigned = new Set(memberUserIds);
  const uniqueMembers = [...assigned];
  state.groups = state.groups.map((candidate) => ({
    ...candidate,
    memberUserIds: candidate.id === groupId ? uniqueMembers : candidate.memberUserIds.filter((userId) => !assigned.has(userId)),
    updatedAt: candidate.id === groupId ? now : candidate.updatedAt
  }));
}

function upsertCreatedLessonGroup(state: ClassroomState, input: NonNullable<Extract<LessonStep["payload"], { kind: "group-work" }>["data"]["newGroup"]>, actor: ClassroomActor, now: string, existingGroupId?: string) {
  const existing = existingGroupId ? state.groups.find((group) => group.id === existingGroupId && group.status !== "archived") : undefined;
  if (existing) {
    existing.label = input.label;
    existing.color = input.color;
    existing.targetPosition = input.targetPosition;
    existing.targetWallAnchorId = input.targetWallAnchorId;
    existing.hold = input.hold;
    existing.status = "active";
    existing.updatedAt = now;
    assignGroupMembers(state, existing.id, input.memberUserIds, now);
    return existing.id;
  }

  const group: ClassroomGroup = {
    id: newId("group"),
    label: input.label,
    color: input.color,
    memberUserIds: [],
    targetPosition: input.targetPosition,
    targetWallAnchorId: input.targetWallAnchorId,
    hold: input.hold,
    status: "active",
    createdByUserId: actor.userId,
    createdAt: now,
    updatedAt: now
  };
  state.groups.unshift(group);
  assignGroupMembers(state, group.id, input.memberUserIds, now);
  return group.id;
}

type LessonEffectResult = {
  drifted?: boolean;
  driftReason?: string;
  emittedActionIds?: string[];
  createdCheckId?: string;
  createdGroupId?: string;
  createdGrantId?: string;
  createdWallObjectId?: string;
};

async function findExitTicketBlocker(input: {
  repository: Repository;
  classId: string;
  state: ClassroomState;
  run: LessonRun;
}): Promise<{ stepId: string; missingUserIds: string[]; submittedCount: number; expectedCount: number } | null> {
  let blockerRecord: LessonRunStepRecord | undefined;
  let blockerStep: LessonStep | undefined;
  for (let i = input.run.timeline.length - 1; i >= 0; i--) {
    const record = input.run.timeline[i]!;
    const step = input.run.steps.find((s) => s.id === record.stepId);
    if (step?.kind === "exit-ticket" && step.payload.kind === "exit-ticket" && step.payload.data.requiredToEnd) {
      blockerRecord = record;
      blockerStep = step;
      break;
    }
  }
  if (!blockerRecord?.createdExitTicket || !blockerStep) return null;

  const { reflectionCheckId } = blockerRecord.createdExitTicket;
  const reflectionCheck = input.state.privateChecks.find((c) => c.id === reflectionCheckId);
  const submittedUserIds = new Set((reflectionCheck?.responses ?? []).map((r) => r.userId));

  const memberships = await input.repository.listMemberships(input.classId);
  const expectedStudents = memberships.filter((m) => m.status === "active" && m.role === "student");
  const missingUserIds = expectedStudents.map((m) => m.userId).filter((id) => !submittedUserIds.has(id));

  if (missingUserIds.length === 0) return null;

  return {
    stepId: blockerStep.id,
    missingUserIds,
    submittedCount: submittedUserIds.size,
    expectedCount: expectedStudents.length
  };
}

async function startLessonStep(input: {
  repository: Repository;
  roomId: string;
  state: ClassroomState;
  run: LessonRun;
  step: LessonStep;
  actor: ClassroomActor;
  roomSettings: RoomSettings | undefined;
  breakoutPodsEnabled: boolean;
  now: string;
}): Promise<LessonRunStepRecord> {
  const record: LessonRunStepRecord = {
    stepId: input.step.id,
    startedAt: input.now,
    drifted: false,
    emittedActionIds: []
  };
  const prior = lastLessonRecordForStep(input.run, input.step.id);

  if (input.step.kind === "instruction") {
    return record;
  }

  if (input.step.kind === "focus-board" && input.step.payload.kind === "focus-board") {
    const manifest = await input.repository.getActiveManifest(input.roomId);
    if (!hasAnchor(manifest, input.step.payload.data.anchorId)) {
      return { ...record, drifted: true, driftReason: "Missing wall anchor" };
    }
    input.state.spotlight = spotlightForFocusStep(input.step, input.actor, input.now);
    return { ...record, emittedActionIds: ["set-spotlight"] };
  }

  if (input.step.kind === "private-check" && input.step.payload.kind === "private-check") {
    const payload = input.step.payload.data;
    if (payload.promptType === "multiple-choice" && payload.choices.length < 2) {
      throw badRequest("Multiple-choice checks require at least two choices");
    }
    const existingCheck = prior?.createdCheckId ? input.state.privateChecks.find((check) => check.id === prior.createdCheckId) : undefined;
    if (existingCheck) {
      if (payload.autoCloseOnAdvance && existingCheck.status === "closed") {
        existingCheck.status = "open";
        existingCheck.updatedAt = input.now;
        record.emittedActionIds.push("reopen-private-check");
      }
      record.createdCheckId = existingCheck.id;
      return record;
    }

    const checkId = newId("check");
    input.state.privateChecks.unshift({
      id: checkId,
      question: payload.question,
      promptType: payload.promptType,
      choices: payload.choices,
      target: payload.target,
      status: "open",
      visibility: "teacher-only",
      responses: [],
      wallAnchorId: payload.wallAnchorId,
      createdByUserId: input.actor.userId,
      createdAt: input.now,
      updatedAt: input.now
    });
    return { ...record, createdCheckId: checkId, emittedActionIds: ["create-private-check", "open-private-check"] };
  }

  if (input.step.kind === "group-work" && input.step.payload.kind === "group-work") {
    const payload = input.step.payload.data;
    const manifest = await input.repository.getActiveManifest(input.roomId);
    if (payload.existingGroupId) {
      const group = input.state.groups.find((candidate) => candidate.id === payload.existingGroupId && candidate.status !== "archived");
      if (!group) return { ...record, drifted: true, driftReason: "Missing group" };
      if (!hydrateGroupPlacementFromAnchor(manifest, group)) {
        return { ...record, drifted: true, driftReason: "Missing group target board" };
      }
      group.status = "active";
      group.updatedAt = input.now;
      const emittedActionIds = ["update-group"];
      if (input.breakoutPodsEnabled && input.roomSettings?.pods.enabled === true && hasActivePositionedGroups(input.state)) {
        ensurePodsRuntime(input.state).podsEnabled = true;
        emittedActionIds.push("toggle-pods");
      }
      return { ...record, createdGroupId: group.id, emittedActionIds };
    }
    if (!payload.newGroup) return { ...record, drifted: true, driftReason: "Missing group configuration" };
    if (payload.newGroup.targetWallAnchorId && !hasAnchor(manifest, payload.newGroup.targetWallAnchorId)) {
      return { ...record, drifted: true, driftReason: "Missing group target board" };
    }
    const normalizedGroup = {
      ...payload.newGroup,
      targetPosition:
        payload.newGroup.targetPosition ??
        (manifest && payload.newGroup.targetWallAnchorId ? computeGroupTargetPositionFromAnchor(manifest, payload.newGroup.targetWallAnchorId) ?? undefined : undefined)
    };
    const groupId = upsertCreatedLessonGroup(input.state, normalizedGroup, input.actor, input.now, prior?.createdGroupId);
    const group = input.state.groups.find((candidate) => candidate.id === groupId);
    if (group) {
      group.targetPosition = normalizedGroup.targetPosition;
      group.targetWallAnchorId = normalizedGroup.targetWallAnchorId;
      group.hold = normalizedGroup.hold;
      group.updatedAt = input.now;
    }
    const emittedActionIds = prior?.createdGroupId ? ["update-group", "assign-group"] : ["create-group", "assign-group"];
    if (input.breakoutPodsEnabled && input.roomSettings?.pods.enabled === true && hasActivePositionedGroups(input.state)) {
      ensurePodsRuntime(input.state).podsEnabled = true;
      emittedActionIds.push("toggle-pods");
    }
    return { ...record, createdGroupId: groupId, emittedActionIds };
  }

  if (input.step.kind === "timer" && input.step.payload.kind === "timer") {
    const payload = input.step.payload.data;
    const activeTimer: LessonActiveTimer = {
      stepId: input.step.id,
      title: input.step.title,
      label: payload.label,
      durationSeconds: payload.durationSeconds,
      placement: payload.placement,
      ...(payload.wallAnchorId ? { wallAnchorId: payload.wallAnchorId } : {}),
      autoAdvanceOnComplete: payload.autoAdvanceOnComplete,
      startedAt: input.now
    };
    if (payload.placement === "hud") {
      const clearedTimer = await clearActiveLessonTimer(input);
      input.run.activeTimer = activeTimer;
      return {
        ...record,
        drifted: Boolean(record.drifted || clearedTimer.drifted),
        driftReason: clearedTimer.driftReason ?? record.driftReason,
        emittedActionIds: [...record.emittedActionIds, ...(clearedTimer.emittedActionIds ?? [])]
      };
    }
    const manifest = await input.repository.getActiveManifest(input.roomId);
    if (!hasAnchor(manifest, payload.wallAnchorId)) {
      return { ...record, drifted: true, driftReason: "Missing timer wall anchor" };
    }
    const clearedTimer = await clearActiveLessonTimer(input);
    const wallObject = await input.repository.createWallObject({
      roomId: input.roomId,
      wallAnchorId: payload.wallAnchorId!,
      type: "timer",
      title: payload.label || input.step.title,
      source: { kind: "inline", data: { seconds: payload.durationSeconds } },
      placement: { x: 0, y: 0, width: 1, height: 1, zIndex: Date.now() % 1000, fit: "contain" },
      state: {
        playback: {
          status: "playing",
          positionSeconds: 0,
          startedAt: input.now,
          sentAt: Date.now(),
          rate: 1,
          muted: false
        }
      },
      permissions: { lessonRunId: input.run.id, lessonStepId: input.step.id },
      moderation: {},
      status: "active",
      createdByUserId: input.actor.userId,
      updatedByUserId: input.actor.userId
    });
    input.run.activeTimer = { ...activeTimer, wallObjectId: wallObject.id };
    return {
      ...record,
      createdWallObjectId: wallObject.id,
      drifted: Boolean(record.drifted || clearedTimer.drifted),
      driftReason: clearedTimer.driftReason ?? record.driftReason,
      emittedActionIds: [...record.emittedActionIds, ...(clearedTimer.emittedActionIds ?? []), "create-wall-timer"]
    };
  }

  if (input.step.kind === "student-share" && input.step.payload.kind === "student-share") {
    const payload = input.step.payload.data;
    const manifest = await input.repository.getActiveManifest(input.roomId);
    if (!hasAnchor(manifest, payload.wallAnchorId)) {
      return { ...record, drifted: true, driftReason: "Missing share wall anchor" };
    }
    const emittedActionIds: string[] = [];
    if (input.breakoutPodsEnabled && ensurePodsRuntime(input.state).podsEnabled) {
      ensurePodsRuntime(input.state).podsEnabled = false;
      emittedActionIds.push("toggle-pods");
    }
    if (payload.acknowledgeHandIfRaised) {
      const help = input.state.helpRequests.find(
        (request) => request.userId === payload.userId && (request.status === "raised" || request.status === "acknowledged")
      );
      if (help) {
        help.status = "acknowledged";
        help.updatedAt = input.now;
        emittedActionIds.push("acknowledge-help");
      }
    }
    for (const grant of input.state.boardAccessGrants) {
      if (grant.userId !== payload.userId) continue;
      if (!isBoardAccessGrantActive(grant, Date.parse(input.now))) continue;
      grant.status = "revoked";
      grant.updatedAt = input.now;
    }
    const grantId = newId("grant");
    input.state.boardAccessGrants.unshift({
      id: grantId,
      userId: payload.userId,
      wallAnchorId: payload.wallAnchorId,
      allowedObjectTypes: payload.allowedObjectTypes,
      status: "active",
      expiresAt: payload.expiresAt,
      createdByUserId: input.actor.userId,
      createdAt: input.now,
      updatedAt: input.now
    });
    emittedActionIds.push("grant-board-access");
    return { ...record, createdGrantId: grantId, emittedActionIds };
  }

  if (input.step.kind === "exit-ticket" && input.step.payload.kind === "exit-ticket") {
    const payload = input.step.payload.data;

    if (prior?.createdExitTicket) {
      const { reflectionCheckId, confidenceCheckId, whatsNextCheckId } = prior.createdExitTicket;
      const checkIds = [reflectionCheckId, confidenceCheckId, whatsNextCheckId].filter((id): id is string => Boolean(id));
      let reopened = false;
      for (const checkId of checkIds) {
        const check = input.state.privateChecks.find((c) => c.id === checkId);
        if (check && check.status === "closed") {
          check.status = "open";
          check.updatedAt = input.now;
          reopened = true;
        }
      }
      record.createdCheckId = reflectionCheckId;
      record.createdExitTicket = prior.createdExitTicket;
      if (reopened) record.emittedActionIds.push("reopen-private-check");
      return record;
    }

    const reflectionCheckId = newId("check");
    input.state.privateChecks.unshift({
      id: reflectionCheckId,
      question: payload.reflectionPrompt,
      promptType: "short-answer",
      choices: [],
      target: { kind: "all", userIds: [] },
      status: "open",
      visibility: "teacher-only",
      responses: [],
      wallAnchorId: payload.wallAnchorId,
      createdByUserId: input.actor.userId,
      createdAt: input.now,
      updatedAt: input.now
    });

    let confidenceCheckId: string | undefined;
    if (payload.includeConfidence) {
      confidenceCheckId = newId("check");
      input.state.privateChecks.unshift({
        id: confidenceCheckId,
        question: "How confident do you feel about today's material?",
        promptType: "confidence",
        choices: [],
        target: { kind: "all", userIds: [] },
        status: "open",
        visibility: "teacher-only",
        responses: [],
        createdByUserId: input.actor.userId,
        createdAt: input.now,
        updatedAt: input.now
      });
    }

    let whatsNextCheckId: string | undefined;
    if (payload.whatsNext) {
      whatsNextCheckId = newId("check");
      input.state.privateChecks.unshift({
        id: whatsNextCheckId,
        question: payload.whatsNext.question,
        promptType: "multiple-choice",
        choices: payload.whatsNext.choices,
        target: { kind: "all", userIds: [] },
        status: "open",
        visibility: "teacher-only",
        responses: [],
        createdByUserId: input.actor.userId,
        createdAt: input.now,
        updatedAt: input.now
      });
    }

    const createdExitTicket = { reflectionCheckId, confidenceCheckId, whatsNextCheckId };
    return {
      ...record,
      createdCheckId: reflectionCheckId,
      createdExitTicket,
      emittedActionIds: ["create-private-check", "open-private-check"]
    };
  }

  return record;
}

async function cleanupLessonStep(input: {
  repository: Repository;
  roomId: string;
  state: ClassroomState;
  run: LessonRun;
  step: LessonStep;
  record: LessonRunStepRecord;
  actor: ClassroomActor;
  roomSettings: RoomSettings | undefined;
  breakoutPodsEnabled: boolean;
  now: string;
}): Promise<LessonEffectResult> {
  if (input.step.kind === "focus-board") {
    if (!spotlightMatchesStep(input.state.spotlight, input.step)) {
      return { drifted: true, driftReason: "Spotlight changed before cleanup" };
    }
    input.state.spotlight = null;
    return { emittedActionIds: ["clear-spotlight"] };
  }

  if (input.step.kind === "private-check" && input.step.payload.kind === "private-check") {
    if (!input.step.payload.data.autoCloseOnAdvance) return {};
    if (!input.record.createdCheckId) return { drifted: true, driftReason: "Missing private check id" };
    const check = input.state.privateChecks.find((candidate) => candidate.id === input.record.createdCheckId);
    if (!check) return { drifted: true, driftReason: "Private check was removed" };
    if (check.status === "open") {
      check.status = "closed";
      check.updatedAt = input.now;
      return { emittedActionIds: ["close-private-check"] };
    }
    return {};
  }

  if (input.step.kind === "group-work" && input.step.payload.kind === "group-work") {
    if (!input.step.payload.data.releaseOnAdvance) return {};
    if (!input.record.createdGroupId) return { drifted: true, driftReason: "Missing group id" };
    const group = input.state.groups.find((candidate) => candidate.id === input.record.createdGroupId);
    if (!group) return { drifted: true, driftReason: "Group was removed" };
    let drifted = false;
    let driftReason: string | undefined;
    if (group.status !== "active") {
      drifted = true;
      driftReason = "Group was already released";
    }
    if (input.step.payload.data.newGroup && !sameStringArray(group.memberUserIds, input.step.payload.data.newGroup.memberUserIds)) {
      drifted = true;
      driftReason = "Group membership changed before cleanup";
    }
    group.status = "released";
    group.updatedAt = input.now;
    return { emittedActionIds: ["release-group"], drifted, ...(driftReason ? { driftReason } : {}) };
  }

  if (input.step.kind === "timer" && input.step.payload.kind === "timer") {
    return {};
  }

  if (input.step.kind === "student-share" && input.step.payload.kind === "student-share") {
    const emittedActionIds: string[] = [];
    let drifted = false;
    let driftReason: string | undefined;

    if (input.step.payload.data.revokeOnAdvance) {
      if (!input.record.createdGrantId) {
        drifted = true;
        driftReason = "Missing grant id";
      } else {
        const grant = input.state.boardAccessGrants.find((candidate) => candidate.id === input.record.createdGrantId);
        if (grant?.status === "active") {
          grant.status = "revoked";
          grant.updatedAt = input.now;
          emittedActionIds.push("revoke-board-access");
        }
      }
    }

    if (input.breakoutPodsEnabled && input.record.emittedActionIds.includes("toggle-pods") && !ensurePodsRuntime(input.state).podsEnabled) {
      ensurePodsRuntime(input.state).podsEnabled = true;
      emittedActionIds.push("toggle-pods");
    }

    return emittedActionIds.length > 0 || drifted
      ? {
          emittedActionIds,
          ...(drifted ? { drifted: true } : {}),
          ...(driftReason ? { driftReason } : {})
        }
      : {};
  }

  if (input.step.kind === "exit-ticket" && input.step.payload.kind === "exit-ticket") {
    if (!input.step.payload.data.autoCloseOnAdvance) return {};
    if (!input.record.createdExitTicket) return { drifted: true, driftReason: "Missing exit ticket check ids" };
    const { reflectionCheckId, confidenceCheckId, whatsNextCheckId } = input.record.createdExitTicket;
    const checkIds = [reflectionCheckId, confidenceCheckId, whatsNextCheckId].filter((id): id is string => Boolean(id));
    const emittedActionIds: string[] = [];
    for (const checkId of checkIds) {
      const check = input.state.privateChecks.find((c) => c.id === checkId);
      if (check && check.status === "open") {
        check.status = "closed";
        check.updatedAt = input.now;
        emittedActionIds.push("close-private-check");
      }
    }
    return { emittedActionIds };
  }

  return {};
}

async function completeCurrentLessonStep(input: {
  repository: Repository;
  roomId: string;
  state: ClassroomState;
  run: LessonRun;
  actor: ClassroomActor;
  roomSettings: RoomSettings | undefined;
  breakoutPodsEnabled: boolean;
  now: string;
}) {
  const step = input.run.steps[input.run.currentStepIndex];
  if (!step) return;
  let recordIndex = currentLessonRecordIndex(input.run);
  if (recordIndex < 0) {
    input.run.timeline.push({ stepId: step.id, startedAt: input.now, drifted: false, emittedActionIds: [] });
    recordIndex = input.run.timeline.length - 1;
  }
  const record = input.run.timeline[recordIndex]!;
  const cleanup = await cleanupLessonStep({ ...input, step, record });
  input.run.timeline[recordIndex] = {
    ...record,
    completedAt: input.now,
    drifted: Boolean(record.drifted || cleanup.drifted),
    driftReason: cleanup.driftReason ?? record.driftReason,
    emittedActionIds: [...record.emittedActionIds, ...(cleanup.emittedActionIds ?? [])]
  };
}

function filterLessonRunForActor(run: LessonRun | null, actor: ClassroomActor): LessonRun | null {
  if (!run) return null;
  if (actor.role === "teacher") return LessonRunSchema.parse(run);
  const currentStep = run.steps[run.currentStepIndex];
  const steps = run.steps.map((step, index) => {
    if (currentStep && index === run.currentStepIndex) {
      const { notes: _notes, ...visibleStep } = step;
      return visibleStep;
    }
    return {
      id: step.id,
      kind: "instruction" as const,
      title: "Hidden step",
      payload: { kind: "instruction" as const, data: { body: "" } },
      createdAt: step.createdAt,
      updatedAt: step.updatedAt
    };
  });
  return LessonRunSchema.parse({
    id: run.id,
    title: run.title,
    status: run.status,
    steps,
    currentStepIndex: run.currentStepIndex,
    timeline: [],
    activeTimer: run.activeTimer,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    createdByUserId: run.createdByUserId,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  });
}

function buildLessonRecap(input: {
  memberships: ClassMembership[];
  room: { id: string; classId: string };
  state: ClassroomState;
  run: LessonRun;
}): LessonRecap {
  const activeStudents = input.memberships.filter((m) => m.status === "active" && m.role === "student");

  const lessonCheckIds = new Set<string>();
  for (const record of input.run.timeline) {
    if (record.createdCheckId) lessonCheckIds.add(record.createdCheckId);
    if (record.createdExitTicket) {
      lessonCheckIds.add(record.createdExitTicket.reflectionCheckId);
      if (record.createdExitTicket.confidenceCheckId) lessonCheckIds.add(record.createdExitTicket.confidenceCheckId);
      if (record.createdExitTicket.whatsNextCheckId) lessonCheckIds.add(record.createdExitTicket.whatsNextCheckId);
    }
  }

  const lessonChecks = input.state.privateChecks.filter((c) => lessonCheckIds.has(c.id));

  const privateChecks = lessonChecks.map((check) => {
    const choiceCounts: Record<string, number> = {};
    let confidenceSum = 0;
    let confidenceCount = 0;
    for (const response of check.responses) {
      if (response.choiceId) {
        choiceCounts[response.choiceId] = (choiceCounts[response.choiceId] ?? 0) + 1;
      }
      if (response.confidence != null) {
        confidenceSum += response.confidence;
        confidenceCount++;
      }
    }
    return {
      checkId: check.id,
      question: check.question,
      promptType: check.promptType,
      responseCount: check.responses.length,
      ...(Object.keys(choiceCounts).length > 0 ? { choiceCounts } : {}),
      ...(confidenceCount > 0 ? { confidenceAverage: confidenceSum / confidenceCount } : {})
    };
  });

  const steps = input.run.timeline.map((record) => {
    const step = input.run.steps.find((s) => s.id === record.stepId);
    return {
      stepId: record.stepId,
      kind: (step?.kind ?? "instruction") as LessonRecap["steps"][number]["kind"],
      title: step?.title ?? "Unknown step",
      drifted: record.drifted,
      ...(record.driftReason ? { driftReason: record.driftReason } : {})
    };
  });

  let exitTicket: LessonRecap["exitTicket"];
  for (let i = input.run.timeline.length - 1; i >= 0; i--) {
    const record = input.run.timeline[i]!;
    if (!record.createdExitTicket) continue;
    const step = input.run.steps.find((s) => s.id === record.stepId);
    if (!step || step.kind !== "exit-ticket") continue;

    const { reflectionCheckId, confidenceCheckId, whatsNextCheckId } = record.createdExitTicket;
    const reflectionCheck = input.state.privateChecks.find((c) => c.id === reflectionCheckId);
    const confidenceCheck = confidenceCheckId ? input.state.privateChecks.find((c) => c.id === confidenceCheckId) : undefined;
    const whatsNextCheck = whatsNextCheckId ? input.state.privateChecks.find((c) => c.id === whatsNextCheckId) : undefined;

    const confidenceByUser = new Map<string, number>();
    let confidenceSum = 0;
    for (const r of confidenceCheck?.responses ?? []) {
      if (r.confidence != null) {
        confidenceByUser.set(r.userId, r.confidence);
        confidenceSum += r.confidence;
      }
    }
    const whatsNextByUser = new Map<string, string>();
    for (const r of whatsNextCheck?.responses ?? []) {
      if (r.choiceId) whatsNextByUser.set(r.userId, r.choiceId);
    }

    const reflections = (reflectionCheck?.responses ?? []).map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      answer: r.answer ?? "",
      ...(confidenceByUser.has(r.userId) ? { confidence: confidenceByUser.get(r.userId) } : {}),
      ...(whatsNextByUser.has(r.userId) ? { whatsNextChoiceId: whatsNextByUser.get(r.userId) } : {}),
      submittedAt: r.submittedAt
    }));

    const confidenceAverage = confidenceByUser.size > 0 ? confidenceSum / confidenceByUser.size : undefined;
    exitTicket = {
      stepId: record.stepId,
      submittedCount: reflectionCheck?.responses.length ?? 0,
      expectedCount: activeStudents.length,
      ...(confidenceAverage != null ? { confidenceAverage } : {}),
      ...(whatsNextCheck && whatsNextCheck.choices.length > 0 ? { whatsNextChoices: whatsNextCheck.choices } : {}),
      reflections
    };
    break;
  }

  return {
    lessonRunId: input.run.id,
    roomId: input.room.id,
    title: input.run.title,
    ...(input.run.startedAt ? { startedAt: input.run.startedAt } : {}),
    ...(input.run.endedAt ? { endedAt: input.run.endedAt } : {}),
    attendance: {
      knownParticipantIds: activeStudents.map((m) => m.userId),
      total: activeStudents.length
    },
    steps,
    privateChecks,
    ...(exitTicket ? { exitTicket } : {})
  };
}

function csvField(value: string | number | undefined | null): string {
  if (value == null) return '""';
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function renderRecapCsv(recap: LessonRecap, displayNameById: Map<string, string>): string {
  const header = "userId,displayName,reflection,confidence,whatsNextChoiceId,submittedAt";
  if (!recap.exitTicket) return header + "\n";

  const whatsNextLabelById = new Map(
    (recap.exitTicket.whatsNextChoices ?? []).map((choice) => [choice.id, choice.label])
  );
  const reflectionMap = new Map(recap.exitTicket.reflections.map((r) => [r.userId, r]));
  const rows = recap.attendance.knownParticipantIds.map((userId) => {
    const r = reflectionMap.get(userId);
    if (!r) {
      return [csvField(userId), csvField(displayNameById.get(userId) ?? ""), csvField(""), csvField(""), csvField(""), csvField("")].join(",");
    }
    const whatsNextValue = r.whatsNextChoiceId
      ? whatsNextLabelById.get(r.whatsNextChoiceId) ?? r.whatsNextChoiceId
      : undefined;
    return [
      csvField(r.userId),
      csvField(r.displayName),
      csvField(r.answer),
      csvField(r.confidence),
      csvField(whatsNextValue),
      csvField(r.submittedAt)
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

async function runClassroomAction(input: {
  repository: Repository;
  roomId: string;
  classId: string;
  actor: ClassroomActor;
  action: ClassroomAction;
  lessonsEnabled: boolean;
  breakoutPodsEnabled: boolean;
  studentMediaPermissionsEnabled: boolean;
  roomSettings?: RoomSettings;
}) {
  if (isLessonAction(input.action) && !input.lessonsEnabled) {
    throw notFound("Classroom lessons are disabled");
  }
  if ((input.action.type === "toggle-pods" || input.action.type === "set-student-broadcast") && !input.breakoutPodsEnabled) {
    throw notFound("Breakout pods are disabled");
  }
  if ((input.action.type === "set-student-media-global" || input.action.type === "set-student-media-access") && !input.studentMediaPermissionsEnabled) {
    throw forbidden("Student media permissions are not enabled");
  }

  const current = sanitizeClassroomState(await input.repository.getClassroomState(input.roomId));
  const state: ClassroomState = {
    ...current,
    helpRequests: [...current.helpRequests],
    boardAccessGrants: [...current.boardAccessGrants],
    privateChecks: current.privateChecks.map((check) => ({ ...check, choices: [...check.choices], responses: [...check.responses], target: { ...check.target } })),
    groups: current.groups.map((group) => ({ ...group, memberUserIds: [...group.memberUserIds], hold: group.hold ? { ...group.hold } : undefined })),
    spotlight: current.spotlight ? { ...current.spotlight } : null,
    podsRuntime: current.podsRuntime
      ? { ...current.podsRuntime, broadcastFromUserIds: [...current.podsRuntime.broadcastFromUserIds] }
      : { podsEnabled: false, broadcastFromUserIds: [] },
    whisper: current.whisper ? { ...current.whisper } : undefined,
    studentMediaRuntime: current.studentMediaRuntime
      ? {
          ...current.studentMediaRuntime,
          cameraEnabledUserIds: [...current.studentMediaRuntime.cameraEnabledUserIds],
          microphoneEnabledUserIds: [...current.studentMediaRuntime.microphoneEnabledUserIds]
        }
      : undefined,
    lessonRun: cloneLessonRun(current.lessonRun)
  };

  // Seed runtime from room settings on first use (existing rooms have no stored runtime).
  if (input.studentMediaPermissionsEnabled && !state.studentMediaRuntime) {
    const sm = input.roomSettings?.studentMedia ?? { camerasEnabled: true, microphonesEnabled: true };
    state.studentMediaRuntime = {
      camerasEnabled: sm.camerasEnabled,
      microphonesEnabled: sm.microphonesEnabled,
      cameraEnabledUserIds: [],
      microphoneEnabledUserIds: []
    };
  }

  const now = new Date().toISOString();

  switch (input.action.type) {
    case "raise-hand": {
      const existing = state.helpRequests.find(
        (request) => request.userId === input.actor.userId && ["raised", "acknowledged"].includes(request.status)
      );
      if (existing) {
        existing.status = "raised";
        existing.displayName = input.actor.displayName;
        existing.note = input.action.note?.trim() || undefined;
        existing.updatedAt = now;
        delete existing.closedByUserId;
        break;
      }
      state.helpRequests.unshift({
        id: newId("help"),
        userId: input.actor.userId,
        displayName: input.actor.displayName,
        note: input.action.note?.trim() || undefined,
        kind: "help",
        status: "raised",
        createdAt: now,
        updatedAt: now
      });
      break;
    }
    case "cancel-help": {
      const request =
        input.action.requestId
          ? findHelpRequest(state, input.action.requestId)
          : state.helpRequests.find((candidate) => candidate.userId === input.actor.userId && ["raised", "acknowledged"].includes(candidate.status));
      if (!request) throw notFound("Active help request not found");
      if (request.userId !== input.actor.userId && input.actor.role !== "teacher") {
        throw forbidden("You can only cancel your own help request");
      }
      request.status = "cancelled";
      request.closedByUserId = input.actor.userId;
      request.updatedAt = now;
      break;
    }
    case "acknowledge-help": {
      requireTeacher(input.actor);
      const request = findHelpRequest(state, input.action.requestId);
      request.status = "acknowledged";
      request.updatedAt = now;
      break;
    }
    case "close-help": {
      requireTeacher(input.actor);
      const request = findHelpRequest(state, input.action.requestId);
      request.status = "closed";
      request.closedByUserId = input.actor.userId;
      request.updatedAt = now;
      break;
    }
    case "grant-board-access": {
      requireTeacher(input.actor);
      for (const grant of state.boardAccessGrants) {
        if (grant.userId !== input.action.userId) continue;
        if (!isBoardAccessGrantActive(grant, Date.parse(now))) continue;
        grant.status = "revoked";
        grant.updatedAt = now;
      }
      state.boardAccessGrants.unshift({
        id: newId("grant"),
        userId: input.action.userId,
        wallAnchorId: input.action.wallAnchorId,
        requestId: input.action.requestId,
        allowedObjectTypes: input.action.allowedObjectTypes,
        status: "active",
        expiresAt: input.action.expiresAt,
        createdByUserId: input.actor.userId,
        createdAt: now,
        updatedAt: now
      });
      break;
    }
    case "revoke-board-access": {
      requireTeacher(input.actor);
      const grant = findBoardGrant(state, input.action.grantId);
      grant.status = "revoked";
      grant.updatedAt = now;
      break;
    }
    case "create-private-check": {
      requireTeacher(input.actor);
      if (input.action.promptType === "multiple-choice" && input.action.choices.length < 2) {
        throw badRequest("Multiple-choice checks require at least two choices");
      }
      state.privateChecks.unshift({
        id: newId("check"),
        question: input.action.question,
        promptType: input.action.promptType,
        choices: input.action.choices,
        target: input.action.target,
        status: "draft",
        visibility: input.action.visibility,
        responses: [],
        wallAnchorId: input.action.wallAnchorId,
        createdByUserId: input.actor.userId,
        createdAt: now,
        updatedAt: now
      });
      break;
    }
    case "open-private-check":
    case "close-private-check":
    case "reopen-private-check": {
      requireTeacher(input.actor);
      const check = findPrivateCheck(state, input.action.checkId);
      check.status = input.action.type === "open-private-check" ? "open" : input.action.type === "close-private-check" ? "closed" : "open";
      check.updatedAt = now;
      break;
    }
    case "submit-private-check": {
      const check = findPrivateCheck(state, input.action.checkId);
      if (!isCheckVisibleToStudent(state, check, input.actor.userId) && input.actor.role !== "teacher") {
        throw forbidden("This private check is not assigned to you");
      }
      if (check.status !== "open") throw conflict("Private check is not open for responses");
      validatePrivateCheckResponse(check, input.action);
      const response = {
        userId: input.actor.userId,
        displayName: input.actor.displayName,
        choiceId: input.action.choiceId,
        answer: input.action.answer?.trim() || undefined,
        confidence: input.action.confidence,
        submittedAt: now
      };
      const existingIndex = check.responses.findIndex((candidate) => candidate.userId === input.actor.userId);
      if (existingIndex >= 0) {
        check.responses[existingIndex] = response;
      } else {
        check.responses.push(response);
      }
      check.updatedAt = now;
      break;
    }
    case "create-group": {
      requireTeacher(input.actor);
      const assigned = new Set(input.action.memberUserIds);
      state.groups = state.groups.map((group) =>
        assigned.size === 0
          ? group
          : { ...group, memberUserIds: group.memberUserIds.filter((userId) => !assigned.has(userId)) }
      );
      state.groups.unshift({
        id: newId("group"),
        label: input.action.label,
        color: input.action.color,
        memberUserIds: [...new Set(input.action.memberUserIds)],
        targetPosition: input.action.targetPosition,
        targetWallAnchorId: input.action.targetWallAnchorId,
        hold: input.action.hold,
        status: input.action.status,
        createdByUserId: input.actor.userId,
        createdAt: now,
        updatedAt: now
      });
      break;
    }
    case "update-group": {
      requireTeacher(input.actor);
      const group = findGroup(state, input.action.groupId);
      if (input.action.label !== undefined) group.label = input.action.label;
      if (input.action.color !== undefined) group.color = input.action.color;
      if (input.action.targetPosition !== undefined) group.targetPosition = input.action.targetPosition ?? undefined;
      if (input.action.targetWallAnchorId !== undefined) group.targetWallAnchorId = input.action.targetWallAnchorId;
      if (input.action.hold !== undefined) group.hold = input.action.hold;
      if (input.action.status !== undefined) group.status = input.action.status;
      group.updatedAt = now;
      break;
    }
    case "assign-group": {
      requireTeacher(input.actor);
      const group = findGroup(state, input.action.groupId);
      const assigned = new Set(input.action.memberUserIds);
      const memberUserIds = [...new Set(input.action.memberUserIds)];
      state.groups = state.groups.map((candidate) => ({
        ...candidate,
        memberUserIds: candidate.id === group.id ? memberUserIds : candidate.memberUserIds.filter((userId) => !assigned.has(userId))
      }));
      const updated = state.groups.find((candidate) => candidate.id === group.id);
      if (updated) updated.updatedAt = now;
      break;
    }
    case "release-group": {
      requireTeacher(input.actor);
      const group = findGroup(state, input.action.groupId);
      group.status = "released";
      group.updatedAt = now;
      break;
    }
    case "toggle-pods": {
      requireTeacher(input.actor);
      if (input.action.enabled && !hasActivePositionedGroups(state)) {
        throw unprocessableEntity("Pod audio requires at least one active group with a target position");
      }
      ensurePodsRuntime(state).podsEnabled = input.action.enabled;
      break;
    }
    case "set-student-broadcast": {
      requireTeacher(input.actor);
      const podsRuntime = ensurePodsRuntime(state);
      if (input.action.enabled && !findActivePositionedGroupForUser(state, input.action.userId)) {
        throw unprocessableEntity("Student must belong to an active positioned group to broadcast");
      }
      const nextBroadcastIds = new Set(podsRuntime.broadcastFromUserIds);
      if (input.action.enabled) nextBroadcastIds.add(input.action.userId);
      else nextBroadcastIds.delete(input.action.userId);
      podsRuntime.broadcastFromUserIds = [...nextBroadcastIds];
      break;
    }
    case "set-spotlight": {
      requireTeacher(input.actor);
      if (input.action.targetType === "wall-anchor" && !input.action.anchorId) {
        throw badRequest("anchorId is required for wall-anchor spotlight targets");
      }
      if (input.action.targetType === "wall-object" && !input.action.objectId) {
        throw badRequest("objectId is required for wall-object spotlight targets");
      }
      state.spotlight = {
        targetType: input.action.targetType,
        anchorId: input.action.anchorId,
        objectId: input.action.objectId,
        title: input.action.title,
        instruction: input.action.instruction,
        mode: input.action.mode,
        createdByUserId: input.actor.userId,
        startedAt: now,
        expiresAt: input.action.expiresAt
      };
      break;
    }
    case "clear-spotlight": {
      requireTeacher(input.actor);
      state.spotlight = null;
      break;
    }
    case "init-lesson-run": {
      requireTeacher(input.actor);
      state.lessonRun = {
        id: newId("lessonrun"),
        title: input.action.title?.trim() || "Untitled lesson",
        status: "draft",
        steps: [],
        currentStepIndex: -1,
        timeline: [],
        activeTimer: null,
        createdByUserId: input.actor.userId,
        createdAt: now,
        updatedAt: now
      };
      break;
    }
    case "set-lesson-run-title": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      run.title = input.action.title.trim();
      touchLessonRun(run, now);
      break;
    }
    case "add-lesson-step": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      const index = clampLessonInsertIndex(run, input.action.index);
      assertLessonCanEditIndex(run, index, "add");
      run.steps.splice(index, 0, makeLessonStep(input.action.step, now));
      if (run.currentStepIndex >= index) run.currentStepIndex += 1;
      touchLessonRun(run, now);
      break;
    }
    case "update-lesson-step": {
      requireTeacher(input.actor);
      const action = input.action as Extract<ClassroomAction, { type: "update-lesson-step" }>;
      const run = requireLessonRun(state);
      const index = run.steps.findIndex((step) => step.id === action.stepId);
      if (index < 0) throw notFound("Lesson step not found");
      assertLessonCanEditIndex(run, index, "update");
      const existing = run.steps[index]!;
      const payload = action.payload ?? existing.payload;
      const nextKind = payload.kind;
      run.steps[index] = {
        ...existing,
        kind: nextKind,
        title: action.title ?? existing.title,
        notes: action.notes?.trim() || (action.notes === "" ? undefined : existing.notes),
        payload,
        updatedAt: now
      };
      touchLessonRun(run, now);
      break;
    }
    case "move-lesson-step": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (input.action.from >= run.steps.length || input.action.to >= run.steps.length) throw badRequest("Lesson step index is out of range");
      assertLessonCanEditIndex(run, input.action.from, "move");
      assertLessonCanEditIndex(run, input.action.to, "move");
      const [step] = run.steps.splice(input.action.from, 1);
      if (step) run.steps.splice(input.action.to, 0, { ...step, updatedAt: now });
      touchLessonRun(run, now);
      break;
    }
    case "remove-lesson-step": {
      requireTeacher(input.actor);
      const action = input.action as Extract<ClassroomAction, { type: "remove-lesson-step" }>;
      const run = requireLessonRun(state);
      const index = run.steps.findIndex((step) => step.id === action.stepId);
      if (index < 0) throw notFound("Lesson step not found");
      assertLessonCanEditIndex(run, index, "remove");
      run.steps.splice(index, 1);
      if (run.currentStepIndex > index) run.currentStepIndex -= 1;
      touchLessonRun(run, now);
      break;
    }
    case "start-lesson-run": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (run.status === "running") return current;
      if (run.status !== "draft" && run.status !== "ready") throw conflict("Lesson run cannot be started from its current status");
      if (run.steps.length === 0) throw badRequest("Add at least one step before starting a lesson run");
      run.status = "running";
      run.currentStepIndex = 0;
      run.startedAt = now;
      delete run.endedAt;
      run.updatedAt = now;
      run.timeline.push(
        await startLessonStep({
          repository: input.repository,
          roomId: input.roomId,
          state,
          run,
          step: run.steps[0]!,
          actor: input.actor,
          roomSettings: input.roomSettings,
          breakoutPodsEnabled: input.breakoutPodsEnabled,
          now
        })
      );
      break;
    }
    case "advance-lesson-step": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (run.status !== "running") throw conflict("Lesson run is not running");
      if (run.currentStepIndex < 0) throw conflict("Lesson run has no current step");
      await completeCurrentLessonStep({
        repository: input.repository,
        roomId: input.roomId,
        state,
        run,
        actor: input.actor,
        roomSettings: input.roomSettings,
        breakoutPodsEnabled: input.breakoutPodsEnabled,
        now
      });
      if (run.currentStepIndex >= run.steps.length - 1) {
        await clearActiveLessonTimer({ repository: input.repository, roomId: input.roomId, run, actor: input.actor });
        run.status = "ended";
        run.endedAt = now;
        run.updatedAt = now;
        break;
      }
      run.currentStepIndex += 1;
      run.updatedAt = now;
      run.timeline.push(
        await startLessonStep({
          repository: input.repository,
          roomId: input.roomId,
          state,
          run,
          step: run.steps[run.currentStepIndex]!,
          actor: input.actor,
          roomSettings: input.roomSettings,
          breakoutPodsEnabled: input.breakoutPodsEnabled,
          now
        })
      );
      break;
    }
    case "retreat-lesson-step": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (run.status !== "running" && run.status !== "paused") throw conflict("Lesson run is not active");
      if (run.currentStepIndex <= 0) throw conflict("Already at the first lesson step");
      await completeCurrentLessonStep({
        repository: input.repository,
        roomId: input.roomId,
        state,
        run,
        actor: input.actor,
        roomSettings: input.roomSettings,
        breakoutPodsEnabled: input.breakoutPodsEnabled,
        now
      });
      run.currentStepIndex -= 1;
      run.status = "running";
      run.updatedAt = now;
      run.timeline.push(
        await startLessonStep({
          repository: input.repository,
          roomId: input.roomId,
          state,
          run,
          step: run.steps[run.currentStepIndex]!,
          actor: input.actor,
          roomSettings: input.roomSettings,
          breakoutPodsEnabled: input.breakoutPodsEnabled,
          now
        })
      );
      break;
    }
    case "pause-lesson-run": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (run.status !== "running") throw conflict("Lesson run is not running");
      run.status = "paused";
      run.updatedAt = now;
      break;
    }
    case "resume-lesson-run": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (run.status !== "paused") throw conflict("Lesson run is not paused");
      run.status = "running";
      run.updatedAt = now;
      break;
    }
    case "end-lesson-run":
    case "abandon-lesson-run": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (input.action.type === "end-lesson-run" && !input.action.force) {
        const blocker = await findExitTicketBlocker({ repository: input.repository, classId: input.classId, state, run });
        if (blocker) throw exitTicketIncomplete(blocker);
      }
      if (run.status === "running" || run.status === "paused") {
        await completeCurrentLessonStep({
          repository: input.repository,
          roomId: input.roomId,
          state,
          run,
          actor: input.actor,
          roomSettings: input.roomSettings,
          breakoutPodsEnabled: input.breakoutPodsEnabled,
          now
        });
      }
      await clearActiveLessonTimer({ repository: input.repository, roomId: input.roomId, run, actor: input.actor });
      run.status = input.action.type === "end-lesson-run" ? "ended" : "abandoned";
      run.endedAt = now;
      run.updatedAt = now;
      break;
    }
    case "clear-lesson-run": {
      requireTeacher(input.actor);
      if (state.lessonRun) {
        await clearActiveLessonTimer({ repository: input.repository, roomId: input.roomId, run: state.lessonRun, actor: input.actor });
      }
      state.lessonRun = null;
      break;
    }
    case "set-avatar-editor-locked": {
      requireTeacher(input.actor);
      state.avatarEditorLocked = input.action.locked;
      break;
    }
    case "set-reactions-locked": {
      requireTeacher(input.actor);
      state.reactionsLocked = input.action.locked;
      break;
    }
    case "request-hallpass": {
      const hp = input.roomSettings?.hallpass;
      if (hp && !hp.enabled) throw badRequest("Hall pass is disabled for this room");
      const active = state.helpRequests.find(
        (r) => r.userId === input.actor.userId && r.kind === "hallpass" && ["raised", "acknowledged"].includes(r.status)
      );
      if (active) throw badRequest("You already have an active hall pass request");
      if (hp && hp.perPeriodLimit > 0) {
        const todayPrefix = now.slice(0, 10);
        const usedToday = state.helpRequests.filter(
          (r) => r.userId === input.actor.userId && r.kind === "hallpass" && r.status === "closed" && r.returnedAt?.startsWith(todayPrefix)
        ).length;
        if (usedToday >= hp.perPeriodLimit) throw badRequest("You have reached today's hall-pass limit");
      }
      state.helpRequests.unshift({
        id: newId("help"),
        userId: input.actor.userId,
        displayName: input.actor.displayName,
        kind: "hallpass",
        status: "raised",
        createdAt: now,
        updatedAt: now
      });
      break;
    }
    case "approve-hallpass": {
      requireTeacher(input.actor);
      const maxConcurrent = input.roomSettings?.hallpass?.maxConcurrent ?? 1;
      const concurrentCount = state.helpRequests.filter(
        (r) => r.kind === "hallpass" && r.status === "acknowledged"
      ).length;
      if (concurrentCount >= maxConcurrent) throw badRequest("Maximum concurrent hall passes reached");
      const approveRequest = findHelpRequest(state, input.action.requestId);
      approveRequest.status = "acknowledged";
      approveRequest.approvedAt = now;
      approveRequest.updatedAt = now;
      break;
    }
    case "deny-hallpass": {
      requireTeacher(input.actor);
      const denyRequest = findHelpRequest(state, input.action.requestId);
      denyRequest.status = "cancelled";
      denyRequest.closedByUserId = input.actor.userId;
      denyRequest.updatedAt = now;
      break;
    }
    case "return-from-hallpass": {
      const returnRequest = input.action.requestId
        ? findHelpRequest(state, input.action.requestId)
        : state.helpRequests.find(
            (r) => r.userId === input.actor.userId && r.kind === "hallpass" && ["raised", "acknowledged"].includes(r.status)
          );
      if (!returnRequest) throw notFound("Active hall pass not found");
      if (returnRequest.userId !== input.actor.userId && input.actor.role !== "teacher") {
        throw forbidden("You can only return your own hall pass");
      }
      const durationSeconds = returnRequest.approvedAt
        ? Math.max(0, Math.round((Date.parse(now) - Date.parse(returnRequest.approvedAt)) / 1000))
        : 0;
      returnRequest.status = "closed";
      returnRequest.returnedAt = now;
      returnRequest.durationSeconds = durationSeconds;
      returnRequest.closedByUserId = input.actor.userId;
      returnRequest.updatedAt = now;
      await input.repository.recordRoomEvent({
        roomId: input.roomId,
        type: "hallpass.completed.v1",
        payload: {
          userId: returnRequest.userId,
          displayName: returnRequest.displayName,
          requestedAt: returnRequest.createdAt,
          approvedAt: returnRequest.approvedAt ?? null,
          returnedAt: now,
          durationSeconds
        },
        createdByUserId: input.actor.userId
      });
      break;
    }
    case "update-whisper-settings": {
      requireTeacher(input.actor);
      const current = state.whisper ?? { allowed: false, maxRadiusMeters: 3, autoEnableInGroupWork: true };
      state.whisper = {
        allowed: input.action.allowed ?? current.allowed,
        maxRadiusMeters: input.action.maxRadiusMeters ?? current.maxRadiusMeters,
        autoEnableInGroupWork: input.action.autoEnableInGroupWork ?? current.autoEnableInGroupWork
      };
      break;
    }
    case "set-student-media-global": {
      requireTeacher(input.actor);
      const runtime = state.studentMediaRuntime ?? {
        camerasEnabled: true,
        microphonesEnabled: true,
        cameraEnabledUserIds: [],
        microphoneEnabledUserIds: []
      };
      if (input.action.medium === "camera") {
        runtime.camerasEnabled = input.action.enabled;
      } else {
        runtime.microphonesEnabled = input.action.enabled;
      }
      state.studentMediaRuntime = runtime;
      break;
    }
    case "set-student-media-access": {
      requireTeacher(input.actor);
      const { userId: targetUserId, medium, enabled } = input.action;
      const runtime = state.studentMediaRuntime ?? {
        camerasEnabled: true,
        microphonesEnabled: true,
        cameraEnabledUserIds: [],
        microphoneEnabledUserIds: []
      };
      const listKey = medium === "camera" ? "cameraEnabledUserIds" : "microphoneEnabledUserIds";
      const list = runtime[listKey];
      if (enabled && !list.includes(targetUserId)) {
        list.push(targetUserId);
      } else if (!enabled) {
        runtime[listKey] = list.filter((id) => id !== targetUserId);
      }
      state.studentMediaRuntime = runtime;
      break;
    }
  }

  return input.repository.updateClassroomState(input.roomId, {
    state,
    ...(input.action.expectedVersion !== undefined ? { expectedVersion: input.action.expectedVersion } : {})
  });
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const repository = options.repository ?? (await buildRepository(config));
  await seedBuiltinRoomObjectTemplates(repository);
  if (config.tuning.enableWorldSkins) {
    await seedBuiltinWorldSkins(repository);
  }
  const roomObjectGrabLock = options.roomObjectGrabLock ?? new RoomObjectGrabLock();
  if (config.tuning.enableRoomObjects) {
    roomObjectGrabLock.startReaper();
  }
  // The Puppeteer driver owns a live Chromium process, so only build it when the
  // feature is enabled and the caller did not inject their own orchestrator (tests
  // rely on the no-Chromium stub default inside SharedBrowserOrchestrator).
  let sharedBrowserDriver: SharedBrowserDriver | undefined;
  if (!options.sharedBrowserOrchestrator && config.tuning.enableSharedBrowsers) {
    sharedBrowserDriver = new PuppeteerSharedBrowserDriver({ config });
  }
  const sharedBrowserFrameStore = new JpegFrameStore();
  let sharedBrowserVideo: SharedBrowserVideoManager | undefined;
  if (sharedBrowserDriver) {
    sharedBrowserVideo = new SharedBrowserVideoManager({
      repository,
      driver: sharedBrowserDriver,
      config,
      frameStore: sharedBrowserFrameStore
    });
  }
  const sharedBrowserOrchestrator =
    options.sharedBrowserOrchestrator ??
    new SharedBrowserOrchestrator({
      repository,
      config,
      ...(sharedBrowserDriver ? { driver: sharedBrowserDriver } : {}),
      ...(sharedBrowserVideo ? { video: sharedBrowserVideo } : {})
    });
  const sessionJoinAttempts = new Map<string, { count: number; resetAt: number }>();
  const meetingNotesAudioChunks = new Map<string, MeetingNotesAudioChunk[]>();
  const app = fastify({
    logger: config.nodeEnv !== "test",
    bodyLimit: 10 * 1024 * 1024
  });

  let sharedBrowserIdleReaper: SharedBrowserIdleReaper | undefined;
  if (sharedBrowserDriver) {
    sharedBrowserIdleReaper = new SharedBrowserIdleReaper({
      repository,
      driver: sharedBrowserDriver,
      config,
      logger: app.log,
      ...(sharedBrowserVideo ? { video: sharedBrowserVideo } : {})
    });
    sharedBrowserIdleReaper.start();
  }

  function clearMeetingNotesAudio(roomId: string, sessionId: string) {
    meetingNotesAudioChunks.delete(meetingNotesTaskKey(roomId, sessionId));
  }

  function appendMeetingNotesAudio(roomId: string, sessionId: string, chunk: MeetingNotesAudioChunk) {
    const key = meetingNotesTaskKey(roomId, sessionId);
    const chunks = meetingNotesAudioChunks.get(key) ?? [];
    chunks.push(chunk);
    meetingNotesAudioChunks.set(key, chunks);
    app.log.info({
      roomId,
      sessionId,
      participantId: chunk.participantId,
      bufferedChunks: chunks.length,
      bufferedBytes: chunks.reduce((total, item) => total + item.audio.length, 0)
    }, "Buffered meeting notes audio chunk");
  }

  async function transcribeBufferedMeetingNotesAudio(roomId: string, sessionId: string) {
    const key = meetingNotesTaskKey(roomId, sessionId);
    const chunks = meetingNotesAudioChunks.get(key) ?? [];
    if (chunks.length === 0) {
      app.log.info({ roomId, sessionId }, "No buffered meeting notes audio to transcribe");
      return;
    }

    const session = await repository.getMeetingNotesSession(roomId, sessionId);
    if (!session) throw notFound("Meeting notes session not found");

    const participantUserIds = Array.from(new Set([...session.participantUserIds, ...chunks.map((chunk) => chunk.participantId)]));
    if (participantUserIds.length !== session.participantUserIds.length) {
      await repository.updateMeetingNotesSession(roomId, sessionId, { participantUserIds });
    }

    const chunksByParticipant = new Map<string, MeetingNotesAudioChunk[]>();
    for (const chunk of chunks) {
      const participantChunks = chunksByParticipant.get(chunk.participantId) ?? [];
      participantChunks.push(chunk);
      chunksByParticipant.set(chunk.participantId, participantChunks);
    }

    for (const [participantId, participantChunks] of chunksByParticipant.entries()) {
      const ordered = participantChunks.sort((a, b) => a.startedAtMs - b.startedAtMs || a.endedAtMs - b.endedAtMs);
      const audio = Buffer.concat(ordered.map((chunk) => chunk.audio));
      const startMs = Math.min(...ordered.map((chunk) => chunk.startedAtMs));
      const endMs = Math.max(...ordered.map((chunk) => chunk.endedAtMs));
      const mimeType = ordered[0]?.mimeType ?? "audio/webm";
      app.log.info({
        roomId,
        sessionId,
        participantId,
        chunkCount: ordered.length,
        audioBytes: audio.length,
        mimeType,
        durationMs: Math.max(0, endMs - startMs)
      }, "Transcribing buffered meeting notes audio");

      const text = await transcribeAudioChunk(config, audio, mimeType);
      if (!text) {
        app.log.info({
          roomId,
          sessionId,
          participantId,
          audioBytes: audio.length,
          mimeType
        }, "Buffered meeting notes audio produced no transcript text");
        continue;
      }

      const segment = MeetingNotesSegmentSchema.parse({
        id: newId("mnseg"),
        sessionId,
        roomId,
        speakerUserId: participantId,
        startMs,
        endMs,
        text,
        isFinal: true,
        createdAt: nowIso()
      });
      await repository.createMeetingNotesSegment(segment);
      app.log.info({
        roomId,
        sessionId,
        segmentId: segment.id,
        participantId,
        textLength: segment.text.length,
        startMs: segment.startMs,
        endMs: segment.endMs
      }, "Transcript segment persisted from buffered meeting notes audio");
    }

    clearMeetingNotesAudio(roomId, sessionId);
  }

  app.addContentTypeParser(
    /^(image|video|audio|model)\//,
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    }
  );
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  function enforceSessionJoinRateLimit(userId: string, roomId: string) {
    const now = Date.now();
    const key = `${roomId}:${userId}`;
    const existing = sessionJoinAttempts.get(key);
    if (!existing || existing.resetAt <= now) {
      sessionJoinAttempts.set(key, { count: 1, resetAt: now + SESSION_JOIN_RATE_LIMIT_WINDOW_MS });
      return;
    }
    if (existing.count >= config.tuning.sessionJoinRateLimitPerMinute) {
      throw tooManyRequests("Too many room join attempts. Wait before requesting another session token.");
    }
    existing.count += 1;
  }

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (originAllowed(origin, config.corsAllowedOrigins)) {
        callback(null, true);
        return;
      }
      app.log.warn({
        origin,
        allowedOrigins: config.corsAllowedOrigins.map((value) => typeof value === "string" ? value : value.source)
      }, "Rejected request origin");
      callback(new Error(`Origin not allowed: ${origin}`), false);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-dev-user-id",
      "x-dev-user-name",
      "x-dev-user-role",
      "x-world-skin-uploader-password"
    ]
  });

  app.setErrorHandler((error, _request, reply) => {
    const fastifyError = error as { code?: string; message?: string };
    if (fastifyError.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      app.log.warn({
        errorCode: fastifyError.code,
        message: fastifyError.message
      }, "Request body exceeded Fastify limit");
      void reply.status(413).send({ error: "payload_too_large", message: "Request payload is too large" });
      return;
    }

    if (error instanceof HttpError) {
      void reply.status(error.statusCode).send({ error: error.code, message: error.message, ...error.details });
      return;
    }

    if (error instanceof z.ZodError) {
      void reply.status(400).send({ error: "validation_error", issues: error.issues });
      return;
    }

    app.log.error(error);
    void reply.status(500).send({ error: "internal_error", message: "Unexpected server error" });
  });

  app.addHook("onClose", async () => {
    roomObjectGrabLock.stopReaper();
    sharedBrowserIdleReaper?.stop();
    if (sharedBrowserVideo) await sharedBrowserVideo.close();
    if (sharedBrowserDriver?.close) await sharedBrowserDriver.close();
    clearRoomObjectParameterDebounceForTests();
    await repository.close();
  });

  app.get("/health", async () =>
    HealthResponseSchema.parse({
      status: "ok",
      service: "3dspace-api",
      version: "0.1.0",
      time: new Date().toISOString()
    })
  );

  app.get("/ready", async () => {
    const checks = [
      {
        name: "auth",
        status: config.clerkSecretKey ? "ok" : config.nodeEnv === "production" ? "missing" : "degraded",
        message: config.clerkSecretKey ? "Clerk secret configured" : "Using development header auth"
      },
      {
        name: "mongodb",
        status: config.mongoUri ? "ok" : config.nodeEnv === "production" ? "missing" : "degraded",
        message: config.mongoUri ? "MongoDB configured" : "Using in-memory development repository"
      },
      {
        name: "livekit",
        status: livekitConfigured(config) ? "ok" : config.nodeEnv === "production" ? "missing" : "degraded",
        message: livekitConfigured(config) ? "LiveKit token service configured" : "Using development realtime token fallback"
      },
      {
        name: "object-storage",
        status: storageConfigured(config) ? "ok" : config.tuning.enableWallAttachments && config.nodeEnv === "production" ? "missing" : "degraded",
        message: storageConfigured(config) ? "Object storage configured" : "Using development upload URL fallback"
      }
    ] as const;
    const hasMissing = checks.some((check) => check.status === "missing");
    const hasDegraded = checks.some((check) => check.status === "degraded");
    return {
      status: hasMissing ? "not_ready" : hasDegraded ? "degraded" : "ready",
      checks
    };
  });

  app.get("/openapi.json", async () => createOpenApiDocument());

  function storageKeyFromRequest(request: FastifyRequest) {
    const params = request.params as Record<string, string | undefined>;
    const wildcard = params["*"];
    if (wildcard) return parseRoomObjectAssetStorageKey(wildcard);
    if (params.storageKey) return parseRoomObjectAssetStorageKey(params.storageKey);
    throw notFound("Storage key is required");
  }

  if (worldSkinUploaderEnabled(config)) {
    app.post("/v1/world-skin-uploader/verify", async (request) => {
      const body = parseBody(WorldSkinUploaderVerifyRequestSchema, request);
      assertWorldSkinUploaderPassword(config, body.password);
      return WorldSkinUploaderVerifyResponseSchema.parse({ ok: true });
    });

    app.get("/v1/world-skin-uploader/status", async (request) => {
      const query = parseQuery(WorldSkinUploaderStatusQuerySchema, request);
      assertWorldSkinUploaderPassword(config, readUploaderPasswordHeader(request));
      const r2Prefix = `world-skins/${query.slug}/v${query.version}/`;
      const files = await Promise.all(
        WORLD_SKIN_ASSET_FILES.map(async (fileName) => {
          const storageKey = worldSkinStorageKey({
            slug: query.slug,
            version: query.version,
            fileName
          });
          const object = await readStoredObject(config, { storageKey });
          const download =
            object &&
            (await createDownloadTarget(config, {
              storageKey
            }));
          return {
            fileName,
            storageKey,
            required: isRequiredWorldSkinAsset(fileName),
            uploaded: Boolean(object),
            downloadUrl: download?.url
          };
        })
      );
      return WorldSkinUploaderStatusResponseSchema.parse({
        slug: query.slug,
        version: query.version,
        r2Prefix,
        files
      });
    });

    app.post("/v1/world-skin-uploader/uploads", async (request) => {
      const body = parseBody(CreateWorldSkinUploadRequestSchema, request);
      assertWorldSkinUploaderPassword(config, readUploaderPasswordHeader(request));
      assertWorldSkinUploadContentType(body.fileName, body.contentType);
      const storageKey = worldSkinStorageKey({
        slug: body.slug,
        version: body.version,
        fileName: body.fileName
      });
      const upload = await createUploadTarget(config, {
        storageKey,
        contentType: body.contentType
      });
      return CreateWorldSkinUploadResponseSchema.parse({
        storageKey,
        assetPath: worldSkinAssetPath(storageKey),
        upload
      });
    });
  }

  app.put("/dev-upload/*", async (request, reply) => {
    if (storageConfigured(config)) throw notFound("Development upload fallback is disabled");
    const storageKey = storageKeyFromRequest(request);
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from("");
    putDevStoredObject({
      storageKey,
      body,
      contentType: String(request.headers["content-type"] ?? "application/octet-stream")
    });
    return reply.status(204).send();
  });

  app.get("/dev-download/*", async (request, reply) => {
    if (storageConfigured(config)) throw notFound("Development download fallback is disabled");
    const storageKey = storageKeyFromRequest(request);
    const object = getDevStoredObject(storageKey);
    if (!object) throw notFound("Development object not found");
    return reply.header("content-type", object.contentType).send(object.body);
  });

  app.get("/v1/room-object-assets/*", async (request, reply) => {
    const storageKey = storageKeyFromRequest(request);
    const object = await readStoredObject(config, { storageKey });
    if (!object) throw notFound("Room object asset not found");
    return reply.header("content-type", object.contentType).send(object.body);
  });

  app.get("/v1/world-skins", async (request) => {
    await requireUser(request, config, repository);
    if (!config.tuning.enableWorldSkins) throw worldSkinsDisabled();
    const skins = await repository.listWorldSkins();
    return ListWorldSkinsResponseSchema.parse({ skins: skins.map((s) => rewriteWorldSkinAssetUrls(s, config)) });
  });

  app.get("/v1/world-skins/:slug", async (request) => {
    await requireUser(request, config, repository);
    if (!config.tuning.enableWorldSkins) throw worldSkinsDisabled();
    const params = parseParams(z.object({ slug: z.string() }), request);
    const skin = await repository.getWorldSkin(params.slug);
    if (!skin) throw notFound("World skin not found");
    return WorldSkinSchema.parse(rewriteWorldSkinAssetUrls(skin, config));
  });

  app.get("/v1/world-skin-assets/*", async (request, reply) => {
    // No auth required — world skin assets are read-only static content.
    // The feature flag is still enforced so the route is a no-op when skins
    // are disabled, and R2 keys are opaque storage paths rather than
    // user-guessable IDs, so there is no meaningful security benefit to
    // gating them behind a Clerk Bearer token (which TextureLoader and <img>
    // cannot send anyway).
    if (!config.tuning.enableWorldSkins) throw worldSkinsDisabled();
    const storageKey = storageKeyFromRequest(request);
    const object = await readStoredObject(config, { storageKey });
    if (!object) throw notFound("World skin asset not found");
    return reply
      .header("content-type", object.contentType)
      .header("cache-control", "public, max-age=31536000, immutable")
      .send(object.body);
  });

  app.get("/v1/users/me", async (request) => {
    const auth = await requireUser(request, config, repository);
    const user = await repository.getUser(auth.userId);
    if (!user) throw notFound("User not found");
    return user;
  });

  app.patch("/v1/users/me/avatar", async (request) => {
    const auth = await requireUser(request, config, repository);
    const body = parseBody(z.object({ appearance: AvatarAppearanceSchema }), request);
    return repository.updateUserAvatarAppearance(auth.userId, body.appearance);
  });

  app.get("/v1/classes", async (request) => {
    const auth = await requireUser(request, config, repository);
    return repository.listClassesForUser(auth.userId);
  });

  app.post("/v1/classes", async (request) => {
    const auth = await requireUser(request, config, repository);
    const body = parseBody(CreateClassRequestSchema, request);
    return repository.createClass({ name: body.name, teacher: auth });
  });

  app.patch("/v1/classes/:classId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithClassId, request);
    const body = parseBody(UpdateClassRequestSchema, request);
    await requireClassTeacher(repository, params.classId, auth);
    const update: { name?: string } = {};
    if (body.name) update.name = body.name;
    return repository.updateClass(params.classId, update);
  });

  app.get("/v1/classes/:classId/members", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithClassId, request);
    await requireClassAccess(repository, params.classId, auth);
    return repository.listMemberships(params.classId);
  });

  app.post("/v1/classes/:classId/members", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithClassId, request);
    const body = parseBody(UpsertClassMemberRequestSchema, request);
    await requireClassTeacher(repository, params.classId, auth);
    return repository.upsertMembership({
      classId: params.classId,
      userId: body.userId,
      displayName: body.displayName,
      role: body.role,
      status: body.status
    });
  });

  app.post("/v1/classes/:classId/invites", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithClassId, request);
    const body = parseBody(CreateInviteRequestSchema, request);
    await requireClassTeacher(repository, params.classId, auth);
    if (body.roomId) {
      const room = await repository.getRoom(body.roomId);
      if (!room || room.classId !== params.classId) throw badRequest("roomId must belong to the class");
    }
    const expiresAt = body.expiresInMinutes ? new Date(Date.now() + body.expiresInMinutes * 60_000).toISOString() : undefined;
    const inviteInput: {
      classId: string;
      role: "teacher" | "student";
      createdByUserId: string;
      roomId?: string;
      expiresAt?: string;
    } = {
      classId: params.classId,
      role: body.role,
      createdByUserId: auth.userId
    };
    if (body.roomId) inviteInput.roomId = body.roomId;
    if (expiresAt) inviteInput.expiresAt = expiresAt;
    return repository.createInvite(inviteInput);
  });

  const ROOM_INVITE_TTL_MINUTES = 60 * 24 * 7;

  function isInviteShareable(invite: { expiresAt?: string | undefined }) {
    return !invite.expiresAt || new Date(invite.expiresAt).getTime() >= Date.now();
  }

  app.get("/v1/rooms/:roomId/invite", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const room = await requireRoomTeacher(repository, params.roomId, auth);
    const invites = await repository.listInvitesForRoom(room.id);
    const existing = invites.find((invite) => invite.role === "student" && isInviteShareable(invite));
    if (existing) return existing;
    const expiresAt = new Date(Date.now() + ROOM_INVITE_TTL_MINUTES * 60_000).toISOString();
    return repository.createInvite({
      classId: room.classId,
      roomId: room.id,
      role: "student",
      createdByUserId: auth.userId,
      expiresAt
    });
  });

  app.post("/v1/invites/:inviteCode/accept", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithInviteCode, request);
    const invite = await repository.getInvite(params.inviteCode);
    if (!invite) throw notFound("Invite not found");
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      throw conflict("Invite has expired");
    }
    const classRecord = await repository.getClass(invite.classId);
    if (!classRecord) throw notFound("Class not found");
    const membership = await repository.upsertMembership({
      classId: invite.classId,
      userId: auth.userId,
      displayName: auth.displayName,
      role: invite.role,
      status: "active"
    });
    const updatedInvite = await repository.markInviteUsed(invite.code);
    return AcceptInviteResponseSchema.parse({
      invite: updatedInvite,
      class: classRecord,
      membership,
      roomId: invite.roomId
    });
  });

  app.get("/v1/rooms", async (request) => {
    const auth = await requireUser(request, config, repository);
    return repository.listRoomsForUser(auth.userId);
  });

  app.post("/v1/rooms", async (request) => {
    const auth = await requireUser(request, config, repository);
    const body = parseBody(CreateRoomRequestSchema, request);
    await requireClassTeacher(repository, body.classId, auth);

    const roomType: RoomType = body.type ?? "classroom";
    if (roomType === "workforce-training" && !config.tuning.enableWorkforceTraining) {
      throw forbidden("Workforce training rooms are disabled in this environment");
    }
    if (roomType === "free-for-all" && !config.tuning.enableFreeForAll) {
      throw forbidden("Free-for-All rooms are disabled in this environment");
    }
    if (roomType === "free-for-all") {
      assertFreeForAllPassword(config, body.freeForAllPassword);
    }

    const roomId = newId("room");
    const manifestConfig = {
      maxParticipants: config.tuning.maxRoomParticipants,
      avatarSendHz: config.tuning.avatarSendHz,
      interpolationMs: config.tuning.interpolationMs,
      defaultQuality: config.tuning.defaultQuality,
      enable2DAnalog: config.tuning.enable2DAnalog,
      enableWallAttachments: config.tuning.enableWallAttachments,
      spatialAudio: config.tuning.spatialAudio
    };
    const manifestFactory =
      roomType === "workforce-training" ? createWorkforceTrainingManifest :
      roomType === "free-for-all"       ? createFreeForAllManifest :
      createDefaultRoomManifest;
    const manifest = manifestFactory({ roomId, name: body.name, config: manifestConfig });

    return RoomWithManifestSchema.parse(
      await repository.createRoom({
        classId: body.classId,
        name: body.name,
        type: roomType,
        settings: roomSettings(config),
        manifest
      })
    );
  });

  app.patch("/v1/rooms/:roomId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(UpdateRoomRequestSchema, request);
    await requireRoomTeacher(repository, params.roomId, auth);
    const update: { name?: string; settings?: Partial<ReturnType<typeof roomSettings>> } = {};
    if (body.name) update.name = body.name;
    if (body.settings) {
      const settings: Partial<ReturnType<typeof roomSettings>> = {};
      for (const [key, value] of Object.entries(body.settings)) {
        if (value !== undefined) {
          (settings as Record<string, unknown>)[key] = value;
        }
      }
      if (Object.keys(settings).length > 0) update.settings = settings;
    }
    return repository.updateRoom(params.roomId, update);
  });

  app.delete("/v1/rooms/:roomId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    await requireRoomTeacher(repository, params.roomId, auth);
    await repository.deleteRoom(params.roomId);
    return DeleteRoomResponseSchema.parse({ roomId: params.roomId, deleted: true as const });
  });

  app.get("/v1/rooms/:roomId/manifest", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { manifest } = await requireRoomAccess(repository, params.roomId, auth);
    return manifest;
  });

  app.post("/v1/rooms/:roomId/session", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(JoinRoomSessionRequestSchema, request);

    let room = await repository.getRoom(params.roomId);
    if (!room) throw notFound("Room not found");

    let membership = await repository.getMembership(room.classId, auth.userId);
    if ((!membership || membership.status !== "active") && body.inviteCode) {
      const invite = await repository.getInvite(body.inviteCode);
      if (!invite || invite.roomId !== room.id) throw forbidden("Invite is not valid for this room");
      if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) throw conflict("Invite has expired");
      membership = await repository.upsertMembership({
        classId: room.classId,
        userId: auth.userId,
        displayName: auth.displayName,
        role: invite.role,
        status: "active"
      });
      await repository.markInviteUsed(invite.code);
    }

    if (!membership || membership.status !== "active") {
      throw forbidden("Active room membership required");
    }

    membership = await repository.upsertMembership({
      classId: room.classId,
      userId: auth.userId,
      displayName: auth.displayName,
      role: membership.role,
      status: "active"
    });

    const storedManifest = await repository.getActiveManifest(room.id);
    if (!storedManifest) throw notFound("Room manifest not found");
    const manifest = applyDefaultWallAnchorDimensions(storedManifest, room.type);
    enforceSessionJoinRateLimit(auth.userId, room.id);
    const participantIdentity = `${auth.userId}:${room.id}`;
    const activeCount = await repository.recordRoomSession({
      roomId: room.id,
      participantIdentity,
      userId: auth.userId,
      role: membership.role,
      maxParticipants: room.settings.maxParticipants
    });
    if (activeCount > room.settings.maxParticipants) {
      throw conflict("Room is at participant capacity");
    }

    const token = await mintLiveKitToken(config, {
      roomId: room.id,
      participantIdentity,
      displayName: auth.displayName,
      role: membership.role
    });

    const sessionUser = await repository.getUser(auth.userId);

    return RoomSessionResponseSchema.parse({
      token,
      livekitUrl: config.livekitUrl,
      participantIdentity,
      participantId: auth.userId,
      role: membership.role,
      room,
      manifest,
      capabilities: manifest.capabilities,
      avatarAppearance: sessionUser?.avatar?.appearance ?? null,
      tuning: {
        avatarSendHz: config.tuning.avatarSendHz,
        interpolationMs: config.tuning.interpolationMs,
        spatialAudio: config.tuning.spatialAudio,
        media: config.tuning.media
      }
    });
  });

  app.get("/v1/rooms/:roomId/attachments", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    await requireRoomAccess(repository, params.roomId, auth);
    return repository.listAttachments(params.roomId);
  });

  app.post("/v1/rooms/:roomId/attachments", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateWallAttachmentRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertWallObjectsEnabled({ settings: room.settings }, config);
    await assertAnchorExists(repository, room, manifest, body.wallAnchorId);
    validateAttachmentPolicy(config, body);
    const { teacher } = await actorIsRoomTeacher(repository, params.roomId, auth);
    const uploadType = wallObjectTypeForAttachmentKind(body.kind);
    const grant =
      !teacher && uploadType
        ? await getApplicableBoardGrant({
            repository,
            roomId: params.roomId,
            userId: auth.userId,
            wallAnchorId: body.wallAnchorId,
            type: uploadType
          })
        : undefined;
    if (!teacher && ((!grant && room.settings.wallObjectCreation === "teacher-only") || (!grant && !room.settings.allowStudentUploads))) {
      throw forbidden("Student wall uploads are disabled");
    }
    const storageKey = storageKeyFor({ roomId: params.roomId, wallAnchorId: body.wallAnchorId, fileName: body.fileName });
    const upload = await createUploadTarget(config, { storageKey, contentType: body.contentType });
    const publicUrl =
      config.objectStorage.publicRead && config.objectStorage.publicBaseUrl
        ? `${config.objectStorage.publicBaseUrl.replace(/\/$/, "")}/${storageKey}`
        : undefined;
    const attachmentInput = {
      roomId: params.roomId,
      wallAnchorId: body.wallAnchorId,
      kind: body.kind,
      fileName: body.fileName,
      contentType: body.contentType,
      storageKey,
      metadata: body.metadata,
      createdByUserId: auth.userId
    };
    const attachment = await repository.createAttachment(publicUrl ? { ...attachmentInput, publicUrl } : attachmentInput);
    return { attachment, upload };
  });

  app.post("/v1/rooms/:roomId/attachments/:attachmentId/finalize", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndAttachmentId, request);
    const body = parseBody(FinalizeWallAttachmentRequestSchema, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const attachment = await repository.getAttachment(params.roomId, params.attachmentId);
    if (!attachment) throw notFound("Attachment not found");
    const { teacher } = await actorIsRoomTeacher(repository, params.roomId, auth);
    if (!teacher && attachment.createdByUserId !== auth.userId) throw forbidden("Cannot finalize another user's attachment");
    const updated = await repository.updateAttachment(params.roomId, params.attachmentId, {
      status: "ready",
      metadata: body.metadata
    });
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: "wall.asset.finalized.v1",
      payload: { attachmentId: updated.id, wallAnchorId: updated.wallAnchorId, kind: updated.kind },
      createdByUserId: auth.userId
    });
    return updated;
  });

  app.patch("/v1/rooms/:roomId/attachments/:attachmentId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndAttachmentId, request);
    const body = parseBody(UpdateWallAttachmentRequestSchema, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const attachment = await repository.getAttachment(params.roomId, params.attachmentId);
    if (!attachment) throw notFound("Attachment not found");
    const { teacher } = await actorIsRoomTeacher(repository, params.roomId, auth);
    if (!teacher && attachment.createdByUserId !== auth.userId) throw forbidden("Cannot update another user's attachment");
    if (!teacher && body.status && body.status !== "rejected") throw forbidden("Teacher role required to approve attachment status");
    return repository.updateAttachment(params.roomId, params.attachmentId, body);
  });

  app.get("/v1/rooms/:roomId/attachments/:attachmentId/download", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndAttachmentId, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const attachment = await repository.getAttachment(params.roomId, params.attachmentId);
    if (!attachment) throw notFound("Attachment not found");
    const download = await createDownloadTarget(config, { storageKey: attachment.storageKey });
    return WallAttachmentDownloadResponseSchema.parse({ attachment, download });
  });

  app.get("/v1/rooms/:roomId/wall-objects", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const query = parseQuery(ListWallObjectsQuerySchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertWallObjectsEnabled({ settings: room.settings }, config);
    const { teacher } = await actorIsRoomTeacher(repository, params.roomId, auth);
    const includeRemoved = query.includeRemoved === true || query.includeRemoved === "true";
    const objects = await repository.listWallObjects(params.roomId, {
      status: query.status,
      anchorId: query.anchorId,
      includeRemoved
    });
    return objects.filter((object) => {
      if (object.status === "pending_moderation" || object.status === "draft" || object.status === "pending_upload") {
        return teacher || object.createdByUserId === auth.userId || auth.userId === object.updatedByUserId;
      }
      return true;
    });
  });

  app.post("/v1/rooms/:roomId/wall-objects", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateWallObjectRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertWallObjectsEnabled({ settings: room.settings }, config);
    if (body.type === "whiteboard") assertWhiteboardsEnabled(room, config);
    if (body.type === "web.browser.shared") assertSharedBrowsersEnabled(room, config);
    await assertAnchorAcceptsType(repository, room, manifest, body.wallAnchorId, body.type);
    await assertAnchorAvailableForNewObject(repository, params.roomId, body.wallAnchorId);
    const { teacher, granted } = await assertWallObjectCreatePolicy({
      repository,
      config,
      room,
      auth,
      wallAnchorId: body.wallAnchorId,
      type: body.type
    });
    const requestedStatus = teacher || granted ? body.status ?? "active" : room.settings.wallObjectCreation === "student-direct" ? "active" : "pending_moderation";
    if (requestedStatus === "active") await enforceWallObjectLimits(repository, room, body.type);
    await validateWallObjectSource({ repository, roomId: params.roomId, type: body.type, source: body.source, requestedStatus });
    const pollPrepared = preparePollWallObjectInput(body);
    const object = WallObjectSchema.parse(
      await repository.createWallObject({
        roomId: params.roomId,
        wallAnchorId: body.wallAnchorId,
        type: body.type,
        title: body.title,
        ...(body.description ? { description: body.description } : {}),
        source: pollPrepared.source,
        placement: body.placement,
        state: pollPrepared.state,
        permissions: body.permissions,
        status: requestedStatus,
        moderation: {
          ...body.moderation,
          policy: room.settings.wallObjectModeration,
          requestedByUserId: auth.userId,
          ...(teacher || requestedStatus === "active" ? { approvedByUserId: auth.userId, approvedAt: new Date().toISOString() } : {})
        },
        createdByUserId: auth.userId,
        updatedByUserId: auth.userId
      })
    );
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: "wall.object.created.v1",
      payload: { objectId: object.id, wallAnchorId: object.wallAnchorId, type: object.type, status: object.status },
      createdByUserId: auth.userId
    });
    if (object.type === "web.browser.shared" && object.status === "active") {
      const startUrl = String((object.source.kind === "inline" ? object.source.data?.startUrl : undefined) ?? "");
      await sharedBrowserOrchestrator.createSession({
        sessionId: SharedBrowserOrchestrator.newSessionId(),
        roomId: params.roomId,
        wallObjectId: object.id,
        createdBy: { userId: auth.userId, displayName: auth.displayName },
        startUrl,
        settings: room.settings.sharedBrowsers
      });
      const refreshed = await repository.getWallObject(params.roomId, object.id);
      return refreshed ? WallObjectSchema.parse(refreshed) : object;
    }
    return object;
  });

  app.get("/v1/rooms/:roomId/wall-objects/:objectId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const object = await repository.getWallObject(params.roomId, params.objectId);
    if (!object) throw notFound("Wall object not found");
    return object;
  });

  app.patch("/v1/rooms/:roomId/wall-objects/:objectId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const body = parseBody(UpdateWallObjectRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    const existing = await repository.getWallObject(params.roomId, params.objectId);
    if (!existing) throw notFound("Wall object not found");
    await assertWallObjectManagePolicy(repository, params.roomId, auth, existing);
    if (body.placement) await assertAnchorAcceptsType(repository, room, manifest, existing.wallAnchorId, existing.type);
    if (body.status === "active") {
      await validateWallObjectSource({ repository, roomId: params.roomId, type: existing.type, source: existing.source, requestedStatus: "active" });
      if (existing.status !== "active") await enforceWallObjectLimits(repository, room, existing.type);
    }
    const updateInput: Parameters<Repository["updateWallObject"]>[2] = { updatedByUserId: auth.userId };
    if (body.expectedVersion !== undefined) updateInput.expectedVersion = body.expectedVersion;
    if (body.title !== undefined) updateInput.title = body.title;
    if (body.description !== undefined) updateInput.description = body.description;
    if (body.placement !== undefined) updateInput.placement = body.placement;
    if (body.state !== undefined) updateInput.state = body.state;
    if (body.permissions !== undefined) updateInput.permissions = body.permissions;
    if (body.moderation !== undefined) updateInput.moderation = body.moderation;
    if (body.status !== undefined) updateInput.status = body.status;
    const updated = await repository.updateWallObject(params.roomId, params.objectId, updateInput);
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: updated.status === "removed" ? "wall.object.removed.v1" : "wall.object.updated.v1",
      payload: { objectId: updated.id, wallAnchorId: updated.wallAnchorId, type: updated.type, status: updated.status, version: updated.version },
      createdByUserId: auth.userId
    });
    return updated;
  });

  app.delete("/v1/rooms/:roomId/wall-objects/:objectId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const existing = await repository.getWallObject(params.roomId, params.objectId);
    if (!existing) throw notFound("Wall object not found");
    await assertWallObjectManagePolicy(repository, params.roomId, auth, existing);
    const updated = await repository.softRemoveWallObject(params.roomId, params.objectId, { updatedByUserId: auth.userId });
    if (existing.type === "web.browser.shared") {
      await sharedBrowserOrchestrator.stopSession(params.objectId);
    }
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: "wall.object.removed.v1",
      payload: { objectId: updated.id, wallAnchorId: updated.wallAnchorId, type: updated.type },
      createdByUserId: auth.userId
    });
    return updated;
  });

  // ── Dynamic wall anchors (Free-for-All rooms) ────────────────────────────

  const MAX_DYNAMIC_ANCHORS_PER_ROOM = 32;

  app.get("/v1/rooms/:roomId/dynamic-wall-anchors", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    if (room.type !== "free-for-all") throw notFound("Dynamic wall anchors are only available in Free-for-All rooms");
    const anchors = await repository.listDynamicWallAnchorsForRoom(params.roomId);
    return anchors;
  });

  app.post("/v1/rooms/:roomId/dynamic-wall-anchors", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateDynamicWallAnchorRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    if (room.type !== "free-for-all") throw notFound("Dynamic wall anchors are only available in Free-for-All rooms");

    const count = await repository.countDynamicWallAnchorsForRoom(params.roomId);
    if (count >= MAX_DYNAMIC_ANCHORS_PER_ROOM) {
      throw conflict(`Room is at the board limit (${MAX_DYNAMIC_ANCHORS_PER_ROOM})`);
    }

    const existingAnchors = [
      ...manifest.wallAnchors.map((anchor) => ({
        position: anchor.position,
        width: anchor.width
      })),
      ...(await repository.listDynamicWallAnchorsForRoom(params.roomId)).map((anchor) => ({
        position: anchor.position,
        width: anchor.width,
        wallId: anchor.wallId
      }))
    ];
    const validation = validateDynamicBoardPlacement(manifest, existingAnchors, {
      wallId: body.wallId,
      center: body.center,
      width: body.width
    });
    if (!validation.ok) {
      throw unprocessableEntity(validation.reason === "wall-not-found" ? "Wall not found in room manifest" : "Board placement overlaps an existing board");
    }

    const now = nowIso();
    const anchor: DynamicWallAnchor = DynamicWallAnchorSchema.parse({
      id: newId("dwa"),
      roomId: params.roomId,
      wallId: body.wallId,
      createdByUserId: auth.userId,
      label: body.title,
      position: body.center,
      normal: body.normal,
      width: body.width,
      height: body.height,
      metadata: { accepts: body.accepts, hideSurface: true, hideObjectHeader: true },
      createdAt: now,
      updatedAt: now
    });

    await repository.createDynamicWallAnchor(anchor);
    await repository.recordRoomEvent({ roomId: params.roomId, type: "room.board.created.v1", payload: { anchorId: anchor.id }, createdByUserId: auth.userId });

    const message = RoomBoardCreatedMessageV1Schema.parse({
      type: "room.board.created.v1",
      roomId: params.roomId,
      anchor,
      sentAt: Date.now(),
      senderId: auth.userId
    });
    return { anchor, realtimeMessages: [message] };
  });

  app.patch("/v1/rooms/:roomId/dynamic-wall-anchors/:anchorId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(z.object({ roomId: z.string(), anchorId: z.string() }), request);
    const body = parseBody(UpdateDynamicWallAnchorRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    if (room.type !== "free-for-all") throw notFound("Dynamic wall anchors are only available in Free-for-All rooms");

    const existing = await repository.getDynamicWallAnchor(params.anchorId);
    if (!existing || existing.roomId !== params.roomId) throw notFound("Dynamic wall anchor not found");

    const { teacher } = await actorIsRoomTeacher(repository, params.roomId, auth);
    if (!teacher && existing.createdByUserId !== auth.userId) {
      throw forbidden("Only the creator or room owner can update this board");
    }

    const patch: Partial<DynamicWallAnchor> = {};
    if (body.title !== undefined) patch.label = body.title;
    if (body.center !== undefined) patch.position = body.center;
    if (body.normal !== undefined) patch.normal = body.normal;
    if (body.width !== undefined) patch.width = body.width;
    if (body.height !== undefined) patch.height = body.height;
    if (body.accepts !== undefined) patch.metadata = { ...existing.metadata, accepts: body.accepts };

    if (body.center !== undefined || body.width !== undefined) {
      const proposedWidth = body.width ?? existing.width;
      const proposedCenter = body.center ?? existing.position;
      const proposedWallId = body.wallId ?? existing.wallId;
      const otherAnchors = [
        ...manifest.wallAnchors.map((anchor) => ({
          position: anchor.position,
          width: anchor.width
        })),
        ...(await repository.listDynamicWallAnchorsForRoom(params.roomId))
          .filter((anchor) => anchor.id !== params.anchorId)
          .map((anchor) => ({
            position: anchor.position,
            width: anchor.width,
            wallId: anchor.wallId
          }))
      ];
      const validation = validateDynamicBoardPlacement(manifest, otherAnchors, {
        wallId: proposedWallId,
        center: proposedCenter,
        width: proposedWidth
      });
      if (!validation.ok) {
        throw unprocessableEntity(validation.reason === "wall-not-found" ? "Wall not found in room manifest" : "Board placement overlaps an existing board");
      }
    }

    const updated = await repository.updateDynamicWallAnchor(params.anchorId, patch);
    const message = RoomBoardUpdatedMessageV1Schema.parse({
      type: "room.board.updated.v1",
      roomId: params.roomId,
      anchor: updated,
      sentAt: Date.now(),
      senderId: auth.userId
    });
    return { anchor: updated, realtimeMessages: [message] };
  });

  app.delete("/v1/rooms/:roomId/dynamic-wall-anchors/:anchorId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(z.object({ roomId: z.string(), anchorId: z.string() }), request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    if (room.type !== "free-for-all") throw notFound("Dynamic wall anchors are only available in Free-for-All rooms");

    const existing = await repository.getDynamicWallAnchor(params.anchorId);
    if (!existing || existing.roomId !== params.roomId) throw notFound("Dynamic wall anchor not found");

    const { teacher } = await actorIsRoomTeacher(repository, params.roomId, auth);
    if (!teacher && existing.createdByUserId !== auth.userId) {
      throw forbidden("Only the creator or room owner can delete this board");
    }

    const wallObjects = await repository.listWallObjects(params.roomId, { anchorId: params.anchorId, status: "active" });
    if (wallObjects.some((wo) => wo.status === "active")) {
      throw conflict("Board has active content. Remove wall objects from the board before deleting it.");
    }

    await repository.removeDynamicWallAnchor(params.anchorId, params.roomId);
    await repository.recordRoomEvent({ roomId: params.roomId, type: "room.board.removed.v1", payload: { anchorId: params.anchorId }, createdByUserId: auth.userId });

    const message = RoomBoardRemovedMessageV1Schema.parse({
      type: "room.board.removed.v1",
      roomId: params.roomId,
      anchorId: params.anchorId,
      sentAt: Date.now(),
      senderId: auth.userId
    });
    return { realtimeMessages: [message] };
  });

  // ── Free-for-All open join ────────────────────────────────────────────────

  app.get("/v1/rooms/free-for-all", async (request) => {
    await requireUser(request, config, repository);
    const query = (request.query as Record<string, string | undefined>);
    const classId = typeof query.classId === "string" ? query.classId : undefined;
    const limit = Math.min(Number(query.limit ?? "20") || 20, 100);
    const rooms = await repository.listFreeForAllRooms(classId ? { classId } : {});
    return ListFreeForAllRoomsResponseSchema.parse({
      rooms: rooms.slice(0, limit).map((r) => ({
        id: r.id,
        name: r.name,
        classId: r.classId,
        createdAt: r.createdAt,
        participantCount: 0
      }))
    });
  });

  app.post("/v1/rooms/:roomId/free-for-all-sessions", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(JoinFreeForAllSessionRequestSchema, request);

    const room = await repository.getRoom(params.roomId);
    if (!room) throw notFound("Room not found");
    if (room.type !== "free-for-all") throw forbidden("This endpoint is only available for Free-for-All rooms");

    const classRecord = await repository.getClass(room.classId);
    const isCreator = classRecord?.teacherUserId === auth.userId;
    if (!isCreator) {
      assertFreeForAllPassword(config, body.freeForAllPassword);
    }

    let membership = await repository.getMembership(room.classId, auth.userId);
    if (!membership || membership.status !== "active") {
      membership = await repository.upsertMembership({
        classId: room.classId,
        userId: auth.userId,
        displayName: auth.displayName,
        role: "student",
        status: "active"
      });
    }

    membership = await repository.upsertMembership({
      classId: room.classId,
      userId: auth.userId,
      displayName: auth.displayName,
      role: membership.role,
      status: "active"
    });

    const storedManifest = await repository.getActiveManifest(room.id);
    if (!storedManifest) throw notFound("Room manifest not found");
    const manifest = applyDefaultWallAnchorDimensions(storedManifest, room.type);

    enforceSessionJoinRateLimit(auth.userId, room.id);
    const participantIdentity = `${auth.userId}:${room.id}`;
    const activeCount = await repository.recordRoomSession({
      roomId: room.id,
      participantIdentity,
      userId: auth.userId,
      role: membership.role,
      maxParticipants: room.settings.maxParticipants
    });
    if (activeCount > room.settings.maxParticipants) {
      throw conflict("Room is at participant capacity");
    }

    const token = await mintLiveKitToken(config, {
      roomId: room.id,
      participantIdentity,
      displayName: auth.displayName,
      role: membership.role
    });

    const sessionUser = await repository.getUser(auth.userId);
    return RoomSessionResponseSchema.parse({
      token,
      livekitUrl: config.livekitUrl,
      participantIdentity,
      participantId: auth.userId,
      role: membership.role,
      room,
      manifest,
      capabilities: manifest.capabilities,
      avatarAppearance: sessionUser?.avatar?.appearance ?? null,
      tuning: {
        avatarSendHz: config.tuning.avatarSendHz,
        interpolationMs: config.tuning.interpolationMs,
        spatialAudio: config.tuning.spatialAudio,
        media: config.tuning.media
      }
    });
  });

  // ── AI meeting notes (Free-for-All rooms) ───────────────────────────────

  app.get("/v1/rooms/:roomId/meeting-notes/sessions", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    await assertMeetingNotesAvailable(repository, config, params.roomId, auth);
    const sessions = await repository.listMeetingNotesSessions(params.roomId);
    return MeetingNotesSessionListResponseSchema.parse({ sessions });
  });

  app.post("/v1/rooms/:roomId/meeting-notes/sessions", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const room = await assertMeetingNotesAvailable(repository, config, params.roomId, auth);
    const active = await repository.getActiveMeetingNotesSession(params.roomId);
    if (active) throw conflict("A meeting notes session is already active for this room");
    const now = nowIso();
    const session = MeetingNotesSessionSchema.parse({
      id: newId("mnotes"),
      roomId: params.roomId,
      startedByUserId: auth.userId,
      startedAt: now,
      status: "recording",
      participantUserIds: [auth.userId],
      createdAt: now,
      updatedAt: now
    });
    clearMeetingNotesAudio(params.roomId, session.id);
    await repository.createMeetingNotesSession(session);
    const message = MeetingNotesStartedMessageV1Schema.parse({
      type: "room.meeting-notes.started.v1",
      roomId: params.roomId,
      sessionId: session.id,
      session,
      sentAt: Date.now(),
      senderId: auth.userId
    });
    return StartMeetingNotesSessionResponseSchema.parse({ session, realtimeMessages: [message] });
  });

  app.get("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    await assertMeetingNotesAvailable(repository, config, params.roomId, auth);
    return buildMeetingNotesDetail(repository, params.roomId, params.sessionId);
  });

  app.patch("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    const body = parseBody(PatchMeetingNotesSessionRequestSchema, request);
    const room = await assertMeetingNotesAvailable(repository, config, params.roomId, auth);
    const existing = await repository.getMeetingNotesSession(params.roomId, params.sessionId);
    if (!existing) throw notFound("Meeting notes session not found");

    if (body.action === "cancel") {
      clearMeetingNotesAudio(params.roomId, params.sessionId);
      const session = await repository.updateMeetingNotesSession(params.roomId, params.sessionId, {
        status: "cancelled",
        endedAt: nowIso()
      });
      const message = MeetingNotesEndedMessageV1Schema.parse({
        type: "room.meeting-notes.ended.v1",
        roomId: params.roomId,
        sessionId: session.id,
        session,
        sentAt: Date.now(),
        senderId: auth.userId
      });
      return StartMeetingNotesSessionResponseSchema.parse({ session, realtimeMessages: [message] });
    }

    await repository.updateMeetingNotesSession(params.roomId, params.sessionId, { status: "finalizing" });
    try {
      await transcribeBufferedMeetingNotesAudio(params.roomId, params.sessionId);
      const session = await finalizeMeetingNotesSession(repository, config, room, params.sessionId);
      const ended = MeetingNotesEndedMessageV1Schema.parse({
        type: "room.meeting-notes.ended.v1",
        roomId: params.roomId,
        sessionId: session.id,
        session,
        sentAt: Date.now(),
        senderId: auth.userId
      });
      const summaryReady = MeetingNotesSummaryReadyMessageV1Schema.parse({
        type: "room.meeting-notes.summary-ready.v1",
        roomId: params.roomId,
        sessionId: session.id,
        session,
        sentAt: Date.now(),
        senderId: auth.userId
      });
      return StartMeetingNotesSessionResponseSchema.parse({ session, realtimeMessages: [ended, summaryReady] });
    } catch (error) {
      const failed = await repository.updateMeetingNotesSession(params.roomId, params.sessionId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unable to finalize meeting notes"
      });
      const message = MeetingNotesErrorMessageV1Schema.parse({
        type: "room.meeting-notes.error.v1",
        roomId: params.roomId,
        sessionId: failed.id,
        errorMessage: failed.errorMessage ?? "Unable to finalize meeting notes",
        sentAt: Date.now(),
        senderId: auth.userId
      });
      return StartMeetingNotesSessionResponseSchema.parse({ session: failed, realtimeMessages: [message] });
    }
  });

  app.post("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/summary", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    parseBody(UpdateMeetingNotesSummaryRequestSchema, request);
    const room = await assertMeetingNotesAvailable(repository, config, params.roomId, auth);
    await repository.updateMeetingNotesSession(params.roomId, params.sessionId, { status: "finalizing" });
    await transcribeBufferedMeetingNotesAudio(params.roomId, params.sessionId);
    const session = await finalizeMeetingNotesSession(repository, config, room, params.sessionId);
    const message = MeetingNotesSummaryReadyMessageV1Schema.parse({
      type: "room.meeting-notes.summary-ready.v1",
      roomId: params.roomId,
      sessionId: session.id,
      session,
      sentAt: Date.now(),
      senderId: auth.userId
    });
    return StartMeetingNotesSessionResponseSchema.parse({ session, realtimeMessages: [message] });
  });

  app.delete("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    await assertMeetingNotesAvailable(repository, config, params.roomId, auth);
    clearMeetingNotesAudio(params.roomId, params.sessionId);
    await repository.deleteMeetingNotesSession(params.roomId, params.sessionId);
    return { deleted: true };
  });

  app.post("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/audio-chunks", async (request, reply) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    const body = parseBody(UploadMeetingNotesAudioChunkRequestSchema, request);
    await assertMeetingNotesAvailable(repository, config, params.roomId, auth);
    const session = await repository.getMeetingNotesSession(params.roomId, params.sessionId);
    if (!session) throw notFound("Meeting notes session not found");
    if (session.status !== "recording") throw conflict("Meeting notes session is not recording");

    const audio = Buffer.from(body.audioBase64, "base64");
    console.info("[meeting-notes] Audio chunk received", {
      roomId: params.roomId,
      sessionId: params.sessionId,
      participantId: body.participantId,
      origin: request.headers.origin,
      contentLength: request.headers["content-length"],
      startedAtMs: body.startedAtMs,
      endedAtMs: body.endedAtMs,
      durationMs: Math.max(0, body.endedAtMs - body.startedAtMs),
      mimeType: body.mimeType,
      audioBytes: audio.length,
      base64Length: body.audioBase64.length
    });
    appendMeetingNotesAudio(params.roomId, params.sessionId, {
      participantId: body.participantId,
      startedAtMs: body.startedAtMs,
      endedAtMs: body.endedAtMs,
      mimeType: body.mimeType,
      audio
    });
    return reply.status(202).send(UploadMeetingNotesAudioChunkResponseSchema.parse({ accepted: true, realtimeMessages: [] }));
  });

  app.get("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/download", async (request, reply) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    const query = parseQuery(z.object({ format: MeetingNotesDownloadFormatSchema }), request);
    await assertMeetingNotesAvailable(repository, config, params.roomId, auth);
    const session = await repository.getMeetingNotesSession(params.roomId, params.sessionId);
    if (!session) throw notFound("Meeting notes session not found");
    const storageKey =
      query.format === "md"
        ? session.summaryStorageKey
        : session.transcriptStorageKeys?.[query.format];
    if (!storageKey) throw notFound("Requested meeting notes artifact is not available");
    const object = await readStoredObject(config, { storageKey });
    if (!object) throw notFound("Meeting notes artifact not found");
    const fileName = storageKey.split("/").pop() ?? `meeting-notes.${query.format}`;
    return reply
      .header("Content-Type", object.contentType)
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(object.body);
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/control", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const body = parseBody(WallObjectControlRequestSchema, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const existing = await repository.getWallObject(params.roomId, params.objectId);
    if (!existing) throw notFound("Wall object not found");

    let status = existing.status;
    const state = { ...existing.state };
    const permissions = { ...existing.permissions };
    const moderation = { ...existing.moderation };

    if (body.action === "vote") {
      if (existing.type !== "poll") throw badRequest("Vote is only supported for polls");
      if (existing.status !== "active") throw conflict("Poll is not open for voting");
      const pollState = readPollState(state);
      if (pollState.closed) throw conflict("Poll is closed");
      const choiceId = body.choiceId?.trim();
      if (!choiceId) throw badRequest("choiceId is required to vote");
      if (existing.source.kind !== "inline") throw badRequest("Poll source is invalid");
      const { choices } = normalizePollInlineData(existing.source.data);
      if (!isValidPollChoiceId(choices, choiceId)) throw badRequest("Invalid poll choice");
      state.poll = {
        ...pollState,
        votesByUserId: {
          ...pollState.votesByUserId,
          [auth.userId]: choiceId
        }
      };
    } else {
      const { teacher } = await assertWallObjectManagePolicy(repository, params.roomId, auth, existing);
      if ((body.action === "approve" || body.action === "reject" || body.action === "lock" || body.action === "unlock") && !teacher) {
        throw forbidden("Teacher role required for wall object moderation");
      }

      if (body.action === "close-poll" || body.action === "reopen-poll") {
        if (existing.type !== "poll") throw badRequest("Poll controls are only supported for polls");
        const pollState = readPollState(state);
        state.poll = {
          ...pollState,
          closed: body.action === "close-poll"
        };
      }

    if (body.action === "play" || body.action === "pause") {
      const previousPlayback =
        typeof state.playback === "object" && state.playback !== null ? (state.playback as Record<string, unknown>) : {};
      state.playback = {
        status: body.action === "play" ? "playing" : "paused",
        positionSeconds: body.positionSeconds ?? Number(previousPlayback.positionSeconds ?? 0),
        rate: body.rate ?? Number(previousPlayback.rate ?? 1),
        muted: body.muted ?? Boolean(previousPlayback.muted),
        sentAt: Date.now(),
        controlledByUserId: auth.userId
      };
      status = "active";
    }
    if (body.action === "seek") {
      const previousPlayback =
        typeof state.playback === "object" && state.playback !== null ? (state.playback as Record<string, unknown>) : {};
      state.playback = {
        ...previousPlayback,
        positionSeconds: body.positionSeconds ?? 0,
        status: "paused",
        sentAt: Date.now(),
        controlledByUserId: auth.userId
      };
    }
    if (body.action === "mute" || body.action === "unmute") {
      state.muted = body.action === "mute";
    }
    if (body.action === "stop-share") {
      status = "source_ended";
      state.live = false;
      state.endedAt = new Date().toISOString();
    }
    if (body.action === "lock" || body.action === "unlock") {
      permissions.locked = body.action === "lock";
    }
    if (body.action === "approve") {
      status = "active";
      moderation.approvedByUserId = auth.userId;
      moderation.approvedAt = new Date().toISOString();
    }
    if (body.action === "reject") {
      status = "rejected";
      moderation.rejectedByUserId = auth.userId;
      moderation.rejectedAt = new Date().toISOString();
    }
    }

    const controlUpdate: Parameters<Repository["updateWallObject"]>[2] = {
      status,
      state,
      permissions,
      moderation,
      updatedByUserId: auth.userId
    };
    if (body.expectedVersion !== undefined) controlUpdate.expectedVersion = body.expectedVersion;
    const updated = await repository.updateWallObject(params.roomId, params.objectId, controlUpdate);
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type:
        body.action === "vote" || body.action === "close-poll" || body.action === "reopen-poll"
          ? "wall.poll.updated.v1"
          : body.action === "stop-share"
            ? "wall.share.ended.v1"
            : body.action === "approve" || body.action === "reject"
              ? "wall.object.moderated.v1"
              : body.action === "lock" || body.action === "unlock"
                ? "wall.object.locked.v1"
                : "wall.playback.controlled.v1",
      payload: { objectId: updated.id, action: body.action, status: updated.status, version: updated.version },
      createdByUserId: auth.userId
    });
    return updated;
  });

  app.get("/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/strokes", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const query = parseQuery(ListWhiteboardStrokesQuerySchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertWhiteboardsEnabled(room, config);
    const object = await requireWhiteboardObject(repository, params.roomId, params.objectId);
    const state = readWhiteboardState(object);
    const snapshot = await repository.latestWhiteboardSnapshot(params.roomId, params.objectId);
    const snapshotDownloadUrl = snapshot ? (await createDownloadTarget(config, { storageKey: snapshot.storageKey })).url : null;
    const strokes = await repository.listWhiteboardStrokes(params.roomId, params.objectId, {
      sinceZ: query.sinceZ ?? snapshot?.snapshotZ
    });
    return ListWhiteboardStrokesResponseSchema.parse({
      snapshot: snapshot ?? null,
      snapshotDownloadUrl,
      strokes,
      clearVersion: state.clearVersion,
      strokeCount: state.strokeCount
    });
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/strokes", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const body = parseBody(CommitWhiteboardStrokeRequestSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertWhiteboardsEnabled(room, config);
    const object = await requireWhiteboardObject(repository, params.roomId, params.objectId);
    if (object.status !== "active") throw conflict("Whiteboard is not active");
    await assertWhiteboardWritePolicy({
      repository,
      room,
      auth,
      wallAnchorId: object.wallAnchorId
    });

    const state = readWhiteboardState(object);
    if (body.clearVersion !== state.clearVersion) {
      throw conflict("Whiteboard changed while this stroke was being drawn");
    }
    if (state.strokeCount >= room.settings.whiteboards.maxStrokesPerBoard) {
      throw conflict("Whiteboard has reached the maximum stroke count");
    }
    validateWhiteboardStrokeInput(body, {
      maxPointsPerStroke: Math.min(room.settings.whiteboards.maxPointsPerStroke, config.tuning.whiteboardMaxPointsPerStroke)
    });

    const existingStrokes = await repository.listWhiteboardStrokes(params.roomId, params.objectId);
    const nextZ = (existingStrokes.at(-1)?.z ?? -1) + 1;
    const createdAt = nowIso();
    const stroke = stampedWhiteboardStroke({
      roomId: params.roomId,
      wallObjectId: params.objectId,
      authorUserId: auth.userId,
      z: nextZ,
      createdAt,
      clearVersion: state.clearVersion,
      stroke: body
    });
    await repository.appendWhiteboardStroke(stroke);
    const updatedObject = await repository.updateWallObject(params.roomId, params.objectId, {
      updatedByUserId: auth.userId,
      state: normalizedWhiteboardStateUpdate({
        object,
        strokeCount: state.strokeCount + 1,
        clearVersion: state.clearVersion,
        now: createdAt
      })
    });
    const realtimeMessages: WhiteboardRealtimeMessage[] = [
      WhiteboardStrokeCommitMessageV1Schema.parse({
        type: "room.whiteboard.stroke-commit.v1",
        roomId: params.roomId,
        wallObjectId: params.objectId,
        stroke,
        sentAt: Date.now(),
        senderId: auth.userId
      })
    ];
    const compacted = await maybeCompactWhiteboard({
      config,
      repository,
      room,
      object: updatedObject,
      updatedByUserId: auth.userId
    });
    if (compacted) {
      realtimeMessages.push(
        WhiteboardSnapshotReadyMessageV1Schema.parse({
          type: "room.whiteboard.snapshot-ready.v1",
          roomId: params.roomId,
          wallObjectId: params.objectId,
          snapshotKey: compacted.snapshot.storageKey,
          snapshotZ: compacted.snapshot.snapshotZ,
          sentAt: Date.now(),
          senderId: auth.userId
        })
      );
    }
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: "room.whiteboard.stroke-commit.v1",
      payload: { objectId: params.objectId, strokeId: stroke.id, z: stroke.z, tool: stroke.tool },
      createdByUserId: auth.userId
    });
    return CommitWhiteboardStrokeResponseSchema.parse({ stroke, realtimeMessages });
  });

  app.delete("/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/strokes", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const body = parseBody(EraseWhiteboardStrokesRequestSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertWhiteboardsEnabled(room, config);
    const object = await requireWhiteboardObject(repository, params.roomId, params.objectId);
    if (object.status !== "active") throw conflict("Whiteboard is not active");
    await assertWhiteboardWritePolicy({
      repository,
      room,
      auth,
      wallAnchorId: object.wallAnchorId
    });

    const erasedIds = await repository.eraseWhiteboardStrokes(params.roomId, params.objectId, body.strokeIds);
    const remaining = await repository.listWhiteboardStrokes(params.roomId, params.objectId);
    await repository.updateWallObject(params.roomId, params.objectId, {
      updatedByUserId: auth.userId,
      state: normalizedWhiteboardStateUpdate({
        object,
        strokeCount: remaining.length,
        clearVersion: readWhiteboardState(object).clearVersion,
        resetSnapshot: true,
        now: nowIso()
      })
    });
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: "room.whiteboard.stroke-erase.v1",
      payload: { objectId: params.objectId, strokeIds: erasedIds },
      createdByUserId: auth.userId
    });
    return EraseWhiteboardStrokesResponseSchema.parse({
      erasedIds,
      realtimeMessages: erasedIds.length > 0 ? [
        WhiteboardStrokeEraseMessageV1Schema.parse({
          type: "room.whiteboard.stroke-erase.v1",
          roomId: params.roomId,
          wallObjectId: params.objectId,
          strokeIds: erasedIds,
          erasedByUserId: auth.userId,
          sentAt: Date.now(),
          senderId: auth.userId
        })
      ] : []
    });
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/clear", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertWhiteboardsEnabled(room, config);
    const object = await requireWhiteboardObject(repository, params.roomId, params.objectId);
    await assertWallObjectManagePolicy(repository, params.roomId, auth, object);
    const state = readWhiteboardState(object);
    const clearVersion = state.clearVersion + 1;
    await repository.clearWhiteboard(params.roomId, params.objectId);
    const clearedAt = nowIso();
    await repository.updateWallObject(params.roomId, params.objectId, {
      updatedByUserId: auth.userId,
      state: normalizedWhiteboardStateUpdate({
        object,
        strokeCount: 0,
        clearVersion,
        resetSnapshot: true,
        now: clearedAt
      })
    });
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: "room.whiteboard.cleared.v1",
      payload: { objectId: params.objectId, clearVersion },
      createdByUserId: auth.userId
    });
    return ClearWhiteboardResponseSchema.parse({
      clearVersion,
      realtimeMessages: [
        WhiteboardClearedMessageV1Schema.parse({
          type: "room.whiteboard.cleared.v1",
          roomId: params.roomId,
          wallObjectId: params.objectId,
          clearedByUserId: auth.userId,
          clearedAt,
          clearVersion,
          sentAt: Date.now(),
          senderId: auth.userId
        })
      ]
    });
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/snapshots", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertWhiteboardsEnabled(room, config);
    const object = await requireWhiteboardObject(repository, params.roomId, params.objectId);
    await assertWhiteboardWritePolicy({
      repository,
      room,
      auth,
      wallAnchorId: object.wallAnchorId
    });
    const compacted = await maybeCompactWhiteboard({
      config,
      repository,
      room,
      object,
      updatedByUserId: auth.userId,
      force: true
    });
    const snapshot = compacted?.snapshot ?? await repository.latestWhiteboardSnapshot(params.roomId, params.objectId) ?? null;
    return RequestWhiteboardSnapshotResponseSchema.parse({
      snapshot,
      realtimeMessages: compacted ? [
        WhiteboardSnapshotReadyMessageV1Schema.parse({
          type: "room.whiteboard.snapshot-ready.v1",
          roomId: params.roomId,
          wallObjectId: params.objectId,
          snapshotKey: compacted.snapshot.storageKey,
          snapshotZ: compacted.snapshot.snapshotZ,
          sentAt: Date.now(),
          senderId: auth.userId
        })
      ] : []
    });
  });

  // ── Shared browser sessions (Free-for-All rooms) ─────────────────────────

  async function requireSharedBrowserAccess(request: FastifyRequest) {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertWallObjectsEnabled({ settings: room.settings }, config);
    assertSharedBrowsersEnabled(room, config);
    const actor: SharedBrowserActor = { userId: auth.userId, displayName: auth.displayName };
    return { auth, params, room, actor };
  }

  app.get("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser", async (request) => {
    const { params } = await requireSharedBrowserAccess(request);
    const result = await sharedBrowserOrchestrator.hydrate(params.roomId, params.objectId);
    return SharedBrowserSessionResponseSchema.parse(result);
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/navigate", async (request) => {
    const { params, room, actor } = await requireSharedBrowserAccess(request);
    const body = parseBody(SharedBrowserNavigateRequestSchema, request);
    const result = await sharedBrowserOrchestrator.navigate(params.roomId, params.objectId, body.url, actor, room.settings.sharedBrowsers);
    return SharedBrowserSessionResponseSchema.parse(result);
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/history", async (request) => {
    const { params, actor } = await requireSharedBrowserAccess(request);
    const body = parseBody(SharedBrowserHistoryRequestSchema, request);
    const result = await sharedBrowserOrchestrator.history(params.roomId, params.objectId, body.action, actor);
    return SharedBrowserSessionResponseSchema.parse(result);
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/control-lease", async (request) => {
    const { params, room, actor } = await requireSharedBrowserAccess(request);
    const body = parseBody(SharedBrowserControlLeaseRequestSchema, request);
    const result = await sharedBrowserOrchestrator.controlLease(params.roomId, params.objectId, body.action, actor, room.settings.sharedBrowsers);
    return SharedBrowserSessionResponseSchema.parse(result);
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/resume", async (request) => {
    const { params, room, actor } = await requireSharedBrowserAccess(request);
    const result = await sharedBrowserOrchestrator.resume(params.roomId, params.objectId, actor, room.settings.sharedBrowsers);
    return SharedBrowserSessionResponseSchema.parse(result);
  });

  // Dev/QA JPEG fallback. Production renders the LiveKit video track instead; this
  // route only returns frames when SHARED_BROWSER_USE_JPEG_FALLBACK is on.
  app.get("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/frame.jpg", async (request, reply) => {
    const { params } = await requireSharedBrowserAccess(request);
    const session = await repository.getSharedBrowserSessionByWallObject(params.objectId);
    if (!session || session.roomId !== params.roomId) throw notFound("Shared browser session not found");
    const frame = sharedBrowserFrameStore.get(session.id);
    if (!frame) throw notFound("No frame available");
    return reply.header("Content-Type", "image/jpeg").header("Cache-Control", "no-store").send(frame.jpeg);
  });

  app.post("/v1/rooms/:roomId/shared-browser/realtime", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(SharedBrowserPointerBatchSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertWallObjectsEnabled({ settings: room.settings }, config);
    assertSharedBrowsersEnabled(room, config);
    const actor: SharedBrowserActor = { userId: auth.userId, displayName: auth.displayName };
    const result = await sharedBrowserOrchestrator.applyInput(params.roomId, body.wallObjectId, body.pointer, body.keyboard, actor);
    return SharedBrowserRealtimeDispatchResponseSchema.parse(result);
  });

  app.post("/v1/rooms/:roomId/wall-shares", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateWallShareRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertWallObjectsEnabled({ settings: room.settings }, config);
    if ((body.type === "screen.live" || body.type === "browser-tab.live") && !config.tuning.enableWallScreenShare) {
      throw forbidden("Wall screen sharing is disabled");
    }
    await assertAnchorAcceptsType(repository, room, manifest, body.wallAnchorId, body.type);
    await assertAnchorAvailableForNewObject(repository, params.roomId, body.wallAnchorId);
    const { teacher, granted } = await assertWallObjectCreatePolicy({
      repository,
      config,
      room,
      auth,
      wallAnchorId: body.wallAnchorId,
      type: body.type
    });
    await enforceWallObjectLimits(repository, room, body.type);
    const trackSource = liveTrackSourceForWallObjectType(body.type)!;
    const draftObjectId = newId("wallobj");
    const publicationName = `wall:${draftObjectId}`;
    const requestedStatus: WallObject["status"] = teacher || granted ? "active" : room.settings.wallObjectCreation === "student-request" ? "pending_moderation" : "active";
    const object = WallObjectSchema.parse(
      await repository.createWallObject({
        roomId: params.roomId,
        wallAnchorId: body.wallAnchorId,
        type: body.type,
        title: body.title,
        ...(body.description ? { description: body.description } : {}),
        source: {
          kind: "livekit-track",
          participantIdentity: `${auth.userId}:${params.roomId}`,
          participantId: auth.userId,
          trackSource,
          publicationName
        },
        placement: body.placement,
        state: { ...body.state, live: true, waitingForSource: true },
        permissions: {},
        status: requestedStatus,
        moderation: { policy: room.settings.wallObjectModeration },
        createdByUserId: auth.userId,
        updatedByUserId: auth.userId
      })
    );
    const stablePublicationName = `wall:${object.id}`;
    const stabilized =
      object.source.kind === "livekit-track" && object.source.publicationName !== stablePublicationName
        ? await repository.updateWallObject(params.roomId, object.id, {
            source: { ...object.source, publicationName: stablePublicationName },
            updatedByUserId: auth.userId
          })
        : object;
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: "wall.share.started.v1",
      payload: { objectId: stabilized.id, wallAnchorId: stabilized.wallAnchorId, type: stabilized.type, publicationName: stablePublicationName },
      createdByUserId: auth.userId
    });
    return {
      object: stabilized,
      publicationName: stablePublicationName,
      recommendedTrackSource: trackSource
    };
  });

  app.post("/v1/rooms/:roomId/wall-shares/:objectId/end", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const existing = await repository.getWallObject(params.roomId, params.objectId);
    if (!existing) throw notFound("Wall object not found");
    await assertWallObjectManagePolicy(repository, params.roomId, auth, existing);
    const updated = await repository.updateWallObject(params.roomId, params.objectId, {
      status: "source_ended",
      state: { ...existing.state, live: false, endedAt: new Date().toISOString() },
      updatedByUserId: auth.userId
    });
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: "wall.share.ended.v1",
      payload: { objectId: updated.id, wallAnchorId: updated.wallAnchorId, type: updated.type },
      createdByUserId: auth.userId
    });
    return updated;
  });

  app.post("/v1/rooms/:roomId/web-resources/preview", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(WebResourcePreviewRequestSchema, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const url = assertHttpsUrl(body.url);
    const wantsEmbed = body.embedMode === "iframe";
    const embeddable = wantsEmbed && config.tuning.enableWallWebEmbeds && isAllowedEmbedHost(config, url.host);
    return WebResourcePreviewResponseSchema.parse({
      url: url.toString(),
      host: url.host,
      title: url.hostname,
      embedMode: embeddable ? "iframe" : "link",
      embeddable,
      reason: wantsEmbed && !embeddable ? "Embeds require ENABLE_WALL_WEB_EMBEDS and an allowlisted host" : undefined
    });
  });

  app.post("/v1/rooms/:roomId/web-resources", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateWebResourceRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertWallObjectsEnabled({ settings: room.settings }, config);
    if (!room.settings.allowWebLinks || !config.tuning.enableWallWebLinks) throw forbidden("Wall web links are disabled");
    const url = assertHttpsUrl(body.url);
    const embeddable = body.embedMode === "iframe" && room.settings.allowEmbeds && config.tuning.enableWallWebEmbeds && isAllowedEmbedHost(config, url.host);
    const type = embeddable ? "web.embed" : "web.link";
    await assertAnchorAcceptsType(repository, room, manifest, body.wallAnchorId, type);
    await assertAnchorAvailableForNewObject(repository, params.roomId, body.wallAnchorId);
    const { teacher, granted } = await assertWallObjectCreatePolicy({
      repository,
      config,
      room,
      auth,
      wallAnchorId: body.wallAnchorId,
      type
    });
    const requestedStatus = teacher || granted ? "active" : room.settings.wallObjectCreation === "student-direct" ? "active" : "pending_moderation";
    if (requestedStatus === "active") await enforceWallObjectLimits(repository, room, type);
    const object = await repository.createWallObject({
      roomId: params.roomId,
      wallAnchorId: body.wallAnchorId,
      type,
      title: body.title ?? url.hostname,
      ...(body.description ? { description: body.description } : {}),
      source: { kind: "web-url", url: url.toString(), embedMode: embeddable ? "iframe" : "link" },
      placement: body.placement,
      state: {},
      permissions: {},
      status: requestedStatus,
      moderation: { policy: room.settings.wallObjectModeration },
      createdByUserId: auth.userId,
      updatedByUserId: auth.userId
    });
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: "wall.object.created.v1",
      payload: { objectId: object.id, wallAnchorId: object.wallAnchorId, type: object.type, status: object.status },
      createdByUserId: auth.userId
    });
    return object;
  });

  app.get("/v1/rooms/:roomId/classroom", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room, membership } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomTypeSupportsClassroomState(room);
    const actor = await resolveClassroomActor({ repository, room, membership, auth });
    const state = sanitizeClassroomState(await repository.getClassroomState(params.roomId));
    const hydrated = await hydrateClassroomDisplayNames(repository, room.classId, state);
    return filterClassroomStateForActor(hydrated, actor);
  });

  app.post("/v1/rooms/:roomId/classroom/actions", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(ClassroomActionSchema, request);
    const { room, membership } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomTypeSupportsClassroomState(room);
    const actor = await resolveClassroomActor({ repository, room, membership, auth });

    // Global student media toggle also persists to room settings (runtime seeded from settings on join).
    if (body.type === "set-student-media-global") {
      if (!config.tuning.enableStudentMediaPermissions) throw forbidden("Student media permissions are not enabled");
      requireTeacher(actor);
      const current = room.settings.studentMedia ?? { camerasEnabled: true, microphonesEnabled: true };
      const next = body.medium === "camera"
        ? { ...current, camerasEnabled: body.enabled }
        : { ...current, microphonesEnabled: body.enabled };
      await repository.updateRoom(params.roomId, { settings: { studentMedia: next } });
      // fall through to runClassroomAction so studentMediaRuntime is also updated
    }

    // World-skin actions mutate room settings rather than classroom state
    if (body.type === "set-room-skin" || body.type === "set-room-skin-day-night") {
      if (!config.tuning.enableWorldSkins) throw worldSkinsDisabled();
      requireTeacher(actor);
      const ws = room.settings.worldSkins ?? { enabled: true, skinId: null, skinDayNightMode: "day" as const, ambientGainOverride: null };

      if (body.type === "set-room-skin") {
        if (body.skinId !== null) {
          const exists = await repository.getWorldSkin(body.skinId);
          if (!exists) throw notFound("World skin not found");
        }
        await repository.updateRoom(params.roomId, { settings: { worldSkins: { ...ws, skinId: body.skinId } } });
        const msg = RoomSkinMessageSchema.parse({ type: "room.skin.v1", skinId: body.skinId, dayNight: ws.skinDayNightMode, crossfadeMs: 1000 });
        return { skinId: body.skinId, realtimeMessages: [msg] };
      }

      if (body.type === "set-room-skin-day-night") {
        if (ws.skinId !== "roman-forum") throw unprocessableEntity("Day/night mode is only supported for the roman-forum skin");
        await repository.updateRoom(params.roomId, { settings: { worldSkins: { ...ws, skinDayNightMode: body.mode } } });
        const msg = RoomSkinMessageSchema.parse({ type: "room.skin.v1", skinId: ws.skinId, dayNight: body.mode, crossfadeMs: 1000 });
        return { dayNight: body.mode, realtimeMessages: [msg] };
      }
    }

    const state = await runClassroomAction({
      repository,
      roomId: params.roomId,
      classId: room.classId,
      actor,
      action: body,
      lessonsEnabled: config.tuning.enableClassroomLessons,
      breakoutPodsEnabled: config.tuning.enableBreakoutPods,
      studentMediaPermissionsEnabled: config.tuning.enableStudentMediaPermissions,
      roomSettings: room.settings
    });
    const hydrated = await hydrateClassroomDisplayNames(repository, room.classId, sanitizeClassroomState(state));
    return filterClassroomStateForActor(hydrated, actor);
  });

  app.get("/v1/rooms/:roomId/lesson-runs/:runId/recap", async (request, reply) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndRunId, request);
    const { room, membership } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomTypeSupportsClassroomState(room);
    const actor = await resolveClassroomActor({ repository, room, membership, auth });
    requireTeacher(actor);

    const state = sanitizeClassroomState(await repository.getClassroomState(params.roomId));
    const hydrated = await hydrateClassroomDisplayNames(repository, room.classId, state);
    const run = hydrated.lessonRun;
    if (!run || run.id !== params.runId) throw notFound("Lesson run not found");

    const memberships = await repository.listMemberships(room.classId);
    const recap = buildLessonRecap({ memberships, room, state: hydrated, run });

    const format = parseQuery(z.object({ format: z.string().optional() }), request).format;
    if (format === "csv") {
      const displayNameById = new Map(memberships.map((m) => [m.userId, m.displayName]));
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="recap-${run.id}.csv"`)
        .send(renderRecapCsv(recap, displayNameById));
    }
    return recap;
  });

  app.post("/v1/rooms/:roomId/events", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(RoomEventRequestSchema, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const event = await repository.recordRoomEvent({
      roomId: params.roomId,
      type: body.type,
      payload: body.payload,
      createdByUserId: auth.userId
    });
    return {
      id: event.id,
      roomId: event.roomId,
      type: event.type,
      persisted: true,
      createdAt: event.createdAt
    };
  });

  app.get("/v1/room-objects/templates", async (request) => {
    const auth = await requireUser(request, config, repository);
    if (!config.tuning.enableRoomObjects) throw roomObjectDisabled();
    const query = parseQuery(ListRoomObjectTemplatesQuerySchema, request);
    const roomType = query.roomId
      ? (await requireRoomAccess(repository, query.roomId, auth)).room.type
      : undefined;
    const templates = await repository.listRoomObjectTemplatesVisibleTo(auth.userId, roomType);
    return ListRoomObjectTemplatesResponseSchema.parse({ templates });
  });

  app.post("/v1/rooms/:roomId/room-objects/uploads", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateRoomObjectUploadRequestSchema, request);
    const room = await requireRoomTeacher(repository, params.roomId, auth);
    if (!config.tuning.enableRoomObjects) throw roomObjectDisabled();
    assertRoomObjectsEnabled(config, room);
    assertRoomObjectCustomUploadsEnabled(room);
    if (body.kind === "asset" && body.contentType !== "model/gltf-binary") {
      throw roomObjectUploadRejected("Room object assets must be uploaded as .glb files.", {
        reason: "asset_content_type",
        contentType: body.contentType
      });
    }
    if (body.kind === "thumbnail" && body.contentType !== "image/png") {
      throw roomObjectUploadRejected("Room object thumbnails must be uploaded as PNG files.", {
        reason: "thumbnail_content_type",
        contentType: body.contentType
      });
    }
    const storageKey = roomObjectStorageKeyFor({
      classId: room.classId,
      kind: body.kind === "thumbnail" ? "thumbnails" : "assets",
      fileName: body.fileName
    });
    const upload = await createUploadTarget(config, { storageKey, contentType: body.contentType });
    return CreateRoomObjectUploadResponseSchema.parse({
      storageKey,
      assetUrl: roomObjectAssetUrl(config, storageKey),
      upload
    });
  });

  app.post("/v1/room-objects/templates", async (request) => {
    const auth = await requireUser(request, config, repository);
    if (!config.tuning.enableRoomObjects) throw roomObjectDisabled();
    const body = parseBody(CreateRoomObjectTemplateRequestSchema, request);
    const room = await requireRoomTeacher(repository, body.roomId, auth);
    assertRoomObjectsEnabled(config, room);
    assertRoomObjectCustomUploadsEnabled(room);
    if (!body.assetStorageKey.startsWith(roomObjectStoragePrefix(room.classId, "assets"))) {
      throw roomObjectUploadRejected("Uploaded .glb does not belong to this class.", {
        reason: "asset_storage_scope"
      });
    }
    if (!body.thumbnailStorageKey.startsWith(roomObjectStoragePrefix(room.classId, "thumbnails"))) {
      throw roomObjectUploadRejected("Uploaded thumbnail does not belong to this class.", {
        reason: "thumbnail_storage_scope"
      });
    }
    const assetObject = await readStoredObject(config, { storageKey: body.assetStorageKey });
    if (!assetObject) throw notFound("Uploaded .glb not found");
    const thumbnailObject = await readStoredObject(config, { storageKey: body.thumbnailStorageKey });
    if (!thumbnailObject) throw notFound("Uploaded thumbnail not found");

    const validation = await validateCustomRoomObjectAsset({
      bytes: assetObject.body,
      maxUploadSizeBytes: room.settings.roomObjects.maxUploadSizeBytes
    });
    validateCustomRoomObjectThumbnail({
      bytes: thumbnailObject.body,
      contentType: thumbnailObject.contentType
    });

    const template = await repository.createRoomObjectTemplate({
      slug: buildRoomObjectTemplateSlug(body.displayName, body.slug),
      displayName: body.displayName,
      category: body.category,
      description: body.description,
      assetUrl: roomObjectAssetUrl(config, body.assetStorageKey),
      thumbnailUrl: roomObjectAssetUrl(config, body.thumbnailStorageKey),
      defaultPose: body.defaultPose ?? {
        position: { x: 0, y: 1.1, z: 0 },
        rotation: { yaw: 0, pitch: 0, roll: 0 }
      },
      defaultScale: body.defaultScale,
      ...(body.defaultColorTintHex ? { defaultColorTintHex: body.defaultColorTintHex } : {}),
      defaultParameters: body.defaultParameters,
      parameterSchemaJson: body.parameterSchemaJson,
      recommendedTouchPolicy: room.settings.roomObjects.defaultTouchPolicy,
      kinematic: false,
      ownerClassId: room.classId,
      visibleRoomTypes: [room.type],
      source: "custom",
      license: body.license,
      attribution: body.attribution,
      renderer: "gltf",
      exportable: body.exportable,
      fileSizeBytes: validation.fileSizeBytes,
      triangleCount: validation.triangleCount
    });
    return CreateRoomObjectTemplateResponseSchema.parse({ template });
  });

  app.get("/v1/room-objects/templates/:templateId", async (request) => {
    const auth = await requireUser(request, config, repository);
    if (!config.tuning.enableRoomObjects) throw roomObjectDisabled();
    const params = parseParams(ParamsWithTemplateId, request);
    const query = parseQuery(GetRoomObjectTemplateQuerySchema, request);
    const { room } = await requireRoomAccess(repository, query.roomId, auth);
    const template = await repository.getRoomObjectTemplate(params.templateId);
    if (!template) throw notFound("Room object template not found");
    await assertRoomObjectTemplateResolvable(repository, auth, template, room);
    return RoomObjectTemplateSchema.parse(template);
  });

  app.delete("/v1/room-objects/templates/:templateId", async (request) => {
    const auth = await requireUser(request, config, repository);
    if (!config.tuning.enableRoomObjects) throw roomObjectDisabled();
    const params = parseParams(ParamsWithTemplateId, request);
    const template = await repository.getRoomObjectTemplate(params.templateId);
    if (!template) throw notFound("Room object template not found");
    if (template.source !== "custom" || !template.ownerClassId) {
      throw notImplemented("Only custom templates can be archived in this release");
    }
    await requireClassTeacher(repository, template.ownerClassId, auth);
    const archived = await repository.archiveRoomObjectTemplate(params.templateId);
    return RoomObjectTemplateSchema.parse(archived);
  });

  app.get("/v1/rooms/:roomId/objects", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const query = parseQuery(ListRoomObjectsQuerySchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomObjectsEnabled(config, room);
    const objects = await repository.listRoomObjectsForRoom(params.roomId, { status: query.status });
    return ListRoomObjectsResponseSchema.parse({ objects });
  });

  app.post("/v1/rooms/:roomId/objects", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateRoomObjectRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomObjectsEnabled(config, room);
    await requireRoomTeacher(repository, params.roomId, auth);
    const template = await repository.getRoomObjectTemplate(body.templateId);
    if (!template) throw notFound("Room object template not found");
    assertRoomObjectTemplateVisibleForRoomType(template, room);
    await enforceActiveRoomObjectCap(repository, room);
    const pose = clampRoomObjectPose(manifest, body.pose ?? template.defaultPose);
    const scale = clampRoomObjectScale(body.scale ?? template.defaultScale, template);
    const object = RoomObjectSchema.parse(
      await repository.createRoomObject({
        roomId: params.roomId,
        templateId: template.id,
        displayName: body.displayName ?? template.displayName,
        pose,
        scale,
        ...(body.colorTintHex !== undefined
          ? { colorTintHex: body.colorTintHex }
          : template.defaultColorTintHex
            ? { colorTintHex: template.defaultColorTintHex }
            : {}),
        parameters: body.parameters ?? template.defaultParameters,
        touchPolicy: body.touchPolicy ?? template.recommendedTouchPolicy,
        grantedUserIds: [],
        grantedGroupIds: [],
        status: "active",
        createdByUserId: auth.userId
      })
    );
    const realtimeMessages = [
      buildRoomObjectUpsertMessage({ roomId: params.roomId, object, senderId: auth.userId })
    ];
    return { ...CreateRoomObjectResponseSchema.parse({ object }), realtimeMessages };
  });

  app.post("/v1/rooms/:roomId/room-objects/realtime", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const inbound = parseBody(RoomObjectRealtimeInboundSchema, request);
    const access = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomObjectsEnabled(config, access.room);
    const messages = await dispatchRoomObjectRealtimeMessage(
      {
        repository,
        grabLock: roomObjectGrabLock,
        config,
        roomId: params.roomId,
        manifest: access.manifest,
        auth,
        membership: access.membership,
        sentAt: Date.now()
      },
      inbound
    );
    return RoomObjectRealtimeDispatchResponseSchema.parse({ messages });
  });

  app.patch("/v1/rooms/:roomId/objects/:objectId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const body = parseBody(UpdateRoomObjectRequestSchema, request);
    const { room, manifest, membership } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomObjectsEnabled(config, room);
    const existing = await requireRoomObject(repository, params.roomId, params.objectId);
    const template = await repository.getRoomObjectTemplate(existing.templateId);
    if (!template) throw notFound("Room object template not found");
    const { teacher } = await actorIsRoomTeacher(repository, params.roomId, auth);
    if (!teacher) {
      if (!membership) throw forbidden("Class membership required");
      await assertCanTouchRoomObject(repository, params.roomId, existing, auth, membership);
      if (!studentPatchKeysOnly(body)) throw roomObjectTouchDenied();
      if (existing.status === "locked" && (body.pose !== undefined || body.scale !== undefined)) {
        assertRoomObjectNotLocked(existing);
      }
    }
    if (body.status === "locked") {
      roomObjectGrabLock.release(params.objectId);
    }
    const patch: Parameters<Repository["updateRoomObject"]>[2] = {};
    if (body.displayName !== undefined) patch.displayName = body.displayName;
    if (body.pose !== undefined) patch.pose = clampRoomObjectPose(manifest, body.pose);
    if (body.scale !== undefined) patch.scale = clampRoomObjectScale(body.scale, template);
    if (body.colorTintHex !== undefined) patch.colorTintHex = body.colorTintHex;
    if (body.parameters !== undefined) patch.parameters = body.parameters;
    if (body.touchPolicy !== undefined) patch.touchPolicy = body.touchPolicy;
    if (body.status !== undefined) patch.status = body.status;
    const updated = RoomObjectSchema.parse(await repository.updateRoomObject(params.roomId, params.objectId, patch));
    if (roomObjectGrabLock.get(params.objectId) && (body.pose !== undefined || body.scale !== undefined)) {
      roomObjectGrabLock.release(params.objectId);
    }
    return {
      ...updated,
      realtimeMessages: [buildRoomObjectUpsertMessage({ roomId: params.roomId, object: updated, senderId: auth.userId })]
    };
  });

  app.delete("/v1/rooms/:roomId/objects/:objectId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomObjectsEnabled(config, room);
    await requireRoomTeacher(repository, params.roomId, auth);
    await requireRoomObject(repository, params.roomId, params.objectId);
    roomObjectGrabLock.release(params.objectId);
    const removed = RoomObjectSchema.parse(await repository.removeRoomObject(params.roomId, params.objectId));
    return {
      ...removed,
      realtimeMessages: [
        buildRoomObjectRemoveMessage({ roomId: params.roomId, objectId: params.objectId, senderId: auth.userId })
      ]
    };
  });

  app.post("/v1/rooms/:roomId/objects/:objectId/touch", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const body = parseBody(RoomObjectTouchRequestSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomObjectsEnabled(config, room);
    await requireRoomTeacher(repository, params.roomId, auth);
    const existing = await requireRoomObject(repository, params.roomId, params.objectId);
    const previousGrantees = new Set(existing.grantedUserIds);
    const updated = RoomObjectSchema.parse(
      await repository.updateRoomObject(params.roomId, params.objectId, {
        touchPolicy: body.touchPolicy,
        grantedUserIds: body.userIds,
        grantedGroupIds: body.groupIds
      })
    );
    const realtimeMessages: RoomObjectRealtimeMessage[] = [
      buildRoomObjectTouchMessage({ roomId: params.roomId, object: updated, senderId: auth.userId })
    ];
    for (const userId of previousGrantees) {
      if (!body.userIds.includes(userId)) {
        const forced = await forceReleaseRoomObjectGrab({
          repository,
          grabLock: roomObjectGrabLock,
          roomId: params.roomId,
          objectId: params.objectId,
          holderUserId: userId,
          senderId: auth.userId
        });
        realtimeMessages.push(...forced);
      }
    }
    return { ...updated, realtimeMessages };
  });

  // ── AI 3D Object Generator ────────────────────────────────────────────────

  if (config.tuning.enableAiObjectGeneration) {
    startAiObjectRetentionReaper(config, repository);
  }

  const ParamsWithJobId = z.object({ roomId: z.string(), jobId: z.string() });

  app.post("/v1/rooms/:roomId/ai-objects/jobs", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(StartAiObjectJobRequestSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);

    try {
      const result = await startAiObjectJob(
        {
          ...body,
          roomId: params.roomId,
          userId: auth.userId,
          roomClassId: room.classId,
          roomType: room.type,
          roomSettings: {
            aiObjects: room.settings.aiObjects!,
            roomObjects: room.settings.roomObjects
          }
        },
        config,
        repository
      );
      return StartAiObjectJobResponseSchema.parse(result);
    } catch (err: unknown) {
      const e = err as Error & { code?: string; reason?: string };
      if (e.code === "quota_exceeded") {
        throw tooManyRequests(`Quota exceeded: ${e.reason ?? "unknown"}`);
      }
      if (e.code === "prompt_too_long") throw badRequest("Prompt exceeds maximum length");
      throw err;
    }
  });

  app.get("/v1/rooms/:roomId/ai-objects/jobs", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    const jobs = await repository.listAiObjectJobsForRoom(params.roomId, { limit: 20 });
    return ListAiObjectJobsResponseSchema.parse({ jobs });
  });

  app.get("/v1/rooms/:roomId/ai-objects/jobs/:jobId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithJobId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    const job = await repository.getAiObjectJob(params.jobId);
    if (!job || job.roomId !== params.roomId) throw notFound("AI object job not found");
    return AiObjectJobSchema.parse(job);
  });

  app.patch("/v1/rooms/:roomId/ai-objects/jobs/:jobId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithJobId, request);
    const body = parseBody(PatchAiObjectJobRequestSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    if (body.action === "cancel") {
      const result = await cancelAiObjectJob(params.jobId, params.roomId, auth.userId, config, repository);
      return { job: AiObjectJobSchema.parse(result.job), realtimeMessages: result.realtimeMessages };
    }
    throw badRequest("Unknown action");
  });

  app.delete("/v1/rooms/:roomId/ai-objects/jobs/:jobId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithJobId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    const result = await deleteAiObjectJob(params.jobId, params.roomId, auth.userId, config, repository);
    return { deleted: true, realtimeMessages: result.realtimeMessages };
  });

  app.get("/v1/rooms/:roomId/ai-objects/jobs/:jobId/object.glb", async (request, reply) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithJobId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    const job = await repository.getAiObjectJob(params.jobId);
    if (!job || job.roomId !== params.roomId || !job.glbStorageKey) throw notFound("Job not found or not ready");
    const object = await readStoredObject(config, { storageKey: job.glbStorageKey });
    if (!object) throw notFound("Object not found in storage");
    const filename = aiObjectDownloadFilename(job as AiObjectJob);
    return reply
      .header("Content-Type", "model/gltf-binary")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(object.body);
  });

  app.post("/v1/rooms/:roomId/ai-objects/jobs/:jobId/place", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithJobId, request);
    const body = parseBody(PlaceAiObjectRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    assertRoomObjectsEnabled(config, room);
    const job = await repository.getAiObjectJob(params.jobId);
    if (!job || job.roomId !== params.roomId || !job.templateId) throw notFound("Job not ready for placement");
    const template = await repository.getRoomObjectTemplate(job.templateId);
    if (!template) throw notFound("AI object template not found");
    await enforceActiveRoomObjectCap(repository, room);
    const pose = clampRoomObjectPose(manifest, body.position
      ? { position: body.position, rotation: body.rotation ?? { yaw: 0, pitch: 0, roll: 0 } }
      : template.defaultPose
    );
    const object = RoomObjectSchema.parse(
      await repository.createRoomObject({
        roomId: params.roomId,
        templateId: template.id,
        displayName: template.displayName,
        pose,
        scale: template.defaultScale,
        parameters: template.defaultParameters,
        touchPolicy: template.recommendedTouchPolicy,
        grantedUserIds: [],
        grantedGroupIds: [],
        status: "active",
        createdByUserId: auth.userId
      })
    );
    const realtimeMessages = [buildRoomObjectUpsertMessage({ roomId: params.roomId, object, senderId: auth.userId })];
    return PlaceAiObjectResponseSchema.parse({ object, template, realtimeMessages });
  });

  // ── End AI 3D Object Generator ────────────────────────────────────────────

  app.post("/v1/rooms/:roomId/objects/:objectId/reset", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const { room, manifest, membership } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomObjectsEnabled(config, room);
    const existing = await requireRoomObject(repository, params.roomId, params.objectId);
    const template = await repository.getRoomObjectTemplate(existing.templateId);
    if (!template) throw notFound("Room object template not found");
    const { teacher } = await actorIsRoomTeacher(repository, params.roomId, auth);
    if (!teacher) {
      if (!membership) throw forbidden("Class membership required");
      await assertCanTouchRoomObject(repository, params.roomId, existing, auth, membership);
    }
    const object = RoomObjectSchema.parse(
      await repository.updateRoomObject(params.roomId, params.objectId, {
        pose: clampRoomObjectPose(manifest, template.defaultPose),
        scale: clampRoomObjectScale(template.defaultScale, template),
        parameters: template.defaultParameters,
        ...(template.defaultColorTintHex ? { colorTintHex: template.defaultColorTintHex } : { colorTintHex: undefined })
      })
    );
    roomObjectGrabLock.release(params.objectId);
    return {
      ...RoomObjectResetResponseSchema.parse({ object }),
      realtimeMessages: [buildRoomObjectUpsertMessage({ roomId: params.roomId, object, senderId: auth.userId })]
    };
  });

  return app;
}
