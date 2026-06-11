"use client";

// One ruled notebook page: typed-text layer (textarea) + ink layer (canvas).
// The page renders at a fixed design size (NOTEBOOK_PAGE) — the whole book is
// scaled with a CSS transform, so normalized pointer math stays exact.

import { useEffect, useRef, useState } from "react";
import type { WhiteboardPoint } from "@3dspace/contracts";
import { drawWhiteboardStroke, strokeHitTest } from "../Whiteboard/renderer";
import { NOTEBOOK_PAGE, type NotebookPage as NotebookPageModel, type NotebookStroke } from "../../lib/useDeskNotebook";

export type NotebookTool = "type" | "pen" | "highlighter" | "eraser";

const MAX_STROKE_POINTS = 128;

type DraftStroke = {
  id: string;
  tool: "pen" | "highlighter";
  color: string;
  thickness: number;
  points: WhiteboardPoint[];
};

function makeStrokeId() {
  return globalThis.crypto?.randomUUID?.() ?? `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): WhiteboardPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height)))
  };
}

function thinPoints(points: WhiteboardPoint[], maxPoints = MAX_STROKE_POINTS): WhiteboardPoint[] {
  if (points.length <= maxPoints) return points;
  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round((index * (points.length - 1)) / (maxPoints - 1));
    return points[sourceIndex]!;
  });
}

export function NotebookPageView({
  page,
  pageNumber,
  tool,
  color,
  thickness,
  interactive,
  onTextChange,
  onCommitStroke,
  onEraseStrokes
}: {
  page: NotebookPageModel;
  /** 1-based page number shown in the corner. */
  pageNumber: number;
  tool: NotebookTool;
  color: string;
  thickness: number;
  /** False while a page is mid-flip or rendered inside the flip sheet. */
  interactive: boolean;
  onTextChange?: (text: string) => void;
  onCommitStroke?: (stroke: NotebookStroke) => void;
  onEraseStrokes?: (strokeIds: string[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draft, setDraft] = useState<DraftStroke | null>(null);
  const draftRef = useRef<DraftStroke | null>(null);
  const erasedIdsRef = useRef<Set<string>>(new Set());

  // Redraw ink whenever strokes or the live draft change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
    const width = NOTEBOOK_PAGE.width;
    const height = NOTEBOOK_PAGE.height;
    if (canvas.width !== Math.round(width * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    for (const stroke of page.strokes) {
      drawWhiteboardStroke(context, stroke, { width, height });
    }
    if (draft) {
      drawWhiteboardStroke(context, draft, { width, height });
    }
  }, [draft, page.strokes]);

  const drawingTool = tool === "pen" || tool === "highlighter";
  const canvasInteractive = interactive && (drawingTool || tool === "eraser");

  function eraseAt(point: WhiteboardPoint) {
    const hits = page.strokes.filter(
      (stroke) => !erasedIdsRef.current.has(stroke.id) && strokeHitTest(stroke, point, 0.03)
    );
    if (hits.length === 0) return;
    for (const stroke of hits) erasedIdsRef.current.add(stroke.id);
    onEraseStrokes?.(hits.map((stroke) => stroke.id));
  }

  return (
    <div className="desk-notebook-page" data-tool={tool}>
      <textarea
        className="desk-notebook-page__text"
        value={page.text}
        spellCheck={false}
        placeholder={interactive && tool === "type" ? "Type your notes…" : undefined}
        readOnly={!interactive || tool !== "type"}
        tabIndex={interactive && tool === "type" ? 0 : -1}
        onChange={(event) => onTextChange?.(event.target.value)}
        onKeyDown={(event) => {
          // Keep notebook typing from leaking into room shortcuts; Escape
          // releases focus so the global keys (N, E…) work again.
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      <canvas
        ref={canvasRef}
        className="desk-notebook-page__ink"
        style={{ pointerEvents: canvasInteractive ? "auto" : "none" }}
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          if (!canvas || !canvasInteractive) return;
          event.preventDefault();
          const point = pointFromEvent(event, canvas);
          if (tool === "eraser") {
            erasedIdsRef.current = new Set();
            eraseAt(point);
          } else if (drawingTool) {
            const nextDraft: DraftStroke = {
              id: makeStrokeId(),
              tool,
              color,
              thickness,
              points: [point]
            };
            draftRef.current = nextDraft;
            setDraft(nextDraft);
          }
          canvas.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const canvas = canvasRef.current;
          if (!canvas || !canvasInteractive) return;
          if (event.buttons === 0) return;
          const point = pointFromEvent(event, canvas);
          if (tool === "eraser") {
            eraseAt(point);
            return;
          }
          const current = draftRef.current;
          if (!current) return;
          const next = { ...current, points: [...current.points, point] };
          draftRef.current = next;
          setDraft(next);
        }}
        onPointerUp={() => {
          if (tool === "eraser") {
            erasedIdsRef.current = new Set();
            return;
          }
          const current = draftRef.current;
          draftRef.current = null;
          setDraft(null);
          if (!current || current.points.length === 0) return;
          const points =
            current.points.length < 2
              ? [current.points[0]!, { ...current.points[0]!, x: Math.min(1, current.points[0]!.x + 0.002) }]
              : thinPoints(current.points);
          onCommitStroke?.({ ...current, points });
        }}
        onPointerCancel={() => {
          draftRef.current = null;
          setDraft(null);
          erasedIdsRef.current = new Set();
        }}
      />
      <span className="desk-notebook-page__number" aria-hidden="true">
        {pageNumber}
      </span>
    </div>
  );
}
