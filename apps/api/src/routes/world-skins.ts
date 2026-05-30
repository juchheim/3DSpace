import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateWorldSkinUploadRequestSchema,
  CreateWorldSkinUploadResponseSchema,
  ListWorldSkinsResponseSchema,
  WorldSkinSchema,
  WorldSkinUploaderStatusQuerySchema,
  WorldSkinUploaderStatusResponseSchema,
  WorldSkinUploaderVerifyRequestSchema,
  WorldSkinUploaderVerifyResponseSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { notFound, worldSkinsDisabled } from "../errors.js";
import { requireUser } from "../http/auth-guards.js";
import { storageKeyFromRequest } from "../http/storage.js";
import { parseBody, parseParams, parseQuery } from "../http/parse.js";
import { createDownloadTarget, createUploadTarget, readStoredObject } from "../services/storage.js";
import { rewriteWorldSkinAssetUrls } from "../world-skins/rewrite.js";
import {
  assertWorldSkinUploadContentType,
  assertWorldSkinUploaderPassword,
  isRequiredWorldSkinAsset,
  readUploaderPasswordHeader,
  worldSkinAssetPath,
  worldSkinStorageKey,
  worldSkinUploaderEnabled,
  WORLD_SKIN_ASSET_FILES
} from "../world-skins/uploader.js";

export async function registerWorldSkinRoutes(app: FastifyInstance, ctx: AppContext) {
  if (worldSkinUploaderEnabled(ctx.config)) {
    app.post("/v1/world-skin-uploader/verify", async (request) => {
      const body = parseBody(WorldSkinUploaderVerifyRequestSchema, request);
      assertWorldSkinUploaderPassword(ctx.config, body.password);
      return WorldSkinUploaderVerifyResponseSchema.parse({ ok: true });
    });

    app.get("/v1/world-skin-uploader/status", async (request) => {
      const query = parseQuery(WorldSkinUploaderStatusQuerySchema, request);
      assertWorldSkinUploaderPassword(ctx.config, readUploaderPasswordHeader(request));
      const r2Prefix = `world-skins/${query.slug}/v${query.version}/`;
      const files = await Promise.all(
        WORLD_SKIN_ASSET_FILES.map(async (fileName) => {
          const storageKey = worldSkinStorageKey({
            slug: query.slug,
            version: query.version,
            fileName
          });
          const object = await readStoredObject(ctx.config, { storageKey });
          const download = object && (await createDownloadTarget(ctx.config, { storageKey }));
          return {
            fileName,
            storageKey,
            required: isRequiredWorldSkinAsset(fileName),
            uploaded: Boolean(object),
            downloadUrl: download?.url
          };
        })
      );
      return WorldSkinUploaderStatusResponseSchema.parse({
        slug: query.slug,
        version: query.version,
        r2Prefix,
        files
      });
    });

    app.post("/v1/world-skin-uploader/uploads", async (request) => {
      const body = parseBody(CreateWorldSkinUploadRequestSchema, request);
      assertWorldSkinUploaderPassword(ctx.config, readUploaderPasswordHeader(request));
      assertWorldSkinUploadContentType(body.fileName, body.contentType);
      const storageKey = worldSkinStorageKey({
        slug: body.slug,
        version: body.version,
        fileName: body.fileName
      });
      const upload = await createUploadTarget(ctx.config, {
        storageKey,
        contentType: body.contentType
      });
      return CreateWorldSkinUploadResponseSchema.parse({
        storageKey,
        assetPath: worldSkinAssetPath(storageKey),
        upload
      });
    });
  }

  app.get("/v1/world-skins", async (request) => {
    await requireUser(request, ctx.config, ctx.repository);
    if (!ctx.config.tuning.enableWorldSkins) throw worldSkinsDisabled();
    const skins = await ctx.repository.listWorldSkins();
    return ListWorldSkinsResponseSchema.parse({ skins: skins.map((skin) => rewriteWorldSkinAssetUrls(skin, ctx.config)) });
  });

  app.get("/v1/world-skins/:slug", async (request) => {
    await requireUser(request, ctx.config, ctx.repository);
    if (!ctx.config.tuning.enableWorldSkins) throw worldSkinsDisabled();
    const params = parseParams(z.object({ slug: z.string() }), request);
    const skin = await ctx.repository.getWorldSkin(params.slug);
    if (!skin) throw notFound("World skin not found");
    return WorldSkinSchema.parse(rewriteWorldSkinAssetUrls(skin, ctx.config));
  });

  app.get("/v1/world-skin-assets/*", async (request, reply) => {
    if (!ctx.config.tuning.enableWorldSkins) throw worldSkinsDisabled();
    const storageKey = storageKeyFromRequest(request);
    const object = await readStoredObject(ctx.config, { storageKey });
    if (!object) throw notFound("World skin asset not found");
    return reply
      .header("content-type", object.contentType)
      .header("cache-control", "public, max-age=31536000, immutable")
      .send(object.body);
  });
}
