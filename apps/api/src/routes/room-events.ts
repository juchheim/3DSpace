import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { RoomEventRequestSchema } from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireRoomAccess, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });

export async function registerRoomEventRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

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
}
