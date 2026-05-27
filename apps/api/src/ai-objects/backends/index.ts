import type { AppConfig } from "../../config.js";
import type { AiObjectGenerationBackend } from "../types.js";
import { meshyBackend } from "./meshy.js";
import { proceduralBackend } from "./procedural.js";

export function getGenerationBackend(config: AppConfig): AiObjectGenerationBackend {
  if (config.tuning.aiObjectProvider !== "meshy") return proceduralBackend;
  if (!config.tuning.meshyApiKey) throw new Error("MESHY_API_KEY required for meshy provider");
  return meshyBackend;
}
