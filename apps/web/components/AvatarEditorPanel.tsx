"use client";

import { useEffect, useRef, useState } from "react";
import type { AvatarAppearance, AvatarAccessoryCatalogEntry, AvatarEquippedAccessories } from "@3dspace/contracts";
import { ZONE_GROUPS, ZONE_LABELS } from "../lib/avatarMaterials";
import { useAvatarAccessoryEditor } from "../lib/useAvatarAccessoryEditor";
import { useAvatarEditor } from "../lib/useAvatarEditor";
import { BUILTIN_AVATAR_ACCESSORY_CATALOG } from "../lib/avatarAccessoryCatalog";
import { CLIENT_TUNING } from "../lib/config";
import { AccessoryAdjustPanel } from "./avatarAccessories/AccessoryAdjustPanel";

type Props = {
  savedAppearance: AvatarAppearance;
  onSave: (appearance: AvatarAppearance) => Promise<void>;
  onDraftChange: (draft: AvatarAppearance, dirty: boolean) => void;
  savedAccessories?: AvatarEquippedAccessories;
  onSaveAccessories?: (accessories: AvatarEquippedAccessories) => Promise<void>;
  onDraftAccessoriesChange?: (draft: AvatarEquippedAccessories) => void;
  accessoryCatalog?: AvatarAccessoryCatalogEntry[];
  onClose: () => void;
  onTriggerWave: () => void;
  waveActive: boolean;
  locked: boolean;
};

