import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { RoomAiHostChatMessage, RoomAiHostRealtimeMessage } from "@3dspace/contracts";
import {
  CreateRoomAiHostFileUploadTargetRequestSchema,
  CreateRoomAiHostFileUploadTargetResponseSchema,
  CreateRoomAiHostRequestSchema,
  DeleteRoomAiHostFileResponseSchema,
  DismissRoomAiHostQuerySchema,
  DismissRoomAiHostResponseSchema,
  GetRoomAiHostResponseSchema,
  ListRoomAiHostChatQuerySchema,
  ListRoomAiHostChatResponseSchema,
  ListRoomAiHostFilesResponseSchema,
  PatchRoomAiHostRequestSchema,
  RegisterRoomAiHostFileRequestSchema,
  RegisterRoomAiHostFileResponseSchema,
  RoomAiHostMutationResponseSchema,
  SendRoomAiHostChatRequestSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { assertAiHostPresent, assertAiWorldHostAvailable } from "../ai-host/guards.js";
import { createAiHostRecord, patchAiHostRecord } from "../ai-host/host-service.js";
import {
  countRecentUserMessages,
  createAiHostChatMessageRecord,
  secondsUntilRateLimitResets,
  toChatHistory
} from "../ai-host/chat-message-service.js";
import { streamChatCompletion } from "../ai-host/chat-service.js";
import {
  assertAiHostFileUploadAllowed,
  assertCanDeleteAiHostFile,
  createAiHostFileUploadTarget,
  deleteAiHostFileWithAssets,
  fileRealtimeRemoved,
  fileRealtimeUpdated,
  registerAiHostFile,
  reprocessAiHostFile
} from "../ai-host/file-service.js";
import { buildHelpSystemPrompt, fileStudySystemPrompt } from "../ai-host/prompts.js";
import { retrieveTopChunks } from "../ai-host/retrieval.js";
import {
  buildAiHostDismissedMessage,
  buildAiHostUpdatedMessage
} from "../ai-host/realtime-outbox.js";
import {
  HttpError,
  aiHostExists,
  aiHostFileNotFound,
  aiHostFileNotReady,
  aiHostNotFound,
  aiHostRateLimited
} from "../errors.js";
import { requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams, parseQuery } from "../http/parse.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndFileId = z.object({ roomId: z.string(), fileId: z.string() });

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function streamAiHostChatReply(input: {
  request: FastifyRequest;
  reply: FastifyReply;
  config: AppContext["config"];
  repository: AppContext["repository"];
  roomId: string;
  userId: string;
  mode: "build-help" | "file-study";
  fileId?: string | undefined;
  content: string;
  system: string;
  priorMessages: RoomAiHostChatMessage[];
  maxContextMessages: number;
}) {
  const userMessage = createAiHostChatMessageRecord({
    roomId: input.roomId,
    userId: input.userId,
    mode: input.mode,
    ...(input.fileId ? { fileId: input.fileId } : {}),
    role: "user",
    content: input.content
  });
  await input.repository.appendAiHostChatMessage(userMessage);

  const turns = toChatHistory([...input.priorMessages, userMessage], input.maxContextMessages);

  input.reply.hijack();
  const raw = input.reply.raw;
  raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });

  let full = "";
  try {
    for await (const delta of streamChatCompletion(input.config, {
      model: input.config.tuning.openAiAiHostModel,
      system: input.system,
      messages: turns
    })) {
      full += delta;
      raw.write(sseEvent("delta", { delta }));
    }
    const assistantMessage = createAiHostChatMessageRecord({
      roomId: input.roomId,
      userId: input.userId,
      mode: input.mode,
      ...(input.fileId ? { fileId: input.fileId } : {}),
      role: "assistant",
      content: full
    });
    await input.repository.appendAiHostChatMessage(assistantMessage);
    raw.write(sseEvent("done", { message: assistantMessage }));
  } catch (err) {
    const code = err instanceof HttpError ? err.code : "ai-host-unavailable";
    const message = err instanceof Error ? err.message : "The AI guide is unavailable.";
    input.request.log.error({ err }, "ai-host chat stream failed");
    raw.write(sseEvent("error", { error: code, message }));
  } finally {
    raw.end();
  }
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
    const realtimeMessages: RoomAiHostRealtimeMessage[] = [];
    if (query.deleteFiles) {
      const files = await repository.listAiHostFiles(params.roomId);
      for (const file of files) {
        await deleteAiHostFileWithAssets(config, repository, params.roomId, file.id);
        realtimeMessages.push(fileRealtimeRemoved(params.roomId, file.id, auth.userId));
      }
    }
    await repository.deleteAiHost(params.roomId);
    realtimeMessages.push(
      buildAiHostDismissedMessage({
        roomId: params.roomId,
        senderId: auth.userId,
        deleteFiles: query.deleteFiles
      })
    );
    return DismissRoomAiHostResponseSchema.parse({ dismissed: true, realtimeMessages });
  });

  app.get("/v1/rooms/:roomId/ai-host/files", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const files = await repository.listAiHostFiles(params.roomId);
    return ListRoomAiHostFilesResponseSchema.parse({ files });
  });

  app.post("/v1/rooms/:roomId/ai-host/files/upload-target", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(CreateRoomAiHostFileUploadTargetRequestSchema, request);
    const { room } = await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const files = await repository.listAiHostFiles(params.roomId);
    assertAiHostFileUploadAllowed(room, {
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      currentFileCount: files.length
    });
    const target = await createAiHostFileUploadTarget(config, {
      roomId: params.roomId,
      fileName: body.fileName,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes
    });
    return CreateRoomAiHostFileUploadTargetResponseSchema.parse(target);
  });

  app.post("/v1/rooms/:roomId/ai-host/files", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(RegisterRoomAiHostFileRequestSchema, request);
    const { room } = await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const files = await repository.listAiHostFiles(params.roomId);
    assertAiHostFileUploadAllowed(room, {
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      currentFileCount: files.length
    });
    const file = await registerAiHostFile(config, repository, {
      roomId: params.roomId,
      userId: auth.userId,
      fileId: body.fileId,
      storageKey: body.storageKey,
      originalFileName: body.originalFileName,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes
    });
    const realtimeMessages = [fileRealtimeUpdated(file, auth.userId)];
    return RegisterRoomAiHostFileResponseSchema.parse({ file, realtimeMessages });
  });

  app.post("/v1/rooms/:roomId/ai-host/files/:fileId/reprocess", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndFileId, request);
    await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const file = await reprocessAiHostFile(config, repository, params.roomId, params.fileId);
    const realtimeMessages = [fileRealtimeUpdated(file, auth.userId)];
    return RegisterRoomAiHostFileResponseSchema.parse({ file, realtimeMessages });
  });

  app.delete("/v1/rooms/:roomId/ai-host/files/:fileId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndFileId, request);
    const { room, membership } = await assertAiWorldHostAvailable(repository, config, params.roomId, auth);
    const file = await repository.getAiHostFile(params.roomId, params.fileId);
    if (!file) throw aiHostFileNotFound();
    const classRecord = await repository.getClass(room.classId);
    assertCanDeleteAiHostFile(file, auth, classRecord?.teacherUserId ?? "", membership);
    await deleteAiHostFileWithAssets(config, repository, params.roomId, params.fileId);
    const realtimeMessages = [fileRealtimeRemoved(params.roomId, params.fileId, auth.userId)];
    return DeleteRoomAiHostFileResponseSchema.parse({ deleted: true, realtimeMessages });
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
    const { room } = await assertAiWorldHostAvailable(repository, config, params.roomId, auth);

    const settings = room.settings.aiWorldHost;
    const maxPerHour = settings?.maxMessagesPerUserPerHour ?? 60;
    const maxContextMessages = settings?.maxContextMessages ?? 20;

    const priorMessages = await repository.listAiHostChatMessages(params.roomId, auth.userId, {
      mode: body.mode,
      fileId: body.fileId,
      limit: maxContextMessages
    });
    if (countRecentUserMessages(priorMessages) >= maxPerHour) {
      throw aiHostRateLimited(secondsUntilRateLimitResets(priorMessages));
    }

    if (body.mode === "build-help") {
      await assertAiHostPresent(repository, params.roomId);
      await streamAiHostChatReply({
        request,
        reply,
        config,
        repository,
        roomId: params.roomId,
        userId: auth.userId,
        mode: "build-help",
        content: body.content,
        system: buildHelpSystemPrompt({ context: body.buildHelpContext }),
        priorMessages,
        maxContextMessages
      });
      return;
    }

    const fileId = body.fileId!;
    const file = await repository.getAiHostFile(params.roomId, fileId);
    if (!file) throw aiHostFileNotFound();
    if (file.status === "processing") {
      throw aiHostFileNotReady("This file is still processing. Try again in a moment.");
    }
    if (file.status === "failed") {
      throw aiHostFileNotReady(file.errorMessage ?? "This file could not be processed.");
    }
    if (file.status !== "ready") {
      throw aiHostFileNotReady();
    }

    const chunks = await repository.listAiHostFileChunks(params.roomId, fileId);
    const retrieved = retrieveTopChunks(chunks, body.content);
    const system = fileStudySystemPrompt({
      fileName: file.originalFileName,
      chunks: retrieved.map((chunk) => ({ index: chunk.index, text: chunk.text }))
    });

    await streamAiHostChatReply({
      request,
      reply,
      config,
      repository,
      roomId: params.roomId,
      userId: auth.userId,
      mode: "file-study",
      fileId,
      content: body.content,
      system,
      priorMessages,
      maxContextMessages
    });
  });
}
