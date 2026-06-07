import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../lib/avatarAppearance";
import {
  appearanceEqualsDefault,
  appearanceToZoneColorArray,
  AVATAR_ZONE_BY_KEY,
  AVATAR_ZONE_KEY_BY_ID,
  type AvatarZoneId,
  hexToLinearRgb
} from "../lib/avatarZoneRegistry";

describe("avatar zone registry", () => {
  it("maps every appearance key to a unique zone id", () => {
    const zoneIds = Object.values(AVATAR_ZONE_BY_KEY);
    expect(zoneIds).toHaveLength(23);
    expect(new Set(zoneIds).size).toBe(23);
    expect(Math.min(...zoneIds)).toBe(1);
    expect(Math.max(...zoneIds)).toBe(23);
  });

  it("provides a reverse lookup for every zone id", () => {
    for (let zoneId = 1; zoneId <= 23; zoneId += 1) {
      expect(AVATAR_ZONE_KEY_BY_ID[zoneId as AvatarZoneId]).toBeTruthy();
    }
    expect(AVATAR_ZONE_KEY_BY_ID[0]).toBeNull();
  });

  it("writes linear RGB colors into the expected slot", () => {
    const appearance = { ...DEFAULT_APPEARANCE, shirtFront: "#ff0000" };
    const zoneColors = appearanceToZoneColorArray(appearance);
    const shirtFrontOffset = 8 * 3;
    const [r, g, b] = hexToLinearRgb("#ff0000");
    expect(zoneColors[shirtFrontOffset]).toBeCloseTo(r);
    expect(zoneColors[shirtFrontOffset + 1]).toBeCloseTo(g);
    expect(zoneColors[shirtFrontOffset + 2]).toBeCloseTo(b);
  });

  it("compares appearances against the defaults using normalized hex", () => {
    expect(appearanceEqualsDefault(DEFAULT_APPEARANCE)).toBe(true);
    expect(appearanceEqualsDefault({ ...DEFAULT_APPEARANCE, shirtFront: "#4466AA" })).toBe(true);
    expect(appearanceEqualsDefault({ ...DEFAULT_APPEARANCE, shirtFront: "#ff0000" })).toBe(false);
  });
});
