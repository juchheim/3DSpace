import { z } from "zod";

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
  "web.browser.shared",
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
export type WallAnchor = z.infer<typeof WallAnchorSchema>;

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
  hairTop:     z.string().nullable(),
  hairFront:   z.string().nullable(),
  headSide:    z.string().nullable(),
  hairBack:    z.string().nullable(),
  faceSkin:    z.string().nullable(),
  faceAccent:  z.string().nullable(),
  collar:      z.string().nullable(),
  shirtFront:  z.string().nullable(),
  shirtBelly:  z.string().nullable(),
  shirtBack:   z.string().nullable(),
  shirtSide:   z.string().nullable(),
  shoulderTop: z.string().nullable(),
  shoulderCap: z.string().nullable(),
  sleeve:      z.string().nullable(),
  hand:        z.string().nullable(),
  thigh:       z.string().nullable(),
  shin:        z.string().nullable(),
  legSide:     z.string().nullable(),
  legBack:     z.string().nullable(),
  shoeTop:     z.string().nullable(),
  shoeToe:     z.string().nullable(),
  shoeSide:    z.string().nullable(),
  shoeSole:    z.string().nullable(),
});

export type AvatarAppearance = z.infer<typeof AvatarAppearanceSchema>;

export const AvatarAppearanceMessageSchema = z.object({
  type:          z.literal("avatar.appearance.v1"),
  participantId: z.string(),
  appearance:    AvatarAppearanceSchema,
  customized:    z.boolean().optional(),
});

export type AvatarAppearanceMessage = z.infer<typeof AvatarAppearanceMessageSchema>;

export const AvatarAccessorySlotSchema = z.enum(["head", "hands"]);

export const AvatarAccessoryCatalogEntrySchema = z.object({
  slug: z.string().min(1),
  displayName: z.string().min(1),
  slot: AvatarAccessorySlotSchema,
  glbUrl: z.string().min(1),
  attachBone: z.string().min(1),
  /** Optional opposite-side bone for paired accessories (e.g. left hand when glbUrl is authored for the right). */
  pairedAttachBone: z.string().min(1).optional(),
  /** Mirror the paired attachment on the X axis (negates local scale X). */
  mirrorPaired: z.boolean().optional(),
  localPosition: Vector3Schema,
  localRotation: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  localScale: z.number().positive().default(1),
  /** Meters represented by one unit of the target skeleton bone's local space (Mixamo/Azure Vanguard ≈ 0.01). */
  boneSpaceMetersPerUnit: z.number().positive().optional(),
  nativeGroundY: z.number().optional(),
  thumbnailUrl: z.string().optional(),
  /** Scale selected skeleton bones toward zero while equipped (e.g. collapse head_end hair volume under a hat). */
  hairSuppressionBones: z
    .array(
      z.object({
        bone: z.string().min(1),
        scale: z.number().min(0).max(1)
      })
    )
    .optional()
});

export const AvatarAccessoryAdjustmentSchema = z.object({
  positionOffset: Vector3Schema.optional(),
  rotationOffset: Vector3Schema.optional(),
  scaleOffset: z.number().optional()
});

export const AvatarEquippedAccessoriesSchema = z
  .object({
    head: z.string().nullable().optional().default(null),
    hands: z.string().nullable().optional().default(null),
    adjustments: z.record(z.string(), AvatarAccessoryAdjustmentSchema).optional()
  })
  .strict()
  .default({ head: null, hands: null });

export const AvatarAccessoriesMessageSchema = z.object({
  type: z.literal("avatar.accessories.v1"),
  participantId: z.string(),
  accessories: AvatarEquippedAccessoriesSchema
});

export type AvatarAccessorySlot = z.infer<typeof AvatarAccessorySlotSchema>;
export type AvatarAccessoryCatalogEntry = z.infer<typeof AvatarAccessoryCatalogEntrySchema>;
export type AvatarAccessoryAdjustment = z.infer<typeof AvatarAccessoryAdjustmentSchema>;
export type AvatarEquippedAccessories = z.infer<typeof AvatarEquippedAccessoriesSchema>;
export type AvatarAccessoriesMessage = z.infer<typeof AvatarAccessoriesMessageSchema>;

