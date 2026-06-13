import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TranslateRequestSchema, TranslateResponseSchema } from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireUser, assertTranslationAvailable } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";
import { translateText } from "../translation/service.js";
import { enforceTranslationRateLimit } from "../translation/rate-limit.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });

export async function registerTranslationRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post("/v1/rooms/:roomId/translate", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const { roomId } = parseParams(ParamsWithRoomId, request);
    const body = parseBody(TranslateRequestSchema, request);
    await assertTranslationAvailable(ctx.repository, ctx.config, roomId, auth);
    enforceTranslationRateLimit(auth.userId, roomId, ctx.config.tuning.translationRateLimitPerMinute);
    const result = await translateText(ctx.config, body, ctx.translationCache);
    return TranslateResponseSchema.parse({
      ...result,
      sourceLang: body.sourceLang,
      targetLang: body.targetLang
    });
  });
}
