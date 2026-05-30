import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AvatarAppearanceSchema } from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { notFound } from "../errors.js";
import { requireUser } from "../http/auth-guards.js";
import { parseBody } from "../http/parse.js";

export async function registerUserRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/v1/users/me", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const user = await ctx.repository.getUser(auth.userId);
    if (!user) throw notFound("User not found");
    return user;
  });

  app.patch("/v1/users/me/avatar", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const body = parseBody(AvatarUpdateSchema, request);
    return ctx.repository.updateUserAvatarAppearance(auth.userId, body.appearance);
  });
}

const AvatarUpdateSchema = z.object({ appearance: AvatarAppearanceSchema });
