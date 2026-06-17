"use client";

/**
 * Renders an invisible floor plane inside the R3F canvas that intercepts
 * pointer events while a light is being placed. Shows a ghost sphere
 * following the cursor; click to place, Escape to cancel.
 */

import { useEffect, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { RoomLightType } from "@3dspace/contracts";
import { isKeyboardOwnedTarget } from "../lib/isKeyboardOwnedTarget";

const PLANE_HALF = 500;
const PLACEMENT_Y = 0.003; // just above floor

type Props = {
  lightType: RoomLightType;
  interceptPlaneY?: number;
  onPlace(position: { x: number; y: number; z: number }): void;
  onCancel(): void;
};

/** Ghost sphere color by light type. */
function ghostColor(type: RoomLightType): string {
  if (type === "point") return "#fde68a";
  if (type === "spot") return "#a5f3fc";
  return "#d9f99d"; // area
}

export function LightPlacementController({
  lightType,
  interceptPlaneY = PLACEMENT_Y,
  onPlace,
  onCancel,
}: Props) {
  const [ghostPos, setGhostPos] = useState<[number, number, number] | null>(null);

  // Add a CSS class so the cursor can show a crosshair.
  useEffect(() => {
    document.body.classList.add("wb-placement-active");
    return () => document.body.classList.remove("wb-placement-active");
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isKeyboardOwnedTarget(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function handlePointerMove(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    setGhostPos([e.point.x, interceptPlaneY + 1.5, e.point.z]);
  }

  function handlePointerOut() {
    setGhostPos(null);
  }

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    onPlace({ x: e.point.x, y: 1.5, z: e.point.z });
  }

  const color = ghostColor(lightType);

  return (
    <group>
      {/* Invisible intercept plane */}
      <mesh
        position={[0, interceptPlaneY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        renderOrder={10}
      >
        <planeGeometry args={[PLANE_HALF * 2, PLANE_HALF * 2]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Ghost preview sphere */}
      {ghostPos ? (
        <group position={ghostPos}>
          <mesh>
            <sphereGeometry args={[0.12, 12, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.7} />
          </mesh>
          {/* Soft halo ring on the floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -(interceptPlaneY + 1.5) + interceptPlaneY + 0.01, 0]}>
            <ringGeometry args={[0.18, 0.28, 24]} />
            <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}
