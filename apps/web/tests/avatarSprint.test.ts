import { describe, expect, it } from "vitest";
import { isSprinting, wantsSprintJump } from "../lib/avatarSprint";

describe("avatarSprint", () => {
  it("sprints only when shift is held and the avatar is moving", () => {
    expect(isSprinting(new Set(["ShiftLeft", "KeyW"]), { x: 0, z: 0 }, true)).toBe(true);
    expect(isSprinting(new Set(["ShiftLeft"]), { x: 0, z: 0 }, false)).toBe(false);
    expect(isSprinting(new Set(["KeyW"]), { x: 0, z: 0 }, true)).toBe(false);
  });

  it("allows sprint jump when shift is held with movement input", () => {
    expect(wantsSprintJump(new Set(["ShiftLeft", "KeyW"]), { x: 0, z: 0 })).toBe(true);
    expect(wantsSprintJump(new Set(["ShiftLeft"]), { x: 0, z: 0 })).toBe(false);
    expect(wantsSprintJump(new Set(["KeyW"]), { x: 0, z: 0 })).toBe(false);
  });
});
