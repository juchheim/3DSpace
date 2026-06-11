export type DeckSlideLayout = "title" | "bullets" | "big-fact" | "quote" | "image" | "image-text";

export type DeckSlide = {
  id: string;
  layout: DeckSlideLayout;
  title: string;
  body: string;
  imageAttachmentId?: string | undefined;
  imageUrl?: string | undefined;
};

export type DeckTheme = "midnight" | "paper" | "chalkboard";

export type SlideDeckState = {
  index: number;
  count: number;
};

const DECK_LAYOUTS: DeckSlideLayout[] = ["title", "bullets", "big-fact", "quote", "image", "image-text"];
const DECK_THEMES: DeckTheme[] = ["midnight", "paper", "chalkboard"];

function normalizeLayout(value: unknown): DeckSlideLayout {
  return DECK_LAYOUTS.includes(value as DeckSlideLayout) ? (value as DeckSlideLayout) : "title";
}

export function normalizeSlideDeckTheme(value: unknown): DeckTheme {
  return DECK_THEMES.includes(value as DeckTheme) ? (value as DeckTheme) : "midnight";
}

/** Reads the inline `source.data` of a slide-deck wall object. Never includes speaker notes. */
export function normalizeSlideDeckInlineData(data: Record<string, unknown>): { theme: DeckTheme; slides: DeckSlide[] } {
  const theme = normalizeSlideDeckTheme(data.theme);
  const raw = Array.isArray(data.slides) ? data.slides : [];
  const slides: DeckSlide[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const slide: DeckSlide = {
      id: String(record.id ?? `slide-${slides.length + 1}`).trim() || `slide-${slides.length + 1}`,
      layout: normalizeLayout(record.layout),
      title: String(record.title ?? ""),
      body: String(record.body ?? "")
    };
    if (typeof record.imageAttachmentId === "string" && record.imageAttachmentId) {
      slide.imageAttachmentId = record.imageAttachmentId;
    }
    if (typeof record.imageUrl === "string" && record.imageUrl) {
      slide.imageUrl = record.imageUrl;
    }
    slides.push(slide);
  }

  return { theme, slides };
}

/** Reads the presenter position from a slide-deck wall object's `state`, clamped to the deck. */
export function readSlideDeckState(state: Record<string, unknown> | undefined, slideCount: number): SlideDeckState {
  const maxIndex = Math.max(0, slideCount - 1);
  const slides = state?.slides;
  if (!slides || typeof slides !== "object") {
    return { index: 0, count: slideCount };
  }
  const record = slides as Record<string, unknown>;
  const rawIndex = Number(record.index ?? 0);
  const index = Number.isFinite(rawIndex) ? Math.min(Math.max(Math.floor(rawIndex), 0), maxIndex) : 0;
  return { index, count: slideCount };
}

export function createInitialSlideDeckState(slideCount: number): { slides: SlideDeckState & { sentAt: number } } {
  return { slides: { index: 0, count: slideCount, sentAt: Date.now() } };
}

/** Splits a slide body into displayable bullet lines (used by bullets / image-text layouts). */
export function slideBodyLines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}
