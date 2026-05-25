import { DistanceModelSchema, QualityLevelSchema, ViewModeSchema, type SpatialAudioConfig } from "@3dspace/contracts";

export type AppConfig = {
  nodeEnv: string;
  host: string;
  port: number;
  apiPublicUrl: string;
  corsAllowedOrigins: string[];
  clerkSecretKey: string | undefined;
  clerkWebhookSecret: string | undefined;
  mongoUri: string | undefined;
  mongoDbName: string;
  livekitUrl: string;
  livekitApiKey: string | undefined;
  livekitApiSecret: string | undefined;
  objectStorage: {
    endpoint: string | undefined;
    bucket: string | undefined;
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    publicBaseUrl: string | undefined;
    /** When true, downloads use OBJECT_STORAGE_PUBLIC_BASE_URL without signing (bucket must allow anonymous GET). */
    publicRead: boolean;
  };
  sentryDsn: string | undefined;
  /** When set, enables POST/GET /v1/world-skin-uploader/* operator routes. */
  worldSkinUploaderPassword: string | undefined;
  tuning: {
    avatarSendHz: number;
    interpolationMs: number;
    maxRoomParticipants: number;
    sessionJoinRateLimitPerMinute: number;
    defaultViewMode: "3d" | "2d";
    defaultQuality: "low" | "medium" | "high";
    enable2DAnalog: boolean;
    enableWallAttachments: boolean;
    enableWallObjects: boolean;
    wallObjectCreationDefault: "teacher-only" | "student-request" | "student-direct";
    wallObjectMaxActivePerRoom: number;
    wallObjectMaxActiveLiveShares: number;
    wallObjectMaxImageBytes: number;
    wallObjectMaxVideoBytes: number;
    wallObjectMaxAudioBytes: number;
    wallObjectAllowedImageTypes: string[];
    wallObjectAllowedVideoTypes: string[];
    wallObjectAllowedAudioTypes: string[];
    enableWallWebLinks: boolean;
    enableWallWebEmbeds: boolean;
    wallWebEmbedAllowlist: string[];
    enableWallScreenShare: boolean;
    enableWallStudentUploads: boolean;
    enableWallStudentLiveShares: boolean;
    enableClassroomLessons: boolean;
    enableBreakoutPods: boolean;
    enableRoomObjects: boolean;
    enableWorldSkins: boolean;
    enableStudentMediaPermissions: boolean;
    spatialAudio: SpatialAudioConfig;
    media: {
      defaultCameraEnabled: boolean;
      defaultMicEnabled: boolean;
      maxVideoWidth: number;
      maxVideoHeight: number;
      maxVideoFps: number;
    };
  };
};

function envString(raw: NodeJS.ProcessEnv, key: string) {
  const value = raw[key]?.trim();
  return value ? value : undefined;
}

function normalizeLiveKitUrl(url: string) {
  if (url.startsWith("https://")) return `wss://${url.slice("https://".length)}`;
  if (url.startsWith("http://")) return `ws://${url.slice("http://".length)}`;
  return url;
}

