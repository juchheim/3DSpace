import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AiObjectCancelledMessageV1,
  AiObjectDeletedMessageV1,
  AiObjectErrorMessageV1,
  AiObjectJob,
  AiObjectProgressMessageV1,
  AiObjectReadyMessageV1,
  AiObjectStartedMessageV1,
  StartAiObjectJobRequest
} from "@3dspace/contracts";
import { AiObjectJobSchema } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { buildRoomObjectTemplateSlug } from "../room-objects/custom-template-upload.js";
import type { Repository } from "../repository.js";
import { newId, nowIso } from "../repository.js";
import { roomObjectAssetUrl, writeStoredObject } from "../services/storage.js";
import { getGenerationBackend } from "./backends/index.js";
import { ProceduralObjectSpecSchema } from "./procedural-spec-schema.js";
import { composeFromPrompt } from "./prompt-composer.js";
import { validateWithRepair } from "./repair-pipeline.js";
import type { ProceduralObjectSpec, StageAOutput } from "./types.js";

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), "fixtures/test-cube-spec.json");

const ACTIVE_STATUSES = new Set(["queued", "refining", "composing", "validating"]);

function slugifyPrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40) || "";
}

function fileTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function aiObjectDownloadFilename(job: AiObjectJob): string {
  const slug = slugifyPrompt(job.prompt);
  const ts = fileTimestamp(job.startedAt);
  return slug ? `ai-object-${slug}-${ts}.glb` : `ai-object-${job.id}.glb`;
}

function makeStartedMessage(job: AiObjectJob, senderId: string): AiObjectStartedMessageV1 {
  return { type: "room.ai-object.started.v1", roomId: job.roomId, jobId: job.id, requestedByUserId: job.requestedByUserId, prompt: job.prompt, startedAt: job.startedAt, sentAt: Date.now(), senderId };
}

function makeProgressMessage(job: AiObjectJob, senderId: string): AiObjectProgressMessageV1 {
  return { type: "room.ai-object.progress.v1", roomId: job.roomId, jobId: job.id, status: job.status, providerProgressPercent: job.providerProgressPercent, sentAt: Date.now(), senderId };
}

function makeReadyMessage(job: AiObjectJob, senderId: string, thumbnailUrl: string): AiObjectReadyMessageV1 {
  return { type: "room.ai-object.ready.v1", roomId: job.roomId, jobId: job.id, templateId: job.templateId!, fileSizeBytes: job.fileSizeBytes!, triangleCount: job.triangleCount!, thumbnailUrl, sentAt: Date.now(), senderId };
}

function makeErrorMessage(job: AiObjectJob, senderId: string): AiObjectErrorMessageV1 {
  return { type: "room.ai-object.error.v1", roomId: job.roomId, jobId: job.id, errorCode: job.errorCode!, errorMessage: job.errorMessage!, sentAt: Date.now(), senderId };
}

export type StartJobResult = {
  job: AiObjectJob;
  realtimeMessages: unknown[];
};

export async function startJob(
  input: StartAiObjectJobRequest & { roomId: string; userId: string; roomClassId: string; roomType: string; roomSettings: { aiObjects: { enabled: boolean; maxConcurrentJobsPerRoom: number; maxConcurrentJobsPerUser: number; maxJobsPerUserPerDay: number; defaultPolycountTarget: number }; roomObjects: { maxUploadSizeBytes: number } } },
  config: AppConfig,
  repository: Repository
): Promise<StartJobResult> {
  const now = nowIso();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const aiSettings = input.roomSettings.aiObjects;

  // Quota checks
  const [roomActive, userActive, userDaily] = await Promise.all([
    repository.countActiveAiObjectJobsForRoom(input.roomId),
    repository.countActiveAiObjectJobsForUser(input.roomId, input.userId),
    repository.countAiObjectJobsForUserSince(input.userId, dayAgo)
  ]);

  if (roomActive >= aiSettings.maxConcurrentJobsPerRoom) {
    const err = new Error("quota_exceeded:room_concurrency") as Error & { code: string; reason: string };
    err.code = "quota_exceeded"; err.reason = "room_concurrency";
    throw err;
  }
  if (userActive >= aiSettings.maxConcurrentJobsPerUser) {
    const err = new Error("quota_exceeded:user_concurrency") as Error & { code: string; reason: string };
    err.code = "quota_exceeded"; err.reason = "user_concurrency";
    throw err;
  }
  if (userDaily >= (config.tuning.aiObjectMaxJobsPerUserPerDay ?? 20)) {
    const err = new Error("quota_exceeded:user_daily") as Error & { code: string; reason: string };
    err.code = "quota_exceeded"; err.reason = "user_daily";
    throw err;
  }

  // Prompt length check
  if (input.prompt.length > config.tuning.aiObjectMaxPromptChars) {
    throw Object.assign(new Error("Prompt too long"), { code: "prompt_too_long" });
  }

  const jobId = newId("aiobj");
  const providerName = config.tuning.aiObjectProvider;

  let job: AiObjectJob = AiObjectJobSchema.parse({
    id: jobId,
    roomId: input.roomId,
    requestedByUserId: input.userId,
    prompt: input.prompt,
    stylePreset: input.stylePreset,
    complexity: input.complexity,
    polycountTarget: input.polycountTarget ?? aiSettings.defaultPolycountTarget,
    status: "queued",
    providerName,
    startedAt: now,
    createdAt: now,
    updatedAt: now
  });

  await repository.createAiObjectJob(job);
  const realtimeMessages: unknown[] = [makeStartedMessage(job, input.userId)];

  // Run generation asynchronously — don't await
  runGeneration(job, input, config, repository).catch((err) => {
    console.error(`[ai-objects] Generation failed for job ${jobId}:`, err);
  });

  return { job, realtimeMessages };
}

