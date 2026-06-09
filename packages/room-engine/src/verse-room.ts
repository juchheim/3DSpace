import { DYNAMIC_WALL_ANCHOR_MAX_WIDTH_M, type RoomManifest, type Vector3 } from "@3dspace/contracts";

export const VERSE_ROOM_HALF_EXTENT = 40;
export const VERSE_ROOM_WALL_HEIGHT = 8;
export const VERSE_ROOM_MANIFEST_FEATURE = "verse-canvas";

/** World-space galaxy centre for verse skyboxes — keep in sync with `GALAXY_POS` in `RoomView3D.tsx`. */
export const VERSE_SKYBOX_GALAXY_POSITION = { x: 0, y: 205, z: -420 } as const;

/** Max dynamic-board width (12 m) on each cardinal verse wall. */
export const VERSE_BOARD_WIDTH = DYNAMIC_WALL_ANCHOR_MAX_WIDTH_M;

/** 16:9 board height for `VERSE_BOARD_WIDTH`. */
export const VERSE_BOARD_HEIGHT = (VERSE_BOARD_WIDTH * 9) / 16;

/** Distance from spawn (origin) to each board wall along its axis (m). */
export const VERSE_BOARD_WALL_DISTANCE = 28;

export const VERSE_BOARD_WALL_INSET = 0.1;
export const VERSE_WALL_THICKNESS = 0.3;

const VERSE_BOARD_ACCEPTS = [
  "image",
  "video",
  "audio",
  "image.file",
  "video.file",
  "audio.file",
  "camera.live",
  "microphone.live",
  "screen.live",
  "browser-tab.live",
  "web.embed",
  "web.link",
  "web.browser.shared",
  "document.file",
  "slides.file",
  "whiteboard",
  "note",
  "poll",
  "timer",
  "future"
] as const;

type VerseWall = RoomManifest["walls"][number];
type VerseWallAnchor = RoomManifest["wallAnchors"][number];

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

function verseBoardMetadata(): NonNullable<VerseWallAnchor["metadata"]> {
  return {
    accepts: [...VERSE_BOARD_ACCEPTS],
    capacity: 4,
    layout: "grid",
    supportsInteraction: true,
    moderationPolicy: "student-direct",
    // Verse rooms have no panorama board artwork — show the anchor surface like an empty board.
    hideSurface: false,
    hideObjectHeader: true
  };
}

/** Board anchor centered on a wall face, sized to the wall span (max 12 m wide, 16:9 tall). */
export function verseBoardAnchorForWall(
  wall: VerseWall,
  id: string,
  label: string,
  normal: { x: number; y: number; z: number }
): VerseWallAnchor {
  const spanX = wall.end.x - wall.start.x;
  const spanZ = wall.end.z - wall.start.z;
  const spanLength = Math.hypot(spanX, spanZ);
  const midX = (wall.start.x + wall.end.x) / 2;
  const midZ = (wall.start.z + wall.end.z) / 2;
  const offset = (wall.thickness ?? 0) / 2 + VERSE_BOARD_WALL_INSET;
  const width = Math.min(VERSE_BOARD_WIDTH, spanLength);
  const height = Math.min(VERSE_BOARD_HEIGHT, wall.height);

  return {
    id,
    label,
    position: {
      x: midX + normal.x * offset,
      y: wall.height / 2,
      z: midZ + normal.z * offset
    },
    normal,
    width,
    height,
    metadata: verseBoardMetadata()
  };
}

/** Four impassable walls — one per spawn-relative quadrant — sized for max-width boards. */
export function buildVerseRoomWalls(): VerseWall[] {
  const halfWidth = VERSE_BOARD_WIDTH / 2;
  const d = VERSE_BOARD_WALL_DISTANCE;
  const h = VERSE_ROOM_WALL_HEIGHT;
  const t = VERSE_WALL_THICKNESS;

  return [
    {
      id: "verse-wall-front",
      label: "Front board wall",
      start: { x: -halfWidth, y: 0, z: -d },
      end: { x: halfWidth, y: 0, z: -d },
      height: h,
      anchorIds: ["verse-anchor-front"],
      passable: false,
      thickness: t
    },
    {
      id: "verse-wall-back",
      label: "Back board wall",
      start: { x: -halfWidth, y: 0, z: d },
      end: { x: halfWidth, y: 0, z: d },
      height: h,
      anchorIds: ["verse-anchor-back"],
      passable: false,
      thickness: t
    },
    {
      id: "verse-wall-left",
      label: "Left board wall",
      start: { x: -d, y: 0, z: -halfWidth },
      end: { x: -d, y: 0, z: halfWidth },
      height: h,
      anchorIds: ["verse-anchor-left"],
      passable: false,
      thickness: t
    },
    {
      id: "verse-wall-right",
      label: "Right board wall",
      start: { x: d, y: 0, z: -halfWidth },
      end: { x: d, y: 0, z: halfWidth },
      height: h,
      anchorIds: ["verse-anchor-right"],
      passable: false,
      thickness: t
    }
  ];
}

/**
 * Pre-built board anchors on the four cardinal walls (spawn faces -Z: front/back/left/right).
 * Each anchor is centered on its wall and matches the wall span width at 16:9 height.
 */
export function buildVerseRoomWallAnchors(walls: VerseWall[] = buildVerseRoomWalls()): VerseWallAnchor[] {
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const front = byId.get("verse-wall-front");
  const back = byId.get("verse-wall-back");
  const left = byId.get("verse-wall-left");
  const right = byId.get("verse-wall-right");
  if (!front || !back || !left || !right) {
    throw new Error("Verse room walls missing a cardinal board wall");
  }

  return [
    verseBoardAnchorForWall(front, "verse-anchor-front", "Front board", { x: 0, y: 0, z: 1 }),
    verseBoardAnchorForWall(back, "verse-anchor-back", "Back board", { x: 0, y: 0, z: -1 }),
    verseBoardAnchorForWall(left, "verse-anchor-left", "Left board", { x: 1, y: 0, z: 0 }),
    verseBoardAnchorForWall(right, "verse-anchor-right", "Right board", { x: -1, y: 0, z: 0 })
  ];
}
