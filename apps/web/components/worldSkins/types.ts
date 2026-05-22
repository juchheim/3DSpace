// Phase 0: in-memory skin descriptor types — not yet from server.
// Phase 1 will define server-side Zod schemas in @3dspace/contracts;
// Phase 4 will replace SkinDescriptor with the hydrated WorldSkin type.

export interface MaterialDescriptor {
  colorHex?: string;
  textureUrl?: string;
  roughness?: number;
  metalness?: number;
  repeatX?: number;
  repeatY?: number;
}

export interface LightingPreset {
  backgroundColor: string;
  ambientColor: string;
  ambientIntensity: number;
  directionalColor: string;
  directionalIntensity: number;
  directionalPosition: [number, number, number];
  fogColor?: string;
  fogNear?: number;
  fogFar?: number;
  hemisphereSkyColor?: string;
  hemisphereGroundColor?: string;
  hemisphereIntensity?: number;
}

export interface SkyDescriptor {
  kind: "color" | "panorama";
  panoramaUrl?: string;
}

export interface AmbientDescriptor {
  url: string;
  defaultGain: number;
}

export interface SkinDescriptor {
  slug: string;
  label: string;
  description: string;
  // keyed by wall.id from the theater manifest (packages/room-engine)
  wallMaterials: Record<string, MaterialDescriptor>;
  floor: MaterialDescriptor;
  tiers?: MaterialDescriptor;
  lighting: LightingPreset;
  sky?: SkyDescriptor;
  ambient?: AmbientDescriptor;
  walkSpeedMultiplier: number;
  avatarScale: number;
}
