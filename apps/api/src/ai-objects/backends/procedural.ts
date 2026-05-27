import { buildGlbFromProceduralSpec } from "../procedural-glb-builder.js";
import type { AiObjectGenerationBackend, StageAOutput } from "../types.js";

export const proceduralBackend: AiObjectGenerationBackend = {
  name: "procedural",
  async generate(input: StageAOutput) {
    if (input.mode !== "procedural") {
      throw new Error("Procedural backend requires mode=procedural");
    }
    return buildGlbFromProceduralSpec(input.spec);
  }
};
