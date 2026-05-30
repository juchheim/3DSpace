import type { FastifyInstance } from "fastify";
import { HealthResponseSchema, createOpenApiDocument } from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { livekitConfigured, storageConfigured } from "../config.js";

export async function registerOpsRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/health", async () =>
    HealthResponseSchema.parse({
      status: "ok",
      service: "3dspace-api",
      version: "0.1.0",
      time: new Date().toISOString()
    })
  );

  app.get("/ready", async () => {
    const checks = [
      {
        name: "auth",
        status: ctx.config.clerkSecretKey ? "ok" : ctx.config.nodeEnv === "production" ? "missing" : "degraded",
        message: ctx.config.clerkSecretKey ? "Clerk secret configured" : "Using development header auth"
      },
      {
        name: "mongodb",
        status: ctx.config.mongoUri ? "ok" : ctx.config.nodeEnv === "production" ? "missing" : "degraded",
        message: ctx.config.mongoUri ? "MongoDB configured" : "Using in-memory development repository"
      },
      {
        name: "livekit",
        status: livekitConfigured(ctx.config) ? "ok" : ctx.config.nodeEnv === "production" ? "missing" : "degraded",
        message: livekitConfigured(ctx.config) ? "LiveKit token service configured" : "Using development realtime token fallback"
      },
      {
        name: "object-storage",
        status:
          storageConfigured(ctx.config) || !(ctx.config.tuning.enableWallAttachments && ctx.config.nodeEnv === "production")
            ? storageConfigured(ctx.config) ? "ok" : "degraded"
            : "missing",
        message: storageConfigured(ctx.config) ? "Object storage configured" : "Using development upload URL fallback"
      }
    ] as const;
    const hasMissing = checks.some((check) => check.status === "missing");
    const hasDegraded = checks.some((check) => check.status === "degraded");
    return {
      status: hasMissing ? "not_ready" : hasDegraded ? "degraded" : "ready",
      checks
    };
  });

  app.get("/openapi.json", async () => createOpenApiDocument());
}
