import type { FastifyInstance } from "fastify";
import { ListAvatarAccessoriesResponseSchema } from "@3dspace/contracts";
import { getBuiltinAvatarAccessoryCatalog } from "@3dspace/avatar-accessories";
import type { AppContext } from "../app-context.js";
import {
  PatchUserAvatarAccessoriesBodySchema,
  validateEquippedAccessories
} from "../avatar-accessories/validate-equipped.js";
import { avatarAccessoriesDisabled } from "../errors.js";
import { requireUser } from "../http/auth-guards.js";
import { parseBody } from "../http/parse.js";

export async function registerAvatarAccessoryRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/v1/avatar-accessories", async (request) => {
    await requireUser(request, ctx.config, ctx.repository);
    if (!ctx.config.tuning.enableAvatarAccessories) throw avatarAccessoriesDisabled();
    return ListAvatarAccessoriesResponseSchema.parse({
      items: getBuiltinAvatarAccessoryCatalog()
    });
  });

  app.patch("/v1/users/me/accessories", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    if (!ctx.config.tuning.enableAvatarAccessories) throw avatarAccessoriesDisabled();
    const body = parseBody(PatchUserAvatarAccessoriesBodySchema, request);
    const accessories = validateEquippedAccessories(body.accessories);
    return ctx.repository.updateUserAvatarAccessories(auth.userId, accessories);
  });
}
