"use client";

// Personal multipage desk notebook — document model + per-room/per-user
// localStorage persistence. Opens when a student sits at a Student Desk
// (see worldAssetCatalog `deskNotebook` flag + DeskNotebook component).

import { useCallback, useEffect, useRef, useState } from "react";
import type { WhiteboardPoint } from "@3dspace/contracts";

export type NotebookInkTool = "pen" | "highlighter";

export type NotebookStroke = {
  id: string;
  tool: NotebookInkTool;
  color: string;
  thickness: number;
  /** Normalized 0–1 page coordinates (same convention as whiteboard strokes). */
  points: WhiteboardPoint[];
};

export type NotebookPage = {
  id: string;
  /** Typed notes (plain text, wrapped by the page). */
  text: string;
  /** Ink drawn on top of the page. */
  strokes: NotebookStroke[];
};

export type NotebookDoc = {
  version: 1;
  pages: NotebookPage[];
  updatedAt: string;
};

/**
 * Fixed design-space layout of a single notebook page, in px at scale 1.
 * Page aspect matches US Letter (8.5 x 11) so the on-screen page and the
 * exported PDF page line up exactly. The whole book is scaled to the
 * viewport with a CSS transform, which keeps normalized pointer math valid.
 */
export const NOTEBOOK_PAGE = {
  width: 360,
  height: 466,
  /** Distance between ruled lines. Matches the text line-height. */
  ruleSpacing: 26,
  /** Top of the typed-text block. */
  textTop: 36,
  /** Y of the first ruled line (text baselines sit just above each rule). */
  ruleTop: 56,
  /** X of the red margin line. */
  marginX: 40,
  /** Typed-text block inset. */
  textLeft: 48,
  textRight: 16,
  fontSize: 15.5,
  fontFamily: "Georgia, 'Times New Roman', serif",
  inkTextColor: "#1f2937",
  paperColor: "#f8f6ef",
  ruleColor: "rgba(70, 110, 180, 0.22)",
  marginColor: "rgba(192, 90, 90, 0.45)"
} as const;

const NOTEBOOK_STORAGE_PREFIX = "3dspace.notebook";
const SAVE_DEBOUNCE_MS = 500;
const INITIAL_PAGE_COUNT = 4;
const MAX_STROKES_PER_PAGE = 400;
const MAX_TEXT_LENGTH = 4000;

export function notebookStorageKey(roomId: string, userId: string, scope?: string): string {
  return scope
    ? `${NOTEBOOK_STORAGE_PREFIX}:${scope}:${roomId}:${userId}`
    : `${NOTEBOOK_STORAGE_PREFIX}:${roomId}:${userId}`;
}

const IMPORT_MAX_BYTES = 200 * 1024;
const IMPORT_MAX_PAGES = 60;
const IMPORT_CHARS_PER_LINE = 52;
const IMPORT_LINES_PER_PAGE = Math.max(
  6,
  Math.floor((NOTEBOOK_PAGE.height - NOTEBOOK_PAGE.ruleTop - 18) / NOTEBOOK_PAGE.ruleSpacing)
);

/** Soft-wrap raw text to ~charsPerLine, then chunk into page-sized strings. */
export function paginateImportedText(
  raw: string,
  charsPerLine = IMPORT_CHARS_PER_LINE,
  linesPerPage = IMPORT_LINES_PER_PAGE,
  maxPages = IMPORT_MAX_PAGES
): string[] {
  const wrapped: string[] = [];
  for (const rawLine of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (rawLine.length === 0) { wrapped.push(""); continue; }
    let current = "";
    for (const word of rawLine.split(" ")) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (current.length > 0 && candidate.length > charsPerLine) {
        wrapped.push(current);
        current = word;
      } else {
        current = candidate;
      }
      while (current.length > charsPerLine) {
        wrapped.push(current.slice(0, charsPerLine));
        current = current.slice(charsPerLine);
      }
    }
    wrapped.push(current);
  }
  const pages: string[] = [];
  for (let i = 0; i < wrapped.length && pages.length < maxPages; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage).join("\n"));
  }
  return pages.length > 0 ? pages : [""];
}

