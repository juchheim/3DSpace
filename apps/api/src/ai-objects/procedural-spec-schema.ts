import { z } from "zod";

const BasePartSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]).optional(),
  rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
  material: z.string()
});

const BoxPartSchema = BasePartSchema.extend({ op: z.literal("box"), size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]) });
const SpherePartSchema = BasePartSchema.extend({ op: z.literal("sphere"), radius: z.number().positive() });
const CylinderPartSchema = BasePartSchema.extend({ op: z.literal("cylinder"), radius: z.number().positive(), height: z.number().positive() });
const ConePartSchema = BasePartSchema.extend({ op: z.literal("cone"), radius: z.number().positive(), height: z.number().positive() });
const TorusPartSchema = BasePartSchema.extend({ op: z.literal("torus"), radius: z.number().positive(), tube: z.number().positive() });
const ExtrudePartSchema = BasePartSchema.extend({
  op: z.literal("extrude"),
  profile: z.array(z.tuple([z.number(), z.number()])).min(3),
  depth: z.number().positive()
});

type ProceduralPartInput = z.input<typeof BoxPartSchema>
  | z.input<typeof SpherePartSchema>
  | z.input<typeof CylinderPartSchema>
  | z.input<typeof ConePartSchema>
  | z.input<typeof TorusPartSchema>
  | z.input<typeof ExtrudePartSchema>
  | { op: "union"; children: ProceduralPartInput[] };

const ProceduralPartSchema: z.ZodType<ProceduralPartInput> = z.lazy(() =>
  z.discriminatedUnion("op", [
    BoxPartSchema,
    SpherePartSchema,
    CylinderPartSchema,
    ConePartSchema,
    TorusPartSchema,
    ExtrudePartSchema,
    z.object({ op: z.literal("union"), children: z.array(ProceduralPartSchema).min(1).max(8) })
  ])
);

const ProceduralMaterialSchema = z.object({
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional()
});

export const ProceduralObjectSpecSchema = z.object({
  displayName: z.string().min(1).max(80),
  style: z.enum(["realistic", "stylized-low-poly", "cartoon", "sculpture"]).optional(),
  parts: z.array(ProceduralPartSchema).min(1).max(40),
  materials: z.record(z.string(), ProceduralMaterialSchema),
  rejected: z.literal(false).optional(),
  rejectedReason: z.null().optional()
});

export const RejectedSpecSchema = z.object({
  rejected: z.literal(true),
  rejectedReason: z.string(),
  code: z.enum(["outside_procedural_scope", "prompt_rejected"]).optional()
});

export const ComposerOutputSchema = z.union([ProceduralObjectSpecSchema, RejectedSpecSchema]);

export const COMPLEXITY_PART_CAPS: Record<string, number> = {
  small: 12,
  medium: 24,
  detailed: 40
};

export const COMPLEXITY_POLYCOUNT_TARGETS: Record<string, number> = {
  small: 5000,
  medium: 15000,
  detailed: 50000
};
