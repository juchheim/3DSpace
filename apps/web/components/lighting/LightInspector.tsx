"use client";
import { useState } from "react";
import type { RoomLight } from "@3dspace/contracts";
import { LIGHT_MAX_INTENSITY, LIGHT_MAX_DISTANCE, LIGHT_MAX_AREA_SIZE } from "@3dspace/contracts";

interface Props {
  light: RoomLight;
  onUpdate: (patch: Partial<RoomLight>, commit?: boolean) => void;
  onDelete: () => void;
}

export function LightInspector({ light, onUpdate, onDelete }: Props) {
  const [nameDraft, setNameDraft] = useState(light.name ?? "");

  function commitName() {
    const trimmed = nameDraft.trim();
    if (trimmed !== (light.name ?? "")) {
      onUpdate({ name: trimmed || undefined }, true);
    }
  }

  return (
    <div className="light-inspector">
      <p className="light-inspector__section">Selected Light</p>

      {/* Name */}
      <div className="light-inspector__row">
        <span className="light-inspector__label">Name</span>
        <input
          type="text"
          className="light-inspector__input"
          value={nameDraft}
          maxLength={60}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          placeholder={light.type === "point" ? "Bulb" : light.type === "spot" ? "Spot" : "Panel"}
        />
      </div>

      {/* Enabled */}
      <div className="light-inspector__row">
        <span className="light-inspector__label">Enabled</span>
        <input
          type="checkbox"
          checked={light.enabled}
          onChange={(e) => onUpdate({ enabled: e.target.checked }, true)}
        />
      </div>

      {/* Color */}
      <div className="light-inspector__row">
        <span className="light-inspector__label">Color</span>
        <input
          type="color"
          className="light-inspector__input"
          value={light.color}
          onInput={(e) => onUpdate({ color: e.currentTarget.value }, false)}
          onChange={(e) => onUpdate({ color: e.target.value }, true)}
        />
      </div>

      {/* Intensity */}
      <div className="light-inspector__row">
        <span className="light-inspector__label">Intensity</span>
        <input
          type="range"
          className="light-inspector__slider"
          min={0}
          max={LIGHT_MAX_INTENSITY}
          step={0.1}
          value={light.intensity}
          onInput={(e) => onUpdate({ intensity: Number(e.currentTarget.value) }, false)}
          onPointerUp={(e) => onUpdate({ intensity: Number((e.currentTarget as HTMLInputElement).value) }, true)}
        />
        <span style={{ fontSize: 11, minWidth: 32, textAlign: "right", color: "var(--bd-text, #fff)" }}>
          {light.intensity.toFixed(1)}
        </span>
      </div>

      <p className="light-inspector__section">Position</p>
      {(["x", "y", "z"] as const).map((axis) => (
        <div key={axis} className="light-inspector__row">
          <span className="light-inspector__label">{axis.toUpperCase()}</span>
          <input
            type="number"
            className="light-inspector__input"
            step={0.1}
            value={light.position[axis]}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!isNaN(val)) onUpdate({ position: { ...light.position, [axis]: val } }, false);
            }}
            onBlur={(e) => {
              const val = Number(e.target.value);
              if (!isNaN(val)) onUpdate({ position: { ...light.position, [axis]: val } }, true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = Number(e.currentTarget.value);
                if (!isNaN(val)) onUpdate({ position: { ...light.position, [axis]: val } }, true);
                e.currentTarget.blur();
              }
            }}
          />
        </div>
      ))}

      {/* Point / Spot: distance + decay */}
      {(light.type === "point" || light.type === "spot") && (
        <>
          <p className="light-inspector__section">Falloff</p>
          <div className="light-inspector__row">
            <span className="light-inspector__label">Distance</span>
            <input
              type="range"
              className="light-inspector__slider"
              min={0}
              max={LIGHT_MAX_DISTANCE}
              step={0.5}
              value={light.distance ?? 0}
              onInput={(e) => onUpdate({ distance: Number(e.currentTarget.value) }, false)}
              onPointerUp={(e) => onUpdate({ distance: Number((e.currentTarget as HTMLInputElement).value) }, true)}
            />
            <span style={{ fontSize: 11, minWidth: 32, textAlign: "right", color: "var(--bd-text, #fff)" }}>
              {(light.distance ?? 0).toFixed(0)}m
            </span>
          </div>
          <div className="light-inspector__row">
            <span className="light-inspector__label">Decay</span>
            <input
              type="range"
              className="light-inspector__slider"
              min={0}
              max={4}
              step={0.1}
              value={light.decay ?? 2}
              onInput={(e) => onUpdate({ decay: Number(e.currentTarget.value) }, false)}
              onPointerUp={(e) => onUpdate({ decay: Number((e.currentTarget as HTMLInputElement).value) }, true)}
            />
            <span style={{ fontSize: 11, minWidth: 32, textAlign: "right", color: "var(--bd-text, #fff)" }}>
              {(light.decay ?? 2).toFixed(1)}
            </span>
          </div>
        </>
      )}

      {/* Spot: angle, penumbra, target */}
      {light.type === "spot" && (
        <>
          <p className="light-inspector__section">Spot</p>
          <div className="light-inspector__row">
            <span className="light-inspector__label">Angle</span>
            <input
              type="range"
              className="light-inspector__slider"
              min={1}
              max={90}
              step={1}
              value={light.angleDeg ?? 30}
              onInput={(e) => onUpdate({ angleDeg: Number(e.currentTarget.value) }, false)}
              onPointerUp={(e) => onUpdate({ angleDeg: Number((e.currentTarget as HTMLInputElement).value) }, true)}
            />
            <span style={{ fontSize: 11, minWidth: 36, textAlign: "right", color: "var(--bd-text, #fff)" }}>
              {(light.angleDeg ?? 30).toFixed(0)}°
            </span>
          </div>
          <div className="light-inspector__row">
            <span className="light-inspector__label">Penumbra</span>
            <input
              type="range"
              className="light-inspector__slider"
              min={0}
              max={1}
              step={0.01}
              value={light.penumbra ?? 0}
              onInput={(e) => onUpdate({ penumbra: Number(e.currentTarget.value) }, false)}
              onPointerUp={(e) => onUpdate({ penumbra: Number((e.currentTarget as HTMLInputElement).value) }, true)}
            />
            <span style={{ fontSize: 11, minWidth: 32, textAlign: "right", color: "var(--bd-text, #fff)" }}>
              {(light.penumbra ?? 0).toFixed(2)}
            </span>
          </div>
          <p className="light-inspector__section">Target</p>
          {(["x", "y", "z"] as const).map((axis) => (
            <div key={`target-${axis}`} className="light-inspector__row">
              <span className="light-inspector__label">T·{axis.toUpperCase()}</span>
              <input
                type="number"
                className="light-inspector__input"
                step={0.1}
                value={(light.target ?? { x: 0, y: 0, z: 0 })[axis]}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) onUpdate({ target: { ...(light.target ?? { x: 0, y: 0, z: 0 }), [axis]: val } }, false);
                }}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val)) onUpdate({ target: { ...(light.target ?? { x: 0, y: 0, z: 0 }), [axis]: val } }, true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = Number(e.currentTarget.value);
                    if (!isNaN(val)) onUpdate({ target: { ...(light.target ?? { x: 0, y: 0, z: 0 }), [axis]: val } }, true);
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
          ))}
        </>
      )}

      {/* Area: width + height */}
      {light.type === "area" && (
        <>
          <p className="light-inspector__section">Area Size</p>
          <div className="light-inspector__row">
            <span className="light-inspector__label">Width</span>
            <input
              type="range"
              className="light-inspector__slider"
              min={0.1}
              max={LIGHT_MAX_AREA_SIZE}
              step={0.1}
              value={light.width ?? 2}
              onInput={(e) => onUpdate({ width: Number(e.currentTarget.value) }, false)}
              onPointerUp={(e) => onUpdate({ width: Number((e.currentTarget as HTMLInputElement).value) }, true)}
            />
            <span style={{ fontSize: 11, minWidth: 36, textAlign: "right", color: "var(--bd-text, #fff)" }}>
              {(light.width ?? 2).toFixed(1)}m
            </span>
          </div>
          <div className="light-inspector__row">
            <span className="light-inspector__label">Height</span>
            <input
              type="range"
              className="light-inspector__slider"
              min={0.1}
              max={LIGHT_MAX_AREA_SIZE}
              step={0.1}
              value={light.height ?? 2}
              onInput={(e) => onUpdate({ height: Number(e.currentTarget.value) }, false)}
              onPointerUp={(e) => onUpdate({ height: Number((e.currentTarget as HTMLInputElement).value) }, true)}
            />
            <span style={{ fontSize: 11, minWidth: 36, textAlign: "right", color: "var(--bd-text, #fff)" }}>
              {(light.height ?? 2).toFixed(1)}m
            </span>
          </div>
        </>
      )}

      {/* Shadow (point / spot only — area cannot shadow) */}
      {(light.type === "point" || light.type === "spot") && (
        <div className="light-inspector__row">
          <span className="light-inspector__label">Shadow</span>
          <input
            type="checkbox"
            checked={light.castShadow}
            onChange={(e) => onUpdate({ castShadow: e.target.checked }, true)}
          />
        </div>
      )}

      <button type="button" className="light-inspector__delete" onClick={onDelete}>
        Delete Light
      </button>
    </div>
  );
}
