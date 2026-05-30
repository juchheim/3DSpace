import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createInitialPollState,
  isValidPollChoiceId,
  normalizePollInlineData,
  readPollState,
  validateDynamicBoardPlacement
} from "@3dspace/room-engine";
import {
  CreateDynamicWallAnchorRequestSchema,
  CreateWallObjectRequestSchema,
  CreateWallShareRequestSchema,
  CreateWebResourceRequestSchema,
  DynamicWallAnchorSchema,
  ListWallObjectsQuerySchema,
  RoomBoardCreatedMessageV1Schema,
  RoomBoardRemovedMessageV1Schema,
  RoomBoardUpdatedMessageV1Schema,
  UpdateDynamicWallAnchorRequestSchema,
  UpdateWallObjectRequestSchema,
  WallObjectControlRequestSchema,
  WallObjectSchema,
  WebResourcePreviewRequestSchema,
  WebResourcePreviewResponseSchema,
  type DynamicWallAnchor,
  type WallObject,
  type WallObjectType
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireRoomAccess, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams, parseQuery } from "../http/parse.js";
import { badRequest, conflict, forbidden, notFound, unprocessableEntity } from "../errors.js";
import { newId, nowIso } from "../repository.js";
import {
  actorIsRoomTeacher,
  assertSharedBrowsersEnabled,
  assertWallObjectCreatePolicy,
  assertWallObjectManagePolicy,
  assertWallObjectsEnabled,
  assertWhiteboardsEnabled,
  enforceWallObjectLimits,
  isLiveWallObjectType,
  liveTrackSourceForWallObjectType,
  validateWallObjectSource
} from "../policy/wall-objects.js";
import { assertAnchorAcceptsType, assertAnchorAvailableForNewObject } from "../policy/wall-anchors.js";
import { SharedBrowserOrchestrator } from "../shared-browser/orchestrator.js";
import { readWhiteboardState } from "../whiteboards/validation.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndObjectId = z.object({ roomId: z.string(), objectId: z.string() });
const ParamsWithRoomAndAnchorId = z.object({ roomId: z.string(), anchorId: z.string() });
const MAX_DYNAMIC_ANCHORS_PER_ROOM = 32;

function normalizeHost(host: string) {
  return host.replace(/^www\./, "").toLowerCase();
}

function isAllowedEmbedHost(config: AppContext["config"], host: string) {
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
      data: { question: normalized.question, choices: normalized.choices }
    },
    state: { ...createInitialPollState(), ...(body.state ?? {}) }
  };
}

export async function registerWallObjectRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository, sharedBrowserOrchestrator } = ctx;

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
    const updateInput: Parameters<typeof repository.updateWallObject>[2] = { updatedByUserId: auth.userId };
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

  app.get("/v1/rooms/:roomId/dynamic-wall-anchors", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    if (room.type !== "free-for-all") throw notFound("Dynamic wall anchors are only available in Free-for-All rooms");
    return repository.listDynamicWallAnchorsForRoom(params.roomId);
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
      ...manifest.wallAnchors.map((anchor) => ({ position: anchor.position, width: anchor.width })),
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
    const params = parseParams(ParamsWithRoomAndAnchorId, request);
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
        ...manifest.wallAnchors.map((anchor) => ({ position: anchor.position, width: anchor.width })),
        ...(await repository.listDynamicWallAnchorsForRoom(params.roomId))
          .filter((anchor) => anchor.id !== params.anchorId)
          .map((anchor) => ({ position: anchor.position, width: anchor.width, wallId: anchor.wallId }))
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
    const params = parseParams(ParamsWithRoomAndAnchorId, request);
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
        votesByUserId: { ...pollState.votesByUserId, [auth.userId]: choiceId }
      };
    } else {
      const { teacher } = await assertWallObjectManagePolicy(repository, params.roomId, auth, existing);
      if ((body.action === "approve" || body.action === "reject" || body.action === "lock" || body.action === "unlock") && !teacher) {
        throw forbidden("Teacher role required for wall object moderation");
      }

      if (body.action === "close-poll" || body.action === "reopen-poll") {
        if (existing.type !== "poll") throw badRequest("Poll controls are only supported for polls");
        const pollState = readPollState(state);
        state.poll = { ...pollState, closed: body.action === "close-poll" };
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

    const controlUpdate: Parameters<typeof repository.updateWallObject>[2] = {
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
    return { object: stabilized, publicationName: stablePublicationName, recommendedTrackSource: trackSource };
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
    const type: WallObjectType = embeddable ? "web.embed" : "web.link";
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
}
