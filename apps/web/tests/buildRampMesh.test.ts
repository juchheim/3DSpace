import { describe, expect, it } from "vitest";
import type { BuildPieceRotation } from "@3dspace/contracts";
import {
  engineRampClimbXZ,
  glbRampClimbXZAfterYaw,
  rampGlbRotationY
} from "../lib/buildRampMesh";

const ROTATIONS: BuildPieceRotation[] = [0, 90, 180, 270];

describe("rampGlbRotationY", () => {
  it.each(ROTATIONS)("rotation %i° aligns GLB slope with engine climb", (rotation) => {
    const yaw = rampGlbRotationY(rotation);
    const engine = engineRampClimbXZ(rotation);
    const visual = glbRampClimbXZAfterYaw(yaw);
    expect(visual.x).toBeCloseTo(engine.x);
    expect(visual.z).toBeCloseTo(engine.z);
  });
});
