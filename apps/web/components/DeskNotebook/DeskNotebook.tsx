"use client";

// Desk notebook overlay — appears when a student sits at a Student Desk.
// Two-page spread with a 3D page-flip, typed + drawn notes per page, and
// PDF export. Chrome uses the HUD token system so the verse color key
// (applied on .room-shell) themes the cover and accents automatically.

import { useCallback, useEffect, useRef, useState } from "react";
import { isKeyboardOwnedTarget } from "../../lib/isKeyboardOwnedTarget";
import {
  notebookHasContent,
  useDeskNotebook,
  type NotebookPage as NotebookPageModel
} from "../../lib/useDeskNotebook";
import { NotebookPageView, type NotebookTool } from "./NotebookPage";

const NOTEBOOK_HIGHLIGHTER_COLOR = "#facc15";
const NOTEBOOK_HIGHLIGHTER_THICKNESS = 16;
const NOTEBOOK_INK_COLORS = ["#111827", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", NOTEBOOK_HIGHLIGHTER_COLOR] as const;
const NOTEBOOK_INK_WEIGHTS = [2, 4] as const;

function selectNotebookTool(
  next: NotebookTool,
  current: NotebookTool,
  setTool: (tool: NotebookTool) => void,
  setColor: (color: string) => void,
  setThickness: (thickness: number) => void
) {
  if (next === "highlighter") {
    setColor(NOTEBOOK_HIGHLIGHTER_COLOR);
    setThickness(NOTEBOOK_HIGHLIGHTER_THICKNESS);
  } else if (current === "highlighter" && next === "pen") {
    setThickness(NOTEBOOK_INK_WEIGHTS[0]);
  }
  setTool(next);
}

// Design-space footprint of the whole book (pages + spine + chrome) used to
// fit the notebook into the viewport via a CSS transform scale.
const BOOK_DESIGN_WIDTH = 768;
const BOOK_DESIGN_HEIGHT = 540;
const COVER_OPEN_DELAY_MS = 320;

type FlipState = { dir: "next" | "prev"; from: number; to: number } | null;
type CoverStage = "closed" | "opening" | "open";

function IconType() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="3.5" x2="13" y2="3.5" />
      <line x1="8" y1="3.5" x2="8" y2="13" />
      <line x1="5.5" y1="13" x2="10.5" y2="13" />
    </svg>
  );
}
function IconPen() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2L14 5L5 14H2V11L11 2Z" />
      <path d="M8.5 4.5L11.5 7.5" />
    </svg>
  );
}
function IconHighlighter() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2L13 5.5L7 12L4 12V9L9.5 2Z" strokeWidth="2.2" />
      <line x1="2.5" y1="14" x2="8.5" y2="14" strokeWidth="1.5" />
    </svg>
  );
}
function IconEraser() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L7.5 4L13 8.5L8.5 14H4.5L3 10.5Z" />
      <line x1="2.5" y1="14" x2="13.5" y2="14" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="2" x2="8" y2="11" />
      <polyline points="4,8 8,12 12,8" />
      <line x1="2" y1="14" x2="14" y2="14" />
    </svg>
  );
}
function IconAddPages() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2H4V14H12V4.5L9.5 2Z" />
      <path d="M9.5 2V4.5H12" />
      <line x1="8" y1="7" x2="8" y2="11" />
      <line x1="6" y1="9" x2="10" y2="9" />
    </svg>
  );
}
function IconMinimize() {
  return (
    <svg viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="3.5" y1="12" x2="12.5" y2="12" />
    </svg>
  );
}
function IconNotebook() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="2" width="10" height="12" rx="1.2" />
      <line x1="6.5" y1="2" x2="6.5" y2="14" />
      <line x1="8.5" y1="5.5" x2="11.5" y2="5.5" />
      <line x1="8.5" y1="8" x2="11.5" y2="8" />
    </svg>
  );
}

const TOOL_OPTIONS: Array<{ id: NotebookTool; label: string; icon: React.ReactNode }> = [
  { id: "type", label: "Type notes", icon: <IconType /> },
  { id: "pen", label: "Pen", icon: <IconPen /> },
  { id: "highlighter", label: "Highlighter", icon: <IconHighlighter /> },
  { id: "eraser", label: "Eraser", icon: <IconEraser /> }
];

