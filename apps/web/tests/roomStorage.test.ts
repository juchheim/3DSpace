// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  readFinePlacement,
  readTranslationPreferences,
  writeFinePlacement,
  writeTranslationPreference
} from "../lib/room/storage";

describe("room storage helpers", () => {
  it("reads and writes fine placement toggles", () => {
    expect(readFinePlacement(window.localStorage)).toBe(false);
    expect(writeFinePlacement(window.localStorage, true)).toBe(true);
    expect(readFinePlacement(window.localStorage)).toBe(true);
  });

  it("falls back to navigator language and safe defaults for translation prefs", () => {
    expect(
      readTranslationPreferences({
        storage: window.localStorage,
        storageKey: "translation:a",
        navigatorLanguage: "es-MX"
      })
    ).toEqual({
      readLang: "es",
      speakLang: "es",
      voiceMode: "off",
      voiceChoice: "auto"
    });
  });

  it("merges persisted translation preference patches", () => {
    const storageKey = "translation:b";

    writeTranslationPreference(
      { storage: window.localStorage, storageKey },
      { readLang: "fr", voiceChoice: "alloy" }
    );
    writeTranslationPreference(
      { storage: window.localStorage, storageKey },
      { speakLang: "de", voiceMode: "duck" }
    );

    expect(
      readTranslationPreferences({
        storage: window.localStorage,
        storageKey,
        navigatorLanguage: "en-US"
      })
    ).toEqual({
      readLang: "fr",
      speakLang: "de",
      voiceMode: "duck",
      voiceChoice: "alloy"
    });
  });
});
