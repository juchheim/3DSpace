"use client";

import type { DeckSlide, DeckTheme } from "@3dspace/room-engine";
import { slideBodyLines } from "@3dspace/room-engine";

/**
 * Renders a single deck slide. Shared between the wall-board surface
 * (WallObjectCard) and the Lesson Builder live preview so what the teacher
 * designs is exactly what the class sees.
 */
export function SlideDeckSlide({
  slide,
  theme,
  imageUrl
}: {
  slide: DeckSlide;
  theme: DeckTheme;
  imageUrl?: string | undefined;
}) {
  const lines = slideBodyLines(slide.body);
  const resolvedImage = imageUrl ?? slide.imageUrl;

  return (
    <div className={`deck-slide deck-slide--${theme} deck-slide--layout-${slide.layout}`}>
      {slide.layout === "title" ? (
        <div className="deck-slide__center">
          <h2 className="deck-slide__title">{slide.title || "Untitled slide"}</h2>
          {slide.body ? <p className="deck-slide__subtitle">{slide.body}</p> : null}
        </div>
      ) : null}

      {slide.layout === "bullets" ? (
        <div className="deck-slide__stack">
          {slide.title ? <h3 className="deck-slide__heading">{slide.title}</h3> : null}
          <ul className="deck-slide__bullets">
            {lines.length > 0 ? lines.map((line, index) => <li key={index}>{line}</li>) : <li className="deck-slide__placeholder">Add bullet points…</li>}
          </ul>
        </div>
      ) : null}

      {slide.layout === "big-fact" ? (
        <div className="deck-slide__center">
          <p className="deck-slide__fact">{slide.title || "Big idea"}</p>
          {slide.body ? <p className="deck-slide__subtitle">{slide.body}</p> : null}
        </div>
      ) : null}

      {slide.layout === "quote" ? (
        <div className="deck-slide__center">
          <blockquote className="deck-slide__quote">
            <span aria-hidden className="deck-slide__quote-mark">&ldquo;</span>
            {slide.title || "Quotation"}
          </blockquote>
          {slide.body ? <p className="deck-slide__attribution">— {slide.body}</p> : null}
        </div>
      ) : null}

      {slide.layout === "image" ? (
        <div className="deck-slide__image-full">
          {resolvedImage ? (
            <img src={resolvedImage} alt={slide.title || "Slide image"} decoding="async" />
          ) : (
            <div className="deck-slide__image-missing">Add an image</div>
          )}
          {slide.title ? <p className="deck-slide__caption">{slide.title}</p> : null}
        </div>
      ) : null}

      {slide.layout === "image-text" ? (
        <div className="deck-slide__split">
          <div className="deck-slide__split-media">
            {resolvedImage ? (
              <img src={resolvedImage} alt={slide.title || "Slide image"} decoding="async" />
            ) : (
              <div className="deck-slide__image-missing">Add an image</div>
            )}
          </div>
          <div className="deck-slide__split-text">
            {slide.title ? <h3 className="deck-slide__heading">{slide.title}</h3> : null}
            <ul className="deck-slide__bullets">
              {lines.length > 0 ? lines.map((line, index) => <li key={index}>{line}</li>) : <li className="deck-slide__placeholder">Add supporting points…</li>}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
