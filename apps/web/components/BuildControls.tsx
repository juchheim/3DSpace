"use client";

import { useEffect, useState } from "react";
import type { BuildPieceMaterial } from "@3dspace/contracts";
import { BUILD_MATERIAL_OPTIONS } from "./buildMaterials";
import { BUILTIN_BUILD_STAMPS } from "../lib/buildStamps";
import type { BuildModeController, BuildTool } from "../lib/useBuildMode";
import { WORLD_ASSET_CATALOG } from "../lib/worldAssetCatalog";

const BUILD_COACHMARK_KEY = "3dspace-build-coachmark-dismissed";

type BuildCategory = "build" | "objects" | "stamps";

/** Tools shown in the Build palette. Destroy is surfaced as a separate erase mode. */
const BUILD_TOOLS: Array<{ id: BuildTool; label: string; shortcut: string; group: "structure" | "fixture" }> = [
  { id: "wall", label: "Wall", shortcut: "1", group: "structure" },
  { id: "simple-wall", label: "Simple Wall", shortcut: "9", group: "structure" },
  { id: "floor", label: "Floor", shortcut: "2", group: "structure" },
  { id: "ramp", label: "Ramp", shortcut: "3", group: "structure" },
  { id: "doorway", label: "Door", shortcut: "5", group: "structure" },
  { id: "window", label: "Window", shortcut: "6", group: "structure" },
  { id: "light", label: "Light", shortcut: "7", group: "fixture" },
  { id: "mirror", label: "Mirror", shortcut: "8", group: "fixture" }
];

const MATERIAL_LABELS: Record<BuildPieceMaterial, string> = {
  stone: "Stone",
  wood: "Wood",
  metal: "Metal",
  glass: "Glass",
  neon: "Neon"
};

const CATEGORIES: Array<{ id: BuildCategory; label: string }> = [
  { id: "build", label: "Build" },
  { id: "objects", label: "Objects" },
  { id: "stamps", label: "Stamps" }
];

