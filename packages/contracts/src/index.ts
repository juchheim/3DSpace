import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

export const RoleSchema = z.enum(["teacher", "student"]);
export const ViewModeSchema = z.enum(["3d", "2d"]);
export const QualityLevelSchema = z.enum(["low", "medium", "high"]);
export const AttachmentKindSchema = z.enum(["image", "video", "audio", "future"]);
export const MembershipStatusSchema = z.enum(["active", "invited", "removed"]);
export const AttachmentStatusSchema = z.enum(["pending_upload", "ready", "rejected"]);
export const DistanceModelSchema = z.enum(["linear", "inverse", "exponential"]);
export const WallObjectCreationPolicySchema = z.enum(["teacher-only", "student-request", "student-direct"]);
export const WallObjectModerationPolicySchema = z.enum(["pre", "post", "off"]);
export const WallObjectTypeSchema = z.enum([
  "image.file",
  "video.file",
  "audio.file",
  "camera.live",
  "microphone.live",
  "screen.live",
  "browser-tab.live",
  "web.embed",
  "web.link",
  "document.file",
  "slides.file",
  "whiteboard",
  "note",
  "poll",
  "timer",
  "future"
]);
export const WallObjectStatusSchema = z.enum([
  "draft",
  "pending_upload",
  "pending_moderation",
  "active",
  "paused",
  "source_ended",
  "failed",
  "removed",
  "rejected"
]);

export const Vector2Schema = z.object({
  x: z.number(),
  y: z.number()
});

export const Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

export const RotationSchema = z.object({
  y: z.number()
});

export const SpatialAudioConfigSchema = z.object({
  enabled: z.boolean(),
  distanceModel: DistanceModelSchema,
  refDistance: z.number().positive(),
  maxDistance: z.number().positive(),
  rolloffFactor: z.number().nonnegative()
});

export const RoomBoundsSchema = z.object({
  minX: z.number(),
  maxX: z.number(),
  minZ: z.number(),
  maxZ: z.number()
});

export const SpawnPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  position: Vector3Schema,
  rotation: RotationSchema
});

export const WallAnchorSchema = z.object({
  id: z.string(),
  label: z.string(),
  position: Vector3Schema,
  normal: Vector3Schema,
  width: z.number().positive(),
  height: z.number().positive(),
  metadata: z.record(z.unknown()).default({})
});

export const DynamicWallAnchorSchema = WallAnchorSchema.extend({
  roomId: z.string().min(1),
  wallId: z.string().min(1),
  createdByUserId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type DynamicWallAnchor = z.infer<typeof DynamicWallAnchorSchema>;

export const DYNAMIC_WALL_ANCHOR_MIN_WIDTH_M = 1;
export const DYNAMIC_WALL_ANCHOR_MAX_WIDTH_M = 12;
export const DYNAMIC_WALL_ANCHOR_MIN_HEIGHT_M = 0.75;
export const DYNAMIC_WALL_ANCHOR_MAX_HEIGHT_M = 12;

export const CreateDynamicWallAnchorRequestSchema = z.object({
  wallId: z.string().min(1),
  center: Vector3Schema,
  normal: Vector3Schema,
  width: z.number().min(DYNAMIC_WALL_ANCHOR_MIN_WIDTH_M).max(DYNAMIC_WALL_ANCHOR_MAX_WIDTH_M),
  height: z.number().min(DYNAMIC_WALL_ANCHOR_MIN_HEIGHT_M).max(DYNAMIC_WALL_ANCHOR_MAX_HEIGHT_M),
  title: z.string().min(1).max(80),
  accepts: z.array(z.string()).default([
    "image", "video", "audio",
    "image.file", "video.file", "audio.file",
    "camera.live", "microphone.live", "screen.live", "browser-tab.live",
    "web.embed", "web.link", "document.file", "slides.file",
    "whiteboard", "note", "poll", "timer", "future"
  ])
});
export type CreateDynamicWallAnchorRequest = z.infer<typeof CreateDynamicWallAnchorRequestSchema>;

export const UpdateDynamicWallAnchorRequestSchema = CreateDynamicWallAnchorRequestSchema.partial();
export type UpdateDynamicWallAnchorRequest = z.infer<typeof UpdateDynamicWallAnchorRequestSchema>;

export const WallPlaneSchema = z.object({
  id: z.string(),
  label: z.string(),
  start: Vector3Schema,
  end: Vector3Schema,
  height: z.number().positive(),
  anchorIds: z.array(z.string()).default([]),
  passable: z.boolean().optional(),
  thickness: z.number().nonnegative().optional()
});

export const RoomFeatureSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  config: z.record(z.unknown()).default({})
});

export const RoomCapabilitiesSchema = z.object({
  maxParticipants: z.number().int().positive(),
  avatarSendHz: z.number().positive(),
  interpolationMs: z.number().nonnegative(),
  qualityLevels: z.array(QualityLevelSchema),
  twoDAnalog: z.boolean(),
  cameraBillboards: z.boolean(),
  spatialAudio: z.boolean(),
  wallAttachments: z.boolean(),
  wallObjects: z.boolean().default(false),
  wallLiveShares: z.boolean().default(false),
  wallWebLinks: z.boolean().default(false),
  wallWebEmbeds: z.boolean().default(false),
  roomEvents: z.boolean()
});

export const RoomProjectionSchema = z.object({
  kind: z.literal("top-down-v1"),
  scale: z.number().positive(),
  origin: Vector2Schema
});

export const FloorTierSchema = z.object({
  minZ: z.number(),
  maxZ: z.number(),
  floorY: z.number().nonnegative()
});

export const RoomManifestSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  dimensions: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
    height: z.number().positive()
  }),
  bounds: RoomBoundsSchema,
  spawnPoints: z.array(SpawnPointSchema).min(1),
  walls: z.array(WallPlaneSchema),
  wallAnchors: z.array(WallAnchorSchema),
  tiers: z.array(FloorTierSchema).default([]),
  projection: RoomProjectionSchema,
  capabilities: RoomCapabilitiesSchema,
  spatialAudio: SpatialAudioConfigSchema,
  features: z.array(RoomFeatureSchema).default([]),
  hallpassHoldingZone: RoomBoundsSchema.optional(),
  createdAt: z.string()
});

export const AvatarAppearanceSchema = z.object({
  hairTop:     z.string(),
  hairFront:   z.string(),
  headSide:    z.string(),
  hairBack:    z.string(),
  faceSkin:    z.string(),
  faceAccent:  z.string(),
  collar:      z.string(),
  shirtFront:  z.string(),
  shirtBelly:  z.string(),
  shirtBack:   z.string(),
  shirtSide:   z.string(),
  shoulderTop: z.string(),
  shoulderCap: z.string(),
  sleeve:      z.string(),
  hand:        z.string(),
  thigh:       z.string(),
  shin:        z.string(),
  legSide:     z.string(),
  legBack:     z.string(),
  shoeTop:     z.string(),
  shoeToe:     z.string(),
  shoeSide:    z.string(),
  shoeSole:    z.string(),
});

export type AvatarAppearance = z.infer<typeof AvatarAppearanceSchema>;

export const AvatarAppearanceMessageSchema = z.object({
  type:          z.literal("avatar.appearance.v1"),
  participantId: z.string(),
  appearance:    AvatarAppearanceSchema,
});

export type AvatarAppearanceMessage = z.infer<typeof AvatarAppearanceMessageSchema>;

export const ParticipantAudioModeSchema = z.enum(["normal", "whisper", "broadcast"]);

export const ParticipantAudioModeMessageSchema = z.object({
  type: z.literal("participant.audio-mode.v1"),
  participantId: z.string(),
  mode: ParticipantAudioModeSchema,
  radiusMeters: z.number().positive().max(20).default(3),
  podId: z.string().optional()
});

export type ParticipantAudioMode = z.infer<typeof ParticipantAudioModeSchema>;
export type ParticipantAudioModeMessage = z.infer<typeof ParticipantAudioModeMessageSchema>;

export const AvatarReactionSlugSchema = z.enum([
  "thumbs-up", "confused", "question", "me", "pause", "celebrate"
]);

export const AvatarReactionMessageSchema = z.object({
  type: z.literal("avatar.reaction.v1"),
  participantId: z.string(),
  reaction: AvatarReactionSlugSchema,
  expiresAt: z.string()
});

export type AvatarReactionSlug = z.infer<typeof AvatarReactionSlugSchema>;
export type AvatarReactionMessage = z.infer<typeof AvatarReactionMessageSchema>;

export const UserSchema = z.object({
  id: z.string(),
  externalAuthId: z.string(),
  displayName: z.string(),
  avatar: z.object({
    color: z.string(),
    initials: z.string(),
    appearance: AvatarAppearanceSchema.nullable().optional()
  }),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ClassSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  teacherUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CreateClassRequestSchema = z.object({
  name: z.string().min(1).max(120)
});

export const UpdateClassRequestSchema = z.object({
  name: z.string().min(1).max(120).optional()
});

export const ClassMembershipSchema = z.object({
  id: z.string(),
  classId: z.string(),
  userId: z.string(),
  role: RoleSchema,
  status: MembershipStatusSchema,
  displayName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const UpsertClassMemberRequestSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(120),
  role: RoleSchema,
  status: MembershipStatusSchema.default("active")
});

export const InviteSchema = z.object({
  id: z.string(),
  code: z.string(),
  classId: z.string(),
  roomId: z.string().optional(),
  role: RoleSchema,
  expiresAt: z.string().optional(),
  usedAt: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string()
});

export const CreateInviteRequestSchema = z.object({
  role: RoleSchema.default("student"),
  roomId: z.string().optional(),
  expiresInMinutes: z.number().int().positive().max(60 * 24 * 30).optional()
});

export const AcceptInviteResponseSchema = z.object({
  invite: InviteSchema,
  class: ClassSchema,
  membership: ClassMembershipSchema,
  roomId: z.string().optional()
});

// --- Room manipulatives (free-standing floor objects; distinct from WallObject) ---

export const PoseSchema = z.object({
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  rotation: z.object({
    yaw: z.number(),
    pitch: z.number().default(0),
    roll: z.number().default(0)
  })
});

export const RoomObjectTouchPolicySchema = z.enum(["teacher-only", "granted", "all-class"]);
export const RoomObjectStatusSchema = z.enum(["active", "locked", "archived"]);
export const RoomObjectSourceSchema = z.enum(["builtin", "custom", "partner"]);
export const RoomObjectRendererSchema = z.enum(["gltf", "procedural"]);
export const RoomTypeSchema = z.enum(["classroom", "workforce-training", "free-for-all"]);
export type RoomType = z.infer<typeof RoomTypeSchema>;
export const RoomObjectCategorySchema = z.enum(["math", "science", "geography", "ela", "art", "custom"]);

export const RoomObjectColorTintHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const RoomObjectParameterEnumOptionSchema = z.object({
  value: z.string(),
  label: z.string().min(1)
});

export const RoomObjectParameterFieldSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("enum"),
    label: z.string().min(1),
    default: z.string(),
    options: z.array(RoomObjectParameterEnumOptionSchema).min(1)
  }),
  z.object({
    type: z.literal("boolean"),
    label: z.string().min(1),
    default: z.boolean()
  }),
  z.object({
    type: z.literal("number"),
    label: z.string().min(1),
    default: z.number(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional()
  }),
  z.object({
    type: z.literal("range"),
    label: z.string().min(1),
    default: z.tuple([z.number(), z.number()]),
    min: z.number(),
    max: z.number(),
    step: z.number().optional()
  }),
  z.object({
    type: z.literal("vector3"),
    label: z.string().min(1),
    default: z.object({ x: z.number(), y: z.number(), z: z.number() })
  })
]);

