"use client";

import { useEffect, useRef, useState } from "react";
import {
  IMAGE_FLOOR_TEXTURE_SPAN_OPTIONS,
  ROOM_LIGHT_MAX_PER_ROOM,
  type BuildPieceMaterial,
  type CustomWorldAsset,
  type WorldAssetObjectRole,
  type WorldAssetPlacementKind
} from "@3dspace/contracts";
import { EnvironmentPanel } from "./lighting/EnvironmentPanel";
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

type BuildCategory = "build" | "objects" | "scenes" | "uploads" | "lighting";

/** Classification choices for an uploaded GLB, with the placement rule each implies. */
const PLACEMENT_OPTIONS: Array<{
  id: WorldAssetPlacementKind;
  label: string;
  hint: string;
  glyph: BuildTool;
}> = [
  { id: "other", label: "Object", hint: "Rests on the floor · rotate freely (chairs, props).", glyph: "wall" },
  { id: "floor", label: "Floor", hint: "Lies flat on the ground (rugs, decals).", glyph: "floor" },
  { id: "wall", label: "Wall", hint: "Snaps flat against the nearest wall, facing in.", glyph: "window" },
  { id: "ceiling", label: "Ceiling", hint: "Mounts up at ceiling height, facing down.", glyph: "arbor-ceiling" }
];

/**
 * Optional interactive behaviour for an **object** upload. `null` = a plain prop.
 * Picking one gives the placed model the matching built-in behaviour: a chair
 * can be sat in (and opens the notebook); a podium can be presented at.
 */
const OBJECT_ROLE_OPTIONS: Array<{ id: WorldAssetObjectRole | null; label: string; hint: string }> = [
  { id: null, label: "None", hint: "A plain prop — decoration only." },
  { id: "chair", label: "Chair", hint: "Sit in it with E; opens the personal notebook." },
  { id: "podium", label: "Podium", hint: "Present at it with E; opens the importable notebook." }
];

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
  { id: "scenes", label: "Scenes" },
  { id: "uploads", label: "Uploads" },
  { id: "lighting", label: "Lighting" }
];

/** Max uploaded GLB size (bytes) — mirrors CUSTOM_ASSET_MAX_GLB_BYTES on the server. */
const MAX_GLB_BYTES = 25 * 1024 * 1024;

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
  id: BuildTool | "object" | "scene" | "erase" | "tab-build" | "tab-objects" | "tab-scenes" | "tab-uploads" | "tab-lighting";
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
    case "tab-uploads":
      return (
        <svg {...common}>
          <path d="M8 10.2V2.6" />
          <path d="M5.2 5.4 8 2.6l2.8 2.8" />
          <path d="M2.8 9.4v2.6a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1V9.4" />
        </svg>
      );
    case "tab-lighting":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.6" />
          <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3" />
        </svg>
      );
    default:
      return null;
  }
}

