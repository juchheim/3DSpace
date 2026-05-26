import { describe, expect, it } from "vitest";
import { computeSolarSubpoint } from "../../../apps/web/components/roomObjectProcedurals/earthSolar";

const RAD_TO_DEG = 180 / Math.PI;

describe("Earth globe solar position", () => {
  it("puts the subsolar latitude near the equator on the March equinox preset", () => {
    const subpoint = computeSolarSubpoint(new Date("2026-03-20T14:46:00.000Z"));
    expect(Math.abs(subpoint.latitudeRad * RAD_TO_DEG)).toBeLessThan(0.5);
  });

  it("puts the subsolar latitude near the tropics on solstice presets", () => {
    const june = computeSolarSubpoint(new Date("2026-06-21T02:24:00.000Z"));
    const december = computeSolarSubpoint(new Date("2026-12-21T20:50:00.000Z"));

    expect(june.latitudeRad * RAD_TO_DEG).toBeGreaterThan(23);
    expect(december.latitudeRad * RAD_TO_DEG).toBeLessThan(-23);
  });
});
