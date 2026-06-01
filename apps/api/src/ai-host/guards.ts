import { getRoomTypeFeatureFlags } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { aiHostDisabled, forbidden } from "../errors.js";
import { requireRoomAccess } from "../http/auth-guards.js";
import type { AuthContext } from "../auth.js";
import type { Repository } from "../repository.js";

export async function assertAiWorldHostAvailable(
  repository: Repository,
  config: AppConfig,
  roomId: string,
  auth: AuthContext
) {
  const { room } = await requireRoomAccess(repository, roomId, auth);
  if (!config.tuning.enableAiWorldHost) throw aiHostDisabled();
  if (!getRoomTypeFeatureFlags(room.type).aiWorldHost) {
    throw forbidden("AI world host is not available for this room type");
  }
  if (!room.settings.aiWorldHost?.enabled) {
    throw forbidden("AI world host is disabled for this room");
  }
  return room;
}
