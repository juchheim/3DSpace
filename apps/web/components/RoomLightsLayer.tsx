"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { SpotLight, Object3D } from "three";
import { selectActiveLights, LIGHTING_BUDGET } from "@3dspace/room-engine";
import { initRectAreaLights } from "../lib/lightingRenderer";
import type { RoomLight } from "@3dspace/contracts";
import { LightGlyph } from "./LightGlyph";
import { LightControlCard, type LightEditorMode } from "./lighting/LightControlCard";
import { LightMoveGizmo } from "./lighting/LightMoveGizmo";
import { LightAimGizmo } from "./lighting/LightAimGizmo";
import { LightShapeGizmo } from "./lighting/LightShapeGizmo";
import { LightHelpers } from "./lighting/LightHelpers";

/** Consistent per-type tint from glyph → gizmo → helper. */
const LIGHT_TINT: Record<RoomLight["type"], string> = {
  point: "#fde68a",
  spot: "#a5f3fc",
  area: "#d9f99d",
};

type Vec3 = { x: number; y: number; z: number };

type RoomLightsLayerProps = {
  lights: RoomLight[];
  selectedId: string | null;
  quality: "low" | "medium" | "high";
  interactive: boolean;
  mode?: LightEditorMode;
  editedBy?: { name: string; at: number } | undefined;
  onSelect?: ((id: string | null) => void) | undefined;
  onTransform?: ((id: string, position: Vec3) => void) | undefined;
  onTransformCommit?: ((id: string, position: Vec3) => void) | undefined;
  onUpdate?: ((id: string, patch: Partial<RoomLight>, commit?: boolean) => void) | undefined;
  onSetMode?: ((mode: LightEditorMode) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
  onDuplicate?: ((id: string) => void) | undefined;
  onFocusCamera?: ((id: string) => void) | undefined;
  onDeselect?: (() => void) | undefined;
};

// ---------------------------------------------------------------------------
// SpotLightInstance — manages the spotLight + its target object
// ---------------------------------------------------------------------------
function SpotLightInstance({
  light,
  castShadow,
  shadowMapSize,
}: {
  light: RoomLight & { type: "spot" };
  castShadow: boolean;
  shadowMapSize: number;
}) {
  const spotRef = useRef<SpotLight>(null!);
  const targetRef = useRef<Object3D>(null!);
  const tgt = light.target ?? { x: 0, y: 0, z: 0 };

  useEffect(() => {
    if (spotRef.current && targetRef.current) {
      spotRef.current.target = targetRef.current;
    }
  }, []);

  const angleDeg = light.angleDeg ?? 30;
  const angleRad = (angleDeg * Math.PI) / 180;

  return (
    <>
      {/* Target object — spotLight.target must be in the scene */}
      <object3D ref={targetRef} position={[tgt.x, tgt.y, tgt.z]} />
      <spotLight
        ref={spotRef}
        color={light.color}
        intensity={light.intensity}
        position={[light.position.x, light.position.y, light.position.z]}
        angle={angleRad}
        penumbra={light.penumbra ?? 0.1}
        distance={light.distance ?? 0}
        decay={light.decay ?? 2}
        castShadow={castShadow}
        shadow-mapSize-width={castShadow ? shadowMapSize : undefined}
        shadow-mapSize-height={castShadow ? shadowMapSize : undefined}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// RoomLightsLayer
// ---------------------------------------------------------------------------
export function RoomLightsLayer({
  lights,
  selectedId,
  quality,
  interactive,
  mode = "move",
  editedBy,
  onSelect,
  onTransform,
  onTransformCommit,
  onUpdate,
  onSetMode,
  onDelete,
  onDuplicate,
  onFocusCamera,
  onDeselect,
}: RoomLightsLayerProps) {
  // Initialise RectAreaLight uniforms once (idempotent)
  useEffect(() => {
    initRectAreaLights();
  }, []);

  const budget = LIGHTING_BUDGET[quality];
  const camera = useThree((s) => s.camera);
  const cameraPos: Vec3 = { x: camera.position.x, y: camera.position.y, z: camera.position.z };

  // Active subset — sorted by distance, capped at budget.maxActive
  const activeLights = useMemo(
    () => selectActiveLights(lights, cameraPos, budget.maxActive),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lights, quality, camera.position.x, camera.position.y, camera.position.z]
  );

  // Pin the selected light into the rendered set so it always renders while
  // edited, even if the camera has pushed it outside the nearest-N budget.
  const renderedLights = useMemo(() => {
    if (!selectedId || activeLights.some((l) => l.id === selectedId)) return activeLights;
    const selected = lights.find((l) => l.id === selectedId);
    return selected ? [...activeLights, selected] : activeLights;
  }, [activeLights, lights, selectedId]);

  // Casting shadows is an explicit per-light opt-in, so honor it on every
  // quality tier. The budget still caps how many cast at once; when the tier
  // budgets zero (low), allow a small cap so the toggle isn't a no-op.
  const maxShadowCasters = budget.maxShadowCasters > 0 ? budget.maxShadowCasters : 2;
  // Low tier budgets a 0px map; fall back to a usable size when a light opts in.
  const shadowMapSize = budget.shadowMapSize > 0 ? budget.shadowMapSize : 1024;

  // From the active set, pick shadow-casters (point/spot only, nearest first)
  const shadowCasterIds = useMemo(() => {
    const eligible = activeLights
      .filter((l) => l.castShadow && l.type !== "area")
      .slice(0, maxShadowCasters);
    return new Set(eligible.map((l) => l.id));
  }, [activeLights, maxShadowCasters]);

  return (
    <>
      {/* Glyphs — all lights, not just active. Only visible/clickable while
          the Lighting tab is active; actual illumination still renders below. */}
      {interactive ? lights.map((light) => (
        <LightGlyph
          key={light.id}
          position={light.position}
          color={light.color}
          type={light.type}
          selected={light.id === selectedId}
          enabled={light.enabled}
          onClick={() => onSelect?.(light.id === selectedId ? null : light.id)}
        />
      )) : null}

      {/* Selected-light editor: move gizmo (mode "move") + attached card */}
      {interactive && selectedId ? (() => {
        const selectedLight = lights.find((l) => l.id === selectedId);
        if (!selectedLight) return null;
        return (
          <>
            {/* Always-on tinted visualization for the selected light (all modes). */}
            <LightHelpers key={`helpers-${selectedLight.id}`} light={selectedLight} tint={LIGHT_TINT[selectedLight.type]} />
            {mode === "move" ? (
              <LightMoveGizmo
                key={`move-${selectedLight.id}`}
                position={selectedLight.position}
                onTransform={(pos) => onTransform?.(selectedLight.id, pos)}
                onTransformCommit={(pos) => onTransformCommit?.(selectedLight.id, pos)}
              />
            ) : null}
            {mode === "shape" ? (
              <LightShapeGizmo
                key={`shape-${selectedLight.id}`}
                light={selectedLight}
                color={LIGHT_TINT[selectedLight.type]}
                onUpdate={(patch, commit) => onUpdate?.(selectedLight.id, patch, commit)}
              />
            ) : null}
            {mode === "aim" && selectedLight.type !== "point" ? (
              <LightAimGizmo
                key={`aim-${selectedLight.id}`}
                position={selectedLight.position}
                target={selectedLight.target ?? { x: selectedLight.position.x, y: selectedLight.position.y - 2, z: selectedLight.position.z }}
                color={LIGHT_TINT[selectedLight.type]}
                onUpdate={(target, commit) => onUpdate?.(selectedLight.id, { target }, commit)}
              />
            ) : null}
            <LightControlCard
              key={`card-${selectedLight.id}`}
              light={selectedLight}
              mode={mode}
              editedBy={editedBy}
              onUpdate={(patch, commit) => onUpdate?.(selectedLight.id, patch, commit)}
              onSetMode={(m) => onSetMode?.(m)}
              onDelete={() => onDelete?.(selectedLight.id)}
              onDuplicate={() => onDuplicate?.(selectedLight.id)}
              onFocusCamera={() => onFocusCamera?.(selectedLight.id)}
              onDeselect={() => onDeselect?.()}
            />
          </>
        );
      })() : null}

      {/* Actual Three.js lights — active subset (+ pinned selected light) */}
      {renderedLights.map((light) => {
        const castShadow = shadowCasterIds.has(light.id);
        const pos: [number, number, number] = [
          light.position.x,
          light.position.y,
          light.position.z,
        ];

        if (light.type === "point") {
          return (
            <pointLight
              key={light.id}
              color={light.color}
              intensity={light.intensity}
              position={pos}
              distance={light.distance ?? 0}
              decay={light.decay ?? 2}
              castShadow={castShadow}
              shadow-mapSize-width={castShadow ? shadowMapSize : undefined}
              shadow-mapSize-height={castShadow ? shadowMapSize : undefined}
              shadow-bias={-0.0005}
              shadow-normalBias={0.02}
            />
          );
        }

        if (light.type === "spot") {
          return (
            <SpotLightInstance
              key={light.id}
              light={light as RoomLight & { type: "spot" }}
              castShadow={castShadow}
              shadowMapSize={shadowMapSize}
            />
          );
        }

        if (light.type === "area") {
          const tgt = light.target ?? { x: 0, y: -1, z: 0 };
          return (
            <rectAreaLight
              key={light.id}
              color={light.color}
              intensity={light.intensity}
              position={pos}
              width={light.width ?? 2}
              height={light.height ?? 2}
              lookAt={[tgt.x, tgt.y, tgt.z]}
            />
          );
        }

        return null;
      })}

    </>
  );
}