/** Map of parameter key → field definition (stored on templates as JSON string). */
export const RoomObjectParameterSchemaMapSchema = z.record(z.string(), RoomObjectParameterFieldSchema);

export const RoomObjectTemplateSchema = z.object({
  id: z.string(),
  slug: z.string().min(2).max(64),
  displayName: z.string().min(1).max(120),
  category: RoomObjectCategorySchema,
  description: z.string().max(500),
  assetUrl: z.string().url().optional(),
  thumbnailUrl: z.string().min(1),
  defaultPose: PoseSchema,
  defaultScale: z.number().positive().default(1),
  defaultColorTintHex: RoomObjectColorTintHexSchema.optional(),
  defaultParameters: z.record(z.string(), z.unknown()).default({}),
  parameterSchemaJson: z.string().default("{}"),
  recommendedTouchPolicy: RoomObjectTouchPolicySchema.default("teacher-only"),
  kinematic: z.boolean().default(false),
  ownerClassId: z.string().optional(),
  visibleRoomTypes: z.array(RoomTypeSchema).min(1).default(["classroom"]),
  source: RoomObjectSourceSchema.default("builtin"),
  license: z.string().max(60).default("CC-BY"),
  attribution: z.string().max(240).default(""),
  renderer: RoomObjectRendererSchema.default("gltf"),
  proceduralId: z.string().min(1).optional(),
  exportable: z.boolean().default(true),
  fileSizeBytes: z.number().int().nonnegative(),
  triangleCount: z.number().int().nonnegative(),
  createdAt: z.string()
}).superRefine((value, ctx) => {
  if (value.renderer === "procedural" && !value.proceduralId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "proceduralId is required when renderer is procedural",
      path: ["proceduralId"]
    });
  }
  if (value.renderer === "gltf" && !value.assetUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "assetUrl is required when renderer is gltf",
      path: ["assetUrl"]
    });
  }
});

/** Scale limits relative to `RoomObjectTemplate.defaultScale`. */
export const ROOM_OBJECT_SCALE_MIN_MULTIPLIER = 0.5;
export const ROOM_OBJECT_SCALE_MAX_MULTIPLIER = 10;

export function roomObjectScaleBounds(templateDefaultScale: number) {
  return {
    min: templateDefaultScale * ROOM_OBJECT_SCALE_MIN_MULTIPLIER,
    max: templateDefaultScale * ROOM_OBJECT_SCALE_MAX_MULTIPLIER,
    step: templateDefaultScale * 0.05
  };
}

export function clampRoomObjectScaleValue(scale: number, templateDefaultScale: number) {
  const { min, max } = roomObjectScaleBounds(templateDefaultScale);
  return Math.min(Math.max(scale, min), max);
}

export const RoomObjectSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  templateId: z.string(),
  displayName: z.string().min(1).max(120),
  pose: PoseSchema,
  scale: z.number().positive(),
  colorTintHex: RoomObjectColorTintHexSchema.optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  touchPolicy: RoomObjectTouchPolicySchema.default("teacher-only"),
  grantedUserIds: z.array(z.string()).default([]),
  grantedGroupIds: z.array(z.string()).default([]),
  status: RoomObjectStatusSchema.default("active"),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const RoomObjectsSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  maxActive: z.number().int().positive().max(16).default(8),
  customUploadsEnabled: z.boolean().default(false),
  maxUploadSizeBytes: z.number().int().positive().default(15 * 1024 * 1024),
  defaultTouchPolicy: RoomObjectTouchPolicySchema.default("teacher-only")
});

export const ListRoomObjectTemplatesResponseSchema = z.object({
  templates: z.array(RoomObjectTemplateSchema)
});

export const ListRoomObjectTemplatesQuerySchema = z.object({
  roomId: z.string().min(1).optional()
});

// ── World Skins ───────────────────────────────────────────────────────────────

export const WorldSkinSlugSchema = z.string().min(2).max(64);

export const WorldSkinDayNightModeSchema = z.enum(["day", "night"]);

export const WorldSkinLightingPresetSchema = z.object({
  ambientColor: z.string(),
  ambientIntensity: z.number().min(0).max(4).default(0.82),
  directionalColor: z.string(),
  directionalIntensity: z.number().min(0).max(4).default(1.4),
  directionalPosition: z.tuple([z.number(), z.number(), z.number()]).default([4, 8, 6]),
  /** Optional second sun from the opposite side (e.g. back-wall fill on Mars). */
  directionalFillColor: z.string().optional(),
  directionalFillIntensity: z.number().min(0).max(4).optional(),
  directionalFillPosition: z.tuple([z.number(), z.number(), z.number()]).optional(),
  hemisphereSkyColor: z.string().optional(),
  hemisphereGroundColor: z.string().optional(),
  hemisphereIntensity: z.number().min(0).max(4).optional(),
  fogColor: z.string().optional(),
  fogNear: z.number().nonnegative().optional(),
  fogFar: z.number().nonnegative().optional(),
  backgroundColor: z.string().optional(),
  exposure: z.number().min(0).max(4).optional()
});

export const WorldSkinMaterialOverrideSchema = z.object({
  colorHex: z.string().optional(),
  textureStorageKey: z.string().optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  repeat: z.tuple([z.number().positive(), z.number().positive()]).optional()
});

/** Optional interior dome ceiling (e.g. rainforest canopy). Renders only when texture loads. */
export const WorldSkinDomeCeilingSchema = z.object({
  textureStorageKey: z.string().optional(),
  roughness: z.number().min(0).max(1).optional()
});

/** Classroom wall ids — keys for panorama unwrap slices. */
export const WorldSkinWallIdSchema = z.enum([
  "wall-front",
  "wall-left",
  "wall-right",
  "wall-back-lo",
  "wall-back-li",
  "wall-back-c",
  "wall-back-ri",
  "wall-back-ro"
]);

export const WorldSkinPanoramaSliceSchema = z.object({
  u0: z.number().min(0).max(1),
  u1: z.number().min(0).max(1),
  /** Bottom of slice is always v0 = 0; v1 = wallHeight / maxWorldHeight. */
  v1: z.number().min(0).max(1)
});

/** Single 8192×1024 unwrap for all walls — see docs/planning/new-features/WORLD_SKIN_PANORAMA_SPEC.md */
export const WorldSkinPanoramaWallSchema = z.object({
  storageKey: z.string().min(1),
  widthPx: z.literal(8192),
  heightPx: z.literal(1024),
  horizonWorldY: z.number().positive().default(5),
  maxWorldHeight: z.number().positive().default(8),
  unwrapOrder: z.array(WorldSkinWallIdSchema).length(8),
  slices: z.record(WorldSkinWallIdSchema, WorldSkinPanoramaSliceSchema)
});

export const WORLD_SKIN_PANORAMA_SLICES_DEFAULT: Record<
  z.infer<typeof WorldSkinWallIdSchema>,
  z.infer<typeof WorldSkinPanoramaSliceSchema>
> = {
  "wall-left": { u0: 0, u1: 0.25, v1: 1 },
  "wall-front": { u0: 0.25, u1: 0.5, v1: 1 },
  "wall-right": { u0: 0.5, u1: 0.75, v1: 1 },
  "wall-back-lo": { u0: 0.75, u1: 0.8, v1: 1 },
  "wall-back-li": { u0: 0.8, u1: 0.85, v1: 1 },
  "wall-back-c": { u0: 0.85, u1: 0.9, v1: 1 },
  "wall-back-ri": { u0: 0.9, u1: 0.95, v1: 1 },
  "wall-back-ro": { u0: 0.95, u1: 1, v1: 1 }
};

export const WorldSkinOverridesSchema = z.object({
  /** Production path: one 8192×1024 panorama.webp (preferred). */
  panoramaWall: WorldSkinPanoramaWallSchema.optional(),
  /** Phase 0 / fallback: per-wall color or legacy per-wall textures. */
  walls: z.record(z.string(), WorldSkinMaterialOverrideSchema).default({}),
  floor: WorldSkinMaterialOverrideSchema.optional(),
  tiers: WorldSkinMaterialOverrideSchema.optional(),
  /** When present, mounts a dome at wall height; invisible until `textureStorageKey` loads. */
  domeCeiling: WorldSkinDomeCeilingSchema.optional(),
  lighting: WorldSkinLightingPresetSchema,
  lightingNight: WorldSkinLightingPresetSchema.optional(),
  sky: z.object({
    kind: z.enum(["color", "panorama"]).default("color"),
    storageKey: z.string().optional()
  }).optional(),
  walkSpeedMultiplier: z.number().positive().max(2).optional(),
  avatarScale: z.number().positive().max(2).optional(),
  map2dStorageKey: z.string().optional(),
  boardDarkenOpacity: z.number().min(0).max(1).optional(),
  ambient: z.object({
    storageKey: z.string(),
    defaultGain: z.number().min(0).max(1).default(0.15),
    minGrade: z.string().optional()
  }).optional(),
  props: z.array(z.unknown()).default([])
});

