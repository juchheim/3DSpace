import type {
  AvatarAccessoryAdjustment,
  AvatarAccessoryCatalogEntry,
  AvatarEquippedAccessories
} from "@3dspace/contracts";

export const ZERO_VECTOR = { x: 0, y: 0, z: 0 } as const;

export type NormalizedAccessoryAdjustment = {
  positionOffset: { x: number; y: number; z: number };
  rotationOffset: { x: number; y: number; z: number };
  scaleOffset: number;
};

export const DEFAULT_ACCESSORY_ADJUSTMENT: NormalizedAccessoryAdjustment = {
  positionOffset: { ...ZERO_VECTOR },
  rotationOffset: { ...ZERO_VECTOR },
  scaleOffset: 0
};

export const ACCESSORY_ADJUSTMENT_LIMITS = {
  position: { min: -0.12, max: 0.12, step: 0.005 },
  scale: { min: -1.2, max: 1.2, step: 0.05 },
  tiltDeg: { min: -35, max: 35, step: 1 },
  turnDeg: { min: -90, max: 90, step: 1 }
} as const;

export function normalizeAccessoryAdjustment(
  adjustment?: AvatarAccessoryAdjustment | null
): NormalizedAccessoryAdjustment {
  return {
    positionOffset: {
      x: adjustment?.positionOffset?.x ?? 0,
      y: adjustment?.positionOffset?.y ?? 0,
      z: adjustment?.positionOffset?.z ?? 0
    },
    rotationOffset: {
      x: adjustment?.rotationOffset?.x ?? 0,
      y: adjustment?.rotationOffset?.y ?? 0,
      z: adjustment?.rotationOffset?.z ?? 0
    },
    scaleOffset: adjustment?.scaleOffset ?? 0
  };
}

export function getAccessoryAdjustment(
  equipped: AvatarEquippedAccessories,
  slug: string
): NormalizedAccessoryAdjustment {
  return normalizeAccessoryAdjustment(equipped.adjustments?.[slug]);
}

export function accessoryAdjustmentIsDefault(adjustment: AvatarAccessoryAdjustment): boolean {
  const normalized = normalizeAccessoryAdjustment(adjustment);
  return (
    normalized.positionOffset.x === 0 &&
    normalized.positionOffset.y === 0 &&
    normalized.positionOffset.z === 0 &&
    normalized.rotationOffset.x === 0 &&
    normalized.rotationOffset.y === 0 &&
    normalized.rotationOffset.z === 0 &&
    normalized.scaleOffset === 0
  );
}

export function resolveAccessoryEntry(
  entry: AvatarAccessoryCatalogEntry,
  adjustment?: AvatarAccessoryAdjustment | null
): AvatarAccessoryCatalogEntry {
  const normalized = normalizeAccessoryAdjustment(adjustment);
  const scale = entry.localScale + normalized.scaleOffset;
  return {
    ...entry,
    localPosition: {
      x: entry.localPosition.x + normalized.positionOffset.x,
      y: entry.localPosition.y + normalized.positionOffset.y,
      z: entry.localPosition.z + normalized.positionOffset.z
    },
    localRotation: {
      x: entry.localRotation.x + normalized.rotationOffset.x,
      y: entry.localRotation.y + normalized.rotationOffset.y,
      z: entry.localRotation.z + normalized.rotationOffset.z
    },
    localScale: scale > 0 ? scale : entry.localScale
  };
}

export function stripEmptyAccessoryAdjustments(
  equipped: AvatarEquippedAccessories
): AvatarEquippedAccessories {
  const adjustments = Object.fromEntries(
    Object.entries(equipped.adjustments ?? {}).filter(([, value]) => !accessoryAdjustmentIsDefault(value))
  );
  if (Object.keys(adjustments).length === 0) {
    const { adjustments: _removed, ...rest } = equipped;
    return rest;
  }
  return { ...equipped, adjustments };
}
