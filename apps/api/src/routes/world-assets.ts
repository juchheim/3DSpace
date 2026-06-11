import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateWorldAssetRequestSchema,
  CreateWorldAssetResponseSchema,
  DeleteWorldAssetResponseSchema,
  ListWorldAssetsResponseSchema,
  type PlacedWorldAsset,
  type WorldAssetRealtimeMessage
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireRoomAccess, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndAssetId = z.object({ roomId: z.string(), assetId: z.string() });

function buildUpsertMessage(input: {
  roomId: string;
  asset: PlacedWorldAsset;
  senderId: string;
}): WorldAssetRealtimeMessage {
  return {
    type: "room.world-asset.upsert.v1",
    roomId: input.roomId,
    asset: input.asset,
    sentAt: Date.now(),
    senderId: input.senderId
  };
}

function buildRemoveMessage(input: {
  roomId: string;
  assetId: string;
  senderId: string;
}): WorldAssetRealtimeMessage {
  return {
    type: "room.world-asset.remove.v1",
    roomId: input.roomId,
    assetId: input.assetId,
    sentAt: Date.now(),
    senderId: input.senderId
  };
}

export async function registerWorldAssetRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

  app.get("/v1/rooms/:roomId/world-assets", async (request) => {
    const auth = await requireUser(request, config, repository);
    const { roomId } = parseParams(ParamsWithRoomId, request);
    await requireRoomAccess(repository, roomId, auth);
    const assets = await repository.listWorldAssetsForRoom(roomId);
    return ListWorldAssetsResponseSchema.parse({ assets });
  });

  app.post("/v1/rooms/:roomId/world-assets", async (request) => {
    const auth = await requireUser(request, config, repository);
    const { roomId } = parseParams(ParamsWithRoomId, request);
    await requireRoomAccess(repository, roomId, auth);
    const body = parseBody(CreateWorldAssetRequestSchema, request);
    const asset = await repository.createWorldAsset({
      roomId,
      slug: body.slug,
      position: body.position,
      yaw: body.yaw,
      ...(body.scale !== undefined ? { scale: body.scale } : {}),
      placedByUserId: auth.userId
    });
    const realtimeMessages = [buildUpsertMessage({ roomId, asset, senderId: auth.userId })];
    return CreateWorldAssetResponseSchema.parse({ asset, realtimeMessages });
  });

  app.delete("/v1/rooms/:roomId/world-assets/:assetId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const { roomId, assetId } = parseParams(ParamsWithRoomAndAssetId, request);
    await requireRoomAccess(repository, roomId, auth);
    await repository.deleteWorldAsset(roomId, assetId);
    const realtimeMessages = [buildRemoveMessage({ roomId, assetId, senderId: auth.userId })];
    return DeleteWorldAssetResponseSchema.parse({ realtimeMessages });
  });
}
