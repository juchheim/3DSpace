"use client";

import { TRANSLATION_LANGUAGES, translationLanguageLabel } from "@3dspace/contracts";
import type { useTranslation } from "../lib/useTranslation";
import { HudCard } from "./HudCard";

type TranslationController = ReturnType<typeof useTranslation>;

export function TranslationPanel({
  controller,
  readLang,
  speakLang,
  micEnabled,
  onReadLangChange,
  onSpeakLangChange
}: {
  controller: TranslationController;
  readLang: string;
  speakLang: string;
  micEnabled: boolean;
  onReadLangChange: (lang: string) => void;
  onSpeakLangChange: (lang: string) => void;
}) {
  const isSharing = controller.sharing;
  const shareDisabled = !controller.supported || !micEnabled;
  let shareTitle = "";
  if (!controller.supported) shareTitle = "Chrome or Edge required to share speech";
  else if (!micEnabled) shareTitle = "Turn on your mic before sharing speech";

  const statusText = isSharing
    ? controller.listening
      ? `Listening… (${translationLanguageLabel(speakLang)})`
      : "Starting speech recognition…"
    : !controller.supported
      ? "Chrome or Edge required to share speech."
      : !micEnabled
        ? "Mic off — sharing unavailable."
        : `Translating to ${translationLanguageLabel(readLang)}`;

  const hasLines = controller.lines.length > 0;
  const hasAlert = Boolean(controller.error);

  return (
    <HudCard
      title="Translation"
      ariaLabel="Live translation"
      defaultCollapsed
      forceExpanded={isSharing || hasLines}
      hasAlert={hasAlert}
    >
      <div className="translation-panel">
        {controller.error ? (
          <p className="translation-panel__error">{controller.error}</p>
        ) : null}

        <div className="translation-panel__field">
          <label className="translation-panel__label" htmlFor="translation-read-lang">
            Show me captions in:
          </label>
          <select
            id="translation-read-lang"
            className="translation-panel__select"
            value={readLang}
            onChange={(e) => onReadLangChange(e.target.value)}
          >
            {TRANSLATION_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </div>

        <div className="translation-panel__field">
          <label className="translation-panel__label" htmlFor="translation-speak-lang">
            I speak:
          </label>
          <select
            id="translation-speak-lang"
            className="translation-panel__select"
            value={speakLang}
            onChange={(e) => onSpeakLangChange(e.target.value)}
          >
            {TRANSLATION_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </div>

        <div className="translation-panel__actions">
          <button
            type="button"
            className={`translation-panel__button translation-panel__button--share${isSharing ? " translation-panel__button--active" : ""}`}
            disabled={shareDisabled}
            title={shareTitle}
            onClick={() => controller.toggleSharing()}
          >
            {isSharing ? "Stop sharing speech" : "Share my speech"}
          </button>
        </div>

        <p className="translation-panel__status">{statusText}</p>
      </div>
    </HudCard>
  );
}
