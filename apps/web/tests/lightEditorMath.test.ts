import { describe, expect, it } from "vitest";
import {
  projectPointerToDragPlane,
  targetToAngles,
  anglesToTarget,
  coneAngleFromConeMouth,
  coneMouthForAngle,
  snap,
  clampLightField,
  type Vec3,
} from "../lib/lightEditorMath";

const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const nearVec = (a: Vec3, b: Vec3, eps = 1e-6) => {
  near(a.x, b.x, eps);
  near(a.y, b.y, eps);
  near(a.z, b.z, eps);
};

describe("projectPointerToDragPlane", () => {
  it("intersects a ray with a plane through the anchor", () => {
    const hit = projectPointerToDragPlane(
      { x: 0, y: 5, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }
    );
    expect(hit).not.toBeNull();
    nearVec(hit as Vec3, { x: 0, y: 0, z: 0 });
  });

  it("returns null when the ray is parallel to the plane", () => {
    const hit = projectPointerToDragPlane(
      { x: 0, y: 5, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }
    );
    expect(hit).toBeNull();
  });
});

describe("targetToAngles / anglesToTarget round-trip", () => {
  it("recovers the original target", () => {
    const position: Vec3 = { x: 1, y: 4, z: -2 };
    const target: Vec3 = { x: 3, y: 1, z: 2 };
    const distance = Math.hypot(target.x - position.x, target.y - position.y, target.z - position.z);
    const { azimuthDeg, elevationDeg } = targetToAngles(position, target);
    const back = anglesToTarget(position, azimuthDeg, elevationDeg, distance);
    nearVec(back, target, 1e-5);
  });

  it("reports straight-down as -90° elevation", () => {
    const { elevationDeg } = targetToAngles({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 });
    near(elevationDeg, -90, 1e-4);
  });

  it("reports +Z as 0° azimuth", () => {
    const { azimuthDeg } = targetToAngles({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    near(azimuthDeg, 0, 1e-4);
  });
});

describe("cone math", () => {
  it("coneMouthForAngle and coneAngleFromConeMouth round-trip", () => {
    const position: Vec3 = { x: 0, y: 5, z: 0 };
    const target: Vec3 = { x: 0, y: 0, z: 0 };
    const mouth = coneMouthForAngle(position, target, 30, 5);
    near(coneAngleFromConeMouth(position, target, mouth), 30, 1e-4);
  });

  it("clamps the recovered angle to 1–90", () => {
    const position: Vec3 = { x: 0, y: 5, z: 0 };
    const target: Vec3 = { x: 0, y: 0, z: 0 };
    // A point directly opposite the axis would be ~180° → clamped to 90.
    expect(coneAngleFromConeMouth(position, target, { x: 0, y: 10, z: 0 })).toBe(90);
  });
});

describe("snap", () => {
  it("snaps to the nearest multiple of step", () => {
    near(snap(1.23, 0.25), 1.25);
    near(snap(1.1, 0.25), 1.0);
  });
  it("is a no-op for non-positive step", () => {
    near(snap(1.23, 0), 1.23);
  });
});

describe("clampLightField", () => {
  it("honors contract bounds", () => {
    expect(clampLightField("intensity", 999)).toBe(20);
    expect(clampLightField("intensity", -5)).toBe(0);
    expect(clampLightField("angleDeg", 0)).toBe(1);
    expect(clampLightField("angleDeg", 200)).toBe(90);
    expect(clampLightField("penumbra", 2)).toBe(1);
    expect(clampLightField("decay", 9)).toBe(4);
    expect(clampLightField("width", 0)).toBe(0.1);
    expect(clampLightField("height", 100)).toBe(10);
    expect(clampLightField("distance", 250)).toBe(100);
  });
});
