import type { RoomManifest } from "@3dspace/contracts";
import { applyDefaultWallAnchorDimensions } from "@3dspace/room-engine";

export function normalizeRoomManifest(manifest: RoomManifest): RoomManifest {
  return applyDefaultWallAnchorDimensions(manifest);
}
