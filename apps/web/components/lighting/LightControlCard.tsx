"use client";

import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { RoomLight } from "@3dspace/contracts";
import { LIGHT_MAX_INTENSITY, LIGHT_MAX_DISTANCE, LIGHT_MAX_AREA_SIZE } from "@3dspace/contracts";
import { StableRange } from "./StableRange";
import { targetToAngles } from "../../lib/lightEditorMath";

export type LightEditorMode = "move" | "aim" | "shape";

type Props = {
  light: RoomLight;
  mode: LightEditorMode;
  /** Transient "edited by ___" presence from another participant's upserts. */
  editedBy?: { name: string; at: number } | undefined;
  onUpdate: (patch: Partial<RoomLight>, commit?: boolean) => void;
  onSetMode: (mode: LightEditorMode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFocusCamera: () => void;
  onDeselect: () => void;
};

const MODE_COACHMARK: Record<LightEditorMode, string> = {
  move: "Drag the arrows to move · arrow keys nudge · Shift snaps",
  aim: "Drag the dot to aim · Q/E rotate · Shift snaps",
  shape: "Drag the ring to reshape · Shift snaps",
};

const TYPE_META: Record<RoomLight["type"], { icon: string; tint: string; placeholder: string; label: string }> = {
  point: { icon: "●", tint: "#fde68a", placeholder: "Bulb", label: "Point" },
  spot: { icon: "◉", tint: "#a5f3fc", placeholder: "Spot", label: "Spot" },
  area: { icon: "▣", tint: "#d9f99d", placeholder: "Panel", label: "Panel" },
};
const CARD_LEFT_GAP_PX = 18;

function cardLeftTransform(dx: number, dy: number, scale: number) {
  return `translate(calc(${dx}px - 100% - ${CARD_LEFT_GAP_PX}px), calc(${dy}px - 50%)) scale(${scale})`;
}

/** A labeled slider row with a tabular-nums readout. */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  ariaLabel,
  onPreview,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  ariaLabel: string;
  onPreview: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <div className="light-card__row">
      <span className="light-card__label">{label}</span>
      <StableRange
        className="light-card__slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onPreview={onPreview}
        onCommit={onCommit}
      />
      <span className="light-card__readout"><strong>{format(value)}</strong></span>
    </div>
  );
}

