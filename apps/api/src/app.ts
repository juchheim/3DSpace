import cors from "@fastify/cors";
import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z, type ZodTypeAny } from "zod";
import {
  AcceptInviteResponseSchema,
  CreateClassRequestSchema,
  CreateInviteRequestSchema,
  CreateRoomRequestSchema,
  CreateWallObjectRequestSchema,
  CreateWallShareRequestSchema,
  CreateWallAttachmentRequestSchema,
  CreateWebResourceRequestSchema,
  DeleteRoomResponseSchema,
  FinalizeWallAttachmentRequestSchema,
  HealthResponseSchema,
  JoinRoomSessionRequestSchema,
  ListWallObjectsQuerySchema,
  RoomEventRequestSchema,
  RoomSessionResponseSchema,
  RoomWithManifestSchema,
  UpdateClassRequestSchema,
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
  type WallAttachment,
  type WallObject,
  type WallObjectType,
  type RoomSettings
} from "@3dspace/contracts";
import { createDefaultRoomManifest } from "@3dspace/room-engine";
import { authenticate, type AuthContext } from "./auth.js";
import { loadConfig, livekitConfigured, storageConfigured, type AppConfig } from "./config.js";
import { badRequest, conflict, forbidden, HttpError, notFound, tooManyRequests } from "./errors.js";
import { connectMongo, MongoRepository } from "./models/mongoose.js";
import { MemoryRepository, newId, type Repository } from "./repository.js";
import { mintLiveKitToken } from "./services/livekit.js";
import { createDownloadTarget, createUploadTarget, storageKeyFor } from "./services/storage.js";

type BuildAppOptions = {
  config?: AppConfig;
  repository?: Repository;
};

const ParamsWithClassId = z.object({ classId: z.string() });
const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndAttachmentId = z.object({ roomId: z.string(), attachmentId: z.string() });
const ParamsWithRoomAndObjectId = z.object({ roomId: z.string(), objectId: z.string() });
const ParamsWithInviteCode = z.object({ inviteCode: z.string() });
const ParamsWithDevStorageKey = z.object({ storageKey: z.string() });
const SESSION_JOIN_RATE_LIMIT_WINDOW_MS = 60_000;

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
  return { room, manifest, membership: access.membership };
}

async function requireRoomTeacher(repository: Repository, roomId: string, auth: AuthContext) {
  const room = await repository.getRoom(roomId);
  if (!room) throw notFound("Room not found");
  await requireClassTeacher(repository, room.classId, auth);
  return room;
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
    maxActiveLiveShares: config.tuning.wallObjectMaxActiveLiveShares
  };
}