function envNumber(raw: NodeJS.ProcessEnv, key: string, defaultValue: number) {
  const value = envString(raw, key);
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a number`);
  }
  return parsed;
}

function envBoolean(raw: NodeJS.ProcessEnv, key: string, defaultValue: boolean) {
  const value = envString(raw, key);
  if (!value) return defaultValue;
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`${key} must be a boolean`);
}

function envStringList(raw: NodeJS.ProcessEnv, key: string, defaultValue: string[]) {
  return (envString(raw, key) ?? defaultValue.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function envWallObjectCreation(raw: NodeJS.ProcessEnv) {
  const value = envString(raw, "WALL_OBJECT_CREATION_DEFAULT") ?? "teacher-only";
  if (value === "teacher-only" || value === "student-request" || value === "student-direct") return value;
  throw new Error("WALL_OBJECT_CREATION_DEFAULT must be teacher-only, student-request, or student-direct");
}

function requiredInProduction(config: AppConfig, raw: NodeJS.ProcessEnv) {
  if (config.nodeEnv !== "production") return;

  const required = [
    "API_PUBLIC_URL",
    "CORS_ALLOWED_ORIGINS",
    "CLERK_SECRET_KEY",
    "MONGODB_URI",
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET"
  ];

  if (config.tuning.enableWallAttachments) {
    required.push(
      "OBJECT_STORAGE_ENDPOINT",
      "OBJECT_STORAGE_BUCKET",
      "OBJECT_STORAGE_ACCESS_KEY_ID",
      "OBJECT_STORAGE_SECRET_ACCESS_KEY"
    );
  }

  const missing = required.filter((key) => !envString(raw, key));
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

export function loadConfig(raw: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = envString(raw, "NODE_ENV") ?? "development";
  const distanceModel = DistanceModelSchema.parse(envString(raw, "SPATIAL_AUDIO_DISTANCE_MODEL") ?? "inverse");
  const defaultViewMode = ViewModeSchema.parse(envString(raw, "DEFAULT_VIEW_MODE") ?? "3d");
  const defaultQuality = QualityLevelSchema.parse(envString(raw, "DEFAULT_3D_QUALITY") ?? "low");
  const apiPublicUrl = envString(raw, "API_PUBLIC_URL") ?? "http://127.0.0.1:8080";
  const corsAllowedOrigins = (envString(raw, "CORS_ALLOWED_ORIGINS") ?? "http://127.0.0.1:3000,http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const config: AppConfig = {
    nodeEnv,
    host: envString(raw, "HOST") ?? (nodeEnv === "production" ? "0.0.0.0" : "127.0.0.1"),
    port: envNumber(raw, "PORT", 8080),
    apiPublicUrl,
    corsAllowedOrigins,
    clerkSecretKey: envString(raw, "CLERK_SECRET_KEY"),
    clerkWebhookSecret: envString(raw, "CLERK_WEBHOOK_SECRET"),
    mongoUri: envString(raw, "MONGODB_URI"),
    mongoDbName: envString(raw, "MONGODB_DB_NAME") ?? "3dspace",
    livekitUrl: normalizeLiveKitUrl(
      envString(raw, "LIVEKIT_URL") ?? envString(raw, "NEXT_PUBLIC_LIVEKIT_URL") ?? "ws://localhost:7880"
    ),
    livekitApiKey: envString(raw, "LIVEKIT_API_KEY"),
    livekitApiSecret: envString(raw, "LIVEKIT_API_SECRET"),
    objectStorage: {
      endpoint: envString(raw, "OBJECT_STORAGE_ENDPOINT"),
      bucket: envString(raw, "OBJECT_STORAGE_BUCKET"),
      accessKeyId: envString(raw, "OBJECT_STORAGE_ACCESS_KEY_ID"),
      secretAccessKey: envString(raw, "OBJECT_STORAGE_SECRET_ACCESS_KEY"),
      publicBaseUrl: envString(raw, "OBJECT_STORAGE_PUBLIC_BASE_URL"),
      publicRead: envBoolean(raw, "OBJECT_STORAGE_PUBLIC_READ", false)
    },
    sentryDsn: envString(raw, "SENTRY_DSN"),
    worldSkinUploaderPassword: envString(raw, "WORLD_SKIN_UPLOADER_PASSWORD"),
    tuning: {
      avatarSendHz: envNumber(raw, "AVATAR_STATE_SEND_HZ", 12),
      interpolationMs: envNumber(raw, "AVATAR_INTERPOLATION_MS", 120),
      maxRoomParticipants: envNumber(raw, "MAX_ROOM_PARTICIPANTS", 30),
      sessionJoinRateLimitPerMinute: envNumber(raw, "SESSION_JOIN_RATE_LIMIT_PER_MINUTE", 20),
      defaultViewMode,
      defaultQuality,
      enable2DAnalog: envBoolean(raw, "ENABLE_2D_ANALOG", true),
      enableWallAttachments: envBoolean(raw, "ENABLE_WALL_ATTACHMENTS", true),
      enableWallObjects: envBoolean(raw, "ENABLE_WALL_OBJECTS", true),
      wallObjectCreationDefault: envWallObjectCreation(raw),
      wallObjectMaxActivePerRoom: envNumber(raw, "WALL_OBJECT_MAX_ACTIVE_PER_ROOM", 20),
      wallObjectMaxActiveLiveShares: envNumber(raw, "WALL_OBJECT_MAX_ACTIVE_LIVE_SHARES", 4),
      wallObjectMaxImageBytes: envNumber(raw, "WALL_OBJECT_MAX_IMAGE_BYTES", 10_485_760),
      wallObjectMaxVideoBytes: envNumber(raw, "WALL_OBJECT_MAX_VIDEO_BYTES", 262_144_000),
      wallObjectMaxAudioBytes: envNumber(raw, "WALL_OBJECT_MAX_AUDIO_BYTES", 52_428_800),
      wallObjectAllowedImageTypes: envStringList(raw, "WALL_OBJECT_ALLOWED_IMAGE_TYPES", ["image/png", "image/jpeg", "image/webp"]),
      wallObjectAllowedVideoTypes: envStringList(raw, "WALL_OBJECT_ALLOWED_VIDEO_TYPES", ["video/mp4", "video/webm"]),
      wallObjectAllowedAudioTypes: envStringList(raw, "WALL_OBJECT_ALLOWED_AUDIO_TYPES", ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm"]),
      enableWallWebLinks: envBoolean(raw, "ENABLE_WALL_WEB_LINKS", true),
      enableWallWebEmbeds: envBoolean(raw, "ENABLE_WALL_WEB_EMBEDS", false),
      wallWebEmbedAllowlist: envStringList(raw, "WALL_WEB_EMBED_ALLOWLIST", []),
      enableWallScreenShare: envBoolean(raw, "ENABLE_WALL_SCREEN_SHARE", true),
      enableWallStudentUploads: envBoolean(raw, "ENABLE_WALL_STUDENT_UPLOADS", false),
      enableWallStudentLiveShares: envBoolean(raw, "ENABLE_WALL_STUDENT_LIVE_SHARES", false),
      enableClassroomLessons: envBoolean(raw, "ENABLE_CLASSROOM_LESSONS", false),
      enableBreakoutPods: envBoolean(raw, "ENABLE_BREAKOUT_PODS", false),
      enableRoomObjects: envBoolean(raw, "ENABLE_ROOM_OBJECTS", false),
      enableWorldSkins: envBoolean(raw, "ENABLE_WORLD_SKINS", false),
      enableStudentMediaPermissions: envBoolean(raw, "ENABLE_STUDENT_MEDIA_PERMISSIONS", false),
      spatialAudio: {
        enabled: envBoolean(raw, "SPATIAL_AUDIO_ENABLED", true),
        distanceModel,
        refDistance: envNumber(raw, "SPATIAL_AUDIO_REF_DISTANCE", 1),
        maxDistance: envNumber(raw, "SPATIAL_AUDIO_MAX_DISTANCE", 24),
        rolloffFactor: envNumber(raw, "SPATIAL_AUDIO_ROLLOFF_FACTOR", 1.4)
      },
      media: {
        defaultCameraEnabled: envBoolean(raw, "MEDIA_DEFAULT_CAMERA_ENABLED", false),
        defaultMicEnabled: envBoolean(raw, "MEDIA_DEFAULT_MIC_ENABLED", false),
        maxVideoWidth: envNumber(raw, "MEDIA_MAX_VIDEO_WIDTH", 640),
        maxVideoHeight: envNumber(raw, "MEDIA_MAX_VIDEO_HEIGHT", 360),
        maxVideoFps: envNumber(raw, "MEDIA_MAX_VIDEO_FPS", 15)
      }
    }
  };

  requiredInProduction(config, raw);
  return config;
}

export function livekitConfigured(config: AppConfig) {
  return Boolean(config.livekitUrl && config.livekitApiKey && config.livekitApiSecret);
}

export function storageConfigured(config: AppConfig) {
  return Boolean(
    config.objectStorage.endpoint &&
      config.objectStorage.bucket &&
      config.objectStorage.accessKeyId &&
      config.objectStorage.secretAccessKey
  );
}
