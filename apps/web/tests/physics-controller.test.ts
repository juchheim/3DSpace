import { describe, expect, it } from "vitest";
import { PhysicsTuningSchema } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_RAMP_HIGH_Y,
  BUILD_RAMP_LOW_Y,
  groundSpecsWithoutRampFootprints,
  type ColliderSpec,
  type GroundColliderSpec,
  type RampColliderSpec
} from "@3dspace/room-engine";

import { PhysicsController } from "../lib/physics/PhysicsController";

const tuning = PhysicsTuningSchema.parse({ enabled: true });

function groundSpec(): ColliderSpec {
  return {
    kind: "ground",
    id: "ground:0",
    minX: -20,
    maxX: 20,
    minZ: -20,
    maxZ: 20,
    y: 0
  };
}

function elevatedFloorSpec(): ColliderSpec {
  return {
    kind: "cuboid",
    id: "floor:elevated",
    source: "floor",
    center: { x: 0, y: 2.15, z: 0 },
    half: { x: 1, y: 0.15, z: 1 }
  };
}

function blockingWallSpec(): ColliderSpec {
  return {
    kind: "cuboid",
    id: "wall:blocker",
    source: "wall",
    center: { x: 0, y: 1, z: 2 },
    half: { x: 5, y: 1, z: 0.1 }
  };
}

function lowCeilingSpec(): ColliderSpec {
  return {
    kind: "cuboid",
    id: "ceiling:low",
    source: "floor",
    center: { x: 0, y: 1.9, z: 0 },
    half: { x: 1.5, y: 0.1, z: 1.5 }
  };
}

function thinFloorSpec(centerY = 4.05): ColliderSpec {
  return {
    kind: "cuboid",
    id: `floor:thin:${centerY}`,
    source: "floor",
    center: { x: 0, y: centerY, z: 0 },
    half: { x: 2, y: 0.05, z: 2 }
  };
}

function trimeshPlatformSpec(centerY: number): ColliderSpec {
  return {
    kind: "trimesh",
    id: `platform:${centerY}`,
    source: "world-asset",
    vertices: new Float32Array([-2, centerY, -2, 2, centerY, -2, 2, centerY, 2, -2, centerY, 2]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3])
  };
}

function rampSpec(): RampColliderSpec {
  const half = BUILD_CELL_SIZE / 2;
  return {
    kind: "ramp",
    id: "ramp:test",
    minX: -half,
    maxX: half,
    minZ: -half,
    maxZ: half,
    lowY: BUILD_RAMP_LOW_Y,
    highY: BUILD_RAMP_HIGH_Y,
    climbAxis: "z",
    climbSign: 1,
    rotation: 0
  };
}

function groundAroundRamp(ramp: RampColliderSpec): GroundColliderSpec[] {
  return groundSpecsWithoutRampFootprints(
    [
      {
        kind: "ground",
        id: "ground:0",
        minX: -20,
        maxX: 20,
        minZ: -20,
        maxZ: 20,
        y: 0
      }
    ],
    [ramp]
  );
}

async function stepMany(
  controller: PhysicsController,
  steps: number,
  input: { moveX: number; moveZ: number; dtSeconds?: number; sprinting?: boolean }
) {
  const stepInput = {
    moveX: input.moveX,
    moveZ: input.moveZ,
    dtSeconds: input.dtSeconds ?? 1 / 60,
    ...(input.sprinting !== undefined ? { sprinting: input.sprinting } : {})
  };
  let last = controller.step(stepInput);

  for (let index = 1; index < steps; index += 1) {
    last = controller.step(stepInput);
  }

  return last;
}

