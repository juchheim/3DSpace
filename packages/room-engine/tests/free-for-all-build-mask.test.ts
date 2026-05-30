import { describe, expect, it } from "vitest";
import { createFreeForAllManifest } from "../src/index.js";
import {
  freeForAllBuildMask,
  freeForAllHallRects,
  isAngleWithinFreeForAllExitArc,
  isPointInFreeForAllExitWedge
} from "../src/free-for-all-build-mask.js";

describe("freeForAllBuildMask", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-ffa-mask" });

  it("detects FFA manifests and exposes four hall corridors", () => {
    const mask = freeForAllBuildMask(manifest);
    expect(mask).not.toBeNull();
    expect(mask!.halls).toHaveLength(4);
    expect(mask!.boardZones).toHaveLength(4);
    expect(freeForAllHallRects()).toHaveLength(4);
  });

  it("matches the collision exit-arc helper at cardinal directions", () => {
    expect(isAngleWithinFreeForAllExitArc(0)).toBe(true);
    expect(isAngleWithinFreeForAllExitArc(Math.PI / 2)).toBe(true);
    expect(isAngleWithinFreeForAllExitArc(Math.PI / 4)).toBe(false);
  });

  it("marks inner hub exit wedges and outward halls separately", () => {
    expect(isPointInFreeForAllExitWedge(18, 0)).toBe(true);
    expect(isPointInFreeForAllExitWedge(25, 0)).toBe(false);
    const eastHall = freeForAllHallRects()[0]!;
    expect(25).toBeGreaterThanOrEqual(eastHall.minX);
    expect(25).toBeLessThanOrEqual(eastHall.maxX);
    expect(0).toBeGreaterThanOrEqual(eastHall.minZ);
    expect(0).toBeLessThanOrEqual(eastHall.maxZ);
  });
});
