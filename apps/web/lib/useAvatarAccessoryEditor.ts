import { useState } from "react";
import type { AvatarEquippedAccessories } from "@3dspace/contracts";

function accessoriesEqual(a: AvatarEquippedAccessories, b: AvatarEquippedAccessories) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useAvatarAccessoryEditor(savedAccessories: AvatarEquippedAccessories) {
  const [draft, setDraft] = useState<AvatarEquippedAccessories>(savedAccessories);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const dirty = !accessoriesEqual(draft, savedAccessories);

  function setHead(slug: string | null) {
    setDraft({ head: slug });
  }

  function resetDraft() {
    setDraft(savedAccessories);
    setSaveError("");
  }

  async function save(onSave: (accessories: AvatarEquippedAccessories) => Promise<void>): Promise<boolean> {
    setSaving(true);
    setSaveError("");
    try {
      await onSave(draft);
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { draft, dirty, saving, saveError, setHead, resetDraft, save };
}
