import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  BuildLogicPieceSchema,
  ClearLogicPiecesResponseSchema,
  CreateLogicPieceRequestSchema,
  CreateLogicPieceResponseSchema,
  DeleteLogicPieceResponseSchema,
  GetLogicStateResponseSchema,
  ListLogicPiecesResponseSchema,
  LogicPieceSignalRequestSchema,
  LogicPieceSignalResponseSchema,
  LogicStateSchema,
  PatchLogicPieceNodeStateRequestSchema,
  PatchLogicPieceNodeStateResponseSchema,
  UpdateLogicPieceRequestSchema,
  UpdateLogicPieceResponseSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireRoomAccess, requireRoomTeacher, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";
import {
  assertLogicEnabled,
  assertLogicPlayMode,
  assertLogicPlacementAllowed,
  enforceLogicCaps,
  isNewLogicSlot,
  requireLogicPiece,
  type LogicPiecePlacement
} from "../logic-pieces/helpers.js";
import { applyLogicSignal } from "../logic-pieces/channel-bus.js";
import { applyTeleporterSignal } from "../logic-pieces/teleporter.js";
import {
  buildLogicRemoveMessage,
  buildLogicStateMessage,
  buildLogicUpsertMessage
} from "../logic-pieces/realtime-outbox.js";
import {
  recordLogicPiecePlaced,
  recordLogicPieceRemoved,
  recordLogicPiecesCleared
} from "../logic-pieces/telemetry.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndPieceId = z.object({ roomId: z.string(), pieceId: z.string() });

type CreateLogicPieceRequest = z.infer<typeof CreateLogicPieceRequestSchema>;

function placementFromRequest(body: CreateLogicPieceRequest): LogicPiecePlacement {
  return {
    kind: body.kind,
    cell: body.cell,
    level: body.level,
    edge: body.edge,
    rotation: body.rotation,
    channelId: body.channelId,
    linkId: body.linkId,
    config: body.config
  };
}