function fileKindForWallObjectType(type: WallObjectType) {
  if (type === "image.file") return "image" as const;
  if (type === "video.file") return "video" as const;
  if (type === "audio.file") return "audio" as const;
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

function assertAnchorAcceptsType(manifest: Awaited<ReturnType<Repository["getActiveManifest"]>>, wallAnchorId: string, type: WallObjectType) {
  const anchor = manifest?.wallAnchors.find((candidate) => candidate.id === wallAnchorId);
  if (!anchor) throw badRequest("wallAnchorId does not exist in room manifest");

  const accepts = Array.isArray(anchor.metadata.accepts) ? anchor.metadata.accepts.map(String) : [];
  if (accepts.length === 0 || accepts.includes(type) || accepts.includes("future")) return anchor;

  const broadKind = baseAcceptedKind(type);
  if (accepts.includes(broadKind)) return anchor;

  throw badRequest(`Wall anchor does not accept ${type}`);
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

async function assertWallObjectCreatePolicy(input: {
  repository: Repository;
  config: AppConfig;
  room: { id: string; settings: RoomSettings };
  auth: AuthContext;
  type: WallObjectType;
}) {
  const { teacher } = await actorIsRoomTeacher(input.repository, input.room.id, input.auth);
  if (teacher) return { teacher };

  if (input.room.settings.wallObjectCreation === "teacher-only") throw forbidden("Teacher role required to create wall objects");
  const isFile = Boolean(fileKindForWallObjectType(input.type));
  const isLive = isLiveWallObjectType(input.type);
  if (isFile && !input.room.settings.allowStudentUploads) throw forbidden("Student wall uploads are disabled");
  if (isLive && !input.room.settings.allowLiveStudentShares) throw forbidden("Student live wall shares are disabled");
  return { teacher };
}

async function assertWallObjectManagePolicy(repository: Repository, roomId: string, auth: AuthContext, object: WallObject) {
  const { teacher } = await actorIsRoomTeacher(repository, roomId, auth);
  if (teacher) return { teacher };
  if (object.createdByUserId === auth.userId && ["draft", "pending_upload", "pending_moderation", "source_ended"].includes(object.status)) {
    return { teacher };
  }
  throw forbidden("Teacher role required to manage this wall object");
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

  if (["note", "poll", "timer", "whiteboard"].includes(input.type)) {
    if (input.source.kind !== "inline") throw badRequest(`${input.type} requires an inline source`);
  }
}

async function enforceWallObjectLimits(repository: Repository, room: { id: string; settings: RoomSettings }, type: WallObjectType) {
  const active = await repository.listWallObjects(room.id, { status: "active" });
  if (active.length >= room.settings.maxActiveWallObjects) {
    throw conflict("Room has reached the active wall object limit");
  }
  if (isLiveWallObjectType(type)) {
    const activeLive = active.filter((object) => isLiveWallObjectType(object.type));
    if (activeLive.length >= room.settings.maxActiveLiveShares) {
      throw conflict("Room has reached the active live wall share limit");
    }
  }
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const repository = options.repository ?? (await buildRepository(config));
  const sessionJoinAttempts = new Map<string, { count: number; resetAt: number }>();
  const devStorage = new Map<string, { body: Buffer; contentType: string }>();
  const app = fastify({ logger: config.nodeEnv !== "test" });

  app.addContentTypeParser(
    /^(image|video|audio)\//,
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
      if (!origin || config.corsAllowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed: ${origin}`), false);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-dev-user-id", "x-dev-user-name", "x-dev-user-role"]
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      void reply.status(error.statusCode).send({ error: error.code, message: error.message });
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

  app.put("/dev-upload/:storageKey", async (request, reply) => {
    if (storageConfigured(config)) throw notFound("Development upload fallback is disabled");
    const params = parseParams(ParamsWithDevStorageKey, request);
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from("");
    devStorage.set(params.storageKey, {
      body,
      contentType: String(request.headers["content-type"] ?? "application/octet-stream")
    });
    return reply.status(204).send();
  });

  app.get("/dev-download/:storageKey", async (request, reply) => {
    if (storageConfigured(config)) throw notFound("Development download fallback is disabled");
    const params = parseParams(ParamsWithDevStorageKey, request);
    const object = devStorage.get(params.storageKey);
    if (!object) throw notFound("Development object not found");
    return reply.header("content-type", object.contentType).send(object.body);
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
    const roomId = newId("room");
    const manifest = createDefaultRoomManifest({
      roomId,
      name: body.name,
      config: {
        maxParticipants: config.tuning.maxRoomParticipants,
        avatarSendHz: config.tuning.avatarSendHz,
        interpolationMs: config.tuning.interpolationMs,
        defaultQuality: config.tuning.defaultQuality,
        enable2DAnalog: config.tuning.enable2DAnalog,
        enableWallAttachments: config.tuning.enableWallAttachments,
        spatialAudio: config.tuning.spatialAudio
      }
    });
    return RoomWithManifestSchema.parse(
      await repository.createRoom({
        classId: body.classId,
        name: body.name,
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

    const manifest = await repository.getActiveManifest(room.id);
    if (!manifest) throw notFound("Room manifest not found");
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

    return RoomSessionResponseSchema.parse({
      token,
      livekitUrl: config.livekitUrl,
      participantIdentity,
      participantId: auth.userId,
      role: membership.role,
      room,
      manifest,
      capabilities: manifest.capabilities,
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
    if (!manifest.wallAnchors.some((anchor) => anchor.id === body.wallAnchorId)) {
      throw badRequest("wallAnchorId does not exist in room manifest");
    }
    validateAttachmentPolicy(config, body);
    const { teacher } = await actorIsRoomTeacher(repository, params.roomId, auth);
    if (!teacher && (room.settings.wallObjectCreation === "teacher-only" || !room.settings.allowStudentUploads)) {
      throw forbidden("Student wall uploads are disabled");
    }
    const storageKey = storageKeyFor({ roomId: params.roomId, wallAnchorId: body.wallAnchorId, fileName: body.fileName });
    const upload = await createUploadTarget(config, { storageKey, contentType: body.contentType });
    const publicUrl = config.objectStorage.publicBaseUrl ? `${config.objectStorage.publicBaseUrl.replace(/\/$/, "")}/${storageKey}` : undefined;
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
    assertAnchorAcceptsType(manifest, body.wallAnchorId, body.type);
    const { teacher } = await assertWallObjectCreatePolicy({ repository, config, room, auth, type: body.type });
    const requestedStatus = teacher ? body.status ?? "active" : room.settings.wallObjectCreation === "student-direct" ? "active" : "pending_moderation";
    if (requestedStatus === "active") await enforceWallObjectLimits(repository, room, body.type);
    await validateWallObjectSource({ repository, roomId: params.roomId, type: body.type, source: body.source, requestedStatus });
    const object = WallObjectSchema.parse(
      await repository.createWallObject({
        roomId: params.roomId,
        wallAnchorId: body.wallAnchorId,
        type: body.type,
        title: body.title,
        ...(body.description ? { description: body.description } : {}),
        source: body.source,
        placement: body.placement,
        state: body.state,
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
    if (body.placement) assertAnchorAcceptsType(manifest, existing.wallAnchorId, existing.type);
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
    await repository.recordRoomEvent({
      roomId: params.roomId,
      type: "wall.object.removed.v1",
      payload: { objectId: updated.id, wallAnchorId: updated.wallAnchorId, type: updated.type },
      createdByUserId: auth.userId
    });
    return updated;
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/control", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const body = parseBody(WallObjectControlRequestSchema, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const existing = await repository.getWallObject(params.roomId, params.objectId);
    if (!existing) throw notFound("Wall object not found");
    const { teacher } = await assertWallObjectManagePolicy(repository, params.roomId, auth, existing);
    if ((body.action === "approve" || body.action === "reject" || body.action === "lock" || body.action === "unlock") && !teacher) {
      throw forbidden("Teacher role required for wall object moderation");
    }
    let status = existing.status;
    const state = { ...existing.state };
    const permissions = { ...existing.permissions };
    const moderation = { ...existing.moderation };

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
        body.action === "stop-share"
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

  app.post("/v1/rooms/:roomId/wall-shares", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateWallShareRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertWallObjectsEnabled({ settings: room.settings }, config);
    if ((body.type === "screen.live" || body.type === "browser-tab.live") && !config.tuning.enableWallScreenShare) {
      throw forbidden("Wall screen sharing is disabled");
    }
    assertAnchorAcceptsType(manifest, body.wallAnchorId, body.type);
    const { teacher } = await assertWallObjectCreatePolicy({ repository, config, room, auth, type: body.type });
    await enforceWallObjectLimits(repository, room, body.type);
    const trackSource = liveTrackSourceForWallObjectType(body.type)!;
    const draftObjectId = newId("wallobj");
    const publicationName = `wall:${draftObjectId}`;
    const requestedStatus: WallObject["status"] = teacher ? "active" : room.settings.wallObjectCreation === "student-request" ? "pending_moderation" : "active";
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
    assertAnchorAcceptsType(manifest, body.wallAnchorId, type);
    const { teacher } = await assertWallObjectCreatePolicy({ repository, config, room, auth, type });
    const requestedStatus = teacher ? "active" : room.settings.wallObjectCreation === "student-direct" ? "active" : "pending_moderation";
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

  return app;
}
