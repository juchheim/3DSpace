"use client";
import type { RoomEnvironment } from "@3dspace/contracts";
import { LIGHTING_PRESETS, LIGHTING_PRESET_IDS } from "../../lib/lightingPresets";
import { StableRange } from "./StableRange";

// IBL presets supported by the contracts schema
const IBL_PRESETS = ["none", "studio", "sunset", "dawn", "night", "warehouse", "park", "apartment"] as const;
type IblPreset = typeof IBL_PRESETS[number];

interface Props {
  environment: RoomEnvironment;
  onUpdate: (patch: Partial<RoomEnvironment>, commit?: boolean) => void;
}

export function EnvironmentPanel({ environment, onUpdate }: Props) {
  const sun = environment.sun;
  const sky = environment.sky;
  const ibl = environment.ibl;
  const fog = environment.fog;
  const exp = environment.exposure;

  return (
    <div className="env-panel">
      {/* Enable toggle */}
      <label className={`env-panel__override${environment.enabled ? " is-enabled" : ""}`}>
        <input
          type="checkbox"
          checked={environment.enabled}
          onChange={(e) => onUpdate({ enabled: e.target.checked }, true)}
        />
        <span className="env-panel__override-copy">
          <span className="env-panel__override-title">Override Environment</span>
          <span className="env-panel__override-sub">Use custom sun, sky, fog, IBL, and exposure for this room.</span>
        </span>
      </label>

      {environment.enabled ? (
        <>
          {/* Mood presets */}
          <div className="env-panel__section">Presets</div>
          <div className="env-panel__preset-chips">
            {LIGHTING_PRESET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="env-panel__chip"
                onClick={() => onUpdate(LIGHTING_PRESETS[id].environment, true)}
              >
                {LIGHTING_PRESETS[id].label}
              </button>
            ))}
          </div>

          {/* Sun */}
          <div className="env-panel__section">Sun</div>
          {/* Enabled + Cast Shadow pair as two 1-col items */}
          <label className="env-panel__row">
            <span className="env-panel__label">Enabled</span>
            <input
              type="checkbox"
              checked={sun.enabled}
              onChange={(e) => onUpdate({ sun: { ...sun, enabled: e.target.checked } }, true)}
            />
          </label>
          <label className="env-panel__row">
            <span className="env-panel__label">Cast Shadow</span>
            <input
              type="checkbox"
              checked={sun.castShadow}
              onChange={(e) => onUpdate({ sun: { ...sun, castShadow: e.target.checked } }, true)}
            />
          </label>
          <label className="env-panel__row">
            <span className="env-panel__label">Sun Color</span>
            <input
              type="color" value={sun.color}
              className="env-panel__color"
              onInput={(e) => onUpdate({ sun: { ...sun, color: (e.target as HTMLInputElement).value } })}
              onChange={(e) => onUpdate({ sun: { ...sun, color: e.target.value } }, true)}
            />
          </label>
          <label className="env-panel__row">
            <span className="env-panel__label">Azimuth</span>
            <StableRange
              min="0" max="360" step="1"
              className="env-panel__slider"
              value={sun.azimuthDeg}
              onPreview={(value) => onUpdate({ sun: { ...sun, azimuthDeg: value } })}
              onCommit={(value) => onUpdate({ sun: { ...sun, azimuthDeg: value } }, true)}
            />
            <span className="env-panel__value">{sun.azimuthDeg}°</span>
          </label>
          <label className="env-panel__row">
            <span className="env-panel__label">Elevation</span>
            <StableRange
              min="-10" max="90" step="1"
              className="env-panel__slider"
              value={sun.elevationDeg}
              onPreview={(value) => onUpdate({ sun: { ...sun, elevationDeg: value } })}
              onCommit={(value) => onUpdate({ sun: { ...sun, elevationDeg: value } }, true)}
            />
            <span className="env-panel__value">{sun.elevationDeg}°</span>
          </label>
          <label className="env-panel__row">
            <span className="env-panel__label">Sun Intensity</span>
            <StableRange
              min="0" max="4" step="0.05"
              className="env-panel__slider"
              value={sun.intensity}
              onPreview={(value) => onUpdate({ sun: { ...sun, intensity: value } })}
              onCommit={(value) => onUpdate({ sun: { ...sun, intensity: value } }, true)}
            />
            <span className="env-panel__value">{sun.intensity.toFixed(1)}</span>
          </label>

          {/* Sky */}
          <div className="env-panel__section">Sky &amp; Ambient</div>
          {/* Colors group — pairs: Hemisphere+SkyColor, GroundColor+AmbientColor */}
          <label className="env-panel__row">
            <span className="env-panel__label">Hemisphere</span>
            <input
              type="checkbox"
              checked={sky.hemisphere}
              onChange={(e) => onUpdate({ sky: { ...sky, hemisphere: e.target.checked } }, true)}
            />
          </label>
          <label className="env-panel__row">
            <span className="env-panel__label">Sky Color</span>
            <input
              type="color" value={sky.skyColor}
              className="env-panel__color"
              onChange={(e) => onUpdate({ sky: { ...sky, skyColor: e.target.value } }, true)}
            />
          </label>
          <label className="env-panel__row">
            <span className="env-panel__label">Ground Color</span>
            <input
              type="color" value={sky.groundColor}
              className="env-panel__color"
              onChange={(e) => onUpdate({ sky: { ...sky, groundColor: e.target.value } }, true)}
            />
          </label>
          <label className="env-panel__row">
            <span className="env-panel__label">Ambient Color</span>
            <input
              type="color" value={sky.ambientColor}
              className="env-panel__color"
              onChange={(e) => onUpdate({ sky: { ...sky, ambientColor: e.target.value } }, true)}
            />
          </label>
          {/* Intensity sliders — full-width */}
          <label className="env-panel__row">
            <span className="env-panel__label">Hemi Intensity</span>
            <StableRange
              min="0" max="3" step="0.05"
              className="env-panel__slider"
              value={sky.hemisphereIntensity}
              onPreview={(value) => onUpdate({ sky: { ...sky, hemisphereIntensity: value } })}
              onCommit={(value) => onUpdate({ sky: { ...sky, hemisphereIntensity: value } }, true)}
            />
            <span className="env-panel__value">{sky.hemisphereIntensity.toFixed(2)}</span>
          </label>
          <label className="env-panel__row">
            <span className="env-panel__label">Ambient Intensity</span>
            <StableRange
              min="0" max="3" step="0.05"
              className="env-panel__slider"
              value={sky.ambientIntensity}
              onPreview={(value) => onUpdate({ sky: { ...sky, ambientIntensity: value } })}
              onCommit={(value) => onUpdate({ sky: { ...sky, ambientIntensity: value } }, true)}
            />
            <span className="env-panel__value">{sky.ambientIntensity.toFixed(2)}</span>
          </label>

          {/* IBL */}
          <div className="env-panel__section">Image Based Lighting</div>
          <label className="env-panel__row">
            <span className="env-panel__label">Preset</span>
            <select
              className="env-panel__select"
              value={ibl.preset}
              onChange={(e) => onUpdate({ ibl: { ...ibl, preset: e.target.value as IblPreset } }, true)}
            >
              {IBL_PRESETS.map((p) => <option key={p} value={p}>{p === "none" ? "None" : p}</option>)}
            </select>
          </label>
          {ibl.preset !== "none" ? (
            <label className="env-panel__row">
              <span className="env-panel__label">IBL Intensity</span>
              <StableRange
                min="0" max="3" step="0.05"
                className="env-panel__slider"
                value={ibl.intensity}
                onPreview={(value) => onUpdate({ ibl: { ...ibl, intensity: value } })}
                onCommit={(value) => onUpdate({ ibl: { ...ibl, intensity: value } }, true)}
              />
              <span className="env-panel__value">{ibl.intensity.toFixed(2)}</span>
            </label>
          ) : null}

          {/* Fog */}
          <div className="env-panel__section">Fog</div>
          <label className="env-panel__row">
            <span className="env-panel__label">Enable Fog</span>
            <input
              type="checkbox"
              checked={fog.enabled}
              onChange={(e) => onUpdate({ fog: { ...fog, enabled: e.target.checked } }, true)}
            />
          </label>
          {fog.enabled ? (
            <>
              <label className="env-panel__row">
                <span className="env-panel__label">Fog Color</span>
                <input
                  type="color" value={fog.color}
                  className="env-panel__color"
                  onChange={(e) => onUpdate({ fog: { ...fog, color: e.target.value } }, true)}
                />
              </label>
              <label className="env-panel__row">
                <span className="env-panel__label">Fog Near</span>
                <StableRange
                  min="1" max="50" step="1"
                  className="env-panel__slider"
                  value={fog.near}
                  onPreview={(value) => onUpdate({ fog: { ...fog, near: value } })}
                  onCommit={(value) => onUpdate({ fog: { ...fog, near: value } }, true)}
                />
                <span className="env-panel__value">{fog.near}</span>
              </label>
              <label className="env-panel__row">
                <span className="env-panel__label">Fog Far</span>
                <StableRange
                  min="10" max="200" step="5"
                  className="env-panel__slider"
                  value={fog.far}
                  onPreview={(value) => onUpdate({ fog: { ...fog, far: value } })}
                  onCommit={(value) => onUpdate({ fog: { ...fog, far: value } }, true)}
                />
                <span className="env-panel__value">{fog.far}</span>
              </label>
            </>
          ) : null}

          {/* Tone Mapping + Exposure */}
          <div className="env-panel__section">Rendering</div>
          <label className="env-panel__row">
            <span className="env-panel__label">Tone Mapping</span>
            <select
              className="env-panel__select"
              value={exp.toneMapping}
              onChange={(e) => onUpdate({ exposure: { ...exp, toneMapping: e.target.value as RoomEnvironment["exposure"]["toneMapping"] } }, true)}
            >
              <option value="none">None</option>
              <option value="aces">ACES Filmic</option>
              <option value="agx">AgX</option>
              <option value="neutral">Neutral</option>
            </select>
          </label>
          <label className="env-panel__row">
            <span className="env-panel__label">Exposure</span>
            <StableRange
              min="0.1" max="3" step="0.05"
              className="env-panel__slider"
              value={exp.exposure}
              onPreview={(value) => onUpdate({ exposure: { ...exp, exposure: value } })}
              onCommit={(value) => onUpdate({ exposure: { ...exp, exposure: value } }, true)}
            />
            <span className="env-panel__value">{exp.exposure.toFixed(2)}</span>
          </label>
        </>
      ) : null}
    </div>
  );
}
