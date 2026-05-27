import type { AiObjectGenerationBackend, StageAOutput } from "../types.js";

// Phase 6 — implemented after procedural path is stable.
// Loaded only when AI_OBJECT_PROVIDER=meshy.

export const meshyBackend: AiObjectGenerationBackend = {
  name: "meshy",
  async generate(_input: StageAOutput) {
    throw new Error("Meshy backend not yet implemented");
  },
  async cancel(_jobId: string) {
    // no-op until Phase 6
  }
};