export const WorldSkinSchema = z.object({
  id: z.string(),
  slug: WorldSkinSlugSchema,
  label: z.string().min(1),
  description: z.string().max(500),
  gradeBands: z.array(z.string()).default([]),
  subjects: z.array(z.string()).default([]),
  baseManifestId: z.string().default("default-theater"),
  version: z.number().int().positive(),
  overrides: WorldSkinOverridesSchema,
  thumbnailStorageKey: z.string(),
  standardsCrosswalkUrl: z.string().optional(),
  licenseAttribution: z.array(z.object({
    assetId: z.string(),
    notice: z.string()
  })).default([]),
  review: z.object({
    reviewedAt: z.string(),
    reviewer: z.string(),
    notes: z.string().optional()
  }).optional(),
  source: z.enum(["builtin", "district"]).default("builtin"),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type WorldSkin = z.infer<typeof WorldSkinSchema>;

export const ListWorldSkinsResponseSchema = z.object({
  skins: z.array(WorldSkinSchema)
});

/** Applied when room.settings.worldSkins.skinId is null (picker "Default theater"). */
export const WORLD_SKIN_DEFAULT_THEATER_SLUG = "default-theater" as const;

export const WORLD_SKIN_BUILTIN_SLUGS = [
  WORLD_SKIN_DEFAULT_THEATER_SLUG,
  "mars-surface",
  "cell-interior",
  "roman-forum",
  "rainforest-canopy",
  "art-studio"
] as const;

export const WorldSkinBuiltinSlugSchema = z.enum(WORLD_SKIN_BUILTIN_SLUGS);

export const WorldSkinAssetFileNameSchema = z.enum([
  "thumbnail.png",
  "panorama.webp",
  "floor.webp",
  "dome.webp",
  "map2d.webp",
  "ambient.ogg"
]);

export const WorldSkinUploaderVerifyRequestSchema = z.object({
  password: z.string().min(1).max(200)
});

export const WorldSkinUploaderVerifyResponseSchema = z.object({
  ok: z.literal(true)
});

export const CreateWorldSkinUploadRequestSchema = z.object({
  slug: WorldSkinBuiltinSlugSchema,
  version: z.number().int().min(1).max(99).default(1),
  fileName: WorldSkinAssetFileNameSchema,
  contentType: z.string().min(1).max(120)
});

export const WorldSkinUploaderStatusQuerySchema = z.object({
  slug: WorldSkinBuiltinSlugSchema,
  version: z.coerce.number().int().min(1).max(99).default(1)
});

export const WorldSkinUploaderFileStatusSchema = z.object({
  fileName: WorldSkinAssetFileNameSchema,
  storageKey: z.string(),
  required: z.boolean(),
  uploaded: z.boolean(),
  downloadUrl: z.string().url().optional()
});

export const WorldSkinUploaderStatusResponseSchema = z.object({
  slug: WorldSkinBuiltinSlugSchema,
  version: z.number().int(),
  r2Prefix: z.string(),
  files: z.array(WorldSkinUploaderFileStatusSchema)
});

export const RoomObjectUploadKindSchema = z.enum(["asset", "thumbnail"]);

export const CreateRoomObjectUploadRequestSchema = z.object({
  kind: RoomObjectUploadKindSchema.default("asset"),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120)
});

export const CreateRoomObjectUploadResponseSchema = z.object({
  storageKey: z.string().min(1),
  assetUrl: z.string().url(),
  upload: z.object({
    url: z.string(),
    method: z.literal("PUT"),
    headers: z.record(z.string())
  })
});

export const CreateRoomObjectTemplateRequestSchema = z.object({
  roomId: z.string().min(1),
  assetStorageKey: z.string().min(1),
  thumbnailStorageKey: z.string().min(1),
  slug: z.string().min(2).max(64).optional(),
  displayName: z.string().min(1).max(120),
  category: RoomObjectCategorySchema.default("custom"),
  description: z.string().max(500).default(""),
  defaultPose: PoseSchema.optional(),
  defaultScale: z.number().positive().default(1),
  defaultColorTintHex: RoomObjectColorTintHexSchema.optional(),
  defaultParameters: z.record(z.string(), z.unknown()).default({}),
  parameterSchemaJson: z.string().default("{}"),
  license: z.string().max(60).default("CC-BY"),
  attribution: z.string().max(240).default(""),
  exportable: z.boolean().default(true)
});

export const CreateRoomObjectTemplateResponseSchema = z.object({
  template: RoomObjectTemplateSchema
});

export const ListRoomObjectsQuerySchema = z.object({
  status: RoomObjectStatusSchema.optional()
});

export const ListRoomObjectsResponseSchema = z.object({
  objects: z.array(RoomObjectSchema)
});

export const CreateRoomObjectRequestSchema = z.object({
  templateId: z.string().min(1),
  displayName: z.string().min(1).max(120).optional(),
  pose: PoseSchema.optional(),
  scale: z.number().positive().optional(),
  colorTintHex: RoomObjectColorTintHexSchema.optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  touchPolicy: RoomObjectTouchPolicySchema.optional()
});

export const CreateRoomObjectResponseSchema = z.object({
  object: RoomObjectSchema
});

export const UpdateRoomObjectRequestSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  pose: PoseSchema.optional(),
  scale: z.number().positive().optional(),
  colorTintHex: RoomObjectColorTintHexSchema.optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  touchPolicy: RoomObjectTouchPolicySchema.optional(),
  status: RoomObjectStatusSchema.optional()
});

export const RoomObjectTouchRequestSchema = z.object({
  touchPolicy: RoomObjectTouchPolicySchema,
  userIds: z.array(z.string()).default([]),
  groupIds: z.array(z.string()).default([])
});

export const RoomObjectResetResponseSchema = z.object({
  object: RoomObjectSchema
});

/** Client-side procedural renderer inputs (no React/Three refs — those stay in the web app). */
export const RoomObjectProceduralRenderPropsSchema = z.object({
  parameters: z.record(z.string(), z.unknown()),
  scale: z.number().positive(),
  colorTintHex: RoomObjectColorTintHexSchema.optional()
});

export const ApiErrorCodeSchema = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "unprocessable_entity",
  "exit-ticket-incomplete",
  "rate_limited",
  "room-object-disabled",
  "room-object-limit-reached",
  "room-object-not-found",
  "room-object-grab-conflict",
  "room-object-touch-denied",
  "room-object-locked",
  "room-object-template-invalid",
  "room-object-upload-too-large",
  "room-object-upload-rejected",
  "world-skins-disabled"
]);

export function parseRoomObjectParameterSchemaJson(json: string) {
  const parsed = JSON.parse(json) as unknown;
  return RoomObjectParameterSchemaMapSchema.parse(parsed);
}

export function stringifyRoomObjectParameterSchema(
  schema: z.infer<typeof RoomObjectParameterSchemaMapSchema>
) {
  return JSON.stringify(schema);
}

/** Build a template-ready `parameterSchemaJson` from a Phase 0 `parameterSchema` object. */
export function parameterSchemaToJson(
  schema: z.infer<typeof RoomObjectParameterSchemaMapSchema>
) {
  return stringifyRoomObjectParameterSchema(schema);
}

export type RoomTypeFeatureFlags = {
  classroomState: boolean;
  peoplePanelTeacherControls: boolean;
  lessons: boolean;
  privateChecks: boolean;
  groups: boolean;
  focus: boolean;
  hallPass: boolean;
  whisper: boolean;
  breakoutPods: boolean;
  studentMediaControls: boolean;
  worldSkins: boolean;
  dynamicBoards: boolean;
  openJoin: boolean;
};

const NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS: RoomTypeFeatureFlags = Object.freeze({
  classroomState: false,
  peoplePanelTeacherControls: false,
  lessons: false,
  privateChecks: false,
  groups: false,
  focus: false,
  hallPass: false,
  whisper: false,
  breakoutPods: false,
  studentMediaControls: false,
  worldSkins: false,
  dynamicBoards: false,
  openJoin: false
});

const CLASSROOM_ROOM_TYPE_FEATURE_FLAGS: RoomTypeFeatureFlags = Object.freeze({
  classroomState: true,
  peoplePanelTeacherControls: true,
  lessons: true,
  privateChecks: true,
  groups: true,
  focus: true,
  hallPass: true,
  whisper: true,
  breakoutPods: true,
  studentMediaControls: true,
  worldSkins: true,
  dynamicBoards: false,
  openJoin: false
});

const FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS: RoomTypeFeatureFlags = Object.freeze({
  classroomState: false,
  peoplePanelTeacherControls: false,
  lessons: false,
  privateChecks: false,
  groups: false,
  focus: false,
  hallPass: false,
  whisper: false,
  breakoutPods: false,
  studentMediaControls: false,
  worldSkins: false,
  dynamicBoards: true,
  openJoin: true
});

/**
 * Future room types should not inherit classroom controls unless they opt in here.
 */
export function getRoomTypeFeatureFlags(roomType: RoomType | string | null | undefined): RoomTypeFeatureFlags {
  switch (roomType) {
    case "classroom":
      return CLASSROOM_ROOM_TYPE_FEATURE_FLAGS;
    case "free-for-all":
      return FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS;
    default:
      return NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS;
  }
}

export const RoomSettingsSchema = z.object({
  maxParticipants: z.number().int().positive(),
  defaultViewMode: ViewModeSchema,
  defaultQuality: QualityLevelSchema,
  enable2DAnalog: z.boolean(),
  enableWallAttachments: z.boolean(),
  enableWallObjects: z.boolean().default(true),
  wallObjectCreation: WallObjectCreationPolicySchema.default("teacher-only"),
  wallObjectModeration: WallObjectModerationPolicySchema.default("pre"),
  allowLiveStudentShares: z.boolean().default(false),
  allowStudentUploads: z.boolean().default(false),
  allowWebLinks: z.boolean().default(true),
  allowEmbeds: z.boolean().default(false),
  maxActiveWallObjects: z.number().int().positive().default(20),
  maxActiveLiveShares: z.number().int().positive().default(4),
  hallpass: z.object({
    enabled: z.boolean().default(true),
    maxConcurrent: z.number().int().min(0).max(10).default(1),
    perPeriodLimit: z.number().int().min(0).max(20).default(2)
  }).default({ enabled: true, maxConcurrent: 1, perPeriodLimit: 2 }),
  pods: z.object({
    enabled: z.boolean().default(true),
    podRadiusMeters: z.number().positive().max(8).default(3),
    podMurmurFloor: z.number().min(0).max(1).default(0.08),
    drawPartitions: z.boolean().default(false)
  }).default({ enabled: true, podRadiusMeters: 3, podMurmurFloor: 0.08, drawPartitions: false }),
  roomObjects: RoomObjectsSettingsSchema.default({
    enabled: true,
    maxActive: 8,
    customUploadsEnabled: false,
    maxUploadSizeBytes: 15 * 1024 * 1024,
    defaultTouchPolicy: "teacher-only"
  }),
  worldSkins: z.object({
    enabled: z.boolean().default(true),
    skinId: z.string().nullable().default(null),
    skinDayNightMode: WorldSkinDayNightModeSchema.default("day"),
    ambientGainOverride: z.number().min(0).max(1).nullable().default(null)
  }).default({
    enabled: true,
    skinId: null,
    skinDayNightMode: "day",
    ambientGainOverride: null
  }),
  studentMedia: z.object({
    camerasEnabled: z.boolean().default(true),
    microphonesEnabled: z.boolean().default(true)
  }).default({
    camerasEnabled: true,
    microphonesEnabled: true
  })
});

