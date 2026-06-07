import type { FastifyInstance } from "fastify";
import { ListAvatarBodiesResponseSchema } from "@3dspace/contracts";
import { getBuiltinAvatarBodyCatalog } from "@3dspace/avatar-bodies";
import type { AppContext } from "../app-context.js";
import { PatchUserAvatarBodyBodySchema, validateAvatarBodySlug } from "../avatar-bodies/validate-body.js";
import { avatarBodiesDisabled } from "../errors.js";
import { requireUser } from "../http/auth-guards.js";
import { parseBody } from "../http/parse.js";

export async function registerAvatarBodyRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/v1/avatar-bodies", async (request) => {
    await requireUser(request, ctx.config, ctx.repository);
    if (!ctx.config.tuning.enableAvatarBodies) throw avatarBodiesDisabled();
    return ListAvatarBodiesResponseSchema.parse({
      items: getBuiltinAvatarBodyCatalog()
    });
  });

  app.patch("/v1/users/me/body", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    if (!ctx.config.tuning.enableAvatarBodies) throw avatarBodiesDisabled();
    const body = parseBody(PatchUserAvatarBodyBodySchema, request);
    const bodySlug = validateAvatarBodySlug(body.bodySlug);
    return ctx.repository.updateUserAvatarBody(auth.userId, bodySlug);
  });
}
