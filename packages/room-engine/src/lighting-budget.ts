export type LightBudgetTier = {
  maxActive: number;
  maxShadowCasters: number;
  maxAreaLights: number;
  shadowMapSize: number;
  softShadows: boolean;
};

export const LIGHTING_BUDGET: Record<"low" | "medium" | "high", LightBudgetTier> = {
  low:    { maxActive: 4,  maxShadowCasters: 0, maxAreaLights: 0, shadowMapSize: 0,    softShadows: false },
  medium: { maxActive: 8,  maxShadowCasters: 1, maxAreaLights: 1, shadowMapSize: 1024, softShadows: false },
  high:   { maxActive: 12, maxShadowCasters: 3, maxAreaLights: 2, shadowMapSize: 2048, softShadows: true  },
};

export function selectActiveLights<T extends { id: string; position: { x: number; y: number; z: number }; enabled?: boolean }>(
  items: T[],
  cameraPos: { x: number; y: number; z: number },
  maxActive: number
): T[] {
  const enabled = items.filter((item) => item.enabled !== false);
  return [...enabled]
    .sort((a, b) => {
      const distSq = (p: { x: number; y: number; z: number }) =>
        (p.x - cameraPos.x) ** 2 + (p.y - cameraPos.y) ** 2 + (p.z - cameraPos.z) ** 2;
      return distSq(a.position) - distSq(b.position);
    })
    .slice(0, maxActive);
}
