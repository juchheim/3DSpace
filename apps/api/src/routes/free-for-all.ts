import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { applyDefaultWallAnchorDimensions } from "@3dspace/room-engine";
import {
  JoinFreeForAllSessionRequestSchema,
  ListFreeForAllRoomsResponseSchema,
  RoomSessionResponseSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";
import { conflict, forbidden, notFound } from "../errors.js";
import { assertFreeForAllPassword } from "../free-for-all/password.js";
import { mintLiveKitToken } from "../services/livekit.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });

export async function registerFreeForAllRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

  app.get("/v1/rooms/free-for-all", async (request) => {
    await requireUser(request, config, repository);
    const query = (request.query as Record<string, string | undefined>);
    const classId = typeof query.classId === "string" ? query.classId : undefined;
    const limit = Math.min(Number(query.limit ?? "20") || 20, 100);
    const rooms = await repository.listFreeForAllRooms(classId ? { classId } : {});
    return ListFreeForAllRoomsResponseSchema.parse({
      rooms: rooms.slice(0, limit).map((r) => ({
        id: r.id,
        name: r.name,
        classId: r.classId,
        createdAt: r.createdAt,
        participantCount: 0
      }))
    });
  });

  app.post("/v1/rooms/:roomId/free-for-all-sessions", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(JoinFreeForAllSessionRequestSchema, request);

    const room = await repository.getRoom(params.roomId);
    if (!room) throw notFound("Room not found");
    if (room.type !== "free-for-all") throw forbidden("This endpoint is only available for Free-for-All rooms");

    const classRecord = await repository.getClass(room.classId);
    const isCreator = classRecord?.teacherUserId === auth.userId;
    if (!isCreator) {
      assertFreeForAllPassword(config, body.freeForAllPassword);
    }

    let membership = await repository.getMembership(room.classId, auth.userId);
    if (!membership || membership.status !== "active") {
      membership = await repository.upsertMembership({
        classId: room.classId,
        userId: auth.userId,
        displayName: auth.displayName,
        role: "student",
        status: "active"
      });
    }

    membership = await repository.upsertMembership({
      classId: room.classId,
      userId: auth.userId,
      displayName: auth.displayName,
      role: membership.role,
      status: "active"
    });

    const storedManifest = await repository.getActiveManifest(room.id);
    if (!storedManifest) throw notFound("Room manifest not found");
    const manifest = applyDefaultWallAnchorDimensions(storedManifest, room.type);

    ctx.sessionRateLimiter.enforce(auth.userId, room.id);
    const participantIdentity = `${auth.userId}:${room.id}`;
    const activeCount = await repository.recordRoomSession({
      roomId: room.id,
      participantIdentity,
      userId: auth.userId,
      role: membership.role,
      maxParticipants: room.settings.maxParticipants
    });
    if (activeCount > room.settings.maxParticipants) {
      throw conflict("Room is at participant capacity");
    }

    const token = await mintLiveKitToken(config, {
      roomId: room.id,
      participantIdentity,
      displayName: auth.displayName,
      role: membership.role
    });

    const sessionUser = await repository.getUser(auth.userId);
    return RoomSessionResponseSchema.parse({
      token,
      livekitUrl: config.livekitUrl,
      participantIdentity,
      participantId: auth.userId,
      role: membership.role,
      room,
      manifest,
      capabilities: manifest.capabilities,
      avatarAppearance: sessionUser?.avatar?.appearance ?? null,
      tuning: {
        avatarSendHz: config.tuning.avatarSendHz,
        interpolationMs: config.tuning.interpolationMs,
        spatialAudio: config.tuning.spatialAudio,
        media: config.tuning.media
      }
    });
  });
}
