"use client";

import { useState, type FormEvent } from "react";
import type { RoomManifest, RoomObject, RoomObjectCategory, RoomObjectTemplate } from "@3dspace/contracts";
import { HudCard } from "./HudCard";
import {
  isRoomObjectTemplatePlaceable,
  isRoomObjectTemplateSelectableInV1,
  ROOM_OBJECT_HERO_SLUG
} from "../lib/roomObjectInteraction";

const ROOM_OBJECT_UPLOAD_CATEGORIES: RoomObjectCategory[] = ["math", "science", "geography", "ela", "art", "custom"];

export function RoomObjectsToolbar({
  templates,
  objects,
  roomTypeLabel,
  manifest,
  localAvatarPosition,
  localAvatarYaw,
  loading,
  error,
  selectedObjectId,
  onSelectObject,
  onInstantiate,
  onRemove,
  onDeleteTemplate,
  roomObjectsReady,
  gateSyncing,
  customUploadsEnabled,
  onUpload
}: {
  templates: RoomObjectTemplate[];
  objects: RoomObject[];
  roomTypeLabel: string;
  manifest: RoomManifest;
  localAvatarPosition: { x: number; y: number; z: number };
  localAvatarYaw: number;
  loading: boolean;
  error: string;
  selectedObjectId: string | null;
  onSelectObject(objectId: string | null): void;
  onInstantiate(templateId: string): Promise<void>;
  onRemove(objectId: string): Promise<void>;
  onDeleteTemplate(templateId: string): Promise<void>;
  roomObjectsReady: boolean;
  gateSyncing: boolean;
  customUploadsEnabled: boolean;
  onUpload(input: {
    file: File;
    thumbnailFile: File;
    displayName: string;
    category: RoomObjectCategory;
    description: string;
    license: string;
    attribution: string;
  }): Promise<void>;
}) {
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [uploadDisplayName, setUploadDisplayName] = useState("");
  const [uploadCategory, setUploadCategory] = useState<RoomObjectCategory>("custom");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadLicense, setUploadLicense] = useState("CC-BY");
  const [uploadAttribution, setUploadAttribution] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const catalog = [...templates].sort((left, right) => {
    if (left.slug === ROOM_OBJECT_HERO_SLUG) return -1;
    if (right.slug === ROOM_OBJECT_HERO_SLUG) return 1;
    return left.displayName.localeCompare(right.displayName);
  });

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadFile) {
      setUploadError("Select a .glb file to upload.");
      return;
    }
    if (!thumbnailFile) {
      setUploadError("Select a PNG thumbnail.");
      return;
    }
    if (!uploadDisplayName.trim()) {
      setUploadError("Enter a display name for the object.");
      return;
    }
    if (!uploadAttribution.trim()) {
      setUploadError("Attribution is required for custom room objects.");
      return;
    }
    if (!uploadFile.name.toLowerCase().endsWith(".glb")) {
      setUploadError("Room object assets must be uploaded as .glb files.");
      return;
    }
    if (!(thumbnailFile.type === "image/png" || thumbnailFile.name.toLowerCase().endsWith(".png"))) {
      setUploadError("Room object thumbnails must be PNG files.");
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      await onUpload({
        file: uploadFile,
        thumbnailFile,
        displayName: uploadDisplayName.trim(),
        category: uploadCategory,
        description: uploadDescription.trim(),
        license: uploadLicense.trim(),
        attribution: uploadAttribution.trim()
      });
      setUploadFile(null);
      setThumbnailFile(null);
      setUploadDisplayName("");
      setUploadCategory("custom");
      setUploadDescription("");
      setUploadLicense("CC-BY");
      setUploadAttribution("");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Unable to upload room object.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <HudCard
      title="Objects"
      badge={loading ? "…" : objects.length}
      ariaLabel="Room objects"
      defaultCollapsed
      forceExpanded={Boolean(selectedObjectId)}
    >
        {error ? <p className="room-object-toolbar__error">{error}</p> : null}
        {uploadError ? <p className="room-object-toolbar__error">{uploadError}</p> : null}
        {gateSyncing ? (
          <p className="room-object-toolbar__hint">Turning on 3D manipulatives and custom uploads for this room…</p>
        ) : null}
        {!roomObjectsReady && !gateSyncing ? (
          <p className="room-object-toolbar__hint">Manipulatives are not enabled for this room yet.</p>
        ) : null}
        {roomObjectsReady ? (
        <>
        <div className="room-object-toolbar-card">
          <span className="room-object-toolbar__heading">Catalog</span>
          {catalog.length === 0 ? (
            <p className="room-object-toolbar__empty">No catalog items are available for {roomTypeLabel.toLowerCase()} rooms yet.</p>
          ) : (
            <ul className="room-object-toolbar__catalog">
              {catalog.map((template) => {
                const placeable = isRoomObjectTemplatePlaceable(template);
                const selectable = isRoomObjectTemplateSelectableInV1(template);
                const isCustom = template.source === "custom";
                const placedCount = objects.filter((object) => object.templateId === template.id).length;
                return (
                  <li
                    key={template.id}
                    className={`room-object-toolbar__item${selectable ? "" : " room-object-coming-soon"}`}
                    data-testid={`room-object-catalog-${template.slug}`}
                  >
                    <div className="room-object-toolbar__thumb-wrap">
                      {template.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={template.thumbnailUrl} alt="" className="room-object-toolbar__thumb" />
                      ) : (
                        <span className="room-object-toolbar__thumb-fallback" aria-hidden="true">
                          {template.category.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="room-object-toolbar__copy">
                      <span className="room-object-toolbar__name">{template.displayName}</span>
                      <span className="room-object-toolbar__category">{template.category}</span>
                      <p className="room-object-toolbar__desc">{template.description}</p>
                    </div>
                    {selectable ? (
                      <div className="room-object-toolbar__catalog-actions">
                        <button
                          type="button"
                          className="hud-btn"
                          data-testid={`room-object-place-${template.slug}`}
                          disabled={Boolean(placingId) || Boolean(deletingTemplateId) || !placeable}
                          onClick={() => {
                            setPlacingId(template.id);
                            void onInstantiate(template.id).finally(() => setPlacingId(null));
                          }}
                        >
                          {placingId === template.id ? "Placing…" : "Place"}
                        </button>
                        {isCustom ? (
                          <button
                            type="button"
                            className="hud-btn room-object-toolbar__delete-template"
                            data-testid={`room-object-delete-template-${template.slug}`}
                            disabled={Boolean(placingId) || Boolean(deletingTemplateId)}
                            onClick={() => {
                              const copy =
                                placedCount > 0
                                  ? `Remove "${template.displayName}" from your class catalog and delete ${placedCount} placed copy${placedCount === 1 ? "" : "ies"} in this room?`
                                  : `Remove "${template.displayName}" from your class catalog?`;
                              if (!window.confirm(copy)) return;
                              setDeletingTemplateId(template.id);
                              void onDeleteTemplate(template.id).finally(() => setDeletingTemplateId(null));
                            }}
                          >
                            {deletingTemplateId === template.id ? "Deleting…" : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="room-object-toolbar__soon">Coming soon</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="room-object-toolbar-card">
          <span className="room-object-toolbar__heading">Active in room</span>
          {objects.length === 0 ? (
            <p className="room-object-toolbar__empty">No objects placed yet.</p>
          ) : (
            <ul className="room-object-toolbar__active">
              {objects.map((object) => (
                <li key={object.id} className="room-object-toolbar__active-row">
                  <button
                    type="button"
                    className={`room-object-toolbar__inspect${selectedObjectId === object.id ? " room-object-toolbar__inspect--active" : ""}`}
                    onClick={() => onSelectObject(selectedObjectId === object.id ? null : object.id)}
                  >
                    {object.displayName}
                    {object.status === "locked" ? (
                      <span className="room-object-toolbar__locked" title="Locked in place">
                        🔒
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="hud-btn room-object-toolbar__remove"
                    onClick={() => void onRemove(object.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {customUploadsEnabled ? (
          <div className="room-object-toolbar-card" data-testid="room-object-upload-panel">
            <span className="room-object-toolbar__heading">Upload .glb</span>
            <form className="room-object-toolbar__upload-form" onSubmit={(event) => void handleUploadSubmit(event)}>
              <label className="room-object-toolbar__field">
                <span>Model (.glb)</span>
                <input
                  type="file"
                  accept=".glb,model/gltf-binary"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="room-object-toolbar__field">
                <span>Thumbnail (PNG)</span>
                <input
                  type="file"
                  accept=".png,image/png"
                  onChange={(event) => setThumbnailFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="room-object-toolbar__field">
                <span>Display name</span>
                <input value={uploadDisplayName} onChange={(event) => setUploadDisplayName(event.target.value)} maxLength={120} />
              </label>
              <label className="room-object-toolbar__field">
                <span>Category</span>
                <select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value as RoomObjectCategory)}>
                  {ROOM_OBJECT_UPLOAD_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="room-object-toolbar__field">
                <span>Description</span>
                <textarea
                  value={uploadDescription}
                  onChange={(event) => setUploadDescription(event.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </label>
              <label className="room-object-toolbar__field">
                <span>License</span>
                <input value={uploadLicense} onChange={(event) => setUploadLicense(event.target.value)} maxLength={60} />
              </label>
              <label className="room-object-toolbar__field">
                <span>Attribution</span>
                <input value={uploadAttribution} onChange={(event) => setUploadAttribution(event.target.value)} maxLength={240} />
              </label>
              <button type="submit" className="hud-btn room-object-toolbar__upload-btn" disabled={uploading}>
                {uploading ? "Uploading…" : "Upload .glb"}
              </button>
            </form>
          </div>
        ) : null}
        </>
        ) : null}
    </HudCard>
  );
}
