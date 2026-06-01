import { describe, expect, it } from "vitest";
import {
  AVATAR_KEYBOARD_TURN_SPEED_RAD_PER_SEC,
  keyboardYawDelta
} from "../lib/useAvatarMovement";

describe("keyboardYawDelta", () => {
  it("returns zero when neither Q nor E is held", () => {
    expect(keyboardYawDelta(new Set(), 0.1)).toBe(0);
    expect(keyboardYawDelta(new Set(["KeyW"]), 0.1)).toBe(0);
  });

  it("returns zero when both Q and E are held", () => {
    expect(keyboardYawDelta(new Set(["KeyQ", "KeyE"]), 0.1)).toBe(0);
  });

  it("turns left (positive yaw) while Q is held", () => {
    expect(keyboardYawDelta(new Set(["KeyQ"]), 0.2)).toBeCloseTo(
      AVATAR_KEYBOARD_TURN_SPEED_RAD_PER_SEC * 0.2,
      5
    );
  });

  it("turns right (negative yaw) while E is held", () => {
    expect(keyboardYawDelta(new Set(["KeyE"]), 0.2)).toBeCloseTo(
      -AVATAR_KEYBOARD_TURN_SPEED_RAD_PER_SEC * 0.2,
      5
    );
  });
});
