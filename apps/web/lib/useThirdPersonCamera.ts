"use client";

import type { ViewMode } from "@3dspace/contracts";
import { useCallback, useRef } from "react";

const YAW_SENSITIVITY = 0.004;
const PITCH_SENSITIVITY = 0.003;
const MIN_PITCH = -0.55;
const MAX_PITCH = 1.22;
const DRAG_CLICK_THRESHOLD_PX = 5;
const TAP_MAX_DURATION_MS = 200;

function isInteractivePointerTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "button, a, input, select, textarea, label, [role='button'], .wall-object-html, .shared-browser-wall-html, .room-object-html, .wall-anchor-label-html, .avatar-video-card"
    )
  );
}

export function useThirdPersonCamera(input: { viewMode: ViewMode }) {
  const yawRef = useRef(0);
  const pitchRef = useRef(0.32);
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const pointerDownTimeRef = useRef(0);
  const lockedRef = useRef(false);

  const consumeClickSuppress = useCallback(() => {
    const heldTooLong = Date.now() - pointerDownTimeRef.current > TAP_MAX_DURATION_MS;
    if (!suppressClickRef.current && !heldTooLong) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  const bind = useCallback(
    (element: HTMLElement | null) => {
      if (!element || input.viewMode !== "3d") return;
      const target = element;

      function onPointerDown(event: PointerEvent) {
        if (event.button !== 0) return;
        if (isInteractivePointerTarget(event.target)) return;
        draggingRef.current = true;
        suppressClickRef.current = false;
        pointerDownTimeRef.current = Date.now();
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        target.setPointerCapture(event.pointerId);
        target.classList.add("dragging");
      }

      function onPointerMove(event: PointerEvent) {
        if (!draggingRef.current) return;
        const deltaX = event.clientX - lastPointerRef.current.x;
        const deltaY = event.clientY - lastPointerRef.current.y;
        if (Math.hypot(deltaX, deltaY) >= DRAG_CLICK_THRESHOLD_PX) {
          suppressClickRef.current = true;
        }
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        if (!lockedRef.current) {
          yawRef.current -= deltaX * YAW_SENSITIVITY;
          pitchRef.current = Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitchRef.current + deltaY * PITCH_SENSITIVITY));
        }
      }

      function endDrag(event: PointerEvent) {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        target.classList.remove("dragging");
        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
      }

      target.addEventListener("pointerdown", onPointerDown);
      target.addEventListener("pointermove", onPointerMove);
      target.addEventListener("pointerup", endDrag);
      target.addEventListener("pointercancel", endDrag);

      return () => {
        target.removeEventListener("pointerdown", onPointerDown);
        target.removeEventListener("pointermove", onPointerMove);
        target.removeEventListener("pointerup", endDrag);
        target.removeEventListener("pointercancel", endDrag);
        target.classList.remove("dragging");
      };
    },
    [input.viewMode]
  );

  return { yawRef, pitchRef, bind, consumeClickSuppress, lockedRef };
}
