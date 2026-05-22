"use client";

import { Html, Outlines, useGLTF } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Group, Plane, Vector3 } from "three";
import type { Pose, RoomManifest, RoomObject, RoomObjectTemplate } from "@3dspace/contracts";
import {
  parameterSummary,
  snapPosition,
  snapScale,
  snapYaw
} from "../lib/roomObjectInteraction";
import { renderProcedural } from "./roomObjectProcedurals";

type RoomObjectActions = {
  beginGrab(objectId: string): Promise<boolean>;
  publishPose(objectId: string, pose: Pose, scale: number): void;
  endGrab(objectId: string, finalPose: Pose, finalScale: number): Promise<void>;
  update(objectId: string, patch: { colorTintHex?: string }): Promise<unknown>;
  remove(objectId: string): Promise<void>;
  reset(objectId: string): Promise<unknown>;
  setTouch(
    objectId: string,
    touchPolicy: import("@3dspace/contracts").RoomObjectTouchPolicy,
    grants?: { userIds?: string[]; groupIds?: string[] }
  ): Promise<unknown>;
  setParameters(objectId: string, parameters: Record<string, unknown>): void;
};

function RoomObjectGltf({
  assetUrl,
  scale,
  exportRootRef
}: {
  assetUrl: string;
  scale: number;
  exportRootRef: RefObject<Group | null>;
}) {
  const { scene } = useGLTF(assetUrl);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive ref={exportRootRef as never} object={clone} scale={scale} />;
}

