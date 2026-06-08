import { describe, expect, it } from "vitest";
import { chairSeatPose, findNearestChair } from "../lib/usePlacedChairs";

describe("usePlacedChairs", () => {
  it("finds a chair within range on the XZ plane", () => {
    const chair = {
      id: "c1",
      position: { x: 5, y: 0, z: 5 },
      yaw: 0
    };
    expect(findNearestChair({ x: 5.4, z: 5.1 }, [chair], 1.5)?.id).toBe("c1");
    expect(findNearestChair({ x: 8, z: 5 }, [chair], 1.5)).toBeNull();
  });

  it("aligns the seat pose with the chair yaw", () => {
    const chair = {
      id: "c1",
      position: { x: 2, y: 0, z: 3 },
      yaw: Math.PI / 2
    };
    const pose = chairSeatPose(chair);
    expect(pose.rotationY).toBeCloseTo(chair.yaw, 5);
    expect(pose.position.x).toBeCloseTo(2 + 0.42, 5);
    expect(pose.position.z).toBeCloseTo(3, 5);
  });
});
