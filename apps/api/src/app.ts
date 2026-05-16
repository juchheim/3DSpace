import cors from "@fastify/cors";
import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z, type ZodTypeAny } from "zod";
import {
  AcceptInviteResponseSchema,
  CreateClassRequestSchema,
  CreateInviteRequestSchema,
  CreateRoomRequestSchema,
  CreateWallAttachmentRequestSchema,
  HealthResponseSchema,
  JoinRoomSessionRequestSchema,
  RoomEventRequestSchema,
  RoomSessionResponseSchema,
  RoomWithManifestSchema,
  UpdateClassRequestSchema,
  UpdateRoomRequestSchema,
  UpsertClassMemberRequestSchema,
  WallAttachmentDownloadResponseSchema,
  createOpenApiDocument
} from "@3dspace/contracts";
import { createDefaultRoomManifest } from "@3dspace/room-engine";
import { authenticate, type AuthContext } from "./auth";
import { loadConfig, livekitConfigured, storageConfigured, type AppConfig } from "./config";
import { badRequest, conflict, forbidden, HttpError, notFound, tooManyRequests } from "./errors";
import { connectMongo, MongoRepository } from "./models/mongoose";
import { MemoryRepository, newId, type Repository } from "./repository";
import { mintLiveKitToken } from "./services/livekit";
import { createDownloadTarget, createUploadTarget, storageKeyFor } from "./services/storage";

type BuildAppOptions = {
  config?: AppConfig;
  repository?: Repository;
};

const ParamsWithClassId = z.object({ classId: z.string() });
const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndAttachmentId = z.object({ roomId: z.string(), attachmentId: z.string() });
const ParamsWithInviteCode = z.object({ inviteCode: z.string() });
const SESSION_JOIN_RATE_LIMIT_WINDOW_MS = 60_000;

function parseBody<T extends ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> {
  return schema.parse(request.body ?? {});
}

function parseParams<T extends ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> {
  return schema.parse(request.params ?? {});
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
    enableWallAttachments: config.tuning.enableWallAttachments
  };
}

async function buildRepository(config: AppConfig) {
  if (!config.mongoUri) {
    return new MemoryRepository();
  }

  const connection = await connectMongo(config.mongoUri, config.mongoDbName);
  return new MongoRepository(connection);
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const repository = options.repository ?? (await buildRepository(config));
  const sessionJoinAttempts = new Map<string, { count: number; resetAt: number }>();
  const app = fastify({ logger: config.nodeEnv !== "test" });

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
    }
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
    const { manifest } = await requireRoomAccess(repository, params.roomId, auth);
    if (!manifest.wallAnchors.some((anchor) => anchor.id === body.wallAnchorId)) {
      throw badRequest("wallAnchorId does not exist in room manifest");
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

  app.get("/v1/rooms/:roomId/attachments/:attachmentId/download", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndAttachmentId, request);
    await requireRoomAccess(repository, params.roomId, auth);
    const attachment = await repository.getAttachment(params.roomId, params.attachmentId);
    if (!attachment) throw notFound("Attachment not found");
    const download = await createDownloadTarget(config, { storageKey: attachment.storageKey });
    return WallAttachmentDownloadResponseSchema.parse({ attachment, download });
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
