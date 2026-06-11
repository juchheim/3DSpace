// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNotebookDoc,
  notebookHasContent,
  notebookStorageKey,
  parseNotebookDoc,
  serializeNotebookDoc,
  useDeskNotebook,
  type NotebookStroke
} from "../lib/useDeskNotebook";
import { notebookPagesForExport, wrapNotebookTextLines } from "../lib/notebookPdf";
import { hasDeskNotebook } from "../lib/worldAssetCatalog";

function makeStroke(id = "stroke-1"): NotebookStroke {
  return {
    id,
    tool: "pen",
    color: "#111827",
    thickness: 2,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.5 }
    ]
  };
}

describe("worldAssetCatalog desk notebook flag", () => {
  it("marks the student desk and nothing else", () => {
    expect(hasDeskNotebook("school-desk-chair2")).toBe(true);
    expect(hasDeskNotebook("folding-chair")).toBe(false);
    expect(hasDeskNotebook("unknown-slug")).toBe(false);
  });
});

describe("notebook doc model", () => {
  it("creates an even number of blank pages", () => {
    const doc = createNotebookDoc();
    expect(doc.version).toBe(1);
    expect(doc.pages.length % 2).toBe(0);
    expect(doc.pages.length).toBeGreaterThanOrEqual(2);
    expect(notebookHasContent(doc.pages)).toBe(false);
  });

  it("round-trips through serialize/parse", () => {
    const doc = createNotebookDoc(2);
    doc.pages[0]!.text = "Photosynthesis notes";
    doc.pages[1]!.strokes.push(makeStroke());
    const parsed = parseNotebookDoc(serializeNotebookDoc(doc));
    expect(parsed).not.toBeNull();
    expect(parsed!.pages).toHaveLength(2);
    expect(parsed!.pages[0]!.text).toBe("Photosynthesis notes");
    expect(parsed!.pages[1]!.strokes).toHaveLength(1);
    expect(notebookHasContent(parsed!.pages)).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(parseNotebookDoc(null)).toBeNull();
    expect(parseNotebookDoc("not json")).toBeNull();
    expect(parseNotebookDoc("{}")).toBeNull();
    expect(parseNotebookDoc(JSON.stringify({ version: 2, pages: [] }))).toBeNull();
    expect(parseNotebookDoc(JSON.stringify({ version: 1, pages: [{ id: 1, text: "x", strokes: [] }] }))).toBeNull();
  });

  it("drops malformed strokes but keeps the page", () => {
    const raw = JSON.stringify({
      version: 1,
      pages: [
        {
          id: "p1",
          text: "hello",
          strokes: [makeStroke(), { id: "bad", tool: "spray", color: "red", thickness: 2, points: [] }]
        },
        { id: "p2", text: "", strokes: [] }
      ]
    });
    const parsed = parseNotebookDoc(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.pages[0]!.strokes).toHaveLength(1);
    expect(parsed!.pages[0]!.strokes[0]!.id).toBe("stroke-1");
  });

  it("pads an odd page count to a full spread", () => {
    const raw = JSON.stringify({
      version: 1,
      pages: [{ id: "p1", text: "solo", strokes: [] }]
    });
    const parsed = parseNotebookDoc(raw);
    expect(parsed!.pages.length).toBe(2);
  });
});

describe("useDeskNotebook persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("loads a previously saved notebook for the same room+user", () => {
    const key = notebookStorageKey("room-1", "user-1");
    const doc = createNotebookDoc(2);
    doc.pages[0]!.text = "saved earlier";
    window.localStorage.setItem(key, serializeNotebookDoc(doc));

    const { result } = renderHook(() => useDeskNotebook({ roomId: "room-1", userId: "user-1" }));
    expect(result.current.pages[0]!.text).toBe("saved earlier");
  });

  it("debounce-saves edits to localStorage", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDeskNotebook({ roomId: "room-2", userId: "user-2" }));
    const pageId = result.current.pages[0]!.id;

    act(() => {
      result.current.setPageText(pageId, "mitochondria = powerhouse");
    });
    expect(window.localStorage.getItem(notebookStorageKey("room-2", "user-2"))).toBeNull();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    const stored = parseNotebookDoc(window.localStorage.getItem(notebookStorageKey("room-2", "user-2")));
    expect(stored!.pages[0]!.text).toBe("mitochondria = powerhouse");
    vi.useRealTimers();
  });

  it("flushes pending edits on unmount", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useDeskNotebook({ roomId: "room-3", userId: "user-3" }));
    const pageId = result.current.pages[0]!.id;

    act(() => {
      result.current.setPageText(pageId, "stand up mid-debounce");
    });
    unmount();

    const stored = parseNotebookDoc(window.localStorage.getItem(notebookStorageKey("room-3", "user-3")));
    expect(stored!.pages[0]!.text).toBe("stand up mid-debounce");
    vi.useRealTimers();
  });

  it("adds spreads, commits strokes, and erases them", () => {
    const { result } = renderHook(() => useDeskNotebook({ roomId: "room-4", userId: "user-4" }));
    const initialPages = result.current.pages.length;
    const pageId = result.current.pages[0]!.id;

    let newSpread = 0;
    act(() => {
      newSpread = result.current.addSpread();
    });
    expect(result.current.pages.length).toBe(initialPages + 2);
    expect(newSpread).toBe(initialPages / 2);

    act(() => {
      result.current.commitStroke(pageId, makeStroke("ink-1"));
    });
    expect(result.current.pages[0]!.strokes).toHaveLength(1);

    act(() => {
      result.current.eraseStrokes(pageId, ["ink-1"]);
    });
    expect(result.current.pages[0]!.strokes).toHaveLength(0);
  });

  it("clamps spread navigation to valid spreads", () => {
    const { result } = renderHook(() => useDeskNotebook({ roomId: "room-5", userId: "user-5" }));
    act(() => {
      result.current.setSpreadIndex(99);
    });
    expect(result.current.spreadIndex).toBe(result.current.spreadCount - 1);
    act(() => {
      result.current.setSpreadIndex(-4);
    });
    expect(result.current.spreadIndex).toBe(0);
  });
});

describe("notebook PDF helpers", () => {
  it("wraps text by words, honoring explicit newlines", () => {
    const measure = (value: string) => value.length * 10;
    const lines = wrapNotebookTextLines(measure, "alpha beta gamma\n\ndelta", 120);
    expect(lines).toEqual(["alpha beta", "gamma", "", "delta"]);
  });

  it("hard-breaks single words longer than a line", () => {
    const measure = (value: string) => value.length * 10;
    const lines = wrapNotebookTextLines(measure, "abcdefghijkl", 50);
    expect(lines.every((line) => measure(line) <= 50)).toBe(true);
    expect(lines.join("")).toBe("abcdefghijkl");
  });

  it("exports up to the last page with content", () => {
    const doc = createNotebookDoc(6);
    doc.pages[2]!.text = "only page three has notes";
    expect(notebookPagesForExport(doc.pages)).toHaveLength(3);
  });

  it("exports a single blank page when the notebook is empty", () => {
    const doc = createNotebookDoc(4);
    expect(notebookPagesForExport(doc.pages)).toHaveLength(1);
  });
});
