"use client";

/**
 * EnvironmentPicker — modal grid for choosing a world skin.
 *
 * Rendered by EnvironmentCard when the teacher clicks "Change…".
 * Fetches the catalog via useWorldSkinCatalog (cached, soft-refreshes every 30 s).
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { WORLD_SKIN_DEFAULT_THEATER_SLUG, type WorldSkin } from "@3dspace/contracts";
import type { ApiIdentity } from "../lib/identity";
import { useWorldSkinCatalog } from "../lib/useWorldSkinCatalog";

type Props = {
  identity: ApiIdentity;
  currentSkinId: string | null;
  /** Called with the selected slug, or null for "Default theater". Caller closes the modal. */
  onSelect: (skinId: string | null) => Promise<void>;
  onClose: () => void;
};

export function EnvironmentPicker({ identity, currentSkinId, onSelect, onClose }: Props) {
  const { skins, loading, error } = useWorldSkinCatalog(identity);
  const defaultSkin = skins.find((skin) => skin.slug === WORLD_SKIN_DEFAULT_THEATER_SLUG);
  const themedSkins = skins.filter((skin) => skin.slug !== WORLD_SKIN_DEFAULT_THEATER_SLUG);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isDefaultActive =
    currentSkinId === null || currentSkinId === WORLD_SKIN_DEFAULT_THEATER_SLUG;

  async function pick(skinId: string | null) {
    setBusy(true);
    setActionError(null);
    try {
      await onSelect(skinId);
      onClose();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not apply environment — please try again."
      );
      setBusy(false);
    }
  }

  const content = (
    /* Backdrop — rendered via createPortal onto document.body so it is not
       clipped or repositioned by the .hud-panel { backdrop-filter } ancestor. */
    <div
      className="environment-picker"
      role="dialog"
      aria-modal="true"
      aria-label="Choose environment"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="environment-picker__dialog">
        <div className="environment-picker__header">
          <span className="environment-picker__title">Choose environment</span>
          <button
            type="button"
            className="environment-picker__close"
            aria-label="Close picker"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {actionError ? (
          <p className="environment-picker__status environment-picker__status--error">{actionError}</p>
        ) : null}

        {loading && skins.length === 0 ? (
          <p className="environment-picker__status">Loading…</p>
        ) : error ? (
          <p className="environment-picker__status environment-picker__status--error">{error}</p>
        ) : (
          <div className="environment-picker__grid">
            {/* Default theater tile — always first */}
            <SkinTile
              label="Default theater"
              description={defaultSkin?.description ?? "The original classroom."}
              thumbnailUrl={defaultSkin?.thumbnailStorageKey ?? null}
              gradeBands={defaultSkin?.gradeBands ?? []}
              isActive={isDefaultActive}
              busy={busy}
              onClick={() => void pick(null)}
            />
            {themedSkins.map((skin) => (
              <SkinTile
                key={skin.slug}
                label={skin.label}
                description={skin.description}
                thumbnailUrl={skin.thumbnailStorageKey}
                gradeBands={skin.gradeBands}
                isActive={skin.slug === currentSkinId}
                busy={busy}
                onClick={() => void pick(skin.slug)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function SkinTile({
  label,
  description,
  thumbnailUrl,
  gradeBands,
  isActive,
  busy,
  onClick,
}: {
  label: string;
  description: string;
  thumbnailUrl: string | null;
  gradeBands: string[];
  isActive: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = thumbnailUrl && !thumbFailed;

  return (
    <button
      type="button"
      className={`environment-picker__tile${isActive ? " environment-picker__tile--active" : ""}`}
      onClick={onClick}
      disabled={busy}
      title={description}
    >
      {showThumb ? (
        <img
          src={thumbnailUrl}
          alt={`${label} thumbnail`}
          className="environment-picker__thumb"
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <div className="environment-picker__thumb environment-picker__thumb--default" />
      )}
      <div className="environment-picker__label">{label}</div>
      {gradeBands.length > 0 ? (
        <div className="environment-picker__chips">
          {gradeBands.map((band) => (
            <span key={band} className="environment-picker__chip">{band}</span>
          ))}
        </div>
      ) : null}
      <div className="environment-picker__desc">{description}</div>
    </button>
  );
}
