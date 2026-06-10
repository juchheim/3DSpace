import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { verseRoomSettings } from "../../src/rooms-core/settings.js";

describe("verseRoomSettings", () => {
  it("uses classroom-style teacher-controlled board access defaults", () => {
    const settings = verseRoomSettings(loadConfig({ NODE_ENV: "test" }));
    expect(settings.wallObjectCreation).toBe("teacher-only");
    expect(settings.allowStudentUploads).toBe(false);
    expect(settings.allowLiveStudentShares).toBe(false);
    expect(settings.whiteboards.enabled).toBe(true);
    expect(settings.whiteboards.allowStudentDraw).toBe(true);
  });
});
