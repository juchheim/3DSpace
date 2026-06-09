import { describe, expect, it } from "vitest";
import { RoomManifestSchema } from "@3dspace/contracts";
import {
  createDefaultRoomManifest,
  createEscapeRoomManifest,
  createVerseRoomManifest,
  isVerseRoomManifest,
  resolveSpawnRotation,
  rotationFacingVerseGalaxy,
  VERSE_ROOM_HALF_EXTENT,
  VERSE_ROOM_MANIFEST_FEATURE,
  VERSE_SKYBOX_GALAXY_POSITION
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
});

describe("isVerseRoomManifest", () => {
  it("is false for classroom and escape-room manifests", () => {
    expect(isVerseRoomManifest(createDefaultRoomManifest({ roomId: "room-class" }))).toBe(false);
    expect(isVerseRoomManifest(createEscapeRoomManifest({ roomId: "room-escape" }))).toBe(false);
  });
});
