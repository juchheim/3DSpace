import { Buffer } from "node:buffer";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app-context.js";
import { storageConfigured } from "../config.js";
import { notFound } from "../errors.js";
import { storageKeyFromRequest } from "../http/storage.js";
import { getDevStoredObject, putDevStoredObject, readStoredObject } from "../services/storage.js";

export async function registerDevStorageRoutes(app: FastifyInstance, ctx: AppContext) {
  app.put("/dev-upload/*", async (request, reply) => {
    if (storageConfigured(ctx.config)) throw notFound("Development upload fallback is disabled");
    const storageKey = storageKeyFromRequest(request);
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from("");
    putDevStoredObject({
      storageKey,
      body,
      contentType: String(request.headers["content-type"] ?? "application/octet-stream")
    });
    return reply.status(204).send();
  });

  app.get("/dev-download/*", async (request, reply) => {
    if (storageConfigured(ctx.config)) throw notFound("Development download fallback is disabled");
    const storageKey = storageKeyFromRequest(request);
    const object = getDevStoredObject(storageKey);
    if (!object) throw notFound("Development object not found");
    return reply.header("content-type", object.contentType).send(object.body);
  });

  app.get("/v1/room-object-assets/*", async (request, reply) => {
    const storageKey = storageKeyFromRequest(request);
    const object = await readStoredObject(ctx.config, { storageKey });
    if (!object) throw notFound("Room object asset not found");
    return reply.header("content-type", object.contentType).send(object.body);
  });
}
