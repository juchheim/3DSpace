"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { WallObject, WhiteboardPoint, WhiteboardStroke } from "@3dspace/contracts";
import type { WhiteboardBoardState, WhiteboardController } from "../../lib/useWhiteboards";
import {
  exportWhiteboardPng,
  renderWhiteboardScene,
  strokeHitTest,
  translateStroke,
  WHITEBOARD_PRESET_COLORS,
  WHITEBOARD_THICKNESSES
} from "./renderer";

type Tool = "select" | WhiteboardStroke["tool"];

const TOOL_OPTIONS: Array<{ id: Tool; label: string; token: string }> = [
  { id: "select", label: "Select", token: "S" },
  { id: "pen", label: "Pen", token: "P" },
  { id: "highlighter", label: "Highlighter", token: "H" },
  { id: "eraser", label: "Eraser", token: "E" },
  { id: "line", label: "Line", token: "/" },
  { id: "rectangle", label: "Rectangle", token: "[]" },
  { id: "ellipse", label: "Ellipse", token: "O" },
  { id: "arrow", label: "Arrow", token: "->" },
  { id: "text", label: "Text", token: "T" }
];

const MAX_COMMIT_POINTS = 50;

type DraftStrokeState = {
  id: string;
  tool: WhiteboardStroke["tool"];
  color: string;
  thickness: number;
  start: WhiteboardPoint;
  points: WhiteboardPoint[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "whiteboard";
}

function makePreviewStroke(input: {
  object: WallObject;
  currentUserId: string;
  clearVersion: number;
  draft: DraftStrokeState;
}): WhiteboardStroke {
  return {
    id: input.draft.id,
    roomId: input.object.roomId,
    wallObjectId: input.object.id,
    authorUserId: input.currentUserId,
    tool: input.draft.tool,
    color: input.draft.color,
    thickness: input.draft.thickness,
    points: input.draft.points,
    z: Number.MAX_SAFE_INTEGER,
    clearVersion: input.clearVersion,
    createdAt: new Date().toISOString()
  };
}

function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): WhiteboardPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  };
}

function sanitizePoint(point: WhiteboardPoint): WhiteboardPoint {
  return {
    x: Number.isFinite(point.x) ? Math.min(1, Math.max(0, point.x)) : 0,
    y: Number.isFinite(point.y) ? Math.min(1, Math.max(0, point.y)) : 0,
    ...(point.pressure !== undefined && Number.isFinite(point.pressure)
      ? { pressure: Math.min(1, Math.max(0, point.pressure)) }
      : {})
  };
}

function nudgePoint(point: WhiteboardPoint): WhiteboardPoint {
  return {
    ...point,
    x: point.x < 0.999 ? point.x + 0.001 : point.x - 0.001
  };
}

function thinPoints(points: WhiteboardPoint[], maxPoints = MAX_COMMIT_POINTS) {
  const sanitized = points.map(sanitizePoint);
  if (sanitized.length <= maxPoints) return sanitized;
  if (maxPoints <= 1) return [sanitized[0]!];
  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round((index * (sanitized.length - 1)) / (maxPoints - 1));
    return sanitized[sourceIndex]!;
  });
}

