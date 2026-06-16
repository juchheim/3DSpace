"use client";

/**
 * Renders an invisible floor plane inside the R3F canvas that intercepts
 * pointer events while an asset is being placed. Shows a ghost of the asset
 * following the cursor; click to place, R to rotate, Escape to cancel.
 *
 * With fine placement enabled, a click anchors an adjustable draft instead of
 * committing: drag it (or arrow keys) to nudge position, rotate it in small
 * increments via the floating puck or Q/E/R, then Enter / ✓ confirms.
 *
 * Placed above the BuildPlacementController in the scene so it receives
 * pointer events first via stopPropagation.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Html, useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { WorldAssetPlacementKind } from "@3dspace/contracts";
import { cloneGlbSceneGhost } from "../lib/cloneGlbScene";
import { isKeyboardOwnedTarget } from "../lib/isKeyboardOwnedTarget";
import {
  placementPitch,
  placementSnapsToSurface,
  resolveCustomPlacement,
  type XZ
} from "../lib/worldAssetCustomPlacement";

/** Wall/ceiling snapping context, supplied for custom assets that mount to surfaces. */
export type PlacementSnapContext = {
  walls: Array<{ start: { x: number; z: number }; end: { x: number; z: number } }>;
  dimensions: { height: number };
  interior?: XZ;
};

type AssetPlacementControllerProps = {
  /** GLB URL of the asset being placed. */
  glbUrl: string;
  /** Uniform render scale for the placement ghost. */
  scale?: number;
  /** Y of the invisible intercept plane (above the build placement plane). */
  interceptPlaneY?: number;
  /** Resolve walkable ground Y at (x, z) — build floors, ramps, and room terrain. */
  resolveGroundY(x: number, z: number): number;
  /** Pending yaw in degrees — owned by the parent so it survives placements. */
  yawDeg: number;
  /** Side (m) of the scatter square previewed under the ghost (scatter assets only). */
  scatterAreaSize?: number;
  /** When true, clicks anchor an adjustable draft instead of committing. */
  finePlacement: boolean;
  /** Placement classification (custom assets). Defaults to "other" (free floor placement). */
  placement?: WorldAssetPlacementKind;
  /** Wall/ceiling snapping context — required for "wall"/"ceiling" placement. */
  snap?: PlacementSnapContext;
  /** Called with world position + yaw (radians) when the placement commits. */
  onPlace(position: { x: number; y: number; z: number }, yaw: number): void;
  /** Called when the user cancels (Escape or the button in BuildControls). */
  onCancel(): void;
  /** Rotate the pending asset by `deltaDeg` degrees. */
  onRotateBy(deltaDeg: number): void;
};

/** The invisible floor intercept plane — sits just above y=0 so it catches
 *  clicks before the floor mesh does. Sized generously to cover any room. */
const PLANE_HALF = 500;

/** Fine-mode steps: nudges in meters, rotations in degrees. */
const NUDGE_STEP = 0.1;
const NUDGE_STEP_FINE = 0.02;
const ROTATE_STEP_SMALL = 5;
const ROTATE_STEP_TINY = 1;
const ROTATE_STEP_BIG = 45;
const ROTATE_STEP_R = 15;

/** Keys the draft-adjust handler owns. Captured before the avatar-movement
 *  listener so nudging the draft doesn't also walk or turn the avatar. */
const ADJUST_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyQ",
  "KeyE",
  "KeyR",
  "Enter",
  "Escape"
]);

