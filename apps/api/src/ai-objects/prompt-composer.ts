import type { AppConfig } from "../config.js";
import { ProceduralObjectSpecSchema, RejectedSpecSchema } from "./procedural-spec-schema.js";
import type { MeshyPromptEnvelope, ProceduralObjectSpec, StageAOutput } from "./types.js";

const PROCEDURAL_SYSTEM_PROMPT = `You are a 3D object spec generator. Given a user prompt, output a JSON ProceduralObjectSpec.

Allowed ops: box, sphere, cylinder, cone, torus, extrude, union.
- box: { op, size[x,y,z], position?, rotation?, material }
- sphere: { op, radius, position?, rotation?, material }
- cylinder: { op, radius, height, position?, rotation?, material }
- cone: { op, radius, height, position?, rotation?, material }
- torus: { op, radius, tube, position?, rotation?, material }
- extrude: { op, profile[[x,z]...], depth, position?, rotation?, material }
- union: { op, children: Part[] } — max 2 levels deep

positions are [x, y, z] in meters. rotation is [rx, ry, rz] in degrees.

materials map: keys are your material IDs, values are { colorHex, roughness, metalness }.

Output JSON exactly matching this schema:
{
  "displayName": "...",
  "style": "stylized-low-poly" | "cartoon" | "sculpture" | "realistic",
  "parts": [...],
  "materials": { "matId": { "colorHex": "#rrggbb", "roughness": 0.8, "metalness": 0 } },
  "rejected": false,
  "rejectedReason": null
}

If the request:
- asks for a real person's likeness, a trademarked character, or explicit content: set rejected=true, rejectedReason="<reason>", code="prompt_rejected".
- cannot be built from the primitive vocabulary (e.g. "photorealistic sports car", "anime character"): set rejected=true, rejectedReason="<reason>", code="outside_procedural_scope".
- is a multi-object scene: pick the most prominent object and build it; do not set rejected.

Keep part count within complexity budgets (small=12, medium=24, detailed=40).
Compose shapes at y=0 as the floor; center objects at x=0, z=0.
Output ONLY the JSON object.`;

const MESHY_REFINER_SYSTEM_PROMPT = `You are a Meshy text-to-3D prompt refiner. Given a user prompt, output a refined prompt for Meshy text-to-3D.

Output JSON exactly:
{
  "refinedPrompt": "...",
  "negativePrompt": "low quality, blurry, deformed, ...",
  "stylePreset": "realistic" | "stylized-low-poly" | "cartoon" | "sculpture",
  "polycountTarget": 15000,
  "rejected": false,
  "rejectedReason": null
}

If the request violates policy (real people likenesses, trademarked characters, explicit content):
Set rejected=true, rejectedReason="<reason>", code="prompt_rejected".

Output ONLY the JSON object.`;

export async function composeFromPrompt(
  input: {
    prompt: string;
    stylePreset?: string;
    complexity?: string;
    polycountTarget?: number;
    mode: "procedural" | "meshy";
  },
  config: AppConfig
): Promise<StageAOutput | { rejected: true; reason: string; code?: "outside_procedural_scope" | "prompt_rejected" }> {
  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required for AI object generation");
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: config.openAiApiKey });

  const systemPrompt = input.mode === "procedural" ? PROCEDURAL_SYSTEM_PROMPT : MESHY_REFINER_SYSTEM_PROMPT;
  const userContent = [
    `Prompt: ${input.prompt}`,
    input.stylePreset ? `Style: ${input.stylePreset}` : "",
    input.complexity ? `Complexity: ${input.complexity}` : "",
    input.polycountTarget ? `Target polycount: ${input.polycountTarget}` : ""
  ].filter(Boolean).join("\n");

  async function attempt(): Promise<string> {
    const response = await client.chat.completions.create({
      model: config.tuning.openAiAiObjectComposerModel,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.4
    });
    return response.choices[0]?.message?.content ?? "{}";
  }

  let raw: string;
  try {
    raw = await attempt();
  } catch {
    raw = await attempt();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI composer returned invalid JSON");
  }

  if (input.mode === "procedural") {
    const rejected = RejectedSpecSchema.safeParse(parsed);
    if (rejected.success && rejected.data.rejected) {
      return { rejected: true, reason: rejected.data.rejectedReason, ...(rejected.data.code !== undefined ? { code: rejected.data.code } : {}) };
    }
    const spec = ProceduralObjectSpecSchema.safeParse(parsed);
    if (!spec.success) {
      throw new Error(`Invalid ProceduralObjectSpec from AI: ${spec.error.message}`);
    }
    return { mode: "procedural", spec: spec.data as ProceduralObjectSpec };
  } else {
    const obj = parsed as Record<string, unknown>;
    if (obj.rejected === true) {
      return { rejected: true, reason: String(obj.rejectedReason ?? "Policy rejection"), code: "prompt_rejected" };
    }
    const envelope: MeshyPromptEnvelope = {
      refinedPrompt: String(obj.refinedPrompt ?? input.prompt),
      negativePrompt: String(obj.negativePrompt ?? "low quality, blurry"),
      stylePreset: (obj.stylePreset as MeshyPromptEnvelope["stylePreset"]) ?? "stylized-low-poly",
      polycountTarget: Number(obj.polycountTarget ?? input.polycountTarget ?? 15000)
    };
    return { mode: "meshy", envelope };
  }
}
