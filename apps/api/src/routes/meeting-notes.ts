import { Buffer } from "node:buffer";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  MeetingNotesDownloadFormatSchema,
  MeetingNotesEndedMessageV1Schema,
  MeetingNotesErrorMessageV1Schema,
  MeetingNotesSessionListResponseSchema,
  MeetingNotesSessionSchema,
  MeetingNotesStartedMessageV1Schema,
  MeetingNotesSummaryReadyMessageV1Schema,
  PatchMeetingNotesSessionRequestSchema,
  StartMeetingNotesSessionResponseSchema,
  UpdateMeetingNotesSummaryRequestSchema,
  UploadMeetingNotesAudioChunkRequestSchema,
  UploadMeetingNotesAudioChunkResponseSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { conflict, notFound } from "../errors.js";
import { requireUser, assertMeetingNotesAvailable } from "../http/auth-guards.js";
import { parseBody, parseParams, parseQuery } from "../http/parse.js";
import { buildMeetingNotesDetail, finalizeMeetingNotesSession } from "../meeting-notes/lifecycle.js";
import { newId, nowIso } from "../repository.js";
import { readStoredObject } from "../services/storage.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndSessionId = z.object({ roomId: z.string(), sessionId: z.string() });

export async function registerMeetingNotesRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/v1/rooms/:roomId/meeting-notes/sessions", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithRoomId, request);
    await assertMeetingNotesAvailable(ctx.repository, ctx.config, params.roomId, auth);
    const sessions = await ctx.repository.listMeetingNotesSessions(params.roomId);
    return MeetingNotesSessionListResponseSchema.parse({ sessions });
  });

  app.post("/v1/rooms/:roomId/meeting-notes/sessions", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithRoomId, request);
    const room = await assertMeetingNotesAvailable(ctx.repository, ctx.config, params.roomId, auth);
    const active = await ctx.repository.getActiveMeetingNotesSession(params.roomId);
    if (active) throw conflict("A meeting notes session is already active for this room");
    const now = nowIso();
    const session = MeetingNotesSessionSchema.parse({
      id: newId("mnotes"),
      roomId: params.roomId,
      startedByUserId: auth.userId,
      startedAt: now,
      status: "recording",
      participantUserIds: [auth.userId],
      createdAt: now,
      updatedAt: now
    });
    ctx.meetingNotesAudioStore.clear(params.roomId, session.id);
    await ctx.repository.createMeetingNotesSession(session);
    const message = MeetingNotesStartedMessageV1Schema.parse({
      type: "room.meeting-notes.started.v1",
      roomId: params.roomId,
      sessionId: session.id,
      session,
      sentAt: Date.now(),
      senderId: auth.userId
    });
    return StartMeetingNotesSessionResponseSchema.parse({ session, realtimeMessages: [message] });
  });

  app.get("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    await assertMeetingNotesAvailable(ctx.repository, ctx.config, params.roomId, auth);
    return buildMeetingNotesDetail(ctx.repository, params.roomId, params.sessionId);
  });

  app.patch("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    const body = parseBody(PatchMeetingNotesSessionRequestSchema, request);
    const room = await assertMeetingNotesAvailable(ctx.repository, ctx.config, params.roomId, auth);
    const existing = await ctx.repository.getMeetingNotesSession(params.roomId, params.sessionId);
    if (!existing) throw notFound("Meeting notes session not found");

    if (body.action === "cancel") {
      ctx.meetingNotesAudioStore.clear(params.roomId, params.sessionId);
      const session = await ctx.repository.updateMeetingNotesSession(params.roomId, params.sessionId, {
        status: "cancelled",
        endedAt: nowIso()
      });
      const message = MeetingNotesEndedMessageV1Schema.parse({
        type: "room.meeting-notes.ended.v1",
        roomId: params.roomId,
        sessionId: session.id,
        session,
        sentAt: Date.now(),
        senderId: auth.userId
      });
      return StartMeetingNotesSessionResponseSchema.parse({ session, realtimeMessages: [message] });
    }

    await ctx.repository.updateMeetingNotesSession(params.roomId, params.sessionId, { status: "finalizing" });
    try {
      await ctx.meetingNotesAudioStore.transcribeBuffered({
        roomId: params.roomId,
        sessionId: params.sessionId,
        repository: ctx.repository,
        config: ctx.config,
        logger: app.log
      });
      const session = await finalizeMeetingNotesSession(ctx.repository, ctx.config, room, params.sessionId);
      const ended = MeetingNotesEndedMessageV1Schema.parse({
        type: "room.meeting-notes.ended.v1",
        roomId: params.roomId,
        sessionId: session.id,
        session,
        sentAt: Date.now(),
        senderId: auth.userId
      });
      const summaryReady = MeetingNotesSummaryReadyMessageV1Schema.parse({
        type: "room.meeting-notes.summary-ready.v1",
        roomId: params.roomId,
        sessionId: session.id,
        session,
        sentAt: Date.now(),
        senderId: auth.userId
      });
      return StartMeetingNotesSessionResponseSchema.parse({ session, realtimeMessages: [ended, summaryReady] });
    } catch (error) {
      const failed = await ctx.repository.updateMeetingNotesSession(params.roomId, params.sessionId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unable to finalize meeting notes"
      });
      const message = MeetingNotesErrorMessageV1Schema.parse({
        type: "room.meeting-notes.error.v1",
        roomId: params.roomId,
        sessionId: failed.id,
        errorMessage: failed.errorMessage ?? "Unable to finalize meeting notes",
        sentAt: Date.now(),
        senderId: auth.userId
      });
      return StartMeetingNotesSessionResponseSchema.parse({ session: failed, realtimeMessages: [message] });
    }
  });

  app.post("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/summary", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    parseBody(UpdateMeetingNotesSummaryRequestSchema, request);
    const room = await assertMeetingNotesAvailable(ctx.repository, ctx.config, params.roomId, auth);
    await ctx.repository.updateMeetingNotesSession(params.roomId, params.sessionId, { status: "finalizing" });
    await ctx.meetingNotesAudioStore.transcribeBuffered({
      roomId: params.roomId,
      sessionId: params.sessionId,
      repository: ctx.repository,
      config: ctx.config,
      logger: app.log
    });
    const session = await finalizeMeetingNotesSession(ctx.repository, ctx.config, room, params.sessionId);
    const message = MeetingNotesSummaryReadyMessageV1Schema.parse({
      type: "room.meeting-notes.summary-ready.v1",
      roomId: params.roomId,
      sessionId: session.id,
      session,
      sentAt: Date.now(),
      senderId: auth.userId
    });
    return StartMeetingNotesSessionResponseSchema.parse({ session, realtimeMessages: [message] });
  });

  app.delete("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    await assertMeetingNotesAvailable(ctx.repository, ctx.config, params.roomId, auth);
    ctx.meetingNotesAudioStore.clear(params.roomId, params.sessionId);
    await ctx.repository.deleteMeetingNotesSession(params.roomId, params.sessionId);
    return { deleted: true };
  });

  app.post("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/audio-chunks", async (request, reply) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    const body = parseBody(UploadMeetingNotesAudioChunkRequestSchema, request);
    await assertMeetingNotesAvailable(ctx.repository, ctx.config, params.roomId, auth);
    const session = await ctx.repository.getMeetingNotesSession(params.roomId, params.sessionId);
    if (!session) throw notFound("Meeting notes session not found");
    if (session.status !== "recording") throw conflict("Meeting notes session is not recording");

    const audio = Buffer.from(body.audioBase64, "base64");
    console.info("[meeting-notes] Audio chunk received", {
      roomId: params.roomId,
      sessionId: params.sessionId,
      participantId: body.participantId,
      origin: request.headers.origin,
      contentLength: request.headers["content-length"],
      startedAtMs: body.startedAtMs,
      endedAtMs: body.endedAtMs,
      durationMs: Math.max(0, body.endedAtMs - body.startedAtMs),
      mimeType: body.mimeType,
      audioBytes: audio.length,
      base64Length: body.audioBase64.length
    });
    const buffered = ctx.meetingNotesAudioStore.append(params.roomId, params.sessionId, {
      participantId: body.participantId,
      startedAtMs: body.startedAtMs,
      endedAtMs: body.endedAtMs,
      mimeType: body.mimeType,
      audio
    });
    app.log.info(
      {
        roomId: params.roomId,
        sessionId: params.sessionId,
        participantId: body.participantId,
        bufferedChunks: buffered.bufferedChunks,
        bufferedBytes: buffered.bufferedBytes
      },
      "Buffered meeting notes audio chunk"
    );
    return reply.status(202).send(UploadMeetingNotesAudioChunkResponseSchema.parse({ accepted: true, realtimeMessages: [] }));
  });

  app.get("/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/download", async (request, reply) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    const params = parseParams(ParamsWithRoomAndSessionId, request);
    const query = parseQuery(z.object({ format: MeetingNotesDownloadFormatSchema }), request);
    await assertMeetingNotesAvailable(ctx.repository, ctx.config, params.roomId, auth);
    const session = await ctx.repository.getMeetingNotesSession(params.roomId, params.sessionId);
    if (!session) throw notFound("Meeting notes session not found");
    const storageKey = query.format === "md" ? session.summaryStorageKey : session.transcriptStorageKeys?.[query.format];
    if (!storageKey) throw notFound("Requested meeting notes artifact is not available");
    const object = await readStoredObject(ctx.config, { storageKey });
    if (!object) throw notFound("Meeting notes artifact not found");
    const fileName = storageKey.split("/").pop() ?? `meeting-notes.${query.format}`;
    return reply
      .header("Content-Type", object.contentType)
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(object.body);
  });
}
