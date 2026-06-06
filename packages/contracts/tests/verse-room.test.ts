import { describe, expect, it } from "vitest";
import {
  getRoomTypeFeatureFlags,
  isVerseRoomType,
  RoomTypeSchema,
  VERSE_ROOM_TYPES,
  verseIdFromRoomType,
  verseRoomTypeFromVerseId
} from "../src/index";

describe("verse room types (contracts)", () => {
  it("accepts all verse room types in RoomTypeSchema", () => {
    for (const roomType of VERSE_ROOM_TYPES) {
      expect(RoomTypeSchema.parse(roomType)).toBe(roomType);
    }
  });

  it("maps verse ids to room types and back", () => {
    expect(verseRoomTypeFromVerseId("skill")).toBe("skill-verse");
    expect(verseRoomTypeFromVerseId("culture")).toBe("culture-verse");
    expect(verseRoomTypeFromVerseId("unknown")).toBeNull();
    expect(verseIdFromRoomType("creator-verse")).toBe("creator");
    expect(verseIdFromRoomType("classroom")).toBeNull();
  });

  it("identifies verse room types", () => {
    expect(isVerseRoomType("skill-verse")).toBe(true);
    expect(isVerseRoomType("classroom")).toBe(false);
    expect(isVerseRoomType(null)).toBe(false);
  });

  it("exposes blank feature flags for verse rooms", () => {
    for (const roomType of VERSE_ROOM_TYPES) {
      const flags = getRoomTypeFeatureFlags(roomType);
      expect(flags.classroomState).toBe(false);
      expect(flags.lessons).toBe(false);
      expect(flags.dynamicBoards).toBe(false);
      expect(flags.building).toBe(false);
      expect(flags.whiteboards).toBe(false);
      expect(flags.worldSkins).toBe(false);
      expect(flags.aiMeetingNotes).toBe(false);
      expect(flags.breakoutPods).toBe(false);
    }
  });
});
