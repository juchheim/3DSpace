"use client";

import { useEffect, useState } from "react";
import type { RoomManifest, WallAttachment } from "@3dspace/contracts";
import { createAttachment, createAttachmentDownload, listAttachments } from "../lib/api";
import type { ApiIdentity } from "../lib/identity";

export function AnchorPanel({ identity, roomId, manifest }: { identity: ApiIdentity; roomId: string; manifest: RoomManifest }) {
  const [selectedAnchor, setSelectedAnchor] = useState(manifest.wallAnchors[0]?.id ?? "");
  const [kind, setKind] = useState<"image" | "video" | "audio">("image");
  const [fileName, setFileName] = useState("lesson-board.png");
  const [attachments, setAttachments] = useState<WallAttachment[]>([]);
  const [uploadUrl, setUploadUrl] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    setAttachments(await listAttachments(identity, roomId));
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [roomId, identity.userId]);

  async function prepareUpload() {
    setError("");
    try {
      const response = await createAttachment(identity, roomId, {
        wallAnchorId: selectedAnchor,
        kind,
        fileName,
        contentType: kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "audio/mpeg"
      });
      setUploadUrl(response.upload.url);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to prepare upload.");
    }
  }

  async function prepareDownload(attachmentId: string) {
    setError("");
    try {
      const response = await createAttachmentDownload(identity, roomId, attachmentId);
      setDownloadUrl(response.download.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to prepare download.");
    }
  }

  return (
    <section className="stack" aria-label="Wall attachment anchors">
      <strong>Wall anchors</strong>
      <ul className="anchor-list">
        {manifest.wallAnchors.map((anchor) => (
          <li key={anchor.id} className="anchor-item">
            <span>{anchor.label}</span>
            <span className="small">{anchor.width}m x {anchor.height}m · accepts {(anchor.metadata.accepts as string[] | undefined)?.join(", ") ?? "future media"}</span>
          </li>
        ))}
      </ul>

      <div className="stack">
        <label>
          Anchor
          <select value={selectedAnchor} onChange={(event) => setSelectedAnchor(event.target.value)}>
            {manifest.wallAnchors.map((anchor) => (
              <option key={anchor.id} value={anchor.id}>{anchor.label}</option>
            ))}
          </select>
        </label>
        <label>
          Kind
          <select value={kind} onChange={(event) => setKind(event.target.value as "image" | "video" | "audio")}>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
          </select>
        </label>
        <label>
          File name
          <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
        </label>
        <button className="secondary" onClick={prepareUpload}>Prepare signed upload</button>
      </div>

      {uploadUrl ? <p className="small">Upload target ready: {uploadUrl.slice(0, 72)}...</p> : null}
      {downloadUrl ? <p className="small">Download target ready: {downloadUrl.slice(0, 72)}...</p> : null}
      {attachments.length > 0 ? (
        <div className="stack">
          <p className="small">{attachments.length} attachment record(s) prepared.</p>
          {attachments.slice(0, 3).map((attachment) => (
            <button key={attachment.id} className="ghost" onClick={() => prepareDownload(attachment.id)}>
              Prepare download for {attachment.fileName}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <div className="alert">{error}</div> : null}
    </section>
  );
}
