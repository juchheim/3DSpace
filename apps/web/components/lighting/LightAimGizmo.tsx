"use client";

import { useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Vector3 } from "three";
import { projectPointerToDragPlane } from "../../lib/lightEditorMath";

type Vec3 = { x: number; y: number; z: number };

/**
 * Aim gizmo for spot/area lights: a draggable ringed target handle joined to
 * the fixture by a dashed beam. The handle drags on a camera-facing plane
 * through the current target (via {@link projectPointerToDragPlane}) so a drag
 * changes all three target components, not just X/Z. Reports `commit:false`
 * while dragging and one `commit:true` on release.
 */
export function LightAimGizmo({
  position,
  target,
  color,
  onUpdate,
}: {
  position: Vec3;
  target: Vec3;
  color: string;
  onUpdate: (target: Vec3, commit: boolean) => void;
}) {
  const { gl, camera } = useThree();
  const dragging = useRef(false);
  const anchor = useRef<Vec3>(target);
  const planeNormal = useRef<Vec3>({ x: 0, y: 0, z: 1 });
  const last = useRef<Vec3>(target);

  const beam: [number, number, number][] = [
    [position.x, position.y, position.z],
    [target.x, target.y, target.z],
  ];

  function onPointerDown(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    dragging.current = true;
    anchor.current = { ...target };
    last.current = { ...target };
    // Drag on the plane that currently faces the camera (through the target).
    const dir = new Vector3();
    camera.getWorldDirection(dir);
    planeNormal.current = { x: dir.x, y: dir.y, z: dir.z };
    gl.domElement.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ThreeEvent<PointerEvent>) {
    if (!dragging.current) return;
    e.stopPropagation();
    const hit = projectPointerToDragPlane(
      { x: e.ray.origin.x, y: e.ray.origin.y, z: e.ray.origin.z },
      { x: e.ray.direction.x, y: e.ray.direction.y, z: e.ray.direction.z },
      anchor.current,
      planeNormal.current
    );
    if (!hit) return;
    last.current = hit;
    onUpdate(hit, false);
  }

  function onPointerUp(e: ThreeEvent<PointerEvent>) {
    if (!dragging.current) return;
    dragging.current = false;
    gl.domElement.releasePointerCapture(e.pointerId);
    onUpdate(last.current, true);
  }

  return (
    <>
      <Line
        points={beam}
        color={color}
        lineWidth={2}
        dashed
        dashSize={0.25}
        gapSize={0.15}
        transparent
        opacity={0.9}
        depthTest={false}
        renderOrder={510}
      />
      <group position={[target.x, target.y, target.z]}>
        <mesh
          renderOrder={511}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <sphereGeometry args={[0.16, 16, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} depthTest={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={511}>
          <torusGeometry args={[0.3, 0.03, 8, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} depthTest={false} />
        </mesh>
      </group>
    </>
  );
}
