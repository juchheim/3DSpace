import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

export const RoleSchema = z.enum(["teacher", "student"]);
export const ViewModeSchema = z.enum(["3d", "2d"]);
export const QualityLevelSchema = z.enum(["low", "medium", "high"]);
export const AttachmentKindSchema = z.enum(["image", "video", "audio", "future"]);
export const MembershipStatusSchema = z.enum(["active", "invited", "removed"]);
export const AttachmentStatusSchema = z.enum(["pending_upload", "ready", "rejected"]);
export const DistanceModelSchema = z.enum(["linear", "inverse", "exponential"]);

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

export const WallPlaneSchema = z.object({
  id: z.string(),
  label: z.string(),
  start: Vector3Schema,
  end: Vector3Schema,
  height: z.number().positive(),
  anchorIds: z.array(z.string()).default([])
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
  roomEvents: z.boolean()
});

export const RoomProjectionSchema = z.object({
  kind: z.literal("top-down-v1"),
  scale: z.number().positive(),
  origin: Vector2Schema
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
  projection: RoomProjectionSchema,
  capabilities: RoomCapabilitiesSchema,
  spatialAudio: SpatialAudioConfigSchema,
  features: z.array(RoomFeatureSchema).default([]),
  createdAt: z.string()
});

export const UserSchema = z.object({
  id: z.string(),
  externalAuthId: z.string(),
  displayName: z.string(),
  avatar: z.object({
    color: z.string(),
    initials: z.string()
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

export const RoomSettingsSchema = z.object({
  maxParticipants: z.number().int().positive(),
  defaultViewMode: ViewModeSchema,
  defaultQuality: QualityLevelSchema,
  enable2DAnalog: z.boolean(),
  enableWallAttachments: z.boolean()
});

export const RoomSchema = z.object({
  id: z.string(),
  classId: z.string(),
  name: z.string(),
  activeManifestVersion: z.number().int().positive(),
  settings: RoomSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CreateRoomRequestSchema = z.object({
  classId: z.string().min(1),
  name: z.string().min(1).max(120)
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

export const CreateWallAttachmentResponseSchema = z.object({
  attachment: WallAttachmentSchema,
  upload: z.object({
    url: z.string(),
    method: z.literal("PUT"),
    headers: z.record(z.string())
  })
});

export const WallAttachmentDownloadResponseSchema = z.object({
  attachment: WallAttachmentSchema,
  download: z.object({
    url: z.string(),
    method: z.literal("GET"),
    headers: z.record(z.string()),
    expiresInSeconds: z.number().int().positive()
  })
});

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
  { method: "post", path: "/v1/invites/{inviteCode}/accept", summary: "Accept a class or room invite", tags: ["invites"], response: AcceptInviteResponseSchema },
  { method: "get", path: "/v1/rooms", summary: "List rooms visible to the current user", tags: ["rooms"], response: z.array(RoomSchema) },
  { method: "post", path: "/v1/rooms", summary: "Create a room for a class", tags: ["rooms"], request: CreateRoomRequestSchema, response: RoomWithManifestSchema },
  { method: "patch", path: "/v1/rooms/{roomId}", summary: "Update room metadata", tags: ["rooms"], request: UpdateRoomRequestSchema, response: RoomSchema },
  { method: "delete", path: "/v1/rooms/{roomId}", summary: "Delete a room and related data", tags: ["rooms"], response: DeleteRoomResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/manifest", summary: "Get active room manifest", tags: ["rooms"], response: RoomManifestSchema },
  { method: "post", path: "/v1/rooms/{roomId}/session", summary: "Join a room and receive LiveKit session data", tags: ["rooms"], request: JoinRoomSessionRequestSchema, response: RoomSessionResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/attachments", summary: "List wall attachments", tags: ["attachments"], response: z.array(WallAttachmentSchema) },
  { method: "post", path: "/v1/rooms/{roomId}/attachments", summary: "Create wall attachment metadata and signed upload URL", tags: ["attachments"], request: CreateWallAttachmentRequestSchema, response: CreateWallAttachmentResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/attachments/{attachmentId}/download", summary: "Create a signed wall attachment download URL", tags: ["attachments"], response: WallAttachmentDownloadResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/events", summary: "Persist optional durable room events", tags: ["rooms"], request: RoomEventRequestSchema, response: RoomEventResponseSchema }
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