/** Build a fresh doc from paginated text (even page count for spreads). */
export function docFromImportedText(raw: string): NotebookDoc {
  const textPages = paginateImportedText(raw);
  const pages: NotebookPage[] = textPages.map((text) => ({ id: makeId("page"), text, strokes: [] }));
  if (pages.length % 2 !== 0) pages.push(createNotebookPage());
  return { version: 1, pages, updatedAt: new Date().toISOString() };
}

export const IMPORT_MAX_BYTES_EXPORT = IMPORT_MAX_BYTES;

function makeId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createNotebookPage(): NotebookPage {
  return { id: makeId("page"), text: "", strokes: [] };
}

export function createNotebookDoc(pageCount = INITIAL_PAGE_COUNT): NotebookDoc {
  const count = Math.max(2, pageCount + (pageCount % 2));
  return {
    version: 1,
    pages: Array.from({ length: count }, () => createNotebookPage()),
    updatedAt: new Date().toISOString()
  };
}

function sanitizeStroke(value: unknown): NotebookStroke | null {
  if (!value || typeof value !== "object") return null;
  const stroke = value as Partial<NotebookStroke>;
  if (typeof stroke.id !== "string" || stroke.id.length === 0) return null;
  if (stroke.tool !== "pen" && stroke.tool !== "highlighter") return null;
  if (typeof stroke.color !== "string" || !/^#[0-9a-fA-F]{6,8}$/.test(stroke.color)) return null;
  if (typeof stroke.thickness !== "number" || !Number.isFinite(stroke.thickness) || stroke.thickness <= 0) return null;
  if (!Array.isArray(stroke.points) || stroke.points.length === 0) return null;
  const points: WhiteboardPoint[] = [];
  for (const point of stroke.points) {
    if (!point || typeof point !== "object") return null;
    const { x, y } = point as WhiteboardPoint;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  }
  return {
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    thickness: Math.min(64, stroke.thickness),
    points
  };
}

/** Parse a persisted notebook doc; returns null on any malformed input. */
export function parseNotebookDoc(raw: string | null): NotebookDoc | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const doc = data as Partial<NotebookDoc>;
  if (doc.version !== 1 || !Array.isArray(doc.pages) || doc.pages.length === 0) return null;
  const pages: NotebookPage[] = [];
  for (const value of doc.pages) {
    if (!value || typeof value !== "object") return null;
    const page = value as Partial<NotebookPage>;
    if (typeof page.id !== "string" || page.id.length === 0) return null;
    if (typeof page.text !== "string") return null;
    if (!Array.isArray(page.strokes)) return null;
    const strokes: NotebookStroke[] = [];
    for (const strokeValue of page.strokes) {
      const stroke = sanitizeStroke(strokeValue);
      if (stroke) strokes.push(stroke);
    }
    pages.push({ id: page.id, text: page.text.slice(0, MAX_TEXT_LENGTH), strokes });
  }
  // Pages always come in spreads of two.
  if (pages.length % 2 !== 0) pages.push(createNotebookPage());
  return {
    version: 1,
    pages,
    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : new Date().toISOString()
  };
}

export function serializeNotebookDoc(doc: NotebookDoc): string {
  return JSON.stringify(doc);
}

/** True when any page holds typed text or ink. */
export function notebookHasContent(pages: NotebookPage[]): boolean {
  return pages.some((page) => page.text.trim().length > 0 || page.strokes.length > 0);
}

export type UseDeskNotebookReturn = {
  pages: NotebookPage[];
  /** Index of the visible two-page spread (left page = pages[2 * spreadIndex]). */
  spreadIndex: number;
  spreadCount: number;
  setSpreadIndex: (index: number) => void;
  /** Appends a fresh spread (two pages) and returns its spread index. */
  addSpread: () => number;
  setPageText: (pageId: string, text: string) => void;
  commitStroke: (pageId: string, stroke: NotebookStroke) => void;
  eraseStrokes: (pageId: string, strokeIds: string[]) => void;
  /** Replace the entire doc with pages from imported text and persist. */
  importText: (raw: string) => void;
};

