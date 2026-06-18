"use client";

import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Vector2, Vector3, type Camera } from "three";
import type { RoomLight } from "@3dspace/contracts";
import { LIGHT_MAX_DISTANCE, LIGHT_MAX_AREA_SIZE } from "@3dspace/contracts";
import {
  coneMouthForAngle,
  snap,
} from "../../lib/lightEditorMath";

type Vec3 = { x: number; y: number; z: number };
type WorldBuilderWindow = Window & {
  __wbActiveLightGizmoDrag?: boolean;
};

const SPOT_FALLBACK_LEN = 6;
const PX_PER_WORLD_FALLBACK = 80;
const HANDLE_SIZE_PX = 34;

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3): number => Math.sqrt(dot(a, a));
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 };
};
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function setLightGizmoDragActive(active: boolean) {
  if (typeof window === "undefined") return;
  (window as WorldBuilderWindow).__wbActiveLightGizmoDrag = active;
}

function toVector3(v: Vec3) {
  return new Vector3(v.x, v.y, v.z);
}

function projectToScreen(point: Vec3, camera: Camera, size: { width: number; height: number }) {
  const projected = toVector3(point).project(camera);
  return new Vector2((projected.x * 0.5 + 0.5) * size.width, (-projected.y * 0.5 + 0.5) * size.height);
}

function screenDragInfo(anchor: Vec3, handle: Vec3, dragDir: Vec3, camera: Camera, size: { width: number; height: number }) {
  const anchorScreen = projectToScreen(anchor, camera, size);
  const handleScreen = projectToScreen(handle, camera, size);
  let screenAxis = handleScreen.sub(anchorScreen);
  if (screenAxis.lengthSq() < 1e-4) {
    const projectedDir = projectToScreen(add(anchor, dragDir), camera, size).sub(anchorScreen);
    screenAxis = projectedDir.lengthSq() > 1e-4 ? projectedDir : new Vector2(1, 0);
  }
  screenAxis.normalize();

  const unitScreenDelta = projectToScreen(add(anchor, dragDir), camera, size).sub(anchorScreen);
  const pixelsPerWorldUnit = Math.max(8, unitScreenDelta.length() || PX_PER_WORLD_FALLBACK);
  return { screenAxis, pixelsPerWorldUnit };
}

function ShapeHandle({
  pos,
  anchor,
  dragDir,
  color,
  label,
  onStartDrag,
}: {
  pos: Vec3;
  anchor: Vec3;
  dragDir: Vec3;
  color: string;
  label: string;
  onStartDrag: () => (worldDelta: number, shift: boolean, commit: boolean) => void;
}) {
  const { camera, size } = useThree();
  const dragRef = useRef<{
    pointerId: number;
    startPointer: Vector2;
    screenAxis: Vector2;
    pixelsPerWorldUnit: number;
    lastDelta: number;
    apply: (worldDelta: number, shift: boolean, commit: boolean) => void;
  } | null>(null);

  const endDrag = useCallback((shift: boolean) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setLightGizmoDragActive(false);
    drag.apply(drag.lastDelta, shift, true);
  }, []);

  const moveDrag = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerDelta = new Vector2(event.clientX, event.clientY).sub(drag.startPointer);
    const worldDelta = pointerDelta.dot(drag.screenAxis) / drag.pixelsPerWorldUnit;
    drag.lastDelta = worldDelta;
    drag.apply(worldDelta, event.shiftKey, false);
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => moveDrag(event);
    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current && event.pointerId !== dragRef.current.pointerId) return;
      endDrag(event.shiftKey);
    };
    const onBlur = () => endDrag(false);
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

  const startDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nativeEvent = event.nativeEvent;
    const info = screenDragInfo(anchor, pos, normalize(dragDir), camera, size);
    dragRef.current = {
      pointerId: nativeEvent.pointerId,
      startPointer: new Vector2(nativeEvent.clientX, nativeEvent.clientY),
      screenAxis: info.screenAxis,
      pixelsPerWorldUnit: info.pixelsPerWorldUnit,
      lastDelta: 0,
      apply: onStartDrag(),
    };
    setLightGizmoDragActive(true);
    event.currentTarget.setPointerCapture(nativeEvent.pointerId);
  }, [anchor, camera, dragDir, onStartDrag, pos, size]);

  return (
    <Html position={[pos.x, pos.y, pos.z]} center style={{ pointerEvents: "auto" }} zIndexRange={[35, 0]}>
      <button
        type="button"
        aria-label={label}
        onPointerDown={startDrag}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        style={{
          width: HANDLE_SIZE_PX,
          height: HANDLE_SIZE_PX,
          borderRadius: HANDLE_SIZE_PX / 2,
          border: "2px solid rgba(255,255,255,0.95)",
          background: color,
          boxShadow: `0 0 0 6px rgba(0,0,0,0.22), 0 0 14px ${color}`,
          cursor: "grab",
          padding: 0,
          pointerEvents: "auto",
          touchAction: "none",
          userSelect: "none",
        }}
      />
    </Html>
  );
}

