"use client";

import { useMemo, useState } from "react";
import type { RoomManifest, WallObject } from "@3dspace/contracts";
import type { ApiIdentity } from "../lib/identity";
import { WallObjectCard } from "./WallObjectCard";

export function AnchorPanel({
  identity,
  roomId,
  manifest,
  wallObjects,
  assetUrls,
  wallMediaStreams,
  canCreate,
  canManage,
  loading,
  error,
  onCreateFile,
  onCreateNote,
  onCreateTimer,
  onCreatePoll,
  onCreateLink,
  onPinCamera,
  onPinMicrophone,
  onShareScreen,
  onRemove,
  onStopShare,
  onControl,
  onModerate
}: {
  identity: ApiIdentity;
  roomId: string;
  manifest: RoomManifest;
  wallObjects: WallObject[];
  assetUrls: Record<string, string>;
  wallMediaStreams: Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>;
  canCreate: boolean;
  canManage: boolean;
  loading: boolean;
  error: string;
  onCreateFile(input: { anchorId: string; file: File; title: string; altText?: string | undefined; caption?: string | undefined }): Promise<void>;
  onCreateNote(input: { anchorId: string; title: string; text: string }): Promise<void>;
  onCreateTimer(input: { anchorId: string; title: string; seconds: number }): Promise<void>;
  onCreatePoll(input: { anchorId: string; title: string; question: string; choices: string[] }): Promise<void>;
  onCreateLink(input: { anchorId: string; title: string; url: string }): Promise<void>;
  onPinCamera(anchorId: string): Promise<void>;
  onPinMicrophone(anchorId: string): Promise<void>;
  onShareScreen(anchorId: string): Promise<void>;
  onRemove(objectId: string): Promise<void>;
  onStopShare(objectId: string): Promise<void>;
  onControl(objectId: string, action: "play" | "pause" | "mute" | "unmute" | "seek", positionSeconds?: number): Promise<void>;
  onModerate(objectId: string, action: "approve" | "reject"): Promise<void>;
}) {
  const [selectedAnchor, setSelectedAnchor] = useState(manifest.wallAnchors[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [busy, setBusy] = useState("");
  const objectsByAnchor = useMemo(() => {
    const groups = new Map<string, WallObject[]>();
    for (const object of wallObjects) {
      groups.set(object.wallAnchorId, [...(groups.get(object.wallAnchorId) ?? []), object]);
    }
    return groups;
  }, [wallObjects]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    try {
      await action();
    } finally {
      setBusy("");
    }
  }

  async function submitFile() {
    if (!file) return;
    const title = fileTitle.trim() || file.name;
    await run("file", async () => {
      await onCreateFile({
        anchorId: selectedAnchor,
        file,
        title,
        altText: altText.trim() || title
      });
      setFile(null);
      setFileTitle("");
      setAltText("");
    });
  }

  async function submitNote() {
    const text = noteText.trim();
    if (!text) return;
    await run("note", async () => {
      await onCreateNote({ anchorId: selectedAnchor, title: text.slice(0, 60), text });
      setNoteText("");
    });
  }

  async function submitTimer() {
    await run("timer", async () => {
      await onCreateTimer({ anchorId: selectedAnchor, title: `${timerMinutes} minute timer`, seconds: Math.max(1, timerMinutes) * 60 });
    });
  }

  async function submitPoll() {
    const question = pollQuestion.trim();
    if (!question) return;
    await run("poll", async () => {
      await onCreatePoll({ anchorId: selectedAnchor, title: question.slice(0, 60), question, choices: ["Yes", "No", "Unsure"] });
      setPollQuestion("");
    });
  }

  async function submitLink() {
    const url = linkUrl.trim();
    if (!url) return;
    let title = url;
    try {
      title = new URL(url).hostname;
    } catch {
      title = url;
    }
    await run("link", async () => {
      await onCreateLink({ anchorId: selectedAnchor, title, url });
      setLinkUrl("");
    });
  }

  return (
    <section className="stack" aria-label="Wall objects">
      <div>
        <strong>Wall objects</strong>
        <p className="small">{loading ? "Loading wall state..." : `${wallObjects.length} active wall object(s)`}</p>
      </div>

      <label>
        Anchor
        <select value={selectedAnchor} onChange={(event) => setSelectedAnchor(event.target.value)}>
          {manifest.wallAnchors.map((anchor) => (
            <option key={anchor.id} value={anchor.id}>
              {anchor.label}
            </option>
          ))}
        </select>
      </label>

      {canCreate ? (
        <div className="stack wall-create-panel">
          <div className="stack">
            <label>
              File
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/webm"
                onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
              />
            </label>
            <label>
              Title
              <input value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} placeholder={file?.name ?? "Lesson media"} />
            </label>
            <label>
              Alt text
              <input value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Describe the media" />
            </label>
            <button type="button" className="secondary" disabled={!file || Boolean(busy)} onClick={submitFile}>
              {busy === "file" ? "Adding..." : "Add file"}
            </button>
          </div>

          <div className="cluster">
            <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => run("camera", () => onPinCamera(selectedAnchor))}>
              Pin camera
            </button>
            <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => run("mic", () => onPinMicrophone(selectedAnchor))}>
              Pin mic
            </button>
            <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => run("screen", () => onShareScreen(selectedAnchor))}>
              Share screen
            </button>
          </div>

          <label>
            Note
            <input value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Pinned note" />
          </label>
          <button type="button" className="secondary" disabled={!noteText.trim() || Boolean(busy)} onClick={submitNote}>
            Add note
          </button>

          <div className="split">
            <label>
              Timer minutes
              <input type="number" min={1} max={120} value={timerMinutes} onChange={(event) => setTimerMinutes(Number(event.target.value))} />
            </label>
            <button type="button" className="secondary" disabled={Boolean(busy)} onClick={submitTimer}>
              Add timer
            </button>
          </div>

          <label>
            Poll
            <input value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Poll question" />
          </label>
          <button type="button" className="secondary" disabled={!pollQuestion.trim() || Boolean(busy)} onClick={submitPoll}>
            Add poll
          </button>

          <label>
            Web resource
            <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://example.edu/resource" />
          </label>
          <button type="button" className="secondary" disabled={!linkUrl.trim() || Boolean(busy)} onClick={submitLink}>
            Add link
          </button>
        </div>
      ) : (
        <p className="small">Wall creation is teacher-controlled in this room.</p>
      )}

      <ul className="anchor-list">
        {manifest.wallAnchors.map((anchor) => {
          const objects = objectsByAnchor.get(anchor.id) ?? [];
          return (
            <li key={anchor.id} className="anchor-item">
              <span>{anchor.label}</span>
              <span className="small">
                {objects.length} object(s) · accepts {(anchor.metadata.accepts as string[] | undefined)?.slice(0, 4).join(", ") ?? "wall objects"}
              </span>
              {objects.map((object) => (
                <WallObjectCard
                  key={object.id}
                  object={object}
                  compact
                  canManage={canManage}
                  assetUrl={assetUrls[object.id]}
                  videoStream={wallMediaStreams[object.id]?.videoStream}
                  audioStream={wallMediaStreams[object.id]?.audioStream}
                  onRemove={(objectId) => void onRemove(objectId)}
                  onStopShare={(objectId) => void onStopShare(objectId)}
                  onControl={(objectId, action, positionSeconds) => void onControl(objectId, action, positionSeconds)}
                  onModerate={(objectId, action) => void onModerate(objectId, action)}
                />
              ))}
            </li>
          );
        })}
      </ul>

      {error ? <div className="alert">{error}</div> : null}
      <p className="small">Room {roomId} · signed wall media as {identity.displayName}</p>
    </section>
  );
}