export function DeskNotebook({
  roomId,
  userId,
  roomLabel
}: {
  roomId: string;
  userId: string;
  roomLabel?: string;
}) {
  const notebook = useDeskNotebook({ roomId, userId });
  const [minimized, setMinimized] = useState(false);
  const [coverStage, setCoverStage] = useState<CoverStage>("closed");
  const [tool, setTool] = useState<NotebookTool>("type");
  const [color, setColor] = useState<string>(NOTEBOOK_INK_COLORS[0]);
  const [thickness, setThickness] = useState<number>(NOTEBOOK_INK_WEIGHTS[0]);
  const [flip, setFlip] = useState<FlipState>(null);
  const [exporting, setExporting] = useState(false);
  const [scale, setScale] = useState(1);
  const minimizedRef = useRef(minimized);
  minimizedRef.current = minimized;

  // Book-opening: brief closed beat, then the cover swings open.
  useEffect(() => {
    const timer = setTimeout(() => {
      setCoverStage((stage) => (stage === "closed" ? "opening" : stage));
    }, COVER_OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Fit the book into the lower portion of the viewport without covering the board.
  useEffect(() => {
    function updateScale() {
      const next = Math.min(
        1.2,
        (window.innerWidth * 0.62) / BOOK_DESIGN_WIDTH,
        (window.innerHeight * 0.52) / BOOK_DESIGN_HEIGHT
      );
      setScale(Math.max(0.55, next));
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const startFlip = useCallback(
    (dir: "next" | "prev") => {
      if (flip || coverStage !== "open") return;
      if (dir === "next") {
        const to = notebook.spreadIndex + 1 >= notebook.spreadCount ? notebook.addSpread() : notebook.spreadIndex + 1;
        setFlip({ dir, from: notebook.spreadIndex, to });
      } else {
        if (notebook.spreadIndex === 0) return;
        setFlip({ dir, from: notebook.spreadIndex, to: notebook.spreadIndex - 1 });
      }
    },
    [coverStage, flip, notebook]
  );
  const startFlipRef = useRef(startFlip);
  startFlipRef.current = startFlip;

  // Global keys: N toggles, Escape minimizes, PageUp/PageDown flip.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isKeyboardOwnedTarget(event.target)) return;
      if (event.code === "KeyN" && !event.repeat) {
        event.preventDefault();
        setMinimized((current) => !current);
        return;
      }
      if (minimizedRef.current) return;
      if (event.key === "Escape") {
        setMinimized(true);
        return;
      }
      if (event.code === "PageDown") {
        event.preventDefault();
        startFlipRef.current("next");
      } else if (event.code === "PageUp") {
        event.preventDefault();
        startFlipRef.current("prev");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportNotebookPdf } = await import("../../lib/notebookPdf");
      await exportNotebookPdf({ pages: notebook.pages, title: roomLabel ?? "Notebook" });
    } catch {
      // Export is best-effort; the notes stay safely in the notebook.
    } finally {
      setExporting(false);
    }
  }

  function handleAddSpread() {
    if (flip || coverStage !== "open") return;
    const to = notebook.addSpread();
    setFlip({ dir: "next", from: notebook.spreadIndex, to });
  }

  if (minimized) {
    return (
      <div className="desk-notebook desk-notebook--min">
        <button
          type="button"
          className="desk-notebook__tab"
          onClick={() => setMinimized(false)}
          aria-label="Open notebook"
        >
          <IconNotebook />
          <span>Notebook</span>
          <kbd>N</kbd>
        </button>
      </div>
    );
  }

  const pages = notebook.pages;
  const current = flip ? flip.from : notebook.spreadIndex;

  // Which page goes where, including mid-flip and the cover-opening beat.
  let staticLeft: NotebookPageModel | null = pages[current * 2] ?? null;
  let staticRight: NotebookPageModel | null = pages[current * 2 + 1] ?? null;
  let staticLeftNumber = current * 2 + 1;
  let staticRightNumber = current * 2 + 2;
  let sheetFront: NotebookPageModel | null = null;
  let sheetBack: NotebookPageModel | null = null;
  let sheetFrontNumber = 0;
  let sheetBackNumber = 0;

  if (flip) {
    if (flip.dir === "next") {
      staticLeft = pages[flip.from * 2] ?? null;
      staticRight = pages[flip.to * 2 + 1] ?? null;
      staticLeftNumber = flip.from * 2 + 1;
      staticRightNumber = flip.to * 2 + 2;
      sheetFront = pages[flip.from * 2 + 1] ?? null;
      sheetBack = pages[flip.to * 2] ?? null;
      sheetFrontNumber = flip.from * 2 + 2;
      sheetBackNumber = flip.to * 2 + 1;
    } else {
      staticLeft = pages[flip.to * 2] ?? null;
      staticRight = pages[flip.from * 2 + 1] ?? null;
      staticLeftNumber = flip.to * 2 + 1;
      staticRightNumber = flip.from * 2 + 2;
      sheetFront = pages[flip.from * 2] ?? null;
      sheetBack = pages[flip.to * 2 + 1] ?? null;
      sheetFrontNumber = flip.from * 2 + 1;
      sheetBackNumber = flip.to * 2 + 2;
    }
  } else if (coverStage !== "open") {
    // Closed/opening book: cover sits on the right half, page 1 is its back.
    staticLeft = null;
    sheetBack = pages[0] ?? null;
    sheetBackNumber = 1;
  }

  const interactive = !flip && coverStage === "open";
  const showCoverSheet = coverStage !== "open";
  const hasContent = notebookHasContent(pages);
  const inkColor = tool === "highlighter" ? NOTEBOOK_HIGHLIGHTER_COLOR : color;
  const inkThickness = tool === "highlighter" ? NOTEBOOK_HIGHLIGHTER_THICKNESS : thickness;

  // Capture as consts so the narrowed types survive into the JSX closures.
  const leftPage = staticLeft;
  const rightPage = staticRight;

  return (
    <div className="desk-notebook" style={{ "--nb-scale": scale } as React.CSSProperties}>
      <div
        className="desk-notebook__book"
        role="dialog"
        aria-label="Desk notebook"
        data-cover={coverStage}
      >
        <div className="desk-notebook__toolbar">
          <div className="desk-notebook__tools" role="group" aria-label="Notebook tools">
            {TOOL_OPTIONS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`desk-notebook__tool${tool === entry.id ? " is-active" : ""}`}
                onClick={() => selectNotebookTool(entry.id, tool, setTool, setColor, setThickness)}
                title={entry.label}
                aria-label={entry.label}
              >
                {entry.icon}
              </button>
            ))}
          </div>
          <div className="desk-notebook__sep" aria-hidden="true" />
          <div className="desk-notebook__swatches" role="group" aria-label="Ink color">
            {NOTEBOOK_INK_COLORS.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`desk-notebook__swatch${color === entry ? " is-active" : ""}`}
                style={{ background: entry }}
                onClick={() => {
                  setColor(entry);
                  if (tool === "type" || tool === "eraser") setTool("pen");
                  if (tool === "highlighter" && entry !== NOTEBOOK_HIGHLIGHTER_COLOR) {
                    setTool("pen");
                    setThickness(NOTEBOOK_INK_WEIGHTS[0]);
                  }
                }}
                aria-label={`Select ${entry} ink`}
              />
            ))}
            {tool !== "highlighter"
              ? NOTEBOOK_INK_WEIGHTS.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className={`desk-notebook__weight${thickness === entry ? " is-active" : ""}`}
                    onClick={() => setThickness(entry)}
                    title={`${entry}px ink`}
                    aria-label={`${entry}px ink`}
                  >
                    <span style={{ height: entry, width: 12 }} />
                  </button>
                ))
              : null}
          </div>
          <div className="desk-notebook__spacer" />
          <span className="desk-notebook__pages-label" aria-live="polite">
            {current * 2 + 1}–{current * 2 + 2} / {pages.length}
          </span>
          <button
            type="button"
            className="desk-notebook__action"
            onClick={handleAddSpread}
            disabled={!interactive}
            title="Add pages"
            aria-label="Add pages"
          >
            <IconAddPages />
          </button>
          <button
            type="button"
            className="desk-notebook__action"
            onClick={() => void handleExport()}
            disabled={exporting || !hasContent}
            title={hasContent ? "Export notes as PDF" : "Write something first to export"}
            aria-label="Export notes as PDF"
          >
            {exporting ? <span className="desk-notebook__busy" aria-hidden="true" /> : <IconDownload />}
          </button>
          <button
            type="button"
            className="desk-notebook__action"
            onClick={() => setMinimized(true)}
            title="Minimize notebook (N)"
            aria-label="Minimize notebook"
          >
            <IconMinimize />
          </button>
        </div>

        <div className="desk-notebook__spread">
          <div className="desk-notebook__stack desk-notebook__stack--left" aria-hidden="true" />
          <div className="desk-notebook__stack desk-notebook__stack--right" aria-hidden="true" />

          <div className="desk-notebook__page-slot desk-notebook__page-slot--left">
            {leftPage ? (
              <NotebookPageView
                page={leftPage}
                pageNumber={staticLeftNumber}
                tool={tool}
                color={inkColor}
                thickness={inkThickness}
                interactive={interactive}
                onTextChange={(text) => notebook.setPageText(leftPage.id, text)}
                onCommitStroke={(stroke) => notebook.commitStroke(leftPage.id, stroke)}
                onEraseStrokes={(ids) => notebook.eraseStrokes(leftPage.id, ids)}
              />
            ) : null}
          </div>
          <div className="desk-notebook__page-slot desk-notebook__page-slot--right">
            {rightPage ? (
              <NotebookPageView
                page={rightPage}
                pageNumber={staticRightNumber}
                tool={tool}
                color={inkColor}
                thickness={inkThickness}
                interactive={interactive}
                onTextChange={(text) => notebook.setPageText(rightPage.id, text)}
                onCommitStroke={(stroke) => notebook.commitStroke(rightPage.id, stroke)}
                onEraseStrokes={(ids) => notebook.eraseStrokes(rightPage.id, ids)}
              />
            ) : null}
          </div>

          <div className="desk-notebook__spine" aria-hidden="true" />

          {flip ? (
            <div
              className={`desk-notebook__sheet desk-notebook__sheet--${flip.dir}`}
              onAnimationEnd={(event) => {
                if (!event.animationName.startsWith("desk-notebook-flip")) return;
                notebook.setSpreadIndex(flip.to);
                setFlip(null);
              }}
            >
              <div className="desk-notebook__face desk-notebook__face--front">
                {sheetFront ? (
                  <NotebookPageView
                    page={sheetFront}
                    pageNumber={sheetFrontNumber}
                    tool={tool}
                    color={inkColor}
                    thickness={inkThickness}
                    interactive={false}
                  />
                ) : null}
              </div>
              <div className="desk-notebook__face desk-notebook__face--back">
                {sheetBack ? (
                  <NotebookPageView
                    page={sheetBack}
                    pageNumber={sheetBackNumber}
                    tool={tool}
                    color={inkColor}
                    thickness={inkThickness}
                    interactive={false}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {showCoverSheet ? (
            <div
              className={`desk-notebook__sheet desk-notebook__sheet--cover${coverStage === "opening" ? " is-opening" : ""}`}
              onAnimationEnd={(event) => {
                if (event.animationName !== "desk-notebook-cover-open") return;
                setCoverStage("open");
              }}
            >
              <div className="desk-notebook__face desk-notebook__face--front">
                <div className="desk-notebook__cover">
                  <span className="desk-notebook__cover-rings" aria-hidden="true" />
                  <strong>Notebook</strong>
                  {roomLabel ? <em>{roomLabel}</em> : null}
                </div>
              </div>
              <div className="desk-notebook__face desk-notebook__face--back">
                {sheetBack ? (
                  <NotebookPageView
                    page={sheetBack}
                    pageNumber={sheetBackNumber}
                    tool={tool}
                    color={inkColor}
                    thickness={inkThickness}
                    interactive={false}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {interactive && current > 0 ? (
            <button
              type="button"
              className="desk-notebook__corner desk-notebook__corner--prev"
              onClick={() => startFlip("prev")}
              title="Previous pages (PageUp)"
              aria-label="Previous pages"
            />
          ) : null}
          {interactive ? (
            <button
              type="button"
              className="desk-notebook__corner desk-notebook__corner--next"
              onClick={() => startFlip("next")}
              title="Next pages (PageDown)"
              aria-label="Next pages"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
