import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateRoomAiHostRequestSchema,
  DismissRoomAiHostQuerySchema,
  DismissRoomAiHostResponseSchema,
  GetRoomAiHostResponseSchema,
  PatchRoomAiHostRequestSchema,
  RoomAiHostMutationResponseSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { assertAiWorldHostAvailable } from "../ai-host/guards.js";
import { createAiHostRecord, patchAiHostRecord } from "../ai-host/host-service.js";
import { buildAiHostDismissedMessage, buildAiHostUpdatedMessage } from "../ai-host/realtime-outbox.js";
import { aiHostExists, aiHostNotFound } from "../errors.js";
import { requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams, parseQuery } from "../http/parse.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });

export async function registerAiHostRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

  app.get("/v1/rooms/:roomId/ai-host", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const host = await repository.getAiHostByRoomId(params.roomId);
    return GetRoomAiHostResponseSchema.parse({ host });
  });

  app.post("/v1/rooms/:roomId/ai-host", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateRoomAiHostRequestSchema, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const existing = await repository.getAiHostByRoomId(params.roomId);
    if (existing) throw aiHostExists();
    const host = createAiHostRecord({
      roomId: params.roomId,
      displayName: body.displayName,
      position: body.position,
      rotationY: body.rotationY,
      createdByUserId: auth.userId
    });
    await repository.createAiHost(host);
    const realtimeMessages = [
      buildAiHostUpdatedMessage({ roomId: params.roomId, host, senderId: auth.userId })
    ];
    return RoomAiHostMutationResponseSchema.parse({ host, realtimeMessages });
  });

  app.patch("/v1/rooms/:roomId/ai-host", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(PatchRoomAiHostRequestSchema, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const current = await repository.getAiHostByRoomId(params.roomId);
    if (!current) throw aiHostNotFound();
    const host = patchAiHostRecord(current, body);
    await repository.updateAiHost(params.roomId, host);
    const realtimeMessages = [
      buildAiHostUpdatedMessage({ roomId: params.roomId, host, senderId: auth.userId })
    ];
    return RoomAiHostMutationResponseSchema.parse({ host, realtimeMessages });
  });

  app.delete("/v1/rooms/:roomId/ai-host", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const query = parseQuery(DismissRoomAiHostQuerySchema, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const current = await repository.getAiHostByRoomId(params.roomId);
    if (!current) throw aiHostNotFound();
    await repository.deleteAiHost(params.roomId, { deleteFiles: query.deleteFiles });
    const realtimeMessages = [
      buildAiHostDismissedMessage({ roomId: params.roomId, senderId: auth.userId })
    ];
    return DismissRoomAiHostResponseSchema.parse({ dismissed: true, realtimeMessages });
  });
}
