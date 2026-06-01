import { describe, expect, it } from "vitest";
import { PhysicsTuningSchema } from "@3dspace/contracts";

import { resolvePhysicsTuning } from "../src/index.js";

describe("resolvePhysicsTuning", () => {
  const defaults = PhysicsTuningSchema.parse({
    enabled: true,
    gravity: 24,
    moveSpeed: 3.2,
    jumpHeight: 1.3,
    maxFallSpeed: 40,
    airControl: 0.6,
    coyoteTimeMs: 120,
    capsuleRadius: 0.4,
    capsuleHeight: 1.6,
    maxSlopeClimbDeg: 50,
    autoStepHeight: 0.6,
    snapToGroundDist: 0.3
  });

  it("passes through env defaults when no overrides are present", () => {
    expect(resolvePhysicsTuning({ defaults, featureEnabled: true })).toEqual(defaults);
  });

  it("applies world-skin multipliers to gravity, jump, and move speed", () => {
    const resolved = resolvePhysicsTuning({
      defaults,
      featureEnabled: true,
      skin: {
        gravityMultiplier: 0.38,
        jumpMultiplier: 1.5,
        walkSpeedMultiplier: 1.1
      }
    });

    expect(resolved.gravity).toBeCloseTo(9.12);
    expect(resolved.jumpHeight).toBeCloseTo(1.95);
    expect(resolved.moveSpeed).toBeCloseTo(3.52);
    expect(resolved.enabled).toBe(true);
  });

  it("matches the intended Mars low-gravity profile", () => {
    const resolved = resolvePhysicsTuning({
      defaults,
      featureEnabled: true,
      skin: {
        gravityMultiplier: 0.38,
        jumpMultiplier: 1.5,
        walkSpeedMultiplier: 0.38
      }
    });

    expect(resolved.gravity).toBeCloseTo(9.12);
    expect(resolved.jumpHeight).toBeCloseTo(1.95);
    expect(resolved.moveSpeed).toBeCloseTo(1.216);
  });

  it("lets room overrides win over skin-adjusted defaults", () => {
    const resolved = resolvePhysicsTuning({
      defaults,
      featureEnabled: true,
      skin: {
        gravityMultiplier: 0.38,
        jumpMultiplier: 1.5,
        walkSpeedMultiplier: 1.1
      },
      room: {
        gravity: 12,
        moveSpeed: 6,
        enabled: false
      }
    });

    expect(resolved.gravity).toBe(12);
    expect(resolved.moveSpeed).toBe(6);
    expect(resolved.jumpHeight).toBeCloseTo(1.95);
    expect(resolved.enabled).toBe(false);
  });

  it("ANDs enabled with the room-type feature gate", () => {
    const resolved = resolvePhysicsTuning({
      defaults,
      featureEnabled: false,
      room: { enabled: true }
    });

    expect(resolved.enabled).toBe(false);
  });

  it("clamps values after applying multipliers and room overrides", () => {
    const resolved = resolvePhysicsTuning({
      defaults: {
        ...defaults,
        gravity: 90,
        moveSpeed: 19,
        jumpHeight: 8,
        maxFallSpeed: 190,
        airControl: 0.9
      },
      featureEnabled: true,
      skin: {
        gravityMultiplier: 4,
        jumpMultiplier: 2,
        walkSpeedMultiplier: 2
      },
      room: {
        maxFallSpeed: 500,
        airControl: 5,
        coyoteTimeMs: 999,
        capsuleRadius: 5,
        capsuleHeight: 10,
        maxSlopeClimbDeg: 95,
        autoStepHeight: 5,
        snapToGroundDist: 5
      }
    });

    expect(resolved.gravity).toBe(100);
    expect(resolved.moveSpeed).toBe(20);
    expect(resolved.jumpHeight).toBe(10);
    expect(resolved.maxFallSpeed).toBe(200);
    expect(resolved.airControl).toBe(1);
    expect(resolved.coyoteTimeMs).toBe(500);
    expect(resolved.capsuleRadius).toBe(2);
    expect(resolved.capsuleHeight).toBe(4);
    expect(resolved.maxSlopeClimbDeg).toBe(89);
    expect(resolved.autoStepHeight).toBe(2);
    expect(resolved.snapToGroundDist).toBe(2);
  });
});
