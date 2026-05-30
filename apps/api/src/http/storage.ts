import type { FastifyRequest } from "fastify";
import { notFound } from "../errors.js";
import { parseRoomObjectAssetStorageKey } from "../services/storage.js";

export function storageKeyFromRequest(request: FastifyRequest) {
  const params = request.params as Record<string, string | undefined>;
  const wildcard = params["*"];
  if (wildcard) return parseRoomObjectAssetStorageKey(wildcard);
  if (params.storageKey) return parseRoomObjectAssetStorageKey(params.storageKey);
  throw notFound("Storage key is required");
}
