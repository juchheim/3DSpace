import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import { buildRetroRobotKit, drawRobotScreen, RETRO_ROBOT_PALETTE } from "../lib/retroRobotMaterials";

// The RetroRobotHostAvatar geometry/material kit is the runtime-risky part of
// Phase 3 (lathe profiles, extruded shells with holes, tube sweeps). These run
// headless (the kit guards `document`, so canvas textures degrade to no-ops in
// the node test env) which lets us catch degenerate geometry that typecheck and
// the dev harness can't.

function geometryTriangles(geo: BufferGeometry): number {
  if (geo.index) return geo.index.count / 3;
  const position = geo.getAttribute("position");
  return position ? position.count / 3 : 0;
}

function assertFinitePositions(name: string, geo: BufferGeometry) {
  const position = geo.getAttribute("position");
  expect(position, `${name} has a position attribute`).toBeTruthy();
  expect(position!.count, `${name} is non-empty`).toBeGreaterThan(0);
  const array = position!.array;
  for (let i = 0; i < array.length; i++) {
    expect(Number.isFinite(array[i]), `${name} vertex ${i} is finite`).toBe(true);
  }
}

describe("buildRetroRobotKit", () => {
  it("builds every part with finite, non-empty geometry", () => {
    const kit = buildRetroRobotKit();
    try {
      const entries = Object.entries(kit.geo);
      expect(entries.length).toBeGreaterThan(20); // torso → fingers → treads → rivets
      for (const [name, geo] of entries) {
        assertFinitePositions(name, geo as BufferGeometry);
      }
    } finally {
      kit.dispose();
    }
  });

  it("stays within a sane triangle budget for a single per-room host", () => {
    const kit = buildRetroRobotKit();
    try {
      // Mirrors the avatar's instancing: most lathe/tube parts render twice
      // (two eyes, two wheels, two arms with three fingers each).
      const g = kit.geo;
      const doubled =
        geometryTriangles(g.eyeBezel) +
        geometryTriangles(g.eyeSclera) +
        geometryTriangles(g.eyeIris) +
        geometryTriangles(g.eyePupil) +
        geometryTriangles(g.eyeCatchlight) +
        geometryTriangles(g.earCap) +
        geometryTriangles(g.wheel) +
        geometryTriangles(g.hubcap) +
        geometryTriangles(g.shoulder) +
        geometryTriangles(g.upperArm) +
        geometryTriangles(g.forearm) +
        geometryTriangles(g.elbow) +
        geometryTriangles(g.wrist) +
        geometryTriangles(g.clawPalm) +
        geometryTriangles(g.armRib) * 2 +
        geometryTriangles(g.finger) * 3;
      const single = Object.values(g).reduce((sum, geo) => sum + geometryTriangles(geo as BufferGeometry), 0);
      const approxSceneTriangles = single + doubled; // generous upper bound
      // Hard ceiling well under what a single NPC should cost on the GPU
      // (headroom for the detailed layered eyes).
      expect(approxSceneTriangles).toBeLessThan(26000);
      expect(approxSceneTriangles).toBeGreaterThan(1500); // genuinely modeled, not a few boxes
    } finally {
      kit.dispose();
    }
  });

  it("exposes the art-direction palette", () => {
    expect(RETRO_ROBOT_PALETTE.body).toBe("#3ECFCC");
    expect(RETRO_ROBOT_PALETTE.accent).toBe("#FF6B4A");
    expect(RETRO_ROBOT_PALETTE.secondary).toBe("#FFD166");
  });

  it("disposes without throwing", () => {
    const kit = buildRetroRobotKit();
    expect(() => kit.dispose()).not.toThrow();
  });
});

describe("drawRobotScreen", () => {
  it("paints every animation state against a 2D context without throwing", () => {
    const gradient = { addColorStop() {} };
    const ctx = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => gradient;
          return () => undefined;
        },
        set() {
          return true;
        }
      }
    ) as unknown as CanvasRenderingContext2D;

    for (const state of ["idle", "thinking", "speaking"] as const) {
      expect(() => drawRobotScreen(ctx, state, 1.23, 0.6)).not.toThrow();
    }
  });
});
