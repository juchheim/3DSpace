"use client";

import { useEffect, useState } from "react";
import type { PhysicsTuning } from "@3dspace/contracts";
import { HudCard } from "./HudCard";

type Props = {
  effectiveTuning: PhysicsTuning;
  roomOverride?: Partial<PhysicsTuning> | undefined;
  featureGateEnabled: boolean;
  onChange: (next: Partial<PhysicsTuning>) => void;
  onReset: () => void;
};

type DraftPhysicsSettings = Pick<PhysicsTuning, "enabled" | "gravity" | "jumpHeight" | "moveSpeed">;

function toDraft(effectiveTuning: PhysicsTuning, roomOverride?: Partial<PhysicsTuning>): DraftPhysicsSettings {
  return {
    enabled: roomOverride?.enabled ?? effectiveTuning.enabled,
    gravity: roomOverride?.gravity ?? effectiveTuning.gravity,
    jumpHeight: roomOverride?.jumpHeight ?? effectiveTuning.jumpHeight,
    moveSpeed: roomOverride?.moveSpeed ?? effectiveTuning.moveSpeed
  };
}

export function PhysicsCard({ effectiveTuning, roomOverride, featureGateEnabled, onChange, onReset }: Props) {
  const [draft, setDraft] = useState<DraftPhysicsSettings>(() => toDraft(effectiveTuning, roomOverride));

  useEffect(() => {
    setDraft(toDraft(effectiveTuning, roomOverride));
  }, [effectiveTuning, roomOverride]);

  function update(patch: Partial<DraftPhysicsSettings>) {
    setDraft((current) => {
      const next = { ...current, ...patch };
      onChange(next);
      return next;
    });
  }

  return (
    <HudCard title="Physics" ariaLabel="Physics settings" defaultCollapsed>
      <div className="physics-card">
        {!featureGateEnabled ? (
          <p className="physics-card__note">Deployment physics is off. Room overrides will save, but they will not activate until the env flag is enabled.</p>
        ) : null}

        <label className="physics-card__field-row physics-card__field-row--check">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          <span>Enable room physics override</span>
        </label>

        <label className="physics-card__field">
          <div className="physics-card__field-row">
            <span>Gravity</span>
            <input
              type="range"
              min={0}
              max={40}
              step={0.1}
              value={draft.gravity}
              className="physics-card__slider"
              onChange={(event) => update({ gravity: parseFloat(event.target.value) })}
            />
            <span className="physics-card__slider-val">{draft.gravity.toFixed(1)}</span>
          </div>
        </label>

        <label className="physics-card__field">
          <div className="physics-card__field-row">
            <span>Jump</span>
            <input
              type="range"
              min={0}
              max={4}
              step={0.05}
              value={draft.jumpHeight}
              className="physics-card__slider"
              onChange={(event) => update({ jumpHeight: parseFloat(event.target.value) })}
            />
            <span className="physics-card__slider-val">{draft.jumpHeight.toFixed(2)}m</span>
          </div>
        </label>

        <label className="physics-card__field">
          <div className="physics-card__field-row">
            <span>Speed</span>
            <input
              type="range"
              min={1}
              max={8}
              step={0.1}
              value={draft.moveSpeed}
              className="physics-card__slider"
              onChange={(event) => update({ moveSpeed: parseFloat(event.target.value) })}
            />
            <span className="physics-card__slider-val">{draft.moveSpeed.toFixed(1)}m/s</span>
          </div>
        </label>

        <div className="physics-card__actions">
          <button type="button" className="hud-btn" onClick={onReset}>
            Use env / skin
          </button>
        </div>
      </div>
    </HudCard>
  );
}
