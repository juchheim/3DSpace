"use client";

/**
 * SkinLayer — React context provider for the active world skin.
 *
 * Wrap both <RoomView3D> and <RoomView2D> with this provider so that
 * WallMesh / RoomGeometry / RoomView2D can all read from the same skin context
 * without prop drilling.
 *
 * Also owns the ambient audio lifecycle: starts / stops the loop as the skin
 * changes, respects ambientGainOverride and muteAmbient.
 */

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { WorldSkin, WorldSkinLightingPreset, WorldSkinDayNightMode } from "@3dspace/contracts";
import { startAmbient, type AmbientHandle } from "./ambientPlayer";

// ── Runtime type ─────────────────────────────────────────────────────────────

export type WorldSkinRuntime = {
  /** The active skin, or null for the default theater. */
  skin: WorldSkin | null;
  /**
   * Resolved lighting preset — `lightingNight` when `dayNightMode === "night"`
   * and the skin provides it; otherwise `lighting`. Null when no skin.
   */
  activeLighting: WorldSkinLightingPreset | null;
  /** Absolute URL for the 8192×1024 panorama texture, or null. */
  panoramaUrl: string | null;
};

// ── Default lighting (matches existing hard-coded RoomView3D values) ──────────

export const DEFAULT_LIGHTING: WorldSkinLightingPreset = {
  ambientColor: "#ffffff",
  ambientIntensity: 0.82,
  directionalColor: "#ffffff",
  directionalIntensity: 1.4,
  directionalPosition: [4, 8, 6]
};
export const DEFAULT_BACKGROUND = "#16231d";

// ── Context ───────────────────────────────────────────────────────────────────

const WorldSkinContext = createContext<WorldSkinRuntime>({
  skin: null,
  activeLighting: null,
  panoramaUrl: null
});

export function useWorldSkinContext(): WorldSkinRuntime {
  return useContext(WorldSkinContext);
}

// ── SkinLayer ─────────────────────────────────────────────────────────────────

export function SkinLayer({
  skin,
  dayNightMode = "day",
  ambientGainOverride,
  muteAmbient = false,
  children
}: {
  skin: WorldSkin | null;
  dayNightMode?: WorldSkinDayNightMode;
  ambientGainOverride?: number | null;
  muteAmbient?: boolean;
  children: ReactNode;
}) {
  // Resolve the active lighting preset (day vs night toggle)
  const activeLighting = useMemo<WorldSkinLightingPreset | null>(() => {
    if (!skin) return null;
    if (dayNightMode === "night" && skin.overrides.lightingNight) {
      return skin.overrides.lightingNight;
    }
    return skin.overrides.lighting;
  }, [skin, dayNightMode]);

  const panoramaUrl = skin?.overrides.panoramaWall?.storageKey ?? null;

  const runtime = useMemo<WorldSkinRuntime>(
    () => ({ skin, activeLighting, panoramaUrl }),
    [skin, activeLighting, panoramaUrl]
  );

  // ── Ambient audio lifecycle ────────────────────────────────────────────────
  const handleRef = useRef<AmbientHandle | null>(null);

  // Start / restart the loop when the ambient URL changes (i.e. skin changes).
  const ambientUrl = skin?.overrides.ambient?.storageKey ?? null;
  const ambientDefaultGain = skin?.overrides.ambient?.defaultGain ?? 0.15;

  useEffect(() => {
    if (!ambientUrl) {
      handleRef.current?.stop();
      handleRef.current = null;
      return;
    }

    const effectiveGain = muteAmbient ? 0 : (ambientGainOverride ?? ambientDefaultGain);
    handleRef.current?.stop();
    const handle = startAmbient({ url: ambientUrl, gain: effectiveGain });
    handleRef.current = handle;

    return () => {
      handle.stop();
      if (handleRef.current === handle) handleRef.current = null;
    };
    // Re-run only when the track itself changes; gain is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientUrl]);

  // Smooth gain updates without restarting the loop.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const effectiveGain = muteAmbient ? 0 : (ambientGainOverride ?? ambientDefaultGain);
    handle.setGain(effectiveGain);
  }, [ambientGainOverride, muteAmbient, ambientDefaultGain]);

  return (
    <WorldSkinContext.Provider value={runtime}>
      {children}
    </WorldSkinContext.Provider>
  );
}
