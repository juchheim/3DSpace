import type { AvatarAccessoryCatalogEntry } from "@3dspace/contracts";
import type { Object3D } from "three";
import { findBone } from "./AvatarAccessoryGlb";

export type HairSuppressionRule = {
  bone: Object3D;
  scale: number;
};

/** Resolve catalog rules to live skeleton bones on a cloned avatar instance. */
export function collectHairSuppressionRules(
  root: Object3D,
  entries: readonly AvatarAccessoryCatalogEntry[]
): HairSuppressionRule[] {
  const rules: HairSuppressionRule[] = [];
  const seen = new Set<Object3D>();

  for (const entry of entries) {
    for (const rule of entry.hairSuppressionBones ?? []) {
      const bone = findBone(root, rule.bone);
      if (!bone || seen.has(bone)) continue;
      seen.add(bone);
      rules.push({ bone, scale: rule.scale });
    }
  }

  return rules;
}

/** Re-apply each frame after the animation mixer updates bone transforms. */
export function applyHairSuppressionRules(rules: readonly HairSuppressionRule[]): void {
  for (const { bone, scale } of rules) {
    bone.scale.setScalar(scale);
  }
}

export function restoreHairSuppressionRules(rules: readonly HairSuppressionRule[]): void {
  for (const { bone } of rules) {
    bone.scale.setScalar(1);
  }
}
