import { describe, expect, it } from "vitest";
import {
  AVATAR_KEYBOARD_TURN_HOLD_MS,
  AVATAR_KEYBOARD_TURN_SPEED_RAD_PER_SEC,
  keyboardYawDelta
} from "../lib/useAvatarMovement";

describe("keyboardYawDelta", () => {
  it("returns zero when neither Q nor E is held", () => {
    expect(keyboardYawDelta(new Set(), 0.1, 1000)).toBe(0);
    expect(keyboardYawDelta(new Set(["KeyW"]), 0.1, 1000)).toBe(0);
  });

  it("returns zero when both Q and E are held", () => {
    const downAt = { KeyQ: 0, KeyE: 0 };
    expect(keyboardYawDelta(new Set(["KeyQ", "KeyE"]), 0.1, 1000, downAt)).toBe(0);
  });

  it("returns zero until the turn key has been held past the hold threshold", () => {
    const now = 500;
    expect(keyboardYawDelta(new Set(["KeyE"]), 0.2, now, { KeyE: now - 50 })).toBe(0);
    expect(keyboardYawDelta(new Set(["KeyQ"]), 0.2, now, { KeyQ: now - AVATAR_KEYBOARD_TURN_HOLD_MS + 1 })).toBe(0);
  });

  it("turns left (positive yaw) while Q is held past the threshold", () => {
    const now = 1000;
    expect(
      keyboardYawDelta(new Set(["KeyQ"]), 0.2, now, { KeyQ: now - AVATAR_KEYBOARD_TURN_HOLD_MS })
    ).toBeCloseTo(AVATAR_KEYBOARD_TURN_SPEED_RAD_PER_SEC * 0.2, 5);
  });

  it("turns right (negative yaw) while E is held past the threshold", () => {
    const now = 1000;
    expect(
      keyboardYawDelta(new Set(["KeyE"]), 0.2, now, { KeyE: now - AVATAR_KEYBOARD_TURN_HOLD_MS })
    ).toBeCloseTo(-AVATAR_KEYBOARD_TURN_SPEED_RAD_PER_SEC * 0.2, 5);
  });
});
