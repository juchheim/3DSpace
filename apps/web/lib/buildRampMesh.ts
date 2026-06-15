import type { BuildPieceRotation } from "@3dspace/contracts";
import { rampClimbFromRotation } from "@3dspace/room-engine";

/**
 * Yaw (radians) for the ramp GLB so its slope matches engine climb direction.
 *
 * The authored mesh climbs from local +Z (low foot) to −Z (crest). Engine ramps use
 * `rampClimbFromRotation`; this maps each build rotation to the GLB yaw that aligns
 * the two without changing collision or movement.
 */
export function rampGlbRotationY(rotation: BuildPieceRotation): number {
  const engine = engineRampClimbXZ(rotation);
  if (engine.x === 0) {
    return engine.z === 1 ? Math.PI : 0;
  }
  return engine.x === 1 ? -Math.PI / 2 : Math.PI / 2;
}

/** Unit climb direction on the XZ plane from engine ramp rotation. */
export function engineRampClimbXZ(rotation: BuildPieceRotation): { x: number; z: number } {
  const { climbAxis, climbSign } = rampClimbFromRotation(rotation);
  return climbAxis === "z" ? { x: 0, z: climbSign } : { x: climbSign, z: 0 };
}

/** Rotate native GLB climb (+Z low → −Z high, direction (0, −1)) by yaw around Y. */
export function glbRampClimbXZAfterYaw(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}