async function runGeneration(
  job: AiObjectJob,
  input: StartAiObjectJobRequest & { roomId: string; userId: string; roomClassId: string; roomType: string; roomSettings: { aiObjects: { enabled: boolean; defaultPolycountTarget: number }; roomObjects: { maxUploadSizeBytes: number } } },
  config: AppConfig,
  repository: Repository
): Promise<void> {
  const broadcast = async (patch: Partial<AiObjectJob>) => {
    job = await repository.updateAiObjectJob(job.id, patch);
  };

  try {
    // ─── Stage A: prompt → spec ─────────────────────────────────────────────
    await broadcast({ status: "refining" });

    let stageAOutput: StageAOutput | { rejected: true; reason: string; code?: "outside_procedural_scope" | "prompt_rejected" };

    const useFixture = config.tuning.aiObjectUseTestFixture || process.env.NODE_ENV === "test";

    if (useFixture) {
      const specJson = await readFile(FIXTURE_PATH, "utf8");
      const spec = ProceduralObjectSpecSchema.parse(JSON.parse(specJson));
      stageAOutput = { mode: "procedural", spec: spec as ProceduralObjectSpec };
    } else {
      stageAOutput = await composeFromPrompt(
        {
          prompt: input.prompt,
          ...(input.stylePreset !== undefined ? { stylePreset: input.stylePreset } : {}),
          ...(input.complexity !== undefined ? { complexity: input.complexity } : {}),
          ...(input.polycountTarget !== undefined ? { polycountTarget: input.polycountTarget } : (job.polycountTarget !== undefined ? { polycountTarget: job.polycountTarget } : {})),
          mode: config.tuning.aiObjectProvider
        },
        config
      );

      if ("rejected" in stageAOutput && stageAOutput.rejected) {
        await broadcast({
          status: "rejected",
          errorCode: stageAOutput.code === "outside_procedural_scope" ? "outside_procedural_scope" : "prompt_rejected",
          errorMessage: stageAOutput.reason,
          finishedAt: nowIso(),
          durationMs: Date.now() - new Date(job.startedAt).getTime()
        });
        return;
      }
    }

    if (!("mode" in stageAOutput)) {
      throw new Error("Unexpected stage A output");
    }

    const specPatch: Partial<AiObjectJob> = {};
    if (stageAOutput.mode === "procedural" && !useFixture) {
      specPatch.proceduralSpecJson = JSON.stringify(stageAOutput.spec);
    } else if (stageAOutput.mode === "meshy" && !useFixture) {
      specPatch.refinedPrompt = stageAOutput.envelope.refinedPrompt;
      specPatch.negativePrompt = stageAOutput.envelope.negativePrompt;
    }

    // ─── Stage B: generate GLB ──────────────────────────────────────────────
    await broadcast({ status: "composing", ...specPatch });

    const backend = getGenerationBackend(config);
    const { glbBytes, thumbnailBytes, triangleCount } = await backend.generate(stageAOutput);

    // ─── Stage C: validate + repair ─────────────────────────────────────────
    await broadcast({ status: "validating" });

    const maxUploadSizeBytes = input.roomSettings.roomObjects.maxUploadSizeBytes;
    const polycountTarget = input.polycountTarget ?? job.polycountTarget ?? input.roomSettings.aiObjects.defaultPolycountTarget;

    let validatedBytes: Buffer;
    let validation: { fileSizeBytes: number; triangleCount: number };
    try {
      const result = await validateWithRepair({ bytes: glbBytes, polycountTarget, maxUploadSizeBytes });
      validatedBytes = result.bytes;
      validation = result.validation;
    } catch (err) {
      await broadcast({
        status: "error",
        errorCode: "validation_failed",
        errorMessage: err instanceof Error ? err.message : "Validation failed",
        finishedAt: nowIso(),
        durationMs: Date.now() - new Date(job.startedAt).getTime()
      });
      return;
    }

    // ─── Stage D: persist ────────────────────────────────────────────────────
    const prefix = config.tuning.aiObjectStoragePrefix;
    const glbKey = `${prefix}${job.roomId}/${job.id}/object.glb`;
    const thumbKey = `${prefix}${job.roomId}/${job.id}/thumbnail.png`;

    await Promise.all([
      writeStoredObject(config, { storageKey: glbKey, body: validatedBytes, contentType: "model/gltf-binary" }),
      writeStoredObject(config, { storageKey: thumbKey, body: thumbnailBytes, contentType: "image/png" })
    ]);

    const assetUrl = roomObjectAssetUrl(config, glbKey);
    const thumbnailUrl = roomObjectAssetUrl(config, thumbKey);
    const shortPrompt = input.prompt.slice(0, 40);

    const template = await repository.createRoomObjectTemplate({
      slug: buildRoomObjectTemplateSlug(`ai-${shortPrompt}`),
      displayName: shortPrompt,
      category: "custom",
      description: (job.proceduralSpecJson ?? job.refinedPrompt ?? job.prompt).slice(0, 500),
      assetUrl,
      thumbnailUrl,
      defaultPose: { position: { x: 0, y: 1.1, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 } },
      defaultScale: 1,
      defaultParameters: {},
      parameterSchemaJson: "{}",
      recommendedTouchPolicy: "all-class",
      kinematic: false,
      ownerClassId: input.roomClassId,
      visibleRoomTypes: ["free-for-all"],
      source: "ai-generated",
      license: "ai-generated",
      attribution: `Generated (${job.providerName}) from prompt "${input.prompt}"`,
      renderer: "gltf",
      exportable: true,
      fileSizeBytes: validation.fileSizeBytes,
      triangleCount: validation.triangleCount
    });

    const finishedAt = nowIso();
    await broadcast({
      status: "ready",
      templateId: template.id,
      glbStorageKey: glbKey,
      thumbnailStorageKey: thumbKey,
      fileSizeBytes: validation.fileSizeBytes,
      triangleCount: validation.triangleCount,
      finishedAt,
      durationMs: Date.now() - new Date(job.startedAt).getTime()
    });
  } catch (err) {
    console.error(`[ai-objects] Job ${job.id} error:`, err);
    await repository.updateAiObjectJob(job.id, {
      status: "error",
      errorCode: "internal",
      errorMessage: err instanceof Error ? err.message : "Internal error",
      finishedAt: nowIso(),
      durationMs: Date.now() - new Date(job.startedAt).getTime()
    }).catch(() => {});
  }
}

