import type { AvatarAccessoryCatalogEntry } from "@3dspace/contracts";
import type { Object3D } from "three";
import { findBone } from "./AvatarAccessoryGlb";

/**
 * Azure Vanguard hair poof is weighted heavily to `head_end` (~24 cm above Head).
 * Scaling that bone down collapses volume that would poke through head-slot props.
 */
export function applyHairSuppression(
  root: Object3D,
  entries: readonly AvatarAccessoryCatalogEntry[]
): () => void {
  const restored: Array<{ bone: Object3D; scale: number }> = [];

  for (const entry of entries) {
    for (const rule of entry.hairSuppressionBones ?? []) {
      const bone = findBone(root, rule.bone);
      if (!bone) continue;
      if (!restored.some((item) => item.bone === bone)) {
        restored.push({ bone, scale: bone.scale.x });
      }
      bone.scale.setScalar(rule.scale);
    }
  }

  return () => {
    for (const { bone, scale } of restored) {
      bone.scale.setScalar(scale);
    }
  };
}