export const PatchUserAvatarAccessoriesRequestSchema = z.object({
  accessories: AvatarEquippedAccessoriesSchema
});

export const ListAvatarAccessoriesResponseSchema = z.object({
  items: z.array(AvatarAccessoryCatalogEntrySchema)
});

export const AvatarBodySlugSchema = z.enum([
  "azure-vanguard",
  "azure-vanguard-hd",
  "ixr-female-20k",
  "sit-test",
  "teacher-male",
  "teacher-female",
  "teacher-male-2",
  "teacher-female-2",
  "student-male",
  "student-female",
  "student-male-2",
  "student-female-2"
]);

export const AvatarBodyClipsSchema = z.object({
  idle: z.string().min(1),
  walking: z.string().min(1),
  running: z.string().min(1),
  /** One-shot clip that plays when the avatar sits down. Ends seated (clampWhenFinished). */
  sit: z.string().min(1).optional(),
  /** One-shot clip that plays when the avatar stands up from sitting. Transitions to idle. */
  standFromSit: z.string().min(1).optional()
});

export const AvatarBodyCatalogEntrySchema = z.object({
  slug: AvatarBodySlugSchema,
  displayName: z.string().min(1),
  glbUrl: z.string().min(1),
  nativeHeight: z.number().positive(),
  clips: AvatarBodyClipsSchema,
  zoneMaskUrl: z.string().min(1),
  neutralAlbedoUrl: z.string().min(1),
  thumbnailUrl: z.string().optional(),
  /** When true, the body appears in the avatar editor only in Dream IXR verse rooms. */
  verseOnly: z.boolean().optional()
});

export const AvatarBodyMessageSchema = z.object({
  type: z.literal("avatar.body.v1"),
  participantId: z.string(),
  bodySlug: AvatarBodySlugSchema
});

export const PatchUserAvatarBodyRequestSchema = z.object({
  bodySlug: AvatarBodySlugSchema
});

export const ListAvatarBodiesResponseSchema = z.object({
  items: z.array(AvatarBodyCatalogEntrySchema)
});

