import type { RoomManifest } from "@3dspace/contracts";
import { applyDefaultRoomGeometry } from "@3dspace/room-engine";

export function normalizeRoomManifest(manifest: RoomManifest): RoomManifest {
  return applyDefaultRoomGeometry(manifest);
}
