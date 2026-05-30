import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateRoomObjectRequestSchema,
  CreateRoomObjectResponseSchema,
  CreateRoomObjectTemplateRequestSchema,
  CreateRoomObjectTemplateResponseSchema,
  CreateRoomObjectUploadRequestSchema,
  CreateRoomObjectUploadResponseSchema,
  GetRoomObjectTemplateQuerySchema,
  ListRoomObjectTemplatesQuerySchema,
  ListRoomObjectTemplatesResponseSchema,
  ListRoomObjectsQuerySchema,
  ListRoomObjectsResponseSchema,
  RoomObjectRealtimeDispatchResponseSchema,
  RoomObjectRealtimeInboundSchema,
  RoomObjectResetResponseSchema,
  RoomObjectSchema,
  RoomObjectTemplateSchema,
  RoomObjectTouchRequestSchema,
  UpdateRoomObjectRequestSchema,
  type RoomObjectRealtimeMessage,
  type RoomSettings,
  type RoomType
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import type { AuthContext } from "../auth.js";
import { requireClassTeacher, requireRoomAccess, requireRoomTeacher, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams, parseQuery } from "../http/parse.js";
import {
  badRequest,
  forbidden,
  notFound,
  notImplemented,
  roomObjectDisabled,
  roomObjectTouchDenied,
  roomObjectUploadRejected
} from "../errors.js";
import type { Repository } from "../repository.js";
import { actorIsRoomTeacher } from "../policy/wall-objects.js";
import {
  assertCanTouchRoomObject,
  assertRoomObjectNotLocked,
  assertRoomObjectsEnabled,
  clampRoomObjectPose,
  clampRoomObjectScale,
  enforceActiveRoomObjectCap,
  requireRoomObject,
  studentPatchKeysOnly
} from "../room-objects/helpers.js";
import {
  buildRoomObjectRemoveMessage,
  buildRoomObjectTouchMessage,
  buildRoomObjectUpsertMessage
} from "../room-objects/realtime-outbox.js";
import {
  dispatchRoomObjectRealtimeMessage,
  forceReleaseRoomObjectGrab
} from "../room-objects/realtime-dispatch.js";
import {
  buildRoomObjectTemplateSlug,
  validateCustomRoomObjectAsset,
  validateCustomRoomObjectThumbnail
} from "../room-objects/custom-template-upload.js";
import {
  createUploadTarget,
  readStoredObject,
  roomObjectAssetUrl,
  roomObjectStorageKeyFor
} from "../services/storage.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndObjectId = z.object({ roomId: z.string(), objectId: z.string() });
const ParamsWithTemplateId = z.object({ templateId: z.string() });

function assertRoomObjectCustomUploadsEnabled(room: { settings: RoomSettings }) {
  if (room.settings.roomObjects?.customUploadsEnabled !== true) {
    throw forbidden("Custom room object uploads are disabled for this room");
  }
}

function roomObjectStoragePrefix(classId: string, kind: "assets" | "thumbnails") {
  return `room-objects/classes/${classId}/${kind}/`;
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

export async function registerRoomObjectRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository, roomObjectGrabLock } = ctx;

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

}