export type AvatarBodySlug = z.infer<typeof AvatarBodySlugSchema>;
export type AvatarBodyCatalogEntry = z.infer<typeof AvatarBodyCatalogEntrySchema>;
export type AvatarBodyMessage = z.infer<typeof AvatarBodyMessageSchema>;

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
  email: z.string().email().optional(),
  authProvider: z.enum(["google", "dev"]).optional(),
  lastLoginAt: z.string().optional(),
  avatar: z.object({
    color: z.string(),
    initials: z.string(),
    appearance: AvatarAppearanceSchema.nullable().optional(),
    accessories: AvatarEquippedAccessoriesSchema.nullable().optional(),
    bodySlug: AvatarBodySlugSchema.default("azure-vanguard")
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
export const RoomObjectSourceSchema = z.enum(["builtin", "custom", "partner", "ai-generated"]);
export const RoomObjectRendererSchema = z.enum(["gltf", "procedural"]);
export const VERSE_ROOM_TYPES = [
  "skill-verse",
  "culture-verse",
  "creator-verse",
  "food-verse",
  "mondi-verse",
  "work-verse"
] as const;

export const RoomTypeSchema = z.enum([
  "classroom",
  "workforce-training",
  "free-for-all",
  "escape-room",
  ...VERSE_ROOM_TYPES
]);
export type RoomType = z.infer<typeof RoomTypeSchema>;
export type VerseRoomType = (typeof VERSE_ROOM_TYPES)[number];

const VERSE_ROOM_TYPE_SET = new Set<string>(VERSE_ROOM_TYPES);

/** True for Dream IXR verse base room types (SkillVerse, CultureVerse, etc.). */
export function isVerseRoomType(roomType: RoomType | string | null | undefined): roomType is VerseRoomType {
  return typeof roomType === "string" && VERSE_ROOM_TYPE_SET.has(roomType);
}

/** Map a verse id (`skill`, `culture`, …) to its room type slug. */
export function verseRoomTypeFromVerseId(verseId: string): VerseRoomType | null {
  const slug = `${verseId}-verse`;
  return VERSE_ROOM_TYPE_SET.has(slug) ? (slug as VerseRoomType) : null;
}

/** Extract the verse id from a verse room type, e.g. `skill-verse` → `skill`. */
export function verseIdFromRoomType(roomType: RoomType | string | null | undefined): string | null {
  if (!isVerseRoomType(roomType)) return null;
  return roomType.slice(0, -"-verse".length);
}
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
  horizonWorldY: z.number().positive().default(7.5),
  maxWorldHeight: z.number().positive().default(12),
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
  gravityMultiplier: z.number().positive().max(4).optional(),
  jumpMultiplier: z.number().positive().max(4).optional(),
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

// ── World building (FFA build pieces) ─────────────────────────────────────────

/** Canonical max build height level (shared with `@3dspace/room-engine`). */
export const BUILD_MAX_LEVEL = 4;

/** Max pieces per `POST …/build-pieces/batch` (drag-paint + stamps chunk client-side). */
export const BUILD_PIECES_BATCH_MAX_SIZE = 32;

export const BuildPieceKindSchema = z.enum([
  "wall",
  "simple-wall",
  "floor",
  "image-floor",
  "ramp",
  "doorway",
  "window",
  "light",
  "mirror",
  "arbor-ceiling",
  "arbor-futuristic-ceiling",
  "ceiling-futuristic-lighting",
  "ceiling-futuristic"
]);

/** Allowed MIME types for image-floor texture uploads. */
export const BUILD_FLOOR_TEXTURE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** How many build cells wide/tall one uploaded image covers at native scale. */
export const IMAGE_FLOOR_TEXTURE_SPAN_OPTIONS = [2, 4, 8] as const;
export const DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS = 4;
export const ImageFloorTextureSpanCellsSchema = z.union([
  z.literal(2),
  z.literal(4),
  z.literal(8)
]);
export const BuildPieceEdgeSchema = z.enum(["n", "e", "s", "w"]);
export const BuildPieceRotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270)
]);
export const BuildPieceMaterialSchema = z.enum(["stone", "wood", "metal", "glass", "neon"]);
export const BuildDestroyPolicySchema = z.enum(["anyone", "owner-or-teacher"]);

export const BuildPieceSchema = z
  .object({
    id: z.string(),
    roomId: z.string(),
    kind: BuildPieceKindSchema,
    cell: z.object({ ix: z.number().int(), iz: z.number().int() }),
    level: z.number().int().min(0).max(BUILD_MAX_LEVEL),
    edge: BuildPieceEdgeSchema.optional(),
    rotation: BuildPieceRotationSchema.default(0),
    materialId: BuildPieceMaterialSchema.default("stone"),
    /** Storage key of the uploaded image (image-floor only). */
    textureStorageKey: z.string().min(1).max(512).optional(),
    /** Cells wide/tall one image covers; image-floor only (default 4). */
    textureSpanCells: ImageFloorTextureSpanCellsSchema.optional(),
    createdByUserId: z.string(),
    createdAt: z.string()
  })
  .superRefine((piece, ctx) => {
    if (piece.textureStorageKey !== undefined && piece.kind !== "image-floor") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "only image-floor pieces may set textureStorageKey",
        path: ["textureStorageKey"]
      });
    }
    if (piece.textureSpanCells !== undefined && piece.kind !== "image-floor") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "only image-floor pieces may set textureSpanCells",
        path: ["textureSpanCells"]
      });
    }
    const edgeKinds = ["wall", "simple-wall", "doorway", "window", "mirror"] as const;
    if (edgeKinds.includes(piece.kind as (typeof edgeKinds)[number])) {
      if (!piece.edge) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${piece.kind} pieces require edge`,
          path: ["edge"]
        });
      }
      return;
    }
    if (piece.edge !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "only edge-aligned pieces may set edge",
        path: ["edge"]
      });
    }
  });

export const CreateBuildPieceRequestSchema = z
  .object({
    kind: BuildPieceKindSchema,
    cell: z.object({ ix: z.number().int(), iz: z.number().int() }),
    level: z.number().int().min(0).max(BUILD_MAX_LEVEL),
    edge: BuildPieceEdgeSchema.optional(),
    rotation: BuildPieceRotationSchema.optional(),
    materialId: BuildPieceMaterialSchema.optional(),
    textureStorageKey: z.string().min(1).max(512).optional(),
    textureSpanCells: ImageFloorTextureSpanCellsSchema.optional()
  })
  .superRefine((piece, ctx) => {
    if (piece.textureStorageKey !== undefined && piece.kind !== "image-floor") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "only image-floor pieces may set textureStorageKey",
        path: ["textureStorageKey"]
      });
    }
    if (piece.textureSpanCells !== undefined && piece.kind !== "image-floor") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "only image-floor pieces may set textureSpanCells",
        path: ["textureSpanCells"]
      });
    }
    const edgeKinds = ["wall", "simple-wall", "doorway", "window", "mirror"] as const;
    if (edgeKinds.includes(piece.kind as (typeof edgeKinds)[number]) && !piece.edge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${piece.kind} pieces require edge`,
        path: ["edge"]
      });
    }
    if (!edgeKinds.includes(piece.kind as (typeof edgeKinds)[number]) && piece.edge !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "only edge-aligned pieces may set edge",
        path: ["edge"]
      });
    }
  });

