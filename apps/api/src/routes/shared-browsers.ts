import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  SharedBrowserControlLeaseRequestSchema,
  SharedBrowserHistoryRequestSchema,
  SharedBrowserNavigateRequestSchema,
  SharedBrowserSessionResponseSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireRoomAccess, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";
import { assertWallObjectsEnabled, assertSharedBrowsersEnabled } from "../policy/wall-objects.js";
import { sanitizeSharedBrowserSessionResponse } from "../shared-browser/session-response.js";
import type { SharedBrowserActor } from "../shared-browser/orchestrator.js";

const ParamsWithRoomAndObjectId = z.object({ roomId: z.string(), objectId: z.string() });

export async function registerSharedBrowserRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository, sharedBrowserOrchestrator } = ctx;

  async function requireSharedBrowserAccess(request: FastifyRequest) {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndObjectId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertWallObjectsEnabled({ settings: room.settings }, config);
    assertSharedBrowsersEnabled(room, config);
    const actor: SharedBrowserActor = { userId: auth.userId, displayName: auth.displayName };
    return { auth, params, room, actor };
  }

  function parseSharedBrowserSessionResponse(result: Awaited<ReturnType<typeof sharedBrowserOrchestrator.hydrate>>) {
    return SharedBrowserSessionResponseSchema.parse(sanitizeSharedBrowserSessionResponse(result));
  }

  app.get("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser", async (request) => {
    const { params } = await requireSharedBrowserAccess(request);
    const result = await sharedBrowserOrchestrator.hydrate(params.roomId, params.objectId);
    return parseSharedBrowserSessionResponse(result);
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/navigate", async (request) => {
    const { params, room, actor } = await requireSharedBrowserAccess(request);
    const body = parseBody(SharedBrowserNavigateRequestSchema, request);
    const result = await sharedBrowserOrchestrator.navigate(params.roomId, params.objectId, body.url, actor, room.settings.sharedBrowsers);
    return parseSharedBrowserSessionResponse(result);
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/history", async (request) => {
    const { params, room, actor } = await requireSharedBrowserAccess(request);
    const body = parseBody(SharedBrowserHistoryRequestSchema, request);
    const result = await sharedBrowserOrchestrator.history(params.roomId, params.objectId, body.action, actor, room.settings.sharedBrowsers);
    return parseSharedBrowserSessionResponse(result);
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/control-lease", async (request) => {
    const { params, room, actor } = await requireSharedBrowserAccess(request);
    const body = parseBody(SharedBrowserControlLeaseRequestSchema, request);
    const result = await sharedBrowserOrchestrator.controlLease(params.roomId, params.objectId, body.action, actor, room.settings.sharedBrowsers);
    return parseSharedBrowserSessionResponse(result);
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/resume", async (request) => {
    const { params, room, actor } = await requireSharedBrowserAccess(request);
    const result = await sharedBrowserOrchestrator.resume(params.roomId, params.objectId, actor, room.settings.sharedBrowsers);
    return parseSharedBrowserSessionResponse(result);
  });

  app.post("/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/embed", async (request) => {
    const { params } = await requireSharedBrowserAccess(request);
    const result = await sharedBrowserOrchestrator.refreshEmbed(params.roomId, params.objectId);
    return parseSharedBrowserSessionResponse(result);
  });
}
