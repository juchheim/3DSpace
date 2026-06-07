import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../lib/avatarAppearance";
import { shouldApplyAvatarRecolor } from "../lib/avatarRecolorGate";

describe("avatar recolor gate", () => {
  it("returns false when the feature flag is off", () => {
    expect(
      shouldApplyAvatarRecolor({
        flagEnabled: false,
        appearanceCustomized: true,
        appearance: DEFAULT_APPEARANCE
      })
    ).toBe(false);
  });

  it("keeps never-saved users on the baked texture", () => {
    expect(
      shouldApplyAvatarRecolor({
        flagEnabled: true,
        appearanceCustomized: false,
        customizedFieldPresent: true,
        appearance: DEFAULT_APPEARANCE
      })
    ).toBe(false);
  });

  it("enables recolor for customized appearances", () => {
    expect(
      shouldApplyAvatarRecolor({
        flagEnabled: true,
        appearanceCustomized: true,
        customizedFieldPresent: true,
        appearance: DEFAULT_APPEARANCE
      })
    ).toBe(true);
  });

  it("enables recolor for an unsaved local preview", () => {
    expect(
      shouldApplyAvatarRecolor({
        flagEnabled: true,
        appearanceCustomized: false,
        editorPreviewActive: true,
        customizedFieldPresent: true,
        appearance: DEFAULT_APPEARANCE
      })
    ).toBe(true);
  });

  it("falls back to non-default detection for legacy realtime payloads", () => {
    expect(
      shouldApplyAvatarRecolor({
        flagEnabled: true,
        appearanceCustomized: false,
        appearance: { ...DEFAULT_APPEARANCE, shirtFront: "#ff0000" }
      })
    ).toBe(true);
    expect(
      shouldApplyAvatarRecolor({
        flagEnabled: true,
        appearanceCustomized: false,
        appearance: DEFAULT_APPEARANCE
      })
    ).toBe(false);
  });
});
