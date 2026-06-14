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
  if (!controller.supported) shareTitle = "Speech sharing requires Chrome or Edge";
  else if (!micEnabled) shareTitle = "Enable your mic to share speech";

  const liveText = isSharing
    ? controller.listening
      ? `Listening in ${translationLanguageLabel(speakLang)}`
      : "Activating…"
    : null;

  const footerText = isSharing
    ? null
    : !controller.supported
      ? "Speech sharing requires Chrome or Edge."
      : !micEnabled
        ? "Enable your mic to share speech."
        : `Others' speech translates to ${translationLanguageLabel(readLang)}.`;

  const hasLines = controller.lines.length > 0;
  const hasAlert = Boolean(controller.error);

  let voiceStatusText = "";
  if (voiceEnabled && voiceController) {
    if (voiceController.audioBlocked) {
      voiceStatusText = "Tap to enable audio playback";
    } else if (voiceController.speaking) {
      const queued = voiceController.queueDepth;
      voiceStatusText = `Speaking ${translationLanguageLabel(readLang)}${queued > 0 ? ` · ${queued} queued` : ""}`;
    } else if (voiceMode !== "off") {
      voiceStatusText = "Voice ready";
    }
  }

  return (
    <HudCard
      title="Translation"
      ariaLabel="Live translation settings"
      defaultCollapsed
      forceExpanded={isSharing || hasLines}
      hasAlert={hasAlert}
    >
      <div className="translation-panel">
        {controller.error ? (
          <p className="translation-panel__error">{controller.error}</p>
        ) : null}

        {liveText ? (
          <div className="translation-panel__live-status">
            <span className="translation-panel__live-dot" aria-hidden="true" />
            <span className="translation-panel__live-text">{liveText}</span>
          </div>
        ) : null}

        <div className="translation-panel__field">
          <label className="translation-panel__label" htmlFor="translation-read-lang">
            Caption language
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
            My language
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
          <div className="translation-panel__voice-section">
            <div className="translation-panel__field">
              <label className="translation-panel__label" htmlFor="translation-voice-mode">
                Spoken translation
              </label>
              <select
                id="translation-voice-mode"
                className="translation-panel__select"
                value={voiceMode}
                onChange={(e) => onVoiceModeChange?.(e.target.value as VoiceMode)}
              >
                <option value="off">Off – subtitles only</option>
                <option value="duck">Lower speaker volume</option>
                <option value="replace">Replace speaker audio</option>
              </select>
            </div>

            {voiceMode !== "off" ? (
              <div className="translation-panel__field">
                <label className="translation-panel__label" htmlFor="translation-voice-choice">
                  Voice
                </label>
                <select
                  id="translation-voice-choice"
                  className="translation-panel__select"
                  value={voiceChoice}
                  onChange={(e) => onVoiceChoiceChange?.(e.target.value)}
                >
                  <option value="auto">Auto – match each speaker</option>
                  {TRANSLATION_TTS_VOICES.map((v) => (
                    <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                  ))}
                </select>
              </div>
            ) : null}

            {voiceStatusText ? (
              <p
                className="translation-panel__voice-status"
                style={{ cursor: voiceController?.audioBlocked ? "pointer" : undefined }}
                onClick={voiceController?.audioBlocked ? voiceController.resumeAudio : undefined}
              >
                {voiceStatusText}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="translation-panel__actions">
          <button
            type="button"
            className={`translation-panel__share-btn${isSharing ? " translation-panel__share-btn--live" : ""}`}
            disabled={shareDisabled}
            title={shareTitle}
            onClick={() => controller.toggleSharing()}
          >
            <span
              className={`translation-panel__share-dot${isSharing ? " translation-panel__share-dot--live" : ""}`}
              aria-hidden="true"
            />
            {isSharing ? "Stop sharing" : "Share my speech"}
          </button>
        </div>

        {footerText ? (
          <p className="translation-panel__footer">{footerText}</p>
        ) : null}
      </div>
    </HudCard>
  );
}
