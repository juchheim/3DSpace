"use client";

import { useEffect, useState } from "react";
import type { RoomManifest } from "@3dspace/contracts";
import { floorYFromZ } from "@3dspace/room-engine";
import { aiHostHubPlacementPosition } from "../lib/useAiWorldHost";
import type { useAiWorldHost } from "../lib/useAiWorldHost";
import type { BuildPiece } from "@3dspace/contracts";

type AiWorldHostController = ReturnType<typeof useAiWorldHost>;

export function AiWorldHostControls({
  controller,
  manifest,
  buildPieces,
  localAvatarPosition,
  localAvatarRotationY
}: {
  controller: AiWorldHostController;
  manifest: RoomManifest;
  buildPieces: BuildPiece[];
  localAvatarPosition: { x: number; y: number; z: number } | null;
  localAvatarRotationY: number;
}) {
  const { host, busy, loading, error, placementMode, actions, beginSummonPlacement, beginReposition, cancelPlacement } =
    controller;
  const [summonOpen, setSummonOpen] = useState(false);
  const [displayName, setDisplayName] = useState(host?.displayName ?? "Chip");
  const [deleteFilesOnDismiss, setDeleteFilesOnDismiss] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(host?.displayName ?? "");

  useEffect(() => {
    if (host) {
      setDisplayName(host.displayName);
      setRenameValue(host.displayName);
      setSummonOpen(false);
    }
  }, [host]);

  const placing = placementMode !== "idle";
  const hubPosition = aiHostHubPlacementPosition(
    manifest,
    buildPieces,
    floorYFromZ(manifest, 0)
  );

  return (
    <section className="hud-card ai-world-host-card" aria-label="World Host">
      <h3 className="hud-heading">World Host</h3>
      <div className="hud-card-body ai-world-host-card__body">
        {loading && !host && !placing ? (
          <p className="ai-world-host-card__hint">Loading guide…</p>
        ) : null}
        {error ? (
          <p className="ai-world-host-card__error" role="alert">
            {error}
          </p>
        ) : null}
        {placing ? (
          <div className="ai-world-host-card__placement">
            <p>
              {placementMode === "summon"
                ? "Click the ground to place your guide, then confirm."
                : "Click the ground to move the guide, then confirm."}
            </p>
            <div className="ai-world-host-card__actions">
              <button
                type="button"
                className="ai-world-host-card__button ai-world-host-card__button--primary"
                disabled={busy || !controller.ghost}
                onClick={() => {
                  if (placementMode === "reposition") {
                    void actions.confirmPlacement();
                    return;
                  }
                  if (!controller.ghost) return;
                  void actions
                    .summon(displayName.trim(), controller.ghost.position, controller.ghost.rotationY)
                    .then(() => setSummonOpen(false));
                }}
              >
                Confirm placement
              </button>
              <button
                type="button"
                className="ai-world-host-card__button ai-world-host-card__button--ghost"
                disabled={busy}
                onClick={() => {
                  cancelPlacement();
                  setSummonOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : host ? (
          <HostActiveCard
            host={host}
            busy={busy}
            renameOpen={renameOpen}
            renameValue={renameValue}
            deleteFilesOnDismiss={deleteFilesOnDismiss}
            onRenameOpen={() => setRenameOpen(true)}
            onRenameValue={setRenameValue}
            onRenameCancel={() => {
              setRenameOpen(false);
              setRenameValue(host.displayName);
            }}
            onRenameSave={() => {
              void actions.rename(renameValue).then(() => setRenameOpen(false));
            }}
            onReposition={beginReposition}
            onDismiss={() => {
              const keepFilesNote = deleteFilesOnDismiss ? " Study files will be deleted." : " Study files will stay in this room.";
              if (
                !window.confirm(
                  `Dismiss ${host.displayName}? The guide will disappear for everyone.${keepFilesNote}`
                )
              ) {
                return;
              }
              void actions.dismiss(deleteFilesOnDismiss);
            }}
            onDeleteFilesChange={setDeleteFilesOnDismiss}
          />
        ) : summonOpen ? (
          <div className="ai-world-host-card__summon">
            <p className="ai-world-host-card__hint">Name your guide, then choose where to place them.</p>
            <label className="ai-world-host-card__label">
              Guide name
              <input
                type="text"
                className="ai-world-host-card__input"
                value={displayName}
                maxLength={24}
                disabled={busy}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <div className="ai-world-host-card__actions">
              <button
                type="button"
                className="ai-world-host-card__button ai-world-host-card__button--primary"
                disabled={busy || displayName.trim().length < 3 || !localAvatarPosition}
                onClick={() => {
                  if (!localAvatarPosition) return;
                  void actions
                    .summon(displayName.trim(), localAvatarPosition, localAvatarRotationY)
                    .then(() => setSummonOpen(false));
                }}
              >
                Place here
              </button>
              <button
                type="button"
                className="ai-world-host-card__button ai-world-host-card__button--ghost"
                disabled={busy || displayName.trim().length < 3}
                onClick={() => void actions.summon(displayName.trim(), hubPosition, 0).then(() => setSummonOpen(false))}
              >
                Place at hub
              </button>
              <button
                type="button"
                className="ai-world-host-card__button ai-world-host-card__button--ghost"
                disabled={busy || displayName.trim().length < 3}
                onClick={() => beginSummonPlacement({ position: hubPosition, rotationY: 0 })}
              >
                Place on ground…
              </button>
            </div>
            <button
              type="button"
              className="ai-world-host-card__button ai-world-host-card__button--ghost"
              disabled={busy}
              onClick={() => setSummonOpen(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="ai-world-host-card__empty">
            <p className="ai-world-host-card__hint">No guide in this room yet.</p>
            <button
              type="button"
              className="ai-world-host-card__button ai-world-host-card__button--primary"
              disabled={busy || loading}
              onClick={() => setSummonOpen(true)}
            >
              Summon guide
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function HostActiveCard({
  host,
  busy,
  renameOpen,
  renameValue,
  deleteFilesOnDismiss,
  onRenameOpen,
  onRenameValue,
  onRenameCancel,
  onRenameSave,
  onReposition,
  onDismiss,
  onDeleteFilesChange
}: {
  host: { displayName: string };
  busy: boolean;
  renameOpen: boolean;
  renameValue: string;
  deleteFilesOnDismiss: boolean;
  onRenameOpen(): void;
  onRenameValue(value: string): void;
  onRenameCancel(): void;
  onRenameSave(): void;
  onReposition(): void;
  onDismiss(): void;
  onDeleteFilesChange(value: boolean): void;
}) {
  return (
    <div className="ai-world-host-card__active">
      <p className="ai-world-host-card__name">
        <strong>{host.displayName}</strong>
        <span className="ai-world-host-card__badge">AI guide</span>
      </p>
      {renameOpen ? (
        <div className="ai-world-host-card__rename">
          <input
            type="text"
            className="ai-world-host-card__input"
            value={renameValue}
            maxLength={24}
            disabled={busy}
            onChange={(event) => onRenameValue(event.target.value)}
          />
          <div className="ai-world-host-card__actions">
            <button
              type="button"
              className="ai-world-host-card__button ai-world-host-card__button--primary"
              disabled={busy || renameValue.trim().length < 3}
              onClick={onRenameSave}
            >
              Save name
            </button>
            <button type="button" className="ai-world-host-card__button ai-world-host-card__button--ghost" disabled={busy} onClick={onRenameCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="ai-world-host-card__actions">
          <button type="button" className="ai-world-host-card__button ai-world-host-card__button--ghost" disabled={busy} onClick={onRenameOpen}>
            Rename
          </button>
          <button type="button" className="ai-world-host-card__button ai-world-host-card__button--ghost" disabled={busy} onClick={onReposition}>
            Reposition
          </button>
        </div>
      )}
      <label className="ai-world-host-card__checkbox">
        <input
          type="checkbox"
          checked={deleteFilesOnDismiss}
          disabled={busy}
          onChange={(event) => onDeleteFilesChange(event.target.checked)}
        />
        Delete study files when dismissing
      </label>
      <button type="button" className="ai-world-host-card__button ai-world-host-card__button--ghost ai-world-host-card__dismiss" disabled={busy} onClick={onDismiss}>
        Dismiss guide
      </button>
    </div>
  );
}