/** Apply {@link RoomSettingsSchema} defaults to persisted room settings (e.g. `roomObjects` opt-in). */
export function parseRoomSettings(input: unknown): z.infer<typeof RoomSettingsSchema> {
  return RoomSettingsSchema.parse(input);
}

export const RoomSchema = z.object({
  id: z.string(),
  classId: z.string(),
  name: z.string(),
  type: RoomTypeSchema.default("classroom"),
  activeManifestVersion: z.number().int().positive(),
  settings: RoomSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CreateRoomRequestSchema = z.object({
  classId: z.string().min(1),
  name: z.string().min(1).max(120),
  type: RoomTypeSchema.optional()
});

export const UpdateRoomRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  settings: RoomSettingsSchema.partial().optional()
});

export const RoomWithManifestSchema = z.object({
  room: RoomSchema,
  manifest: RoomManifestSchema
});

export const DeleteRoomResponseSchema = z.object({
  roomId: z.string(),
  deleted: z.literal(true)
});

export const AvatarMovementSchema = z.enum(["idle", "walking"]);

export const AvatarStateMessageSchema = z.object({
  type: z.literal("avatar.state.v1"),
  sentAt: z.number().int(),
  participantId: z.string(),
  position: Vector3Schema,
  rotation: RotationSchema,
  movement: AvatarMovementSchema,
  viewMode: ViewModeSchema,
  waving: z.boolean().optional(),
  media: z.object({
    cameraEnabled: z.boolean(),
    microphoneEnabled: z.boolean(),
    speaking: z.boolean()
  }).optional()
});

export const JoinRoomSessionRequestSchema = z.object({
  viewMode: ViewModeSchema.default("3d"),
  inviteCode: z.string().optional()
});

export const RoomSessionResponseSchema = z.object({
  token: z.string(),
  livekitUrl: z.string(),
  participantIdentity: z.string(),
  participantId: z.string(),
  role: RoleSchema,
  room: RoomSchema,
  manifest: RoomManifestSchema,
  capabilities: RoomCapabilitiesSchema,
  avatarAppearance: AvatarAppearanceSchema.nullable(),
  tuning: z.object({
    avatarSendHz: z.number(),
    interpolationMs: z.number(),
    spatialAudio: SpatialAudioConfigSchema,
    media: z.object({
      defaultCameraEnabled: z.boolean(),
      defaultMicEnabled: z.boolean(),
      maxVideoWidth: z.number().int(),
      maxVideoHeight: z.number().int(),
      maxVideoFps: z.number().int()
    })
  })
});

export const WallAttachmentSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  wallAnchorId: z.string(),
  kind: AttachmentKindSchema,
  fileName: z.string(),
  contentType: z.string(),
  storageKey: z.string(),
  status: AttachmentStatusSchema,
  publicUrl: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CreateWallAttachmentRequestSchema = z.object({
  wallAnchorId: z.string().min(1),
  kind: AttachmentKindSchema,
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  metadata: z.record(z.unknown()).default({})
});

export const FinalizeWallAttachmentRequestSchema = z.object({
  metadata: z.record(z.unknown()).default({})
});

export const UpdateWallAttachmentRequestSchema = z.object({
  status: AttachmentStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional()
});

export const SignedUploadTargetSchema = z.object({
  url: z.string(),
  method: z.literal("PUT"),
  headers: z.record(z.string())
});

export const SignedDownloadTargetSchema = z.object({
  url: z.string(),
  method: z.literal("GET"),
  headers: z.record(z.string()),
  expiresInSeconds: z.number().int().positive()
});

export const CreateWorldSkinUploadResponseSchema = z.object({
  storageKey: z.string().min(1),
  assetPath: z.string().min(1),
  upload: SignedUploadTargetSchema
});

export const CreateWallAttachmentResponseSchema = z.object({
  attachment: WallAttachmentSchema,
  upload: SignedUploadTargetSchema
});

export const WallAttachmentDownloadResponseSchema = z.object({
  attachment: WallAttachmentSchema,
  download: SignedDownloadTargetSchema
});

export const WallObjectSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("asset"),
    attachmentId: z.string().min(1),
    url: z.string().optional()
  }),
  z.object({
    kind: z.literal("livekit-track"),
    participantIdentity: z.string().min(1),
    participantId: z.string().min(1),
    trackSource: z.enum(["camera", "microphone", "screen_share", "screen_share_audio"]),
    publicationSid: z.string().optional(),
    publicationName: z.string().optional()
  }),
  z.object({
    kind: z.literal("web-url"),
    url: z.string().url(),
    embedMode: z.enum(["link", "iframe"])
  }),
  z.object({
    kind: z.literal("inline"),
    data: z.record(z.unknown()).default({})
  })
]);

export const WallObjectPlacementSchema = z.object({
  x: z.number().min(0).max(1).default(0),
  y: z.number().min(0).max(1).default(0),
  width: z.number().positive().max(1).default(1),
  height: z.number().positive().max(1).default(1),
  zIndex: z.number().int().default(0),
  fit: z.enum(["contain", "cover", "stretch"]).default("contain")
});

export const WallObjectSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  wallAnchorId: z.string(),
  type: WallObjectTypeSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  source: WallObjectSourceSchema,
  placement: WallObjectPlacementSchema,
  state: z.record(z.unknown()).default({}),
  permissions: z.record(z.unknown()).default({}),
  status: WallObjectStatusSchema,
  moderation: z.record(z.unknown()).default({}),
  createdByUserId: z.string(),
  updatedByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive()
});

export const ListWallObjectsQuerySchema = z.object({
  status: WallObjectStatusSchema.optional(),
  anchorId: z.string().optional(),
  includeRemoved: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional()
});

export const CreateWallObjectRequestSchema = z.object({
  wallAnchorId: z.string().min(1),
  type: WallObjectTypeSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  source: WallObjectSourceSchema,
  placement: WallObjectPlacementSchema.default({}),
  state: z.record(z.unknown()).default({}),
  permissions: z.record(z.unknown()).default({}),
  moderation: z.record(z.unknown()).default({}),
  status: WallObjectStatusSchema.optional()
});

export const UpdateWallObjectRequestSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).optional(),
  placement: WallObjectPlacementSchema.optional(),
  state: z.record(z.unknown()).optional(),
  permissions: z.record(z.unknown()).optional(),
  moderation: z.record(z.unknown()).optional(),
  status: WallObjectStatusSchema.optional()
});

export const WallObjectControlRequestSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
  action: z.enum([
    "play",
    "pause",
    "seek",
    "mute",
    "unmute",
    "stop-share",
    "spotlight",
    "lock",
    "unlock",
    "approve",
    "reject",
    "vote",
    "close-poll",
    "reopen-poll"
  ]),
  positionSeconds: z.number().nonnegative().optional(),
  rate: z.number().positive().max(4).optional(),
  muted: z.boolean().optional(),
  choiceId: z.string().min(1).optional()
});

export const CreateWallShareRequestSchema = z.object({
  wallAnchorId: z.string().min(1),
  type: z.enum(["camera.live", "microphone.live", "screen.live", "browser-tab.live"]),
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  placement: WallObjectPlacementSchema.default({}),
  state: z.record(z.unknown()).default({})
});

export const CreateWallShareResponseSchema = z.object({
  object: WallObjectSchema,
  publicationName: z.string(),
  recommendedTrackSource: z.enum(["camera", "microphone", "screen_share", "screen_share_audio"])
});

export const CreateWebResourceRequestSchema = z.object({
  wallAnchorId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).optional(),
  embedMode: z.enum(["link", "iframe"]).default("link"),
  placement: WallObjectPlacementSchema.default({})
});

export const WebResourcePreviewRequestSchema = z.object({
  url: z.string().url(),
  embedMode: z.enum(["link", "iframe"]).default("link")
});

export const WebResourcePreviewResponseSchema = z.object({
  url: z.string().url(),
  host: z.string(),
  title: z.string(),
  embedMode: z.enum(["link", "iframe"]),
  embeddable: z.boolean(),
  reason: z.string().optional()
});

