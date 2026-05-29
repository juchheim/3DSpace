import { DistanceModelSchema, QualityLevelSchema, ViewModeSchema, type SpatialAudioConfig } from "@3dspace/contracts";

export type AppConfig = {
  nodeEnv: string;
  host: string;
  port: number;
  apiPublicUrl: string;
  corsAllowedOrigins: Array<string | RegExp>;
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
  openAiApiKey: string | undefined;
  /** When set, enables POST/GET /v1/world-skin-uploader/* operator routes. */
  worldSkinUploaderPassword: string | undefined;
  /** Shared password required to create or join Free-for-All rooms (except room creators on join). */
  freeForAllPassword: string | undefined;
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
    enableWorkforceTraining: boolean;
    enableFreeForAll: boolean;
    enableAiMeetingNotes: boolean;
    openAiTranscriptionModel: string;
    openAiSummaryModel: string;
    aiMeetingNotesMaxDurationMinutes: number;
    aiMeetingNotesStoragePrefix: string;
    enableWhiteboards: boolean;
    whiteboardCompactionTickSeconds: number;
    whiteboardSnapshotAtStrokes: number;
    whiteboardMaxPointsPerStroke: number;
    whiteboardMaxActivePerRoom: number;
    whiteboardStoragePrefix: string;
    enableAiObjectGeneration: boolean;
    aiObjectProvider: "procedural" | "meshy";
    meshyApiKey: string | undefined;
    openAiAiObjectComposerModel: string;
    aiObjectMeshyRefineTextures: boolean;
    aiObjectStoragePrefix: string;
    aiObjectMaxPromptChars: number;
    aiObjectMeshyTimeoutSec: number;
    aiObjectMaxJobsPerUserPerDay: number;
    aiObjectRetentionDays: number;
    aiObjectUseTestFixture: boolean;
    enableSharedBrowsers: boolean;
    sharedBrowserViewportWidth: number;
    sharedBrowserViewportHeight: number;
    sharedBrowserMaxActivePerRoom: number;
    sharedBrowserIdlePauseMinutes: number;
    sharedBrowserMaxNavigationsPerUserPerMinute: number;
    sharedBrowserBlockedHostSuffixes: string[];
    sharedBrowserUseJpegFallback: boolean;
    sharedBrowserJpegFps: number;
    sharedBrowserDeviceScaleFactor: number;
    sharedBrowserScreencastQuality: number;
    sharedBrowserScreencastEveryNthFrame: number;
    sharedBrowserLazyStart: boolean;
    sharedBrowserPauseWhenRoomEmpty: boolean;
    sharedBrowserChromiumExecutable: string | undefined;
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canonicalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "");
}

