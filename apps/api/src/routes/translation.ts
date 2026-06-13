import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { TranslateRequestSchema, TranslateResponseSchema, TranslateSpeechRequestSchema, voiceForParticipant } from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireUser, assertTranslationAvailable } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";
import { translateText } from "../translation/service.js";
import { synthesizeSpeech } from "../translation/speech-service.js";
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

  app.post("/v1/rooms/:roomId/translate/speech", async (request, reply: FastifyReply) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const { roomId } = parseParams(ParamsWithRoomId, request);
    const body = parseBody(TranslateSpeechRequestSchema, request);
    const room = await assertTranslationAvailable(ctx.repository, ctx.config, roomId, auth);
    if (!ctx.config.tuning.enableTranslationVoice || room.settings.translation?.voiceEnabled === false) {
      return reply.code(409).send({ error: { code: "translation-voice-unavailable", message: "Voice translation disabled" } });
    }
    enforceTranslationRateLimit(auth.userId, roomId, ctx.config.tuning.translationTtsRateLimitPerMinute);
    const voice = body.voice ?? voiceForParticipant(auth.userId, ctx.config.tuning.openAiTtsVoices);
    const result = await synthesizeSpeech(ctx.config, { text: body.text, lang: body.lang, voice }, ctx.translationSpeechCache);
    if (!result) return reply.code(204).send();
    void reply.header("content-type", result.contentType);
    void reply.header("x-translation-cached", String(result.cached));
    void reply.header("x-translation-voice", result.voice);
    void reply.header("cache-control", "no-store");
    return reply.send(result.audio);
  });
}
