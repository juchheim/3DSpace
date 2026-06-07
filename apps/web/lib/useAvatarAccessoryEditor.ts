import { useState } from "react";
import type { AvatarEquippedAccessories } from "@3dspace/contracts";
import {
  getAccessoryAdjustment,
  stripEmptyAccessoryAdjustments,
  type NormalizedAccessoryAdjustment
} from "./avatarAccessoryAdjustments";

function accessoriesEqual(a: AvatarEquippedAccessories, b: AvatarEquippedAccessories) {
  return JSON.stringify(stripEmptyAccessoryAdjustments(a)) === JSON.stringify(stripEmptyAccessoryAdjustments(b));
}

export function useAvatarAccessoryEditor(savedAccessories: AvatarEquippedAccessories) {
  const [draft, setDraft] = useState<AvatarEquippedAccessories>(savedAccessories);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const dirty = !accessoriesEqual(draft, savedAccessories);

  function setHead(slug: string | null) {
    setDraft((prev) => ({ ...prev, head: slug }));
  }

  function setHands(slug: string | null) {
    setDraft((prev) => ({ ...prev, hands: slug }));
  }

  function setAdjustment(slug: string, adjustment: NormalizedAccessoryAdjustment) {
    setDraft((prev) => ({
      ...prev,
      adjustments: { ...(prev.adjustments ?? {}), [slug]: adjustment }
    }));
  }

  function resetAdjustment(slug: string) {
    setDraft((prev) => {
      if (!prev.adjustments?.[slug]) return prev;
      const nextAdjustments = { ...prev.adjustments };
      delete nextAdjustments[slug];
      if (Object.keys(nextAdjustments).length === 0) {
        const { adjustments: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, adjustments: nextAdjustments };
    });
  }

  function resetDraft() {
    setDraft(savedAccessories);
    setSaveError("");
  }

  async function save(onSave: (accessories: AvatarEquippedAccessories) => Promise<void>): Promise<boolean> {
    setSaving(true);
    setSaveError("");
    try {
      await onSave(stripEmptyAccessoryAdjustments(draft));
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    draft,
    dirty,
    saving,
    saveError,
    setHead,
    setHands,
    getAdjustment: (slug: string) => getAccessoryAdjustment(draft, slug),
    setAdjustment,
    resetAdjustment,
    resetDraft,
    save
  };
}