export function useDeskNotebook({
  roomId,
  userId,
  scope
}: {
  roomId: string;
  userId: string;
  scope?: string;
}): UseDeskNotebookReturn {
  const storageKey = notebookStorageKey(roomId, userId, scope);
  const [doc, setDoc] = useState<NotebookDoc>(() => {
    if (typeof window === "undefined") return createNotebookDoc();
    return parseNotebookDoc(window.localStorage.getItem(storageKey)) ?? createNotebookDoc();
  });
  const [spreadIndex, setSpreadIndexState] = useState(0);
  const docRef = useRef(doc);
  docRef.current = doc;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  // Reload when the room/user identity changes (a different notebook).
  const loadedKeyRef = useRef(storageKey);
  useEffect(() => {
    if (loadedKeyRef.current === storageKey) return;
    loadedKeyRef.current = storageKey;
    setDoc(parseNotebookDoc(window.localStorage.getItem(storageKey)) ?? createNotebookDoc());
    setSpreadIndexState(0);
  }, [storageKey]);

  const persist = useCallback(() => {
    dirtyRef.current = false;
    try {
      window.localStorage.setItem(storageKey, serializeNotebookDoc(docRef.current));
    } catch {
      // Storage may be full or unavailable — notes stay in memory for the session.
    }
  }, [storageKey]);

  const mutatePages = useCallback(
    (mutate: (pages: NotebookPage[]) => NotebookPage[]) => {
      setDoc((current) => ({ version: 1, pages: mutate(current.pages), updatedAt: new Date().toISOString() }));
      dirtyRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        persist();
      }, SAVE_DEBOUNCE_MS);
    },
    [persist]
  );

  // Flush any pending save on unmount (e.g. the student stands up mid-debounce).
  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (dirtyRef.current) persist();
    },
    [persist]
  );

  const spreadCount = Math.max(1, Math.ceil(doc.pages.length / 2));

  const setSpreadIndex = useCallback(
    (index: number) => {
      const count = Math.max(1, Math.ceil(docRef.current.pages.length / 2));
      setSpreadIndexState(Math.min(count - 1, Math.max(0, index)));
    },
    []
  );

  const addSpread = useCallback(() => {
    const nextSpread = Math.floor(docRef.current.pages.length / 2);
    mutatePages((pages) => [...pages, createNotebookPage(), createNotebookPage()]);
    return nextSpread;
  }, [mutatePages]);

  const setPageText = useCallback(
    (pageId: string, text: string) => {
      mutatePages((pages) =>
        pages.map((page) => (page.id === pageId ? { ...page, text: text.slice(0, MAX_TEXT_LENGTH) } : page))
      );
    },
    [mutatePages]
  );

  const commitStroke = useCallback(
    (pageId: string, stroke: NotebookStroke) => {
      mutatePages((pages) =>
        pages.map((page) =>
          page.id === pageId
            ? { ...page, strokes: [...page.strokes, stroke].slice(-MAX_STROKES_PER_PAGE) }
            : page
        )
      );
    },
    [mutatePages]
  );

  const eraseStrokes = useCallback(
    (pageId: string, strokeIds: string[]) => {
      if (strokeIds.length === 0) return;
      const remove = new Set(strokeIds);
      mutatePages((pages) =>
        pages.map((page) =>
          page.id === pageId ? { ...page, strokes: page.strokes.filter((stroke) => !remove.has(stroke.id)) } : page
        )
      );
    },
    [mutatePages]
  );

  const importText = useCallback(
    (raw: string) => {
      const next = docFromImportedText(raw);
      setDoc(next);
      setSpreadIndexState(0);
      docRef.current = next;
      persist();
    },
    [persist]
  );

  return {
    pages: doc.pages,
    spreadIndex: Math.min(spreadIndex, spreadCount - 1),
    spreadCount,
    setSpreadIndex,
    addSpread,
    setPageText,
    commitStroke,
    eraseStrokes,
    importText
  };
}
