"use client";

import { useEffect, useRef, useState } from "react";
import { IMAGE_FLOOR_TEXTURE_SPAN_OPTIONS, type BuildPieceMaterial } from "@3dspace/contracts";
import { BUILD_MATERIAL_OPTIONS } from "./buildMaterials";
import {
  BUILD_FLOOR_TEXTURE_PRESETS,
  isBuildFloorTexturePresetFileName,
  type BuildFloorTexturePreset
} from "../lib/buildFloorTexturePresets";
import type { BuildModeController, BuildTool, FloorTextureSelection } from "../lib/useBuildMode";
import {
  WORLD_OBJECT_CATALOG,
  WORLD_SCENE_CATALOG,
  worldAssetBySlug,
  worldAssetCategory
} from "../lib/worldAssetCatalog";

const BUILD_COACHMARK_KEY = "3dspace-build-coachmark-dismissed";

type BuildCategory = "build" | "objects" | "scenes";

/** Tools shown in the Build palette. Destroy is surfaced as a separate erase mode. */
const BUILD_TOOLS: Array<{ id: BuildTool; label: string; shortcut?: string; group: "structure" | "fixture" }> = [
  { id: "wall", label: "Wall", shortcut: "1", group: "structure" },
  { id: "simple-wall", label: "Simple Wall", shortcut: "9", group: "structure" },
  { id: "floor", label: "Floor", shortcut: "2", group: "structure" },
  { id: "image-floor", label: "Image Floor", shortcut: "0", group: "structure" },
  { id: "ramp", label: "Ramp", shortcut: "3", group: "structure" },
  { id: "doorway", label: "Door", shortcut: "5", group: "structure" },
  { id: "window", label: "Window", shortcut: "6", group: "structure" },
  { id: "light", label: "Light", shortcut: "7", group: "fixture" },
  { id: "mirror", label: "Mirror", shortcut: "8", group: "fixture" },
  { id: "arbor-ceiling", label: "Wood Arbor Ceiling", group: "fixture" },
  { id: "arbor-futuristic-ceiling", label: "Futuristic Arbor Ceiling", group: "fixture" },
  { id: "ceiling-futuristic-lighting", label: "Futuristic Lighting Ceiling", group: "fixture" },
  { id: "ceiling-futuristic", label: "Futuristic Ceiling", group: "fixture" }
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
  { id: "scenes", label: "Scenes" }
];

function buildCategoryForAssetSlug(slug: string | null | undefined): BuildCategory {
  if (!slug) return "build";
  const asset = worldAssetBySlug(slug);
  if (!asset) return "objects";
  return worldAssetCategory(asset) === "scene" ? "scenes" : "objects";
}

