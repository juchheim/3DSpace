import { describe, expect, it } from "vitest";
import type { AvatarAccessoryCatalogEntry } from "@3dspace/contracts";
import {
  accessoryAdjustmentIsDefault,
  getAccessoryAdjustment,
  normalizeAccessoryAdjustment,
  resolveAccessoryEntry,
  stripEmptyAccessoryAdjustments
} from "../lib/avatarAccessoryAdjustments";

const catalogEntry: AvatarAccessoryCatalogEntry = {
  slug: "bowler-hat",
  displayName: "Bowler hat",
  slot: "head",
  glbUrl: "/avatar-accessories/bowler-hat.glb",
  attachBone: "Head",
  localPosition: { x: 0, y: 0.145, z: -0.06 },
  localRotation: { x: 0, y: 0, z: 0 },
  localScale: 2.85
};

describe("avatarAccessoryAdjustments", () => {
  it("returns zero offsets by default", () => {
    expect(normalizeAccessoryAdjustment(undefined)).toEqual({
      positionOffset: { x: 0, y: 0, z: 0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
      scaleOffset: 0
    });
  });

  it("merges catalog defaults with user adjustments", () => {
    const resolved = resolveAccessoryEntry(catalogEntry, {
      positionOffset: { x: 0.01, y: -0.02, z: 0 },
      scaleOffset: 0.15
    });
    expect(resolved.localPosition.x).toBe(0.01);
    expect(resolved.localPosition.y).toBeCloseTo(0.125);
    expect(resolved.localPosition.z).toBe(-0.06);
    expect(resolved.localScale).toBeCloseTo(3);
  });

  it("reads per-slug adjustments from equipped state", () => {
    const equipped = {
      head: "bowler-hat",
      hands: null,
      adjustments: {
        "bowler-hat": { positionOffset: { x: 0, y: 0.01, z: 0 } }
      }
    };
    expect(getAccessoryAdjustment(equipped, "bowler-hat").positionOffset.y).toBeCloseTo(0.01);
  });

  it("strips empty adjustment records before save", () => {
    expect(
      stripEmptyAccessoryAdjustments({
        head: "bowler-hat",
        hands: null,
        adjustments: {
          "bowler-hat": { positionOffset: { x: 0, y: 0, z: 0 }, scaleOffset: 0 }
        }
      })
    ).toEqual({ head: "bowler-hat", hands: null });
    expect(accessoryAdjustmentIsDefault({ scaleOffset: 0 })).toBe(true);
  });
});
