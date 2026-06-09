import { describe, expect, it } from "vitest";
import { DYNAMIC_WALL_ANCHOR_MAX_WIDTH_M, RoomManifestSchema } from "@3dspace/contracts";
import {
  anchorSupportsCreateOption,
  buildVerseRoomWallAnchors,
  buildVerseRoomWalls,
  createDefaultRoomManifest,
  createEscapeRoomManifest,
  createVerseRoomManifest,
  isVerseRoomManifest,
  resolveSpawnRotation,
  rotationFacingVerseGalaxy,
  VERSE_BOARD_HEIGHT,
  VERSE_BOARD_WALL_DISTANCE,
  VERSE_BOARD_WALL_INSET,
  VERSE_BOARD_WIDTH,
  VERSE_ROOM_HALF_EXTENT,
  VERSE_ROOM_MANIFEST_FEATURE,
  VERSE_ROOM_WALL_HEIGHT,
  VERSE_SKYBOX_GALAXY_POSITION,
  VERSE_WALL_THICKNESS,
  verseBoardAnchorForWall,
  widescreenHeight
} from "../src/index.js";

describe("createVerseRoomManifest", () => {
  const manifest = createVerseRoomManifest({ roomId: "room-skill-1", verseId: "skill", name: "WebXR Lab" });

  it("parses as a valid RoomManifest with an open canvas (no tiers)", () => {
    expect(() => RoomManifestSchema.parse(manifest)).not.toThrow();
    expect(manifest.tiers).toEqual([]);
  });

  it("uses 80×80 m bounds centered on the origin", () => {
    expect(manifest.dimensions).toEqual({ width: 80, depth: 80, height: 8 });
    expect(manifest.bounds).toEqual({
      minX: -VERSE_ROOM_HALF_EXTENT,
      maxX: VERSE_ROOM_HALF_EXTENT,
      minZ: -VERSE_ROOM_HALF_EXTENT,
      maxZ: VERSE_ROOM_HALF_EXTENT
    });
  });

  it("marks the manifest with the verse canvas feature and verse id", () => {
    expect(manifest.features).toContainEqual({
      key: VERSE_ROOM_MANIFEST_FEATURE,
      enabled: true,
      config: { verseId: "skill" }
    });
    expect(isVerseRoomManifest(manifest)).toBe(true);
  });

  it("includes a center spawn point", () => {
    expect(manifest.spawnPoints).toHaveLength(1);
    expect(manifest.spawnPoints[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("spawns facing the skybox galaxy (-Z)", () => {
    const spawn = manifest.spawnPoints[0]!;
    expect(spawn.rotation.y).toBeCloseTo(Math.PI);
    expect(resolveSpawnRotation(manifest, spawn.position).y).toBeCloseTo(Math.PI);

    const g = VERSE_SKYBOX_GALAXY_POSITION;
    const facingX = Math.sin(spawn.rotation.y);
    const facingZ = Math.cos(spawn.rotation.y);
    const toGalaxyX = g.x - spawn.position.x;
    const toGalaxyZ = g.z - spawn.position.z;
    expect(facingX * toGalaxyX + facingZ * toGalaxyZ).toBeGreaterThan(0);
    expect(rotationFacingVerseGalaxy(spawn.position).y).toBeCloseTo(spawn.rotation.y);
  });

  it("places four max-width 16:9 board walls in spawn-relative quadrants", () => {
    expect(manifest.walls).toHaveLength(4);
    expect(manifest.wallAnchors).toHaveLength(4);

    const w = VERSE_BOARD_WIDTH;
    const h = VERSE_BOARD_HEIGHT;
    const d = VERSE_BOARD_WALL_DISTANCE;
    const inset = VERSE_WALL_THICKNESS / 2 + VERSE_BOARD_WALL_INSET;

    expect(w).toBe(DYNAMIC_WALL_ANCHOR_MAX_WIDTH_M);
    expect(h).toBeCloseTo(widescreenHeight(w));

    const front = manifest.wallAnchors.find((anchor) => anchor.id === "verse-anchor-front");
    const back = manifest.wallAnchors.find((anchor) => anchor.id === "verse-anchor-back");
    const left = manifest.wallAnchors.find((anchor) => anchor.id === "verse-anchor-left");
    const right = manifest.wallAnchors.find((anchor) => anchor.id === "verse-anchor-right");

    expect(front?.position).toEqual({ x: 0, y: VERSE_ROOM_WALL_HEIGHT / 2, z: -d + inset });
    expect(back?.position).toEqual({ x: 0, y: VERSE_ROOM_WALL_HEIGHT / 2, z: d - inset });
    expect(left?.position).toEqual({ x: -d + inset, y: VERSE_ROOM_WALL_HEIGHT / 2, z: 0 });
    expect(right?.position).toEqual({ x: d - inset, y: VERSE_ROOM_WALL_HEIGHT / 2, z: 0 });

    for (const anchor of [front, back, left, right]) {
      expect(anchor?.width).toBe(w);
      expect(anchor?.height).toBeCloseTo(h);
      expect(anchor?.metadata?.hideSurface).toBe(false);
    }

    expect(front?.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(back?.normal).toEqual({ x: 0, y: 0, z: -1 });
    expect(left?.normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(right?.normal).toEqual({ x: -1, y: 0, z: 0 });

    const frontWall = manifest.walls.find((wall) => wall.id === "verse-wall-front");
    expect(frontWall?.start.z).toBe(-d);
    expect(frontWall?.end.z).toBe(-d);
    expect(Math.hypot(frontWall!.end.x - frontWall!.start.x, frontWall!.end.z - frontWall!.start.z)).toBeCloseTo(w);
  });

  it("enables wall objects for board content", () => {
    expect(manifest.features.some((feature) => feature.key === "wall-objects" && feature.enabled)).toBe(true);
  });

  it("accepts all classroom board content types on each anchor", () => {
    const anchor = buildVerseRoomWallAnchors(buildVerseRoomWalls())[0]!;
    for (const option of ["file", "whiteboard", "shared-browser", "note", "timer", "poll", "link", "camera", "microphone", "screen"] as const) {
      expect(anchorSupportsCreateOption(anchor, option)).toBe(true);
    }
  });
});

describe("verseBoardAnchorForWall", () => {
  it("centers the board on the wall span at 16:9 height", () => {
    const wall = buildVerseRoomWalls()[0]!;
    const anchor = verseBoardAnchorForWall(wall, "verse-anchor-front", "Front board", { x: 0, y: 0, z: 1 });

    expect(anchor.width).toBe(VERSE_BOARD_WIDTH);
    expect(anchor.height).toBeCloseTo(VERSE_BOARD_HEIGHT);
    expect(anchor.position.x).toBeCloseTo((wall.start.x + wall.end.x) / 2);
    expect(anchor.position.y).toBe(wall.height / 2);
    expect(anchor.metadata?.hideSurface).toBe(false);
  });
});

describe("isVerseRoomManifest", () => {
  it("is false for classroom and escape-room manifests", () => {
    expect(isVerseRoomManifest(createDefaultRoomManifest({ roomId: "room-class" }))).toBe(false);
    expect(isVerseRoomManifest(createEscapeRoomManifest({ roomId: "room-escape" }))).toBe(false);
  });
});