export const WallObjectRealtimeUpsertSchema = z.object({
  type: z.literal("wall.object.upsert.v1"),
  roomId: z.string(),
  object: WallObjectSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WallObjectRealtimeRemoveSchema = z.object({
  type: z.literal("wall.object.remove.v1"),
  roomId: z.string(),
  objectId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WallPlaybackStateMessageSchema = z.object({
  type: z.literal("wall.playback.state.v1"),
  roomId: z.string(),
  objectId: z.string(),
  status: z.enum(["playing", "paused", "ended"]),
  positionSeconds: z.number().nonnegative(),
  rate: z.number().positive(),
  muted: z.boolean(),
  sentAt: z.number().int(),
  controlledByUserId: z.string()
});

export const WallShareEndedMessageSchema = z.object({
  type: z.literal("wall.share.ended.v1"),
  roomId: z.string(),
  objectId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WallModerationStateMessageSchema = z.object({
  type: z.literal("wall.moderation.state.v1"),
  roomId: z.string(),
  objectId: z.string(),
  status: WallObjectStatusSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeUpsertMessageSchema = z.object({
  type: z.literal("room.object.upsert.v1"),
  roomId: z.string(),
  object: RoomObjectSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeRemoveMessageSchema = z.object({
  type: z.literal("room.object.remove.v1"),
  roomId: z.string(),
  objectId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeTouchMessageSchema = z.object({
  type: z.literal("room.object.touch.v1"),
  roomId: z.string(),
  objectId: z.string(),
  touchPolicy: RoomObjectTouchPolicySchema,
  grantedUserIds: z.array(z.string()),
  grantedGroupIds: z.array(z.string()),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeGrabMessageSchema = z.object({
  type: z.literal("room.object.grab.v1"),
  roomId: z.string(),
  objectId: z.string(),
  holderUserId: z.string(),
  expiresAt: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimePoseMessageSchema = z.object({
  type: z.literal("room.object.pose.v1"),
  roomId: z.string(),
  objectId: z.string(),
  holderUserId: z.string(),
  pose: PoseSchema,
  scale: z.number().positive(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeReleaseMessageSchema = z.object({
  type: z.literal("room.object.release.v1"),
  roomId: z.string(),
  objectId: z.string(),
  holderUserId: z.string(),
  finalPose: PoseSchema,
  finalScale: z.number().positive(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeParameterMessageSchema = z.object({
  type: z.literal("room.object.parameter.v1"),
  roomId: z.string(),
  objectId: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomObjectRealtimeMessageSchema = z.discriminatedUnion("type", [
  RoomObjectRealtimeUpsertMessageSchema,
  RoomObjectRealtimeRemoveMessageSchema,
  RoomObjectRealtimeTouchMessageSchema,
  RoomObjectRealtimeGrabMessageSchema,
  RoomObjectRealtimePoseMessageSchema,
  RoomObjectRealtimeReleaseMessageSchema,
  RoomObjectRealtimeParameterMessageSchema
]);

export const RoomBoardCreatedMessageV1Schema = z.object({
  type: z.literal("room.board.created.v1"),
  roomId: z.string(),
  anchor: DynamicWallAnchorSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomBoardUpdatedMessageV1Schema = z.object({
  type: z.literal("room.board.updated.v1"),
  roomId: z.string(),
  anchor: DynamicWallAnchorSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomBoardRemovedMessageV1Schema = z.object({
  type: z.literal("room.board.removed.v1"),
  roomId: z.string(),
  anchorId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export type RoomBoardCreatedMessageV1 = z.infer<typeof RoomBoardCreatedMessageV1Schema>;
export type RoomBoardUpdatedMessageV1 = z.infer<typeof RoomBoardUpdatedMessageV1Schema>;
export type RoomBoardRemovedMessageV1 = z.infer<typeof RoomBoardRemovedMessageV1Schema>;

/** Client → server realtime dispatch (roomId comes from the URL). */
export const RoomObjectRealtimeInboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room.object.grab.v1"),
    objectId: z.string()
  }),
  z.object({
    type: z.literal("room.object.pose.v1"),
    objectId: z.string(),
    pose: PoseSchema,
    scale: z.number().positive()
  }),
  z.object({
    type: z.literal("room.object.release.v1"),
    objectId: z.string(),
    finalPose: PoseSchema,
    finalScale: z.number().positive()
  }),
  z.object({
    type: z.literal("room.object.parameter.v1"),
    objectId: z.string(),
    parameters: z.record(z.string(), z.unknown())
  })
]);

export const RoomObjectRealtimeDispatchResponseSchema = z.object({
  messages: z.array(RoomObjectRealtimeMessageSchema)
});

export const ClassroomHelpRequestSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  note: z.string().max(500).optional(),
  kind: z.enum(["help", "hallpass"]).default("help"),
  status: z.enum(["raised", "acknowledged", "closed", "cancelled"]),
  approvedAt: z.string().optional(),
  returnedAt: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedByUserId: z.string().optional()
});

export const ClassroomBoardAccessGrantSchema = z.object({
  id: z.string(),
  userId: z.string(),
  wallAnchorId: z.string(),
  requestId: z.string().optional(),
  allowedObjectTypes: z.array(WallObjectTypeSchema).default([]),
  status: z.enum(["active", "revoked", "expired"]),
  expiresAt: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ClassroomGroupHoldSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["soft", "hard"]).default("soft"),
  radiusMeters: z.number().positive().default(2)
});

export const ClassroomGroupSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(80),
  color: z.string().min(1).max(40),
  memberUserIds: z.array(z.string()).default([]),
  targetPosition: Vector3Schema.optional(),
  targetWallAnchorId: z.string().optional(),
  hold: ClassroomGroupHoldSchema.optional(),
  status: z.enum(["active", "released", "archived"]),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ClassroomSpotlightSchema = z.object({
  targetType: z.enum(["wall-anchor", "wall-object"]),
  anchorId: z.string().optional(),
  objectId: z.string().optional(),
  title: z.string().max(160).optional(),
  instruction: z.string().max(500).optional(),
  mode: z.enum(["highlight", "guide", "force"]),
  createdByUserId: z.string(),
  startedAt: z.string(),
  expiresAt: z.string().optional()
});

export const ClassroomPrivateCheckChoiceSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(200)
});

export const ClassroomPrivateCheckResponseSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  choiceId: z.string().optional(),
  answer: z.string().max(2000).optional(),
  confidence: z.number().min(1).max(5).optional(),
  submittedAt: z.string()
});

export const ClassroomPrivateCheckTargetSchema = z.object({
  kind: z.enum(["all", "group", "users"]).default("all"),
  groupId: z.string().optional(),
  userIds: z.array(z.string()).default([])
});

export const ClassroomPrivateCheckSchema = z.object({
  id: z.string(),
  question: z.string().min(1).max(1000),
  promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
  choices: z.array(ClassroomPrivateCheckChoiceSchema).default([]),
  target: ClassroomPrivateCheckTargetSchema.default({ kind: "all", userIds: [] }),
  status: z.enum(["draft", "open", "closed", "archived"]),
  visibility: z.enum(["teacher-only", "anonymous-aggregate"]).default("teacher-only"),
  responses: z.array(ClassroomPrivateCheckResponseSchema).default([]),
  wallAnchorId: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const LessonStepKindSchema = z.enum([
  "instruction",
  "focus-board",
  "private-check",
  "group-work",
  "timer",
  "student-share",
  "exit-ticket"
]);

export const LessonStepInstructionPayloadSchema = z.object({
  body: z.string().max(2000).default("")
});

export const LessonStepFocusBoardPayloadSchema = z.object({
  anchorId: z.string(),
  objectId: z.string().optional(),
  mode: z.enum(["highlight", "guide", "force"]).default("highlight"),
  title: z.string().max(160).optional(),
  instruction: z.string().max(500).optional()
});

export const LessonStepPrivateCheckPayloadSchema = z.object({
  question: z.string().min(1).max(1000),
  promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
  choices: z.array(ClassroomPrivateCheckChoiceSchema).default([]),
  target: ClassroomPrivateCheckTargetSchema.default({ kind: "all", userIds: [] }),
  wallAnchorId: z.string().optional(),
  autoCloseOnAdvance: z.boolean().default(true)
});

export const LessonStepGroupWorkPayloadSchema = z.object({
  existingGroupId: z.string().optional(),
  newGroup: z
    .object({
      label: z.string().min(1).max(80),
      color: z.string().min(1).max(40),
      memberUserIds: z.array(z.string()).default([]),
      targetPosition: Vector3Schema.optional(),
      targetWallAnchorId: z.string().optional(),
      hold: ClassroomGroupHoldSchema.optional()
    })
    .optional(),
  releaseOnAdvance: z.boolean().default(true)
}).refine((value) => Boolean(value.existingGroupId) !== Boolean(value.newGroup), {
  message: "Provide existingGroupId or newGroup, not both."
});

export const LessonStepTimerPayloadSchema = z.object({
  durationSeconds: z.number().int().min(5).max(60 * 60),
  label: z.string().max(80).default(""),
  placement: z.enum(["hud", "wall"]).default("hud"),
  wallAnchorId: z.string().optional(),
  autoAdvanceOnComplete: z.boolean().default(false)
});

export const LessonStepStudentSharePayloadSchema = z.object({
  userId: z.string(),
  wallAnchorId: z.string(),
  allowedObjectTypes: z.array(WallObjectTypeSchema).default([]),
  acknowledgeHandIfRaised: z.boolean().default(true),
  revokeOnAdvance: z.boolean().default(true),
  expiresAt: z.string().optional()
});

export const LessonStepExitTicketChoiceSchema = ClassroomPrivateCheckChoiceSchema;

export const LessonStepExitTicketPayloadSchema = z.object({
  reflectionPrompt: z.string().min(1).max(500),
  includeConfidence: z.boolean().default(true),
  confidenceRange: z
    .object({ min: z.number().int().min(1), max: z.number().int().min(2).max(10) })
    .default({ min: 1, max: 5 }),
  whatsNext: z
    .object({
      question: z.string().min(1).max(500),
      choices: z.array(LessonStepExitTicketChoiceSchema).min(2).max(6)
    })
    .optional(),
  requiredToEnd: z.boolean().default(false),
  autoCloseOnAdvance: z.boolean().default(true),
  wallAnchorId: z.string().optional()
});

export const LessonStepPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instruction"), data: LessonStepInstructionPayloadSchema }),
  z.object({ kind: z.literal("focus-board"), data: LessonStepFocusBoardPayloadSchema }),
  z.object({ kind: z.literal("private-check"), data: LessonStepPrivateCheckPayloadSchema }),
  z.object({ kind: z.literal("group-work"), data: LessonStepGroupWorkPayloadSchema }),
  z.object({ kind: z.literal("timer"), data: LessonStepTimerPayloadSchema }),
  z.object({ kind: z.literal("student-share"), data: LessonStepStudentSharePayloadSchema }),
  z.object({ kind: z.literal("exit-ticket"), data: LessonStepExitTicketPayloadSchema })
]);

export const LessonStepSchema = z.object({
  id: z.string(),
  kind: LessonStepKindSchema,
  title: z.string().min(1).max(120),
  notes: z.string().max(2000).optional(),
  payload: LessonStepPayloadSchema,
  createdAt: z.string(),
  updatedAt: z.string()
}).refine((value) => value.kind === value.payload.kind, {
  message: "Step kind must match payload kind."
});

export const LessonRunStepRecordSchema = z.object({
  stepId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  drifted: z.boolean().default(false),
  driftReason: z.string().optional(),
  emittedActionIds: z.array(z.string()).default([]),
  createdCheckId: z.string().optional(),
  createdGroupId: z.string().optional(),
  createdGrantId: z.string().optional(),
  createdWallObjectId: z.string().optional(),
  createdExitTicket: z.object({
    reflectionCheckId: z.string(),
    confidenceCheckId: z.string().optional(),
    whatsNextCheckId: z.string().optional()
  }).optional()
});

export const LessonActiveTimerSchema = z.object({
  stepId: z.string(),
  title: z.string().min(1).max(120),
  label: z.string().max(80).default(""),
  durationSeconds: z.number().int().min(5).max(60 * 60),
  placement: z.enum(["hud", "wall"]),
  wallAnchorId: z.string().optional(),
  wallObjectId: z.string().optional(),
  autoAdvanceOnComplete: z.boolean().default(false),
  startedAt: z.string()
});

export const LessonRunStatusSchema = z.enum(["draft", "ready", "running", "paused", "ended", "abandoned"]);

export const LessonRunSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(160).default("Untitled lesson"),
  status: LessonRunStatusSchema.default("draft"),
  steps: z.array(LessonStepSchema).default([]),
  currentStepIndex: z.number().int().min(-1).default(-1),
  timeline: z.array(LessonRunStepRecordSchema).default([]),
  activeTimer: LessonActiveTimerSchema.nullable().default(null),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const LessonStepInputSchema = z.object({
  kind: LessonStepKindSchema,
  title: z.string().min(1).max(120),
  notes: z.string().max(2000).optional(),
  payload: LessonStepPayloadSchema
}).refine((value) => value.kind === value.payload.kind, {
  message: "Step kind must match payload kind."
});

export const ClassroomPodsRuntimeSchema = z.object({
  podsEnabled: z.boolean().default(false),
  broadcastFromUserIds: z.array(z.string()).default([])
});

export const ClassroomStateSchema = z.object({
  roomId: z.string(),
  version: z.number().int().positive(),
  helpRequests: z.array(ClassroomHelpRequestSchema).default([]),
  boardAccessGrants: z.array(ClassroomBoardAccessGrantSchema).default([]),
  privateChecks: z.array(ClassroomPrivateCheckSchema).default([]),
  groups: z.array(ClassroomGroupSchema).default([]),
  spotlight: ClassroomSpotlightSchema.nullable().default(null),
  lessonRun: LessonRunSchema.nullable().default(null),
  avatarEditorLocked: z.boolean().default(false).optional(),
  reactionsLocked: z.boolean().default(false).optional(),
  podsRuntime: ClassroomPodsRuntimeSchema.default({
    podsEnabled: false,
    broadcastFromUserIds: []
  }).optional(),
  whisper: z.object({
    allowed: z.boolean().default(false),
    maxRadiusMeters: z.number().positive().max(20).default(3),
    autoEnableInGroupWork: z.boolean().default(true)
  }).default({ allowed: false, maxRadiusMeters: 3, autoEnableInGroupWork: true }).optional(),
  studentMediaRuntime: z.object({
    camerasEnabled: z.boolean().default(true),
    microphonesEnabled: z.boolean().default(true),
    cameraEnabledUserIds: z.array(z.string()).default([]),
    microphoneEnabledUserIds: z.array(z.string()).default([])
  }).default({
    camerasEnabled: true,
    microphonesEnabled: true,
    cameraEnabledUserIds: [],
    microphoneEnabledUserIds: []
  }).optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const ClassroomActionBaseSchema = z.object({
  expectedVersion: z.number().int().positive().optional()
});

export const ClassroomRaiseHandActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("raise-hand"),
  note: z.string().max(500).optional()
});

export const ClassroomCancelHelpActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("cancel-help"),
  requestId: z.string().optional()
});

export const ClassroomAcknowledgeHelpActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("acknowledge-help"),
  requestId: z.string().min(1)
});

export const ClassroomCloseHelpActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("close-help"),
  requestId: z.string().min(1)
});

export const ClassroomGrantBoardAccessActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("grant-board-access"),
  userId: z.string().min(1),
  wallAnchorId: z.string().min(1),
  requestId: z.string().optional(),
  allowedObjectTypes: z.array(WallObjectTypeSchema).default([]),
  expiresAt: z.string().optional()
});

export const ClassroomRevokeBoardAccessActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("revoke-board-access"),
  grantId: z.string().min(1)
});

export const ClassroomCreatePrivateCheckActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("create-private-check"),
  question: z.string().min(1).max(1000),
  promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
  choices: z.array(ClassroomPrivateCheckChoiceSchema).default([]),
  target: ClassroomPrivateCheckTargetSchema.default({ kind: "all", userIds: [] }),
  visibility: z.enum(["teacher-only", "anonymous-aggregate"]).default("teacher-only"),
  wallAnchorId: z.string().optional()
});

export const ClassroomOpenPrivateCheckActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("open-private-check"),
  checkId: z.string().min(1)
});

export const ClassroomClosePrivateCheckActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("close-private-check"),
  checkId: z.string().min(1)
});

export const ClassroomReopenPrivateCheckActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("reopen-private-check"),
  checkId: z.string().min(1)
});

export const ClassroomSubmitPrivateCheckActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("submit-private-check"),
  checkId: z.string().min(1),
  choiceId: z.string().optional(),
  answer: z.string().max(2000).optional(),
  confidence: z.number().min(1).max(5).optional()
});