export function LightControlCard({
  light,
  mode,
  editedBy,
  onUpdate,
  onSetMode,
  onDelete,
  onDuplicate,
  onFocusCamera,
  onDeselect,
}: Props) {
  const meta = TYPE_META[light.type];
  const [nameDraft, setNameDraft] = useState(light.name ?? "");
  const [showExact, setShowExact] = useState(false);
  const [positionDraft, setPositionDraft] = useState(() => ({
    x: String(light.position.x),
    y: String(light.position.y),
    z: String(light.position.z),
  }));
  const [pipName, setPipName] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const shift = useRef({ x: 0, y: 0 });
  const latestPositionRef = useRef(light.position);
  const px = light.position.x;
  const py = light.position.y;
  const pz = light.position.z;

  // Dim/shrink with camera distance, and keep the card clamped on-screen so it
  // never floats off the viewport. Continuous (not animated) so it's
  // reduced-motion-safe.
  useFrame(({ camera }) => {
    const el = wrapperRef.current;
    if (!el) return;
    const dist = Math.hypot(camera.position.x - px, camera.position.y - py, camera.position.z - pz);
    const t = Math.min(1, Math.max(0, (dist - 8) / 14));
    const scale = 1 - 0.28 * t;
    el.style.opacity = String(1 - 0.5 * t);

    const rect = el.getBoundingClientRect();
    const m = 8;
    let dx = 0;
    let dy = 0;
    if (rect.left < m) dx = m - rect.left;
    else if (rect.right > window.innerWidth - m) dx = window.innerWidth - m - rect.right;
    if (rect.top < m) dy = m - rect.top;
    else if (rect.bottom > window.innerHeight - m) dy = window.innerHeight - m - rect.bottom;
    shift.current = { x: shift.current.x + dx, y: shift.current.y + dy };
    el.style.transform = cardLeftTransform(shift.current.x, shift.current.y, scale);
  });

  // Show the "edited by" pip for ~2s after each remote upsert, bumping on each.
  useEffect(() => {
    if (!editedBy) return;
    setPipName(editedBy.name);
    const handle = window.setTimeout(() => setPipName(null), 2000);
    return () => window.clearTimeout(handle);
  }, [editedBy?.name, editedBy?.at]);

  useEffect(() => {
    latestPositionRef.current = light.position;
    setPositionDraft({
      x: String(light.position.x),
      y: String(light.position.y),
      z: String(light.position.z),
    });
  }, [light.id, light.position]);

  function commitName() {
    const trimmed = nameDraft.trim();
    if (trimmed !== (light.name ?? "")) onUpdate({ name: trimmed || undefined }, true);
  }

  const modes: LightEditorMode[] = light.type === "point" ? ["move", "shape"] : ["move", "aim", "shape"];
  const target = light.target ?? { x: 0, y: 0, z: 0 };
  const { azimuthDeg, elevationDeg } = targetToAngles(light.position, target);

  // Anchored at the fixture; CSS transform places the panel to the left so it
  // does not cover the selected light or move gizmo axes.
  const anchor: [number, number, number] = [light.position.x, light.position.y, light.position.z];

  function commitPositionAxis(axis: "x" | "y" | "z", raw: string, commit: boolean) {
    if (raw.trim() === "") return;
    const val = Number(raw);
    if (!Number.isFinite(val)) return;
    setPositionDraft((prev) => ({ ...prev, [axis]: String(val) }));
    const position = { ...latestPositionRef.current, [axis]: val };
    latestPositionRef.current = position;
    onUpdate({ position }, commit);
  }

  return (
    <Html position={anchor} occlude style={{ pointerEvents: "auto" }} zIndexRange={[40, 0]}>
      <div
        ref={wrapperRef}
        className="light-card"
        data-testid="light-control-card"
        style={{ transform: cardLeftTransform(0, 0, 1), transformOrigin: "right center" }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {pipName ? (
          <div className="light-card__pip" aria-live="polite">● edited by {pipName}</div>
        ) : null}

        {/* Header */}
        <div className="light-card__header">
          <span className="light-card__badge" style={{ color: meta.tint }} title={`${meta.label} light`}>
            {meta.icon}
          </span>
          <input
            type="text"
            className="light-card__name"
            value={nameDraft}
            maxLength={60}
            aria-label="Light name"
            placeholder={meta.placeholder}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />
          <button
            type="button"
            className={`light-card__toggle${light.enabled ? " is-on" : ""}`}
            data-testid="light-control-toggle"
            aria-label={light.enabled ? "Turn light off" : "Turn light on"}
            title={light.enabled ? "On" : "Off"}
            onClick={() => onUpdate({ enabled: !light.enabled }, true)}
          >
            {light.enabled ? "●" : "○"}
          </button>
          <button type="button" className="light-card__icon-btn" aria-label="Focus camera on light" title="Focus" onClick={onFocusCamera}>
            ⤢
          </button>
          <button type="button" className="light-card__icon-btn" aria-label="Close light editor" title="Close" onClick={onDeselect}>
            ✕
          </button>
        </div>

        {/* Mode segmented control */}
        <div className="light-card__modes" role="group" aria-label="Editor mode" data-testid="light-control-modes">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              className={`light-card__mode${mode === m ? " is-active" : ""}`}
              aria-pressed={mode === m}
              title={m === "move" ? "Move position (X/Y/Z)" : m === "aim" ? "Aim direction" : "Reshape (range / cone / size)"}
              onClick={() => onSetMode(m)}
            >
              {m === "move" ? "Move" : m === "aim" ? "Aim" : "Shape"}
            </button>
          ))}
        </div>
        <p className="light-card__coachmark">{MODE_COACHMARK[mode]}</p>

        {/* Color (all) */}
        <div className="light-card__row">
          <span className="light-card__label">Color</span>
          <input
            type="color"
            className="light-card__color"
            value={light.color}
            aria-label="Light color"
            onInput={(e) => onUpdate({ color: e.currentTarget.value }, false)}
            onChange={(e) => onUpdate({ color: e.target.value }, true)}
          />
        </div>

        {/* Intensity (all) */}
        <SliderRow
          label="Intensity"
          ariaLabel="Intensity"
          value={light.intensity}
          min={0}
          max={LIGHT_MAX_INTENSITY}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onPreview={(v) => onUpdate({ intensity: v }, false)}
          onCommit={(v) => onUpdate({ intensity: v }, true)}
        />

        {/* Range + falloff (point/spot) */}
        {(light.type === "point" || light.type === "spot") && (
          <>
            <SliderRow
              label="Range"
              ariaLabel="Range (distance)"
              value={light.distance ?? 0}
              min={0}
              max={LIGHT_MAX_DISTANCE}
              step={0.5}
              format={(v) => `${v.toFixed(0)} m`}
              onPreview={(v) => onUpdate({ distance: v }, false)}
              onCommit={(v) => onUpdate({ distance: v }, true)}
            />
            <SliderRow
              label="Falloff"
              ariaLabel="Falloff (decay)"
              value={light.decay ?? 2}
              min={0}
              max={4}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onPreview={(v) => onUpdate({ decay: v }, false)}
              onCommit={(v) => onUpdate({ decay: v }, true)}
            />
          </>
        )}

        {/* Cone + softness (spot) */}
        {light.type === "spot" && (
          <>
            <SliderRow
              label="Cone"
              ariaLabel="Cone angle"
              value={light.angleDeg ?? 30}
              min={1}
              max={90}
              step={1}
              format={(v) => `${v.toFixed(0)}°`}
              onPreview={(v) => onUpdate({ angleDeg: v }, false)}
              onCommit={(v) => onUpdate({ angleDeg: v }, true)}
            />
            <SliderRow
              label="Softness"
              ariaLabel="Softness (penumbra)"
              value={light.penumbra ?? 0}
              min={0}
              max={1}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onPreview={(v) => onUpdate({ penumbra: v }, false)}
              onCommit={(v) => onUpdate({ penumbra: v }, true)}
            />
          </>
        )}

        {/* Width + height (area) */}
        {light.type === "area" && (
          <>
            <SliderRow
              label="Width"
              ariaLabel="Width"
              value={light.width ?? 2}
              min={0.1}
              max={LIGHT_MAX_AREA_SIZE}
              step={0.1}
              format={(v) => `${v.toFixed(1)} m`}
              onPreview={(v) => onUpdate({ width: v }, false)}
              onCommit={(v) => onUpdate({ width: v }, true)}
            />
            <SliderRow
              label="Height"
              ariaLabel="Height"
              value={light.height ?? 2}
              min={0.1}
              max={LIGHT_MAX_AREA_SIZE}
              step={0.1}
              format={(v) => `${v.toFixed(1)} m`}
              onPreview={(v) => onUpdate({ height: v }, false)}
              onCommit={(v) => onUpdate({ height: v }, true)}
            />
          </>
        )}

        {/* Cast shadows (point/spot; area cannot) */}
        {light.type === "area" ? (
          <p className="light-card__note">Soft panels can&apos;t cast shadows.</p>
        ) : (
          <label className="light-card__check">
            <input
              type="checkbox"
              checked={light.castShadow}
              onChange={(e) => onUpdate({ castShadow: e.target.checked }, true)}
            />
            Cast shadows
          </label>
        )}

        {/* Position / aim readout + exact-value expander */}
        <div className="light-card__readouts">
          <div className="light-card__coords">
            <span className="light-card__readout">x <strong>{light.position.x.toFixed(1)}</strong></span>
            <span className="light-card__readout">y <strong>{light.position.y.toFixed(1)}</strong></span>
            <span className="light-card__readout">z <strong>{light.position.z.toFixed(1)}</strong></span>
            <button
              type="button"
              className="light-card__expander"
              aria-expanded={showExact}
              onClick={() => setShowExact((v) => !v)}
            >
              {showExact ? "Hide" : "Exact"}
            </button>
          </div>
          {mode === "aim" && light.type !== "point" ? (
            <div className="light-card__coords">
              <span className="light-card__readout">az <strong>{azimuthDeg.toFixed(0)}°</strong></span>
              <span className="light-card__readout">el <strong>{elevationDeg.toFixed(0)}°</strong></span>
            </div>
          ) : null}
          {showExact ? (
            <div className="light-card__exact">
              {(["x", "y", "z"] as const).map((axis) => (
                <label key={axis} className="light-card__exact-field">
                  <span>{axis.toUpperCase()}</span>
                  <input
                    type="number"
                    step={0.1}
                    value={positionDraft[axis]}
                    aria-label={`Position ${axis.toUpperCase()}`}
                    onChange={(e) => setPositionDraft((prev) => ({ ...prev, [axis]: e.currentTarget.value }))}
                    onBlur={(e) => commitPositionAxis(axis, e.currentTarget.value, true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        commitPositionAxis(axis, e.currentTarget.value, true);
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="light-card__actions">
          <button type="button" className="light-card__action" onClick={onDuplicate}>⎘ Duplicate</button>
          <button type="button" className="light-card__action light-card__action--danger" data-testid="light-control-delete" onClick={onDelete}>🗑 Delete</button>
        </div>
      </div>
    </Html>
  );
}
