import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateClassRequestSchema,
  CreateInviteRequestSchema,
  UpdateClassRequestSchema,
  UpsertClassMemberRequestSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { badRequest } from "../errors.js";
import { requireClassAccess, requireClassTeacher, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";

const ParamsWithClassId = z.object({ classId: z.string() });

export async function registerClassRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/v1/classes", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    return ctx.repository.listClassesForUser(auth.userId);
  });

  app.post("/v1/classes", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const body = parseBody(CreateClassRequestSchema, request);
    return ctx.repository.createClass({ name: body.name, teacher: auth });
  });

  app.patch("/v1/classes/:classId", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithClassId, request);
    const body = parseBody(UpdateClassRequestSchema, request);
    await requireClassTeacher(ctx.repository, params.classId, auth);
    const update: { name?: string } = {};
    if (body.name) update.name = body.name;
    return ctx.repository.updateClass(params.classId, update);
  });

  app.get("/v1/classes/:classId/members", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithClassId, request);
    await requireClassAccess(ctx.repository, params.classId, auth);
    return ctx.repository.listMemberships(params.classId);
  });

  app.post("/v1/classes/:classId/members", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithClassId, request);
    const body = parseBody(UpsertClassMemberRequestSchema, request);
    await requireClassTeacher(ctx.repository, params.classId, auth);
    return ctx.repository.upsertMembership({
      classId: params.classId,
      userId: body.userId,
      displayName: body.displayName,
      role: body.role,
      status: body.status
    });
  });

  app.post("/v1/classes/:classId/invites", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithClassId, request);
    const body = parseBody(CreateInviteRequestSchema, request);
    await requireClassTeacher(ctx.repository, params.classId, auth);
    if (body.roomId) {
      const room = await ctx.repository.getRoom(body.roomId);
      if (!room || room.classId !== params.classId) throw badRequest("roomId must belong to the class");
    }
    const expiresAt = body.expiresInMinutes ? new Date(Date.now() + body.expiresInMinutes * 60_000).toISOString() : undefined;
    const inviteInput: {
      classId: string;
      role: "teacher" | "student";
      createdByUserId: string;
      roomId?: string;
      expiresAt?: string;
    } = {
      classId: params.classId,
      role: body.role,
      createdByUserId: auth.userId
    };
    if (body.roomId) inviteInput.roomId = body.roomId;
    if (expiresAt) inviteInput.expiresAt = expiresAt;
    return ctx.repository.createInvite(inviteInput);
  });
}
