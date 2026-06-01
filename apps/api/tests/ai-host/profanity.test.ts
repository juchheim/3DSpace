import { describe, expect, it } from "vitest";
import { displayNameContainsProfanity } from "../../src/ai-host/profanity.js";

describe("ai-host profanity filter", () => {
  it("blocks whole-word profanity", () => {
    expect(displayNameContainsProfanity("what the fuck")).toBe(true);
  });

  it("allows substrings that are not standalone tokens", () => {
    expect(displayNameContainsProfanity("Classic")).toBe(false);
    expect(displayNameContainsProfanity("Assistant")).toBe(false);
  });
});
