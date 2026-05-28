import type { WhiteboardPoint, WhiteboardStroke } from "@3dspace/contracts";

export const WHITEBOARD_PRESET_COLORS = [
  "#111827",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ffffff"
] as const;

export const WHITEBOARD_THICKNESSES = [1, 2, 4, 8] as const;

function applyStrokeStyle(context: CanvasRenderingContext2D, stroke: WhiteboardStroke) {
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.tool === "highlighter" ? stroke.thickness * 2 : stroke.thickness;
  context.globalAlpha = stroke.tool === "highlighter" ? 0.5 : 1;
}

function toCanvasPoint(point: WhiteboardPoint, width: number, height: number) {
  return { x: point.x * width, y: point.y * height };
}

export function strokeBounds(stroke: WhiteboardStroke) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (stroke.tool === "text") {
    maxX = Math.min(1, maxX + 0.2);
    maxY = Math.min(1, maxY + 0.08);
  }
  return { minX, minY, maxX, maxY };
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  context.moveTo(to.x, to.y);
  context.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  context.stroke();
}

export function drawWhiteboardStroke(
  context: CanvasRenderingContext2D,
  stroke: WhiteboardStroke,
  size: { width: number; height: number }
) {
  if (stroke.points.length === 0) return;
  const points = stroke.points.map((point) => toCanvasPoint(point, size.width, size.height));
  context.save();
  applyStrokeStyle(context, stroke);

  if (stroke.tool === "text") {
    const anchor = points[0]!;
    context.font = `${stroke.text?.fontSize ?? 20}px ui-sans-serif, system-ui, sans-serif`;
    context.textBaseline = "top";
    context.fillText(stroke.text?.value ?? "", anchor.x, anchor.y);
    context.restore();
    return;
  }

  if (stroke.tool === "rectangle") {
    const a = points[0]!;
    const b = points[1]!;
    context.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    context.restore();
    return;
  }

  if (stroke.tool === "ellipse") {
    const a = points[0]!;
    const b = points[1]!;
    context.beginPath();
    context.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2
    );
    context.stroke();
    context.restore();
    return;
  }

  if (stroke.tool === "line" || stroke.tool === "arrow") {
    const a = points[0]!;
    const b = points[1]!;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
    if (stroke.tool === "arrow") {
      drawArrowHead(context, a, b, Math.max(8, stroke.thickness * 2.8));
    }
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index]!.x, points[index]!.y);
  }
  context.stroke();
  context.restore();
}

export function renderWhiteboardScene(input: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  strokes: WhiteboardStroke[];
  selectedStrokeId?: string | null;
}) {
  const { context, width, height, strokes, selectedStrokeId } = input;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f8f6ef";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(17,24,39,0.08)";
  context.lineWidth = 1;
  for (let x = 24; x < width; x += 24) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 24; y < height; y += 24) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  for (const stroke of strokes) {
    drawWhiteboardStroke(context, stroke, { width, height });
    if (stroke.id === selectedStrokeId) {
      const bounds = strokeBounds(stroke);
      context.save();
      context.strokeStyle = "#2563eb";
      context.lineWidth = 2;
      context.setLineDash([6, 4]);
      context.strokeRect(
        bounds.minX * width - 6,
        bounds.minY * height - 6,
        Math.max(12, (bounds.maxX - bounds.minX) * width + 12),
        Math.max(12, (bounds.maxY - bounds.minY) * height + 12)
      );
      context.restore();
    }
  }
}

export function strokeHitTest(stroke: WhiteboardStroke, point: WhiteboardPoint, tolerance = 0.025) {
  const bounds = strokeBounds(stroke);
  return (
    point.x >= bounds.minX - tolerance &&
    point.x <= bounds.maxX + tolerance &&
    point.y >= bounds.minY - tolerance &&
    point.y <= bounds.maxY + tolerance
  );
}

export function translateStroke(stroke: WhiteboardStroke, dx: number, dy: number): WhiteboardStroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      ...point,
      x: Math.min(1, Math.max(0, point.x + dx)),
      y: Math.min(1, Math.max(0, point.y + dy))
    }))
  };
}

export async function exportWhiteboardPng(input: {
  strokes: WhiteboardStroke[];
  width: number;
  height: number;
  multiplier?: number;
}) {
  const canvas = document.createElement("canvas");
  const multiplier = Math.max(1, Math.min(4, input.multiplier ?? 2));
  canvas.width = Math.max(1, Math.round(input.width * multiplier));
  canvas.height = Math.max(1, Math.round(input.height * multiplier));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is unavailable");
  context.scale(multiplier, multiplier);
  renderWhiteboardScene({
    context,
    width: input.width,
    height: input.height,
    strokes: input.strokes
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Unable to render whiteboard export");
  return blob;
}
