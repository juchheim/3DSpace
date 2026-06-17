import { z } from "zod";
import * as foundation from "./foundation.js";
import * as room from "./room.js";
const dependencies = { ...foundation, ...room } as typeof foundation & typeof room;
const {
  AiHostBuildHelpContextSchema,
  RoomAiHostChatMessageSchema,
  RoomAiHostChatModeSchema,
  RoomAiHostFileChunkSchema,
  RoomAiHostFileSchema,
  RoomAiHostFileStatusSchema,
  RoomAiHostRealtimeMessageSchema,
  RoomAiHostSchema,
  RoomObjectSchema,
  RoomObjectTemplateSchema
} = dependencies;// ─── AI 3D Object Generator ──────────────────────────────────────────────────

export const AiObjectJobStatusSchema = z.enum([
  "queued", "refining", "composing", "validating",
  "ready", "error", "cancelled", "rejected"
]);

export const AiObjectJobErrorCodeSchema = z.enum([
  "prompt_rejected", "outside_procedural_scope", "provider_timeout", "provider_error",
  "validation_failed", "quota_exceeded", "internal"
]);

export const AiObjectJobStylePresetSchema = z.enum([
  "realistic", "stylized-low-poly", "cartoon", "sculpture"
]);

export const AiObjectJobComplexitySchema = z.enum(["small", "medium", "detailed"]);

export const AiObjectJobSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  requestedByUserId: z.string().min(1),
  prompt: z.string().min(1).max(2000),
  proceduralSpecJson: z.string().optional(),
  refinedPrompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  stylePreset: AiObjectJobStylePresetSchema.optional(),
  complexity: AiObjectJobComplexitySchema.optional(),
  polycountTarget: z.number().int().positive().optional(),
  status: AiObjectJobStatusSchema,
  providerName: z.string(),
  providerJobId: z.string().optional(),
  providerProgressPercent: z.number().min(0).max(100).optional(),
  errorCode: AiObjectJobErrorCodeSchema.optional(),
  errorMessage: z.string().optional(),
  templateId: z.string().optional(),
  glbStorageKey: z.string().optional(),
  thumbnailStorageKey: z.string().optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  triangleCount: z.number().int().nonnegative().optional(),
  textureMaxDim: z.number().int().nonnegative().optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const StartAiObjectJobRequestSchema = z.object({
  prompt: z.string().min(1).max(500),
  stylePreset: AiObjectJobStylePresetSchema.optional(),
  complexity: AiObjectJobComplexitySchema.optional(),
  polycountTarget: z.number().int().positive().max(200000).optional()
});

export const StartAiObjectJobResponseSchema = z.object({
  job: AiObjectJobSchema,
  realtimeMessages: z.array(z.unknown()).default([])
});

export const PatchAiObjectJobRequestSchema = z.object({
  action: z.literal("cancel")
});

export const ListAiObjectJobsResponseSchema = z.object({
  jobs: z.array(AiObjectJobSchema)
});

export const PlaceAiObjectRequestSchema = z.object({
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  rotation: z.object({ yaw: z.number(), pitch: z.number(), roll: z.number() }).optional()
});

export const PlaceAiObjectResponseSchema = z.object({
  object: RoomObjectSchema,
  template: RoomObjectTemplateSchema,
  realtimeMessages: z.array(z.unknown())
});

export const GetRoomObjectTemplateQuerySchema = z.object({
  roomId: z.string()
});