export function AssetPlacementController({
  glbUrl,
  scale = 1,
  interceptPlaneY = 0.002,
  resolveGroundY,
  yawDeg,
  scatterAreaSize,
  finePlacement,
  placement = "other",
  snap,
  onPlace,
  onCancel,
  onRotateBy
}: AssetPlacementControllerProps) {
  const { scene } = useGLTF(glbUrl);
  const ghostModel = useMemo(() => cloneGlbSceneGhost(scene), [scene, glbUrl]);
  const [ghostPos, setGhostPos] = useState<{ x: number; z: number } | null>(null);
  // Fine-placement draft anchored in the world; while set, the ghost stops
  // following the cursor and the adjust puck + keyboard take over.
  const [draftPos, setDraftPos] = useState<{ x: number; z: number } | null>(null);

  const yaw = (yawDeg * Math.PI) / 180;
  const yawDisplay = ((Math.round(yawDeg) % 360) + 360) % 360;
  // Wall/ceiling auto-snap: surface placements override free floor placement and
  // disable fine-draft mode (their transform is computed, not nudged).
  const snapsToSurface = placementSnapsToSurface(placement);
  const effectiveFine = finePlacement && !snapsToSurface;
  const ghostPitch = placementPitch(placement);

  /**
   * Resolve the final placement transform for a cursor floor point. Wall items
   * snap to the nearest wall (auto-oriented); ceiling items rise to the ceiling
   * and keep the user's yaw; floor/other rest on the ground with the user's yaw.
   */
  const placementFor = useCallback(
    (p: XZ): { position: { x: number; y: number; z: number }; yaw: number } => {
      if (snapsToSurface && snap) {
        const resolved = resolveCustomPlacement(placement, p, {
          walls: snap.walls,
          dimensions: snap.dimensions,
          groundY: resolveGroundY,
          ...(snap.interior ? { interior: snap.interior } : {})
        });
        if (resolved) {
          // Wall yaw is wall-driven; ceiling keeps the user's spin.
          return { position: resolved.position, yaw: placement === "ceiling" ? yaw : resolved.yaw };
        }
      }
      return { position: { x: p.x, y: resolveGroundY(p.x, p.z), z: p.z }, yaw };
    },
    [placement, snap, snapsToSurface, resolveGroundY, yaw]
  );

  // Switching assets or leaving fine mode discards any pending draft.
  useEffect(() => {
    setDraftPos(null);
  }, [glbUrl, finePlacement]);

  const commitDraft = useCallback(() => {
    setDraftPos((pos) => {
      if (pos) onPlace({ x: pos.x, y: resolveGroundY(pos.x, pos.z), z: pos.z }, yaw);
      return null;
    });
  }, [onPlace, resolveGroundY, yaw]);

  const nudgeDraft = useCallback((dx: number, dz: number) => {
    setDraftPos((pos) => (pos ? { x: pos.x + dx, z: pos.z + dz } : pos));
  }, []);

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (draftPos) {
        // Drag the anchored draft while the primary button is held.
        if (e.buttons === 1) setDraftPos({ x: e.point.x, z: e.point.z });
        return;
      }
      setGhostPos({ x: e.point.x, z: e.point.z });
    },
    [draftPos]
  );

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      // Seed the ghost at the press point so a tap with no preceding pointer-move
      // (touch, or a cursor that arrived over an intercepting object) still previews.
      if (!effectiveFine && !draftPos) setGhostPos({ x: e.point.x, z: e.point.z });
    },
    [draftPos, effectiveFine]
  );

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (effectiveFine) {
        // Anchor (or relocate) the draft — commit happens via ✓ / Enter.
        setDraftPos({ x: e.point.x, z: e.point.z });
        setGhostPos(null);
        return;
      }
      // Commit at the click's own point — never depend on stale hover state.
      // A brushed-past object (pointer-out) or a no-move tap could leave
      // `ghostPos` null and silently drop the click. Surface placements snap.
      const x = e.point.x;
      const z = e.point.z;
      setGhostPos({ x, z });
      const t = placementFor({ x, z });
      onPlace(t.position, t.yaw);
    },
    [effectiveFine, onPlace, placementFor]
  );

  const handlePointerOut = useCallback(() => {
    setGhostPos(null);
  }, []);

  // Follow-phase keyboard: R = rotate (90° coarse, 15° fine, Shift reverses),
  // Escape = cancel placement mode.
  useEffect(() => {
    if (draftPos) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isKeyboardOwnedTarget(e.target)) return;
      if (e.code === "KeyR") {
        e.preventDefault();
        const step = finePlacement ? ROTATE_STEP_R : 90;
        onRotateBy(e.shiftKey ? -step : step);
      } else if (e.code === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draftPos, finePlacement, onCancel, onRotateBy]);

  // Draft-adjust keyboard: arrows nudge (Shift = fine), Q/E rotate small steps
  // (Shift = 1°), R = 15°, Enter commits, Escape discards back to the ghost.
  useEffect(() => {
    if (!draftPos) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isKeyboardOwnedTarget(e.target)) return;
      if (!ADJUST_KEYS.has(e.code)) return;
      e.preventDefault();
      e.stopPropagation();
      const nudge = e.shiftKey ? NUDGE_STEP_FINE : NUDGE_STEP;
      const turn = e.shiftKey ? ROTATE_STEP_TINY : ROTATE_STEP_SMALL;
      switch (e.code) {
        case "ArrowUp":
          nudgeDraft(0, -nudge);
          break;
        case "ArrowDown":
          nudgeDraft(0, nudge);
          break;
        case "ArrowLeft":
          nudgeDraft(-nudge, 0);
          break;
        case "ArrowRight":
          nudgeDraft(nudge, 0);
          break;
        case "KeyQ":
          onRotateBy(-turn);
          break;
        case "KeyE":
          onRotateBy(turn);
          break;
        case "KeyR":
          onRotateBy(e.shiftKey ? -ROTATE_STEP_R : ROTATE_STEP_R);
          break;
        case "Enter":
          commitDraft();
          break;
        case "Escape":
          setDraftPos(null);
          break;
      }
    }
    // Capture phase so stopPropagation reaches us before useAvatarMovement's
    // bubble-phase window listener grabs the same keys.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [draftPos, commitDraft, nudgeDraft, onRotateBy]);

  const draftY = draftPos ? resolveGroundY(draftPos.x, draftPos.z) : 0;

  // Scatter assets strew instances across an axis-aligned square centred on
  // the click — show that square so density and coverage read before placing.
  const scatterOutline = useMemo(() => {
    if (!scatterAreaSize) return null;
    const h = scatterAreaSize / 2;
    return new Float32Array([-h, -h, 0, h, -h, 0, h, -h, 0, h, h, 0, h, h, 0, -h, h, 0, -h, h, 0, -h, -h, 0]);
  }, [scatterAreaSize]);
  const scatterSquare = scatterAreaSize && scatterOutline ? (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <planeGeometry args={[scatterAreaSize, scatterAreaSize]} />
        <meshBasicMaterial color="#35e0a1" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[scatterOutline, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#35e0a1" transparent opacity={0.7} />
      </lineSegments>
    </group>
  ) : null;

  return (
    <group>
      {/* Ghost following the cursor (hidden while a draft is anchored).
          Surface placements snap the ghost to the wall/ceiling in real time. */}
      {!draftPos && ghostPos ? (() => {
        const t = placementFor(ghostPos);
        return (
          <group position={[t.position.x, t.position.y, t.position.z]}>
            <group rotation={[ghostPitch, t.yaw, 0]} scale={scale}>
              <primitive object={ghostModel} />
            </group>
            {scatterSquare}
          </group>
        );
      })() : null}

      {/* Anchored draft: ghost + selection ring + facing tick + control puck */}
      {draftPos ? (
        <group position={[draftPos.x, draftY, draftPos.z]}>
          <group rotation={[0, yaw, 0]} scale={scale}>
            <primitive object={ghostModel} />
          </group>
          {scatterSquare}
          <group rotation={[0, yaw, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[0.55, 0.62, 48]} />
              <meshBasicMaterial color="#35e0a1" transparent opacity={0.85} depthWrite={false} />
            </mesh>
            {/* Facing tick: marks the draft's front (+Z at 0°) so small turns read clearly */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.74]}>
              <circleGeometry args={[0.08, 16]} />
              <meshBasicMaterial color="#35e0a1" transparent opacity={0.95} depthWrite={false} />
            </mesh>
          </group>
          <Html position={[0, 2.05, 0]} center zIndexRange={[40, 0]}>
            <div className="fine-place-puck" onPointerDown={(e) => e.stopPropagation()}>
              <div className="fine-place-puck__row">
                <button type="button" onClick={() => onRotateBy(-ROTATE_STEP_BIG)} title="Rotate left 45°">
                  «
                </button>
                <button type="button" onClick={() => onRotateBy(-ROTATE_STEP_SMALL)} title="Rotate left 5° (Q)">
                  ⟲
                </button>
                <span className="fine-place-puck__deg">{yawDisplay}°</span>
                <button type="button" onClick={() => onRotateBy(ROTATE_STEP_SMALL)} title="Rotate right 5° (E)">
                  ⟳
                </button>
                <button type="button" onClick={() => onRotateBy(ROTATE_STEP_BIG)} title="Rotate right 45°">
                  »
                </button>
              </div>
              <div className="fine-place-puck__row">
                <button type="button" onClick={() => nudgeDraft(-NUDGE_STEP, 0)} title="Nudge left (←)">
                  ◀
                </button>
                <button type="button" onClick={() => nudgeDraft(0, -NUDGE_STEP)} title="Nudge away (↑)">
                  ▲
                </button>
                <button type="button" onClick={() => nudgeDraft(0, NUDGE_STEP)} title="Nudge toward you (↓)">
                  ▼
                </button>
                <button type="button" onClick={() => nudgeDraft(NUDGE_STEP, 0)} title="Nudge right (→)">
                  ▶
                </button>
              </div>
              <div className="fine-place-puck__row fine-place-puck__row--actions">
                <button
                  type="button"
                  className="fine-place-puck__cancel"
                  onClick={() => setDraftPos(null)}
                  title="Discard draft (Esc)"
                >
                  ✕
                </button>
                <button type="button" className="fine-place-puck__confirm" onClick={commitDraft} title="Place (Enter)">
                  ✓ Place
                </button>
              </div>
              <p className="fine-place-puck__hint">Drag to move · arrows nudge · Q/E rotate</p>
            </div>
          </Html>
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
