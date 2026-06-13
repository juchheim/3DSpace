"use client";

import { TRANSLATION_LANGUAGES, TRANSLATION_TTS_VOICES, translationLanguageLabel } from "@3dspace/contracts";
import type { useTranslation } from "../lib/useTranslation";
import type { useTranslationVoice, VoiceMode } from "../lib/useTranslationVoice";
import { HudCard } from "./HudCard";

type TranslationController = ReturnType<typeof useTranslation>;
type VoiceController = ReturnType<typeof useTranslationVoice>;

export function TranslationPanel({
  controller,
  readLang,
  speakLang,
  micEnabled,
  onReadLangChange,
  onSpeakLangChange,
  voiceEnabled = false,
  voiceMode = "off",
  voiceChoice = "auto",
  voiceController,
  onVoiceModeChange,
  onVoiceChoiceChange
}: {
  controller: TranslationController;
  readLang: string;
  speakLang: string;
  micEnabled: boolean;
  onReadLangChange: (lang: string) => void;
  onSpeakLangChange: (lang: string) => void;
  voiceEnabled?: boolean;
  voiceMode?: VoiceMode;
  voiceChoice?: string;
  voiceController?: VoiceController;
  onVoiceModeChange?: (mode: VoiceMode) => void;
  onVoiceChoiceChange?: (voice: string) => void;
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

  let voiceStatusText = "";
  if (voiceEnabled && voiceController) {
    if (voiceController.audioBlocked) {
      voiceStatusText = "Click to enable translation audio";
    } else if (voiceController.speaking) {
      const queued = voiceController.queueDepth;
      voiceStatusText = `Speaking ${translationLanguageLabel(readLang)}…${queued > 0 ? ` (${queued} queued)` : ""}`;
    } else if (voiceMode !== "off") {
      voiceStatusText = "Voice ready";
    }
  }

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

        {voiceEnabled ? (
          <>
            <div className="translation-panel__field">
              <label className="translation-panel__label" htmlFor="translation-voice-mode">
                Hear translations:
              </label>
              <select
                id="translation-voice-mode"
                className="translation-panel__select"
                value={voiceMode}
                onChange={(e) => onVoiceModeChange?.(e.target.value as VoiceMode)}
              >
                <option value="off">Off (subtitles only)</option>
                <option value="duck">Duck original</option>
                <option value="replace">Replace original</option>
              </select>
            </div>

            {voiceMode !== "off" ? (
              <div className="translation-panel__field">
                <label className="translation-panel__label" htmlFor="translation-voice-choice">
                  Voice:
                </label>
                <select
                  id="translation-voice-choice"
                  className="translation-panel__select"
                  value={voiceChoice}
                  onChange={(e) => onVoiceChoiceChange?.(e.target.value)}
                >
                  <option value="auto">Auto (per speaker)</option>
                  {TRANSLATION_TTS_VOICES.map((v) => (
                    <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                  ))}
                </select>
              </div>
            ) : null}

            {voiceStatusText ? (
              <p
                className="translation-panel__status"
                style={{ cursor: voiceController?.audioBlocked ? "pointer" : undefined }}
                onClick={voiceController?.audioBlocked ? voiceController.resumeAudio : undefined}
              >
                {voiceStatusText}
              </p>
            ) : null}
          </>
        ) : null}

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