export const AiObjectStartedMessageV1Schema = z.object({
  type: z.literal("room.ai-object.started.v1"),
  roomId: z.string(),
  jobId: z.string(),
  requestedByUserId: z.string(),
  prompt: z.string(),
  startedAt: z.string().datetime(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const AiObjectProgressMessageV1Schema = z.object({
  type: z.literal("room.ai-object.progress.v1"),
  roomId: z.string(),
  jobId: z.string(),
  status: AiObjectJobStatusSchema,
  providerProgressPercent: z.number().min(0).max(100).optional(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const AiObjectReadyMessageV1Schema = z.object({
  type: z.literal("room.ai-object.ready.v1"),
  roomId: z.string(),
  jobId: z.string(),
  templateId: z.string(),
  fileSizeBytes: z.number().int().nonnegative(),
  triangleCount: z.number().int().nonnegative(),
  thumbnailUrl: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const AiObjectErrorMessageV1Schema = z.object({
  type: z.literal("room.ai-object.error.v1"),
  roomId: z.string(),
  jobId: z.string(),
  errorCode: AiObjectJobErrorCodeSchema,
  errorMessage: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const AiObjectCancelledMessageV1Schema = z.object({
  type: z.literal("room.ai-object.cancelled.v1"),
  roomId: z.string(),
  jobId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const AiObjectDeletedMessageV1Schema = z.object({
  type: z.literal("room.ai-object.deleted.v1"),
  roomId: z.string(),
  jobId: z.string(),
  templateId: z.string().optional(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export type AiObjectJobStatus = z.infer<typeof AiObjectJobStatusSchema>;
export type AiObjectJobErrorCode = z.infer<typeof AiObjectJobErrorCodeSchema>;
export type AiObjectJobStylePreset = z.infer<typeof AiObjectJobStylePresetSchema>;
export type AiObjectJobComplexity = z.infer<typeof AiObjectJobComplexitySchema>;
export type AiObjectJob = z.infer<typeof AiObjectJobSchema>;
export type StartAiObjectJobRequest = z.infer<typeof StartAiObjectJobRequestSchema>;
export type AiObjectStartedMessageV1 = z.infer<typeof AiObjectStartedMessageV1Schema>;
export type AiObjectProgressMessageV1 = z.infer<typeof AiObjectProgressMessageV1Schema>;
export type AiObjectReadyMessageV1 = z.infer<typeof AiObjectReadyMessageV1Schema>;
export type AiObjectErrorMessageV1 = z.infer<typeof AiObjectErrorMessageV1Schema>;
export type AiObjectCancelledMessageV1 = z.infer<typeof AiObjectCancelledMessageV1Schema>;
export type AiObjectDeletedMessageV1 = z.infer<typeof AiObjectDeletedMessageV1Schema>;
export type StartAiObjectJobResponse = z.infer<typeof StartAiObjectJobResponseSchema>;
export type ListAiObjectJobsResponse = z.infer<typeof ListAiObjectJobsResponseSchema>;
export type PlaceAiObjectRequest = z.infer<typeof PlaceAiObjectRequestSchema>;

export type AiObjectRealtimeMessage =
  | AiObjectStartedMessageV1
  | AiObjectProgressMessageV1
  | AiObjectReadyMessageV1
  | AiObjectErrorMessageV1
  | AiObjectCancelledMessageV1
  | AiObjectDeletedMessageV1;

export type RoomAiHost = z.infer<typeof RoomAiHostSchema>;
export type RoomAiHostFile = z.infer<typeof RoomAiHostFileSchema>;
export type RoomAiHostFileChunk = z.infer<typeof RoomAiHostFileChunkSchema>;
export type RoomAiHostChatMessage = z.infer<typeof RoomAiHostChatMessageSchema>;
export type RoomAiHostChatMode = z.infer<typeof RoomAiHostChatModeSchema>;
export type RoomAiHostFileStatus = z.infer<typeof RoomAiHostFileStatusSchema>;
export type AiHostBuildHelpContext = z.infer<typeof AiHostBuildHelpContextSchema>;

export type RoomAiHostRealtimeMessage = z.infer<typeof RoomAiHostRealtimeMessageSchema>;

export const FreeForAllRoomSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  classId: z.string(),
  createdAt: z.string(),
  participantCount: z.number().int().nonnegative()
});
export const ListFreeForAllRoomsResponseSchema = z.object({
  rooms: z.array(FreeForAllRoomSummarySchema)
});
export type FreeForAllRoomSummary = z.infer<typeof FreeForAllRoomSummarySchema>;
export type ListFreeForAllRoomsResponse = z.infer<typeof ListFreeForAllRoomsResponseSchema>;
