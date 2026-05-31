import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  BuildPieceSchema,
  ClearBuildPiecesResponseSchema,
  CreateBuildPieceRequestSchema,
  CreateBuildPieceResponseSchema,
  CreateBuildPiecesBatchRequestSchema,
  CreateBuildPiecesBatchResponseSchema,
  DeleteBuildPieceResponseSchema,
  ListBuildPiecesResponseSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireRoomAccess, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";
import {
  assertBuildAllowed,
  assertBuildingEnabled,
  assertBuildWallHasNoBoards,
  assertCanDestroyBuildPiece,
  dedupeBuildPlacements,
  enforceBuildCaps,
  requireBuildPiece,
  type BuildPiecePlacement
} from "../build-pieces/helpers.js";
import {
  buildBuildBatchMessage,
  buildBuildRemoveMessage,
  buildBuildUpsertMessage
} from "../build-pieces/realtime-outbox.js";
import {
  recordBuildPiecePlaced,
  recordBuildPieceRemoved,
  recordBuildPiecesCleared,
  recordBuildPiecesPlacedBatch
} from "../build-pieces/telemetry.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndPieceId = z.object({ roomId: z.string(), pieceId: z.string() });

type CreateBuildPieceRequest = z.infer<typeof CreateBuildPieceRequestSchema>;

function placementFromRequest(body: CreateBuildPieceRequest): BuildPiecePlacement {
  return {
    kind: body.kind,
    cell: body.cell,
    level: body.level,
    edge: body.edge,
    rotation: body.rotation,
    materialId: body.materialId
  };
}

export async function registerBuildPieceRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository, buildPlacementRateLimiter } = ctx;

  app.get("/v1/rooms/:roomId/build-pieces", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertBuildingEnabled(config, room);
    const pieces = await repository.listBuildPiecesForRoom(params.roomId);
    return ListBuildPiecesResponseSchema.parse({ pieces });
  });

  app.post("/v1/rooms/:roomId/build-pieces", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateBuildPieceRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertBuildingEnabled(config, room);
    const placement = placementFromRequest(body);
    assertBuildAllowed(manifest, placement);
    await enforceBuildCaps(repository, params.roomId, auth.userId, [placement]);
    buildPlacementRateLimiter.enforce(auth.userId, params.roomId, 1);
    const piece = BuildPieceSchema.parse(
      await repository.createBuildPiece({
        roomId: params.roomId,
        kind: placement.kind,
        cell: placement.cell,
        level: placement.level,
        edge: placement.edge,
        rotation: placement.rotation ?? 0,
        materialId: placement.materialId ?? "stone",
        createdByUserId: auth.userId
      })
    );
    await recordBuildPiecePlaced(repository, params.roomId, auth.userId, piece);
    const realtimeMessages = [buildBuildUpsertMessage({ roomId: params.roomId, piece, senderId: auth.userId })];
    return CreateBuildPieceResponseSchema.parse({ piece, realtimeMessages });
  });

  app.post("/v1/rooms/:roomId/build-pieces/batch", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateBuildPiecesBatchRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertBuildingEnabled(config, room);
    const placements = dedupeBuildPlacements(body.pieces.map((piece) => placementFromRequest(piece)));
    for (const placement of placements) {
      assertBuildAllowed(manifest, placement);
    }
    await enforceBuildCaps(repository, params.roomId, auth.userId, placements);
    buildPlacementRateLimiter.enforce(auth.userId, params.roomId, placements.length);
    const pieces = BuildPieceSchema.array().parse(
      await repository.createBuildPiecesBatch(
        placements.map((placement) => ({
          roomId: params.roomId,
          kind: placement.kind,
          cell: placement.cell,
          level: placement.level,
          edge: placement.edge,
          rotation: placement.rotation ?? 0,
          materialId: placement.materialId ?? "stone",
          createdByUserId: auth.userId
        }))
      )
    );
    await recordBuildPiecesPlacedBatch(repository, params.roomId, auth.userId, pieces);
    const realtimeMessages = [buildBuildBatchMessage({ roomId: params.roomId, pieces, senderId: auth.userId })];
    return CreateBuildPiecesBatchResponseSchema.parse({ pieces, realtimeMessages });
  });

  app.delete("/v1/rooms/:roomId/build-pieces", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertBuildingEnabled(config, room);
    buildPlacementRateLimiter.enforce(auth.userId, params.roomId, 1);
    const existing = await repository.listBuildPiecesForRoom(params.roomId);
    await repository.deleteAllBuildPiecesForRoom(params.roomId);
    await recordBuildPiecesCleared(repository, params.roomId, auth.userId, existing.length);
    const realtimeMessages = [buildBuildBatchMessage({ roomId: params.roomId, pieces: [], senderId: auth.userId })];
    return ClearBuildPiecesResponseSchema.parse({ realtimeMessages });
  });

  app.delete("/v1/rooms/:roomId/build-pieces/:pieceId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndPieceId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertBuildingEnabled(config, room);
    const existing = await requireBuildPiece(repository, params.roomId, params.pieceId);
    await assertCanDestroyBuildPiece(repository, params.roomId, existing, auth, room.settings);
    await assertBuildWallHasNoBoards(repository, params.roomId, existing);
    buildPlacementRateLimiter.enforce(auth.userId, params.roomId, 1);
    await repository.removeBuildPiece(params.roomId, params.pieceId);
    await recordBuildPieceRemoved(repository, params.roomId, auth.userId, existing);
    const realtimeMessages = [
      buildBuildRemoveMessage({ roomId: params.roomId, pieceId: params.pieceId, senderId: auth.userId })
    ];
    return DeleteBuildPieceResponseSchema.parse({ realtimeMessages });
  });
}