describe("PhysicsController", () => {
  it("stays grounded on a flat ground collider", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec()],
      cacheKey: "ground",
      initialPosition: { x: 0, y: 0, z: 0 }
    });

    try {
      const out = await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      expect(out.grounded).toBe(true);
      expect(out.airborne).toBe(false);
      expect(Math.abs(out.position.y)).toBeLessThan(0.03);
      expect(out.vy).toBe(0);
    } finally {
      controller.dispose();
    }
  });

  it("blocks horizontal movement against a wall cuboid", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec(), blockingWallSpec()],
      cacheKey: "ground+wall",
      initialPosition: { x: 0, y: 0, z: 0 }
    });

    try {
      const out = await stepMany(controller, 60, { moveX: 0, moveZ: 1 });
      expect(out.grounded).toBe(true);
      expect(out.position.z).toBeLessThanOrEqual(1.51);
    } finally {
      controller.dispose();
    }
  });

  it("falls after stepping off an elevated floor and lands on ground", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec(), elevatedFloorSpec()],
      cacheKey: "ground+floor",
      initialPosition: { x: 0, y: 2.3, z: 0 }
    });

    try {
      const standing = await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      expect(Math.abs(standing.position.y - 2.3)).toBeLessThan(0.02);
      expect(standing.grounded).toBe(true);

      const falling = await stepMany(controller, 45, { moveX: 1, moveZ: 0 });
      expect(falling.position.x).toBeGreaterThan(1.5);
      expect(falling.position.y).toBeLessThan(2.3);
      expect(falling.airborne).toBe(true);
      expect(falling.vy).toBeLessThan(0);

      const landed = await stepMany(controller, 120, { moveX: 0, moveZ: 0 });
      expect(landed.grounded).toBe(true);
      expect(Math.abs(landed.position.y)).toBeLessThan(0.03);
      expect(landed.vy).toBe(0);
    } finally {
      controller.dispose();
    }
  });

  it("rebuilds static colliders when syncColliders receives a new cache key", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec()],
      cacheKey: "ground",
      initialPosition: { x: 0, y: 0, z: 0 }
    });

    try {
      const freeMove = await stepMany(controller, 20, { moveX: 0, moveZ: 1 });
      expect(freeMove.position.z).toBeGreaterThan(1);

      controller.setPosition({ x: 0, y: 0, z: 0 });
      controller.syncColliders([groundSpec(), blockingWallSpec()], "ground+wall");

      const blocked = await stepMany(controller, 60, { moveX: 0, moveZ: 1 });
      expect(blocked.position.z).toBeLessThanOrEqual(1.51);
    } finally {
      controller.dispose();
    }
  });

  it("moves faster while sprinting", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec()],
      cacheKey: "ground",
      initialPosition: { x: 0, y: 0, z: 0 }
    });

    try {
      await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      const walk = await stepMany(controller, 30, { moveX: 0, moveZ: 1 });
      const walkDelta = walk.position.z;
      const sprint = await stepMany(controller, 30, { moveX: 0, moveZ: 1, sprinting: true });
      const sprintDelta = sprint.position.z - walk.position.z;
      expect(sprintDelta).toBeGreaterThan(walkDelta * 1.4);
    } finally {
      controller.dispose();
    }
  });

  it("sprint jumps farther horizontally than a standing jump", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec()],
      cacheKey: "ground",
      initialPosition: { x: 0, y: 0, z: 0 }
    });

    try {
      await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      controller.requestJump(false);
      let standZ = 0;
      for (let index = 0; index < 90; index += 1) {
        const out = controller.step({ moveX: 0, moveZ: 1, dtSeconds: 1 / 60 });
        standZ = Math.max(standZ, out.position.z);
        if (out.grounded && index > 30) break;
      }

      controller.setPosition({ x: 0, y: 0, z: 0 });
      await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      controller.requestJump(true);
      let sprintZ = 0;
      for (let index = 0; index < 90; index += 1) {
        const out = controller.step({ moveX: 0, moveZ: 1, dtSeconds: 1 / 60, sprinting: true });
        sprintZ = Math.max(sprintZ, out.position.z);
        if (out.grounded && index > 30) break;
      }

      expect(sprintZ).toBeGreaterThan(standZ * 1.15);
    } finally {
      controller.dispose();
    }
  });

  it("jumps to roughly the configured height and lands back on ground", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec()],
      cacheKey: "ground",
      initialPosition: { x: 0, y: 0, z: 0 }
    });

    try {
      await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      controller.requestJump();

      let maxY = 0;
      let airborneSeen = false;
      for (let index = 0; index < 90; index += 1) {
        const out = controller.step({ moveX: 0, moveZ: 0, dtSeconds: 1 / 60 });
        maxY = Math.max(maxY, out.position.y);
        airborneSeen ||= out.airborne;
      }

      const landed = await stepMany(controller, 60, { moveX: 0, moveZ: 0 });
      expect(airborneSeen).toBe(true);
      expect(maxY).toBeGreaterThan(1.0);
      expect(maxY).toBeLessThan(1.6);
      expect(landed.grounded).toBe(true);
      expect(Math.abs(landed.position.y)).toBeLessThan(0.03);
    } finally {
      controller.dispose();
    }
  });

  it("does not allow a second jump while airborne", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec()],
      cacheKey: "ground",
      initialPosition: { x: 0, y: 0, z: 0 }
    });

    try {
      await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      controller.requestJump();
      let falling = controller.step({ moveX: 0, moveZ: 0, dtSeconds: 1 / 60 });
      for (let index = 0; index < 60 && !(falling.airborne && falling.vy < 0 && falling.position.y > 0.3); index += 1) {
        falling = controller.step({ moveX: 0, moveZ: 0, dtSeconds: 1 / 60 });
      }
      expect(falling.airborne).toBe(true);
      expect(falling.vy).toBeLessThan(0);
      expect(falling.position.y).toBeGreaterThan(0.3);

      controller.requestJump();
      const afterSecondRequest = controller.step({ moveX: 0, moveZ: 0, dtSeconds: 1 / 60 });
      expect(afterSecondRequest.airborne).toBe(true);
      expect(afterSecondRequest.vy).toBeLessThanOrEqual(0);
    } finally {
      controller.dispose();
    }
  });

  it("allows a coyote-time jump just after leaving a ledge", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec(), elevatedFloorSpec()],
      cacheKey: "ground+floor",
      initialPosition: { x: 0, y: 2.3, z: 0 }
    });

    try {
      await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      let out = controller.step({ moveX: 1, moveZ: 0, dtSeconds: 1 / 60 });
      while (out.grounded) {
        out = controller.step({ moveX: 1, moveZ: 0, dtSeconds: 1 / 60 });
      }

      const ledgeY = out.position.y;
      controller.requestJump();
      const jumped = await stepMany(controller, 10, { moveX: 1, moveZ: 0 });
      expect(jumped.airborne).toBe(true);
      expect(jumped.vy).toBeGreaterThan(0);
      expect(jumped.position.y).toBeGreaterThan(ledgeY);
    } finally {
      controller.dispose();
    }
  });

  it("blocks jump rise when there is low headroom overhead", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec(), lowCeilingSpec()],
      cacheKey: "ground+ceiling",
      initialPosition: { x: 0, y: 0, z: 0 }
    });

    try {
      await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      controller.requestJump();

      let maxY = 0;
      for (let index = 0; index < 60; index += 1) {
        const out = controller.step({ moveX: 0, moveZ: 0, dtSeconds: 1 / 60 });
        maxY = Math.max(maxY, out.position.y);
      }

      expect(maxY).toBeLessThan(0.3);
    } finally {
      controller.dispose();
    }
  });

  it("lands on a floor added underneath while already falling", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [],
      cacheKey: "empty",
      initialPosition: { x: 0, y: 6, z: 0 }
    });

    try {
      const falling = await stepMany(controller, 20, { moveX: 0, moveZ: 0 });
      expect(falling.position.y).toBeLessThan(6);
      expect(falling.airborne).toBe(true);

      controller.syncColliders([thinFloorSpec(2.05)], "midair-floor");

      const landed = await stepMany(controller, 120, { moveX: 0, moveZ: 0 });
      expect(landed.grounded).toBe(true);
      expect(landed.airborne).toBe(false);
      expect(landed.position.y).toBeCloseTo(2.1, 1);
    } finally {
      controller.dispose();
    }
  });

  it("falls when the floor underfoot is removed during play", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec(), elevatedFloorSpec()],
      cacheKey: "ground+floor",
      initialPosition: { x: 0, y: 2.3, z: 0 }
    });

    try {
      const standing = await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      expect(standing.grounded).toBe(true);
      expect(standing.position.y).toBeCloseTo(2.3, 1);

      controller.syncColliders([groundSpec()], "ground");

      let minY = standing.position.y;
      let airborneSeen = false;
      for (let index = 0; index < 45; index += 1) {
        const out = controller.step({ moveX: 0, moveZ: 0, dtSeconds: 1 / 60 });
        minY = Math.min(minY, out.position.y);
        airborneSeen ||= out.airborne;
      }
      expect(airborneSeen).toBe(true);
      expect(minY).toBeLessThan(2.3);

      const landed = await stepMany(controller, 120, { moveX: 0, moveZ: 0 });
      expect(landed.grounded).toBe(true);
      expect(landed.position.y).toBeCloseTo(0, 1);
    } finally {
      controller.dispose();
    }
  });

  it("supports standing on a trimesh platform", async () => {
    const controller = await PhysicsController.create({
      tuning,
      spec: [groundSpec(), trimeshPlatformSpec(2.1)],
      cacheKey: "ground+trimesh",
      initialPosition: { x: 0, y: 2.15, z: 0 }
    });

    try {
      const standing = await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      expect(standing.grounded).toBe(true);
      expect(standing.position.y).toBeCloseTo(2.15, 1);
      expect(standing.vy).toBe(0);
    } finally {
      controller.dispose();
    }
  });

  it("walks up a build ramp from ground without jumping", async () => {
    const ramp = rampSpec();
    const controller = await PhysicsController.create({
      tuning,
      spec: [...groundAroundRamp(ramp), ramp],
      cacheKey: "ground+ramp",
      initialPosition: { x: 0, y: 0, z: ramp.minZ - 0.4 }
    });

    try {
      let last = await stepMany(controller, 5, { moveX: 0, moveZ: 0 });
      expect(last.grounded).toBe(true);
      expect(last.position.y).toBeCloseTo(BUILD_RAMP_LOW_Y, 1);

      for (let index = 0; index < 180; index += 1) {
        last = await stepMany(controller, 1, { moveX: 0, moveZ: 1 });
      }

      expect(last.position.z).toBeGreaterThan(ramp.minZ + 0.5);
      expect(last.position.y).toBeGreaterThan(BUILD_RAMP_LOW_Y + 0.5);
    } finally {
      controller.dispose();
    }
  });

  it("does not tunnel through a thin floor at high fall speed", async () => {
    const fastFallTuning = PhysicsTuningSchema.parse({
      enabled: true,
      gravity: 100,
      maxFallSpeed: 120
    });
    const controller = await PhysicsController.create({
      tuning: fastFallTuning,
      spec: [thinFloorSpec(4.05)],
      cacheKey: "thin-floor",
      initialPosition: { x: 0, y: 18, z: 0 }
    });

    try {
      const landed = await stepMany(controller, 240, { moveX: 0, moveZ: 0 });
      expect(landed.grounded).toBe(true);
      expect(landed.position.y).toBeCloseTo(4.1, 1);
      expect(landed.vy).toBe(0);
    } finally {
      controller.dispose();
    }
  });
});
