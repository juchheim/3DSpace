import { useState } from "react";
import type { AvatarAppearance } from "@3dspace/contracts";

export function useAvatarEditor(savedAppearance: AvatarAppearance) {
  const [draft, setDraft] = useState<AvatarAppearance>(savedAppearance);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedAppearance);

  function setZone(key: keyof AvatarAppearance, color: string) {
    setDraft(prev => ({ ...prev, [key]: color }));
  }

  function resetDraft() {
    setDraft(savedAppearance);
    setSaveError("");
  }

  async function save(onSave: (appearance: AvatarAppearance) => Promise<void>): Promise<boolean> {
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

  return { draft, dirty, saving, saveError, setZone, resetDraft, save };
}
