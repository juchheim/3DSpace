"use client";

import { useMemo, useState } from "react";
import type { ClassroomAction, ClassroomBoardAccessGrant, ClassroomHelpRequest, RoomManifest } from "@3dspace/contracts";
import {
  allowedBoardGrantTypesForAnchor,
  BOARD_GRANT_PRESETS,
  BOARD_GRANT_TYPE_OPTIONS,
  isSupportedBoardGrantType,
  summarizeBoardGrantTypes,
  type SupportedBoardGrantType
} from "../lib/classroomGrants";

function initialGrantTypes(
  manifest: RoomManifest,
  anchorId: string,
  activeGrants: ClassroomBoardAccessGrant[]
) {
  const allowedTypes = allowedBoardGrantTypesForAnchor(manifest, anchorId);
  const activeTypes = (activeGrants[0]?.allowedObjectTypes ?? [])
    .filter(isSupportedBoardGrantType)
    .filter((type) => allowedTypes.includes(type));
  return activeTypes.length > 0 ? activeTypes : allowedTypes;
}

export function BoardAccessGrantControls({
  userId,
  displayName,
  helpRequest,
  activeGrants,
  manifest,
  onRunAction
}: {
  userId: string;
  displayName: string;
  helpRequest?: ClassroomHelpRequest | null | undefined;
  activeGrants: ClassroomBoardAccessGrant[];
  manifest: RoomManifest;
  onRunAction(action: ClassroomAction): Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [selectedAnchorId, setSelectedAnchorId] = useState(
    () => activeGrants[0]?.wallAnchorId ?? manifest.wallAnchors[0]?.id ?? ""
  );
  const [selectedGrantTypes, setSelectedGrantTypes] = useState<SupportedBoardGrantType[]>(() =>
    initialGrantTypes(
      manifest,
      activeGrants[0]?.wallAnchorId ?? manifest.wallAnchors[0]?.id ?? "",
      activeGrants
    )
  );

  const grantTypesForAnchor = useMemo(
    () => (selectedAnchorId ? allowedBoardGrantTypesForAnchor(manifest, selectedAnchorId) : []),
    [manifest, selectedAnchorId]
  );

  async function run(label: string, action: ClassroomAction) {
    setBusy(label);
    try {
      await onRunAction(action);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      {activeGrants.length > 0 ? (
        <div className="classroom-grant-presets">
          {activeGrants.map((grant) => (
            <div key={grant.id} className="classroom-active-grant">
              <div className="classroom-help-meta">
                <span className="classroom-help-name">
                  {manifest.wallAnchors.find((anchor) => anchor.id === grant.wallAnchorId)?.label ?? "Selected board"}
                </span>
                <span className="tag tag-board">active</span>
              </div>
              <p className="classroom-help-note">{summarizeBoardGrantTypes(grant.allowedObjectTypes)}</p>
              <button
                type="button"
                className="hud-btn"
                disabled={busy === `revoke-${grant.id}`}
                data-testid={`revoke-board-${grant.id}`}
                onClick={() => void run(`revoke-${grant.id}`, { type: "revoke-board-access", grantId: grant.id })}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {manifest.wallAnchors.length > 0 ? (
        <div className="classroom-grant-panel">
          <div className="classroom-grant-header">
            <span>{activeGrants.length > 0 ? "Replace board access" : "Grant board access"}</span>
            <span>{selectedGrantTypes.length} selected</span>
          </div>
          <select
            className="anchor-select-compact"
            value={selectedAnchorId}
            aria-label={`Grant board for ${displayName}`}
            onChange={(event) => {
              const nextAnchorId = event.target.value;
              setSelectedAnchorId(nextAnchorId);
              setSelectedGrantTypes(allowedBoardGrantTypesForAnchor(manifest, nextAnchorId));
            }}
          >
            {manifest.wallAnchors.map((anchor) => (
              <option key={anchor.id} value={anchor.id}>
                {anchor.label}
              </option>
            ))}
          </select>
          {grantTypesForAnchor.length > 0 ? (
            <>
              <div className="classroom-grant-presets" role="group" aria-label={`Grant presets for ${displayName}`}>
                {BOARD_GRANT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="classroom-preset-btn"
                    onClick={() =>
                      setSelectedGrantTypes(grantTypesForAnchor.filter((type) => preset.includes.includes(type)))
                    }
                  >
                    <span className="classroom-preset-btn__label">{preset.label}</span>
                    <span className="classroom-preset-btn__description">{preset.description}</span>
                  </button>
                ))}
              </div>
              <div className="classroom-grant-types" role="group" aria-label={`Allowed share types for ${displayName}`}>
                {BOARD_GRANT_TYPE_OPTIONS.filter((option) => grantTypesForAnchor.includes(option.type)).map((option) => {
                  const checked = selectedGrantTypes.includes(option.type);
                  return (
                    <label key={option.type} className={`classroom-grant-option${checked ? " classroom-grant-option--checked" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const previous = selectedGrantTypes;
                          const next = event.target.checked
                            ? [...previous, option.type]
                            : previous.filter((entry) => entry !== option.type);
                          setSelectedGrantTypes([...new Set(next)]);
                        }}
                      />
                      <span className="classroom-grant-option__body">
                        <span className="classroom-grant-option__label">{option.label}</span>
                        {option.description ? (
                          <span className="classroom-grant-option__description">{option.description}</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="hud-btn"
            disabled={busy === `grant-${userId}` || !selectedAnchorId || selectedGrantTypes.length === 0}
            data-testid={`grant-board-${userId}`}
            onClick={async () => {
              if (!selectedAnchorId || selectedGrantTypes.length === 0) return;
              if (helpRequest?.status === "raised") {
                await run(helpRequest.id, { type: "acknowledge-help", requestId: helpRequest.id });
              }
              await run(`grant-${userId}`, {
                type: "grant-board-access",
                userId,
                wallAnchorId: selectedAnchorId,
                requestId: helpRequest?.id,
                allowedObjectTypes: selectedGrantTypes
              });
            }}
          >
            {activeGrants.length > 0 ? "Update grant" : "Grant board"}
          </button>
        </div>
      ) : (
        <p className="small">This room does not have any wall boards to grant.</p>
      )}
      {selectedAnchorId && grantTypesForAnchor.length === 0 ? (
        <p className="small">That board has no student-share actions enabled.</p>
      ) : null}
    </>
  );
}
