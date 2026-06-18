import { describe, expect, it } from "vitest";
import { framingAnglesForPoint, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH } from "../lib/cameraFraming";

describe("framingAnglesForPoint", () => {
  it("yaws toward a point straight ahead (+Z)", () => {
    const { yaw } = framingAnglesForPoint({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 5 });
    expect(Math.abs(yaw)).toBeLessThan(1e-6);
  });

  it("yaws toward +X (≈90°)", () => {
    const { yaw } = framingAnglesForPoint({ x: 0, y: 1, z: 0 }, { x: 5, y: 1, z: 0 });
    expect(yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it("uses negative pitch to look up at a higher light", () => {
    const { pitch } = framingAnglesForPoint({ x: 0, y: 1, z: 0 }, { x: 0, y: 6, z: 2 });
    expect(pitch).toBeLessThan(0);
    expect(pitch).toBeGreaterThanOrEqual(CAMERA_MIN_PITCH);
  });

  it("clamps pitch to the camera range", () => {
    const low = framingAnglesForPoint({ x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0.01 });
    expect(low.pitch).toBeLessThanOrEqual(CAMERA_MAX_PITCH);
    const high = framingAnglesForPoint({ x: 0, y: 0, z: 0 }, { x: 0, y: 10, z: 0.01 });
    expect(high.pitch).toBeGreaterThanOrEqual(CAMERA_MIN_PITCH);
  });
});