export const ClassroomCreateGroupActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("create-group"),
  label: z.string().min(1).max(80),
  color: z.string().min(1).max(40),
  memberUserIds: z.array(z.string()).default([]),
  targetPosition: Vector3Schema.optional(),
  targetWallAnchorId: z.string().optional(),
  hold: ClassroomGroupHoldSchema.optional(),
  status: z.enum(["active", "released", "archived"]).default("active")
});

export const ClassroomUpdateGroupActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("update-group"),
  groupId: z.string().min(1),
  label: z.string().min(1).max(80).optional(),
  color: z.string().min(1).max(40).optional(),
  targetPosition: z.union([Vector3Schema, z.null()]).optional(),
  targetWallAnchorId: z.string().optional(),
  hold: ClassroomGroupHoldSchema.optional(),
  status: z.enum(["active", "released", "archived"]).optional()
});

export const ClassroomAssignGroupActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("assign-group"),
  groupId: z.string().min(1),
  memberUserIds: z.array(z.string()).default([])
});

export const ClassroomReleaseGroupActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("release-group"),
  groupId: z.string().min(1)
});

export const ClassroomSetRoomSkinActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-room-skin"),
  skinId: z.string().nullable()
});

export const ClassroomSetRoomSkinDayNightActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-room-skin-day-night"),
  mode: WorldSkinDayNightModeSchema
});

export const ClassroomTogglePodsActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("toggle-pods"),
  enabled: z.boolean()
});

export const ClassroomSetStudentBroadcastActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-broadcast"),
  userId: z.string().min(1),
  enabled: z.boolean()
});

export const ClassroomSetSpotlightActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-spotlight"),
  targetType: z.enum(["wall-anchor", "wall-object"]),
  anchorId: z.string().optional(),
  objectId: z.string().optional(),
  title: z.string().max(160).optional(),
  instruction: z.string().max(500).optional(),
  mode: z.enum(["highlight", "guide", "force"]),
  expiresAt: z.string().optional()
});

export const ClassroomClearSpotlightActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("clear-spotlight")
});

export const ClassroomInitLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("init-lesson-run"),
  title: z.string().min(1).max(160).optional()
});

export const ClassroomSetLessonRunTitleActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-lesson-run-title"),
  title: z.string().min(1).max(160)
});

export const ClassroomAddLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("add-lesson-step"),
  index: z.number().int().min(0).optional(),
  step: LessonStepInputSchema
});

export const ClassroomUpdateLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("update-lesson-step"),
  stepId: z.string().min(1),
  title: z.string().min(1).max(120).optional(),
  notes: z.string().max(2000).optional(),
  payload: LessonStepPayloadSchema.optional()
});

export const ClassroomMoveLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("move-lesson-step"),
  from: z.number().int().min(0),
  to: z.number().int().min(0)
});

export const ClassroomRemoveLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("remove-lesson-step"),
  stepId: z.string().min(1)
});

export const ClassroomStartLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("start-lesson-run")
});

export const ClassroomAdvanceLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("advance-lesson-step")
});

export const ClassroomRetreatLessonStepActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("retreat-lesson-step")
});

export const ClassroomPauseLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("pause-lesson-run")
});

export const ClassroomResumeLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("resume-lesson-run")
});

export const ClassroomEndLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("end-lesson-run"),
  force: z.boolean().default(false)
});

export const ClassroomAbandonLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("abandon-lesson-run")
});

export const ClassroomClearLessonRunActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("clear-lesson-run")
});

export const ClassroomSetAvatarEditorLockedActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-avatar-editor-locked"),
  locked: z.boolean()
});

export const ClassroomSetReactionsLockedActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-reactions-locked"),
  locked: z.boolean()
});

export const ClassroomRequestHallpassActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("request-hallpass")
});

export const ClassroomApproveHallpassActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("approve-hallpass"),
  requestId: z.string().min(1)
});

export const ClassroomDenyHallpassActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("deny-hallpass"),
  requestId: z.string().min(1)
});

export const ClassroomReturnFromHallpassActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("return-from-hallpass"),
  requestId: z.string().optional()
});

export const ClassroomUpdateWhisperSettingsActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("update-whisper-settings"),
  allowed: z.boolean().optional(),
  maxRadiusMeters: z.number().positive().max(20).optional(),
  autoEnableInGroupWork: z.boolean().optional()
});

export const ClassroomSetStudentMediaGlobalActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-media-global"),
  medium: z.enum(["camera", "microphone"]),
  enabled: z.boolean()
});

export const ClassroomSetStudentMediaAccessActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-media-access"),
  userId: z.string().min(1),
  medium: z.enum(["camera", "microphone"]),
  enabled: z.boolean()
});

export const ClassroomActionSchema = z.discriminatedUnion("type", [
  ClassroomRaiseHandActionSchema,
  ClassroomCancelHelpActionSchema,
  ClassroomAcknowledgeHelpActionSchema,
  ClassroomCloseHelpActionSchema,
  ClassroomGrantBoardAccessActionSchema,
  ClassroomRevokeBoardAccessActionSchema,
  ClassroomCreatePrivateCheckActionSchema,
  ClassroomOpenPrivateCheckActionSchema,
  ClassroomClosePrivateCheckActionSchema,
  ClassroomReopenPrivateCheckActionSchema,
  ClassroomSubmitPrivateCheckActionSchema,
  ClassroomCreateGroupActionSchema,
  ClassroomUpdateGroupActionSchema,
  ClassroomAssignGroupActionSchema,
  ClassroomReleaseGroupActionSchema,
  ClassroomSetRoomSkinActionSchema,
  ClassroomSetRoomSkinDayNightActionSchema,
  ClassroomTogglePodsActionSchema,
  ClassroomSetStudentBroadcastActionSchema,
  ClassroomSetSpotlightActionSchema,
  ClassroomClearSpotlightActionSchema,
  ClassroomInitLessonRunActionSchema,
  ClassroomSetLessonRunTitleActionSchema,
  ClassroomAddLessonStepActionSchema,
  ClassroomUpdateLessonStepActionSchema,
  ClassroomMoveLessonStepActionSchema,
  ClassroomRemoveLessonStepActionSchema,
  ClassroomStartLessonRunActionSchema,
  ClassroomAdvanceLessonStepActionSchema,
  ClassroomRetreatLessonStepActionSchema,
  ClassroomPauseLessonRunActionSchema,
  ClassroomResumeLessonRunActionSchema,
  ClassroomEndLessonRunActionSchema,
  ClassroomAbandonLessonRunActionSchema,
  ClassroomClearLessonRunActionSchema,
  ClassroomSetAvatarEditorLockedActionSchema,
  ClassroomSetReactionsLockedActionSchema,
  ClassroomRequestHallpassActionSchema,
  ClassroomApproveHallpassActionSchema,
  ClassroomDenyHallpassActionSchema,
  ClassroomReturnFromHallpassActionSchema,
  ClassroomUpdateWhisperSettingsActionSchema,
  ClassroomSetStudentMediaGlobalActionSchema,
  ClassroomSetStudentMediaAccessActionSchema
]);

