import type { RoomManifest, Vector3 } from "@3dspace/contracts";

export const VERSE_ROOM_HALF_EXTENT = 40;
export const VERSE_ROOM_WALL_HEIGHT = 8;
export const VERSE_ROOM_MANIFEST_FEATURE = "verse-canvas";

/** World-space galaxy centre for verse skyboxes — keep in sync with `GALAXY_POS` in `RoomView3D.tsx`. */
export const VERSE_SKYBOX_GALAXY_POSITION = { x: 0, y: 205, z: -420 } as const;

/** Yaw so the avatar faces the verse skybox galaxy from `from`. */
export function rotationFacingVerseGalaxy(from: Vector3): { y: number } {
  const g = VERSE_SKYBOX_GALAXY_POSITION;
  return { y: Math.atan2(g.x - from.x, g.z - from.z) };
}

export function isVerseRoomManifest(manifest: RoomManifest): boolean {
  return manifest.features.some(
    (feature) => feature.key === VERSE_ROOM_MANIFEST_FEATURE && feature.enabled
  );
}
