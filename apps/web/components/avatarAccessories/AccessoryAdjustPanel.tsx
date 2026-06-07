"use client";

import type { AvatarAccessoryAdjustment } from "@3dspace/contracts";
import {
  ACCESSORY_ADJUSTMENT_LIMITS,
  accessoryAdjustmentIsDefault,
  normalizeAccessoryAdjustment,
  type NormalizedAccessoryAdjustment
} from "../../lib/avatarAccessoryAdjustments";

type Props = {
  displayName: string;
  adjustment: AvatarAccessoryAdjustment;
  disabled?: boolean;
  onChange: (next: NormalizedAccessoryAdjustment) => void;
  onReset: () => void;
};

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number) {
  return Math.round((rad * 180) / Math.PI);
}

function AdjustSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  disabled = false,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <label className="avatar-editor__adjust-field">
      <div className="avatar-editor__adjust-row">
        <span className="avatar-editor__adjust-label">{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          className="avatar-editor__adjust-slider"
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="avatar-editor__adjust-value">{format(value)}</span>
      </div>
    </label>
  );
}

export function AccessoryAdjustPanel({ displayName, adjustment, disabled = false, onChange, onReset }: Props) {
  const normalized = normalizeAccessoryAdjustment(adjustment);
  const canReset = !accessoryAdjustmentIsDefault(adjustment);

  function patch(next: Partial<NormalizedAccessoryAdjustment>) {
    onChange({ ...normalized, ...next });
  }

  function patchPosition(axis: "x" | "y" | "z", value: number) {
    patch({ positionOffset: { ...normalized.positionOffset, [axis]: value } });
  }

  function patchRotation(axis: "x" | "y" | "z", valueRad: number) {
    patch({ rotationOffset: { ...normalized.rotationOffset, [axis]: valueRad } });
  }

  return (
    <div className="avatar-editor__adjust-panel">
      <div className="avatar-editor__adjust-header">
        <span className="avatar-editor__adjust-title">Fit &amp; position</span>
        <span className="avatar-editor__adjust-subtitle">{displayName}</span>
      </div>

      <div className="avatar-editor__adjust-controls">
        <AdjustSlider
          label="Size"
          value={normalized.scaleOffset}
          min={ACCESSORY_ADJUSTMENT_LIMITS.scale.min}
          max={ACCESSORY_ADJUSTMENT_LIMITS.scale.max}
          step={ACCESSORY_ADJUSTMENT_LIMITS.scale.step}
          format={(value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`}
          disabled={disabled}
          onChange={(scaleOffset) => patch({ scaleOffset })}
        />
        <AdjustSlider
          label="Up / down"
          value={normalized.positionOffset.y}
          min={ACCESSORY_ADJUSTMENT_LIMITS.position.min}
          max={ACCESSORY_ADJUSTMENT_LIMITS.position.max}
          step={ACCESSORY_ADJUSTMENT_LIMITS.position.step}
          format={(value) => `${(value * 100).toFixed(1)} cm`}
          disabled={disabled}
          onChange={(y) => patchPosition("y", y)}
        />
        <AdjustSlider
          label="Forward"
          value={normalized.positionOffset.z}
          min={ACCESSORY_ADJUSTMENT_LIMITS.position.min}
          max={ACCESSORY_ADJUSTMENT_LIMITS.position.max}
          step={ACCESSORY_ADJUSTMENT_LIMITS.position.step}
          format={(value) => `${(value * 100).toFixed(1)} cm`}
          disabled={disabled}
          onChange={(z) => patchPosition("z", z)}
        />
        <AdjustSlider
          label="Side"
          value={normalized.positionOffset.x}
          min={ACCESSORY_ADJUSTMENT_LIMITS.position.min}
          max={ACCESSORY_ADJUSTMENT_LIMITS.position.max}
          step={ACCESSORY_ADJUSTMENT_LIMITS.position.step}
          format={(value) => `${(value * 100).toFixed(1)} cm`}
          disabled={disabled}
          onChange={(x) => patchPosition("x", x)}
        />
        <AdjustSlider
          label="Tilt"
          value={radToDeg(normalized.rotationOffset.x)}
          min={ACCESSORY_ADJUSTMENT_LIMITS.tiltDeg.min}
          max={ACCESSORY_ADJUSTMENT_LIMITS.tiltDeg.max}
          step={ACCESSORY_ADJUSTMENT_LIMITS.tiltDeg.step}
          format={(value) => `${value}°`}
          disabled={disabled}
          onChange={(deg) => patchRotation("x", degToRad(deg))}
        />
        <AdjustSlider
          label="Turn"
          value={radToDeg(normalized.rotationOffset.y)}
          min={ACCESSORY_ADJUSTMENT_LIMITS.turnDeg.min}
          max={ACCESSORY_ADJUSTMENT_LIMITS.turnDeg.max}
          step={ACCESSORY_ADJUSTMENT_LIMITS.turnDeg.step}
          format={(value) => `${value}°`}
          disabled={disabled}
          onChange={(deg) => patchRotation("y", degToRad(deg))}
        />
      </div>

      <button
        type="button"
        className="avatar-editor__adjust-reset"
        disabled={disabled || !canReset}
        onClick={onReset}
      >
        Reset fit
      </button>
    </div>
  );
}
