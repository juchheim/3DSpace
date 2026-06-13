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

  it("exposes verse feature flags", () => {
    for (const roomType of VERSE_ROOM_TYPES) {
      const flags = getRoomTypeFeatureFlags(roomType);
      expect(flags.classroomState).toBe(true);
      expect(flags.lessons).toBe(true);
      expect(flags.privateChecks).toBe(true);
      expect(flags.groups).toBe(true);
      expect(flags.focus).toBe(true);
      expect(flags.peoplePanelTeacherControls).toBe(true);
      expect(flags.dynamicBoards).toBe(true);
      expect(flags.building).toBe(true);
      expect(flags.physics).toBe(true);
      expect(flags.whiteboards).toBe(true);
      expect(flags.sharedBrowsers).toBe(true);
      expect(flags.worldSkins).toBe(false);
      expect(flags.aiMeetingNotes).toBe(true);
      expect(flags.aiWorldHost).toBe(true);
      expect(flags.breakoutPods).toBe(false);
    }
  });
});
