"use client";

import { useEffect, useRef, useState } from "react";
import type { AiHostBuildHelpContext } from "@3dspace/contracts";
import type { useAiWorldHost } from "../lib/useAiWorldHost";

type AiWorldHostController = ReturnType<typeof useAiWorldHost>;

type WorldHostTab = "build-help" | "study-files";

const SUGGESTED_QUESTIONS = [
  "How do I undo?",
  "How do I place a wall?",
  "What does key 3 do?",
  "Boards on build walls",
  "Why was my build rejected?"
];

export function WorldHostPanel({
  controller,
  buildHelpContext
}: {
  controller: AiWorldHostController;
  buildHelpContext?: AiHostBuildHelpContext | undefined;
}) {
  const { host, chatMessages, chatStreaming, streamingReply, chatError, actions } = controller;
  const [tab, setTab] = useState<WorldHostTab>("build-help");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatMessages, streamingReply]);

  if (!host) return null;

  function ask(content: string) {
    const trimmed = content.trim();
    if (!trimmed || chatStreaming) return;
    setDraft("");
    void actions.sendBuildHelp(trimmed, buildHelpContext);
  }

  return (
    <section className="hud-card ai-world-host-panel" aria-label={`${host.displayName} chat`}>
      <header className="ai-world-host-panel__header">
        <h3 className="hud-heading">{host.displayName}</h3>
        <span className="ai-world-host-panel__subtitle">AI guide</span>
      </header>

      <div className="ai-world-host-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "build-help"}
          className={`ai-world-host-panel__tab${tab === "build-help" ? " ai-world-host-panel__tab--active" : ""}`}
          onClick={() => setTab("build-help")}
        >
          Build Help
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "study-files"}
          className={`ai-world-host-panel__tab${tab === "study-files" ? " ai-world-host-panel__tab--active" : ""}`}
          onClick={() => setTab("study-files")}
        >
          Study Files
        </button>
      </div>

      {tab === "build-help" ? (
        <div className="ai-world-host-panel__body">
          <div className="ai-world-host-panel__messages" ref={scrollRef}>
            {chatMessages.length === 0 && !streamingReply ? (
              <p className="ai-world-host-panel__hint">
                Ask me anything about building — tools, shortcuts, or why a placement was blocked.
              </p>
            ) : null}
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`ai-world-host-panel__message ai-world-host-panel__message--${message.role}`}
              >
                {message.content}
              </div>
            ))}
            {chatStreaming ? (
              <div className="ai-world-host-panel__message ai-world-host-panel__message--assistant ai-world-host-panel__message--streaming">
                {streamingReply || "…"}
              </div>
            ) : null}
          </div>

          {chatError ? (
            <p className="ai-world-host-panel__error" role="alert">
              {chatError}
            </p>
          ) : null}

          <div className="ai-world-host-panel__chips">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                className="ai-world-host-panel__chip"
                disabled={chatStreaming}
                onClick={() => ask(question)}
              >
                {question}
              </button>
            ))}
          </div>

          <form
            className="ai-world-host-panel__composer"
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
          >
            <input
              type="text"
              className="ai-world-host-panel__input"
              placeholder="Ask the guide…"
              value={draft}
              maxLength={8000}
              disabled={chatStreaming}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="submit"
              className="ai-world-host-panel__send"
              disabled={chatStreaming || draft.trim().length === 0}
            >
              {chatStreaming ? "…" : "Send"}
            </button>
          </form>
        </div>
      ) : (
        <div className="ai-world-host-panel__body">
          <p className="ai-world-host-panel__hint">
            Study Files are coming soon — you'll be able to upload documents and chat about them here.
          </p>
        </div>
      )}
    </section>
  );
}
