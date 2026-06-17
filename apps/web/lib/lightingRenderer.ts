import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

let rectAreaInited = false;

export function initRectAreaLights() {
  if (!rectAreaInited) {
    RectAreaLightUniformsLib.init();
    rectAreaInited = true;
  }
}

export type ToneMappingId = "none" | "aces" | "agx" | "neutral";

export function resolveToneMapping(id: ToneMappingId): THREE.ToneMapping {
  switch (id) {
    case "aces":    return THREE.ACESFilmicToneMapping;
    case "agx":     return THREE.AgXToneMapping;
    case "neutral": return THREE.NeutralToneMapping;
    default:        return THREE.NoToneMapping;
  }
}
