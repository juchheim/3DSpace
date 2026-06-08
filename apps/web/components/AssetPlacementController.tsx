"use client";

/**
 * Renders an invisible floor plane inside the R3F canvas that intercepts
 * pointer events while an asset is being placed. Shows a ghost of the asset
 * following the cursor; click to place, R to rotate, Escape to cancel.
 *
 * Placed above the BuildPlacementController in the scene so it receives
 * pointer events first via stopPropagation.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { SkeletonUtils } from "three-stdlib";
import type { Group } from "three";
import { isKeyboardOwnedTarget } from "../lib/isKeyboardOwnedTarget";

type AssetPlacementControllerProps = {
  /** GLB URL of the asset being placed. */
  glbUrl: string;
  /** Y of the invisible intercept plane (above the build placement plane). */
  interceptPlaneY?: number;
  /** Current rotation step (0=0°, 1=90°, 2=180°, 3=270°). */
  rotationStep: number;
  /** Called with world position + yaw (radians) when user clicks to place. */
  onPlace(position: { x: number; y: number; z: number }, yaw: number): void;
  /** Called when the user cancels (Escape or the button in BuildControls). */
  onCancel(): void;
  /** Called when the user presses R to rotate. */
  onRotate(): void;
};

/** The invisible floor intercept plane — sits just above y=0 so it catches
 *  clicks before the floor mesh does. Sized generously to cover any room. */
const PLANE_HALF = 500;

export function AssetPlacementController({
  glbUrl,
  interceptPlaneY = 0.002,
  rotationStep,
  onPlace,
  onCancel,
  onRotate
}: AssetPlacementControllerProps) {
  const { scene } = useGLTF(glbUrl);
  const ghostModel = useRef<Group | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; z: number } | null>(null);

  // Clone once for the ghost
  if (!ghostModel.current) {
    ghostModel.current = SkeletonUtils.clone(scene) as Group;
  }

  const yaw = rotationStep * (Math.PI / 2);

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setGhostPos({ x: e.point.x, z: e.point.z });
    },
    []
  );

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
  }, []);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (!ghostPos) return;
      onPlace({ x: ghostPos.x, y: 0, z: ghostPos.z }, yaw);
    },
    [ghostPos, onPlace, yaw]
  );

  const handlePointerOut = useCallback(() => {
    setGhostPos(null);
  }, []);

  // Keyboard: R = rotate, Escape = cancel
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isKeyboardOwnedTarget(e.target)) return;
      if (e.code === "KeyR") {
        e.preventDefault();
        onRotate();
      } else if (e.code === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, onRotate]);

  return (
    <group>
      {/* Ghost chair at cursor position */}
      {ghostPos ? (
        <group
          position={[ghostPos.x, 0, ghostPos.z]}
          rotation={[0, yaw, 0]}
        >
          <primitive
            object={ghostModel.current}
            // Traverse to apply ghost opacity once mounted
            onUpdate={(self: Group) => {
              self.traverse((obj) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const mat = (obj as any).material;
                if (mat) {
                  mat.transparent = true;
                  mat.opacity = 0.55;
                }
              });
            }}
          />
        </group>
      ) : null}

      {/* Invisible intercept plane — catches pointer events over the floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, interceptPlaneY, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        renderOrder={10}
      >
        <planeGeometry args={[PLANE_HALF * 2, PLANE_HALF * 2]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}
