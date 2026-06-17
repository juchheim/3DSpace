import { describe, expect, it } from "vitest";
import { chairSeatPose, findNearestChair, findNearestPodium } from "../lib/usePlacedChairs";

describe("usePlacedChairs", () => {
  it("finds a chair within range on the XZ plane", () => {
    const chair = {
      id: "c1",
      slug: "folding-chair",
      position: { x: 5, y: 0, z: 5 },
      yaw: 0
    };
    expect(findNearestChair({ x: 5.4, z: 5.1 }, [chair], 1.5)?.id).toBe("c1");
    expect(findNearestChair({ x: 8, z: 5 }, [chair], 1.5)).toBeNull();
  });

  it("aligns the seat pose with the chair yaw", () => {
    const chair = {
      id: "c1",
      slug: "folding-chair",
      position: { x: 2, y: 0, z: 3 },
      yaw: Math.PI / 2
    };
    const pose = chairSeatPose(chair);
    expect(pose.rotationY).toBeCloseTo(chair.yaw, 5);
    expect(pose.position.x).toBeCloseTo(2 + 0.42, 5);
    expect(pose.position.z).toBeCloseTo(3, 5);
  });

  it("finds a custom asset classified as a chair, but not one classified as a podium", () => {
    const customChair = {
      id: "cc",
      slug: "ca-1",
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      custom: { glbUrl: "x.glb", placement: "other", objectRole: "chair" } as const
    };
    const customPodium = { ...customChair, id: "cp", custom: { ...customChair.custom, objectRole: "podium" } };
    expect(findNearestChair({ x: 0.2, z: 0 }, [customChair], 1.5)?.id).toBe("cc");
    expect(findNearestChair({ x: 0.2, z: 0 }, [customPodium], 1.5)).toBeNull();
    expect(findNearestPodium({ x: 0.2, z: 0 }, [customPodium], 1.5)?.id).toBe("cp");
    expect(findNearestPodium({ x: 0.2, z: 0 }, [customChair], 1.5)).toBeNull();
  });
});
