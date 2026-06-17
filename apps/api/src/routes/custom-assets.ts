import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateCustomAssetRequestSchema,
  CreateCustomAssetResponseSchema,
  CreateCustomAssetUploadRequestSchema,
  CreateCustomAssetUploadResponseSchema,
  ListCustomAssetsResponseSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams } from "../http/parse.js";
import { createUploadTarget, roomObjectAssetUrl, userAssetStorageKeyFor } from "../services/storage.js";

const ParamsWithAssetId = z.object({ assetId: z.string() });

/**
 * Per-user custom GLB library. Uploads are private to the owner and reusable in
 * any room; the render info is denormalized onto each placement (see
 * world-assets route) so other participants can render them without library access.
 */
export async function registerCustomAssetRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

  // Reserve storage keys + presigned PUT targets for the GLB and its thumbnail.
  app.post("/v1/users/me/custom-assets/uploads", async (request) => {
    const auth = await requireUser(request, config, repository);
    const body = parseBody(CreateCustomAssetUploadRequestSchema, request);

    const glbStorageKey = userAssetStorageKeyFor({
      userId: auth.userId,
      kind: "glb",
      fileName: body.glbFileName
    });
    const thumbnailStorageKey = userAssetStorageKeyFor({
      userId: auth.userId,
      kind: "thumbnail",
      fileName: body.thumbnailFileName
    });

    const [glbUpload, thumbnailUpload] = await Promise.all([
      createUploadTarget(config, { storageKey: glbStorageKey, contentType: body.glbContentType }),
      createUploadTarget(config, { storageKey: thumbnailStorageKey, contentType: body.thumbnailContentType })
    ]);

    return CreateCustomAssetUploadResponseSchema.parse({
      glb: {
        storageKey: glbStorageKey,
        url: roomObjectAssetUrl(config, glbStorageKey),
        upload: glbUpload
      },
      thumbnail: {
        storageKey: thumbnailStorageKey,
        url: roomObjectAssetUrl(config, thumbnailStorageKey),
        upload: thumbnailUpload
      }
    });
  });

  app.get("/v1/users/me/custom-assets", async (request) => {
    const auth = await requireUser(request, config, repository);
    const assets = await repository.listCustomAssetsForOwner(auth.userId);
    return ListCustomAssetsResponseSchema.parse({ assets });
  });

  app.post("/v1/users/me/custom-assets", async (request) => {
    const auth = await requireUser(request, config, repository);
    const body = parseBody(CreateCustomAssetRequestSchema, request);
    const asset = await repository.createCustomAsset({
      ownerUserId: auth.userId,
      displayName: body.displayName,
      glbStorageKey: body.glbStorageKey,
      glbUrl: body.glbUrl,
      thumbnailStorageKey: body.thumbnailStorageKey,
      thumbnailUrl: body.thumbnailUrl,
      placement: body.placement,
      ...(body.objectRole ? { objectRole: body.objectRole } : {}),
      ...(body.scale !== undefined ? { scale: body.scale } : {})
    });
    return CreateCustomAssetResponseSchema.parse({ asset });
  });

  app.delete("/v1/users/me/custom-assets/:assetId", async (request) => {
    const auth = await requireUser(request, config, repository);
    const { assetId } = parseParams(ParamsWithAssetId, request);
    await repository.deleteCustomAsset(auth.userId, assetId);
    return { ok: true };
  });
}