/**
 * Direct-manipulation shape handles for the selected light:
 *   - point: range handle sets `distance`
 *   - spot: outer handle sets `angleDeg`; inner handle sets `penumbra`
 *   - area: edge handles set `width` / `height`
 */
export function LightShapeGizmo({
  light,
  color,
  onUpdate,
}: {
  light: RoomLight;
  color: string;
  onUpdate: (patch: Partial<RoomLight>, commit: boolean) => void;
}) {
  const p = light.position;

  if (light.type === "point") {
    const dist = light.distance && light.distance > 0 ? light.distance : 1;
    const handlePos: Vec3 = { x: p.x + dist, y: p.y, z: p.z };
    const startDrag = () => (delta: number, shift: boolean, commit: boolean) => {
      let next = dist + delta;
      if (shift) next = snap(next, 0.5);
      onUpdate({ distance: clamp(next, 0, LIGHT_MAX_DISTANCE) }, commit);
    };
    return (
      <ShapeHandle
        pos={handlePos}
        anchor={p}
        dragDir={{ x: 1, y: 0, z: 0 }}
        color={color}
        label="Adjust point light range"
        onStartDrag={startDrag}
      />
    );
  }

  if (light.type === "spot") {
    const t = light.target ?? { x: p.x, y: 0, z: p.z };
    const dir = normalize(sub(t, p));
    const L = light.distance && light.distance > 0 ? light.distance : SPOT_FALLBACK_LEN;
    const angleDeg = light.angleDeg ?? 30;
    const pen = light.penumbra ?? 0;
    const mouthCenter = add(p, scale(dir, L));
    const mouthRadius = L * Math.tan((angleDeg * Math.PI) / 180);
    const anglePos = coneMouthForAngle(p, t, angleDeg, L);
    const radialDir = normalize(sub(anglePos, mouthCenter));
    const penPos = add(mouthCenter, scale(radialDir, pen * mouthRadius));

    const startAngleDrag = () => (delta: number, shift: boolean, commit: boolean) => {
      const nextRadius = Math.max(0.01, mouthRadius + delta);
      let nextAngle = (Math.atan(nextRadius / L) * 180) / Math.PI;
      if (shift) nextAngle = snap(nextAngle, 5);
      onUpdate({ angleDeg: clamp(nextAngle, 1, 90) }, commit);
    };
    const startPenDrag = () => (delta: number, shift: boolean, commit: boolean) => {
      const radius = Math.max(0.01, mouthRadius);
      let nextPen = pen + delta / radius;
      if (shift) nextPen = snap(nextPen, 0.05);
      onUpdate({ penumbra: clamp(nextPen, 0, 1) }, commit);
    };
    return (
      <>
        <ShapeHandle
          pos={anglePos}
          anchor={mouthCenter}
          dragDir={radialDir}
          color={color}
          label="Adjust spot cone width"
          onStartDrag={startAngleDrag}
        />
        <ShapeHandle
          pos={penPos}
          anchor={mouthCenter}
          dragDir={radialDir}
          color="#ffffff"
          label="Adjust spot edge softness"
          onStartDrag={startPenDrag}
        />
      </>
    );
  }

  if (light.type === "area") {
    const t = light.target ?? { x: p.x, y: p.y - 1, z: p.z };
    const normal = normalize(sub(t, p));
    const up0: Vec3 = Math.abs(normal.y) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const right = normalize(cross(normal, up0));
    const up = normalize(cross(right, normal));
    const w = light.width ?? 2;
    const h = light.height ?? 2;
    const rightPos = add(p, scale(right, w / 2));
    const upPos = add(p, scale(up, h / 2));

    const startWidthDrag = () => (delta: number, shift: boolean, commit: boolean) => {
      let next = w + 2 * delta;
      if (shift) next = snap(next, 0.5);
      onUpdate({ width: clamp(next, 0.1, LIGHT_MAX_AREA_SIZE) }, commit);
    };
    const startHeightDrag = () => (delta: number, shift: boolean, commit: boolean) => {
      let next = h + 2 * delta;
      if (shift) next = snap(next, 0.5);
      onUpdate({ height: clamp(next, 0.1, LIGHT_MAX_AREA_SIZE) }, commit);
    };
    return (
      <>
        <ShapeHandle
          pos={rightPos}
          anchor={p}
          dragDir={right}
          color={color}
          label="Adjust area light width"
          onStartDrag={startWidthDrag}
        />
        <ShapeHandle
          pos={upPos}
          anchor={p}
          dragDir={up}
          color={color}
          label="Adjust area light height"
          onStartDrag={startHeightDrag}
        />
      </>
    );
  }

  return null;
}
