"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Group,
  type OrthographicCamera,
  type PerspectiveCamera,
} from "three";
import { snap } from "../../lib/lightEditorMath";

type Vec3 = { x: number; y: number; z: number };
type Axis = "x" | "y" | "z";
type WorldPointerEvent = PointerEvent & {
  __wbCameraDragBlockedBy?: string;
};
type WorldBuilderWindow = Window & {
  __wbActiveLightGizmoDrag?: boolean;
};
type PointerCaptureTarget = EventTarget & {
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

/** Shift-snap step for in-world position drags. */
const SNAP_STEP = 0.25;
/** Approximate screen-space length of each arrow. */
const GIZMO_SCREEN_LENGTH_PX = 92;
const ARROW_LENGTH = 1;
const SHAFT_RADIUS = 0.025;
const HIT_RADIUS = 0.16;
const CONE_LENGTH = 0.2;
const CONE_RADIUS = 0.08;
const AXIS_DEFS: Record<Axis, { color: string; dir: Vector3 }> = {
  x: { color: "#ff3653", dir: new Vector3(1, 0, 0) },
  y: { color: "#8adb00", dir: new Vector3(0, 1, 0) },
  z: { color: "#2c8fff", dir: new Vector3(0, 0, 1) },
};
const BASE_Y = new Vector3(0, 1, 0);

function setLightGizmoDragActive(active: boolean) {
  if (typeof window === "undefined") return;
  (window as WorldBuilderWindow).__wbActiveLightGizmoDrag = active;
}

function vecFrom(pos: Vec3) {
  return new Vector3(pos.x, pos.y, pos.z);
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

function screenScaleFor(camera: Camera, size: { height: number }, worldPosition: Vector3) {
  if (size.height <= 0) return 1;
  if (isPerspectiveCamera(camera)) {
    const cameraSpace = worldPosition.clone().applyMatrix4(camera.matrixWorldInverse);
    const distance = Math.max(0.1, Math.abs(cameraSpace.z));
    const worldHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance;
    return (worldHeight / size.height) * GIZMO_SCREEN_LENGTH_PX;
  }
  if (isOrthographicCamera(camera)) {
    return ((camera.top - camera.bottom) / camera.zoom / size.height) * GIZMO_SCREEN_LENGTH_PX;
  }
  return 1;
}

function positionWithAxisDelta(position: Vec3, axis: Axis, delta: number, snapToGrid: boolean): Vec3 {
  const next = { ...position };
  next[axis] += delta;
  if (snapToGrid) next[axis] = snap(next[axis], SNAP_STEP);
  return next;
}

function AxisArrow({
  axis,
  active,
  hovered,
  onPointerDown,
  onPointerOver,
  onPointerOut,
}: {
  axis: Axis;
  active: boolean;
  hovered: boolean;
  onPointerDown: (axis: Axis, event: ThreeEvent<PointerEvent>) => void;
  onPointerOver: (axis: Axis, event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (axis: Axis, event: ThreeEvent<PointerEvent>) => void;
}) {
  const def = AXIS_DEFS[axis];
  const color = active || hovered ? "#ffff40" : def.color;
  const rotation = new Quaternion().setFromUnitVectors(BASE_Y, def.dir);

  return (
    <group quaternion={rotation}>
      <mesh position={[0, ARROW_LENGTH / 2, 0]} renderOrder={600}>
        <cylinderGeometry args={[SHAFT_RADIUS, SHAFT_RADIUS, ARROW_LENGTH, 16]} />
        <meshBasicMaterial color={color} depthTest={false} fog={false} />
      </mesh>
      <mesh position={[0, ARROW_LENGTH + CONE_LENGTH / 2, 0]} renderOrder={600}>
        <coneGeometry args={[CONE_RADIUS, CONE_LENGTH, 24]} />
        <meshBasicMaterial color={color} depthTest={false} fog={false} />
      </mesh>
      <mesh
        position={[0, (ARROW_LENGTH + CONE_LENGTH) / 2, 0]}
        onPointerDown={(event) => onPointerDown(axis, event)}
        onPointerOver={(event) => onPointerOver(axis, event)}
        onPointerOut={(event) => onPointerOut(axis, event)}
        userData={{ lightMoveGizmoHit: true, axis }}
        renderOrder={601}
      >
        <cylinderGeometry args={[HIT_RADIUS, HIT_RADIUS, ARROW_LENGTH + CONE_LENGTH, 16]} />
        <meshBasicMaterial color={def.color} transparent opacity={0} depthWrite={false} depthTest={false} fog={false} />
      </mesh>
    </group>
  );
}

/**
 * A translate-only 3-axis move gizmo for the selected light. The hit targets
 * are intentionally custom meshes so the clickable area stays aligned with the
 * visible arrows across browser zoom, camera angle, and fixed screen scaling.
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
  const { camera, gl, size } = useThree();
  const groupRef = useRef<Group>(null);
  const draggingRef = useRef(false);
  const shiftRef = useRef(false);
  const lastPos = useRef<Vec3>(position);
  const dragStartRef = useRef<{
    axis: Axis;
    pointerId: number;
    startPointer: Vector2;
    startPosition: Vec3;
    screenAxis: Vector2;
    pixelsPerWorldUnit: number;
  } | null>(null);
  const lastDragLogAtRef = useRef(0);
  const hitRaycasterRef = useRef(new Raycaster());
  const pointerNdcRef = useRef(new Vector2());
  const [livePosition, setLivePosition] = useState<Vec3>(position);
  const [hoveredAxis, setHoveredAxis] = useState<Axis | null>(null);
  const [dragAxis, setDragAxis] = useState<Axis | null>(null);

  // Track Shift for snapping.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      shiftRef.current = e.shiftKey;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // Keep the fixed-size arrows stable on screen while preserving world axes.
  useFrame((state) => {
    if (!groupRef.current) return;
    const worldPosition = vecFrom(lastPos.current);
    groupRef.current.scale.setScalar(screenScaleFor(state.camera, state.size, worldPosition));
  });

  // The room camera listens to native canvas pointer events. Mark native
  // pointerdown events that hit the gizmo so camera panning declines before
  // React Three Fiber starts the axis drag.
  useEffect(() => {
    const canvas = gl.domElement;
    const onCanvasPointerDownCapture = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const group = groupRef.current;
      if (!group) return;

      const rect = canvas.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return;
      }

      pointerNdcRef.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = hitRaycasterRef.current;
      raycaster.setFromCamera(pointerNdcRef.current, camera);
      const hit = raycaster
        .intersectObject(group, true)
        .find((intersection) => intersection.object.userData.lightMoveGizmoHit);
      if (!hit) return;

      (event as WorldPointerEvent).__wbCameraDragBlockedBy = "light-move-gizmo-hit";
      console.info("[3DSpace pointer]", {
        action: "light-move-gizmo-native-hit",
        target: "light-move-gizmo",
        axis: hit.object.userData.axis,
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
      });
    };

    canvas.addEventListener("pointerdown", onCanvasPointerDownCapture, { capture: true });
    return () => {
      canvas.removeEventListener("pointerdown", onCanvasPointerDownCapture, { capture: true });
    };
  }, [camera, gl]);

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
    onTransformCommit(lastPos.current);
  }, [onTransformCommit]);

  // Recover cleanly from pointer cancellation, window blur, or a release that
  // happens outside the canvas.
  useEffect(() => {
    const resetDrag = () => {
      endDrag();
      setLightGizmoDragActive(false);
    };
    window.addEventListener("pointerup", resetDrag, true);
    window.addEventListener("pointercancel", resetDrag, true);
    window.addEventListener("blur", resetDrag);
    return () => {
      window.removeEventListener("pointerup", resetDrag, true);
      window.removeEventListener("pointercancel", resetDrag, true);
      window.removeEventListener("blur", resetDrag);
    };
  }, [endDrag]);

  // Keep external position changes in sync while idle.
  useEffect(() => {
    if (draggingRef.current) return;
    lastPos.current = position;
    setLivePosition(position);
  }, [position.x, position.y, position.z, position]);

  const startDrag = useCallback(
    (axis: Axis, event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const pointerEvent = event.nativeEvent;
      setLightGizmoDragActive(true);

      const origin = vecFrom(lastPos.current);
      const screenOrigin = projectToScreen(origin, camera, size);
      const screenEnd = projectToScreen(origin.clone().add(AXIS_DEFS[axis].dir), camera, size);
      const screenDelta = screenEnd.sub(screenOrigin);
      const pixelsPerWorldUnit = Math.max(1, screenDelta.length());
      const screenAxis = screenDelta.normalize();

      draggingRef.current = true;
      dragStartRef.current = {
        axis,
        pointerId: pointerEvent.pointerId,
        startPointer: new Vector2(pointerEvent.clientX, pointerEvent.clientY),
        startPosition: lastPos.current,
        screenAxis,
        pixelsPerWorldUnit,
      };
      setDragAxis(axis);
      setHoveredAxis(axis);
      (event.target as PointerCaptureTarget | null)?.setPointerCapture?.(pointerEvent.pointerId);
      console.info("[3DSpace pointer]", {
        action: "light-move-drag-start",
        target: "light-move-gizmo",
        component: "Arrow",
        axis,
        x: Math.round(pointerEvent.clientX),
        y: Math.round(pointerEvent.clientY),
        position: lastPos.current,
      });
    },
    [camera, size]
  );

  const moveDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const drag = dragStartRef.current;
      if (!draggingRef.current || !drag) return;

      const pointerEvent = event.nativeEvent;
      const pointerDelta = new Vector2(pointerEvent.clientX, pointerEvent.clientY).sub(drag.startPointer);
      const worldDelta = pointerDelta.dot(drag.screenAxis) / drag.pixelsPerWorldUnit;
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
      onTransform(next);
    },
    [onTransform]
  );

  const stopDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (dragStartRef.current) {
        (event.target as PointerCaptureTarget | null)?.releasePointerCapture?.(dragStartRef.current.pointerId);
      }
      endDrag();
    },
    [endDrag]
  );

  const handlePointerOver = useCallback((axis: Axis, event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHoveredAxis(axis);
  }, []);

  const handlePointerOut = useCallback((axis: Axis, event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHoveredAxis((current) => (current === axis && dragAxis == null ? null : current));
  }, [dragAxis]);

  return (
    <group
      ref={groupRef}
      position={[livePosition.x, livePosition.y, livePosition.z]}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      {(["x", "y", "z"] as Axis[]).map((axis) => (
        <AxisArrow
          key={axis}
          axis={axis}
          active={dragAxis === axis}
          hovered={hoveredAxis === axis}
          onPointerDown={startDrag}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        />
      ))}
      {dragAxis ? (
        <Html position={[0, 0.35, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
          <div className="light-gizmo-readout">
            x <strong>{livePosition.x.toFixed(1)}</strong>{"  "}
            y <strong>{livePosition.y.toFixed(1)}</strong>{"  "}
            z <strong>{livePosition.z.toFixed(1)}</strong>
          </div>
        </Html>
      ) : null}
    </group>
  );
}
