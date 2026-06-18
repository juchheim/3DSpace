"use client";

import { Html } from "@react-three/drei";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector2, Vector3, type Camera, type OrthographicCamera, type PerspectiveCamera } from "three";
import { snap } from "../../lib/lightEditorMath";

type Vec3 = { x: number; y: number; z: number };
type Axis = "x" | "y" | "z";
type WorldPointerEvent = PointerEvent & {
  __wbCameraDragBlockedBy?: string;
};
type WorldBuilderWindow = Window & {
  __wbActiveLightGizmoDrag?: boolean;
};

/** Shift-snap step for in-world position drags. */
const SNAP_STEP = 0.25;
/** Pointer distance that maps to one world unit during an arrow drag. */
const PIXELS_PER_WORLD_UNIT = 80;
const CENTER_PX = 92;
const ARROW_ANCHOR_X = 10;
const ARROW_ANCHOR_Y = 15;
const ARROW_ORIGIN_OFFSET_PX = 8;
const AXIS_PROJECTION_DISTANCE = 1.5;
const AXIS_DEFS: Record<Axis, { color: string; label: string; worldDir: Vector3 }> = {
  x: { color: "#ff3653", label: "X", worldDir: new Vector3(1, 0, 0) },
  y: { color: "#8adb00", label: "Y", worldDir: new Vector3(0, 1, 0) },
  z: { color: "#2c8fff", label: "Z", worldDir: new Vector3(0, 0, 1) },
};
const FALLBACK_SCREEN_AXES: Record<Axis, Vector2> = {
  x: new Vector2(1, 0),
  y: new Vector2(0, -1),
  z: new Vector2(Math.SQRT1_2, Math.SQRT1_2),
};

type AxisScreenStyle = {
  angleDeg: number;
  offsetX: number;
  offsetY: number;
  screenAxis: Vector2;
};

function setLightGizmoDragActive(active: boolean) {
  if (typeof window === "undefined") return;
  (window as WorldBuilderWindow).__wbActiveLightGizmoDrag = active;
}

function positionWithAxisDelta(position: Vec3, axis: Axis, delta: number, snapToGrid: boolean): Vec3 {
  const next = { ...position };
  next[axis] += delta;
  if (snapToGrid) next[axis] = snap(next[axis], SNAP_STEP);
  return next;
}

function projectToScreen(point: Vector3, camera: Camera, size: { width: number; height: number }) {
  const projected = point.clone().project(camera);
  return new Vector2((projected.x * 0.5 + 0.5) * size.width, (-projected.y * 0.5 + 0.5) * size.height);
}

function isPerspectiveCamera(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true;
}

function isOrthographicCamera(camera: Camera): camera is OrthographicCamera {
  return (camera as OrthographicCamera).isOrthographicCamera === true;
}

function cameraDistanceScale(camera: Camera, worldPosition: Vector3) {
  if (isPerspectiveCamera(camera)) {
    const cameraSpace = worldPosition.clone().applyMatrix4(camera.matrixWorldInverse);
    return Math.max(0.35, Math.abs(cameraSpace.z) * 0.18);
  }
  if (isOrthographicCamera(camera)) {
    return Math.max(0.35, 1 / camera.zoom);
  }
  return 1;
}

function computeAxisScreenStyles(position: Vec3, camera: Camera, size: { width: number; height: number }): Record<Axis, AxisScreenStyle> {
  const origin = new Vector3(position.x, position.y, position.z);
  const screenOrigin = projectToScreen(origin, camera, size);
  const projectionDistance = AXIS_PROJECTION_DISTANCE * cameraDistanceScale(camera, origin);

  return (["x", "y", "z"] as Axis[]).reduce<Record<Axis, AxisScreenStyle>>((styles, axis) => {
    const projectedTarget = projectToScreen(
      origin.clone().addScaledVector(AXIS_DEFS[axis].worldDir, projectionDistance),
      camera,
      size
    );
    const projectedDelta = projectedTarget.sub(screenOrigin);
    const fallbackAxis = FALLBACK_SCREEN_AXES[axis];
    const screenAxis = projectedDelta.lengthSq() > 1e-4 ? projectedDelta.normalize() : fallbackAxis.clone();
    styles[axis] = {
      angleDeg: (Math.atan2(screenAxis.y, screenAxis.x) * 180) / Math.PI,
      offsetX: screenAxis.x * ARROW_ORIGIN_OFFSET_PX,
      offsetY: screenAxis.y * ARROW_ORIGIN_OFFSET_PX,
      screenAxis,
    };
    return styles;
  }, {} as Record<Axis, AxisScreenStyle>);
}

