import type { WhiteboardPoint, WhiteboardStroke } from "@3dspace/contracts";
import { describe, expect, it } from "vitest";
import {
  drawWhiteboardStroke,
  renderWhiteboardScene,
  strokeBounds,
  strokeHitTest
} from "../components/Whiteboard/renderer";

function makeStroke(
  overrides: Partial<WhiteboardStroke> & Pick<WhiteboardStroke, "tool" | "points">
): WhiteboardStroke {
  return {
    id: "stroke-1",
    roomId: "room-1",
    wallObjectId: "wb-1",
    authorUserId: "user-1",
    color: "#111827",
    thickness: 2,
    z: 0,
    clearVersion: 0,
    createdAt: "2026-05-28T00:00:00.000Z",
    ...overrides
  };
}

function createMockContext() {
  const calls: string[] = [];
  const context = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    stroke: () => calls.push("stroke"),
    strokeRect: () => calls.push("strokeRect"),
    ellipse: () => calls.push("ellipse"),
    fillText: () => calls.push("fillText"),
    clearRect: () => calls.push("clearRect"),
    fillRect: () => calls.push("fillRect"),
    setLineDash: () => calls.push("setLineDash"),
    strokeStyle: "",
    fillStyle: "",
    lineCap: "",
    lineJoin: "",
    lineWidth: 0,
    globalAlpha: 1,
    font: "",
    textBaseline: ""
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls };
}

describe("whiteboard renderer", () => {
  const point = (x: number, y: number): WhiteboardPoint => ({ x, y });

  it.each(["rectangle", "ellipse", "arrow", "line"] as const)(
    "draws %s strokes with a single point without throwing",
    (tool) => {
      const { context, calls } = createMockContext();
      expect(() =>
        drawWhiteboardStroke(context, makeStroke({ tool, points: [point(0.2, 0.3)] }), {
          width: 640,
          height: 360
        })
      ).not.toThrow();
      expect(calls).not.toContain("strokeRect");
      expect(calls).not.toContain("ellipse");
      expect(calls).not.toContain("stroke");
    }
  );

  it("draws two-point shape strokes once both anchors exist", () => {
    const { context, calls } = createMockContext();
    drawWhiteboardStroke(
      context,
      makeStroke({
        tool: "rectangle",
        points: [point(0.1, 0.2), point(0.5, 0.6)]
      }),
      { width: 640, height: 360 }
    );
    expect(calls).toContain("strokeRect");
  });

  it("renders in-progress shape previews without throwing", () => {
    const { context } = createMockContext();
    expect(() =>
      renderWhiteboardScene({
        context,
        width: 640,
        height: 360,
        strokes: [
          makeStroke({ tool: "rectangle", points: [point(0.2, 0.3)] }),
          makeStroke({ tool: "ellipse", points: [point(0.4, 0.5)] }),
          makeStroke({ tool: "arrow", points: [point(0.6, 0.7)] })
        ]
      })
    ).not.toThrow();
  });

  it("returns zero bounds for strokes with no valid points", () => {
    expect(strokeBounds(makeStroke({ tool: "pen", points: [] }))).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0
    });
  });

  it("ignores invalid points when computing bounds and hit tests", () => {
    const invalidOnly = makeStroke({
      tool: "rectangle",
      points: [{ x: Number.NaN, y: 0.2 } as WhiteboardPoint]
    });
    expect(strokeBounds(invalidOnly)).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(strokeHitTest(invalidOnly, point(0.4, 0.5))).toBe(false);

    const mixed = makeStroke({
      tool: "rectangle",
      points: [{ x: Number.NaN, y: 0.2 } as WhiteboardPoint, point(0.4, 0.5)]
    });
    expect(strokeBounds(mixed)).toEqual({ minX: 0.4, minY: 0.5, maxX: 0.4, maxY: 0.5 });
  });
});
