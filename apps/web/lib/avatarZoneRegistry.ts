import type { AvatarAppearance } from "@3dspace/contracts";
import { DEFAULT_APPEARANCE } from "./avatarAppearance";

export const AVATAR_ZONE_COUNT = 24;

export type AvatarZoneId =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23;

export const AVATAR_ZONE_BY_KEY: Record<keyof AvatarAppearance, AvatarZoneId> = {
  hairTop: 1,
  hairFront: 2,
  headSide: 3,
  hairBack: 4,
  faceSkin: 5,
  faceAccent: 6,
  collar: 7,
  shirtFront: 8,
  shirtBelly: 9,
  shirtBack: 10,
  shirtSide: 11,
  shoulderTop: 12,
  shoulderCap: 13,
  sleeve: 14,
  hand: 15,
  thigh: 16,
  shin: 17,
  legSide: 18,
  legBack: 19,
  shoeTop: 20,
  shoeToe: 21,
  shoeSide: 22,
  shoeSole: 23,
};

export const AVATAR_ZONE_KEY_BY_ID: Record<AvatarZoneId, keyof AvatarAppearance | null> = {
  0: null,
  1: "hairTop",
  2: "hairFront",
  3: "headSide",
  4: "hairBack",
  5: "faceSkin",
  6: "faceAccent",
  7: "collar",
  8: "shirtFront",
  9: "shirtBelly",
  10: "shirtBack",
  11: "shirtSide",
  12: "shoulderTop",
  13: "shoulderCap",
  14: "sleeve",
  15: "hand",
  16: "thigh",
  17: "shin",
  18: "legSide",
  19: "legBack",
  20: "shoeTop",
  21: "shoeToe",
  22: "shoeSide",
  23: "shoeSole",
};

function normalizeHexChannel(channel: string) {
  return channel.length === 1 ? channel + channel : channel;
}

function srgbToLinear(channel: number) {
  if (channel <= 0.04045) return channel / 12.92;
  return ((channel + 0.055) / 1.055) ** 2.4;
}

function normalizeHex(hex: string) {
  const trimmed = hex.trim().toLowerCase();
  const body = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (body.length === 3) {
    return `#${normalizeHexChannel(body[0] ?? "0")}${normalizeHexChannel(body[1] ?? "0")}${normalizeHexChannel(body[2] ?? "0")}`;
  }
  return `#${body.padEnd(6, "0").slice(0, 6)}`;
}

export function hexToLinearRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex);
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

export function appearanceToZoneColorArray(appearance: AvatarAppearance): Float32Array {
  const out = new Float32Array(AVATAR_ZONE_COUNT * 3);
  for (const [key, id] of Object.entries(AVATAR_ZONE_BY_KEY) as Array<[keyof AvatarAppearance, AvatarZoneId]>) {
    const [r, g, b] = hexToLinearRgb(appearance[key]);
    const offset = id * 3;
    out[offset] = r;
    out[offset + 1] = g;
    out[offset + 2] = b;
  }
  return out;
}

export function appearanceEqualsDefault(appearance: AvatarAppearance): boolean {
  for (const key of Object.keys(DEFAULT_APPEARANCE) as Array<keyof AvatarAppearance>) {
    if (normalizeHex(appearance[key]) !== normalizeHex(DEFAULT_APPEARANCE[key])) {
      return false;
    }
  }
  return true;
}
