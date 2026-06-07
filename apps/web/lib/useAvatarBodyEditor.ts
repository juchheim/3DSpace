import { useState } from "react";
import type { AvatarBodySlug } from "@3dspace/contracts";

export function useAvatarBodyEditor(savedBodySlug: AvatarBodySlug) {
  const [draft, setDraft] = useState<AvatarBodySlug>(savedBodySlug);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const dirty = draft !== savedBodySlug;

  function setBodySlug(bodySlug: AvatarBodySlug) {
    setDraft(bodySlug);
  }

  function resetDraft() {
    setDraft(savedBodySlug);
    setSaveError("");
  }

  async function save(onSave: (bodySlug: AvatarBodySlug) => Promise<void>): Promise<boolean> {
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

  return {
    draft,
    dirty,
    saving,
    saveError,
    setBodySlug,
    resetDraft,
    save
  };
}
