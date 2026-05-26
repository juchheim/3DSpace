import { describe, expect, it } from "vitest";
import {
  computeSolarSubpoint,
  dateWithPhysicalElapsedDay,
  daylightDotForGeoCoordinate,
  spinOffsetFromUnwrappedSubsolarLongitude,
  unwrapRadiansDelta
} from "../../../apps/web/components/roomObjectProcedurals/earthSolar";

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

  it("computes maximum daylight at the geographic subsolar point", () => {
    const subpoint = computeSolarSubpoint(new Date("2026-03-20T14:46:00.000Z"));
    const oppositeLongitude = subpoint.longitudeRad + Math.PI;

    expect(daylightDotForGeoCoordinate(
      subpoint.latitudeRad,
      subpoint.longitudeRad,
      subpoint.latitudeRad,
      subpoint.longitudeRad
    )).toBeCloseTo(1, 12);
    expect(daylightDotForGeoCoordinate(
      -subpoint.latitudeRad,
      oppositeLongitude,
      subpoint.latitudeRad,
      subpoint.longitudeRad
    )).toBeLessThan(-0.99);
  });

  it("unwraps subsolar longitude across the antimeridian for continuous physical spin", () => {
    const previous = 179 * Math.PI / 180;
    const current = -179 * Math.PI / 180;
    const delta = unwrapRadiansDelta(current, previous);

    expect(delta * RAD_TO_DEG).toBeCloseTo(2, 8);
    expect(spinOffsetFromUnwrappedSubsolarLongitude(previous + delta, previous)).toBeCloseTo(2 / 360, 8);
  });

  it("advances physical accelerated time from a fixed anchor date", () => {
    const anchor = new Date("2026-03-20T14:46:00.000Z");
    const halfDay = dateWithPhysicalElapsedDay(anchor, 45, 90);

    expect(halfDay.toISOString()).toBe("2026-03-21T02:46:00.000Z");
    expect(dateWithPhysicalElapsedDay(anchor, 45, 0)).toBe(anchor);
  });
});
