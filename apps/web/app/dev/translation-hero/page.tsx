"use client";

import { useState } from "react";
import { TranslationPanel } from "../../../components/TranslationPanel";
import { TranslationDock } from "../../../components/TranslationDock";
import type { useTranslation, TranslationLine } from "../../../lib/useTranslation";

type TranslationController = ReturnType<typeof useTranslation>;

const SAMPLE_LINES: TranslationLine[] = [
  {
    id: "line-1",
    participantId: "participant-a",
    utteranceId: "utt-1",
    sourceText: "Hola a todos, bienvenidos a la sesión de hoy.",
    displayText: "Hello everyone, welcome to today's session.",
    sourceLang: "es",
    translatedFrom: "es",
    sentAt: Date.now() - 120000,
    startMs: 12000,
    pending: false,
  },
  {
    id: "line-2",
    participantId: "participant-b",
    utteranceId: "utt-2",
    sourceText: "Merci, c'est un plaisir d'être ici.",
    displayText: "Thank you, it's a pleasure to be here.",
    sourceLang: "fr",
    translatedFrom: "fr",
    sentAt: Date.now() - 90000,
    startMs: 42000,
    pending: false,
  },
  {
    id: "line-3",
    participantId: "self",
    utteranceId: "utt-3",
    sourceText: "Great, let's get started with the agenda.",
    displayText: "Great, let's get started with the agenda.",
    sourceLang: "en",
    translatedFrom: null,
    sentAt: Date.now() - 60000,
    startMs: 72000,
    pending: false,
  },
  {
    id: "line-4",
    participantId: "participant-a",
    utteranceId: "utt-4",
    sourceText: "Perfecto, empecemos con la introducción.",
    displayText: "Perfect, let's start with the introduction…",
    sourceLang: "es",
    translatedFrom: "es",
    sentAt: Date.now() - 10000,
    startMs: 122000,
    pending: true,
  },
];

function makeController(overrides: Partial<TranslationController>): TranslationController {
  return {
    lines: [],
    sharing: false,
    listening: false,
    supported: true,
    error: "",
    dockOpen: true,
    setDockOpen: () => {},
    clearLines: () => {},
    resetDock: () => {},
    enableSharing: async () => {},
    disableSharing: () => {},
    toggleSharing: () => {},
    handleRealtimeMessage: () => false,
    copyVisible: async () => {},
    ...overrides,
  };
}

function speakerLabel(id: string) {
  const names: Record<string, string> = {
    "participant-a": "Maria",
    "participant-b": "Jean-Luc",
    self: "You",
  };
  return names[id] ?? id;
}

export default function TranslationHero() {
  const [sharing, setSharing] = useState(false);
  const [listening, setListening] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);
  const [hasLines, setHasLines] = useState(true);
  const [readLang, setReadLang] = useState("en");
  const [speakLang, setSpeakLang] = useState("es");

  const controller = makeController({
    sharing,
    listening,
    supported: true,
    dockOpen,
    lines: hasLines ? SAMPLE_LINES : [],
    setDockOpen,
    toggleSharing: () => {
      if (!sharing) {
        setSharing(true);
        setTimeout(() => setListening(true), 600);
      } else {
        setSharing(false);
        setListening(false);
      }
    },
    clearLines: () => setHasLines(false),
    resetDock: () => { setDockOpen(false); setSharing(false); setListening(false); },
    copyVisible: async () => {},
  });

  const sectionStyle: React.CSSProperties = {
    marginBottom: 40,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.3)",
    marginBottom: 12,
  };

  return (
    <div style={{ background: "#0b0f0c", minHeight: "100vh", padding: "40px 24px", fontFamily: "'Barlow', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ color: "#cdc9bc", fontSize: 14, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 32, opacity: 0.5 }}>
          Translation UI — Dev Harness
        </h1>

        {/* Controls */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 40 }}>
          {[
            { label: sharing ? "Sharing: On" : "Sharing: Off", action: () => controller.toggleSharing() },
            { label: hasLines ? "Lines: On" : "Lines: Off", action: () => setHasLines(v => !v) },
            { label: dockOpen ? "Dock: Open" : "Dock: Closed", action: () => setDockOpen(v => !v) },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                padding: "5px 12px",
                fontSize: 11,
                fontFamily: "'Barlow', system-ui, sans-serif",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999,
                color: "#cdc9bc",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div style={sectionStyle}>
          <p style={labelStyle}>Translation Panel (right HUD sidebar)</p>
          <div style={{ width: 208, background: "rgba(19, 25, 20, 0.96)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}>
            <TranslationPanel
              controller={controller}
              readLang={readLang}
              speakLang={speakLang}
              micEnabled={true}
              onReadLangChange={setReadLang}
              onSpeakLangChange={setSpeakLang}
            />
          </div>
        </div>

        {/* Dock */}
        <div style={sectionStyle}>
          <p style={labelStyle}>Translation Dock (bottom-center)</p>
          <div style={{ position: "relative", height: 300, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", width: "min(580px, calc(100% - 24px))" }}>
              <TranslationDock
                controller={controller}
                speakerLabel={speakerLabel}
                selfParticipantId="self"
              />
            </div>
          </div>
          <p style={{ ...labelStyle, marginTop: 12 }}>Idle peek state</p>
          <div style={{ position: "relative", height: 80, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)" }}>
              <TranslationDock
                controller={{ ...controller, dockOpen: false }}
                speakerLabel={speakerLabel}
                selfParticipantId="self"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
