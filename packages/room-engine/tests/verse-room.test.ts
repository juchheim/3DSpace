import { describe, expect, it } from "vitest";
import { RoomManifestSchema } from "@3dspace/contracts";
import {
  createDefaultRoomManifest,
  createEscapeRoomManifest,
  createVerseRoomManifest,
  isVerseRoomManifest,
  VERSE_ROOM_HALF_EXTENT,
  VERSE_ROOM_MANIFEST_FEATURE
} from "../src/index.js";

describe("createVerseRoomManifest", () => {
  const manifest = createVerseRoomManifest({ roomId: "room-skill-1", verseId: "skill", name: "WebXR Lab" });

  it("parses as a valid RoomManifest with an empty canvas", () => {
    expect(() => RoomManifestSchema.parse(manifest)).not.toThrow();
    expect(manifest.walls).toEqual([]);
    expect(manifest.wallAnchors).toEqual([]);
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
});

describe("isVerseRoomManifest", () => {
  it("is false for classroom and escape-room manifests", () => {
    expect(isVerseRoomManifest(createDefaultRoomManifest({ roomId: "room-class" }))).toBe(false);
    expect(isVerseRoomManifest(createEscapeRoomManifest({ roomId: "room-escape" }))).toBe(false);
  });
});
