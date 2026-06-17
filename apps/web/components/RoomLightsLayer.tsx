"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { SpotLight, Object3D } from "three";
import { selectActiveLights, LIGHTING_BUDGET } from "@3dspace/room-engine";
import { initRectAreaLights } from "../lib/lightingRenderer";
import type { RoomLight } from "@3dspace/contracts";
import { LightGlyph } from "./LightGlyph";

type Vec3 = { x: number; y: number; z: number };

type RoomLightsLayerProps = {
  lights: RoomLight[];
  selectedId: string | null;
  quality: "low" | "medium" | "high";
  interactive: boolean;
  onSelect?: ((id: string | null) => void) | undefined;
  onTransform?: ((id: string, position: Vec3) => void) | undefined;
  onTransformCommit?: ((id: string, position: Vec3) => void) | undefined;
};

// ---------------------------------------------------------------------------
// DragHandle — a small draggable sphere for repositioning the selected light
// ---------------------------------------------------------------------------
function DragHandle({
  position,
  color,
  onDrag,
  onDragEnd,
}: {
  position: Vec3;
  color: string;
  onDrag: (pos: Vec3) => void;
  onDragEnd: (pos: Vec3) => void;
}) {
  const isDragging = useRef(false);
  const lastPos = useRef<Vec3>(position);
  const { gl } = useThree();

  return (
    <mesh
      position={[position.x, position.y, position.z]}
      onPointerDown={(e) => {
        e.stopPropagation();
        isDragging.current = true;
        lastPos.current = position;
        gl.domElement.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!isDragging.current) return;
        e.stopPropagation();
        const newPos: Vec3 = { x: e.point.x, y: position.y, z: e.point.z };
        lastPos.current = newPos;
        onDrag(newPos);
      }}
      onPointerUp={(e) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        gl.domElement.releasePointerCapture(e.pointerId);
        onDragEnd(lastPos.current);
      }}
    >
      <sphereGeometry args={[0.18, 12, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} />
    </mesh>
  );
}

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
  onSelect,
  onTransform,
  onTransformCommit,
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

  // From the active set, pick shadow-casters (point/spot only, nearest first)
  const shadowCasterIds = useMemo(() => {
    if (budget.maxShadowCasters === 0) return new Set<string>();
    const eligible = activeLights
      .filter((l) => l.castShadow && l.type !== "area")
      .slice(0, budget.maxShadowCasters);
    return new Set(eligible.map((l) => l.id));
  }, [activeLights, budget.maxShadowCasters]);

  return (
    <>
      {/* Glyphs — all lights, not just active */}
      {lights.map((light) => (
        <LightGlyph
          key={light.id}
          position={light.position}
          color={light.color}
          type={light.type}
          selected={light.id === selectedId}
          enabled={light.enabled}
          onClick={() => onSelect?.(light.id === selectedId ? null : light.id)}
        />
      ))}

      {/* Drag handle for the selected light (interactive mode only) */}
      {interactive && selectedId ? (() => {
        const selectedLight = lights.find((l) => l.id === selectedId);
        if (!selectedLight) return null;
        const handleColor =
          selectedLight.type === "point" ? "#fde68a"
          : selectedLight.type === "spot" ? "#a5f3fc"
          : "#d9f99d";
        return (
          <DragHandle
            key={`drag-${selectedLight.id}`}
            position={selectedLight.position}
            color={handleColor}
            onDrag={(pos) => onTransform?.(selectedLight.id, pos)}
            onDragEnd={(pos) => onTransformCommit?.(selectedLight.id, pos)}
          />
        );
      })() : null}

      {/* Actual Three.js lights — active subset only */}
      {activeLights.map((light) => {
        const castShadow = shadowCasterIds.has(light.id);
        const shadowMapSize = budget.shadowMapSize;
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
