import { z } from "zod";
import { Vector3Schema } from "./foundation.js";

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color");

export const ROOM_LIGHT_MAX_PER_ROOM = 64;
export const ROOM_LIGHT_MAX_AREA = 2;
export const LIGHT_MAX_INTENSITY = 20;
export const LIGHT_MAX_DISTANCE = 100;
export const LIGHT_MAX_AREA_SIZE = 10;

export const RoomLightTypeSchema = z.enum(["point", "spot", "area"]);
export type RoomLightType = z.infer<typeof RoomLightTypeSchema>;

export const RoomLightSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  type: RoomLightTypeSchema,
  name: z.string().max(60).optional(),
  enabled: z.boolean().default(true),

  position: Vector3Schema,
  target: Vector3Schema.optional(),
  rotation: Vector3Schema.optional(),

  color: HexColorSchema,
  intensity: z.number().min(0).max(LIGHT_MAX_INTENSITY),
  castShadow: z.boolean().default(false),

  distance: z.number().min(0).max(LIGHT_MAX_DISTANCE).optional(),
  decay: z.number().min(0).max(4).optional(),

  angleDeg: z.number().min(1).max(90).optional(),
  penumbra: z.number().min(0).max(1).optional(),

  width: z.number().positive().max(LIGHT_MAX_AREA_SIZE).optional(),
  height: z.number().positive().max(LIGHT_MAX_AREA_SIZE).optional(),

  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).superRefine((data, ctx) => {
  if (data.type === "spot") {
    if (!data.target) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "spot light requires target", path: ["target"] });
    if (data.angleDeg === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "spot light requires angleDeg", path: ["angleDeg"] });
  }
  if (data.type === "area") {
    if (data.castShadow) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "area lights cannot cast shadows", path: ["castShadow"] });
    if (data.distance !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "area lights do not support distance", path: ["distance"] });
    if (data.decay !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "area lights do not support decay", path: ["decay"] });
    if (data.angleDeg !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "area lights do not support angleDeg", path: ["angleDeg"] });
    if (data.width === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "area light requires width", path: ["width"] });
    if (data.height === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "area light requires height", path: ["height"] });
  }
});
export type RoomLight = z.infer<typeof RoomLightSchema>;

export const CreateRoomLightRequestSchema = z.object({
  type: RoomLightTypeSchema,
  name: z.string().max(60).optional(),
  position: Vector3Schema,
  target: Vector3Schema.optional(),
  rotation: Vector3Schema.optional(),
  color: HexColorSchema,
  intensity: z.number().min(0).max(LIGHT_MAX_INTENSITY),
  castShadow: z.boolean().default(false),
  distance: z.number().min(0).max(LIGHT_MAX_DISTANCE).optional(),
  decay: z.number().min(0).max(4).optional(),
  angleDeg: z.number().min(1).max(90).optional(),
  penumbra: z.number().min(0).max(1).optional(),
  width: z.number().positive().max(LIGHT_MAX_AREA_SIZE).optional(),
  height: z.number().positive().max(LIGHT_MAX_AREA_SIZE).optional(),
});

export const UpdateRoomLightRequestSchema = CreateRoomLightRequestSchema.partial()
  .omit({ type: true })
  .extend({ enabled: z.boolean().optional() });

const RoomLightUpsertMessageSchema = z.object({
  type: z.literal("room.light.upsert.v1"),
  roomId: z.string(),
  light: RoomLightSchema,
  sentAt: z.number().int(),
  senderId: z.string(),
});

const RoomLightRemoveMessageSchema = z.object({
  type: z.literal("room.light.remove.v1"),
  roomId: z.string(),
  lightId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string(),
});

export const RoomLightRealtimeMessageSchema = z.discriminatedUnion("type", [
  RoomLightUpsertMessageSchema,
  RoomLightRemoveMessageSchema,
]);
export type RoomLightRealtimeMessage = z.infer<typeof RoomLightRealtimeMessageSchema>;

export const CreateRoomLightResponseSchema = z.object({
  light: RoomLightSchema,
  realtimeMessages: z.array(RoomLightRealtimeMessageSchema).default([]),
});

export const ListRoomLightsResponseSchema = z.object({
  lights: z.array(RoomLightSchema),
});

export const UpdateRoomLightResponseSchema = z.object({
  light: RoomLightSchema,
  realtimeMessages: z.array(RoomLightRealtimeMessageSchema).default([]),
});

export const DeleteRoomLightResponseSchema = z.object({
  realtimeMessages: z.array(RoomLightRealtimeMessageSchema).default([]),
});

// ── Room Environment ──────────────────────────────────────────────────────────

export const RoomEnvironmentSchema = z.object({
  enabled: z.boolean().default(false),
  preset: z.string().optional(),

  sun: z.object({
    enabled: z.boolean().default(true),
    azimuthDeg: z.number().min(0).max(360).default(180),
    elevationDeg: z.number().min(-10).max(90).default(45),
    color: HexColorSchema.default("#ffffff"),
    intensity: z.number().min(0).max(4).default(1),
    castShadow: z.boolean().default(true),
  }).default({}),

  sky: z.object({
    hemisphere: z.boolean().default(true),
    skyColor: HexColorSchema.default("#87ceeb"),
    groundColor: HexColorSchema.default("#8b7355"),
    hemisphereIntensity: z.number().min(0).max(3).default(0.5),
    ambientColor: HexColorSchema.default("#ffffff"),
    ambientIntensity: z.number().min(0).max(3).default(0.2),
  }).default({}),

  ibl: z.object({
    preset: z.enum(["none", "studio", "sunset", "dawn", "night", "warehouse", "park", "apartment"]).default("none"),
    intensity: z.number().min(0).max(3).default(1),
    asBackground: z.boolean().default(false),
  }).default({}),

  fog: z.object({
    enabled: z.boolean().default(false),
    color: HexColorSchema.default("#cccccc"),
    near: z.number().positive().default(20),
    far: z.number().positive().default(100),
  }).default({}),

  exposure: z.object({
    toneMapping: z.enum(["none", "aces", "agx", "neutral"]).default("none"),
    exposure: z.number().min(0).max(3).default(1),
  }).default({}),
});
export type RoomEnvironment = z.infer<typeof RoomEnvironmentSchema>;

export function defaultRoomEnvironment(): RoomEnvironment {
  return RoomEnvironmentSchema.parse({});
}

const RoomLightingEnvironmentMessageSchema = z.object({
  type: z.literal("room.lighting.environment.v1"),
  roomId: z.string(),
  environment: RoomEnvironmentSchema,
  sentAt: z.number().int(),
  senderId: z.string(),
});

export const RoomLightingRealtimeMessageSchema = z.discriminatedUnion("type", [
  RoomLightUpsertMessageSchema,
  RoomLightRemoveMessageSchema,
  RoomLightingEnvironmentMessageSchema,
]);
export type RoomLightingRealtimeMessage = z.infer<typeof RoomLightingRealtimeMessageSchema>;

export const GetRoomEnvironmentResponseSchema = z.object({
  environment: RoomEnvironmentSchema,
});

export const SetRoomEnvironmentRequestSchema = RoomEnvironmentSchema.partial();

export const SetRoomEnvironmentResponseSchema = z.object({
  environment: RoomEnvironmentSchema,
  realtimeMessages: z.array(RoomLightingRealtimeMessageSchema).default([]),
});
