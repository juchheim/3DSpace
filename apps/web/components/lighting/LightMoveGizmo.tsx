"use client";

import { useEffect, useRef, useState } from "react";
import { PivotControls, Html } from "@react-three/drei";
import { Matrix4, Vector3 } from "three";
import { snap } from "../../lib/lightEditorMath";

type Vec3 = { x: number; y: number; z: number };

/** Shift-snap step for in-world position drags. */
const SNAP_STEP = 0.25;
/** Screen-space size (≈px) of the gizmo when `fixed`. */
const GIZMO_SCALE = 100;

/**
 * A translate-only 3-axis move gizmo (drei PivotControls) for the selected
 * light. Reports `commit:false` positions on drag and a single `commit:true`
 * on release. Hold Shift to snap to {@link SNAP_STEP}. The gizmo's matrix is
 * controlled so it tracks external updates (keyboard nudges, other users).
 */
export function LightMoveGizmo({
  position,
  onTransform,
  onTransformCommit,
}: {
  position: Vec3;
  onTransform: (pos: Vec3) => void;
  onTransformCommit: (pos: Vec3) => void;
}) {
  const draggingRef = useRef(false);
  const shiftRef = useRef(false);
  const lastPos = useRef<Vec3>(position);
  const [matrix] = useState(() => new Matrix4().setPosition(position.x, position.y, position.z));
  const [dragging, setDragging] = useState(false);
  const [pivotVersion, setPivotVersion] = useState(0);

  // Track Shift for snapping (PivotControls doesn't pass the pointer event).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { shiftRef.current = e.shiftKey; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // If the user clicks other 3D/HTML elements while a light is selected, Drei's
  // PivotControls can occasionally keep stale internal hover/drag hit state.
  // Resetting on global pointer release/cancel makes the selected-light axes
  // recover immediately without needing a deselect/reselect cycle.
  useEffect(() => {
    const resetPivotHitState = () => {
      window.setTimeout(() => {
        draggingRef.current = false;
        setDragging(false);
        setPivotVersion((version) => version + 1);
      }, 0);
    };
    window.addEventListener("pointerup", resetPivotHitState, true);
    window.addEventListener("pointercancel", resetPivotHitState, true);
    window.addEventListener("blur", resetPivotHitState);
    return () => {
      window.removeEventListener("pointerup", resetPivotHitState, true);
      window.removeEventListener("pointercancel", resetPivotHitState, true);
      window.removeEventListener("blur", resetPivotHitState);
    };
  }, []);

  // Keep the controlled matrix in sync with external position changes while idle.
  useEffect(() => {
    if (draggingRef.current) return;
    matrix.setPosition(position.x, position.y, position.z);
    lastPos.current = position;
    setPivotVersion((version) => version + 1);
  }, [position.x, position.y, position.z, matrix]);

  const scratch = useRef(new Vector3());

  return (
    <PivotControls
      key={pivotVersion}
      autoTransform={false}
      matrix={matrix}
      disableRotations
      disableScaling
      activeAxes={[true, true, true]}
      depthTest={false}
      fixed
      scale={GIZMO_SCALE}
      lineWidth={3}
      axisColors={["#ff3653", "#8adb00", "#2c8fff"]}
      onDragStart={() => { draggingRef.current = true; setDragging(true); }}
      onDrag={(local) => {
        const v = scratch.current.setFromMatrixPosition(local);
        let px = v.x;
        let py = v.y;
        let pz = v.z;
        if (shiftRef.current) {
          px = snap(px, SNAP_STEP);
          py = snap(py, SNAP_STEP);
          pz = snap(pz, SNAP_STEP);
        }
        // Rotations/scaling are disabled, so a pure translation matrix is exact.
        matrix.makeTranslation(px, py, pz);
        const pos = { x: px, y: py, z: pz };
        lastPos.current = pos;
        onTransform(pos);
      }}
      onDragEnd={() => {
        draggingRef.current = false;
        setDragging(false);
        setPivotVersion((version) => version + 1);
        onTransformCommit(lastPos.current);
      }}
    >
      {dragging ? (
        <Html position={[0, 0.35, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
          <div className="light-gizmo-readout">
            x <strong>{position.x.toFixed(1)}</strong>{"  "}
            y <strong>{position.y.toFixed(1)}</strong>{"  "}
            z <strong>{position.z.toFixed(1)}</strong>
          </div>
        </Html>
      ) : null}
    </PivotControls>
  );
}
