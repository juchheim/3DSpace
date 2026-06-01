import { PhysicsTuningSchema, type PhysicsTuning, type WorldSkinOverrides } from "@3dspace/contracts";

type ResolvePhysicsTuningInput = {
  defaults: PhysicsTuning;
  skin?: Pick<WorldSkinOverrides, "gravityMultiplier" | "jumpMultiplier" | "walkSpeedMultiplier"> | undefined;
  room?: Partial<PhysicsTuning> | undefined;
  featureEnabled: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampResolvedPhysicsTuning(tuning: PhysicsTuning): PhysicsTuning {
  return {
    enabled: tuning.enabled,
    gravity: clamp(tuning.gravity, 0, 100),
    moveSpeed: clamp(tuning.moveSpeed, Number.EPSILON, 20),
    jumpHeight: clamp(tuning.jumpHeight, 0, 10),
    maxFallSpeed: clamp(tuning.maxFallSpeed, Number.EPSILON, 200),
    airControl: clamp(tuning.airControl, 0, 1),
    coyoteTimeMs: Math.round(clamp(tuning.coyoteTimeMs, 0, 500)),
    capsuleRadius: clamp(tuning.capsuleRadius, Number.EPSILON, 2),
    capsuleHeight: clamp(tuning.capsuleHeight, Number.EPSILON, 4),
    maxSlopeClimbDeg: clamp(tuning.maxSlopeClimbDeg, 0, 89),
    autoStepHeight: clamp(tuning.autoStepHeight, 0, 2),
    snapToGroundDist: clamp(tuning.snapToGroundDist, 0, 2)
  };
}

export function resolvePhysicsTuning(input: ResolvePhysicsTuningInput): PhysicsTuning {
  const defaults = PhysicsTuningSchema.parse(input.defaults);
  const gravityMultiplier = input.skin?.gravityMultiplier ?? 1;
  const jumpMultiplier = input.skin?.jumpMultiplier ?? 1;
  const walkSpeedMultiplier = input.skin?.walkSpeedMultiplier ?? 1;

  const merged: PhysicsTuning = {
    ...defaults,
    gravity: defaults.gravity * gravityMultiplier,
    jumpHeight: defaults.jumpHeight * jumpMultiplier,
    moveSpeed: defaults.moveSpeed * walkSpeedMultiplier,
    ...(input.room ?? {}),
    enabled: input.featureEnabled && (input.room?.enabled ?? defaults.enabled)
  };

  return PhysicsTuningSchema.parse(clampResolvedPhysicsTuning(merged));
}
