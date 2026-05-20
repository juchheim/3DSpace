import { CanvasTexture, MeshStandardMaterial, NearestFilter } from "three";
import type { AvatarAppearance } from "@3dspace/contracts";

// Six-element tuple: one material per BoxGeometry face.
// Face order: [0]=+X right, [1]=-X left, [2]=+Y top, [3]=-Y bottom, [4]=+Z front, [5]=-Z back
export type FaceMaterials = [
  MeshStandardMaterial,
  MeshStandardMaterial,
  MeshStandardMaterial,
  MeshStandardMaterial,
  MeshStandardMaterial,
  MeshStandardMaterial,
];

// ─── Canvas texture helpers ────────────────────────────────────────────────

type ZoneRect = { color: string; x: number; y: number; w: number; h: number };

function createZoneCanvasTexture(width: number, height: number, zones: ZoneRect[]): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  for (const zone of zones) {
    ctx.fillStyle = zone.color;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
  }
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  return texture;
}

export function updateZoneCanvasTexture(texture: CanvasTexture, zones: ZoneRect[]): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const zone of zones) {
    ctx.fillStyle = zone.color;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
  }
  texture.needsUpdate = true;
}

// ─── Shared helper ─────────────────────────────────────────────────────────

const R = 0.7; // roughness for all avatar materials

function solid(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: R });
}

function canvas(texture: CanvasTexture): MeshStandardMaterial {
  return new MeshStandardMaterial({ map: texture, roughness: R });
}

// ─── Build functions (called once on mount) ────────────────────────────────
// BoxGeometry face order: [0]=+X right, [1]=-X left, [2]=+Y top,
//                         [3]=-Y bottom, [4]=+Z front, [5]=-Z back

export function buildHeadMaterials(z: AvatarAppearance): FaceMaterials {
  const frontTex = createZoneCanvasTexture(16, 16, [
    { color: z.hairFront,  x: 0, y: 0,  w: 16, h: 3  }, // hairline
    { color: z.faceSkin,   x: 0, y: 3,  w: 16, h: 10 }, // face
    { color: z.faceAccent, x: 0, y: 13, w: 16, h: 3  }, // chin
  ]);
  return [
    solid(z.headSide),   // +X right
    solid(z.headSide),   // -X left
    solid(z.hairTop),    // +Y top
    solid(z.faceSkin),   // -Y bottom (chin underside)
    canvas(frontTex),    // +Z front
    solid(z.hairBack),   // -Z back
  ];
}

export function buildBodyMaterials(z: AvatarAppearance): FaceMaterials {
  const frontTex = createZoneCanvasTexture(8, 12, [
    { color: z.collar,     x: 0, y: 0, w: 8, h: 2 }, // collar
    { color: z.shirtFront, x: 0, y: 2, w: 8, h: 5 }, // chest
    { color: z.shirtBelly, x: 0, y: 7, w: 8, h: 5 }, // belly
  ]);
  return [
    solid(z.shirtSide),   // +X right
    solid(z.shirtSide),   // -X left
    solid(z.shoulderTop), // +Y top
    solid(z.shirtBelly),  // -Y bottom (hem, rarely visible)
    canvas(frontTex),     // +Z front
    solid(z.shirtBack),   // -Z back
  ];
}

export function buildArmMaterials(z: AvatarAppearance): FaceMaterials {
  return [
    solid(z.sleeve),      // +X right
    solid(z.sleeve),      // -X left
    solid(z.shoulderCap), // +Y top
    solid(z.hand),        // -Y bottom (wrist/hand)
    solid(z.sleeve),      // +Z front
    solid(z.sleeve),      // -Z back
  ];
}

export function buildLegMaterials(z: AvatarAppearance): FaceMaterials {
  const frontTex = createZoneCanvasTexture(4, 12, [
    { color: z.thigh, x: 0, y: 0, w: 4, h: 6 }, // upper leg
    { color: z.shin,  x: 0, y: 6, w: 4, h: 6 }, // lower leg
  ]);
  return [
    solid(z.legSide), // +X right
    solid(z.legSide), // -X left
    solid(z.legSide), // +Y top (hidden inside body)
    solid(z.legSide), // -Y bottom (hidden inside foot)
    canvas(frontTex), // +Z front
    solid(z.legSide), // -Z back
  ];
}

export function buildFootMaterials(z: AvatarAppearance): FaceMaterials {
  return [
    solid(z.shoeSide), // +X right
    solid(z.shoeSide), // -X left
    solid(z.shoeTop),  // +Y top
    solid(z.shoeSole), // -Y bottom
    solid(z.shoeToe),  // +Z front (toe cap)
    solid(z.shoeSide), // -Z back (heel)
  ];
}