export const LessonRecapSchema = z.object({
  lessonRunId: z.string(),
  roomId: z.string(),
  title: z.string(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  attendance: z.object({
    knownParticipantIds: z.array(z.string()),
    total: z.number().int().nonnegative()
  }),
  steps: z.array(z.object({
    stepId: z.string(),
    kind: LessonStepKindSchema,
    title: z.string(),
    drifted: z.boolean(),
    driftReason: z.string().optional()
  })),
  privateChecks: z.array(z.object({
    checkId: z.string(),
    question: z.string(),
    promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
    responseCount: z.number().int().nonnegative(),
    choiceCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
    confidenceAverage: z.number().optional()
  })),
  exitTicket: z.object({
    stepId: z.string(),
    submittedCount: z.number().int().nonnegative(),
    expectedCount: z.number().int().nonnegative(),
    confidenceAverage: z.number().optional(),
    whatsNextChoices: z.array(ClassroomPrivateCheckChoiceSchema).optional(),
    reflections: z.array(z.object({
      userId: z.string(),
      displayName: z.string(),
      answer: z.string(),
      confidence: z.number().optional(),
      whatsNextChoiceId: z.string().optional(),
      submittedAt: z.string()
    }))
  }).optional()
});
export type LessonRecap = z.infer<typeof LessonRecapSchema>;

export const ClassroomStateChangedRealtimeSchema = z.object({
  type: z.literal("classroom.state.changed.v1"),
  roomId: z.string(),
  version: z.number().int().positive(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const ClassroomStateRealtimeSchema = z.object({
  type: z.literal("classroom.state.v1"),
  roomId: z.string(),
  state: ClassroomStateSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomSkinMessageSchema = z.object({
  type: z.literal("room.skin.v1"),
  skinId: z.string().nullable(),
  version: z.number().int().positive().optional(),
  dayNight: WorldSkinDayNightModeSchema.default("day"),
  crossfadeMs: z.number().int().min(0).max(5000).default(1000)
});
export type RoomSkinMessage = z.infer<typeof RoomSkinMessageSchema>;

export const RoomEventRequestSchema = z.object({
  type: z.string().min(1).max(120),
  payload: z.record(z.unknown()).default({})
});

export const RoomEventResponseSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  type: z.string(),
  persisted: z.boolean(),
  createdAt: z.string()
});

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  time: z.string()
});

export const ReadinessCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["ok", "degraded", "missing", "error"]),
  message: z.string()
});

export const ReadinessResponseSchema = z.object({
  status: z.enum(["ready", "degraded", "not_ready"]),
  checks: z.array(ReadinessCheckSchema)
});

export type Role = z.infer<typeof RoleSchema>;
export type ViewMode = z.infer<typeof ViewModeSchema>;
export type QualityLevel = z.infer<typeof QualityLevelSchema>;
export type Vector3 = z.infer<typeof Vector3Schema>;
export type Rotation = z.infer<typeof RotationSchema>;
export type SpatialAudioConfig = z.infer<typeof SpatialAudioConfigSchema>;
export type RoomManifest = z.infer<typeof RoomManifestSchema>;
export type User = z.infer<typeof UserSchema>;
export type ClassRecord = z.infer<typeof ClassSchema>;
export type ClassMembership = z.infer<typeof ClassMembershipSchema>;
export type Invite = z.infer<typeof InviteSchema>;
export type RoomRecord = z.infer<typeof RoomSchema>;
export type RoomWithManifest = z.infer<typeof RoomWithManifestSchema>;
export type AvatarStateMessage = z.infer<typeof AvatarStateMessageSchema>;
export type RoomSessionResponse = z.infer<typeof RoomSessionResponseSchema>;
export type WallAttachment = z.infer<typeof WallAttachmentSchema>;
export type WallAttachmentDownloadResponse = z.infer<typeof WallAttachmentDownloadResponseSchema>;
export type RoomCapabilities = z.infer<typeof RoomCapabilitiesSchema>;
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;
export type WallObjectCreationPolicy = z.infer<typeof WallObjectCreationPolicySchema>;
export type WallObjectType = z.infer<typeof WallObjectTypeSchema>;
export type WallObjectStatus = z.infer<typeof WallObjectStatusSchema>;
export type WallObjectSource = z.infer<typeof WallObjectSourceSchema>;
export type WallObjectPlacement = z.infer<typeof WallObjectPlacementSchema>;
export type WallObject = z.infer<typeof WallObjectSchema>;
export type Pose = z.infer<typeof PoseSchema>;
export type RoomObjectTouchPolicy = z.infer<typeof RoomObjectTouchPolicySchema>;
export type RoomObjectStatus = z.infer<typeof RoomObjectStatusSchema>;
export type RoomObjectSource = z.infer<typeof RoomObjectSourceSchema>;
export type RoomObjectRenderer = z.infer<typeof RoomObjectRendererSchema>;
export type RoomObjectCategory = z.infer<typeof RoomObjectCategorySchema>;
export type RoomObjectParameterField = z.infer<typeof RoomObjectParameterFieldSchema>;
export type RoomObjectParameterSchemaMap = z.infer<typeof RoomObjectParameterSchemaMapSchema>;
export type RoomObjectTemplate = z.infer<typeof RoomObjectTemplateSchema>;
export type RoomObject = z.infer<typeof RoomObjectSchema>;
export type RoomObjectsSettings = z.infer<typeof RoomObjectsSettingsSchema>;
export type RoomObjectUploadKind = z.infer<typeof RoomObjectUploadKindSchema>;
export type RoomObjectProceduralRenderProps = z.infer<typeof RoomObjectProceduralRenderPropsSchema>;
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type RoomObjectRealtimeMessage = z.infer<typeof RoomObjectRealtimeMessageSchema>;
export type RoomObjectRealtimeInbound = z.infer<typeof RoomObjectRealtimeInboundSchema>;
export type RoomObjectRealtimeDispatchResponse = z.infer<typeof RoomObjectRealtimeDispatchResponseSchema>;
export type RoomObjectRealtimeUpsertMessage = z.infer<typeof RoomObjectRealtimeUpsertMessageSchema>;
export type RoomObjectRealtimeRemoveMessage = z.infer<typeof RoomObjectRealtimeRemoveMessageSchema>;
export type RoomObjectRealtimeTouchMessage = z.infer<typeof RoomObjectRealtimeTouchMessageSchema>;
export type RoomObjectRealtimeGrabMessage = z.infer<typeof RoomObjectRealtimeGrabMessageSchema>;
export type RoomObjectRealtimePoseMessage = z.infer<typeof RoomObjectRealtimePoseMessageSchema>;
export type RoomObjectRealtimeReleaseMessage = z.infer<typeof RoomObjectRealtimeReleaseMessageSchema>;
export type RoomObjectRealtimeParameterMessage = z.infer<typeof RoomObjectRealtimeParameterMessageSchema>;
export type WallPlaybackStateMessage = z.infer<typeof WallPlaybackStateMessageSchema>;
export type ClassroomHelpRequest = z.infer<typeof ClassroomHelpRequestSchema>;
export type ClassroomBoardAccessGrant = z.infer<typeof ClassroomBoardAccessGrantSchema>;
export type ClassroomGroupHold = z.infer<typeof ClassroomGroupHoldSchema>;
export type ClassroomGroup = z.infer<typeof ClassroomGroupSchema>;
export type ClassroomPodsRuntime = z.infer<typeof ClassroomPodsRuntimeSchema>;
export type ClassroomSpotlight = z.infer<typeof ClassroomSpotlightSchema>;
export type ClassroomPrivateCheckChoice = z.infer<typeof ClassroomPrivateCheckChoiceSchema>;
export type ClassroomPrivateCheckResponse = z.infer<typeof ClassroomPrivateCheckResponseSchema>;
export type ClassroomPrivateCheckTarget = z.infer<typeof ClassroomPrivateCheckTargetSchema>;
export type ClassroomPrivateCheck = z.infer<typeof ClassroomPrivateCheckSchema>;
export type LessonStepKind = z.infer<typeof LessonStepKindSchema>;
export type LessonStepPayload = z.infer<typeof LessonStepPayloadSchema>;
export type LessonStepExitTicketChoice = z.infer<typeof LessonStepExitTicketChoiceSchema>;
export type LessonStepExitTicketPayload = z.infer<typeof LessonStepExitTicketPayloadSchema>;
export type LessonStep = z.infer<typeof LessonStepSchema>;
export type LessonStepInput = z.infer<typeof LessonStepInputSchema>;
export type LessonRunStepRecord = z.infer<typeof LessonRunStepRecordSchema>;
export type LessonActiveTimer = z.infer<typeof LessonActiveTimerSchema>;
export type LessonRunStatus = z.infer<typeof LessonRunStatusSchema>;
export type LessonRun = z.infer<typeof LessonRunSchema>;
export type ClassroomState = z.infer<typeof ClassroomStateSchema>;
export type ClassroomAction = z.infer<typeof ClassroomActionSchema>;
export type ClassroomTogglePodsAction = z.infer<typeof ClassroomTogglePodsActionSchema>;
export type ClassroomSetStudentBroadcastAction = z.infer<typeof ClassroomSetStudentBroadcastActionSchema>;
export type ClassroomHelpRequestKind = z.infer<typeof ClassroomHelpRequestSchema>["kind"];
export type ClassroomStateChangedRealtimeMessage = z.infer<typeof ClassroomStateChangedRealtimeSchema>;
export type ClassroomStateRealtimeMessage = z.infer<typeof ClassroomStateRealtimeSchema>;
export type WorldSkinOverrides = z.infer<typeof WorldSkinOverridesSchema>;
export type WorldSkinLightingPreset = z.infer<typeof WorldSkinLightingPresetSchema>;
export type WorldSkinMaterialOverride = z.infer<typeof WorldSkinMaterialOverrideSchema>;
export type WorldSkinDomeCeiling = z.infer<typeof WorldSkinDomeCeilingSchema>;
export type WorldSkinPanoramaWall = z.infer<typeof WorldSkinPanoramaWallSchema>;
export type WorldSkinPanoramaSlice = z.infer<typeof WorldSkinPanoramaSliceSchema>;
export type WorldSkinWallId = z.infer<typeof WorldSkinWallIdSchema>;
export type WorldSkinDayNightMode = z.infer<typeof WorldSkinDayNightModeSchema>;
export type WorldSkinBuiltinSlug = z.infer<typeof WorldSkinBuiltinSlugSchema>;
export type WorldSkinAssetFileName = z.infer<typeof WorldSkinAssetFileNameSchema>;
export type WorldSkinUploaderStatus = z.infer<typeof WorldSkinUploaderStatusResponseSchema>;
export type ClassroomSetRoomSkinAction = z.infer<typeof ClassroomSetRoomSkinActionSchema>;
export type ClassroomSetRoomSkinDayNightAction = z.infer<typeof ClassroomSetRoomSkinDayNightActionSchema>;
export type ClassroomSetStudentMediaGlobalAction = z.infer<typeof ClassroomSetStudentMediaGlobalActionSchema>;
export type ClassroomSetStudentMediaAccessAction = z.infer<typeof ClassroomSetStudentMediaAccessActionSchema>;

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

