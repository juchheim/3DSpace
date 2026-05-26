import type { RoomManifest, RoomType } from "@3dspace/contracts";
import { applyDefaultRoomGeometry } from "@3dspace/room-engine";

export function normalizeRoomManifest(manifest: RoomManifest, roomType: RoomType = "classroom"): RoomManifest {
  return applyDefaultRoomGeometry(manifest, roomType);
}
