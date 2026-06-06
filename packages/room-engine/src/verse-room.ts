import type { RoomManifest } from "@3dspace/contracts";

export const VERSE_ROOM_HALF_EXTENT = 40;
export const VERSE_ROOM_WALL_HEIGHT = 8;
export const VERSE_ROOM_MANIFEST_FEATURE = "verse-canvas";

export function isVerseRoomManifest(manifest: RoomManifest): boolean {
  return manifest.features.some(
    (feature) => feature.key === VERSE_ROOM_MANIFEST_FEATURE && feature.enabled
  );
}
