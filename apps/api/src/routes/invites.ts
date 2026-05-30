import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AcceptInviteResponseSchema } from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { conflict, notFound } from "../errors.js";
import { requireRoomTeacher, requireUser } from "../http/auth-guards.js";
import { parseParams } from "../http/parse.js";

const ParamsWithInviteCode = z.object({ inviteCode: z.string() });
const ParamsWithRoomId = z.object({ roomId: z.string() });
const ROOM_INVITE_TTL_MINUTES = 60 * 24 * 7;

export async function registerInviteRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/v1/rooms/:roomId/invite", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithRoomId, request);
    const room = await requireRoomTeacher(ctx.repository, params.roomId, auth);
    const invites = await ctx.repository.listInvitesForRoom(room.id);
    const existing = invites.find((invite) => invite.role === "student" && isInviteShareable(invite));
    if (existing) return existing;
    const expiresAt = new Date(Date.now() + ROOM_INVITE_TTL_MINUTES * 60_000).toISOString();
    return ctx.repository.createInvite({
      classId: room.classId,
      roomId: room.id,
      role: "student",
      createdByUserId: auth.userId,
      expiresAt
    });
  });

  app.post("/v1/invites/:inviteCode/accept", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithInviteCode, request);
    const invite = await ctx.repository.getInvite(params.inviteCode);
    if (!invite) throw notFound("Invite not found");
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      throw conflict("Invite has expired");
    }
    const classRecord = await ctx.repository.getClass(invite.classId);
    if (!classRecord) throw notFound("Class not found");
    const membership = await ctx.repository.upsertMembership({
      classId: invite.classId,
      userId: auth.userId,
      displayName: auth.displayName,
      role: invite.role,
      status: "active"
    });
    const updatedInvite = await ctx.repository.markInviteUsed(invite.code);
    return AcceptInviteResponseSchema.parse({
      invite: updatedInvite,
      class: classRecord,
      membership,
      roomId: invite.roomId
    });
  });
}

function isInviteShareable(invite: { expiresAt?: string | undefined }) {
  return !invite.expiresAt || new Date(invite.expiresAt).getTime() >= Date.now();
}