function AxisButton({
  axis,
  active,
  hovered,
  screenStyle,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
}: {
  axis: Axis;
  active: boolean;
  hovered: boolean;
  screenStyle: AxisScreenStyle;
  onPointerDown: (axis: Axis, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerEnter: (axis: Axis) => void;
  onPointerLeave: (axis: Axis) => void;
}) {
  const def = AXIS_DEFS[axis];
  const highlighted = active || hovered;
  const color = highlighted ? "#ffff40" : def.color;

  return (
    <button
      type="button"
      aria-label={`Move light ${def.label}`}
      onPointerDown={(event) => onPointerDown(axis, event)}
      onPointerEnter={() => onPointerEnter(axis)}
      onPointerLeave={() => onPointerLeave(axis)}
      style={{
        position: "absolute",
        left: CENTER_PX - ARROW_ANCHOR_X,
        top: CENTER_PX - ARROW_ANCHOR_Y,
        width: 92,
        height: 30,
        padding: 0,
        border: 0,
        background: "transparent",
        cursor: "grab",
        pointerEvents: "auto",
        transform: `translate(${screenStyle.offsetX}px, ${screenStyle.offsetY}px) rotate(${screenStyle.angleDeg}deg)`,
        transformOrigin: `${ARROW_ANCHOR_X}px ${ARROW_ANCHOR_Y}px`,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 8,
          top: 13,
          width: 66,
          height: 4,
          borderRadius: 999,
          background: color,
          boxShadow: highlighted ? `0 0 0 3px rgba(255,255,255,0.75), 0 0 12px ${def.color}` : `0 0 5px ${def.color}`,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 68,
          top: 7,
          width: 0,
          height: 0,
          borderTop: "9px solid transparent",
          borderBottom: "9px solid transparent",
          borderLeft: `18px solid ${color}`,
          filter: highlighted ? `drop-shadow(0 0 5px ${def.color})` : "none",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 78,
          top: -2,
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          background: "rgba(10, 12, 18, 0.85)",
          color,
          fontSize: 11,
          lineHeight: "18px",
          fontWeight: 800,
          textAlign: "center",
          transform: `rotate(${-screenStyle.angleDeg}deg)`,
        }}
      >
        {def.label}
      </span>
    </button>
  );
}

/**
 * DOM-backed translate gizmo for the selected light. This intentionally avoids
 * 3D raycasted arrow hit targets: the visible arrow and clickable area are the
 * same DOM element, and active drags are tracked on `window` so pointer movement
 * cannot be lost after pointerdown.
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
  const { camera, size } = useThree();
  const draggingRef = useRef(false);
  const shiftRef = useRef(false);
  const lastPos = useRef<Vec3>(position);
  const dragStartRef = useRef<{
    axis: Axis;
    pointerId: number;
    startPointer: Vector2;
    startPosition: Vec3;
  } | null>(null);
  const lastDragLogAtRef = useRef(0);
  const onTransformRef = useRef(onTransform);
  const onTransformCommitRef = useRef(onTransformCommit);
  const [livePosition, setLivePosition] = useState<Vec3>(position);
  const [hoveredAxis, setHoveredAxis] = useState<Axis | null>(null);
  const [dragAxis, setDragAxis] = useState<Axis | null>(null);
  const [axisScreenStyles, setAxisScreenStyles] = useState<Record<Axis, AxisScreenStyle>>(() =>
    computeAxisScreenStyles(position, camera, size)
  );

  useEffect(() => {
    onTransformRef.current = onTransform;
  }, [onTransform]);

  useEffect(() => {
    onTransformCommitRef.current = onTransformCommit;
  }, [onTransformCommit]);

  // Track Shift for snapping.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      shiftRef.current = event.shiftKey;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  useFrame((state) => {
    const next = computeAxisScreenStyles(lastPos.current, state.camera, state.size);
    setAxisScreenStyles((current) => {
      const changed = (["x", "y", "z"] as Axis[]).some((axis) => {
        const prev = current[axis];
        const candidate = next[axis];
        return (
          Math.abs(prev.angleDeg - candidate.angleDeg) > 0.5 ||
          Math.abs(prev.offsetX - candidate.offsetX) > 0.25 ||
          Math.abs(prev.offsetY - candidate.offsetY) > 0.25
        );
      });
      return changed ? next : current;
    });
  });

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    const axis = dragStartRef.current?.axis ?? null;
    draggingRef.current = false;
    dragStartRef.current = null;
    setLightGizmoDragActive(false);
    setDragAxis(null);
    console.info("[3DSpace pointer]", {
      action: "light-move-drag-end",
      target: "light-move-gizmo",
      axis,
      position: lastPos.current,
    });
    onTransformCommitRef.current(lastPos.current);
  }, []);

  const moveDrag = useCallback((event: PointerEvent) => {
    const drag = dragStartRef.current;
    if (!draggingRef.current || !drag) return;
    if (event.pointerId !== drag.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    const pointerDelta = new Vector2(event.clientX, event.clientY).sub(drag.startPointer);
    const worldDelta = pointerDelta.dot(axisScreenStyles[drag.axis].screenAxis) / PIXELS_PER_WORLD_UNIT;
    const next = positionWithAxisDelta(drag.startPosition, drag.axis, worldDelta, shiftRef.current);
    lastPos.current = next;
    setLivePosition(next);

    const now = performance.now();
    if (now - lastDragLogAtRef.current > 250) {
      lastDragLogAtRef.current = now;
      console.info("[3DSpace pointer]", {
        action: "light-move-drag",
        target: "light-move-gizmo",
        axis: drag.axis,
        position: next,
      });
    }
    onTransformRef.current(next);
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => moveDrag(event);
    const onPointerUp = (event: PointerEvent) => {
      if (dragStartRef.current && event.pointerId !== dragStartRef.current.pointerId) return;
      endDrag();
    };
    const onBlur = () => endDrag();
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("blur", onBlur);
      setLightGizmoDragActive(false);
    };
  }, [endDrag, moveDrag]);

  // Keep external position changes in sync while idle.
  useEffect(() => {
    if (draggingRef.current) return;
    lastPos.current = position;
    setLivePosition(position);
  }, [position.x, position.y, position.z, position]);

  const startDrag = useCallback((axis: Axis, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nativeEvent = event.nativeEvent as WorldPointerEvent;
    nativeEvent.__wbCameraDragBlockedBy = "light-move-gizmo-hit";
    setLightGizmoDragActive(true);
    draggingRef.current = true;
    dragStartRef.current = {
      axis,
      pointerId: nativeEvent.pointerId,
      startPointer: new Vector2(nativeEvent.clientX, nativeEvent.clientY),
      startPosition: lastPos.current,
    };
    lastDragLogAtRef.current = 0;
    setDragAxis(axis);
    setHoveredAxis(axis);
    event.currentTarget.setPointerCapture(nativeEvent.pointerId);
    console.info("[3DSpace pointer]", {
      action: "light-move-gizmo-native-hit",
      target: "light-move-gizmo",
      axis,
      x: Math.round(nativeEvent.clientX),
      y: Math.round(nativeEvent.clientY),
    });
    console.info("[3DSpace pointer]", {
      action: "light-move-drag-start",
      target: "light-move-gizmo",
      component: "Arrow",
      axis,
      x: Math.round(nativeEvent.clientX),
      y: Math.round(nativeEvent.clientY),
      position: lastPos.current,
    });
  }, []);

  const stopPropagation = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <Html position={[livePosition.x, livePosition.y, livePosition.z]} center style={{ pointerEvents: "none" }} zIndexRange={[40, 0]}>
      <div
        onPointerDown={stopPropagation}
        onPointerMove={stopPropagation}
        onPointerUp={stopPropagation}
        style={{
          position: "relative",
          width: 184,
          height: 184,
          pointerEvents: "none",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 88,
            top: 88,
            width: 8,
            height: 8,
            borderRadius: 4,
            background: "#ffffff",
            boxShadow: "0 0 0 2px rgba(0,0,0,0.45)",
          }}
        />
        {(["x", "y", "z"] as Axis[]).map((axis) => (
          <AxisButton
            key={axis}
            axis={axis}
            active={dragAxis === axis}
            hovered={hoveredAxis === axis}
            screenStyle={axisScreenStyles[axis]}
            onPointerDown={startDrag}
            onPointerEnter={setHoveredAxis}
            onPointerLeave={(leftAxis) => setHoveredAxis((current) => (current === leftAxis && dragAxis == null ? null : current))}
          />
        ))}
        {dragAxis ? (
          <div
            className="light-gizmo-readout"
            style={{
              position: "absolute",
              left: "50%",
              top: 36,
              transform: "translateX(-50%)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            x <strong>{livePosition.x.toFixed(1)}</strong>{"  "}
            y <strong>{livePosition.y.toFixed(1)}</strong>{"  "}
            z <strong>{livePosition.z.toFixed(1)}</strong>
          </div>
        ) : null}
      </div>
    </Html>
  );
}