type ApiRoute = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  summary: string;
  tags: string[];
  request?: z.ZodTypeAny;
  response: z.ZodTypeAny;
};

export const apiRoutes: ApiRoute[] = [
  { method: "get", path: "/health", summary: "Health check", tags: ["system"], response: HealthResponseSchema },
  { method: "get", path: "/ready", summary: "Readiness check", tags: ["system"], response: ReadinessResponseSchema },
  { method: "get", path: "/v1/classes", summary: "List classes visible to the current user", tags: ["classes"], response: z.array(ClassSchema) },
  { method: "post", path: "/v1/classes", summary: "Create a teacher-owned class", tags: ["classes"], request: CreateClassRequestSchema, response: ClassSchema },
  { method: "patch", path: "/v1/classes/{classId}", summary: "Update a teacher-owned class", tags: ["classes"], request: UpdateClassRequestSchema, response: ClassSchema },
  { method: "get", path: "/v1/classes/{classId}/members", summary: "List class memberships", tags: ["classes"], response: z.array(ClassMembershipSchema) },
  { method: "post", path: "/v1/classes/{classId}/members", summary: "Add or update a class membership", tags: ["classes"], request: UpsertClassMemberRequestSchema, response: ClassMembershipSchema },
  { method: "post", path: "/v1/classes/{classId}/invites", summary: "Create a class or room invite", tags: ["classes"], request: CreateInviteRequestSchema, response: InviteSchema },
  { method: "get", path: "/v1/rooms/{roomId}/invite", summary: "Get or create the shareable student invite for a room", tags: ["rooms"], response: InviteSchema },
  { method: "post", path: "/v1/invites/{inviteCode}/accept", summary: "Accept a class or room invite", tags: ["invites"], response: AcceptInviteResponseSchema },
  { method: "get", path: "/v1/rooms", summary: "List rooms visible to the current user", tags: ["rooms"], response: z.array(RoomSchema) },
  { method: "post", path: "/v1/rooms", summary: "Create a room for a class", tags: ["rooms"], request: CreateRoomRequestSchema, response: RoomWithManifestSchema },
  { method: "patch", path: "/v1/rooms/{roomId}", summary: "Update room metadata", tags: ["rooms"], request: UpdateRoomRequestSchema, response: RoomSchema },
  { method: "delete", path: "/v1/rooms/{roomId}", summary: "Delete a room and related data", tags: ["rooms"], response: DeleteRoomResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/manifest", summary: "Get active room manifest", tags: ["rooms"], response: RoomManifestSchema },
  { method: "post", path: "/v1/rooms/{roomId}/session", summary: "Join a room and receive LiveKit session data", tags: ["rooms"], request: JoinRoomSessionRequestSchema, response: RoomSessionResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/attachments", summary: "List wall attachments", tags: ["attachments"], response: z.array(WallAttachmentSchema) },
  { method: "post", path: "/v1/rooms/{roomId}/attachments", summary: "Create wall attachment metadata and signed upload URL", tags: ["attachments"], request: CreateWallAttachmentRequestSchema, response: CreateWallAttachmentResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/attachments/{attachmentId}/finalize", summary: "Finalize a wall attachment after signed upload", tags: ["attachments"], request: FinalizeWallAttachmentRequestSchema, response: WallAttachmentSchema },
  { method: "patch", path: "/v1/rooms/{roomId}/attachments/{attachmentId}", summary: "Update wall attachment metadata or moderation status", tags: ["attachments"], request: UpdateWallAttachmentRequestSchema, response: WallAttachmentSchema },
  { method: "get", path: "/v1/rooms/{roomId}/attachments/{attachmentId}/download", summary: "Create a signed wall attachment download URL", tags: ["attachments"], response: WallAttachmentDownloadResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/wall-objects", summary: "List visible wall objects", tags: ["wall-objects"], response: z.array(WallObjectSchema) },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects", summary: "Create a wall object", tags: ["wall-objects"], request: CreateWallObjectRequestSchema, response: WallObjectSchema },
  { method: "get", path: "/v1/rooms/{roomId}/wall-objects/{objectId}", summary: "Fetch one wall object", tags: ["wall-objects"], response: WallObjectSchema },
  { method: "patch", path: "/v1/rooms/{roomId}/wall-objects/{objectId}", summary: "Update a wall object", tags: ["wall-objects"], request: UpdateWallObjectRequestSchema, response: WallObjectSchema },
  { method: "delete", path: "/v1/rooms/{roomId}/wall-objects/{objectId}", summary: "Soft-remove a wall object", tags: ["wall-objects"], response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/control", summary: "Control playback or live source state for a wall object", tags: ["wall-objects"], request: WallObjectControlRequestSchema, response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-shares", summary: "Create live wall share intent", tags: ["wall-objects"], request: CreateWallShareRequestSchema, response: CreateWallShareResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-shares/{objectId}/end", summary: "Mark live wall share ended", tags: ["wall-objects"], response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/web-resources", summary: "Create safe wall web resource", tags: ["wall-objects"], request: CreateWebResourceRequestSchema, response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/web-resources/preview", summary: "Preview safe wall web resource support", tags: ["wall-objects"], request: WebResourcePreviewRequestSchema, response: WebResourcePreviewResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/classroom", summary: "Get classroom state visible to the current user", tags: ["classroom"], response: ClassroomStateSchema },
  { method: "post", path: "/v1/rooms/{roomId}/classroom/actions", summary: "Run a classroom state action", tags: ["classroom"], request: ClassroomActionSchema, response: ClassroomStateSchema },
  { method: "post", path: "/v1/rooms/{roomId}/events", summary: "Persist optional durable room events", tags: ["rooms"], request: RoomEventRequestSchema, response: RoomEventResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/lesson-runs/{runId}/recap", summary: "Get lesson run recap (teacher only)", tags: ["classroom"], response: LessonRecapSchema },
  { method: "get", path: "/v1/room-objects/templates", summary: "List room object templates visible to the current user", tags: ["room-objects"], response: ListRoomObjectTemplatesResponseSchema },
  {
    method: "post",
    path: "/v1/rooms/{roomId}/room-objects/uploads",
    summary: "Create a signed upload target for a custom room object asset or thumbnail",
    tags: ["room-objects"],
    request: CreateRoomObjectUploadRequestSchema,
    response: CreateRoomObjectUploadResponseSchema
  },
  { method: "post", path: "/v1/room-objects/templates", summary: "Register a custom room object template after asset upload", tags: ["room-objects"], request: CreateRoomObjectTemplateRequestSchema, response: CreateRoomObjectTemplateResponseSchema },
  { method: "delete", path: "/v1/room-objects/templates/{templateId}", summary: "Archive a custom room object template", tags: ["room-objects"], response: RoomObjectTemplateSchema },
  { method: "get", path: "/v1/rooms/{roomId}/objects", summary: "List room manipulatives in a room", tags: ["room-objects"], response: ListRoomObjectsResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/objects", summary: "Instantiate a room object template into a room", tags: ["room-objects"], request: CreateRoomObjectRequestSchema, response: CreateRoomObjectResponseSchema },
  { method: "patch", path: "/v1/rooms/{roomId}/objects/{objectId}", summary: "Update a room object instance", tags: ["room-objects"], request: UpdateRoomObjectRequestSchema, response: RoomObjectSchema },
  { method: "delete", path: "/v1/rooms/{roomId}/objects/{objectId}", summary: "Remove a room object from a room", tags: ["room-objects"], response: RoomObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/objects/{objectId}/touch", summary: "Set touch policy and grants on a room object", tags: ["room-objects"], request: RoomObjectTouchRequestSchema, response: RoomObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/objects/{objectId}/reset", summary: "Reset a room object to template defaults", tags: ["room-objects"], response: RoomObjectResetResponseSchema },
  {
    method: "post",
    path: "/v1/rooms/{roomId}/room-objects/realtime",
    summary: "Authoritative room object realtime dispatch (grab lock, pose relay, release persist)",
    tags: ["room-objects"],
    request: RoomObjectRealtimeInboundSchema,
    response: RoomObjectRealtimeDispatchResponseSchema
  },
  { method: "get", path: "/v1/world-skins", summary: "List world skin catalog entries (flag-gated)", tags: ["world-skins"], response: ListWorldSkinsResponseSchema },
  { method: "get", path: "/v1/world-skins/{slug}", summary: "Get a world skin by slug with absolute asset URLs (flag-gated)", tags: ["world-skins"], response: WorldSkinSchema },
  {
    method: "post",
    path: "/v1/world-skin-uploader/verify",
    summary: "Verify world skin uploader password (operator tool)",
    tags: ["world-skins"],
    request: WorldSkinUploaderVerifyRequestSchema,
    response: WorldSkinUploaderVerifyResponseSchema
  },
  {
    method: "get",
    path: "/v1/world-skin-uploader/status",
    summary: "List upload status for a skin prefix in object storage",
    tags: ["world-skins"],
    response: WorldSkinUploaderStatusResponseSchema
  },
  {
    method: "post",
    path: "/v1/world-skin-uploader/uploads",
    summary: "Create a signed PUT target for a world skin asset in R2",
    tags: ["world-skins"],
    request: CreateWorldSkinUploadRequestSchema,
    response: CreateWorldSkinUploadResponseSchema
  }
  // Note: GET /v1/world-skin-assets/* serves raw bytes (content-type varies); not registered as a JSON schema route.
];

function asJsonSchema(schema: z.ZodTypeAny) {
  return zodToJsonSchema(schema, {
    target: "openApi3",
    $refStrategy: "none"
  }) as Record<string, unknown>;
}

export function createOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of apiRoutes) {
    paths[route.path] ??= {};
    paths[route.path]![route.method] = {
      summary: route.summary,
      tags: route.tags,
      requestBody: route.request
        ? {
            required: true,
            content: {
              "application/json": {
                schema: asJsonSchema(route.request)
              }
            }
          }
        : undefined,
      responses: {
        "200": {
          description: "Successful response",
          content: {
            "application/json": {
              schema: asJsonSchema(route.response)
            }
          }
        }
      }
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "3DSpace API",
      version: "0.1.0",
      description: "Versioned API contracts generated from shared Zod schemas."
    },
    paths
  };
}
