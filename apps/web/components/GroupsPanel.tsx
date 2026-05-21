"use client";

import { useMemo, useState } from "react";
import type { ClassroomAction, ClassroomGroup, ClassroomState, Role } from "@3dspace/contracts";
import type { ParticipantView } from "./RoomClient";
import { HudCard } from "./HudCard";

const GROUP_COLOR_PRESETS = [
  { label: "Coral", value: "#c0392b" },
  { label: "Blue", value: "#2980b9" },
  { label: "Teal", value: "#16a085" },
  { label: "Purple", value: "#8e44ad" },
  { label: "Orange", value: "#e67e22" },
  { label: "Indigo", value: "#2c3e80" }
];

function groupMemberNames(group: ClassroomGroup, participants: ParticipantView[]): string {
  if (group.memberUserIds.length === 0) return "No members";
  return group.memberUserIds
    .map((id) => participants.find((p) => p.id === id)?.displayName ?? id.slice(0, 8))
    .join(", ");
}

export function groupByUserId(state: ClassroomState | null | undefined): Map<string, ClassroomGroup> {
  const map = new Map<string, ClassroomGroup>();
  for (const group of state?.groups ?? []) {
    if (group.status !== "active") continue;
    for (const userId of group.memberUserIds) {
      map.set(userId, group);
    }
  }
  return map;
}

function boardLabelForGroup(group: ClassroomGroup, manifestAnchors?: Array<{ id: string; label: string }>) {
  if (!group.targetWallAnchorId) return "";
  return manifestAnchors?.find((anchor) => anchor.id === group.targetWallAnchorId)?.label ?? group.targetWallAnchorId;
}