export function RoomObjectMesh({
  manifest,
  object,
  template,
  canTouch,
  isGrabbed,
  grabHolderColor,
  localIsHolder,
  selected,
  actions,
  onSelect
}: {
  manifest: RoomManifest;
  object: RoomObject;
  template: RoomObjectTemplate;
  canTouch: boolean;
  isGrabbed: boolean;
  grabHolderColor: string;
  localIsHolder: boolean;
  selected: boolean;
  actions: RoomObjectActions;
  onSelect(): void;
}) {
  const { camera, raycaster, pointer, gl } = useThree();
  const rootRef = useRef<Group>(null);
  const exportRootRef = useRef<Group>(null);
  const dragPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const intersection = useMemo(() => new Vector3(), []);
  const dragOffsetRef = useRef(new Vector3());
  const shiftRef = useRef(false);

  const [pose, setPose] = useState(object.pose);
  const [scale, setScale] = useState(object.scale);
  const [dragMode, setDragMode] = useState<"none" | "translate" | "rotate">("none");
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (dragMode === "none") {
      setPose(object.pose);
      setScale(object.scale);
    }
  }, [dragMode, object.pose, object.scale]);

  const outlineOpacity = localIsHolder ? 1 : 0.6;
  const showOutline = selected || isGrabbed;
  const summary = parameterSummary(object.parameters);

  const applyPose = useCallback(
    (nextPose: Pose, nextScale: number, bypassSnap: boolean) => {
      const snappedPose: Pose = {
        position: snapPosition(manifest, nextPose.position, bypassSnap),
        rotation: {
          ...nextPose.rotation,
          yaw: snapYaw(nextPose.rotation.yaw, bypassSnap)
        }
      };
      const snappedScale = snapScale(nextScale, template.defaultScale, bypassSnap);
      setPose(snappedPose);
      setScale(snappedScale);
      return { pose: snappedPose, scale: snappedScale };
    },
    [manifest, template.defaultScale]
  );

  const raycastFloorPoint = useCallback(() => {
    dragPlane.constant = -pose.position.y;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(dragPlane, intersection) ? intersection.clone() : null;
  }, [camera, dragPlane, intersection, pointer, pose.position.y, raycaster]);

  const finishDrag = useCallback(async () => {
    if (dragMode === "none") return;
    setDragMode("none");
    const final = applyPose(pose, scale, shiftRef.current);
    await actions.endGrab(object.id, final.pose, final.scale);
  }, [actions, applyPose, dragMode, object.id, pose, scale]);

  useEffect(() => {
    if (dragMode === "none") return;

    function onPointerMove(event: PointerEvent) {
      shiftRef.current = event.shiftKey;
      const hit = raycastFloorPoint();
      if (!hit) return;

      if (dragMode === "translate") {
        const nextPosition = {
          x: hit.x + dragOffsetRef.current.x,
          y: pose.position.y,
          z: hit.z + dragOffsetRef.current.z
        };
        const next = applyPose({ ...pose, position: nextPosition }, scale, event.shiftKey);
        actions.publishPose(object.id, next.pose, next.scale);
      } else if (dragMode === "rotate") {
        const dx = hit.x - pose.position.x;
        const dz = hit.z - pose.position.z;
        const yaw = Math.atan2(dx, dz);
        const next = applyPose({ ...pose, rotation: { ...pose.rotation, yaw } }, scale, event.shiftKey);
        actions.publishPose(object.id, next.pose, next.scale);
      }
    }

    function onPointerUp() {
      void finishDrag();
    }

    function onKeyDown(event: KeyboardEvent) {
      shiftRef.current = event.shiftKey;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actions, applyPose, dragMode, finishDrag, object.id, pose, raycastFloorPoint, scale]);

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      (event.nativeEvent as PointerEvent).stopImmediatePropagation?.();
      onSelect();
      shiftRef.current = event.shiftKey;

      if (!canTouch) return;
      const native = event.nativeEvent as PointerEvent;
      const rotate = native.button === 2 || native.altKey;

      void (async () => {
        const grabbed = await actions.beginGrab(object.id);
        if (!grabbed) return;

        const hit = raycastFloorPoint();
        if (hit) {
          dragOffsetRef.current.set(pose.position.x - hit.x, 0, pose.position.z - hit.z);
        }
        setDragMode(rotate ? "rotate" : "translate");
        gl.domElement.setPointerCapture(native.pointerId);
      })();
    },
    [actions, canTouch, gl.domElement, object.id, onSelect, pose.position.x, pose.position.z, raycastFloorPoint]
  );

  const onWheel = useCallback(
    (event: ThreeEvent<WheelEvent>) => {
      if (!localIsHolder && !hovered) return;
      if (!canTouch || !localIsHolder) return;
      event.stopPropagation();
      shiftRef.current = event.shiftKey;
      const delta = event.deltaY > 0 ? -1 : 1;
      const step = template.defaultScale * 0.05;
      const next = applyPose(pose, scale + delta * step, event.shiftKey);
      actions.publishPose(object.id, next.pose, next.scale);
    },
    [actions, applyPose, canTouch, hovered, localIsHolder, object.id, pose, scale, template.defaultScale]
  );

  const yaw = pose.rotation.yaw;

  return (
    <group
      ref={rootRef}
      position={[pose.position.x, pose.position.y, pose.position.z]}
      rotation={[0, yaw, 0]}
      scale={template.renderer === "gltf" ? scale : 1}
      onPointerDown={onPointerDown}
      onWheel={onWheel}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <group ref={exportRootRef}>
        {template.renderer === "procedural" && template.proceduralId ? (
          renderProcedural(template.proceduralId, {
            parameters: object.parameters,
            scale,
            colorTintHex: object.colorTintHex,
            exportRootRef
          })
        ) : template.assetUrl ? (
          <Suspense fallback={null}>
            <RoomObjectGltf assetUrl={template.assetUrl} scale={1} exportRootRef={exportRootRef} />
          </Suspense>
        ) : (
          <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color="#888" wireframe />
          </mesh>
        )}
      </group>

      <mesh visible={false} scale={[1.2, 1.2, 0.35]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        {showOutline ? (
          <Outlines
            thickness={0.03}
            color={grabHolderColor}
            opacity={outlineOpacity}
            screenspace={false}
          />
        ) : null}
      </mesh>

      <Html center distanceFactor={7} position={[0, 1.1, 0]} className="room-object-html">
        <div className="room-object-label">
          <span className="room-object-label__name">{object.displayName}</span>
          {summary ? <span className="room-object-label__meta">{summary}</span> : null}
        </div>
      </Html>
    </group>
  );
}
