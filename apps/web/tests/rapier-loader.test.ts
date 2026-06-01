import { describe, expect, it } from "vitest";

import { loadRapier } from "../lib/physics/rapier";

describe("loadRapier", () => {
  it("dynamically imports and initializes Rapier", async () => {
    const rapier = await loadRapier();

    expect(rapier.World).toBeTypeOf("function");
    expect(rapier.RigidBodyDesc.kinematicPositionBased).toBeTypeOf("function");
  }, 20_000);
});
