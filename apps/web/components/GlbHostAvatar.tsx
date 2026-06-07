"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html, useGLTF } from "@react-three/drei";
import {
  Color,
  MathUtils,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D
} from "three";
import type { RetroRobotHostAvatarProps } from "./RetroRobotHostAvatar";

const TWO_PI = Math.PI * 2;
const GHOST_CYAN = "#7fe9ff";

function setCursor(value: string) {
  if (typeof document !== "undefined") document.body.style.cursor = value;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

export interface GlbHostAvatarProps extends RetroRobotHostAvatarProps {
  /** Served from apps/web/public; built by a scripts/build-*-glb.mjs generator. */
  url: string;
  /** Native model height (feet → top) in metres, used to scale to TARGET_HEIGHT. */
  nativeHeight: number;
  /** Y coordinate in the GLB where the feet meet the floor (default 0). */
  nativeGroundY?: number;
}

const TARGET_HEIGHT = 2.0;

/**
 * Generic GLB-backed World Host avatar. Mirrors {@link RetroRobotHostAvatarProps}
 * so it can be swapped in for the procedural retro robot, and is parameterised by
 * `url` + `nativeHeight` so multiple host models (Sprocket-Bot, MODEL-LP, …)
 * share one implementation. Each instance clones the loaded scene and its
 * materials so the live host, a translucent placement ghost, and the dev harness
 * never share GPU state.
 *
 * Conventions every host GLB follows: emissive eye materials are named "eyeGlow"
 * (pulsed here for thinking/speaking), and movable eye nodes are named
 * "eyeIris_*" (darted around here for a lifelike, expressive gaze).
 */
export function GlbHostAvatar({
  url,
  nativeHeight,
  nativeGroundY = 0,
  position,
  rotationY,
  displayName,
  thinking = false,
  speaking = false,
  bubbleText = null,
  ghost = false,
  onInteract,
  scale = 1
}: GlbHostAvatarProps) {
  const { scene } = useGLTF(url);
  const modelScale = TARGET_HEIGHT / nativeHeight;
  const groundYOffset = -nativeGroundY * modelScale;

  // Clone the model + its materials for this instance.
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((object) => {
      if (!isMesh(object)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const material = object.material as MeshStandardMaterial;
      object.material = material.clone();
    });
    return root;
  }, [scene]);

  // Dispose cloned materials on unmount (geometry is shared with the cache).
  useEffect(
    () => () => {
      model.traverse((object) => {
        if (isMesh(object)) (object.material as MeshStandardMaterial).dispose();
      });
    },
    [model]
  );

  // Emissive eye lenses, collected once so the frame loop can pulse them.
  const eyeMaterials = useMemo(() => {
    const mats: MeshStandardMaterial[] = [];
    model.traverse((object) => {
      if (isMesh(object) && (object.material as MeshStandardMaterial).name === "eyeGlow") {
        mats.push(object.material as MeshStandardMaterial);
      }
    });
    return mats;
  }, [model]);

  // Movable iris nodes (built as separate "eyeIris_*" nodes in the GLB) so the
  // gaze can wander; remember each one's base position to offset from.
  const irisNodes = useMemo(() => {
    const out: { obj: Object3D; bx: number; by: number; bz: number }[] = [];
    model.traverse((object) => {
      if (object.name && object.name.startsWith("eyeIris")) {
        out.push({ obj: object, bx: object.position.x, by: object.position.y, bz: object.position.z });
      }
    });
    return out;
  }, [model]);

  // Apply the translucent placement-ghost look once.
  useEffect(() => {
    if (!ghost) return;
    const cyan = new Color(GHOST_CYAN);
    model.traverse((object) => {
      if (!isMesh(object)) return;
      const material = object.material as MeshStandardMaterial;
      material.transparent = true;
      material.opacity = 0.42;
      material.depthWrite = false;
      material.emissive.copy(cyan);
      material.emissiveIntensity = 0.6;
      material.color.lerp(cyan, 0.4);
    });
  }, [ghost, model]);

  const bobRef = useRef<Group>(null);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    if (bobRef.current) {
      // Keep groundYOffset in the bob baseline — useFrame runs every tick and would
      // otherwise wipe the JSX position that lifts origin-centered GLBs onto the floor.
      bobRef.current.position.y =
        groundYOffset + Math.sin(t * 1.5 * TWO_PI) * 0.02 + (ghost ? 0.04 : 0);
      // A subtle "listening" sway while thinking; quicker bob while speaking.
      const swayTarget = thinking ? Math.sin(t * 1.4) * 0.05 : 0;
      bobRef.current.rotation.z = MathUtils.lerp(bobRef.current.rotation.z, swayTarget, delta * 4);
    }

    if (!ghost && eyeMaterials.length > 0) {
      let intensity = 1.0;
      if (thinking) {
        intensity = 1.0 + (0.5 + 0.5 * Math.sin(t * 1.2 * TWO_PI)) * 1.1; // 1.2 Hz pulse
      } else if (speaking) {
        intensity = Math.sin(t * 7) > 0 ? 2.4 : 1.5; // bright flicker
      }
      for (const material of eyeMaterials) material.emissiveIntensity = intensity;
    }

    // Lifelike gaze: both irises wander together with a slow drift plus occasional
    // quicker shifts (a touch more roving while thinking).
    if (!ghost && irisNodes.length > 0) {
      const range = thinking ? 0.016 : 0.012;
      const dart = Math.max(0, Math.sin(t * 0.6 + Math.sin(t * 0.21) * 2.0)) ** 6; // brief look-aways
      const gx = ((Math.sin(t * 0.33) * 0.55 + Math.sin(t * 0.12 + 1.7) * 0.45) + dart * 0.5) * range;
      const gy = (Math.sin(t * 0.23 + 0.6) * 0.55 + Math.sin(t * 0.08) * 0.45) * range * 0.7;
      for (const iris of irisNodes) iris.obj.position.set(iris.bx + gx, iris.by + gy, iris.bz);
    }
  });

  const bubble = bubbleText && bubbleText.trim().length > 0 ? bubbleText.trim() : null;
  const nameplateDistanceFactor = scale !== 1 ? Math.round(9 / scale) : 9;

  const interactionHandlers = onInteract
    ? {
        onClick: (event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          onInteract();
        },
        onPointerOver: (event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          setCursor("pointer");
        },
        onPointerOut: () => setCursor("auto")
      }
    : {};

  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, rotationY, 0]} scale={scale}>
      <group ref={bobRef} position={[0, groundYOffset, 0]} scale={modelScale} {...interactionHandlers}>
        <primitive object={model} />
      </group>

      {ghost ? null : (
        <Billboard position={[0, 2.18, 0]}>
          <Html center distanceFactor={nameplateDistanceFactor} style={{ pointerEvents: "none" }}>
            <div className="world-host-nameplate" data-testid="ai-host-nameplate">
              <span className="world-host-nameplate__name">{displayName}</span>
              <span className="world-host-nameplate__subtitle">AI guide</span>
            </div>
          </Html>
        </Billboard>
      )}

      {!ghost && bubble ? (
        <Billboard position={[0, 2.54, 0]}>
          <Html center distanceFactor={9} className="world-host-bubble-html" style={{ pointerEvents: "none" }}>
            <div className={`world-host-bubble${thinking ? " world-host-bubble--thinking" : ""}`} data-testid="ai-host-bubble">
              {bubble}
            </div>
          </Html>
        </Billboard>
      ) : null}

      {!ghost && !bubble && thinking ? (
        <Billboard position={[0, 2.44, 0]}>
          <Html center distanceFactor={9} className="world-host-bubble-html" style={{ pointerEvents: "none" }}>
            <div className="world-host-bubble world-host-bubble--thinking world-host-bubble--typing" aria-label="Guide is thinking">
              <span />
              <span />
              <span />
            </div>
          </Html>
        </Billboard>
      ) : null}
    </group>
  );
}