/** Crisp 16px line icons so the palette reads at a glance (matches the lobby's clean aesthetic). */
function Glyph({
  id
}: {
  id: BuildTool | "object" | "scene" | "erase" | "tab-build" | "tab-objects" | "tab-scenes";
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
    case "image-floor":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
          <circle cx="6" cy="6" r="1.1" />
          <path d="M2.5 11.2 6.2 8l2.6 2.2 2.2-1.8 2.5 2.1" />
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
    case "arbor-ceiling":
    case "arbor-futuristic-ceiling":
    case "ceiling-futuristic-lighting":
    case "ceiling-futuristic":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1" strokeDasharray="2 1.6" />
          <path d="M2.5 8h11M8 2.5v11" />
          {id === "ceiling-futuristic-lighting" ? (
            <>
              <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" opacity="0.35" />
              <path d="M8 4.8v6.4M5.6 8h4.8" />
            </>
          ) : (
            <rect x="5.5" y="5.5" width="5" height="5" rx="0.6" strokeDasharray="1.2 1" />
          )}
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
    case "scene":
    case "tab-scenes":
      return (
        <svg {...common}>
          <path d="M2.2 12.8h11.6" />
          <path d="M3.4 12.8V8.4l2.2-2.1 2.4 1.8 2.8-2.3 2.6 2.4v4.6" />
          <path d="M3.4 8.4 5.6 6.3 8 8.1l2.8-2.3 2.6 2.4" />
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
  scatterCount = 1,
  onScatterCountChange,
  finePlacement = false,
  onToggleFinePlacement,
  onUploadFloorTexture,
  onSelectFloorTexturePreset,
  floorTextureOptions = []
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
  /** Instances strewn per click for scatter assets (e.g. Tall Grass patches). */
  scatterCount?: number;
  onScatterCountChange?: (count: number) => void;
  /** Fine object placement: clicks set down a draft to nudge & rotate in small steps. */
  finePlacement?: boolean;
  onToggleFinePlacement?: () => void;
  /** Uploads a floor image and selects it for the Image Floor tool. */
  onUploadFloorTexture?: (file: File) => Promise<void>;
  /** Selects a built-in floor preset (uploads to the room on first use). */
  onSelectFloorTexturePreset?: (preset: BuildFloorTexturePreset) => Promise<void>;
  /** Images already laid as floors in this room, so a floor can be extended later. */
  floorTextureOptions?: FloorTextureSelection[];
}) {
  const [clearing, setClearing] = useState(false);
  const [showCoachmark, setShowCoachmark] = useState(false);
  const [uploadingTexture, setUploadingTexture] = useState(false);
  const floorTextureInputRef = useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState<BuildCategory>(() =>
    selectedAssetSlug ? buildCategoryForAssetSlug(selectedAssetSlug) : "build"
  );

  useEffect(() => {
    if (!selectedAssetSlug) return;
    setCategory(buildCategoryForAssetSlug(selectedAssetSlug));
  }, [selectedAssetSlug]);

  async function handleFloorTextureFile(file: File | undefined) {
    if (!file || !onUploadFloorTexture) return;
    setUploadingTexture(true);
    try {
      await onUploadFloorTexture(file);
      buildMode.setStatusMessage("Floor image ready — drag on the ground to lay it.");
    } catch (err) {
      buildMode.setStatusMessage(err instanceof Error ? err.message : "Unable to upload floor image.");
    } finally {
      setUploadingTexture(false);
    }
  }

  async function handleFloorTexturePreset(preset: BuildFloorTexturePreset) {
    if (!onSelectFloorTexturePreset) return;
    setUploadingTexture(true);
    try {
      await onSelectFloorTexturePreset(preset);
      buildMode.setStatusMessage("Floor image ready — drag on the ground to lay it.");
    } catch (err) {
      buildMode.setStatusMessage(err instanceof Error ? err.message : "Unable to load floor preset.");
    } finally {
      setUploadingTexture(false);
    }
  }

  const roomFloorTextureOptions = floorTextureOptions.filter(
    (option) => !isBuildFloorTexturePresetFileName(option.fileName)
  );
  const showFloorTextureSwatches =
    BUILD_FLOOR_TEXTURE_PRESETS.length > 0 || roomFloorTextureOptions.length > 0;

  function isFloorTextureActive(selection: {
    storageKey?: string;
    fileName?: string;
    presetSlug?: string;
  }) {
    if (!buildMode.floorTexture) return false;
    if (selection.presetSlug && buildMode.floorTexture.presetSlug === selection.presetSlug) return true;
    if (selection.storageKey && buildMode.floorTexture.storageKey === selection.storageKey) return true;
    return (
      selection.fileName !== undefined &&
      buildMode.floorTexture.fileName === selection.fileName
    );
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowCoachmark(!window.localStorage.getItem(BUILD_COACHMARK_KEY));
  }, []);

  function dismissCoachmark() {
    window.localStorage.setItem(BUILD_COACHMARK_KEY, "1");
    setShowCoachmark(false);
  }

  const erasing = buildMode.tool === "destroy";
  const toolActive = !selectedAssetSlug && !erasing;
  const selectedScatter = selectedAssetSlug
    ? worldAssetBySlug(selectedAssetSlug)?.scatter
    : undefined;
  const placementCatalog = category === "scenes" ? WORLD_SCENE_CATALOG : WORLD_OBJECT_CATALOG;
  const placementModeActive = category === "objects" || category === "scenes";

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
            <p className="build-dock__empty">Build walls to make your first room.</p>
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
                <Glyph id={`tab-${cat.id}` as "tab-build" | "tab-objects" | "tab-scenes"} />
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
                      title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                    >
                      <span className="build-dock__tile-icon">
                        <Glyph id={tool.id} />
                      </span>
                      <span className="build-dock__tile-label">{tool.label}</span>
                      {tool.shortcut ? (
                        <kbd className="build-dock__tile-key">{tool.shortcut}</kbd>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* ── Image Floor: pick an image, then drag a rectangle on the ground ── */}
            {category === "build" && toolActive && buildMode.tool === "image-floor" ? (
              <div className="build-dock__image-floor" role="group" aria-label="Image floor texture">
                <input
                  ref={floorTextureInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => {
                    void handleFloorTextureFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />

                {buildMode.floorTexture ? (
                  <div className="build-dock__image-floor-current">
                    <span className="build-dock__image-floor-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={buildMode.floorTexture.url} alt="" loading="lazy" decoding="async" />
                    </span>
                    <span className="build-dock__image-floor-meta">
                      <span className="build-dock__image-floor-name">
                        {buildMode.floorTexture.fileName ?? "Floor image"}
                      </span>
                      <span className="build-dock__image-floor-sub">
                        Drag on the ground — one image covers {buildMode.floorTextureSpanCells}×
                        {buildMode.floorTextureSpanCells} cells; extend to reveal more.
                      </span>
                    </span>
                    <button
                      type="button"
                      className="build-dock__util"
                      disabled={uploadingTexture}
                      onClick={() => floorTextureInputRef.current?.click()}
                      title="Use a different image"
                    >
                      {uploadingTexture ? "…" : "Swap"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="build-dock__image-floor-upload"
                    disabled={uploadingTexture || !onUploadFloorTexture}
                    onClick={() => floorTextureInputRef.current?.click()}
                  >
                    <Glyph id="image-floor" />
                    {uploadingTexture ? "Uploading…" : "Upload floor image"}
                  </button>
                )}

                <div className="build-dock__image-floor-span" role="group" aria-label="Image scale on floor">
                  <span className="build-dock__prop-label">Image span</span>
                  <div className="build-dock__image-floor-span-options">
                    {IMAGE_FLOOR_TEXTURE_SPAN_OPTIONS.map((span) => (
                      <button
                        key={span}
                        type="button"
                        className={`build-dock__image-floor-span-btn${
                          buildMode.floorTextureSpanCells === span ? " is-active" : ""
                        }`}
                        aria-pressed={buildMode.floorTextureSpanCells === span}
                        title={`One image covers ${span}×${span} build cells`}
                        onClick={() => buildMode.setFloorTextureSpanCells(span)}
                      >
                        {span}×{span}
                      </button>
                    ))}
                  </div>
                </div>

                {showFloorTextureSwatches ? (
                  <div className="build-dock__image-floor-recents" role="toolbar" aria-label="Floor images in this room">
                    <span className="build-dock__prop-label">In this room</span>
                    <div className="build-dock__image-floor-swatches">
                      {BUILD_FLOOR_TEXTURE_PRESETS.map((preset) => (
                        <button
                          key={preset.slug}
                          type="button"
                          className={`build-dock__image-floor-swatch${
                            isFloorTextureActive({ presetSlug: preset.slug }) ? " is-active" : ""
                          }`}
                          title={`${preset.label} floor texture`}
                          disabled={uploadingTexture || !onSelectFloorTexturePreset}
                          onClick={() => void handleFloorTexturePreset(preset)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={preset.url} alt="" loading="lazy" decoding="async" />
                        </button>
                      ))}
                      {roomFloorTextureOptions.map((option) => (
                        <button
                          key={option.storageKey}
                          type="button"
                          className={`build-dock__image-floor-swatch${
                            isFloorTextureActive(option) ? " is-active" : ""
                          }`}
                          title={option.fileName ?? "Reuse this floor image (extends the existing floor)"}
                          onClick={() => buildMode.setFloorTexture(option)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={option.url} alt="" loading="lazy" decoding="async" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="build-dock__inline-hint">
                  {buildMode.floorTexture ? (
                    <>
                      <strong>Drag</strong> to sweep out any size · drag again from an edge to extend ·{" "}
                      <kbd>4</kbd> erase tiles
                    </>
                  ) : (
                    <>Pick a preset below, upload your own, or reuse an image already in this room.</>
                  )}
                </p>
              </div>
            ) : null}

            {(category === "objects" || category === "scenes") && onToggleFinePlacement ? (
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

            {placementModeActive ? (
              <div className="build-dock__grid" role="toolbar" aria-label={category === "scenes" ? "World scenes" : "World objects"}>
                {placementCatalog.map((asset) => {
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
                {placementCatalog.length === 0 ? (
                  <p className="build-dock__placeholder">
                    {category === "scenes" ? "No scenes available yet." : "No objects available yet."}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Scatter density: how many instances one click strews across its square */}
            {category === "objects" && selectedScatter && onScatterCountChange ? (
              <div className="build-dock__scatter" role="group" aria-label="Scatter density">
                <span className="build-dock__prop-label">Patches per square</span>
                <div className="build-dock__scatter-row">
                  <input
                    type="range"
                    min={selectedScatter.minCount}
                    max={selectedScatter.maxCount}
                    step={1}
                    value={scatterCount}
                    onChange={(event) => onScatterCountChange(Number(event.target.value))}
                    aria-label="Patches strewn per placement"
                  />
                  <span className="build-dock__scatter-count">{scatterCount}</span>
                </div>
                <span className="build-dock__scatter-sub">
                  Each click strews {scatterCount} patch{scatterCount === 1 ? "" : "es"} across a{" "}
                  {selectedScatter.areaSize}×{selectedScatter.areaSize} m square.
                </span>
              </div>
            ) : null}

            {/* Contextual placement hint for object modes */}
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
                disabled={placeAheadDisabled || erasing}
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
