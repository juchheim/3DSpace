import { describe, expect, it } from "vitest";
import { isLogicLightOn } from "../src/logic.js";

describe("isLogicLightOn", () => {
  it("defaults to off when no node state exists", () => {
    expect(isLogicLightOn({}, "light-a")).toBe(false);
  });

  it("is on only when node.on is explicitly true", () => {
    expect(isLogicLightOn({ "light-a": { on: true } }, "light-a")).toBe(true);
    expect(isLogicLightOn({ "light-a": { on: false } }, "light-a")).toBe(false);
  });
});
