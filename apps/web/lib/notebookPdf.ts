"use client";

// Desk notebook → PDF export. Each notebook page is rasterized onto an
// offscreen canvas (paper, ruled lines, typed text, ink strokes) at the same
// US-Letter aspect as the on-screen page, then added to a jsPDF document.
// jspdf is imported dynamically so it stays out of the main room bundle.

import { drawWhiteboardStroke } from "../components/Whiteboard/renderer";
import { NOTEBOOK_PAGE, type NotebookPage } from "./useDeskNotebook";

const PDF_PAGE_WIDTH_PT = 612; // US Letter portrait
const PDF_PAGE_HEIGHT_PT = 792;
const RENDER_WIDTH_PX = 1275; // 150 dpi
const RENDER_HEIGHT_PX = 1650;

/**
 * Word-wraps text into lines that fit `maxWidth`, honoring explicit newlines.
 * `measure` returns the rendered width of a string (injected for testability).
 */
export function wrapNotebookTextLines(
  measure: (value: string) => number,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of rawLine.split(" ")) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (current.length > 0 && measure(candidate) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
      // A single word longer than the line: hard-break it.
      while (measure(current) > maxWidth && current.length > 1) {
        let cut = current.length - 1;
        while (cut > 1 && measure(current.slice(0, cut)) > maxWidth) cut -= 1;
        lines.push(current.slice(0, cut));
        current = current.slice(cut);
      }
    }
    lines.push(current);
  }
  return lines;
}

/** Export pages up to the last one holding text or ink. */
export function notebookPagesForExport(pages: NotebookPage[]): NotebookPage[] {
  let lastIndex = -1;
  pages.forEach((page, index) => {
    if (page.text.trim().length > 0 || page.strokes.length > 0) lastIndex = index;
  });
  return lastIndex < 0 ? pages.slice(0, 1) : pages.slice(0, lastIndex + 1);
}

function renderPdfPageCanvas(input: {
  page: NotebookPage;
  pageNumber: number;
  title: string;
  dateLabel: string;
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = RENDER_WIDTH_PX;
  canvas.height = RENDER_HEIGHT_PX;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is unavailable");

  const scale = RENDER_WIDTH_PX / NOTEBOOK_PAGE.width;

  // Paper.
  context.fillStyle = NOTEBOOK_PAGE.paperColor;
  context.fillRect(0, 0, RENDER_WIDTH_PX, RENDER_HEIGHT_PX);

  // Ruled lines + red margin, mirroring the on-screen page.
  context.strokeStyle = NOTEBOOK_PAGE.ruleColor;
  context.lineWidth = Math.max(1, scale * 0.5);
  for (let y = NOTEBOOK_PAGE.ruleTop * scale; y < RENDER_HEIGHT_PX - 18 * scale; y += NOTEBOOK_PAGE.ruleSpacing * scale) {
    context.beginPath();
    context.moveTo(10 * scale, y);
    context.lineTo(RENDER_WIDTH_PX - 10 * scale, y);
    context.stroke();
  }
  context.strokeStyle = NOTEBOOK_PAGE.marginColor;
  context.lineWidth = Math.max(1, scale * 0.6);
  context.beginPath();
  context.moveTo(NOTEBOOK_PAGE.marginX * scale, 0);
  context.lineTo(NOTEBOOK_PAGE.marginX * scale, RENDER_HEIGHT_PX);
  context.stroke();

  // Tiny header: notebook title (left) + export date (right).
  context.fillStyle = "rgba(31, 41, 55, 0.55)";
  context.font = `${9 * scale}px 'Barlow', system-ui, sans-serif`;
  context.textBaseline = "alphabetic";
  context.fillText(input.title, NOTEBOOK_PAGE.textLeft * scale, 22 * scale);
  const dateWidth = context.measureText(input.dateLabel).width;
  context.fillText(input.dateLabel, RENDER_WIDTH_PX - NOTEBOOK_PAGE.textRight * scale - dateWidth, 22 * scale);

  // Typed text, wrapped to the same block as the on-screen textarea.
  const fontPx = NOTEBOOK_PAGE.fontSize * scale;
  context.font = `${fontPx}px ${NOTEBOOK_PAGE.fontFamily}`;
  context.fillStyle = NOTEBOOK_PAGE.inkTextColor;
  const textLeft = NOTEBOOK_PAGE.textLeft * scale;
  const maxTextWidth = (NOTEBOOK_PAGE.width - NOTEBOOK_PAGE.textLeft - NOTEBOOK_PAGE.textRight) * scale;
  const lines = wrapNotebookTextLines((value) => context.measureText(value).width, input.page.text, maxTextWidth);
  lines.forEach((line, index) => {
    // Baselines sit just above each ruled line, like ink on paper.
    const baseline = (NOTEBOOK_PAGE.ruleTop + index * NOTEBOOK_PAGE.ruleSpacing - 6) * scale;
    if (baseline > RENDER_HEIGHT_PX - 30 * scale) return;
    if (line.length === 0) return;
    context.fillText(line, textLeft, baseline);
  });

  // Ink strokes (normalized coordinates map straight onto the render size).
  for (const stroke of input.page.strokes) {
    drawWhiteboardStroke(
      context,
      { ...stroke, thickness: stroke.thickness * scale },
      { width: RENDER_WIDTH_PX, height: RENDER_HEIGHT_PX }
    );
  }

  // Footer page number.
  context.fillStyle = "rgba(31, 41, 55, 0.45)";
  context.font = `${9 * scale}px 'Barlow', system-ui, sans-serif`;
  const label = `Page ${input.pageNumber}`;
  const labelWidth = context.measureText(label).width;
  context.fillText(label, (RENDER_WIDTH_PX - labelWidth) / 2, RENDER_HEIGHT_PX - 12 * scale);

  return canvas;
}

export async function exportNotebookPdf(input: {
  pages: NotebookPage[];
  title: string;
  fileName?: string;
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait", compress: true });
  const exportPages = notebookPagesForExport(input.pages);
  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  exportPages.forEach((page, index) => {
    if (index > 0) pdf.addPage();
    const canvas = renderPdfPageCanvas({
      page,
      pageNumber: index + 1,
      title: input.title,
      dateLabel
    });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, PDF_PAGE_WIDTH_PT, PDF_PAGE_HEIGHT_PT);
  });

  const datePart = now.toISOString().slice(0, 10);
  pdf.save(input.fileName ?? `notebook-${datePart}.pdf`);
}
