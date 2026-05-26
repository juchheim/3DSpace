import { createElement, type ComponentType, type ReactElement } from "react";
import type { ProceduralProps } from "./types";
import {
  CaffeineMolecule,
  CAFFEINE_MOLECULE_DISPLAY_NAME,
  CAFFEINE_MOLECULE_PROCEDURAL_ID
} from "./caffeineMolecule";
import {
  EarthGlobe,
  EARTH_GLOBE_DISPLAY_NAME,
  EARTH_GLOBE_PROCEDURAL_ID
} from "./earthGlobe";
import {
  WaterMolecule,
  WATER_MOLECULE_DISPLAY_NAME,
  WATER_MOLECULE_PROCEDURAL_ID
} from "./waterMolecule";

/** Catalog `slug` for the Phase 0 / Phase 7 hero manipulative. */
export const ROOM_OBJECT_HERO_SLUG = "water-molecule";

export {
  CAFFEINE_MOLECULE_DISPLAY_NAME,
  CAFFEINE_MOLECULE_PROCEDURAL_ID,
  EARTH_GLOBE_DISPLAY_NAME,
  EARTH_GLOBE_PROCEDURAL_ID,
  WATER_MOLECULE_DISPLAY_NAME,
  WATER_MOLECULE_PROCEDURAL_ID
};

/**
 * Registry of procedural RoomObject renderers, keyed by `proceduralId`.
 * Builtin catalog entries become placeable when their `proceduralId` is present here.
 */
export const ROOM_OBJECT_PROCEDURALS: Record<string, ComponentType<ProceduralProps>> = {
  [CAFFEINE_MOLECULE_PROCEDURAL_ID]: CaffeineMolecule,
  [EARTH_GLOBE_PROCEDURAL_ID]: EarthGlobe,
  [WATER_MOLECULE_PROCEDURAL_ID]: WaterMolecule,
};

/**
 * Render a procedural template by id. Returns `null` for an unknown id so callers
 * (the dev harness now, `RoomObjectMesh` in Phase 5) can fail soft.
 */
export function renderProcedural(proceduralId: string, props: ProceduralProps): ReactElement | null {
  const Renderer = ROOM_OBJECT_PROCEDURALS[proceduralId];
  return Renderer ? createElement(Renderer, props) : null;
}
