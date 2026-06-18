"use client";
import { useEffect, useState } from "react";

/**
 * Preview/commit range slider used by the in-world LightControlCard. Fires
 * `onPreview` continuously while dragging (optimistic, no DB write) and
 * `onCommit` once on release / blur / keyboard adjustment (the single
 * persisted write).
 */
export function StableRange({
  value,
  min,
  max,
  step,
  className,
  "aria-label": ariaLabel,
  onPreview,
  onCommit
}: {
  value: number;
  min: number | string;
  max: number | string;
  step: number | string;
  className?: string;
  "aria-label"?: string;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) setDraft(value);
  }, [dragging, value]);

  function preview(next: number) {
    setDraft(next);
    onPreview(next);
  }

  function commit(next: number) {
    setDraft(next);
    onCommit(next);
    setDragging(false);
  }

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      className={className}
      value={draft}
      aria-label={ariaLabel}
      onPointerDown={() => setDragging(true)}
      onInput={(e) => preview(Number(e.currentTarget.value))}
      onPointerUp={(e) => commit(Number(e.currentTarget.value))}
      onPointerCancel={(e) => commit(Number(e.currentTarget.value))}
      onBlur={(e) => {
        if (dragging) commit(Number(e.currentTarget.value));
      }}
      onKeyUp={(e) => {
        if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End" || e.key === "PageUp" || e.key === "PageDown") {
          commit(Number(e.currentTarget.value));
        }
      }}
    />
  );
}
