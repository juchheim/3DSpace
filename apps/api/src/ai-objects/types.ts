import type { AiObjectJob } from "@3dspace/contracts";

export type ProceduralObjectSpec = {
  displayName: string;
  style?: "realistic" | "stylized-low-poly" | "cartoon" | "sculpture";
  parts: ProceduralPart[];
  materials: Record<string, ProceduralMaterial>;
  rejected?: false;
  rejectedReason?: null;
};

export type RejectedSpec = {
  rejected: true;
  rejectedReason: string;
  code?: "outside_procedural_scope" | "prompt_rejected";
};

export type ProceduralPart =
  | BoxPart
  | SpherePart
  | CylinderPart
  | ConePart
  | TorusPart
  | ExtrudePart
  | UnionPart;

export type BasePart = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  material: string;
};

export type BoxPart = BasePart & { op: "box"; size: [number, number, number] };
export type SpherePart = BasePart & { op: "sphere"; radius: number };
export type CylinderPart = BasePart & { op: "cylinder"; radius: number; height: number };
export type ConePart = BasePart & { op: "cone"; radius: number; height: number };
export type TorusPart = BasePart & { op: "torus"; radius: number; tube: number };
export type ExtrudePart = BasePart & { op: "extrude"; profile: [number, number][]; depth: number };
export type UnionPart = { op: "union"; children: ProceduralPart[] };

export type ProceduralMaterial = {
  colorHex: string;
  roughness?: number;
  metalness?: number;
};

export type MeshyPromptEnvelope = {
  refinedPrompt: string;
  negativePrompt: string;
  stylePreset: AiObjectJob["stylePreset"];
  polycountTarget: number;
};

export type StageAOutput =
  | { mode: "procedural"; spec: ProceduralObjectSpec }
  | { mode: "meshy"; envelope: MeshyPromptEnvelope };

export type GlbGenerationResult = {
  glbBytes: Buffer;
  thumbnailBytes: Buffer;
  triangleCount: number;
};

export interface AiObjectGenerationBackend {
  readonly name: "procedural" | "meshy";
  generate(input: StageAOutput): Promise<GlbGenerationResult>;
  cancel?(jobId: string): Promise<void>;
}