function compileOriginPattern(pattern: string) {
  const canonical = canonicalizeOrigin(pattern);
  if (!canonical.includes("*")) return canonical;
  const source = `^${canonical.split("*").map(escapeRegex).join(".*")}$`;
  return new RegExp(source);
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

  if (config.tuning.enableWhiteboards) {
    required.push(
      "OBJECT_STORAGE_ENDPOINT",
      "OBJECT_STORAGE_BUCKET",
      "OBJECT_STORAGE_ACCESS_KEY_ID",
      "OBJECT_STORAGE_SECRET_ACCESS_KEY"
    );
  }

  if (config.tuning.enableFreeForAll) {
    required.push("FREE_FOR_ALL_PASSWORD");
  }

  if (config.tuning.enableAiMeetingNotes) {
    required.push("OPENAI_API_KEY");
  }

  if (config.tuning.enableAiObjectGeneration) {
    required.push("OPENAI_API_KEY");
  }

  if (config.tuning.enableAiObjectGeneration && config.tuning.aiObjectProvider === "meshy") {
    required.push("MESHY_API_KEY");
  }

  if (config.tuning.enableSharedBrowsers) {
    // Shared browsers publish their screencast through the existing LiveKit room in
    // production; the JPEG fallback is a dev/QA convenience only.
    required.push("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET");
    if (config.tuning.sharedBrowserUseJpegFallback) {
      throw new Error("SHARED_BROWSER_USE_JPEG_FALLBACK is dev-only and must be false in production");
    }
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
    .map((origin) => compileOriginPattern(origin))
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
    openAiApiKey: envString(raw, "OPENAI_API_KEY"),
    worldSkinUploaderPassword: envString(raw, "WORLD_SKIN_UPLOADER_PASSWORD"),
    freeForAllPassword: envString(raw, "FREE_FOR_ALL_PASSWORD"),
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
      enableWorkforceTraining: envBoolean(raw, "ENABLE_WORKFORCE_TRAINING", false),
      enableFreeForAll: envBoolean(raw, "ENABLE_FREE_FOR_ALL", false),
      enableAiMeetingNotes: envBoolean(raw, "ENABLE_AI_MEETING_NOTES", false),
      openAiTranscriptionModel: envString(raw, "OPENAI_TRANSCRIPTION_MODEL") ?? "gpt-4o-transcribe",
      openAiSummaryModel: envString(raw, "OPENAI_SUMMARY_MODEL") ?? "gpt-4.1",
      aiMeetingNotesMaxDurationMinutes: envNumber(raw, "AI_MEETING_NOTES_MAX_DURATION_MINUTES", 120),
      aiMeetingNotesStoragePrefix: envString(raw, "AI_MEETING_NOTES_STORAGE_PREFIX") ?? "meeting-notes/",
      enableWhiteboards: envBoolean(raw, "ENABLE_WHITEBOARDS", true),
      whiteboardCompactionTickSeconds: envNumber(raw, "WHITEBOARD_COMPACTION_TICK_SECONDS", 30),
      whiteboardSnapshotAtStrokes: envNumber(raw, "WHITEBOARD_SNAPSHOT_AT_STROKES", 500),
      whiteboardMaxPointsPerStroke: envNumber(raw, "WHITEBOARD_MAX_POINTS_PER_STROKE", 2000),
      whiteboardMaxActivePerRoom: envNumber(raw, "WHITEBOARD_MAX_ACTIVE_PER_ROOM", 4),
      whiteboardStoragePrefix: envString(raw, "WHITEBOARD_STORAGE_PREFIX") ?? "whiteboards/",
      enableAiObjectGeneration: envBoolean(raw, "ENABLE_AI_OBJECT_GENERATION", false),
      aiObjectProvider: (() => {
        const val = envString(raw, "AI_OBJECT_PROVIDER") ?? "procedural";
        if (val !== "procedural" && val !== "meshy") throw new Error("AI_OBJECT_PROVIDER must be procedural or meshy");
        return val as "procedural" | "meshy";
      })(),
      meshyApiKey: envString(raw, "MESHY_API_KEY"),
      openAiAiObjectComposerModel: envString(raw, "OPENAI_AI_OBJECT_COMPOSER_MODEL") ?? "gpt-4.1",
      aiObjectMeshyRefineTextures: envBoolean(raw, "AI_OBJECT_MESHY_REFINE_TEXTURES", true),
      aiObjectStoragePrefix: envString(raw, "AI_OBJECT_STORAGE_PREFIX") ?? "ai-objects/",
      aiObjectMaxPromptChars: envNumber(raw, "AI_OBJECT_MAX_PROMPT_CHARS", 500),
      aiObjectMeshyTimeoutSec: envNumber(raw, "AI_OBJECT_MESHY_TIMEOUT_SEC", 300),
      aiObjectMaxJobsPerUserPerDay: envNumber(raw, "AI_OBJECT_MAX_JOBS_PER_USER_PER_DAY", 20),
      aiObjectRetentionDays: envNumber(raw, "AI_OBJECT_RETENTION_DAYS", 30),
      aiObjectUseTestFixture: envBoolean(raw, "AI_OBJECT_USE_TEST_FIXTURE", false),
      enableSharedBrowsers: envBoolean(raw, "ENABLE_SHARED_BROWSERS", false),
      sharedBrowserViewportWidth: envNumber(raw, "SHARED_BROWSER_VIEWPORT_WIDTH", 1280),
      sharedBrowserViewportHeight: envNumber(raw, "SHARED_BROWSER_VIEWPORT_HEIGHT", 720),
      sharedBrowserMaxActivePerRoom: envNumber(raw, "SHARED_BROWSER_MAX_ACTIVE_PER_ROOM", 2),
      sharedBrowserIdlePauseMinutes: envNumber(raw, "SHARED_BROWSER_IDLE_PAUSE_MINUTES", 15),
      sharedBrowserMaxNavigationsPerUserPerMinute: envNumber(raw, "SHARED_BROWSER_MAX_NAVIGATIONS_PER_USER_PER_MINUTE", 20),
      sharedBrowserBlockedHostSuffixes: envStringList(raw, "SHARED_BROWSER_BLOCKED_HOST_SUFFIXES", []),
      sharedBrowserUseJpegFallback: envBoolean(raw, "SHARED_BROWSER_USE_JPEG_FALLBACK", false),
      sharedBrowserJpegFps: envNumber(raw, "SHARED_BROWSER_JPEG_FPS", 8),
      sharedBrowserDeviceScaleFactor: envNumber(raw, "SHARED_BROWSER_DEVICE_SCALE_FACTOR", 1.5),
      sharedBrowserScreencastQuality: envNumber(raw, "SHARED_BROWSER_SCREENCAST_QUALITY", 85),
      sharedBrowserScreencastEveryNthFrame: envNumber(raw, "SHARED_BROWSER_SCREENCAST_EVERY_NTH_FRAME", 2),
      sharedBrowserLazyStart: envBoolean(raw, "SHARED_BROWSER_LAZY_START", true),
      sharedBrowserPauseWhenRoomEmpty: envBoolean(raw, "SHARED_BROWSER_PAUSE_WHEN_ROOM_EMPTY", true),
      sharedBrowserChromiumExecutable: envString(raw, "SHARED_BROWSER_CHROMIUM_EXECUTABLE"),
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
