"use client";

import { useEffect, useRef, useState } from "react";
import type { AiHostBuildHelpContext, RoomAiHostFile } from "@3dspace/contracts";
import type { useAiWorldHost } from "../lib/useAiWorldHost";

type AiWorldHostController = ReturnType<typeof useAiWorldHost>;

type WorldHostTab = "build-help" | "study-files";

const BUILD_HELP_CHIPS = [
  "How do I undo?",
  "How do I place a wall?",
  "What does key 3 do?",
  "Boards on build walls",
  "Why was my build rejected?"
];

const ACCEPTED_FILE_TYPES = ".pdf,.txt,.md,text/plain,text/markdown,application/pdf";

function fileStatusLabel(file: RoomAiHostFile) {
  switch (file.status) {
    case "ready":
      return "Ready";
    case "processing":
      return "Processing…";
    case "failed":
      return "Failed";
    default:
      return file.status;
  }
}

export function WorldHostPanel({
  controller,
  buildHelpContext
}: {
  controller: AiWorldHostController;
  buildHelpContext?: AiHostBuildHelpContext | undefined;
}) {
  const {
    host,
    chatMessages,
    chatStreaming,
    streamingReply,
    chatError,
    studyFiles,
    currentUserId,
    filesLoading,
    filesError,
    filesBusy,
    activeFileId,
    setActiveFileId,
    fileChatMessages,
    actions,
    setPanelOpen
  } = controller;

  const [tab, setTab] = useState<WorldHostTab>(host ? "build-help" : "study-files");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeMessages = tab === "build-help" ? chatMessages : fileChatMessages;
  const panelTitle = host?.displayName ?? "Study files";
  const buildHelpAvailable = Boolean(host);

  useEffect(() => {
    if (!host && tab === "build-help") setTab("study-files");
  }, [host, tab]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [activeMessages, streamingReply, tab]);

  if (!host && studyFiles.length === 0 && !filesLoading) return null;

  function askBuildHelp(content: string) {
    const trimmed = content.trim();
    if (!trimmed || chatStreaming || !buildHelpAvailable) return;
    setDraft("");
    void actions.sendBuildHelp(trimmed, buildHelpContext);
  }

  function askFileStudy(content: string) {
    const trimmed = content.trim();
    if (!trimmed || !activeFileId || chatStreaming) return;
    const file = studyFiles.find((entry) => entry.id === activeFileId);
    if (!file || file.status !== "ready") return;
    setDraft("");
    void actions.sendFileStudy(activeFileId, trimmed);
  }

  const activeFile = studyFiles.find((file) => file.id === activeFileId) ?? null;
  const canChatWithFile = activeFile?.status === "ready";
  const canDeleteFile = (file: RoomAiHostFile) => file.uploadedByUserId === currentUserId;

  return (
    <section className="hud-card ai-world-host-panel" data-testid="ai-world-host-panel" aria-label={`${panelTitle} chat`}>
      <header className="ai-world-host-panel__header">
        <div className="ai-world-host-panel__header-text">
          <h3 className="hud-heading">{panelTitle}</h3>
          <span className="ai-world-host-panel__subtitle">
            {host ? "AI guide" : "Summon the guide for build help"}
          </span>
        </div>
        <button
          type="button"
          className="ai-world-host-panel__close"
          aria-label="Close guide panel"
          onClick={() => setPanelOpen(false)}
        >
          ×
        </button>
      </header>

      <div className="hud-card-body ai-world-host-panel__content">
        <div className="ai-world-host-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "build-help"}
          className={`ai-world-host-panel__tab${tab === "build-help" ? " ai-world-host-panel__tab--active" : ""}`}
          disabled={!buildHelpAvailable}
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
          {!buildHelpAvailable ? (
            <p className="ai-world-host-panel__hint">Summon the AI guide to ask build questions.</p>
          ) : null}
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
            {BUILD_HELP_CHIPS.map((question) => (
              <button
                key={question}
                type="button"
                className="ai-world-host-panel__chip"
                disabled={chatStreaming || !buildHelpAvailable}
                onClick={() => askBuildHelp(question)}
              >
                {question}
              </button>
            ))}
          </div>

          <form
            className="ai-world-host-panel__composer"
            onSubmit={(event) => {
              event.preventDefault();
              askBuildHelp(draft);
            }}
          >
            <input
              type="text"
              className="ai-world-host-panel__input"
              placeholder={buildHelpAvailable ? "Ask the guide…" : "Summon the guide first"}
              value={draft}
              maxLength={8000}
              disabled={chatStreaming || !buildHelpAvailable}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="submit"
              className="ai-world-host-panel__send"
              disabled={chatStreaming || !buildHelpAvailable || draft.trim().length === 0}
            >
              {chatStreaming ? "…" : "Send"}
            </button>
          </form>
        </div>
      ) : (
        <div className="ai-world-host-panel__body ai-world-host-panel__body--study">
          <p className="ai-world-host-panel__privacy">
            Files are shared with everyone in this room (names only). Chat about a file is private to you. Do not
            upload passwords or other sensitive data.
          </p>

          <div className="ai-world-host-panel__file-toolbar">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              className="ai-world-host-panel__file-input"
              disabled={filesBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void actions.uploadStudyFile(file).catch(() => undefined);
              }}
            />
            <button
              type="button"
              className="ai-world-host-panel__send"
              disabled={filesBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              {filesBusy ? "Uploading…" : "Upload"}
            </button>
          </div>

          {filesError ? (
            <p className="ai-world-host-panel__error" role="alert">
              {filesError}
            </p>
          ) : null}

          {filesLoading ? <p className="ai-world-host-panel__hint">Loading files…</p> : null}

          <ul className="ai-world-host-panel__file-list">
            {studyFiles.length === 0 && !filesLoading ? (
              <li className="ai-world-host-panel__hint">No study files yet. Upload a .txt, .md, or .pdf to start.</li>
            ) : null}
            {studyFiles.map((file) => (
              <li key={file.id} className="ai-world-host-panel__file-row">
                <button
                  type="button"
                  className={`ai-world-host-panel__file-select${
                    activeFileId === file.id ? " ai-world-host-panel__file-select--active" : ""
                  }`}
                  onClick={() => setActiveFileId(file.id)}
                >
                  <span className="ai-world-host-panel__file-name">{file.originalFileName}</span>
                  <span className="ai-world-host-panel__file-meta">
                    {file.uploadedByUserId === currentUserId ? "Your file · " : "Room file · "}
                    {fileStatusLabel(file)} · {(file.sizeBytes / 1024).toFixed(0)} KB
                  </span>
                  {file.status === "failed" && file.errorMessage ? (
                    <span className="ai-world-host-panel__file-error">{file.errorMessage}</span>
                  ) : null}
                </button>
                {file.status === "failed" ? (
                  <button
                    type="button"
                    className="ai-world-host-panel__file-retry"
                    disabled={filesBusy}
                    onClick={() => {
                      void actions.retryStudyFile(file.id);
                    }}
                  >
                    Retry
                  </button>
                ) : null}
                {canDeleteFile(file) ? (
                  <button
                    type="button"
                    className="ai-world-host-panel__file-delete"
                    disabled={filesBusy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Delete ${file.originalFileName}? Chat history for this file will be removed.`
                        )
                      ) {
                        return;
                      }
                      void actions.deleteStudyFile(file.id);
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {activeFile ? (
            <div className="ai-world-host-panel__file-chat">
              <p className="ai-world-host-panel__file-chat-title">Chat about {activeFile.originalFileName}</p>
              <div className="ai-world-host-panel__messages ai-world-host-panel__messages--nested" ref={scrollRef}>
                {fileChatMessages.length === 0 && !streamingReply ? (
                  <p className="ai-world-host-panel__hint">
                    {canChatWithFile
                      ? "Ask questions about this file — summaries, quizzes, or clarifications."
                      : activeFile.status === "processing"
                        ? "Processing… large PDFs may take a minute."
                        : "This file is not ready for chat yet."}
                  </p>
                ) : null}
                {fileChatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`ai-world-host-panel__message ai-world-host-panel__message--${message.role}`}
                  >
                    {message.content}
                  </div>
                ))}
                {chatStreaming && tab === "study-files" ? (
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

              <form
                className="ai-world-host-panel__composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  askFileStudy(draft);
                }}
              >
                <input
                  type="text"
                  className="ai-world-host-panel__input"
                  placeholder={canChatWithFile ? "Ask about this file…" : "File not ready"}
                  value={draft}
                  maxLength={8000}
                  disabled={chatStreaming || !canChatWithFile}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  className="ai-world-host-panel__send"
                  disabled={chatStreaming || !canChatWithFile || draft.trim().length === 0}
                >
                  {chatStreaming ? "…" : "Send"}
                </button>
              </form>
            </div>
          ) : studyFiles.length > 0 ? (
            <p className="ai-world-host-panel__hint">Select a file above to start chatting.</p>
          ) : null}
        </div>
      )}
      </div>
    </section>
  );
}
