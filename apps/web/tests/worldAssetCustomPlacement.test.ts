import { describe, expect, it } from "vitest";

import {
  ceilingMountHeight,
  nearestWallSnap,
  placementPitch,
  placementSnapsToSurface,
  resolveCustomPlacement,
  WALL_MOUNT_HEIGHT
} from "../lib/worldAssetCustomPlacement";

// A 10×10 room centred on the origin: four walls, interior at (0,0).
const WALLS = [
  { start: { x: -5, z: -5 }, end: { x: 5, z: -5 } }, // north (z = -5)
  { start: { x: 5, z: -5 }, end: { x: 5, z: 5 } }, // east  (x = 5)
  { start: { x: 5, z: 5 }, end: { x: -5, z: 5 } }, // south (z = 5)
  { start: { x: -5, z: 5 }, end: { x: -5, z: -5 } } // west  (x = -5)
];

describe("placement classification helpers", () => {
  it("only wall and ceiling snap to a surface", () => {
    expect(placementSnapsToSurface("wall")).toBe(true);
    expect(placementSnapsToSurface("ceiling")).toBe(true);
    expect(placementSnapsToSurface("floor")).toBe(false);
    expect(placementSnapsToSurface("other")).toBe(false);
  });

  it("only ceiling gets a downward pitch", () => {
    expect(placementPitch("ceiling")).toBeCloseTo(Math.PI);
    expect(placementPitch("wall")).toBe(0);
    expect(placementPitch("floor")).toBe(0);
    expect(placementPitch("other")).toBe(0);
  });
});

describe("nearestWallSnap", () => {
  it("snaps a point near the east wall onto it, facing inward (−x)", () => {
    const snap = nearestWallSnap({ x: 4.6, z: 1 }, WALLS);
    expect(snap).not.toBeNull();
    expect(snap!.x).toBeCloseTo(5); // contact on the east wall plane
    expect(snap!.z).toBeCloseTo(1);
    // Inward normal points toward the interior (−x): yaw = atan2(nx, nz) = atan2(-1, 0).
    expect(Math.sin(snap!.yaw)).toBeCloseTo(-1);
    expect(Math.cos(snap!.yaw)).toBeCloseTo(0);
  });

  it("snaps a point near the north wall facing inward (+z)", () => {
    const snap = nearestWallSnap({ x: -1, z: -4.7 }, WALLS);
    expect(snap!.z).toBeCloseTo(-5);
    expect(Math.sin(snap!.yaw)).toBeCloseTo(0);
    expect(Math.cos(snap!.yaw)).toBeCloseTo(1); // faces +z into the room
  });

  it("returns null when there are no walls", () => {
    expect(nearestWallSnap({ x: 0, z: 0 }, [])).toBeNull();
  });
});

describe("resolveCustomPlacement", () => {
  const ctx = {
    walls: WALLS,
    dimensions: { height: 4 },
    groundY: (_x: number, _z: number) => 0.5
  };

  it("wall placement mounts at the wall at the fixed height", () => {
    const r = resolveCustomPlacement("wall", { x: 4.8, z: 0 }, ctx);
    expect(r).not.toBeNull();
    expect(r!.position.x).toBeCloseTo(5);
    expect(r!.position.y).toBeCloseTo(WALL_MOUNT_HEIGHT);
  });

  it("ceiling placement rises to the ceiling height", () => {
    const r = resolveCustomPlacement("ceiling", { x: 1, z: 2 }, ctx);
    expect(r!.position.x).toBeCloseTo(1);
    expect(r!.position.z).toBeCloseTo(2);
    expect(r!.position.y).toBeCloseTo(ceilingMountHeight(ctx.dimensions));
    expect(r!.yaw).toBe(0);
  });

  it("floor/other placement rests on the resolved ground", () => {
    for (const kind of ["floor", "other"] as const) {
      const r = resolveCustomPlacement(kind, { x: 2, z: -3 }, ctx);
      expect(r!.position.y).toBeCloseTo(0.5);
      expect(r!.position.x).toBeCloseTo(2);
    }
  });
});
