"use client";

import { useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { RoomLight } from "@3dspace/contracts";
import { LIGHT_MAX_DISTANCE, LIGHT_MAX_AREA_SIZE } from "@3dspace/contracts";
import {
  projectPointerToDragPlane,
  coneAngleFromConeMouth,
  coneMouthForAngle,
  snap,
} from "../../lib/lightEditorMath";

type Vec3 = { x: number; y: number; z: number };

const SPOT_FALLBACK_LEN = 6;

// ── tiny vector helpers ─────────────────────────────────────────────────────
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

/**
 * A draggable sphere handle that projects the pointer onto a plane (computed at
 * drag start by `onStart`) and reports the world hit during drag and on release.
 */
function Handle({
  pos,
  color,
  radius = 0.16,
  onStart,
  onDrag,
  onEnd,
}: {
  pos: Vec3;
  color: string;
  radius?: number;
  onStart: () => { anchor: Vec3; normal: Vec3 };
  onDrag: (hit: Vec3, shift: boolean) => void;
  onEnd: (hit: Vec3, shift: boolean) => void;
}) {
  const { gl } = useThree();
  const dragging = useRef(false);
  const plane = useRef<{ anchor: Vec3; normal: Vec3 }>({ anchor: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } });
  const last = useRef<Vec3>(pos);

  return (
    <mesh
      position={[pos.x, pos.y, pos.z]}
      renderOrder={520}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        dragging.current = true;
        plane.current = onStart();
        last.current = pos;
        gl.domElement.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!dragging.current) return;
        e.stopPropagation();
        const hit = projectPointerToDragPlane(
          { x: e.ray.origin.x, y: e.ray.origin.y, z: e.ray.origin.z },
          { x: e.ray.direction.x, y: e.ray.direction.y, z: e.ray.direction.z },
          plane.current.anchor,
          plane.current.normal
        );
        if (!hit) return;
        last.current = hit;
        onDrag(hit, e.shiftKey);
      }}
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        if (!dragging.current) return;
        dragging.current = false;
        gl.domElement.releasePointerCapture(e.pointerId);
        onEnd(last.current, e.shiftKey);
      }}
    >
      <sphereGeometry args={[radius, 14, 10]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} />
    </mesh>
  );
}

/**
 * Direct-manipulation shape handles for the selected light:
 *   - point → range-ring handle sets `distance`
 *   - spot  → cone-mouth handle sets `angleDeg`; inner handle sets `penumbra`
 *   - area  → edge handles set `width` / `height`
 * `commit:false` while dragging, `commit:true` on release; Shift snaps.
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
    const apply = (hit: Vec3, shift: boolean, commit: boolean) => {
      let d = Math.hypot(hit.x - p.x, hit.z - p.z);
      if (shift) d = snap(d, 0.5);
      onUpdate({ distance: clamp(d, 0, LIGHT_MAX_DISTANCE) }, commit);
    };
    return (
      <Handle
        pos={handlePos}
        color={color}
        onStart={() => ({ anchor: p, normal: { x: 0, y: 1, z: 0 } })}
        onDrag={(hit, shift) => apply(hit, shift, false)}
        onEnd={(hit, shift) => apply(hit, shift, true)}
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
    const perpDir = normalize(sub(anglePos, mouthCenter));
    const penPos = add(mouthCenter, scale(perpDir, pen * mouthRadius));

    const applyAngle = (hit: Vec3, shift: boolean, commit: boolean) => {
      let a = coneAngleFromConeMouth(p, t, hit);
      if (shift) a = snap(a, 5);
      onUpdate({ angleDeg: clamp(a, 1, 90) }, commit);
    };
    const applyPen = (hit: Vec3, shift: boolean, commit: boolean) => {
      const r = len(sub(hit, mouthCenter));
      let pn = mouthRadius > 1e-6 ? r / mouthRadius : 0;
      if (shift) pn = snap(pn, 0.05);
      onUpdate({ penumbra: clamp(pn, 0, 1) }, commit);
    };
    return (
      <>
        <Handle
          pos={anglePos}
          color={color}
          onStart={() => ({ anchor: mouthCenter, normal: dir })}
          onDrag={(hit, shift) => applyAngle(hit, shift, false)}
          onEnd={(hit, shift) => applyAngle(hit, shift, true)}
        />
        <Handle
          pos={penPos}
          color="#ffffff"
          radius={0.12}
          onStart={() => ({ anchor: mouthCenter, normal: dir })}
          onDrag={(hit, shift) => applyPen(hit, shift, false)}
          onEnd={(hit, shift) => applyPen(hit, shift, true)}
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

    const applyWidth = (hit: Vec3, shift: boolean, commit: boolean) => {
      let next = 2 * Math.abs(dot(sub(hit, p), right));
      if (shift) next = snap(next, 0.5);
      onUpdate({ width: clamp(next, 0.1, LIGHT_MAX_AREA_SIZE) }, commit);
    };
    const applyHeight = (hit: Vec3, shift: boolean, commit: boolean) => {
      let next = 2 * Math.abs(dot(sub(hit, p), up));
      if (shift) next = snap(next, 0.5);
      onUpdate({ height: clamp(next, 0.1, LIGHT_MAX_AREA_SIZE) }, commit);
    };
    return (
      <>
        <Handle
          pos={rightPos}
          color={color}
          onStart={() => ({ anchor: p, normal })}
          onDrag={(hit, shift) => applyWidth(hit, shift, false)}
          onEnd={(hit, shift) => applyWidth(hit, shift, true)}
        />
        <Handle
          pos={upPos}
          color={color}
          onStart={() => ({ anchor: p, normal })}
          onDrag={(hit, shift) => applyHeight(hit, shift, false)}
          onEnd={(hit, shift) => applyHeight(hit, shift, true)}
        />
      </>
    );
  }

  return null;
}
