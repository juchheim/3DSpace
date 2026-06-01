import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateRoomAiHostRequestSchema,
  DismissRoomAiHostQuerySchema,
  DismissRoomAiHostResponseSchema,
  GetRoomAiHostResponseSchema,
  ListRoomAiHostChatQuerySchema,
  ListRoomAiHostChatResponseSchema,
  PatchRoomAiHostRequestSchema,
  RoomAiHostMutationResponseSchema,
  SendRoomAiHostChatRequestSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { assertAiWorldHostAvailable } from "../ai-host/guards.js";
import { createAiHostRecord, patchAiHostRecord } from "../ai-host/host-service.js";
import {
  countRecentUserMessages,
  createAiHostChatMessageRecord,
  toChatHistory
} from "../ai-host/chat-message-service.js";
import { streamChatCompletion } from "../ai-host/chat-service.js";
import { buildHelpSystemPrompt } from "../ai-host/prompts.js";
import { buildAiHostDismissedMessage, buildAiHostUpdatedMessage } from "../ai-host/realtime-outbox.js";
import {
  HttpError,
  aiHostExists,
  aiHostFileNotFound,
  aiHostNotFound,
  aiHostRateLimited
} from "../errors.js";
import { requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams, parseQuery } from "../http/parse.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function registerAiHostRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

  app.get("/v1/rooms/:roomId/ai-host", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const host = await repository.getAiHostByRoomId(params.roomId);
    return GetRoomAiHostResponseSchema.parse({ host });
  });

  app.post("/v1/rooms/:roomId/ai-host", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateRoomAiHostRequestSchema, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const existing = await repository.getAiHostByRoomId(params.roomId);
    if (existing) throw aiHostExists();
    const host = createAiHostRecord({
      roomId: params.roomId,
      displayName: body.displayName,
      position: body.position,
      rotationY: body.rotationY,
      createdByUserId: auth.userId
    });
    await repository.createAiHost(host);
    const realtimeMessages = [
      buildAiHostUpdatedMessage({ roomId: params.roomId, host, senderId: auth.userId })
    ];
    return RoomAiHostMutationResponseSchema.parse({ host, realtimeMessages });
  });

  app.patch("/v1/rooms/:roomId/ai-host", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(PatchRoomAiHostRequestSchema, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const current = await repository.getAiHostByRoomId(params.roomId);
    if (!current) throw aiHostNotFound();
    const host = patchAiHostRecord(current, body);
    await repository.updateAiHost(params.roomId, host);
    const realtimeMessages = [
      buildAiHostUpdatedMessage({ roomId: params.roomId, host, senderId: auth.userId })
    ];
    return RoomAiHostMutationResponseSchema.parse({ host, realtimeMessages });
  });

  app.delete("/v1/rooms/:roomId/ai-host", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const query = parseQuery(DismissRoomAiHostQuerySchema, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const current = await repository.getAiHostByRoomId(params.roomId);
    if (!current) throw aiHostNotFound();
    await repository.deleteAiHost(params.roomId, { deleteFiles: query.deleteFiles });
    const realtimeMessages = [
      buildAiHostDismissedMessage({ roomId: params.roomId, senderId: auth.userId })
    ];
    return DismissRoomAiHostResponseSchema.parse({ dismissed: true, realtimeMessages });
  });

  app.get("/v1/rooms/:roomId/ai-host/chat", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const query = parseQuery(ListRoomAiHostChatQuerySchema, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const messages = await repository.listAiHostChatMessages(params.roomId, auth.userId, {
      mode: query.mode,
      fileId: query.fileId,
      limit: query.limit ?? 50
    });
    return ListRoomAiHostChatResponseSchema.parse({ messages });
  });

  app.post("/v1/rooms/:roomId/ai-host/chat", async (request, reply) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(SendRoomAiHostChatRequestSchema, request);
    const room = await assertAiWorldHostAvailable(repository, config, params.roomId, auth);

    const host = await repository.getAiHostByRoomId(params.roomId);
    if (!host) throw aiHostNotFound();

    // Study-file chat ships in Phase 6; no files can exist yet, so the fileId is unknown.
    if (body.mode === "file-study") throw aiHostFileNotFound();

    const settings = room.settings.aiWorldHost;
    const maxPerHour = settings?.maxMessagesPerUserPerHour ?? 60;
    const maxContextMessages = settings?.maxContextMessages ?? 20;

    const priorMessages = await repository.listAiHostChatMessages(params.roomId, auth.userId, {
      mode: "build-help"
    });
    if (countRecentUserMessages(priorMessages) >= maxPerHour) {
      throw aiHostRateLimited(60);
    }

    const userMessage = createAiHostChatMessageRecord({
      roomId: params.roomId,
      userId: auth.userId,
      mode: "build-help",
      role: "user",
      content: body.content
    });
    await repository.appendAiHostChatMessage(userMessage);

    const system = buildHelpSystemPrompt({ context: body.buildHelpContext });
    const turns = toChatHistory([...priorMessages, userMessage], maxContextMessages);

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });

    let full = "";
    try {
      for await (const delta of streamChatCompletion(config, {
        model: config.tuning.openAiAiHostModel,
        system,
        messages: turns
      })) {
        full += delta;
        raw.write(sseEvent("delta", { delta }));
      }
      const assistantMessage = createAiHostChatMessageRecord({
        roomId: params.roomId,
        userId: auth.userId,
        mode: "build-help",
        role: "assistant",
        content: full
      });
      await repository.appendAiHostChatMessage(assistantMessage);
      raw.write(sseEvent("done", { message: assistantMessage }));
    } catch (err) {
      const code = err instanceof HttpError ? err.code : "ai-host-unavailable";
      const message = err instanceof Error ? err.message : "The AI guide is unavailable.";
      request.log.error({ err }, "ai-host chat stream failed");
      raw.write(sseEvent("error", { error: code, message }));
    } finally {
      raw.end();
    }
  });
}
