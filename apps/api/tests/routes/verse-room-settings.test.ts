import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { verseRoomSettings } from "../../src/rooms-core/settings.js";

describe("verseRoomSettings", () => {
  it("opens board uploads and live shares for all participants", () => {
    const settings = verseRoomSettings(loadConfig({ NODE_ENV: "test" }));
    expect(settings.wallObjectCreation).toBe("student-direct");
    expect(settings.allowStudentUploads).toBe(true);
    expect(settings.allowLiveStudentShares).toBe(true);
    expect(settings.whiteboards.enabled).toBe(true);
    expect(settings.whiteboards.allowStudentDraw).toBe(true);
  });
});
