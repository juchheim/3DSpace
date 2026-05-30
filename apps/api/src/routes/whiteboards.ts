import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ClearWhiteboardResponseSchema,
  CommitWhiteboardStrokeRequestSchema,
  CommitWhiteboardStrokeResponseSchema,
  EraseWhiteboardStrokesRequestSchema,
  EraseWhiteboardStrokesResponseSchema,
  ListWhiteboardStrokesQuerySchema,
  ListWhiteboardStrokesResponseSchema,
  RequestWhiteboardSnapshotResponseSchema,
  WhiteboardClearedMessageV1Schema,
  WhiteboardSnapshotReadyMessageV1Schema,
  WhiteboardStrokeCommitMessageV1Schema,
  WhiteboardStrokeEraseMessageV1Schema,
  type WhiteboardRealtimeMessage
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireRoomAccess, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams, parseQuery } from "../http/parse.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { nowIso, type Repository } from "../repository.js";
import { createDownloadTarget } from "../services/storage.js";
import {
  assertWallObjectManagePolicy,
  assertWhiteboardsEnabled,
  assertWhiteboardWritePolicy
} from "../policy/wall-objects.js";
import {
  normalizedWhiteboardStateUpdate,
  readWhiteboardState,
  stampedWhiteboardStroke,
  validateWhiteboardStrokeInput
} from "../whiteboards/validation.js";
import { maybeCompactWhiteboard } from "../whiteboards/snapshots.js";

const ParamsWithRoomAndObjectId = z.object({ roomId: z.string(), objectId: z.string() });

async function requireWhiteboardObject(repository: Repository, roomId: string, objectId: string) {
  const object = await repository.getWallObject(roomId, objectId);
  if (!object) throw notFound("Wall object not found");
  if (object.type !== "whiteboard") throw badRequest("Wall object is not a whiteboard");
  return object;
}

export async function registerWhiteboardRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

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
    await assertWhiteboardWritePolicy({ repository, room, auth, wallAnchorId: object.wallAnchorId });

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
    await assertWhiteboardWritePolicy({ repository, room, auth, wallAnchorId: object.wallAnchorId });

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
    await assertWhiteboardWritePolicy({ repository, room, auth, wallAnchorId: object.wallAnchorId });
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
}