/** Small inline SVG icons for each light type. */
function LightTypeGlyph({ type }: { type: "point" | "spot" | "area" }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };
  if (type === "point") {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="3" />
        <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4" />
      </svg>
    );
  }
  if (type === "spot") {
    return (
      <svg {...common}>
        <circle cx="10" cy="5" r="2" />
        <path d="M7 8l-3 10h12L13 8z" />
      </svg>
    );
  }
  // area
  return (
    <svg {...common}>
      <rect x="3" y="6" width="14" height="8" rx="1" />
      <path d="M10 3v3M10 14v3M3 10H1M19 10h-2" />
    </svg>
  );
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
  floorTextureOptions = [],
  customAssets = [],
  selectedCustomAssetId = null,
  onUploadCustomAsset,
  onDeleteCustomAsset,
  onSetCustomAssetRole,
  onSelectCustomAsset,
  customScale = 1,
  onCustomScaleChange,
  assetYawDeg = 0,
  onRotateAsset,
  onCategoryChange,
  lights,
  selectedLightId,
  roomEnvironment,
  onAddLight,
  onSelectLight,
  onFocusLight,
  onUpdateLight,
  onDeleteLight,
  onUpdateEnvironment
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
  /** The signed-in user's private uploaded-GLB library. */
  customAssets?: CustomWorldAsset[];
  /** Currently selected custom asset id (placement mode), or null. */
  selectedCustomAssetId?: string | null;
  /** Upload + register a new custom GLB. Resolves once it joins the library. */
  onUploadCustomAsset?: (input: {
    glb: File;
    thumbnail: File;
    displayName: string;
    placement: WorldAssetPlacementKind;
    objectRole?: WorldAssetObjectRole;
  }) => Promise<void>;
  /** Remove a custom asset from the library. */
  onDeleteCustomAsset?: (assetId: string) => Promise<void>;
  /** Classify (or clear, with `null`) an existing object upload as a chair/podium. */
  onSetCustomAssetRole?: (assetId: string, objectRole: WorldAssetObjectRole | null) => Promise<void>;
  /** Select / deselect a custom asset to enter placement mode. */
  onSelectCustomAsset?: (assetId: string | null) => void;
  /** Per-placement size multiplier for the selected custom asset. */
  customScale?: number;
  onCustomScaleChange?: (scale: number) => void;
  /** Pending placement yaw (degrees) for the selected asset — shown on the rotator. */
  assetYawDeg?: number;
  /** Rotate the pending placement asset (catalog or custom) by a step. */
  onRotateAsset?: () => void;
  /** Reports the active builder category so the scene can route pointer input. */
  onCategoryChange?: (category: BuildCategory) => void;
  // Lighting tab props (flag-gated, all optional)
  lights?: import("@3dspace/contracts").RoomLight[];
  selectedLightId?: string | null;
  roomEnvironment?: import("@3dspace/contracts").RoomEnvironment | null;
  onAddLight?: (type: import("@3dspace/contracts").RoomLightType) => void;
  onSelectLight?: (id: string | null) => void;
  /** Frames the camera on the light (dock list acts as a navigator into the 3D editor). */
  onFocusLight?: (id: string) => void;
  onUpdateLight?: (id: string, patch: Partial<import("@3dspace/contracts").RoomLight>, commit?: boolean) => void;
  onDeleteLight?: (id: string) => void;
  onUpdateEnvironment?: (patch: Partial<import("@3dspace/contracts").RoomEnvironment>, commit?: boolean) => void;
}) {
  const [clearing, setClearing] = useState(false);
  const [showCoachmark, setShowCoachmark] = useState(false);
  const [uploadingTexture, setUploadingTexture] = useState(false);
  const floorTextureInputRef = useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState<BuildCategory>(() =>
    selectedAssetSlug ? buildCategoryForAssetSlug(selectedAssetSlug) : "build"
  );

  // ── Custom-upload form state ───────────────────────────────────────────────
  const glbInputRef = useRef<HTMLInputElement | null>(null);
  const thumbInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadGlb, setUploadGlb] = useState<File | null>(null);
  const [uploadThumb, setUploadThumb] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadPlacement, setUploadPlacement] = useState<WorldAssetPlacementKind>("other");
  const [uploadObjectRole, setUploadObjectRole] = useState<WorldAssetObjectRole | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  const thumbPreviewUrl = useRef<string | null>(null);
  useEffect(() => {
    if (thumbPreviewUrl.current) URL.revokeObjectURL(thumbPreviewUrl.current);
    thumbPreviewUrl.current = uploadThumb ? URL.createObjectURL(uploadThumb) : null;
    return () => {
      if (thumbPreviewUrl.current) URL.revokeObjectURL(thumbPreviewUrl.current);
    };
  }, [uploadThumb]);

  function pickGlb(file: File | undefined) {
    setUploadError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setUploadError("Choose a .glb file.");
      return;
    }
    if (file.size > MAX_GLB_BYTES) {
      setUploadError("That model is over 25 MB — please use a smaller .glb.");
      return;
    }
    setUploadGlb(file);
    if (!uploadName) setUploadName(file.name.replace(/\.glb$/i, "").slice(0, 120));
  }

  function pickThumb(file: File | undefined) {
    setUploadError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Thumbnail must be an image.");
      return;
    }
    setUploadThumb(file);
  }

  function resetUploadForm() {
    setUploadGlb(null);
    setUploadThumb(null);
    setUploadName("");
    setUploadPlacement("other");
    setUploadObjectRole(null);
  }

  async function handleUploadSubmit() {
    if (!onUploadCustomAsset || !uploadGlb || !uploadThumb || !uploadName.trim()) return;
    setUploading(true);
    setUploadError("");
    try {
      await onUploadCustomAsset({
        glb: uploadGlb,
        thumbnail: uploadThumb,
        displayName: uploadName.trim(),
        placement: uploadPlacement,
        // Only objects carry an interactive role; other placements ignore it.
        ...(uploadPlacement === "other" && uploadObjectRole ? { objectRole: uploadObjectRole } : {})
      });
      resetUploadForm();
      buildMode.setStatusMessage("Upload added to your library — pick it to place.");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (!selectedAssetSlug) return;
    setCategory(buildCategoryForAssetSlug(selectedAssetSlug));
  }, [selectedAssetSlug]);

  useEffect(() => {
    if (selectedCustomAssetId) setCategory("uploads");
  }, [selectedCustomAssetId]);

  useEffect(() => {
    onCategoryChange?.(category);
  }, [category, onCategoryChange]);

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
                <Glyph id={`tab-${cat.id}` as "tab-build" | "tab-objects" | "tab-scenes" | "tab-uploads" | "tab-lighting"} />
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

            {/* ── Uploads: bring your own GLB, classify it, then place ──────────── */}
            {category === "uploads" ? (
              <div className="build-dock__uploads" role="group" aria-label="Your uploads">
                <div className="build-dock__upload-card">
                  <input
                    ref={glbInputRef}
                    type="file"
                    accept=".glb,model/gltf-binary"
                    hidden
                    onChange={(event) => {
                      pickGlb(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <input
                    ref={thumbInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(event) => {
                      pickThumb(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />

                  <div className="build-dock__upload-files">
                    <button
                      type="button"
                      className={`build-dock__upload-drop${uploadGlb ? " is-set" : ""}`}
                      onClick={() => glbInputRef.current?.click()}
                      title="Choose a .glb model (max 25 MB)"
                    >
                      <Glyph id="tab-uploads" />
                      <span className="build-dock__upload-drop-text">
                        {uploadGlb ? uploadGlb.name : "Choose .glb model"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`build-dock__upload-thumb${uploadThumb ? " is-set" : ""}`}
                      onClick={() => thumbInputRef.current?.click()}
                      title="Choose a thumbnail image"
                    >
                      {uploadThumb && thumbPreviewUrl.current ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbPreviewUrl.current} alt="" />
                      ) : (
                        <span className="build-dock__upload-thumb-empty">Thumbnail</span>
                      )}
                    </button>
                  </div>

                  <input
                    type="text"
                    className="build-dock__upload-name"
                    placeholder="Name your model"
                    maxLength={120}
                    value={uploadName}
                    onChange={(event) => setUploadName(event.target.value)}
                  />

                  <div className="build-dock__class-grid" role="radiogroup" aria-label="How should it be placed?">
                    {PLACEMENT_OPTIONS.map((option) => {
                      const active = uploadPlacement === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`build-dock__class${active ? " is-active" : ""}`}
                          onClick={() => setUploadPlacement(option.id)}
                          title={option.hint}
                        >
                          <span className="build-dock__class-icon">
                            <Glyph id={option.glyph} />
                          </span>
                          <span className="build-dock__class-label">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="build-dock__class-hint">
                    {PLACEMENT_OPTIONS.find((o) => o.id === uploadPlacement)?.hint}
                  </p>

                  {uploadPlacement === "other" ? (
                    <>
                      <p className="build-dock__class-section">Make it interactive (optional)</p>
                      <div
                        className="build-dock__class-grid build-dock__class-grid--roles"
                        role="radiogroup"
                        aria-label="Interactive behaviour"
                      >
                        {OBJECT_ROLE_OPTIONS.map((option) => {
                          const active = uploadObjectRole === option.id;
                          return (
                            <button
                              key={option.id ?? "none"}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              className={`build-dock__class${active ? " is-active" : ""}`}
                              onClick={() => setUploadObjectRole(option.id)}
                              title={option.hint}
                            >
                              <span className="build-dock__class-label">{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="build-dock__class-hint">
                        {OBJECT_ROLE_OPTIONS.find((o) => o.id === uploadObjectRole)?.hint}
                      </p>
                    </>
                  ) : null}

                  {uploadError ? <p className="build-dock__upload-error">{uploadError}</p> : null}

                  <button
                    type="button"
                    className="build-dock__upload-submit"
                    disabled={uploading || !uploadGlb || !uploadThumb || !uploadName.trim() || !onUploadCustomAsset}
                    onClick={() => void handleUploadSubmit()}
                  >
                    {uploading ? "Uploading…" : "Add to library"}
                  </button>
                </div>

                <div className="build-dock__grid" role="toolbar" aria-label="Your uploaded models">
                  {customAssets.map((asset) => {
                    const active = selectedCustomAssetId === asset.id;
                    return (
                      <div
                        key={asset.id}
                        className={`build-dock__tile build-dock__tile--object build-dock__tile--upload${active ? " is-active" : ""}`}
                      >
                        <button
                          type="button"
                          className="build-dock__tile-main"
                          aria-pressed={active}
                          title={active
                            ? `${asset.displayName} — click to cancel · click in world to place`
                            : `${asset.displayName} (${asset.objectRole ?? asset.placement}) — click to start placing`}
                          onClick={() => onSelectCustomAsset?.(active ? null : asset.id)}
                        >
                          <span className="build-dock__tile-icon build-dock__tile-icon--thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={asset.thumbnailUrl} alt="" />
                          </span>
                          <span className="build-dock__tile-label">{asset.displayName}</span>
                          <span className="build-dock__tile-badge">{asset.objectRole ?? asset.placement}</span>
                        </button>
                        {onDeleteCustomAsset ? (
                          <button
                            type="button"
                            className="build-dock__tile-delete"
                            title="Delete from your library"
                            aria-label={`Delete ${asset.displayName}`}
                            onClick={() => {
                              if (!window.confirm(`Delete "${asset.displayName}" from your library?`)) return;
                              void onDeleteCustomAsset(asset.id);
                            }}
                          >
                            ✕
                          </button>
                        ) : null}
                        {asset.placement === "other" && onSetCustomAssetRole ? (
                          <select
                            className="build-dock__tile-role"
                            aria-label={`Interactive behaviour for ${asset.displayName}`}
                            title="Make this object a chair or podium so it can be used in the room"
                            value={asset.objectRole ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              void onSetCustomAssetRole(asset.id, value === "" ? null : (value as WorldAssetObjectRole));
                            }}
                          >
                            <option value="">Prop (no action)</option>
                            <option value="chair">Chair — sit + notes</option>
                            <option value="podium">Podium — present + notes</option>
                          </select>
                        ) : null}
                      </div>
                    );
                  })}
                  {customAssets.length === 0 ? (
                    <p className="build-dock__placeholder">
                      No uploads yet — add a .glb above to start your library.
                    </p>
                  ) : null}
                </div>

                {selectedCustomAssetId && onCustomScaleChange ? (
                  <div className="build-dock__scatter" role="group" aria-label="Model size">
                    <span className="build-dock__prop-label">Size</span>
                    <div className="build-dock__scatter-row">
                      <input
                        type="range"
                        min={0.25}
                        max={4}
                        step={0.05}
                        value={customScale}
                        onChange={(event) => onCustomScaleChange(Number(event.target.value))}
                        aria-label="Placement size multiplier"
                      />
                      <span className="build-dock__scatter-count">{customScale.toFixed(2)}×</span>
                    </div>
                    <span className="build-dock__scatter-sub">
                      Resize before placing — the ghost updates live. Each placement keeps its own size.
                    </span>
                  </div>
                ) : null}

                {selectedCustomAssetId ? (
                  <p className="build-dock__inline-hint">
                    Click in the world to place · <kbd>R</kbd> or the rotator to turn · <kbd>Esc</kbd> cancel
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* ── Lighting: add lights, list in-room lights, inspect selected ──────── */}
            {category === "lighting" ? (
              <div className="build-dock__lighting">
                {/* Lighting coachmark */}
                <p className="build-dock__coachmark build-dock__coachmark--lighting">
                  Click <strong>Add Light</strong> to place a light. Click a light in the 3D view (or a row below) to open its controls. Enable <strong>Environment</strong>{" "}to override the room&apos;s global lighting.
                </p>

                {/* Add Light tiles */}
                <div className="build-dock__lighting-add">
                  <p className="build-dock__section-label">Add Light</p>
                  <div className="build-dock__lighting-tiles">
                    {(["point", "spot", "area"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className="build-dock__tile"
                        onClick={() => onAddLight?.(type)}
                      >
                        <span className="build-dock__tile-icon">
                          <LightTypeGlyph type={type} />
                        </span>
                        <span className="build-dock__tile-label">
                          {type === "point" ? "Bulb" : type === "spot" ? "Spot" : "Panel"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lights in room list */}
                {lights && lights.length > 0 ? (
                  <div className="build-dock__lighting-list">
                    <p className="build-dock__section-label">In Room ({lights.length}/{ROOM_LIGHT_MAX_PER_ROOM})</p>
                    {lights.map((light) => (
                      <div
                        key={light.id}
                        className={`light-list__item${selectedLightId === light.id ? " is-selected" : ""}`}
                        onClick={() => { onSelectLight?.(light.id); onFocusLight?.(light.id); }}
                      >
                        <span className="light-list__name">{light.name ?? (light.type === "point" ? "Bulb" : light.type === "spot" ? "Spot" : "Panel")}</span>
                        <button
                          type="button"
                          className="light-list__toggle"
                          aria-label={light.enabled ? "Disable light" : "Enable light"}
                          onClick={(e) => { e.stopPropagation(); onUpdateLight?.(light.id, { enabled: !light.enabled }, true); }}
                        >
                          {light.enabled ? "●" : "○"}
                        </button>
                        <button
                          type="button"
                          className="light-list__delete"
                          aria-label="Delete light"
                          onClick={(e) => { e.stopPropagation(); onDeleteLight?.(light.id); }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Per-light editing now lives on the light itself in the 3D view
                    (LightControlCard + Move/Aim/Shape gizmos), not in this dock. */}

                {/* Environment editor */}
                {roomEnvironment ? (
                  <div className="build-dock__lighting-env">
                    <p className="build-dock__section-label">Environment</p>
                    <EnvironmentPanel
                      environment={roomEnvironment}
                      onUpdate={(patch, commit) => onUpdateEnvironment?.(patch, commit)}
                    />
                  </div>
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
              {(() => {
                // While placing an asset (catalog or custom) the rotator turns the
                // pending asset; otherwise it sets the build-piece rotation.
                const rotatingAsset = Boolean((selectedAssetSlug || selectedCustomAssetId) && onRotateAsset);
                return (
                  <button
                    type="button"
                    className="build-dock__rotate"
                    onClick={rotatingAsset ? onRotateAsset : buildMode.rotate}
                    title="Rotate (R)"
                  >
                    <span className="build-dock__rotate-icon">↻</span>
                    <span className="build-dock__rotate-deg">
                      {rotatingAsset ? Math.round(((assetYawDeg % 360) + 360) % 360) : buildMode.rotation}°
                    </span>
                  </button>
                );
              })()}
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