export function WhiteboardSurface({
  object,
  board,
  controller,
  currentUserId,
  participantNames = {},
  canManage,
  canWrite,
  interactive,
  showToolbar = true
}: {
  object: WallObject;
  board: WhiteboardBoardState;
  controller: WhiteboardController;
  currentUserId: string;
  participantNames?: Record<string, string>;
  canManage: boolean;
  canWrite: boolean;
  interactive: boolean;
  showToolbar?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>("#111827");
  const [thickness, setThickness] = useState<number>(2);
  const [draft, setDraft] = useState<DraftStrokeState | null>(null);
  const draftRef = useRef<DraftStrokeState | null>(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [dragOrigin, setDragOrigin] = useState<{ stroke: WhiteboardStroke; point: WhiteboardPoint } | null>(null);
  const dragOriginRef = useRef<{ stroke: WhiteboardStroke; point: WhiteboardPoint } | null>(null);
  const [textDraft, setTextDraft] = useState<{ point: WhiteboardPoint; value: string; fontSize: number } | null>(null);
  const [undoStack, setUndoStack] = useState<WhiteboardStroke[]>([]);
  const [redoStack, setRedoStack] = useState<WhiteboardStroke[]>([]);
  const [surfaceSize, setSurfaceSize] = useState({ width: 640, height: 360 });

  const selectedStroke = useMemo(
    () => board.strokes.find((stroke) => stroke.id === selectedStrokeId) ?? null,
    [board.strokes, selectedStrokeId]
  );

  const previewStrokes = useMemo(() => {
    const remote = Object.values(board.inProgressRemote).map<WhiteboardStroke>((stroke, index) => ({
      id: stroke.strokeId,
      roomId: object.roomId,
      wallObjectId: object.id,
      authorUserId: stroke.authorUserId,
      tool: stroke.tool,
      color: stroke.color,
      thickness: stroke.thickness,
      points: stroke.points,
      ...(stroke.text ? { text: stroke.text } : {}),
      z: Number.MAX_SAFE_INTEGER - 100 + index,
      clearVersion: board.clearVersion,
      createdAt: new Date(stroke.updatedAt).toISOString()
    }));
    const local = draft ? [makePreviewStroke({ object, currentUserId, clearVersion: board.clearVersion, draft })] : [];
    return [...remote, ...local];
  }, [board.clearVersion, board.inProgressRemote, currentUserId, draft, object]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSurfaceSize({
        width: Math.max(240, Math.round(entry.contentRect.width)),
        height: Math.max(160, Math.round(entry.contentRect.height))
      });
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    dragOriginRef.current = dragOrigin;
  }, [dragOrigin]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(surfaceSize.width * ratio);
    canvas.height = Math.round(surfaceSize.height * ratio);
    canvas.style.width = `${surfaceSize.width}px`;
    canvas.style.height = `${surfaceSize.height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    renderWhiteboardScene({
      context,
      width: surfaceSize.width,
      height: surfaceSize.height,
      strokes: [...board.strokes, ...previewStrokes],
      selectedStrokeId
    });
  }, [board.strokes, previewStrokes, selectedStrokeId, surfaceSize.height, surfaceSize.width]);

  useEffect(() => {
    if (!interactive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if ((event.key === "Backspace" || event.key === "Delete") && selectedStrokeId && canWrite) {
        event.preventDefault();
        void controller.eraseStrokes(object.id, [selectedStrokeId]);
        setSelectedStrokeId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canWrite, controller, interactive, object.id, selectedStrokeId]);

  async function commitDraftStroke(nextDraft: DraftStrokeState) {
    const nextPoints =
      nextDraft.tool === "line" ||
      nextDraft.tool === "rectangle" ||
      nextDraft.tool === "ellipse" ||
      nextDraft.tool === "arrow"
        ? [sanitizePoint(nextDraft.start), sanitizePoint(nextDraft.points.at(-1) ?? nextDraft.start)]
        : thinPoints(nextDraft.points);
    const commitPoints =
      (nextDraft.tool === "pen" || nextDraft.tool === "highlighter") && nextPoints.length < 2
        ? [sanitizePoint(nextDraft.start), nudgePoint(sanitizePoint(nextDraft.start))]
        : nextPoints;
    const stroke = await controller.commitStroke(object.id, {
      id: nextDraft.id,
      tool: nextDraft.tool,
      color: nextDraft.color,
      thickness: nextDraft.thickness,
      points: commitPoints,
      clearVersion: board.clearVersion
    });
    setUndoStack((current) => [...current, stroke]);
    setRedoStack([]);
    return stroke;
  }

  function beginDraft(nextTool: WhiteboardStroke["tool"], point: WhiteboardPoint) {
    const strokeId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const nextDraft: DraftStrokeState = {
      id: strokeId,
      tool: nextTool,
      color,
      thickness,
      start: point,
      points: [point]
    };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    return nextDraft;
  }

  const whiteboardUiStyle = useMemo<CSSProperties>(() => {
    const controlSize = Math.max(20, Math.min(26, surfaceSize.width / 30));
    const fontSize = Math.max(9, Math.min(11, controlSize * 0.45));
    const gap = Math.max(3, Math.min(5, surfaceSize.width / 180));
    const swatchSize = Math.max(12, Math.min(16, controlSize * 0.62));
    return {
      "--whiteboard-ui-font-size": `${fontSize}px`,
      "--whiteboard-ui-gap": `${gap}px`,
      "--whiteboard-ui-control-size": `${controlSize}px`,
      "--whiteboard-ui-swatch-size": `${swatchSize}px`
    } as CSSProperties;
  }, [surfaceSize.width]);

  async function handleExport() {
    const blob = await exportWhiteboardPng({
      strokes: board.strokes,
      width: surfaceSize.width,
      height: surfaceSize.height,
      multiplier: 2
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `whiteboard-${slugify(object.title)}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleUndo() {
    const stroke = undoStack.at(-1);
    if (!stroke) return;
    try {
      await controller.eraseStrokes(object.id, [stroke.id]);
      setUndoStack((current) => current.slice(0, -1));
      setRedoStack((current) => [...current, stroke]);
    } catch {
      return;
    }
  }

  async function handleRedo() {
    const stroke = redoStack.at(-1);
    if (!stroke) return;
    try {
      const recommitted = await controller.commitStroke(object.id, {
        id: stroke.id,
        tool: stroke.tool,
        color: stroke.color,
        thickness: stroke.thickness,
        points: stroke.points,
        ...(stroke.text ? { text: stroke.text } : {}),
        clearVersion: board.clearVersion
      });
      setRedoStack((current) => current.slice(0, -1));
      setUndoStack((current) => [...current, recommitted]);
    } catch {
      return;
    }
  }

  return (
    <div
      ref={rootRef}
      className={`whiteboard-surface${interactive ? " whiteboard-surface--interactive" : ""}`}
      data-read-only={!canWrite}
      style={whiteboardUiStyle}
    >
      {showToolbar ? (
        <div className="whiteboard-toolbar">
          <div className="whiteboard-toolbar__group whiteboard-toolbar__group--tools" role="group" aria-label="Whiteboard tools">
            {TOOL_OPTIONS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`whiteboard-toolbar__tool${tool === entry.id ? " is-active" : ""}`}
                disabled={!interactive || (!canWrite && entry.id !== "select")}
                onClick={() => setTool(entry.id)}
                title={entry.label}
                aria-label={entry.label}
              >
                {entry.token}
              </button>
            ))}
          </div>
          <div className="whiteboard-toolbar__group whiteboard-toolbar__swatches" role="group" aria-label="Ink color">
            {WHITEBOARD_PRESET_COLORS.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`whiteboard-toolbar__swatch${color === entry ? " is-active" : ""}`}
                style={{ background: entry }}
                disabled={!interactive || !canWrite}
                onClick={() => setColor(entry)}
                aria-label={`Select ${entry} ink`}
              />
            ))}
          </div>
          <div className="whiteboard-toolbar__group whiteboard-toolbar__weights" role="group" aria-label="Stroke weight">
            {WHITEBOARD_THICKNESSES.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`whiteboard-toolbar__weight${thickness === entry ? " is-active" : ""}`}
                disabled={!interactive || !canWrite}
                onClick={() => setThickness(entry)}
                title={`${entry}px`}
                aria-label={`${entry}px stroke`}
              >
                {entry}
              </button>
            ))}
          </div>
          <div className="whiteboard-toolbar__group whiteboard-toolbar__actions" role="group" aria-label="Whiteboard actions">
            <button
              type="button"
              className="whiteboard-toolbar__action"
              disabled={!interactive || undoStack.length === 0 || !canWrite}
              onClick={() => void handleUndo()}
              title="Undo"
              aria-label="Undo"
            >
              U
            </button>
            <button
              type="button"
              className="whiteboard-toolbar__action"
              disabled={!interactive || redoStack.length === 0 || !canWrite}
              onClick={() => void handleRedo()}
              title="Redo"
              aria-label="Redo"
            >
              R
            </button>
            <button type="button" className="whiteboard-toolbar__action" onClick={() => void handleExport()} title="Export PNG" aria-label="Export PNG">
              DL
            </button>
            <button
              type="button"
              className="whiteboard-toolbar__action"
              disabled={!interactive || !canManage}
              onClick={() => {
                if (!canManage) return;
                if (!window.confirm("Clear this whiteboard for everyone?")) return;
                void controller.clear(object.id);
                setUndoStack([]);
                setRedoStack([]);
              }}
              title="Clear"
              aria-label="Clear whiteboard"
            >
              X
            </button>
          </div>
          {!canWrite ? <span className="whiteboard-toolbar__status">Read-only</span> : null}
        </div>
      ) : null}
      <div className="whiteboard-surface__canvas-wrap">
        <canvas
          ref={canvasRef}
          className="whiteboard-surface__canvas"
          onPointerDown={(event) => {
            const canvas = canvasRef.current;
            if (!canvas || !interactive || !canWrite) return;
            const point = pointFromEvent(event, canvas);
            controller.publishCursor(object.id, {
              type: "room.whiteboard.cursor.v1",
              wallObjectId: object.id,
              authorUserId: currentUserId,
              x: point.x,
              y: point.y,
              visible: true,
              sentAt: Date.now(),
              senderId: currentUserId
            });

            if (tool === "text") {
              setTextDraft({ point, value: "", fontSize: 20 });
              return;
            }

            if (tool === "select") {
              const selected = [...board.strokes].reverse().find((stroke) => strokeHitTest(stroke, point)) ?? null;
              setSelectedStrokeId(selected?.id ?? null);
              if (selected) {
                const nextDragOrigin = { stroke: selected, point };
                dragOriginRef.current = nextDragOrigin;
                setDragOrigin(nextDragOrigin);
              }
              return;
            }

            const nextDraft = beginDraft(tool, point);
            controller.publishStrokeDelta(object.id, {
              type: "room.whiteboard.stroke-delta.v1",
              wallObjectId: object.id,
              strokeId: nextDraft.id,
              authorUserId: currentUserId,
              tool: nextDraft.tool,
              color: nextDraft.color,
              thickness: nextDraft.thickness,
              deltaPoints: [point],
              sentAt: Date.now(),
              senderId: currentUserId
            });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const point = pointFromEvent(event, canvas);
            controller.publishCursor(object.id, {
              type: "room.whiteboard.cursor.v1",
              wallObjectId: object.id,
              authorUserId: currentUserId,
              x: point.x,
              y: point.y,
              visible: true,
              sentAt: Date.now(),
              senderId: currentUserId
            });
            if (!interactive || !canWrite) return;
            if (dragOriginRef.current) return;
            const current = draftRef.current;
            if (!current) return;
            if (current.tool === "pen" || current.tool === "highlighter" || current.tool === "eraser") {
              const next = { ...current, points: [...current.points, point] };
              draftRef.current = next;
              setDraft(next);
              controller.publishStrokeDelta(object.id, {
                type: "room.whiteboard.stroke-delta.v1",
                wallObjectId: object.id,
                strokeId: next.id,
                authorUserId: currentUserId,
                tool: next.tool,
                color: next.color,
                thickness: next.thickness,
                deltaPoints: [point],
                sentAt: Date.now(),
                senderId: currentUserId
              });
              return;
            }
            const next = { ...current, points: [current.start, point] };
            draftRef.current = next;
            setDraft(next);
          }}
          onPointerUp={(event) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const point = pointFromEvent(event, canvas);
            controller.publishCursor(object.id, {
              type: "room.whiteboard.cursor.v1",
              wallObjectId: object.id,
              authorUserId: currentUserId,
              x: point.x,
              y: point.y,
              visible: false,
              sentAt: Date.now(),
              senderId: currentUserId
            });
            if (!interactive || !canWrite) return;
            const activeDragOrigin = dragOriginRef.current;
            if (activeDragOrigin) {
              const dx = point.x - activeDragOrigin.point.x;
              const dy = point.y - activeDragOrigin.point.y;
              if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
                const moved = translateStroke(activeDragOrigin.stroke, dx, dy);
                void (async () => {
                  try {
                    await controller.eraseStrokes(object.id, [activeDragOrigin.stroke.id]);
                    const recommitted = await controller.commitStroke(object.id, {
                      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
                      tool: moved.tool,
                      color: moved.color,
                      thickness: moved.thickness,
                      points: moved.points,
                      ...(moved.text ? { text: moved.text } : {}),
                      clearVersion: board.clearVersion
                    });
                    setSelectedStrokeId(recommitted.id);
                  } catch {
                    return;
                  }
                })();
              }
              dragOriginRef.current = null;
              setDragOrigin(null);
              return;
            }
            const activeDraft = draftRef.current;
            if (!activeDraft) return;
            const currentDraft = activeDraft.tool === "pen" || activeDraft.tool === "highlighter" || activeDraft.tool === "eraser"
              ? activeDraft
              : { ...activeDraft, points: [activeDraft.start, point] };
            draftRef.current = null;
            setDraft(null);

            if (currentDraft.tool === "eraser") {
              const hits = board.strokes.filter((stroke) =>
                currentDraft.points.some((draftPoint) => strokeHitTest(stroke, draftPoint, 0.03))
              );
              if (hits.length > 0) {
                void controller.eraseStrokes(object.id, hits.map((stroke) => stroke.id));
              }
              return;
            }

            if ((currentDraft.tool === "pen" || currentDraft.tool === "highlighter") && currentDraft.points.length < 2) {
              return;
            }
            void commitDraftStroke(currentDraft).catch(() => undefined);
          }}
        />
        {textDraft ? (
          <textarea
            className="whiteboard-surface__text-input"
            autoFocus
            style={{ left: `${textDraft.point.x * 100}%`, top: `${textDraft.point.y * 100}%` }}
            value={textDraft.value}
            onChange={(event) => setTextDraft((current) => (current ? { ...current, value: event.target.value } : current))}
            onBlur={() => {
              const current = textDraft;
              setTextDraft(null);
              if (!current?.value.trim()) return;
              void controller.commitStroke(object.id, {
                id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
                tool: "text",
                color,
                thickness,
                points: [current.point],
                text: {
                  value: current.value.trim(),
                  fontSize: current.fontSize
                },
                clearVersion: board.clearVersion
              }).then((stroke) => {
                setUndoStack((stack) => [...stack, stroke]);
                setRedoStack([]);
              }).catch(() => undefined);
            }}
          />
        ) : null}
        <div className="whiteboard-cursors">
          {Object.values(board.remoteCursors)
            .filter((cursor) => cursor.visible)
            .map((cursor) => (
              <div
                key={cursor.authorUserId}
                className="whiteboard-cursor"
                style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
              >
                <span className="whiteboard-cursor__dot" />
                <span className="whiteboard-cursor__label">
                  {participantNames[cursor.authorUserId] ?? cursor.authorUserId}
                </span>
              </div>
            ))}
        </div>
        {board.loading ? <div className="whiteboard-surface__overlay">Loading whiteboard…</div> : null}
        {board.error ? <div className="whiteboard-surface__overlay whiteboard-surface__overlay--error">{board.error}</div> : null}
      </div>
    </div>
  );
}
