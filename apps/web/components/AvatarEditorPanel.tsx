"use client";

import { useEffect, useRef, useState } from "react";
import type { AvatarAppearance } from "@3dspace/contracts";
import { ZONE_GROUPS, ZONE_LABELS } from "../lib/avatarMaterials";
import { useAvatarEditor } from "../lib/useAvatarEditor";

type Props = {
  savedAppearance: AvatarAppearance;
  onSave: (appearance: AvatarAppearance) => Promise<void>;
  onDraftChange: (draft: AvatarAppearance) => void;
  onClose: () => void;
  onTriggerWave: () => void;
  waveActive: boolean;
  locked: boolean;
};

export function AvatarEditorPanel({
  savedAppearance,
  onSave,
  onDraftChange,
  onClose,
  onTriggerWave,
  waveActive,
  locked,
}: Props) {
  const { draft, dirty, saving, saveError, setZone, resetDraft, save } =
    useAvatarEditor(savedAppearance);

  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["Head"])
  );

  // Propagate draft changes up for live preview
  useEffect(() => {
    onDraftChange(draft);
  }, [draft, onDraftChange]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleSection(label: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  return (
    <div className="avatar-editor__panel hud-panel" role="dialog" aria-label="Avatar editor">
      {/* Header */}
      <div className="avatar-editor__header">
        <span className="avatar-editor__title">Your Avatar</span>
        <button
          className="avatar-editor__close-btn"
          onClick={onClose}
          aria-label="Close avatar editor"
        >
          ×
        </button>
      </div>

      {/* Lock banner */}
      {locked ? (
        <div className="avatar-editor__lock-banner">
          Avatar editing is paused during this lesson.
        </div>
      ) : null}

      {/* Zone list */}
      <div className="avatar-editor__body">
        {ZONE_GROUPS.map(group => {
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
                  {group.keys.map(key => (
                    <ZoneRow
                      key={key}
                      zoneKey={key}
                      label={ZONE_LABELS[key]}
                      value={draft[key]}
                      {...(locked ? {} : { onChange: setZone })}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="avatar-editor__footer">
        <button
          className="avatar-editor__wave-btn"
          onClick={onTriggerWave}
          disabled={waveActive || locked}
        >
          {waveActive ? "Waving..." : "Wave 👋"}
        </button>
        <div className="avatar-editor__footer-actions">
          {dirty && !locked ? (
            <button
              className="avatar-editor__reset-btn"
              onClick={resetDraft}
              disabled={saving}
            >
              Reset
            </button>
          ) : null}
          {!locked ? (
            <button
              className={`avatar-editor__save-btn${saving ? " avatar-editor__save-btn--saving" : ""}`}
              onClick={() => void save(onSave)}
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
        {saveError ? (
          <p className="avatar-editor__save-error">{saveError}</p>
        ) : null}
      </div>
    </div>
  );
}

function ZoneRow({
  zoneKey,
  label,
  value,
  onChange,
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
        onChange={onChange ? e => onChange(zoneKey, e.target.value) : undefined}
        readOnly={!onChange}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
        tabIndex={-1}
      />
    </div>
  );
}
