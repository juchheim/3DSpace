import type { RoomEnvironment } from "@3dspace/contracts";

export type LightingPresetId = "studio" | "warm-interior" | "night" | "stage" | "overcast";

export const LIGHTING_PRESETS: Record<LightingPresetId, { label: string; environment: Partial<RoomEnvironment> }> = {
  "studio": {
    label: "Studio",
    environment: {
      enabled: true,
      sun: { enabled: true, azimuthDeg: 45, elevationDeg: 60, color: "#ffffff", intensity: 3, castShadow: true },
      sky: { hemisphere: true, skyColor: "#c9d8f0", groundColor: "#4a3728", hemisphereIntensity: 1, ambientColor: "#ffffff", ambientIntensity: 0.2 },
      ibl: { preset: "studio", intensity: 0.8, asBackground: false },
      fog: { enabled: false, color: "#cccccc", near: 20, far: 100 },
      exposure: { toneMapping: "aces", exposure: 1 },
    },
  },
  "warm-interior": {
    label: "Warm Interior",
    environment: {
      enabled: true,
      sun: { enabled: true, azimuthDeg: 200, elevationDeg: 35, color: "#ffdd88", intensity: 2, castShadow: false },
      sky: { hemisphere: true, skyColor: "#f5c882", groundColor: "#3d2b1a", hemisphereIntensity: 0.5, ambientColor: "#f0d0a0", ambientIntensity: 0.3 },
      ibl: { preset: "apartment", intensity: 0.6, asBackground: false },
      fog: { enabled: true, color: "#f0d8a0", near: 15, far: 50 },
      exposure: { toneMapping: "aces", exposure: 1.1 },
    },
  },
  "night": {
    label: "Night",
    environment: {
      enabled: true,
      sun: { enabled: true, azimuthDeg: 0, elevationDeg: -10, color: "#2244aa", intensity: 0.1, castShadow: false },
      sky: { hemisphere: true, skyColor: "#050a1a", groundColor: "#020408", hemisphereIntensity: 0.2, ambientColor: "#0a1030", ambientIntensity: 0.1 },
      ibl: { preset: "night", intensity: 0.3, asBackground: false },
      fog: { enabled: true, color: "#050a1a", near: 8, far: 30 },
      exposure: { toneMapping: "aces", exposure: 0.8 },
    },
  },
  "stage": {
    label: "Stage",
    environment: {
      enabled: true,
      sun: { enabled: true, azimuthDeg: 0, elevationDeg: 80, color: "#ffffff", intensity: 4, castShadow: true },
      sky: { hemisphere: false, skyColor: "#000000", groundColor: "#111111", hemisphereIntensity: 0, ambientColor: "#000000", ambientIntensity: 0 },
      ibl: { preset: "none", intensity: 0, asBackground: false },
      fog: { enabled: false, color: "#000000", near: 20, far: 100 },
      exposure: { toneMapping: "aces", exposure: 1.2 },
    },
  },
  "overcast": {
    label: "Overcast",
    environment: {
      enabled: true,
      sun: { enabled: true, azimuthDeg: 90, elevationDeg: 45, color: "#d0d8e8", intensity: 1.5, castShadow: false },
      sky: { hemisphere: true, skyColor: "#b0bcc8", groundColor: "#505860", hemisphereIntensity: 1.2, ambientColor: "#c0ccd8", ambientIntensity: 0.5 },
      ibl: { preset: "park", intensity: 0.5, asBackground: false },
      fog: { enabled: true, color: "#c8d0d8", near: 20, far: 60 },
      exposure: { toneMapping: "none", exposure: 1 },
    },
  },
};

export const LIGHTING_PRESET_IDS = Object.keys(LIGHTING_PRESETS) as LightingPresetId[];
