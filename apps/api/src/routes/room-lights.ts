import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateRoomLightRequestSchema,
  CreateRoomLightResponseSchema,
  DeleteRoomLightResponseSchema,
  GetRoomEnvironmentResponseSchema,
  ListRoomLightsResponseSchema,
  SetRoomEnvironmentRequestSchema,
  SetRoomEnvironmentResponseSchema,
  UpdateRoomLightRequestSchema,
  UpdateRoomLightResponseSchema,
  type RoomLight,
  type RoomEnvironment,
  type RoomLightRealtimeMessage,
  type RoomLightingRealtimeMessage,
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireRoomAccess, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndLightId = z.object({ roomId: z.string(), lightId: z.string() });

function buildUpsertMessage(input: { roomId: string; light: RoomLight; senderId: string }): RoomLightRealtimeMessage {
  return { type: "room.light.upsert.v1", roomId: input.roomId, light: input.light, sentAt: Date.now(), senderId: input.senderId };
}

function buildRemoveMessage(input: { roomId: string; lightId: string; senderId: string }): RoomLightRealtimeMessage {
  return { type: "room.light.remove.v1", roomId: input.roomId, lightId: input.lightId, sentAt: Date.now(), senderId: input.senderId };
}

function buildEnvironmentMessage(input: { roomId: string; environment: RoomEnvironment; senderId: string }): RoomLightingRealtimeMessage {
  return { type: "room.lighting.environment.v1", roomId: input.roomId, environment: input.environment, sentAt: Date.now(), senderId: input.senderId };
}

function assertLightingEnabled(config: AppContext["config"]) {
  if (!config.tuning.enableWorldBuilderLighting) {
    throw Object.assign(new Error("World builder lighting is not enabled"), { statusCode: 503 });
  }
}

export async function registerRoomLightRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

  app.get("/v1/rooms/:roomId/lights", async (request) => {
    assertLightingEnabled(config);
    const auth = await requireUser(request, config, repository);
    const { roomId } = parseParams(ParamsWithRoomId, request);
    await requireRoomAccess(repository, roomId, auth);
    const lights = await repository.listRoomLights(roomId);
    return ListRoomLightsResponseSchema.parse({ lights });
  });

  app.post("/v1/rooms/:roomId/lights", async (request) => {
    assertLightingEnabled(config);
    const auth = await requireUser(request, config, repository);
    const { roomId } = parseParams(ParamsWithRoomId, request);
    await requireRoomAccess(repository, roomId, auth);
    const body = parseBody(CreateRoomLightRequestSchema, request);
    const light = await repository.createRoomLight({
      roomId,
      createdByUserId: auth.userId,
      ...body,
    } as unknown as Parameters<typeof repository.createRoomLight>[0]);
    const realtimeMessages = [buildUpsertMessage({ roomId, light, senderId: auth.userId })];
    return CreateRoomLightResponseSchema.parse({ light, realtimeMessages });
  });

  app.patch("/v1/rooms/:roomId/lights/:lightId", async (request) => {
    assertLightingEnabled(config);
    const auth = await requireUser(request, config, repository);
    const { roomId, lightId } = parseParams(ParamsWithRoomAndLightId, request);
    await requireRoomAccess(repository, roomId, auth);
    const body = parseBody(UpdateRoomLightRequestSchema, request);
    const light = await repository.updateRoomLight(roomId, lightId, body as unknown as Parameters<typeof repository.updateRoomLight>[2]);
    if (!light) {
      throw Object.assign(new Error("Light not found"), { statusCode: 404 });
    }
    const realtimeMessages = [buildUpsertMessage({ roomId, light, senderId: auth.userId })];
    return UpdateRoomLightResponseSchema.parse({ light, realtimeMessages });
  });

  app.delete("/v1/rooms/:roomId/lights/:lightId", async (request) => {
    assertLightingEnabled(config);
    const auth = await requireUser(request, config, repository);
    const { roomId, lightId } = parseParams(ParamsWithRoomAndLightId, request);
    await requireRoomAccess(repository, roomId, auth);
    await repository.deleteRoomLight(roomId, lightId);
    const realtimeMessages = [buildRemoveMessage({ roomId, lightId, senderId: auth.userId })];
    return DeleteRoomLightResponseSchema.parse({ realtimeMessages });
  });

  app.get("/v1/rooms/:roomId/lighting/environment", async (request) => {
    assertLightingEnabled(config);
    const auth = await requireUser(request, config, repository);
    const { roomId } = parseParams(ParamsWithRoomId, request);
    await requireRoomAccess(repository, roomId, auth);
    const environment = await repository.getRoomEnvironment(roomId);
    return GetRoomEnvironmentResponseSchema.parse({ environment });
  });

  app.patch("/v1/rooms/:roomId/lighting/environment", async (request) => {
    assertLightingEnabled(config);
    const auth = await requireUser(request, config, repository);
    const { roomId } = parseParams(ParamsWithRoomId, request);
    await requireRoomAccess(repository, roomId, auth);
    const body = parseBody(SetRoomEnvironmentRequestSchema, request);
    const environment = await repository.setRoomEnvironment(roomId, body as unknown as Parameters<typeof repository.setRoomEnvironment>[1]);
    const realtimeMessages: RoomLightingRealtimeMessage[] = [buildEnvironmentMessage({ roomId, environment, senderId: auth.userId })];
    return SetRoomEnvironmentResponseSchema.parse({ environment, realtimeMessages });
  });
}
