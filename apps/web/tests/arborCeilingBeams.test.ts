import { describe, expect, it } from "vitest";
import { arborCeilingBeams } from "../lib/arborCeilingBeams";

describe("arborCeilingBeams", () => {
  it("returns perimeter and partial cross beams with an open center", () => {
    const beams = arborCeilingBeams();
    expect(beams.length).toBe(8);
    for (const beam of beams) {
      expect(beam.size.every((dim) => dim > 0)).toBe(true);
    }
    const maxArm = Math.max(...beams.map((beam) => Math.max(beam.size[0], beam.size[2])));
    expect(maxArm).toBeLessThan(2);
  });
});
