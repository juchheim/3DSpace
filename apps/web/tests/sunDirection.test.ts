import { describe, it, expect } from "vitest";
import { sunDirectionVector, sunPosition } from "../lib/sunDirection";

describe("sunDirectionVector", () => {
  it("points straight up at elevation 90", () => {
    const d = sunDirectionVector(0, 90);
    expect(d.y).toBeCloseTo(1, 4);
    expect(d.x).toBeCloseTo(0, 4);
    expect(d.z).toBeCloseTo(0, 4);
  });

  it("points along horizon at elevation 0 azimuth 0", () => {
    const d = sunDirectionVector(0, 0);
    expect(d.y).toBeCloseTo(0, 4);
    // azimuth 0 = south = +Z in three.js (cos(0)*cos(0)=1)
    expect(d.z).toBeCloseTo(1, 4);
    expect(d.x).toBeCloseTo(0, 4);
  });

  it("returns a unit vector", () => {
    const d = sunDirectionVector(45, 45);
    const len = Math.sqrt(d.x ** 2 + d.y ** 2 + d.z ** 2);
    expect(len).toBeCloseTo(1, 5);
  });
});

describe("sunPosition", () => {
  it("scales direction by radius", () => {
    const pos = sunPosition(0, 90, 100);
    expect(pos.y).toBeCloseTo(100, 2);
  });

  it("defaults to radius 50", () => {
    const pos = sunPosition(0, 90);
    expect(pos.y).toBeCloseTo(50, 2);
  });
});
