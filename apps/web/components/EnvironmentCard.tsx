"use client";

/**
 * EnvironmentCard — teacher HUD card for world skin management.
 *
 * Shows the active skin (label + thumbnail), exposes:
 *   - "Change…" → EnvironmentPicker modal
 *   - "Calm / default" → set-room-skin null
 *   - Sound volume slider → onAmbientChange callback (debounced by RoomClient)
 *   - Day | Night select (Roman Forum only, or any skin with lightingNight)
 *
 * Hidden entirely when !CLIENT_TUNING.enableWorldSkins or worldSkins.enabled === false.
 */

import { useEffect, useRef, useState } from "react";
import type { ClassroomAction, WorldSkin, WorldSkinDayNightMode } from "@3dspace/contracts";
import type { ApiIdentity } from "../lib/identity";
import { HudCard } from "./HudCard";
import { EnvironmentPicker } from "./EnvironmentPicker";

type Props = {
  identity: ApiIdentity;
  skin: WorldSkin | null;
  dayNightMode: WorldSkinDayNightMode;
  /** Effective ambient gain (0–1). Null when no skin / not set. */
  ambientGain: number | null;
  onRunAction: (action: ClassroomAction) => Promise<unknown>;
  /** Called when the teacher adjusts the ambient slider. Caller debounces + persists. */
  onAmbientChange: (gain: number) => void;
};

export function EnvironmentCard({
  identity,
  skin,
  dayNightMode,
  ambientGain,
  onRunAction,
  onAmbientChange,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Local slider value for immediate UI feedback before the parent debounces.
  const defaultGain = skin?.overrides.ambient?.defaultGain ?? 0.15;
  const effectiveGain = ambientGain ?? defaultGain;
  const [sliderGain, setSliderGain] = useState(effectiveGain);

  // Keep slider in sync when server value changes (e.g. after initial mount).
  useEffect(() => {
    setSliderGain(ambientGain ?? defaultGain);
  }, [ambientGain, defaultGain]);

  async function runSkinAction(action: ClassroomAction) {
    setBusy(true);
    try {
      await onRunAction(action);
    } finally {
      setBusy(false);
    }
  }

  const hasNightMode = Boolean(skin?.overrides.lightingNight);

  return (
    <>
      <HudCard title="Environment" ariaLabel="Environment settings" defaultCollapsed>
        <div className="environment-card">
          {/* Current skin row */}
          <div className="environment-card__current">
            {skin?.thumbnailStorageKey ? (
              <img
                src={skin.thumbnailStorageKey}
                alt={`${skin.label} thumbnail`}
                className="environment-card__thumb"
              />
            ) : (
              <div className="environment-card__thumb environment-card__thumb--default" />
            )}
            <span className="environment-card__label">
              {skin ? skin.label : "Default theater"}
            </span>
          </div>

          {/* Action row */}
          <div className="environment-card__actions">
            <button
              type="button"
              className="hud-btn"
              disabled={busy}
              onClick={() => setPickerOpen(true)}
            >
              Change…
            </button>
            {skin ? (
              <button
                type="button"
                className="hud-btn"
                disabled={busy}
                onClick={() => void runSkinAction({ type: "set-room-skin", skinId: null })}
              >
                Default
              </button>
            ) : null}
          </div>

          {/* Day / Night toggle — only for skins that have a night preset */}
          {skin && hasNightMode ? (
            <label className="environment-card__field-row">
              <span>Lighting</span>
              <select
                className="environment-card__select"
                value={dayNightMode}
                disabled={busy}
                onChange={(e) =>
                  void runSkinAction({
                    type: "set-room-skin-day-night",
                    mode: e.target.value as WorldSkinDayNightMode
                  })
                }
              >
                <option value="day">Day</option>
                <option value="night">Night</option>
              </select>
            </label>
          ) : null}

          {/* Sound volume slider — only when a skin with ambient audio is active */}
          {skin?.overrides.ambient ? (
            <div className="environment-card__field-row">
              <span>Sound</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sliderGain}
                className="environment-card__slider"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setSliderGain(v);
                  onAmbientChange(v);
                }}
              />
              <span className="environment-card__slider-val">{Math.round(sliderGain * 100)}%</span>
            </div>
          ) : null}
        </div>
      </HudCard>

      {pickerOpen ? (
        <EnvironmentPicker
          identity={identity}
          currentSkinId={skin?.slug ?? null}
          onSelect={async (skinId) => {
            await runSkinAction({ type: "set-room-skin", skinId });
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </>
  );
}
