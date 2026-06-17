import { describe, it, expect } from "vitest";
import { selectActiveLights, LIGHTING_BUDGET } from "@3dspace/room-engine";

describe("selectActiveLights", () => {
  const cam = { x: 0, y: 0, z: 0 };
  const mkLight = (id: string, x: number, enabled = true) => ({
    id,
    position: { x, y: 0, z: 0 },
    enabled,
  });

  it("returns at most maxActive lights", () => {
    const lights = Array.from({ length: 20 }, (_, i) => mkLight(`l${i}`, i));
    const result = selectActiveLights(lights, cam, 8);
    expect(result.length).toBe(8);
  });

  it("sorts by distance to camera", () => {
    const lights = [mkLight("far", 100), mkLight("near", 1)];
    const result = selectActiveLights(lights, cam, 2);
    expect(result[0]?.id).toBe("near");
  });

  it("excludes disabled lights", () => {
    const lights = [mkLight("on", 1, true), mkLight("off", 2, false)];
    const result = selectActiveLights(lights, cam, 10);
    expect(result.every((l) => l.enabled !== false)).toBe(true);
  });

  it("low budget caps at 4", () => {
    expect(LIGHTING_BUDGET.low.maxActive).toBe(4);
  });

  it("high budget allows 12 active lights", () => {
    expect(LIGHTING_BUDGET.high.maxActive).toBe(12);
  });

  it("returns empty when no lights", () => {
    expect(selectActiveLights([], cam, 8)).toHaveLength(0);
  });
});