export async function cancelJob(
  jobId: string,
  roomId: string,
  userId: string,
  config: AppConfig,
  repository: Repository
): Promise<{ job: AiObjectJob; realtimeMessages: unknown[] }> {
  const existing = await repository.getAiObjectJob(jobId);
  if (!existing || existing.roomId !== roomId) throw Object.assign(new Error("Job not found"), { statusCode: 404 });

  if (!ACTIVE_STATUSES.has(existing.status)) {
    return { job: existing, realtimeMessages: [] };
  }

  const job = await repository.updateAiObjectJob(jobId, {
    status: "cancelled",
    finishedAt: nowIso(),
    durationMs: Date.now() - new Date(existing.startedAt).getTime()
  });

  const msg: AiObjectCancelledMessageV1 = {
    type: "room.ai-object.cancelled.v1",
    roomId,
    jobId,
    sentAt: Date.now(),
    senderId: userId
  };
  return { job, realtimeMessages: [msg] };
}

export async function deleteJob(
  jobId: string,
  roomId: string,
  userId: string,
  config: AppConfig,
  repository: Repository
): Promise<{ realtimeMessages: unknown[] }> {
  const existing = await repository.getAiObjectJob(jobId);
  if (!existing || existing.roomId !== roomId) throw Object.assign(new Error("Job not found"), { statusCode: 404 });

  // Cascade: remove placed RoomObject instances
  const { deleteStoredObject } = await import("../services/storage.js");
  if (existing.templateId) {
    const objects = await repository.listRoomObjectsForRoom(roomId);
    const placed = objects.filter((o) => o.templateId === existing.templateId && o.status !== "archived");
    for (const obj of placed) {
      await repository.removeRoomObject(roomId, obj.id).catch(() => {});
    }
    await repository.archiveRoomObjectTemplate(existing.templateId).catch(() => {});
  }

  if (existing.glbStorageKey) await deleteStoredObject(config, { storageKey: existing.glbStorageKey }).catch(() => {});
  if (existing.thumbnailStorageKey) await deleteStoredObject(config, { storageKey: existing.thumbnailStorageKey }).catch(() => {});

  await repository.deleteAiObjectJob(jobId, roomId);

  const msg: AiObjectDeletedMessageV1 = {
    type: "room.ai-object.deleted.v1",
    roomId,
    jobId,
    templateId: existing.templateId,
    sentAt: Date.now(),
    senderId: userId
  };
  return { realtimeMessages: [msg] };
}
