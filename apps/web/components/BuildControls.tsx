"use client";

import { useEffect, useState } from "react";
import type { BuildPieceMaterial } from "@3dspace/contracts";
import { BUILD_MATERIAL_OPTIONS } from "./buildMaterials";
import { BUILTIN_BUILD_STAMPS } from "../lib/buildStamps";
import type { BuildModeController, BuildTool } from "../lib/useBuildMode";

const BUILD_COACHMARK_KEY = "3dspace-build-coachmark-dismissed";

const TOOL_OPTIONS: Array<{ id: BuildTool; label: string; shortcut: string }> = [
  { id: "wall", label: "Wall", shortcut: "1" },
  { id: "floor", label: "Floor", shortcut: "2" },
  { id: "ramp", label: "Ramp", shortcut: "3" },
  { id: "doorway", label: "Door", shortcut: "5" },
  { id: "window", label: "Window", shortcut: "6" },
  { id: "light", label: "Light", shortcut: "7" },
  { id: "destroy", label: "Destroy", shortcut: "4" }
];

export function BuildControls({
  buildMode,
  pieceCount,
  error = "",
  compact = false,
  emptyCanvasHint = false,
  onClearAll,
  onReturnToSpawn,
  onPlaceAhead,
  placeAheadDisabled = false,
  onUndo,
  onRedo
}: {
  buildMode: BuildModeController;
  pieceCount: number;
  error?: string;
  compact?: boolean;
  /** Escape-room empty canvas nudge. */
  emptyCanvasHint?: boolean;
  onClearAll(): Promise<void>;
  onReturnToSpawn?(): void;
  onPlaceAhead?(): void;
  placeAheadDisabled?: boolean;
  onUndo?(): void;
  onRedo?(): void;
}) {
  const [clearing, setClearing] = useState(false);
  const [showCoachmark, setShowCoachmark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowCoachmark(!window.localStorage.getItem(BUILD_COACHMARK_KEY));
  }, []);

  function dismissCoachmark() {
    window.localStorage.setItem(BUILD_COACHMARK_KEY, "1");
    setShowCoachmark(false);
  }

  return (
    <div
      className={`build-controls-dock${compact ? " build-controls-dock--compact" : ""}`}
      aria-label="Build controls"
    >
      {showCoachmark && buildMode.enabled ? (
        <div className="build-controls-dock__coachmark" role="status">
          <p>
            <strong>Build:</strong> 1 Wall · 2 Floor · 3 Ramp · 4 Destroy · 5 Door · 6 Window · 7 Light · R rotate ·
            drag to paint · Stamps below · ⌘Z undo
          </p>
          <button type="button" className="hud-btn" onClick={dismissCoachmark}>
            Got it
          </button>
        </div>
      ) : null}

      {emptyCanvasHint && pieceCount === 0 && buildMode.enabled ? (
        <p className="build-controls-dock__empty-hint">
          Build walls to make your first room, or drop a Room stamp.
        </p>
      ) : null}

      <div className="build-controls-dock__bar">
        <button
          type="button"
          className={`build-controls-dock__toggle hud-btn${buildMode.enabled ? " build-controls-dock__toggle--on" : ""}`}
          onClick={buildMode.toggle}
        >
          {buildMode.enabled ? "Build on" : "Build off"}
        </button>

        {buildMode.enabled ? (
          <>
            <div className="build-controls-dock__tools" role="toolbar" aria-label="Build tools">
              {TOOL_OPTIONS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={`build-controls-dock__tool hud-btn${
                    !buildMode.selectedStampId && buildMode.tool === tool.id
                      ? " build-controls-dock__tool--active"
                      : ""
                  }`}
                  aria-pressed={!buildMode.selectedStampId && buildMode.tool === tool.id}
                  onClick={() => buildMode.setTool(tool.id)}
                  title={`${tool.label} (${tool.shortcut})`}
                >
                  {tool.label}
                </button>
              ))}
            </div>

            <div className="build-controls-dock__stamps" role="toolbar" aria-label="Build stamps">
              {BUILTIN_BUILD_STAMPS.map((stamp) => (
                <button
                  key={stamp.id}
                  type="button"
                  className={`build-controls-dock__tool hud-btn${
                    buildMode.selectedStampId === stamp.id ? " build-controls-dock__tool--active" : ""
                  }`}
                  aria-pressed={buildMode.selectedStampId === stamp.id}
                  onClick={() =>
                    buildMode.selectStamp(buildMode.selectedStampId === stamp.id ? null : stamp.id)
                  }
                  title={stamp.description}
                >
                  {stamp.label}
                </button>
              ))}
            </div>

            {!compact ? (
              <div className="build-controls-dock__materials build-controls-dock__desktop-only" aria-label="Build materials">
                {BUILD_MATERIAL_OPTIONS.map((materialId) => (
                  <button
                    key={materialId}
                    type="button"
                    className={`build-controls-dock__swatch build-controls-dock__swatch--${materialId}${buildMode.materialId === materialId ? " build-controls-dock__swatch--active" : ""}`}
                    aria-label={materialId}
                    aria-pressed={buildMode.materialId === materialId}
                    onClick={() => buildMode.setMaterialId(materialId as BuildPieceMaterial)}
                  />
                ))}
              </div>
            ) : null}

            <button
              type="button"
              className="build-controls-dock__rotate hud-btn build-controls-dock__mobile-only"
              onClick={buildMode.rotate}
              title="Rotate (R)"
            >
              ↻ {buildMode.rotation}°
            </button>

            <button
              type="button"
              className={`build-controls-dock__tool hud-btn build-controls-dock__mobile-only${
                buildMode.tool === "destroy" ? " build-controls-dock__tool--active" : ""
              }`}
              aria-pressed={buildMode.tool === "destroy"}
              onClick={() => buildMode.setTool("destroy")}
              title="Destroy (4)"
            >
              ✕
            </button>

            {onPlaceAhead ? (
              <button
                type="button"
                className="build-controls-dock__place-ahead hud-btn build-controls-dock__mobile-only"
                disabled={placeAheadDisabled || buildMode.tool === "destroy" || Boolean(buildMode.selectedStampId)}
                onClick={onPlaceAhead}
                title="Place in the cell ahead of you"
              >
                Place ahead
              </button>
            ) : null}

            {onUndo ? (
              <button type="button" className="build-controls-dock__undo hud-btn" onClick={onUndo} title="Undo (⌘Z)">
                Undo
              </button>
            ) : null}
            {onRedo ? (
              <button type="button" className="build-controls-dock__redo hud-btn" onClick={onRedo} title="Redo (⌘⇧Z)">
                Redo
              </button>
            ) : null}

            <button
              type="button"
              className="build-controls-dock__clear hud-btn"
              disabled={clearing || pieceCount === 0}
              onClick={() => {
                if (!window.confirm(`Clear all ${pieceCount} build piece${pieceCount === 1 ? "" : "s"} in this room?`)) return;
                setClearing(true);
                void onClearAll()
                  .then(() => buildMode.setStatusMessage("All build pieces cleared."))
                  .catch((err) =>
                    buildMode.setStatusMessage(err instanceof Error ? err.message : "Unable to clear build pieces.")
                  )
                  .finally(() => setClearing(false));
              }}
            >
              {clearing ? "Clearing…" : "Clear all"}
            </button>

            {onReturnToSpawn ? (
              <button
                type="button"
                className="build-controls-dock__unstick hud-btn"
                onClick={onReturnToSpawn}
                title="Return to spawn if stuck"
              >
                Spawn
              </button>
            ) : null}
          </>
        ) : (
          <p className="build-controls-dock__hint">Place walls, floors, and ramps — anyone can build or remove.</p>
        )}

        <span className="build-controls-dock__count">{pieceCount}</span>
      </div>

      {error ? <p className="build-controls-dock__status build-controls-dock__status--error">{error}</p> : null}
      {buildMode.statusMessage ? <p className="build-controls-dock__status">{buildMode.statusMessage}</p> : null}
    </div>
  );
}
