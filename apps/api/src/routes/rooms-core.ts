import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  applyDefaultWallAnchorDimensions,
  createDefaultRoomManifest,
  createFreeForAllManifest,
  createWorkforceTrainingManifest
} from "@3dspace/room-engine";
import {
  CreateRoomRequestSchema,
  CreateWallAttachmentRequestSchema,
  DeleteRoomResponseSchema,
  FinalizeWallAttachmentRequestSchema,
  JoinRoomSessionRequestSchema,
  RoomSessionResponseSchema,
  RoomWithManifestSchema,
  UpdateRoomRequestSchema,
  UpdateWallAttachmentRequestSchema,
  WallAttachmentDownloadResponseSchema,
  type RoomType
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireClassTeacher, requireRoomAccess, requireRoomTeacher, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";
import { conflict, forbidden, notFound } from "../errors.js";
import { newId } from "../repository.js";
import { mintLiveKitToken } from "../services/livekit.js";
import { createDownloadTarget, createUploadTarget, storageKeyFor } from "../services/storage.js";
import { assertFreeForAllPassword } from "../free-for-all/password.js";
import { roomSettings } from "../rooms-core/settings.js";
import {
  actorIsRoomTeacher,
  assertWallObjectsEnabled,
  getApplicableBoardGrant,
  validateAttachmentPolicy,
  wallObjectTypeForAttachmentKind
} from "../policy/wall-objects.js";
import { assertAnchorExists } from "../policy/wall-anchors.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndAttachmentId = z.object({ roomId: z.string(), attachmentId: z.string() });

export async function registerRoomsCoreRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

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
    ctx.sessionRateLimiter.enforce(auth.userId, room.id);
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

  app.post("/v1/rooms/:roomId/session/heartbeat", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    const membership = await repository.getMembership(room.classId, auth.userId);
    if (!membership || membership.status !== "active") throw forbidden("Active room membership required");
    const participantIdentity = `${auth.userId}:${room.id}`;
    await repository.recordRoomSession({
      roomId: room.id,
      participantIdentity,
      userId: auth.userId,
      role: membership.role,
      maxParticipants: room.settings.maxParticipants
    });
    return { ok: true as const };
  });

  app.delete("/v1/rooms/:roomId/session", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    await requireRoomAccess(repository, params.roomId, auth);
    await repository.releaseRoomSession(params.roomId, `${auth.userId}:${params.roomId}`);
    return { ok: true as const };
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
}