export async function registerLogicPieceRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository, logicTimerScheduler } = ctx;

  app.get("/v1/rooms/:roomId/logic-pieces", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    const pieces = await repository.listLogicPiecesForRoom(params.roomId);
    return ListLogicPiecesResponseSchema.parse({ pieces });
  });

  app.get("/v1/rooms/:roomId/logic-state", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    const state = await repository.getLogicState(params.roomId);
    return GetLogicStateResponseSchema.parse({ state });
  });

  app.post("/v1/rooms/:roomId/logic-pieces", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateLogicPieceRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    await requireRoomTeacher(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    const placement = placementFromRequest(body);
    assertLogicPlacementAllowed(manifest, placement);
    const existing = await repository.listLogicPiecesForRoom(params.roomId);
    if (isNewLogicSlot(existing, placement)) {
      await enforceLogicCaps(repository, params.roomId, auth.userId, 1);
    }
    const piece = BuildLogicPieceSchema.parse(
      await repository.createLogicPiece({
        roomId: params.roomId,
        kind: placement.kind,
        cell: placement.cell,
        level: placement.level,
        edge: placement.edge,
        rotation: placement.rotation ?? 0,
        channelId: placement.channelId,
        linkId: placement.linkId,
        config: placement.config,
        createdByUserId: auth.userId
      })
    );
    await recordLogicPiecePlaced(repository, params.roomId, auth.userId, piece);
    const realtimeMessages = [buildLogicUpsertMessage({ roomId: params.roomId, piece, senderId: auth.userId })];
    return CreateLogicPieceResponseSchema.parse({ piece, realtimeMessages });
  });

  app.patch("/v1/rooms/:roomId/logic-pieces/:pieceId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndPieceId, request);
    const body = parseBody(UpdateLogicPieceRequestSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    await requireRoomTeacher(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    await requireLogicPiece(repository, params.roomId, params.pieceId);
    const piece = BuildLogicPieceSchema.parse(
      await repository.updateLogicPiece(params.roomId, params.pieceId, {
        ...(body.channelId !== undefined ? { channelId: body.channelId } : {}),
        ...(body.linkId !== undefined ? { linkId: body.linkId } : {}),
        ...(body.config !== undefined ? { config: body.config } : {})
      })
    );
    const realtimeMessages = [buildLogicUpsertMessage({ roomId: params.roomId, piece, senderId: auth.userId })];
    return UpdateLogicPieceResponseSchema.parse({ piece, realtimeMessages });
  });

  app.delete("/v1/rooms/:roomId/logic-pieces", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    await requireRoomTeacher(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    const existing = await repository.listLogicPiecesForRoom(params.roomId);
    await repository.deleteAllLogicPiecesForRoom(params.roomId);
    logicTimerScheduler.cancelRoom(params.roomId);
    await repository.resetLogicState(params.roomId);
    await recordLogicPiecesCleared(repository, params.roomId, auth.userId, existing.length);
    const realtimeMessages = [
      buildLogicStateMessage({
        roomId: params.roomId,
        senderId: auth.userId,
        channels: {},
        nodes: {}
      })
    ];
    return ClearLogicPiecesResponseSchema.parse({ realtimeMessages });
  });

  app.patch("/v1/rooms/:roomId/logic-pieces/:pieceId/state", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndPieceId, request);
    const body = parseBody(PatchLogicPieceNodeStateRequestSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    await requireRoomTeacher(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    const piece = await requireLogicPiece(repository, params.roomId, params.pieceId);
    const current = await repository.getLogicState(params.roomId);
    const prevNode = current.nodes[params.pieceId] ?? {};
    const nextNode: Record<string, unknown> = { ...prevNode };
    if (body.open !== undefined) nextNode.open = body.open;
    if (body.on !== undefined) nextNode.on = body.on;
    if (body.armed !== undefined) nextNode.armed = body.armed;
    const state = await repository.patchLogicState(params.roomId, {
      nodes: { ...current.nodes, [params.pieceId]: nextNode }
    });
    const realtimeMessages = [
      buildLogicStateMessage({
        roomId: params.roomId,
        senderId: auth.userId,
        nodes: { [params.pieceId]: nextNode }
      })
    ];
    return PatchLogicPieceNodeStateResponseSchema.parse({ state, realtimeMessages });
  });

  app.post("/v1/rooms/:roomId/logic-pieces/:pieceId/signal", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndPieceId, request);
    const body = parseBody(LogicPieceSignalRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    assertLogicPlayMode(room);
    const piece = await requireLogicPiece(repository, params.roomId, params.pieceId);

    if (piece.kind === "teleporter") {
      const result = await applyTeleporterSignal(repository, params.roomId, manifest, piece, body.kind);
      return LogicPieceSignalResponseSchema.parse({
        ok: true,
        pieceId: params.pieceId,
        kind: body.kind,
        state: result.state,
        realtimeMessages: [],
        ...(result.teleportTo ? { teleportTo: result.teleportTo } : {})
      });
    }

    const result = await applyLogicSignal(repository, params.roomId, piece, body.kind);
    const pulsedChannels = Object.keys(result.channelPatch);
    if (pulsedChannels.length > 0) {
      await logicTimerScheduler.onChannelPulsed(params.roomId, pulsedChannels);
    }
    const realtimeMessages = [
      buildLogicStateMessage({
        roomId: params.roomId,
        senderId: auth.userId,
        ...(Object.keys(result.channelPatch).length > 0 ? { channels: result.channelPatch } : {}),
        ...(Object.keys(result.nodePatch).length > 0 ? { nodes: result.nodePatch } : {})
      })
    ];
    return LogicPieceSignalResponseSchema.parse({
      ok: true,
      pieceId: params.pieceId,
      kind: body.kind,
      state: result.state,
      realtimeMessages
    });
  });

  app.delete("/v1/rooms/:roomId/logic-pieces/:pieceId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndPieceId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    await requireRoomTeacher(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    const existing = await requireLogicPiece(repository, params.roomId, params.pieceId);
    if (existing.kind === "timer") {
      logicTimerScheduler.cancelPiece(params.roomId, params.pieceId);
    }
    await repository.removeLogicPiece(params.roomId, params.pieceId);
    await recordLogicPieceRemoved(repository, params.roomId, auth.userId, existing);
    const realtimeMessages = [
      buildLogicRemoveMessage({ roomId: params.roomId, pieceId: params.pieceId, senderId: auth.userId })
    ];
    return DeleteLogicPieceResponseSchema.parse({ realtimeMessages });
  });
}
