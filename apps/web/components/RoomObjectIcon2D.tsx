"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Pose, RoomManifest, RoomObject, RoomObjectTemplate } from "@3dspace/contracts";
import { floorYFromZ, projectPositionTo2D, unprojectPointFrom2D } from "@3dspace/room-engine";
import { snapPosition, snapScale, snapYaw } from "../lib/roomObjectInteraction";

const CATEGORY_EMOJI: Record<RoomObjectTemplate["category"], string> = {
  math: "🔢",
  science: "🧪",
  geography: "🌍",
  ela: "📖",
  art: "🎨",
  custom: "📦"
};

type RoomObjectActions = {
  beginGrab(objectId: string): Promise<boolean>;
  publishPose(objectId: string, pose: Pose, scale: number): void;
  endGrab(objectId: string, finalPose: Pose, finalScale: number): Promise<void>;
};

function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100
  };
}

export function RoomObjectIcon2D({
  manifest,
  object,
  template,
  canTouch,
  isGrabbed,
  grabHolderColor,
  holderDisplayName,
  localIsHolder,
  selected,
  actions,
  onSelect,
  onAnnounce
}: {
  manifest: RoomManifest;
  object: RoomObject;
  template: RoomObjectTemplate;
  canTouch: boolean;
  isGrabbed: boolean;
  grabHolderColor: string;
  holderDisplayName?: string | undefined;
  localIsHolder: boolean;
  selected: boolean;
  actions: RoomObjectActions;
  onSelect(): void;
  onAnnounce?(message: string): void;
}) {
  const [pose, setPose] = useState(object.pose);
  const [scale, setScale] = useState(object.scale);
  const [dragMode, setDragMode] = useState<"none" | "translate">("none");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shiftRef = useRef(false);

  useEffect(() => {
    if (dragMode === "none") {
      setPose(object.pose);
      setScale(object.scale);
    }
  }, [dragMode, object.pose, object.scale]);

  const visualRadius = useMemo(() => {
    const ratio = scale / template.defaultScale;
    return Math.min(6, Math.max(2.8, 3.6 * ratio));
  }, [scale, template.defaultScale]);

  const mapPoint = useMemo(() => projectPositionTo2D(manifest, pose.position), [manifest, pose.position]);
  const yawDegrees = (pose.rotation.yaw * 180) / Math.PI;

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

  const poseFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const point = clientToSvgPoint(svg, clientX, clientY);
      const world = unprojectPointFrom2D(manifest, point);
      return {
        ...pose,
        position: {
          x: world.x,
          y: floorYFromZ(manifest, world.z),
          z: world.z
        }
      };
    },
    [manifest, pose]
  );

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
      const nextPose = poseFromClient(event.clientX, event.clientY);
      if (!nextPose) return;
      const next = applyPose(nextPose, scale, event.shiftKey);
      actions.publishPose(object.id, next.pose, next.scale);
    }

    function onPointerUp() {
      void finishDrag();
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [actions, applyPose, dragMode, finishDrag, object.id, poseFromClient, scale]);

  const onPointerDown = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect();
    shiftRef.current = event.shiftKey;
    svgRef.current = event.currentTarget.ownerSVGElement;

    if (!canTouch || event.button !== 0) return;

    void (async () => {
      const grabbed = await actions.beginGrab(object.id);
      if (!grabbed) return;
      setDragMode("translate");
      event.currentTarget.setPointerCapture(event.pointerId);
    })();
  };

  const onWheel = (event: React.WheelEvent<SVGGElement>) => {
    if (!canTouch || !localIsHolder) return;
    event.stopPropagation();
    shiftRef.current = event.shiftKey;
    const delta = event.deltaY > 0 ? -1 : 1;
    const step = template.defaultScale * 0.05;
    const next = applyPose(pose, scale + delta * step, event.shiftKey);
    actions.publishPose(object.id, next.pose, next.scale);
  };

  const onFocus = () => {
    const paramSummary = Object.entries(object.parameters)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(", ");
    onAnnounce?.(
      `${template.displayName}. ${template.description}${paramSummary ? `. Parameters: ${paramSummary}` : ""}${
        isGrabbed && holderDisplayName ? `. Held by ${holderDisplayName}` : ""
      }`
    );
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${object.displayName}${isGrabbed && holderDisplayName ? `, held by ${holderDisplayName}` : ""}`}
      className={`room-object-icon-2d${selected ? " room-object-icon-2d--selected" : ""}${dragMode !== "none" ? " room-object-icon-2d--grabbing" : ""}`}
      transform={`translate(${mapPoint.x} ${mapPoint.y}) rotate(${yawDegrees})`}
      onPointerDown={onPointerDown}
      onWheel={onWheel}
      onFocus={onFocus}
    >
      {isGrabbed ? (
        <circle
          r={visualRadius + 1.4}
          fill="none"
          stroke={grabHolderColor}
          strokeWidth="0.9"
          opacity={localIsHolder ? 1 : 0.65}
          pointerEvents="none"
        />
      ) : null}
      {selected ? (
        <circle r={visualRadius + 0.8} fill="none" stroke="#f4b63f" strokeWidth="0.7" pointerEvents="none" />
      ) : null}
      <circle r={visualRadius} fill={object.colorTintHex ?? "#4678b4"} stroke="#fffaf0" strokeWidth="0.8" />
      {template.thumbnailUrl ? (
        <image
          href={template.thumbnailUrl}
          x={-visualRadius * 0.85}
          y={-visualRadius * 0.85}
          width={visualRadius * 1.7}
          height={visualRadius * 1.7}
          preserveAspectRatio="xMidYMid slice"
          pointerEvents="none"
        />
      ) : (
        <text y={1.1} textAnchor="middle" fontSize={visualRadius * 1.1} pointerEvents="none">
          {CATEGORY_EMOJI[template.category]}
        </text>
      )}
      <title>
        {object.displayName}
        {isGrabbed && holderDisplayName ? ` · ${holderDisplayName}` : ""}
      </title>
      <text
        y={visualRadius + 3.2}
        textAnchor="middle"
        fontSize="2"
        fill="#17201a"
        transform={`rotate(${-yawDegrees})`}
        pointerEvents="none"
      >
        {object.displayName.length > 14 ? `${object.displayName.slice(0, 14)}…` : object.displayName}
      </text>
    </g>
  );
}
