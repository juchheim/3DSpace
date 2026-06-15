// @vitest-environment happy-dom

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BUILD_LEVEL_HEIGHT } from "@3dspace/room-engine";
import { useStablePlacementLevel } from "../lib/useStablePlacementLevel";

/** y for a given level fraction (0 = ground line, 1 = one level up). */
const yAt = (levelFraction: number) => levelFraction * BUILD_LEVEL_HEIGHT;

describe("useStablePlacementLevel", () => {
  it("reports the avatar's level on mount", () => {
    const { result } = renderHook(({ y }) => useStablePlacementLevel(y), {
      initialProps: { y: yAt(1.1) }
    });
    expect(result.current).toBe(1);
  });

  it("holds the level inside the hysteresis band past the midpoint", () => {
    const { result, rerender } = renderHook(({ y }) => useStablePlacementLevel(y), {
      initialProps: { y: yAt(0) }
    });
    expect(result.current).toBe(0);
    // raw 0.6 rounds to level 1, but it's inside the band (< 0.5 + 0.18) — stay at 0.
    act(() => rerender({ y: yAt(0.6) }));
    expect(result.current).toBe(0);
  });

  it("switches level once the avatar clears the band", () => {
    const { result, rerender } = renderHook(({ y }) => useStablePlacementLevel(y), {
      initialProps: { y: yAt(0) }
    });
    act(() => rerender({ y: yAt(0.7) }));
    expect(result.current).toBe(1);
  });

  it("damps downward transitions too", () => {
    const { result, rerender } = renderHook(({ y }) => useStablePlacementLevel(y), {
      initialProps: { y: yAt(1) }
    });
    expect(result.current).toBe(1);
    // raw 0.45 rounds to 0, but within the downward band (> 0.5 - 0.18) — hold at 1.
    act(() => rerender({ y: yAt(0.45) }));
    expect(result.current).toBe(1);
    act(() => rerender({ y: yAt(0.3) }));
    expect(result.current).toBe(0);
  });

  it("snaps immediately on a large jump (teleport / respawn)", () => {
    const { result, rerender } = renderHook(({ y }) => useStablePlacementLevel(y), {
      initialProps: { y: yAt(0) }
    });
    act(() => rerender({ y: yAt(3) }));
    expect(result.current).toBe(3);
  });
});
