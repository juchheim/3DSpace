// @vitest-environment happy-dom

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStanding } from "../lib/useStanding";
import type { PlacedChair } from "../lib/usePlacedChairs";

const podium: PlacedChair = {
  id: "podium-1",
  slug: "podium",
  position: { x: 10, y: 0, z: 10 },
  yaw: 0
};

const chair: PlacedChair = {
  id: "chair-1",
  slug: "folding-chair",
  position: { x: 10, y: 0, z: 10 },
  yaw: 0
};

describe("useStanding", () => {
  it("nearestPodium is null when avatar is far away", () => {
    const { result } = renderHook(() =>
      useStanding({
        assets: [podium],
        getAvatarPosition: () => ({ x: 0, y: 0, z: 0 })
      })
    );
    expect(result.current.nearestPodium).toBeNull();
    expect(result.current.engaged).toBe(false);
  });

  it("nearestPodium resolves when avatar is within range", () => {
    const { result } = renderHook(() =>
      useStanding({
        assets: [podium],
        getAvatarPosition: () => ({ x: 10.5, y: 0, z: 10.2 })
      })
    );
    expect(result.current.nearestPodium?.id).toBe("podium-1");
  });

  it("ignores non-podium assets", () => {
    const { result } = renderHook(() =>
      useStanding({
        assets: [chair],
        getAvatarPosition: () => ({ x: 10.2, y: 0, z: 10.1 })
      })
    );
    expect(result.current.nearestPodium).toBeNull();
  });

  it("engage near a podium sets locked position and yaw", () => {
    const { result } = renderHook(() =>
      useStanding({
        assets: [podium],
        getAvatarPosition: () => ({ x: 10.2, y: 0, z: 10.1 })
      })
    );

    act(() => {
      result.current.tryInteract();
    });

    expect(result.current.engaged).toBe(true);
    expect(result.current.standLockedPosition).not.toBeNull();
    expect(result.current.standYaw).toBeCloseTo(podium.yaw, 5);
    // Avatar stands behind the podium (yaw=0: forwardZ=1, so z is reduced)
    expect(result.current.standLockedPosition!.z).toBeLessThan(podium.position.z);
  });

  it("second tryInteract clears engaged state", () => {
    const { result } = renderHook(() =>
      useStanding({
        assets: [podium],
        getAvatarPosition: () => ({ x: 10.2, y: 0, z: 10.1 })
      })
    );

    act(() => {
      result.current.tryInteract();
    });
    expect(result.current.engaged).toBe(true);

    act(() => {
      result.current.tryInteract();
    });
    expect(result.current.engaged).toBe(false);
    expect(result.current.standLockedPosition).toBeNull();
    expect(result.current.standYaw).toBeNull();
  });

  it("tryInteract does nothing when not near a podium", () => {
    const { result } = renderHook(() =>
      useStanding({
        assets: [podium],
        getAvatarPosition: () => ({ x: 0, y: 0, z: 0 })
      })
    );

    act(() => {
      result.current.tryInteract();
    });
    expect(result.current.engaged).toBe(false);
  });

  it("respects radius: ignores podium just outside 1.5 m", () => {
    const { result } = renderHook(() =>
      useStanding({
        assets: [podium],
        getAvatarPosition: () => ({ x: 10, y: 0, z: 11.6 })
      })
    );
    expect(result.current.nearestPodium).toBeNull();
  });
});
