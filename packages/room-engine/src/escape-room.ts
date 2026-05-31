import type { RoomManifest } from "@3dspace/contracts";

export const ESCAPE_ROOM_HALF_EXTENT = 40;
export const ESCAPE_ROOM_WALL_HEIGHT = 8;
export const ESCAPE_ROOM_MANIFEST_FEATURE = "escape-room-canvas";

export function isEscapeRoomManifest(manifest: RoomManifest): boolean {
  return manifest.features.some(
    (feature) => feature.key === ESCAPE_ROOM_MANIFEST_FEATURE && feature.enabled
  );
}
