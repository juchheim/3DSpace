// @vitest-environment happy-dom

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSitting } from "../lib/useSitting";
import type { PlacedChair } from "../lib/usePlacedChairs";

const chair: PlacedChair = {
  id: "chair-1",
  position: { x: 10, y: 0, z: 10 },
  yaw: 0
};

describe("useSitting", () => {
  it("updates nearestChair when the avatar moves into range", () => {
    let avatarPosition: { x: number; y: number; z: number } | null = { x: 0, y: 0, z: 0 };
    const { result, rerender } = renderHook(() =>
      useSitting({
        chairs: [chair],
        getAvatarPosition: () => avatarPosition
      })
    );

    expect(result.current.nearestChair).toBeNull();

    avatarPosition = { x: 10.5, y: 0, z: 10.2 };
    rerender();

    expect(result.current.nearestChair?.id).toBe("chair-1");
  });

  it("starts sitting when tryInteract is called near a chair", () => {
    const avatarPosition = { x: 10.2, y: 0, z: 10.1 };
    const { result } = renderHook(() =>
      useSitting({
        chairs: [chair],
        getAvatarPosition: () => avatarPosition
      })
    );

    act(() => {
      result.current.tryInteract();
    });

    expect(result.current.sittingPhase).toBe("sitting");
    expect(result.current.seatYaw).toBeCloseTo(chair.yaw + Math.PI, 5);
    expect(result.current.seatLockedPosition?.x).toBeCloseTo(chair.position.x, 5);
    expect(result.current.seatLockedPosition?.z).toBeCloseTo(chair.position.z - 0.14, 5);
  });
});
