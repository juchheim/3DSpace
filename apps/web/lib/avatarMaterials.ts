import { CanvasTexture, MeshStandardMaterial, NearestFilter } from "three";
import type { AvatarAppearance } from "@3dspace/contracts";
import { AVATAR_HINT_COLORS } from "./avatarAppearance";

/** Return the appearance color for a zone, falling back to the hint color when null. */
function zc(appearance: AvatarAppearance, key: keyof AvatarAppearance): string {
  return appearance[key] ?? AVATAR_HINT_COLORS[key];
}

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
    { color: zc(z, "hairFront"),  x: 0, y: 0,  w: 16, h: 3  }, // hairline
    { color: zc(z, "faceSkin"),   x: 0, y: 3,  w: 16, h: 10 }, // face
    { color: zc(z, "faceAccent"), x: 0, y: 13, w: 16, h: 3  }, // chin
  ]);
  return [
    solid(zc(z, "headSide")),   // +X right
    solid(zc(z, "headSide")),   // -X left
    solid(zc(z, "hairTop")),    // +Y top
    solid(zc(z, "faceSkin")),   // -Y bottom (chin underside)
    canvas(frontTex),           // +Z front
    solid(zc(z, "hairBack")),   // -Z back
  ];
}

export function buildBodyMaterials(z: AvatarAppearance): FaceMaterials {
  const frontTex = createZoneCanvasTexture(8, 12, [
    { color: zc(z, "collar"),     x: 0, y: 0, w: 8, h: 2 }, // collar
    { color: zc(z, "shirtFront"), x: 0, y: 2, w: 8, h: 5 }, // chest
    { color: zc(z, "shirtBelly"), x: 0, y: 7, w: 8, h: 5 }, // belly
  ]);
  return [
    solid(zc(z, "shirtSide")),   // +X right
    solid(zc(z, "shirtSide")),   // -X left
    solid(zc(z, "shoulderTop")), // +Y top
    solid(zc(z, "shirtBelly")),  // -Y bottom (hem, rarely visible)
    canvas(frontTex),            // +Z front
    solid(zc(z, "shirtBack")),   // -Z back
  ];
}

export function buildArmMaterials(z: AvatarAppearance): FaceMaterials {
  return [
    solid(zc(z, "sleeve")),      // +X right
    solid(zc(z, "sleeve")),      // -X left
    solid(zc(z, "shoulderCap")), // +Y top
    solid(zc(z, "sleeve")),      // -Y bottom (hidden under hand mesh)
    solid(zc(z, "sleeve")),      // +Z front
    solid(zc(z, "sleeve")),      // -Z back
  ];
}

export function buildHandMaterials(z: AvatarAppearance): FaceMaterials {
  return [
    solid(zc(z, "hand")), // +X right
    solid(zc(z, "hand")), // -X left
    solid(zc(z, "hand")), // +Y top (hidden inside sleeve)
    solid(zc(z, "hand")), // -Y bottom
    solid(zc(z, "hand")), // +Z front
    solid(zc(z, "hand")), // -Z back
  ];
}

export function buildLegMaterials(z: AvatarAppearance): FaceMaterials {
  const frontTex = createZoneCanvasTexture(4, 12, [
    { color: zc(z, "thigh"), x: 0, y: 0, w: 4, h: 6 }, // upper leg
    { color: zc(z, "shin"),  x: 0, y: 6, w: 4, h: 6 }, // lower leg
  ]);
  return [
    solid(zc(z, "legSide")), // +X right
    solid(zc(z, "legSide")), // -X left
    solid(zc(z, "legSide")), // +Y top (hidden inside body)
    solid(zc(z, "legSide")), // -Y bottom (hidden inside foot)
    canvas(frontTex),        // +Z front
    solid(zc(z, "legSide")), // -Z back
  ];
}

export function buildFootMaterials(z: AvatarAppearance): FaceMaterials {
  return [
    solid(zc(z, "shoeSide")), // +X right
    solid(zc(z, "shoeSide")), // -X left
    solid(zc(z, "shoeTop")),  // +Y top
    solid(zc(z, "shoeSole")), // -Y bottom
    solid(zc(z, "shoeToe")),  // +Z front (toe cap)
    solid(zc(z, "shoeSide")), // -Z back (heel)
  ];
}

// ─── Update functions (called imperatively when appearance changes) ─────────
// Mutates the existing material array in-place — no allocation, no remount.

export function updateHeadMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  mats[0].color.set(zc(z, "headSide"));
  mats[1].color.set(zc(z, "headSide"));
  mats[2].color.set(zc(z, "hairTop"));
  mats[3].color.set(zc(z, "faceSkin"));
  updateZoneCanvasTexture(mats[4].map as CanvasTexture, [
    { color: zc(z, "hairFront"),  x: 0, y: 0,  w: 16, h: 3  },
    { color: zc(z, "faceSkin"),   x: 0, y: 3,  w: 16, h: 10 },
    { color: zc(z, "faceAccent"), x: 0, y: 13, w: 16, h: 3  },
  ]);
  mats[5].color.set(zc(z, "hairBack"));
}

export function updateBodyMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  mats[0].color.set(zc(z, "shirtSide"));
  mats[1].color.set(zc(z, "shirtSide"));
  mats[2].color.set(zc(z, "shoulderTop"));
  mats[3].color.set(zc(z, "shirtBelly"));
  updateZoneCanvasTexture(mats[4].map as CanvasTexture, [
    { color: zc(z, "collar"),     x: 0, y: 0, w: 8, h: 2 },
    { color: zc(z, "shirtFront"), x: 0, y: 2, w: 8, h: 5 },
    { color: zc(z, "shirtBelly"), x: 0, y: 7, w: 8, h: 5 },
  ]);
  mats[5].color.set(zc(z, "shirtBack"));
}

export function updateArmMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  mats[0].color.set(zc(z, "sleeve"));
  mats[1].color.set(zc(z, "sleeve"));
  mats[2].color.set(zc(z, "shoulderCap"));
  mats[3].color.set(zc(z, "sleeve"));
  mats[4].color.set(zc(z, "sleeve"));
  mats[5].color.set(zc(z, "sleeve"));
}

export function updateHandMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  for (const mat of mats) mat.color.set(zc(z, "hand"));
}

export function updateLegMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  mats[0].color.set(zc(z, "legSide"));
  mats[1].color.set(zc(z, "legSide"));
  mats[2].color.set(zc(z, "legSide"));
  mats[3].color.set(zc(z, "legSide"));
  updateZoneCanvasTexture(mats[4].map as CanvasTexture, [
    { color: zc(z, "thigh"), x: 0, y: 0, w: 4, h: 6 },
    { color: zc(z, "shin"),  x: 0, y: 6, w: 4, h: 6 },
  ]);
  mats[5].color.set(zc(z, "legSide"));
}

export function updateFootMaterials(mats: FaceMaterials, z: AvatarAppearance): void {
  mats[0].color.set(zc(z, "shoeSide"));
  mats[1].color.set(zc(z, "shoeSide"));
  mats[2].color.set(zc(z, "shoeTop"));
  mats[3].color.set(zc(z, "shoeSole"));
  mats[4].color.set(zc(z, "shoeToe"));
  mats[5].color.set(zc(z, "shoeSide"));
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