// ─── Update functions (called imperatively when appearance changes) ─────────
// Mutates the existing material array in-place — no allocation, no remount.

export function updateHeadMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  mats[0].color.set(z.headSide);
  mats[1].color.set(z.headSide);
  mats[2].color.set(z.hairTop);
  mats[3].color.set(z.faceSkin);
  updateZoneCanvasTexture(mats[4].map as CanvasTexture, [
    { color: z.hairFront,  x: 0, y: 0,  w: 16, h: 3  },
    { color: z.faceSkin,   x: 0, y: 3,  w: 16, h: 10 },
    { color: z.faceAccent, x: 0, y: 13, w: 16, h: 3  },
  ]);
  mats[5].color.set(z.hairBack);
}

export function updateBodyMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  mats[0].color.set(z.shirtSide);
  mats[1].color.set(z.shirtSide);
  mats[2].color.set(z.shoulderTop);
  mats[3].color.set(z.shirtBelly);
  updateZoneCanvasTexture(mats[4].map as CanvasTexture, [
    { color: z.collar,     x: 0, y: 0, w: 8, h: 2 },
    { color: z.shirtFront, x: 0, y: 2, w: 8, h: 5 },
    { color: z.shirtBelly, x: 0, y: 7, w: 8, h: 5 },
  ]);
  mats[5].color.set(z.shirtBack);
}

export function updateArmMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  mats[0].color.set(z.sleeve);
  mats[1].color.set(z.sleeve);
  mats[2].color.set(z.shoulderCap);
  mats[3].color.set(z.hand);
  mats[4].color.set(z.sleeve);
  mats[5].color.set(z.sleeve);
}

export function updateLegMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  mats[0].color.set(z.legSide);
  mats[1].color.set(z.legSide);
  mats[2].color.set(z.legSide);
  mats[3].color.set(z.legSide);
  updateZoneCanvasTexture(mats[4].map as CanvasTexture, [
    { color: z.thigh, x: 0, y: 0, w: 4, h: 6 },
    { color: z.shin,  x: 0, y: 6, w: 4, h: 6 },
  ]);
  mats[5].color.set(z.legSide);
}

export function updateFootMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  mats[0].color.set(z.shoeSide);
  mats[1].color.set(z.shoeSide);
  mats[2].color.set(z.shoeTop);
  mats[3].color.set(z.shoeSole);
  mats[4].color.set(z.shoeToe);
  mats[5].color.set(z.shoeSide);
}

// ─── Dispose helpers ───────────────────────────────────────────────────────

export function disposeMaterials(mats: FaceMaterials | MeshStandardMaterial[]): void {
  for (const mat of mats) {
    mat.map?.dispose();
    mat.dispose();
  }
}

// ─── Editor metadata (used in Phase 7 AvatarEditorPanel) ──────────────────

export const ZONE_LABELS: Record<keyof AvatarAppearance, string> = {
  hairTop:     "Hair",
  hairFront:   "Hairline",
  headSide:    "Head sides",
  hairBack:    "Hair back",
  faceSkin:    "Face",
  faceAccent:  "Chin / lower face",
  collar:      "Collar",
  shirtFront:  "Chest",
  shirtBelly:  "Belly",
  shirtBack:   "Shirt back",
  shirtSide:   "Shirt sides",
  shoulderTop: "Shoulder top",
  shoulderCap: "Shoulder cap",
  sleeve:      "Sleeves",
  hand:        "Hands",
  thigh:       "Thighs",
  shin:        "Shins",
  legSide:     "Leg sides",
  legBack:     "Leg back",
  shoeTop:     "Shoe top",
  shoeToe:     "Toe cap",
  shoeSide:    "Shoe sides",
  shoeSole:    "Shoe sole",
};

export const ZONE_GROUPS: ReadonlyArray<{ label: string; keys: ReadonlyArray<keyof AvatarAppearance> }> = [
  { label: "Head", keys: ["hairTop", "hairFront", "headSide", "hairBack", "faceSkin", "faceAccent"] },
  { label: "Body", keys: ["collar", "shirtFront", "shirtBelly", "shirtBack", "shirtSide", "shoulderTop"] },
  { label: "Arms", keys: ["shoulderCap", "sleeve", "hand"] },
  { label: "Legs", keys: ["thigh", "shin", "legSide"] },
  { label: "Feet", keys: ["shoeTop", "shoeToe", "shoeSide", "shoeSole"] },
];
