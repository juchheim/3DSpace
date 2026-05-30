import cors from "@fastify/cors";
import fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { BuildAppOptions } from "./app-context.js";
import { loadConfig, type AppConfig } from "./config.js";
import { HttpError } from "./errors.js";
import { seedBuiltinRoomObjectTemplates } from "./room-objects/builtin-catalog.js";
import { seedBuiltinWorldSkins } from "./world-skins/builtin-catalog.js";
import { RoomObjectGrabLock } from "./room-objects/grab-lock.js";
import { buildSharedBrowserDriver } from "./shared-browser/build-driver.js";
import { SharedBrowserOrchestrator } from "./shared-browser/orchestrator.js";
import { SharedBrowserIdleReaper } from "./shared-browser/idle-reaper.js";
import { SharedBrowserOccupancyReaper } from "./shared-browser/occupancy-reaper.js";
import { clearRoomObjectParameterDebounceForTests } from "./room-objects/realtime-dispatch.js";
import { MeetingNotesAudioStore } from "./meeting-notes/audio-buffer.js";
import { SessionRateLimiter } from "./rooms-core/session-rate-limit.js";
import { connectMongo, MongoRepository } from "./models/mongoose.js";
import { MemoryRepository, type Repository } from "./repository.js";
import { startAiObjectRetentionReaper } from "./ai-objects/index.js";
import { registerRoutes } from "./routes/register-routes.js";

export type { BuildAppOptions } from "./app-context.js";

function normalizeRequestOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "");
}

function originAllowed(origin: string, allowedOrigins: AppConfig["corsAllowedOrigins"]) {
  const normalizedOrigin = normalizeRequestOrigin(origin);
  return allowedOrigins.some((allowedOrigin) =>
    typeof allowedOrigin === "string"
      ? normalizeRequestOrigin(allowedOrigin) === normalizedOrigin
      : allowedOrigin.test(normalizedOrigin)
  );
}

async function buildRepository(config: AppConfig) {
  if (!config.mongoUri) {
    return new MemoryRepository();
  }
  const connection = await connectMongo(config.mongoUri, config.mongoDbName);
  return new MongoRepository(connection);
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const repository = options.repository ?? (await buildRepository(config));
  await seedBuiltinRoomObjectTemplates(repository);
  if (config.tuning.enableWorldSkins) {
    await seedBuiltinWorldSkins(repository);
  }

  const roomObjectGrabLock = options.roomObjectGrabLock ?? new RoomObjectGrabLock();
  if (config.tuning.enableRoomObjects) {
    roomObjectGrabLock.startReaper();
  }

  const sharedBrowserDriver = options.sharedBrowserOrchestrator
    ? undefined
    : buildSharedBrowserDriver(config);
  const sharedBrowserOrchestrator =
    options.sharedBrowserOrchestrator ??
    new SharedBrowserOrchestrator({
      repository,
      config,
      ...(sharedBrowserDriver ? { driver: sharedBrowserDriver } : {})
    });

  const meetingNotesAudioStore = options.meetingNotesAudioStore ?? new MeetingNotesAudioStore();
  const sessionRateLimiter = new SessionRateLimiter(config);

  const app = fastify({
    logger: config.nodeEnv !== "test",
    // Suppress the high-volume "incoming request"/"request completed" pair. The
    // shared browser + lobby polling generate thousands of these per minute and
    // bury real errors. We re-add a focused failure log via the onResponse hook.
    disableRequestLogging: true,
    bodyLimit: 10 * 1024 * 1024
  });

  app.addHook("onResponse", async (request, reply) => {
    if (reply.statusCode >= 500) {
      request.log.error(
        { method: request.method, url: request.url, statusCode: reply.statusCode },
        "request failed"
      );
    }
  });

  let sharedBrowserIdleReaper: SharedBrowserIdleReaper | undefined;
  let sharedBrowserOccupancyReaper: SharedBrowserOccupancyReaper | undefined;
  if (config.tuning.enableSharedBrowsers) {
    sharedBrowserIdleReaper = new SharedBrowserIdleReaper({
      repository,
      orchestrator: sharedBrowserOrchestrator,
      config,
      logger: app.log
    });
    sharedBrowserIdleReaper.start();
    sharedBrowserOccupancyReaper = new SharedBrowserOccupancyReaper({
      orchestrator: sharedBrowserOrchestrator,
      logger: app.log
    });
    sharedBrowserOccupancyReaper.start();
  }

  const ctx = {
    config,
    repository,
    roomObjectGrabLock,
    sharedBrowserOrchestrator,
    meetingNotesAudioStore,
    sessionRateLimiter
  } as const;

  app.addContentTypeParser(
    /^(image|video|audio|model)\//,
    { parseAs: "buffer" },
    (_request, body, done) => { done(null, body); }
  );
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) { callback(null, true); return; }
      if (originAllowed(origin, config.corsAllowedOrigins)) { callback(null, true); return; }
      app.log.warn({
        origin,
        allowedOrigins: config.corsAllowedOrigins.map((value) => typeof value === "string" ? value : value.source)
      }, "Rejected request origin");
      callback(new Error(`Origin not allowed: ${origin}`), false);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    // Cache the CORS preflight so high-frequency endpoints (shared browser input)
    // do not trigger an OPTIONS round-trip before every POST.
    maxAge: 86400,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-dev-user-id",
      "x-dev-user-name",
      "x-dev-user-role",
      "x-world-skin-uploader-password"
    ]
  });

  app.setErrorHandler((error, _request, reply) => {
    const fastifyError = error as { code?: string; message?: string };
    if (fastifyError.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      app.log.warn({ errorCode: fastifyError.code, message: fastifyError.message }, "Request body exceeded Fastify limit");
      void reply.status(413).send({ error: "payload_too_large", message: "Request payload is too large" });
      return;
    }
    if (error instanceof HttpError) {
      void reply.status(error.statusCode).send({ error: error.code, message: error.message, ...error.details });
      return;
    }
    if (error instanceof z.ZodError) {
      void reply.status(400).send({ error: "validation_error", issues: error.issues });
      return;
    }
    app.log.error(error);
    void reply.status(500).send({ error: "internal_error", message: "Unexpected server error" });
  });

  app.addHook("onClose", async () => {
    roomObjectGrabLock.stopReaper();
    sharedBrowserIdleReaper?.stop();
    sharedBrowserOccupancyReaper?.stop();
    if (sharedBrowserDriver?.close) await sharedBrowserDriver.close();
    clearRoomObjectParameterDebounceForTests();
    await repository.close();
  });

  if (config.tuning.enableAiObjectGeneration) {
    startAiObjectRetentionReaper(config, repository);
  }

  await registerRoutes(app, ctx);

  return app;
}