export function AvatarEditorPanel({
  savedAppearance,
  onSave,
  onDraftChange,
  savedAccessories,
  onSaveAccessories,
  onDraftAccessoriesChange,
  accessoryCatalog = BUILTIN_AVATAR_ACCESSORY_CATALOG,
  onClose,
  onTriggerWave,
  waveActive,
  locked,
}: Props) {
  const accessoriesEnabled =
    CLIENT_TUNING.enableAvatarAccessories &&
    savedAccessories !== undefined &&
    onSaveAccessories !== undefined &&
    onDraftAccessoriesChange !== undefined;

  const appearanceEditor = useAvatarEditor(savedAppearance);
  const accessoryEditor = useAvatarAccessoryEditor(savedAccessories ?? { head: null, hands: null });

  const headCatalog = accessoryCatalog.filter((entry) => entry.slot === "head");
  const handsCatalog = accessoryCatalog.filter((entry) => entry.slot === "hands");
  const equippedHeadSlug = accessoriesEnabled ? accessoryEditor.draft.head : null;
  const equippedHandsSlug = accessoriesEnabled ? accessoryEditor.draft.hands : null;
  const equippedHeadEntry = equippedHeadSlug
    ? headCatalog.find((entry) => entry.slug === equippedHeadSlug)
    : undefined;
  const equippedHandsEntry = equippedHandsSlug
    ? handsCatalog.find((entry) => entry.slug === equippedHandsSlug)
    : undefined;
  const saving = appearanceEditor.saving || (accessoriesEnabled && accessoryEditor.saving);
  const dirty = appearanceEditor.dirty || (accessoriesEnabled && accessoryEditor.dirty);
  const saveError = appearanceEditor.saveError || (accessoriesEnabled ? accessoryEditor.saveError : "");

  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(accessoriesEnabled ? ["Accessories", "Head"] : ["Head"])
  );

  useEffect(() => {
    onDraftChange(appearanceEditor.draft, appearanceEditor.dirty);
  }, [appearanceEditor.draft, appearanceEditor.dirty, onDraftChange]);

  useEffect(() => {
    if (!accessoriesEnabled) return;
    onDraftAccessoriesChange(accessoryEditor.draft);
  }, [accessoriesEnabled, accessoryEditor.draft, onDraftAccessoriesChange]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleSection(label: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  async function handleSave() {
    if (locked || saving || !dirty) return;
    if (appearanceEditor.dirty) {
      const ok = await appearanceEditor.save(onSave);
      if (!ok) return;
    }
    if (accessoriesEnabled && accessoryEditor.dirty) {
      await accessoryEditor.save(onSaveAccessories);
    }
  }

  function handleReset() {
    if (locked || saving) return;
    if (appearanceEditor.dirty) appearanceEditor.resetDraft();
    if (accessoriesEnabled && accessoryEditor.dirty) accessoryEditor.resetDraft();
  }

  return (
    <div className="avatar-editor__panel hud-panel" role="dialog" aria-label="Avatar editor">
      <div className="avatar-editor__header">
        <span className="avatar-editor__title">Your Avatar</span>
        <button className="avatar-editor__close-btn" onClick={onClose} aria-label="Close avatar editor">
          ×
        </button>
      </div>

      {locked ? (
        <div className="avatar-editor__lock-banner">Avatar editing is paused during this lesson.</div>
      ) : null}

      <div className="avatar-editor__body">
        {accessoriesEnabled ? (
          <div
            className={`avatar-editor__section${openSections.has("Accessories") ? " avatar-editor__section--open" : ""}`}
          >
            <button
              className="avatar-editor__section-header"
              onClick={() => toggleSection("Accessories")}
              aria-expanded={openSections.has("Accessories")}
            >
              <span className="avatar-editor__section-arrow">{openSections.has("Accessories") ? "▾" : "▸"}</span>
              Accessories
            </button>
            {openSections.has("Accessories") ? (
              <div className="avatar-editor__accessory-list">
                <p className="avatar-editor__accessory-slot-label">Head</p>
                <div className="avatar-editor__accessory-options">
                  <AccessoryOption
                    label="None"
                    checked={accessoryEditor.draft.head == null}
                    disabled={locked}
                    onSelect={() => accessoryEditor.setHead(null)}
                    radioName="avatar-accessory-head"
                  />
                  {headCatalog.map((entry) => (
                    <AccessoryOption
                      key={entry.slug}
                      label={entry.displayName}
                      checked={accessoryEditor.draft.head === entry.slug}
                      disabled={locked}
                      onSelect={() => accessoryEditor.setHead(entry.slug)}
                      radioName="avatar-accessory-head"
                      {...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {})}
                    />
                  ))}
                </div>
                {equippedHeadSlug && equippedHeadEntry ? (
                  <AccessoryAdjustPanel
                    displayName={equippedHeadEntry.displayName}
                    adjustment={accessoryEditor.getAdjustment(equippedHeadSlug)}
                    disabled={locked}
                    onChange={(next) => accessoryEditor.setAdjustment(equippedHeadSlug, next)}
                    onReset={() => accessoryEditor.resetAdjustment(equippedHeadSlug)}
                  />
                ) : null}

                <p className="avatar-editor__accessory-slot-label">Hands</p>
                <div className="avatar-editor__accessory-options">
                  <AccessoryOption
                    label="None"
                    checked={accessoryEditor.draft.hands == null}
                    disabled={locked}
                    onSelect={() => accessoryEditor.setHands(null)}
                    radioName="avatar-accessory-hands"
                  />
                  {handsCatalog.map((entry) => (
                    <AccessoryOption
                      key={entry.slug}
                      label={entry.displayName}
                      checked={accessoryEditor.draft.hands === entry.slug}
                      disabled={locked}
                      onSelect={() => accessoryEditor.setHands(entry.slug)}
                      radioName="avatar-accessory-hands"
                      {...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {})}
                    />
                  ))}
                </div>
                {equippedHandsSlug && equippedHandsEntry ? (
                  <AccessoryAdjustPanel
                    displayName={equippedHandsEntry.displayName}
                    adjustment={accessoryEditor.getAdjustment(equippedHandsSlug)}
                    disabled={locked}
                    onChange={(next) => accessoryEditor.setAdjustment(equippedHandsSlug, next)}
                    onReset={() => accessoryEditor.resetAdjustment(equippedHandsSlug)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {ZONE_GROUPS.map((group) => {
          const isOpen = openSections.has(group.label);
          return (
            <div
              key={group.label}
              className={`avatar-editor__section${isOpen ? " avatar-editor__section--open" : ""}`}
            >
              <button
                className="avatar-editor__section-header"
                onClick={() => toggleSection(group.label)}
                aria-expanded={isOpen}
              >
                <span className="avatar-editor__section-arrow">{isOpen ? "▾" : "▸"}</span>
                {group.label}
              </button>
              {isOpen ? (
                <div className="avatar-editor__zone-list">
                  {group.keys.map((key) => (
                    <ZoneRow
                      key={key}
                      zoneKey={key}
                      label={ZONE_LABELS[key]}
                      value={appearanceEditor.draft[key]}
                      {...(locked ? {} : { onChange: appearanceEditor.setZone })}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="avatar-editor__footer">
        <button className="avatar-editor__wave-btn" onClick={onTriggerWave} disabled={waveActive || locked}>
          {waveActive ? "Waving..." : "Wave 👋"}
        </button>
        <div className="avatar-editor__footer-actions">
          {dirty && !locked ? (
            <button className="avatar-editor__reset-btn" onClick={handleReset} disabled={saving}>
              Reset
            </button>
          ) : null}
          {!locked ? (
            <button
              className={`avatar-editor__save-btn${saving ? " avatar-editor__save-btn--saving" : ""}`}
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
        {saveError ? <p className="avatar-editor__save-error">{saveError}</p> : null}
      </div>
    </div>
  );
}

function AccessoryOption({
  label,
  checked,
  disabled,
  onSelect,
  thumbnailUrl,
  radioName
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  thumbnailUrl?: string;
  radioName: string;
}) {
  return (
    <label className={`avatar-editor__accessory-option${checked ? " avatar-editor__accessory-option--selected" : ""}`}>
      <input
        type="radio"
        name={radioName}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      {thumbnailUrl ? (
        <img className="avatar-editor__accessory-thumb" src={thumbnailUrl} alt="" aria-hidden="true" />
      ) : (
        <span className="avatar-editor__accessory-thumb avatar-editor__accessory-thumb--placeholder" aria-hidden="true" />
      )}
      <span>{label}</span>
    </label>
  );
}

function ZoneRow({
  zoneKey,
  label,
  value,
  onChange
}: {
  zoneKey: keyof AvatarAppearance;
  label: string;
  value: string;
  onChange?: (key: keyof AvatarAppearance, color: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="avatar-editor__zone-row">
      <span className="avatar-editor__zone-label">{label}</span>
      <button
        className="avatar-editor__swatch"
        style={{ background: value }}
        onClick={() => inputRef.current?.click()}
        aria-label={`Pick color for ${label}`}
        disabled={!onChange}
      />
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={onChange ? (e) => onChange(zoneKey, e.target.value) : undefined}
        readOnly={!onChange}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
        tabIndex={-1}
      />
    </div>
  );
}
