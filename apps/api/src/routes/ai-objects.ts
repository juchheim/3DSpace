import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AiObjectJobSchema,
  ListAiObjectJobsResponseSchema,
  PatchAiObjectJobRequestSchema,
  PlaceAiObjectRequestSchema,
  PlaceAiObjectResponseSchema,
  RoomObjectSchema,
  StartAiObjectJobRequestSchema,
  StartAiObjectJobResponseSchema,
  type AiObjectJob
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { assertAiObjectsEnabled, requireRoomAccess, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";
import { badRequest, notFound, tooManyRequests } from "../errors.js";
import {
  clampRoomObjectPose,
  clampRoomObjectScale,
  enforceActiveRoomObjectCap,
  assertRoomObjectsEnabled
} from "../room-objects/helpers.js";
import { buildRoomObjectUpsertMessage } from "../room-objects/realtime-outbox.js";
import { readStoredObject } from "../services/storage.js";
import {
  aiObjectDownloadFilename,
  cancelJob as cancelAiObjectJob,
  deleteJob as deleteAiObjectJob,
  startJob as startAiObjectJob
} from "../ai-objects/index.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithJobId = z.object({ roomId: z.string(), jobId: z.string() });

export async function registerAiObjectRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

  app.post("/v1/rooms/:roomId/ai-objects/jobs", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(StartAiObjectJobRequestSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);

    try {
      const result = await startAiObjectJob(
        {
          ...body,
          roomId: params.roomId,
          userId: auth.userId,
          roomClassId: room.classId,
          roomType: room.type,
          roomSettings: {
            aiObjects: room.settings.aiObjects!,
            roomObjects: room.settings.roomObjects
          }
        },
        config,
        repository
      );
      return StartAiObjectJobResponseSchema.parse(result);
    } catch (err: unknown) {
      const e = err as Error & { code?: string; reason?: string };
      if (e.code === "quota_exceeded") {
        throw tooManyRequests(`Quota exceeded: ${e.reason ?? "unknown"}`);
      }
      if (e.code === "prompt_too_long") throw badRequest("Prompt exceeds maximum length");
      throw err;
    }
  });

  app.get("/v1/rooms/:roomId/ai-objects/jobs", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    const jobs = await repository.listAiObjectJobsForRoom(params.roomId, { limit: 20 });
    return ListAiObjectJobsResponseSchema.parse({ jobs });
  });

  app.get("/v1/rooms/:roomId/ai-objects/jobs/:jobId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithJobId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    const job = await repository.getAiObjectJob(params.jobId);
    if (!job || job.roomId !== params.roomId) throw notFound("AI object job not found");
    return AiObjectJobSchema.parse(job);
  });

  app.patch("/v1/rooms/:roomId/ai-objects/jobs/:jobId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithJobId, request);
    const body = parseBody(PatchAiObjectJobRequestSchema, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    if (body.action === "cancel") {
      const result = await cancelAiObjectJob(params.jobId, params.roomId, auth.userId, config, repository);
      return { job: AiObjectJobSchema.parse(result.job), realtimeMessages: result.realtimeMessages };
    }
    throw badRequest("Unknown action");
  });

  app.delete("/v1/rooms/:roomId/ai-objects/jobs/:jobId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithJobId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    const result = await deleteAiObjectJob(params.jobId, params.roomId, auth.userId, config, repository);
    return { deleted: true, realtimeMessages: result.realtimeMessages };
  });

  app.get("/v1/rooms/:roomId/ai-objects/jobs/:jobId/object.glb", async (request, reply) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithJobId, request);
    const { room } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    const job = await repository.getAiObjectJob(params.jobId);
    if (!job || job.roomId !== params.roomId || !job.glbStorageKey) throw notFound("Job not found or not ready");
    const object = await readStoredObject(config, { storageKey: job.glbStorageKey });
    if (!object) throw notFound("Object not found in storage");
    const filename = aiObjectDownloadFilename(job as AiObjectJob);
    return reply
      .header("Content-Type", "model/gltf-binary")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(object.body);
  });

  app.post("/v1/rooms/:roomId/ai-objects/jobs/:jobId/place", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithJobId, request);
    const body = parseBody(PlaceAiObjectRequestSchema, request);
    const { room, manifest } = await requireRoomAccess(repository, params.roomId, auth);
    assertAiObjectsEnabled(room, config);
    assertRoomObjectsEnabled(config, room);
    const job = await repository.getAiObjectJob(params.jobId);
    if (!job || job.roomId !== params.roomId || !job.templateId) throw notFound("Job not ready for placement");
    const template = await repository.getRoomObjectTemplate(job.templateId);
    if (!template) throw notFound("AI object template not found");
    await enforceActiveRoomObjectCap(repository, room);
    const pose = clampRoomObjectPose(manifest, body.position
      ? { position: body.position, rotation: body.rotation ?? { yaw: 0, pitch: 0, roll: 0 } }
      : template.defaultPose
    );
    const object = RoomObjectSchema.parse(
      await repository.createRoomObject({
        roomId: params.roomId,
        templateId: template.id,
        displayName: template.displayName,
        pose,
        scale: template.defaultScale,
        parameters: template.defaultParameters,
        touchPolicy: template.recommendedTouchPolicy,
        grantedUserIds: [],
        grantedGroupIds: [],
        status: "active",
        createdByUserId: auth.userId
      })
    );
    const realtimeMessages = [buildRoomObjectUpsertMessage({ roomId: params.roomId, object, senderId: auth.userId })];
    return PlaceAiObjectResponseSchema.parse({ object, template, realtimeMessages });
  });
}