export const CreateBuildPiecesBatchRequestSchema = z.object({
  pieces: z.array(CreateBuildPieceRequestSchema).min(1).max(BUILD_PIECES_BATCH_MAX_SIZE)
});

export const CreateBuildFloorTextureUploadRequestSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(BUILD_FLOOR_TEXTURE_CONTENT_TYPES)
});

export const CreateBuildFloorTextureUploadResponseSchema = z.object({
  storageKey: z.string(),
  /** Stable public URL every client uses to render the floor texture. */
  textureUrl: z.string(),
  upload: z.object({
    url: z.string(),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string())
  })
});

export const ListBuildPiecesResponseSchema = z.object({
  pieces: z.array(BuildPieceSchema)
});

export const RoomBuildUpsertMessageV1Schema = z.object({
  type: z.literal("room.build.upsert.v1"),
  roomId: z.string(),
  piece: BuildPieceSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomBuildRemoveMessageV1Schema = z.object({
  type: z.literal("room.build.remove.v1"),
  roomId: z.string(),
  pieceId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomBuildBatchMessageV1Schema = z.object({
  type: z.literal("room.build.batch.v1"),
  roomId: z.string(),
  pieces: z.array(BuildPieceSchema),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomBuildRealtimeMessageSchema = z.discriminatedUnion("type", [
  RoomBuildUpsertMessageV1Schema,
  RoomBuildRemoveMessageV1Schema,
  RoomBuildBatchMessageV1Schema
]);

// ── World Assets (placed furniture etc.) ─────────────────────────────────────

/** How a custom-uploaded GLB is placed; drives the ghost + snapping rules. */
export const WorldAssetPlacementKindSchema = z.enum(["floor", "wall", "ceiling", "other"]);
export type WorldAssetPlacementKind = z.infer<typeof WorldAssetPlacementKindSchema>;

/**
 * Optional interactive behaviour an uploaded **object** (placement `"other"`)
 * can be classified as. A `"chair"` becomes sittable and opens the personal
 * notebook when sat in; a `"podium"` becomes a presenter station that opens the
 * importable notebook when stood at. Only meaningful for objects — floor / wall
 * / ceiling placements ignore it.
 */
export const WorldAssetObjectRoleSchema = z.enum(["chair", "podium"]);
export type WorldAssetObjectRole = z.infer<typeof WorldAssetObjectRoleSchema>;

/**
 * Render info denormalized onto a placed asset when it comes from a user's
 * private custom-asset library. Carried on the placement so every participant
 * in the room can render it without access to the owner's library.
 */
export const PlacedCustomAssetSchema = z.object({
  glbUrl: z.string().min(1),
  placement: WorldAssetPlacementKindSchema,
  thumbnailUrl: z.string().optional(),
  /** Interactive behaviour (chair / podium) the owner classified this object as. */
  objectRole: WorldAssetObjectRoleSchema.optional()
});
export type PlacedCustomAsset = z.infer<typeof PlacedCustomAssetSchema>;

export const PlacedWorldAssetSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  /** Asset catalog slug, e.g. "folding-chair". For custom assets, the library asset id. */
  slug: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  /** Y-axis rotation in radians. */
  yaw: z.number(),
  /** Instance render scale (catalog base scale × placement variance). Defaults to 1. */
  scale: z.number().positive().optional(),
  /** Present when this placement is a user-uploaded custom GLB (see schema). */
  custom: PlacedCustomAssetSchema.optional(),
  placedByUserId: z.string(),
  createdAt: z.string()
});

export const CreateWorldAssetRequestSchema = z.object({
  slug: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  yaw: z.number(),
  scale: z.number().positive().optional(),
  custom: PlacedCustomAssetSchema.optional()
});

const WorldAssetUpsertMessageSchema = z.object({
  type: z.literal("room.world-asset.upsert.v1"),
  roomId: z.string(),
  asset: PlacedWorldAssetSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

const WorldAssetRemoveMessageSchema = z.object({
  type: z.literal("room.world-asset.remove.v1"),
  roomId: z.string(),
  assetId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const WorldAssetRealtimeMessageSchema = z.discriminatedUnion("type", [
  WorldAssetUpsertMessageSchema,
  WorldAssetRemoveMessageSchema
]);

export const CreateWorldAssetResponseSchema = z.object({
  asset: PlacedWorldAssetSchema,
  realtimeMessages: z.array(WorldAssetRealtimeMessageSchema).default([])
});

export const ListWorldAssetsResponseSchema = z.object({
  assets: z.array(PlacedWorldAssetSchema)
});

export const DeleteWorldAssetResponseSchema = z.object({
  realtimeMessages: z.array(WorldAssetRealtimeMessageSchema).default([])
});

export type PlacedWorldAsset = z.infer<typeof PlacedWorldAssetSchema>;
export type WorldAssetRealtimeMessage = z.infer<typeof WorldAssetRealtimeMessageSchema>;

// ── Custom (user-uploaded) world-asset library ─────────────────────────────────

/** Content types accepted for an uploaded custom GLB. */
export const CUSTOM_ASSET_GLB_CONTENT_TYPES = ["model/gltf-binary", "application/octet-stream"] as const;
/** Content types accepted for a custom-asset thumbnail. */
export const CUSTOM_ASSET_THUMBNAIL_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** Hard ceiling on uploaded GLB size (bytes); also enforced client-side. */
export const CUSTOM_ASSET_MAX_GLB_BYTES = 25 * 1024 * 1024;

/** A user's private, reusable uploaded GLB (catalog entry, not a placement). */
export const CustomWorldAssetSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  displayName: z.string().min(1).max(120),
  glbStorageKey: z.string().min(1),
  glbUrl: z.string().min(1),
  thumbnailStorageKey: z.string().min(1),
  thumbnailUrl: z.string().min(1),
  placement: WorldAssetPlacementKindSchema,
  /** Interactive behaviour (chair / podium) classified for an object upload. */
  objectRole: WorldAssetObjectRoleSchema.optional(),
  scale: z.number().positive().optional(),
  createdAt: z.string()
});
export type CustomWorldAsset = z.infer<typeof CustomWorldAssetSchema>;

/** Presign request: reserve storage keys + upload targets for the GLB + thumbnail. */
export const CreateCustomAssetUploadRequestSchema = z.object({
  glbFileName: z.string().min(1).max(200),
  glbContentType: z.enum(CUSTOM_ASSET_GLB_CONTENT_TYPES),
  thumbnailFileName: z.string().min(1).max(200),
  thumbnailContentType: z.enum(CUSTOM_ASSET_THUMBNAIL_CONTENT_TYPES)
});

const CustomAssetUploadSlotSchema = z.object({
  storageKey: z.string(),
  url: z.string(),
  upload: z.object({
    url: z.string(),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string())
  })
});

export const CreateCustomAssetUploadResponseSchema = z.object({
  glb: CustomAssetUploadSlotSchema,
  thumbnail: CustomAssetUploadSlotSchema
});

/** Finalize: create the library record from already-uploaded blobs. */
export const CreateCustomAssetRequestSchema = z.object({
  displayName: z.string().min(1).max(120),
  glbStorageKey: z.string().min(1),
  glbUrl: z.string().min(1),
  thumbnailStorageKey: z.string().min(1),
  thumbnailUrl: z.string().min(1),
  placement: WorldAssetPlacementKindSchema,
  objectRole: WorldAssetObjectRoleSchema.optional(),
  scale: z.number().positive().optional()
});

export const CreateCustomAssetResponseSchema = z.object({
  asset: CustomWorldAssetSchema
});

/**
 * Patch an existing library upload. Currently only the interactive `objectRole`
 * is editable, so users can classify (or clear) a chair/podium after the fact
 * without re-uploading. `null` clears the role back to a plain prop.
 */
export const UpdateCustomAssetRequestSchema = z.object({
  objectRole: WorldAssetObjectRoleSchema.nullable()
});

export const UpdateCustomAssetResponseSchema = z.object({
  asset: CustomWorldAssetSchema
});

export const ListCustomAssetsResponseSchema = z.object({
  assets: z.array(CustomWorldAssetSchema)
});

export type CreateCustomAssetUploadRequest = z.infer<typeof CreateCustomAssetUploadRequestSchema>;
export type CreateCustomAssetUploadResponse = z.infer<typeof CreateCustomAssetUploadResponseSchema>;
export type CreateCustomAssetRequest = z.infer<typeof CreateCustomAssetRequestSchema>;
export type UpdateCustomAssetRequest = z.infer<typeof UpdateCustomAssetRequestSchema>;

export const CreateBuildPieceResponseSchema = z.object({
  piece: BuildPieceSchema,
  realtimeMessages: z.array(RoomBuildRealtimeMessageSchema).default([])
});

export const CreateBuildPiecesBatchResponseSchema = z.object({
  pieces: z.array(BuildPieceSchema),
  realtimeMessages: z.array(RoomBuildRealtimeMessageSchema).default([])
});

export const DeleteBuildPieceResponseSchema = z.object({
  realtimeMessages: z.array(RoomBuildRealtimeMessageSchema).default([])
});

export const ClearBuildPiecesResponseSchema = z.object({
  realtimeMessages: z.array(RoomBuildRealtimeMessageSchema).default([])
});

// ── Escape room logic pieces ───────────────────────────────────────────────────

export const LogicPieceKindSchema = z.enum([
  "button",
  "pressurePlate",
  "proximityZone",
  "timer",
  "door",
  "light",
  "teleporter"
]);

export const LogicRoleSchema = z.enum(["emitter", "consumer"]);

export const LogicConfigSchema = z
  .object({
    fireMode: z.enum(["pulse", "toggle", "whileHeld"]).default("pulse"),
    listenMode: z.enum(["momentary", "toggle", "latch"]).default("latch"),
    requireAll: z.array(z.string()).default([]),
    delayMs: z.number().int().min(0).max(600000).default(0),
    intervalMs: z.number().int().min(0).max(600000).default(0),
    triggerChannelId: z.string().max(64).optional(),
    debounceMs: z.number().int().min(0).max(10000).default(250),
    isExit: z.boolean().default(false),
    initialState: z.record(z.unknown()).default({})
  })
  .default({});

export const BuildLogicPieceSchema = z
  .object({
    id: z.string(),
    roomId: z.string(),
    kind: LogicPieceKindSchema,
    cell: z.object({ ix: z.number().int(), iz: z.number().int() }),
    level: z.number().int().min(0).max(BUILD_MAX_LEVEL),
    edge: BuildPieceEdgeSchema.optional(),
    rotation: BuildPieceRotationSchema.default(0),
    channelId: z.string().max(64).optional(),
    linkId: z.string().max(64).optional(),
    config: LogicConfigSchema,
    createdByUserId: z.string(),
    createdAt: z.string()
  })
  .superRefine((piece, ctx) => {
    const edgeKinds = ["door", "button"] as const;
    if (edgeKinds.includes(piece.kind as (typeof edgeKinds)[number])) {
      if (!piece.edge) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${piece.kind} logic pieces require edge`,
          path: ["edge"]
        });
      }
      return;
    }
    if (piece.edge !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "only edge-aligned logic pieces may set edge",
        path: ["edge"]
      });
    }
  });

export const CreateLogicPieceRequestSchema = z
  .object({
    kind: LogicPieceKindSchema,
    cell: z.object({ ix: z.number().int(), iz: z.number().int() }),
    level: z.number().int().min(0).max(BUILD_MAX_LEVEL),
    edge: BuildPieceEdgeSchema.optional(),
    rotation: BuildPieceRotationSchema.optional(),
    channelId: z.string().max(64).optional(),
    linkId: z.string().max(64).optional(),
    config: LogicConfigSchema.optional()
  })
  .superRefine((piece, ctx) => {
    const edgeKinds = ["door", "button"] as const;
    if (edgeKinds.includes(piece.kind as (typeof edgeKinds)[number]) && !piece.edge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${piece.kind} logic pieces require edge`,
        path: ["edge"]
      });
    }
    if (!edgeKinds.includes(piece.kind as (typeof edgeKinds)[number]) && piece.edge !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "only edge-aligned logic pieces may set edge",
        path: ["edge"]
      });
    }
  });

export const UpdateLogicPieceRequestSchema = z.object({
  channelId: z.string().max(64).optional(),
  linkId: z.string().max(64).optional(),
  config: LogicConfigSchema.optional()
});

export const ListLogicPiecesResponseSchema = z.object({
  pieces: z.array(BuildLogicPieceSchema)
});

export const LogicChannelStateSchema = z.object({
  latched: z.boolean(),
  lastPulseAt: z.number().int()
});

export const LogicStateSchema = z.object({
  roomId: z.string(),
  channels: z.record(z.string(), LogicChannelStateSchema).default({}),
  nodes: z.record(z.string(), z.record(z.unknown())).default({}),
  updatedAt: z.string()
});

export const RoomLogicUpsertMessageV1Schema = z.object({
  type: z.literal("room.logic.upsert.v1"),
  roomId: z.string(),
  piece: BuildLogicPieceSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomLogicRemoveMessageV1Schema = z.object({
  type: z.literal("room.logic.remove.v1"),
  roomId: z.string(),
  pieceId: z.string(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomLogicStateMessageV1Schema = z.object({
  type: z.literal("room.logic.state.v1"),
  roomId: z.string(),
  channels: z.record(z.string(), LogicChannelStateSchema).optional(),
  nodes: z.record(z.string(), z.record(z.unknown())).optional(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const RoomLogicRealtimeMessageSchema = z.discriminatedUnion("type", [
  RoomLogicUpsertMessageV1Schema,
  RoomLogicRemoveMessageV1Schema,
  RoomLogicStateMessageV1Schema
]);

export const PatchLogicPieceNodeStateRequestSchema = z.object({
  open: z.boolean().optional(),
  on: z.boolean().optional(),
  armed: z.boolean().optional()
});

export const PatchLogicPieceNodeStateResponseSchema = z.object({
  state: LogicStateSchema,
  realtimeMessages: z.array(RoomLogicRealtimeMessageSchema).default([])
});

export const CreateLogicPieceResponseSchema = z.object({
  piece: BuildLogicPieceSchema,
  realtimeMessages: z.array(RoomLogicRealtimeMessageSchema).default([])
});

export const UpdateLogicPieceResponseSchema = z.object({
  piece: BuildLogicPieceSchema,
  realtimeMessages: z.array(RoomLogicRealtimeMessageSchema).default([])
});

export const DeleteLogicPieceResponseSchema = z.object({
  realtimeMessages: z.array(RoomLogicRealtimeMessageSchema).default([])
});

export const ClearLogicPiecesResponseSchema = z.object({
  realtimeMessages: z.array(RoomLogicRealtimeMessageSchema).default([])
});

export const GetLogicStateResponseSchema = z.object({
  state: LogicStateSchema
});

export const LogicSignalKindSchema = z.enum([
  "interact",
  "stepOn",
  "stepOff",
  "proximityEnter",
  "proximityExit"
]);

export const LogicPieceSignalRequestSchema = z.object({
  kind: LogicSignalKindSchema
});

export const LogicPieceSignalResponseSchema = z.object({
  ok: z.literal(true),
  pieceId: z.string(),
  kind: LogicSignalKindSchema,
  state: LogicStateSchema.optional(),
  realtimeMessages: z.array(RoomLogicRealtimeMessageSchema).default([]),
  teleportTo: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  /** Destination pad id — client suppresses step-on there until the player leaves (avoids bounce loops). */
  teleportTargetPieceId: z.string().optional()
});

export const EscapeSessionStatusSchema = z.enum(["idle", "running", "won", "ended"]);

export const EscapeSessionSchema = z.object({
  roomId: z.string(),
  status: EscapeSessionStatusSchema.default("idle"),
  startedAt: z.string().nullable().default(null),
  durationSec: z.number().int().positive().max(7200).default(900),
  endedAt: z.string().nullable().default(null)
});

export const RoomSessionMessageV1Schema = z.object({
  type: z.literal("room.session.v1"),
  roomId: z.string(),
  session: EscapeSessionSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});

export const GetEscapeSessionResponseSchema = z.object({
  session: EscapeSessionSchema
});

export const StartEscapeSessionRequestSchema = z.object({
  durationSec: z.number().int().positive().max(7200).optional()
});

export const EscapeSessionMutationResponseSchema = z.object({
  session: EscapeSessionSchema,
  realtimeMessages: z
    .array(z.union([RoomSessionMessageV1Schema, RoomLogicRealtimeMessageSchema]))
    .default([])
});

/** Durable room-event types emitted by build-piece mutations (see `recordRoomEvent`). */
export const BUILD_ROOM_EVENT_TYPES = {
  piecePlaced: "build.piece.placed.v1",
  pieceRemoved: "build.piece.removed.v1",
  piecesBatch: "build.pieces.batch.v1",
  piecesCleared: "build.pieces.cleared.v1"
} as const;

export const BuildRoomEventTypeSchema = z.enum([
  BUILD_ROOM_EVENT_TYPES.piecePlaced,
  BUILD_ROOM_EVENT_TYPES.pieceRemoved,
  BUILD_ROOM_EVENT_TYPES.piecesBatch,
  BUILD_ROOM_EVENT_TYPES.piecesCleared
]);

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
  "auth-domain-not-allowed",
  "auth-email-not-verified",
  "auth-oauth-state-invalid",
  "auth-session-expired",
  "auth-oauth-failed",
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
  "meeting-notes-transcription-unavailable",
  "meeting-notes-transcription-failed",
  "world-skins-disabled",
  "avatar-accessories-disabled",
  "build-disabled",
  "build-rejected",
  "build-cap-exceeded",
  "build-destroy-denied",
  "build-not-found",
  "build-wall-has-boards",
  "logic-disabled",
  "logic-rejected",
  "logic-cap-exceeded",
  "logic-destroy-denied",
  "logic-not-found",
  "logic-slot-occupied",
  "ai-host-disabled",
  "ai-host-not-found",
  "ai-host-exists",
  "ai-host-file-not-found",
  "ai-host-file-not-ready",
  "ai-host-file-rejected",
  "ai-host-unavailable",
  "ai-host-rate-limited",
  "translation-unavailable",
  "translation-failed",
  "translation-voice-unavailable"
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
