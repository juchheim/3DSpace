import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  EscapeSessionMutationResponseSchema,
  GetEscapeSessionResponseSchema,
  StartEscapeSessionRequestSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { logicNodesFromPieceInitialState } from "../escape-session/helpers.js";
import { buildRoomSessionMessage } from "../escape-session/realtime-outbox.js";
import { requireRoomAccess, requireRoomTeacher, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";
import { assertLogicEnabled, assertLogicPlayMode } from "../logic-pieces/helpers.js";
import { buildLogicStateMessage } from "../logic-pieces/realtime-outbox.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });

export async function registerEscapeSessionRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository, logicTimerScheduler } = ctx;

  app.get("/v1/rooms/:roomId/escape-session", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    const session = await repository.getEscapeSession(params.roomId);
    return GetEscapeSessionResponseSchema.parse({ session });
  });

  app.post("/v1/rooms/:roomId/escape-session/start", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(StartEscapeSessionRequestSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    await requireRoomTeacher(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    assertLogicPlayMode(room);
    const session = await repository.startEscapeSession(params.roomId, body.durationSec);
    await logicTimerScheduler.onSessionStart(params.roomId);
    const realtimeMessages = [
      buildRoomSessionMessage({ roomId: params.roomId, session, senderId: auth.userId })
    ];
    return EscapeSessionMutationResponseSchema.parse({ session, realtimeMessages });
  });

  app.post("/v1/rooms/:roomId/escape-session/reset", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    await requireRoomTeacher(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    assertLogicPlayMode(room);
    const pieces = await repository.listLogicPiecesForRoom(params.roomId);
    const nodes = logicNodesFromPieceInitialState(pieces);
    logicTimerScheduler.cancelRoom(params.roomId);
    await repository.patchLogicState(params.roomId, { channels: {}, nodes });
    const session = await repository.resetEscapeSession(params.roomId);
    const realtimeMessages = [
      buildRoomSessionMessage({ roomId: params.roomId, session, senderId: auth.userId }),
      buildLogicStateMessage({ roomId: params.roomId, senderId: auth.userId, channels: {}, nodes })
    ];
    return EscapeSessionMutationResponseSchema.parse({ session, realtimeMessages });
  });

  app.post("/v1/rooms/:roomId/escape-session/win", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertLogicEnabled(config, room);
    assertLogicPlayMode(room);
    const session = await repository.markEscapeSessionWon(params.roomId);
    const realtimeMessages = [
      buildRoomSessionMessage({ roomId: params.roomId, session, senderId: auth.userId })
    ];
    return EscapeSessionMutationResponseSchema.parse({ session, realtimeMessages });
  });
}
