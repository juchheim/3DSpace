"use client";

import { useEffect, useState } from "react";
import type { RoomAiHost, RoomManifest } from "@3dspace/contracts";
import { floorYFromZ } from "@3dspace/room-engine";
import { aiHostPlacementInFrontOfAvatar } from "../lib/useAiWorldHost";
import type { useAiWorldHost } from "../lib/useAiWorldHost";
import type { BuildPiece } from "@3dspace/contracts";
import { HudCard } from "./HudCard";

type AiWorldHostController = ReturnType<typeof useAiWorldHost>;

type AvatarVariant = RoomAiHost["avatar"];

const AVATAR_OPTIONS: { value: AvatarVariant; label: string; hint: string }[] = [
  { value: "model-lp", label: "MODEL-LP", hint: "Red-and-steel utility mech" },
  { value: "retro-robot", label: "Retro Robot", hint: "Classic tin-rover guide" },
  { value: "sprocket-bot", label: "Sprocket-Bot", hint: "Steampunk brass robot" }
];

function AvatarPicker({
  value,
  disabled,
  onChange
}: {
  value: AvatarVariant;
  disabled: boolean;
  onChange(next: AvatarVariant): void;
}) {
  return (
    <div className="ai-world-host-card__avatar-picker" role="radiogroup" aria-label="Guide appearance">
      {AVATAR_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={option.hint}
            className={`ai-world-host-card__button ${
              active ? "ai-world-host-card__button--primary" : "ai-world-host-card__button--ghost"
            }`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

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
  const {
    host,
    busy,
    loading,
    error,
    placementMode,
    pendingAvatar,
    setPendingAvatar,
    hasStudyFiles,
    studyFiles,
    setPanelOpen,
    actions,
    beginReposition,
    cancelPlacement
  } = controller;
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
  const fallbackY = floorYFromZ(manifest, 0);

  return (
    <HudCard
      title="World Host"
      ariaLabel="World Host"
      defaultCollapsed
      forceExpanded={placing || summonOpen || renameOpen}
      hasAlert={Boolean(error)}
      badge={host ? host.displayName : hasStudyFiles ? studyFiles.length : undefined}
    >
      <div className="ai-world-host-card__body">
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
                    .summon(displayName.trim(), controller.ghost.position, controller.ghost.rotationY, pendingAvatar)
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
            onSetAvatar={(next) => {
              void actions.setAvatar(next);
            }}
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
              const keepFilesNote = deleteFilesOnDismiss
                ? " Study files and their chat will be deleted."
                : " Study files and chat history will stay in this room.";
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
            <p className="ai-world-host-card__hint">Name your guide, then place them in front of you.</p>
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
            <div className="ai-world-host-card__label">
              <span>Appearance</span>
              <AvatarPicker value={pendingAvatar} disabled={busy} onChange={setPendingAvatar} />
            </div>
            <div className="ai-world-host-card__actions">
              <button
                type="button"
                className="ai-world-host-card__button ai-world-host-card__button--primary"
                disabled={busy || displayName.trim().length < 3 || !localAvatarPosition}
                onClick={() => {
                  if (!localAvatarPosition) return;
                  const placement = aiHostPlacementInFrontOfAvatar(
                    manifest,
                    localAvatarPosition,
                    localAvatarRotationY,
                    buildPieces,
                    fallbackY
                  );
                  void actions
                    .summon(displayName.trim(), placement.position, placement.rotationY, pendingAvatar)
                    .then(() => setSummonOpen(false));
                }}
              >
                Place in front of me
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
            {hasStudyFiles ? (
              <p className="ai-world-host-card__hint">
                {studyFiles.length} study file{studyFiles.length === 1 ? "" : "s"} remain in this room. Chat history
                is kept until you delete files.
              </p>
            ) : null}
            <div className="ai-world-host-card__actions">
              <button
                type="button"
                className="ai-world-host-card__button ai-world-host-card__button--primary"
                disabled={busy || loading}
                onClick={() => setSummonOpen(true)}
              >
                Summon guide
              </button>
              {hasStudyFiles ? (
                <button
                  type="button"
                  className="ai-world-host-card__button ai-world-host-card__button--ghost"
                  onClick={() => setPanelOpen(true)}
                >
                  Open study files
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </HudCard>
  );
}

function HostActiveCard({
  host,
  busy,
  onSetAvatar,
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
  host: { displayName: string; avatar: AvatarVariant };
  busy: boolean;
  onSetAvatar(next: AvatarVariant): void;
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
      <div className="ai-world-host-card__label">
        <span>Appearance</span>
        <AvatarPicker value={host.avatar} disabled={busy} onChange={onSetAvatar} />
      </div>
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
        <span className="ai-world-host-card__checkbox-label">Delete study files on dismiss</span>
      </label>
      <button type="button" className="ai-world-host-card__button ai-world-host-card__button--ghost ai-world-host-card__dismiss" disabled={busy} onClick={onDismiss}>
        Dismiss guide
      </button>
    </div>
  );
}