/** Crisp 16px line icons so the palette reads at a glance (matches the lobby's clean aesthetic). */
function Glyph({
  id
}: {
  id: BuildTool | "stamp" | "object" | "erase" | "tab-build" | "tab-objects" | "tab-stamps";
}) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };
  switch (id) {
    case "wall":
    case "simple-wall":
    case "tab-build":
      return (
        <svg {...common}>
          <rect x="2.3" y="3.3" width="11.4" height="9.4" rx="1" />
          {id === "simple-wall" ? (
            <path d="M2.3 8h11.4" />
          ) : (
            <path d="M2.3 6.4h11.4M2.3 9.6h11.4M8 3.3v3.1M5 6.4v3.2M11 6.4v3.2M8 9.6v3.1" />
          )}
        </svg>
      );
    case "floor":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
          <path d="M2.5 8h11M8 2.5v11" />
          <rect x="2.5" y="2.5" width="5.5" height="5.5" fill="currentColor" stroke="none" opacity="0.22" />
        </svg>
      );
    case "ramp":
      return (
        <svg {...common}>
          <path d="M2.6 12.6h10.8L2.6 4.6z" />
        </svg>
      );
    case "doorway":
      return (
        <svg {...common}>
          <path d="M4 13.4V4.2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v9.2" />
          <path d="M3 13.4h10" />
          <circle cx="10" cy="8.3" r="0.75" fill="currentColor" stroke="none" />
        </svg>
      );
    case "window":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
          <path d="M2.5 8h11M8 2.5v11" />
        </svg>
      );
    case "light":
      return (
        <svg {...common}>
          <path d="M8 1.9a4.1 4.1 0 0 0-2.5 7.4c.5.4.8 1 .8 1.6v.2h3.4v-.2c0-.6.3-1.2.8-1.6A4.1 4.1 0 0 0 8 1.9Z" />
          <path d="M6.5 13.2h3M7 14.6h2" />
        </svg>
      );
    case "mirror":
      return (
        <svg {...common}>
          <ellipse cx="8" cy="8" rx="3.9" ry="5.3" />
          <path d="M6 5.1c-.9 1-1.2 2.5-.7 4" />
        </svg>
      );
    case "erase":
      return (
        <svg {...common}>
          <path d="M6.8 12.7h6.4" />
          <path d="M3.1 9.8l4.3-4.3a1.4 1.4 0 0 1 2 0l2.3 2.3a1.4 1.4 0 0 1 0 2l-3.6 3.6H5.4z" />
        </svg>
      );
    case "object":
    case "tab-objects":
      return (
        <svg {...common}>
          <path d="M8 2.4 13.4 5.5v5L8 13.6 2.6 10.5v-5z" />
          <path d="M2.6 5.5 8 8.6l5.4-3.1M8 8.6v5" />
        </svg>
      );
    case "stamp":
    case "tab-stamps":
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="11" height="10" rx="1" />
          <path d="M6.4 13v-2.6h3.2V13" />
          <path d="M2.5 6.4h11" />
        </svg>
      );
    default:
      return null;
  }
}

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
  onRedo,
  selectedAssetSlug = null,
  onSelectAsset,
  finePlacement = false,
  onToggleFinePlacement
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
  /** Currently selected world-asset slug, or null. */
  selectedAssetSlug?: string | null;
  /** Called when the user selects / deselects an asset to enter placement mode. */
  onSelectAsset?: (slug: string | null) => void;
  /** Fine object placement: clicks set down a draft to nudge & rotate in small steps. */
  finePlacement?: boolean;
  onToggleFinePlacement?: () => void;
}) {
  const [clearing, setClearing] = useState(false);
  const [showCoachmark, setShowCoachmark] = useState(false);
  const [category, setCategory] = useState<BuildCategory>(() =>
    selectedAssetSlug ? "objects" : buildMode.selectedStampId ? "stamps" : "build"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowCoachmark(!window.localStorage.getItem(BUILD_COACHMARK_KEY));
  }, []);

  function dismissCoachmark() {
    window.localStorage.setItem(BUILD_COACHMARK_KEY, "1");
    setShowCoachmark(false);
  }

  const erasing = buildMode.tool === "destroy";
  const toolActive = !selectedAssetSlug && !buildMode.selectedStampId && !erasing;

  return (
    <div
      className={`build-dock${compact ? " build-dock--compact" : ""}${buildMode.enabled ? " build-dock--open" : ""}`}
      aria-label="World builder"
    >
      {/* ── Collapsed: a single, calm entry control ──────────────────────────── */}
      {!buildMode.enabled ? (
        <div className="build-dock__rail">
          <button
            type="button"
            className="build-dock__power"
            onClick={buildMode.toggle}
            aria-pressed={false}
          >
            <span className="build-dock__power-dot" />
            Build off
          </button>
          <p className="build-dock__rail-hint">Place walls, floors &amp; objects — anyone can build or remove.</p>
        </div>
      ) : (
        <div className="build-dock__panel" role="group" aria-label="World builder controls">
          {showCoachmark ? (
            <div className="build-dock__tip" role="status">
              <span className="build-dock__tip-key">Tips</span>
              <p>
                Pick a piece, then <strong>click</strong> or <strong>drag</strong> in the world to place ·{" "}
                <kbd>R</kbd> rotate · <kbd>⌘Z</kbd> undo
              </p>
              <button type="button" className="build-dock__tip-dismiss" onClick={dismissCoachmark} aria-label="Dismiss tips">
                ✕
              </button>
            </div>
          ) : null}

          {emptyCanvasHint && pieceCount === 0 ? (
            <p className="build-dock__empty">Build walls to make your first room, or drop a Room stamp below.</p>
          ) : null}

          {/* ── Header: power, title, live count, history & utilities ───────────── */}
          <header className="build-dock__head">
            <button
              type="button"
              className="build-dock__power build-dock__power--on"
              onClick={buildMode.toggle}
              aria-pressed={true}
              title="Turn build mode off"
            >
              <span className="build-dock__power-dot" />
              Build on
            </button>

            <div className="build-dock__title">
              <span className="build-dock__title-text">World Builder</span>
              <span className="build-dock__count" title={`${pieceCount} pieces in this room`}>
                {pieceCount} <span>piece{pieceCount === 1 ? "" : "s"}</span>
              </span>
            </div>

            <div className="build-dock__utils" role="toolbar" aria-label="Builder utilities">
              {onUndo ? (
                <button type="button" className="build-dock__util" onClick={onUndo} title="Undo (⌘Z)" aria-label="Undo">
                  ↺
                </button>
              ) : null}
              {onRedo ? (
                <button type="button" className="build-dock__util" onClick={onRedo} title="Redo (⌘⇧Z)" aria-label="Redo">
                  ↻
                </button>
              ) : null}
              <button
                type="button"
                className={`build-dock__util build-dock__util--erase${erasing ? " is-active" : ""}`}
                aria-pressed={erasing}
                onClick={() => {
                  onSelectAsset?.(null);
                  buildMode.setTool(erasing ? "wall" : "destroy");
                }}
                title="Erase / destroy pieces (4)"
              >
                <Glyph id="erase" />
              </button>
              <button
                type="button"
                className="build-dock__util build-dock__util--danger"
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
                title="Clear everything in this room"
              >
                {clearing ? "…" : "Clear"}
              </button>
              {onReturnToSpawn ? (
                <button
                  type="button"
                  className="build-dock__util"
                  onClick={onReturnToSpawn}
                  title="Return to spawn if stuck"
                  aria-label="Return to spawn"
                >
                  ⌂
                </button>
              ) : null}
            </div>
          </header>

          {/* ── Category tabs ──────────────────────────────────────────────────── */}
          <nav className="build-dock__tabs" role="tablist" aria-label="Builder categories">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={category === cat.id}
                className={`build-dock__tab${category === cat.id ? " is-active" : ""}`}
                onClick={() => setCategory(cat.id)}
              >
                <Glyph id={`tab-${cat.id}` as "tab-build" | "tab-objects" | "tab-stamps"} />
                {cat.label}
              </button>
            ))}
          </nav>

          {/* ── Palette body ───────────────────────────────────────────────────── */}
          <div className="build-dock__body">
            {category === "build" ? (
              <div className="build-dock__grid" role="toolbar" aria-label="Build pieces">
                {BUILD_TOOLS.map((tool) => {
                  const active = toolActive && buildMode.tool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      className={`build-dock__tile${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() => {
                        onSelectAsset?.(null);
                        buildMode.setTool(tool.id);
                      }}
                      title={`${tool.label} (${tool.shortcut})`}
                    >
                      <span className="build-dock__tile-icon">
                        <Glyph id={tool.id} />
                      </span>
                      <span className="build-dock__tile-label">{tool.label}</span>
                      <kbd className="build-dock__tile-key">{tool.shortcut}</kbd>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {category === "objects" && onToggleFinePlacement ? (
              <div className="build-dock__fine-row">
                <button
                  type="button"
                  className={`build-dock__fine${finePlacement ? " is-active" : ""}`}
                  aria-pressed={finePlacement}
                  onClick={onToggleFinePlacement}
                  title="Fine placement: click sets down a draft you can nudge and rotate in small steps before confirming"
                >
                  <span className="build-dock__fine-dot" />
                  Fine placement
                </button>
                <span className="build-dock__fine-sub">
                  {finePlacement
                    ? "Click sets a draft — nudge & rotate, then confirm."
                    : "Off — objects drop instantly at 90° turns."}
                </span>
              </div>
            ) : null}

            {category === "objects" ? (
              <div className="build-dock__grid" role="toolbar" aria-label="World objects">
                {WORLD_ASSET_CATALOG.map((asset) => {
                  const active = selectedAssetSlug === asset.slug;
                  return (
                    <button
                      key={asset.slug}
                      type="button"
                      className={`build-dock__tile build-dock__tile--object${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      title={active
                        ? `${asset.displayName} — click to cancel · click in world to place · R rotate`
                        : `${asset.displayName} — click to start placing`}
                      onClick={() => {
                        if (active) {
                          onSelectAsset?.(null);
                          return;
                        }
                        buildMode.selectStamp(null);
                        onSelectAsset?.(asset.slug);
                      }}
                    >
                      <span className="build-dock__tile-icon build-dock__tile-icon--thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={asset.thumbnailUrl} alt="" />
                      </span>
                      <span className="build-dock__tile-label">{asset.displayName}</span>
                    </button>
                  );
                })}
                {WORLD_ASSET_CATALOG.length === 0 ? (
                  <p className="build-dock__placeholder">No objects available yet.</p>
                ) : null}
              </div>
            ) : null}

            {category === "stamps" ? (
              <div className="build-dock__grid" role="toolbar" aria-label="Build stamps">
                {BUILTIN_BUILD_STAMPS.map((stamp) => {
                  const active = buildMode.selectedStampId === stamp.id;
                  return (
                    <button
                      key={stamp.id}
                      type="button"
                      className={`build-dock__tile build-dock__tile--wide${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() => {
                        onSelectAsset?.(null);
                        buildMode.selectStamp(active ? null : stamp.id);
                      }}
                      title={stamp.description}
                    >
                      <span className="build-dock__tile-icon">
                        <Glyph id="stamp" />
                      </span>
                      <span className="build-dock__tile-stack">
                        <span className="build-dock__tile-label">{stamp.label}</span>
                        <span className="build-dock__tile-sub">{stamp.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Contextual placement hint for object / stamp modes */}
            {selectedAssetSlug ? (
              <p className="build-dock__inline-hint">
                {finePlacement ? (
                  <>
                    Click to set down a draft · drag or <kbd>↑↓←→</kbd> nudge · <kbd>Q</kbd>/<kbd>E</kbd> rotate 5° ·{" "}
                    <kbd>⏎</kbd> place · <kbd>Esc</kbd> cancel
                  </>
                ) : (
                  <>
                    Click in the world to place · <kbd>R</kbd> rotate · <kbd>Esc</kbd> cancel
                  </>
                )}
              </p>
            ) : null}
          </div>

          {/* ── Properties: material + rotation ────────────────────────────────── */}
          <footer className="build-dock__props">
            <div className="build-dock__prop">
              <span className="build-dock__prop-label">Material</span>
              <div className="build-dock__swatches" role="toolbar" aria-label="Build materials">
                {BUILD_MATERIAL_OPTIONS.map((materialId) => (
                  <button
                    key={materialId}
                    type="button"
                    className={`build-dock__swatch build-dock__swatch--${materialId}${buildMode.materialId === materialId ? " is-active" : ""}`}
                    aria-label={MATERIAL_LABELS[materialId]}
                    aria-pressed={buildMode.materialId === materialId}
                    title={MATERIAL_LABELS[materialId]}
                    onClick={() => buildMode.setMaterialId(materialId as BuildPieceMaterial)}
                  />
                ))}
              </div>
            </div>

            <div className="build-dock__prop">
              <span className="build-dock__prop-label">Rotate</span>
              <button type="button" className="build-dock__rotate" onClick={buildMode.rotate} title="Rotate (R)">
                <span className="build-dock__rotate-icon">↻</span>
                <span className="build-dock__rotate-deg">{buildMode.rotation}°</span>
              </button>
            </div>

            {onPlaceAhead ? (
              <button
                type="button"
                className="build-dock__place-ahead build-dock__mobile-only"
                disabled={placeAheadDisabled || erasing || Boolean(buildMode.selectedStampId)}
                onClick={onPlaceAhead}
                title="Place in the cell ahead of you"
              >
                Place ahead
              </button>
            ) : null}
          </footer>

          {error ? <p className="build-dock__status build-dock__status--error">{error}</p> : null}
          {buildMode.statusMessage ? <p className="build-dock__status">{buildMode.statusMessage}</p> : null}
        </div>
      )}
    </div>
  );
}