export function GroupsPanel({
  role,
  state,
  loading,
  participants,
  currentUserId,
  positioningGroupId,
  podsEnabled,
  broadcastUserIds,
  podsAllowedInRoom,
  onRunAction,
  onEnterPositioningMode,
  onCancelPositioning,
  manifestAnchors
}: {
  role: Role;
  state: ClassroomState | null;
  loading: boolean;
  participants: ParticipantView[];
  currentUserId?: string | undefined;
  positioningGroupId: string;
  podsEnabled: boolean;
  broadcastUserIds: string[];
  podsAllowedInRoom: boolean;
  onRunAction(action: ClassroomAction): Promise<void>;
  onEnterPositioningMode(groupId: string): void;
  onCancelPositioning(): void;
  manifestAnchors?: Array<{ id: string; label: string }>;
}) {
  const [busy, setBusy] = useState("");
  const [groupLabel, setGroupLabel] = useState("");
  const [groupColor, setGroupColor] = useState(GROUP_COLOR_PRESETS[0]?.value ?? "#c0392b");
  const [assignGroupId, setAssignGroupId] = useState("");
  const [addUserIds, setAddUserIds] = useState<string[]>([]);

  const activeGroups = useMemo(
    () => (state?.groups ?? []).filter((g) => g.status === "active"),
    [state?.groups]
  );

  const currentGroup = useMemo(
    () => (state?.groups ?? []).find((g) => g.status === "active" && g.memberUserIds.includes(currentUserId ?? "")),
    [state?.groups, currentUserId]
  );

  const assignedUserIds = useMemo(
    () => new Set(activeGroups.flatMap((g) => g.memberUserIds)),
    [activeGroups]
  );

  const unassignedStudents = useMemo(
    () => participants.filter((p) => p.role === "student" && !assignedUserIds.has(p.id)),
    [participants, assignedUserIds]
  );

  const assignTarget = useMemo(
    () => activeGroups.find((g) => g.id === assignGroupId) ?? null,
    [activeGroups, assignGroupId]
  );
  const broadcastUserIdSet = useMemo(
    () => new Set(broadcastUserIds),
    [broadcastUserIds]
  );
  const positionedActiveGroups = useMemo(
    () => activeGroups.filter((group) => Boolean(group.targetPosition)),
    [activeGroups]
  );
  const hasPositionedGroups = positionedActiveGroups.length > 0;

  async function run(label: string, action: ClassroomAction) {
    setBusy(label);
    try {
      await onRunAction(action);
      return true;
    } catch {
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createGroup() {
    const label = groupLabel.trim();
    if (!label) return;
    const created = await run("create-group", {
      type: "create-group",
      label,
      color: groupColor,
      memberUserIds: [],
      status: "active"
    });
    if (created) setGroupLabel("");
  }

  async function addMembers() {
    if (!assignTarget || addUserIds.length === 0) return;
    const nextMembers = [...new Set([...assignTarget.memberUserIds, ...addUserIds])];
    const ok = await run(`assign-${assignGroupId}`, {
      type: "assign-group",
      groupId: assignGroupId,
      memberUserIds: nextMembers
    });
    if (ok) setAddUserIds([]);
  }

  async function removeMember(group: ClassroomGroup, userId: string) {
    await run(`remove-${group.id}-${userId}`, {
      type: "assign-group",
      groupId: group.id,
      memberUserIds: group.memberUserIds.filter((id) => id !== userId)
    });
  }

  if (role === "teacher") {
    return (
      <HudCard title="Groups" badge={loading ? "…" : activeGroups.length} ariaLabel="Classroom groups" defaultCollapsed={true}>
        <div className="classroom-check-create" data-testid="group-create-form">
          <label className="classroom-note-field">
            <span className="classroom-note-label">Group name</span>
            <input
              className="classroom-check-select"
              type="text"
              maxLength={80}
              placeholder="Group A"
              value={groupLabel}
              onChange={(event) => setGroupLabel(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void createGroup(); }}
            />
          </label>
          <div className="classroom-check-field">
            <span className="classroom-note-label">Color</span>
            <div className="group-color-presets" role="group" aria-label="Group color">
              {GROUP_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`group-color-swatch${groupColor === preset.value ? " group-color-swatch--selected" : ""}`}
                  style={{ background: preset.value }}
                  aria-label={preset.label}
                  aria-pressed={groupColor === preset.value}
                  onClick={() => setGroupColor(preset.value)}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="hud-btn"
            data-testid="create-group-button"
            disabled={busy === "create-group" || !groupLabel.trim()}
            onClick={() => void createGroup()}
          >
            Create group
          </button>
        </div>

        {podsAllowedInRoom ? (
          <div className="pod-toggle-row" data-testid="pod-toggle-row">
            <div>
              <div className="pod-toggle-row__label">
                <span>Pod audio</span>
                <span className={`pod-toggle-row__status${podsEnabled ? " pod-toggle-row__status--active" : ""}`}>{podsEnabled ? "On" : "Off"}</span>
              </div>
              <p className="pod-toggle-row__hint" title="Pods make group work quieter, not private.">
                {hasPositionedGroups ? "Quieter, not private." : "Position a group to enable pod audio."}
              </p>
            </div>
            <button
              type="button"
              className={`hud-btn hud-btn--pod-toggle${podsEnabled ? " hud-btn--pod-toggle-active" : ""}`}
              disabled={loading || busy === "toggle-pods" || !hasPositionedGroups}
              onClick={() => void run("toggle-pods", { type: "toggle-pods", enabled: !podsEnabled })}
            >
              {podsEnabled ? "Turn off" : "Turn on"}
            </button>
          </div>
        ) : null}

        {activeGroups.length > 0 ? (
          <div className="classroom-check-create">
            <div className="classroom-check-field">
              <span className="classroom-note-label">Add students to group</span>
              <select
                className="classroom-check-select"
                value={assignGroupId}
                aria-label="Select group"
                onChange={(event) => { setAssignGroupId(event.target.value); setAddUserIds([]); }}
              >
                <option value="" disabled>Select group…</option>
                {activeGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
            </div>
            {assignGroupId && unassignedStudents.length > 0 ? (
              <div className="classroom-grant-types" role="group" aria-label="Students to add">
                {unassignedStudents.map((p) => {
                  const checked = addUserIds.includes(p.id);
                  return (
                    <label key={p.id} className={`classroom-grant-option${checked ? " classroom-grant-option--checked" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setAddUserIds((current) =>
                            event.target.checked ? [...current, p.id] : current.filter((id) => id !== p.id)
                          )
                        }
                      />
                      <span className="classroom-grant-option__body">
                        <span className="classroom-grant-option__label">{p.displayName}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : assignGroupId && unassignedStudents.length === 0 ? (
              <p className="small">All students are assigned to a group.</p>
            ) : null}
            <button
              type="button"
              className="hud-btn"
              disabled={busy === `assign-${assignGroupId}` || !assignGroupId || addUserIds.length === 0}
              onClick={() => void addMembers()}
            >
              Add to group
            </button>
          </div>
        ) : null}

        {positioningGroupId ? (
          <div className="classroom-grant-panel" data-testid="positioning-banner">
            <div className="classroom-grant-header">
              <span>Positioning mode</span>
              <span>{activeGroups.find((g) => g.id === positioningGroupId)?.label ?? ""}</span>
            </div>
            <p className="classroom-help-note">Click anywhere in the 3D view or 2D map to place this group.</p>
            <button type="button" className="hud-btn" onClick={onCancelPositioning}>
              Cancel
            </button>
          </div>
        ) : null}

        {activeGroups.length === 0 ? <p className="small">No active groups.</p> : null}
        <ul className="classroom-help-list" role="list">
          {activeGroups.map((group) => {
            const isPositioned = Boolean(group.targetPosition && group.hold?.enabled);
            const isPodReady = Boolean(group.targetPosition);
            const isPositioning = positioningGroupId === group.id;
            return (
              <li key={group.id} className="classroom-help-item" data-testid={`group-${group.id}`}>
                <div className="classroom-help-meta">
                  <span className="classroom-help-name">
                    <span className="group-dot" style={{ background: group.color }} aria-hidden="true" />
                    {group.label}
                  </span>
                  <span className={`tag${isPositioned ? " active" : ""}`}>
                    {isPositioned ? "Locked" : `${group.memberUserIds.length} member${group.memberUserIds.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                {group.memberUserIds.length > 0 ? (
                  <ul className="classroom-check-responses" role="list" aria-label={`${group.label} members`}>
                    {group.memberUserIds.map((userId) => {
                      const participant = participants.find((p) => p.id === userId);
                      const name = participant?.displayName ?? userId.slice(0, 8);
                      const broadcastEnabled = broadcastUserIdSet.has(userId);
                      return (
                        <li key={userId} className="classroom-check-response" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <span>{name}</span>
                          <span className="pod-member-actions">
                            {podsAllowedInRoom && isPodReady ? (
                              <button
                                type="button"
                                className={`hud-btn${broadcastEnabled ? " hud-btn--active" : ""}`}
                                style={{ padding: "0.1rem 0.45rem", fontSize: "0.7rem" }}
                                disabled={busy === `broadcast-${userId}`}
                                aria-label={`${broadcastEnabled ? "Revoke" : "Grant"} broadcast for ${name}`}
                                onClick={() =>
                                  void run(`broadcast-${userId}`, {
                                    type: "set-student-broadcast",
                                    userId,
                                    enabled: !broadcastEnabled
                                  })
                                }
                              >
                                {broadcastEnabled ? "Revoke broadcast" : "Grant broadcast"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="hud-btn"
                              style={{ padding: "0.1rem 0.4rem", fontSize: "0.7rem" }}
                              disabled={busy === `remove-${group.id}-${userId}`}
                              aria-label={`Remove ${name} from ${group.label}`}
                              onClick={() => void removeMember(group, userId)}
                            >
                              ×
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="classroom-help-note">No members yet.</p>
                )}
                {podsAllowedInRoom && !isPodReady ? (
                  <p className="classroom-help-note">Position this group before broadcast can be granted.</p>
                ) : null}
                {boardLabelForGroup(group, manifestAnchors) ? (
                  <p className="classroom-help-note">Board: {boardLabelForGroup(group, manifestAnchors)}</p>
                ) : null}
                <div className="classroom-help-actions">
                  {isPositioned ? (
                    <button
                      type="button"
                      className="hud-btn"
                      disabled={busy === `unlock-${group.id}`}
                      data-testid={`unlock-group-${group.id}`}
                      onClick={() =>
                        void run(`unlock-${group.id}`, {
                          type: "update-group",
                          groupId: group.id,
                          targetPosition: null,
                          hold: { enabled: false, mode: "soft", radiusMeters: 2 }
                        })
                      }
                    >
                      Unlock
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="hud-btn"
                      disabled={isPositioning || group.memberUserIds.length === 0}
                      data-testid={`position-group-${group.id}`}
                      onClick={() => onEnterPositioningMode(group.id)}
                    >
                      Position
                    </button>
                  )}
                  <button
                    type="button"
                    className="hud-btn"
                    disabled={busy === `release-${group.id}`}
                    data-testid={`release-group-${group.id}`}
                    onClick={() => void run(`release-${group.id}`, { type: "release-group", groupId: group.id })}
                  >
                    Release
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </HudCard>
    );
  }

  return (
    <HudCard title="Group" badge={loading ? "…" : currentGroup?.label ?? "—"} ariaLabel="Your group" defaultCollapsed={true}>
      {currentGroup ? (
        <div className="classroom-grant-panel">
          <div className="classroom-grant-header">
            <span className="group-dot" style={{ background: currentGroup.color }} aria-hidden="true" />
            <span>{currentGroup.label}</span>
          </div>
          <p className="classroom-help-note">
            {currentGroup.memberUserIds.length} member{currentGroup.memberUserIds.length === 1 ? "" : "s"} in your group.
          </p>
          {boardLabelForGroup(currentGroup, manifestAnchors) ? (
            <p className="classroom-help-note">Board: {boardLabelForGroup(currentGroup, manifestAnchors)}</p>
          ) : null}
        </div>
      ) : (
        <p className="small">You have not been assigned to a group.</p>
      )}
    </HudCard>
  );
}
