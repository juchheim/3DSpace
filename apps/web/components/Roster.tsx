"use client";

import { useMemo } from "react";
import { HudCard } from "./HudCard";
import type { ClassroomAction, ClassroomBoardAccessGrant, ClassroomGroup, ClassroomHelpRequest, ClassroomState, Role, RoomManifest } from "@3dspace/contracts";
import type { ParticipantView } from "./RoomClient";
import { groupByUserId } from "./GroupsPanel";
import { isBoardGrantActive } from "../lib/classroomGrants";
import { BoardAccessSidePanel } from "./BoardAccessSidePanel";

function activeHelpRequestMap(state?: ClassroomState | null | undefined) {
  return new Map(
    (state?.helpRequests ?? [])
      .filter((request) => request.status === "raised" || request.status === "acknowledged")
      .map((request) => [request.userId, request] as const)
  );
}

export function activeGrantMap(state?: ClassroomState | null | undefined) {
  const now = Date.now();
  const next = new Map<string, ClassroomBoardAccessGrant[]>();
  for (const grant of state?.boardAccessGrants ?? []) {
    if (!isBoardGrantActive(grant, now)) continue;
    next.set(grant.userId, [...(next.get(grant.userId) ?? []), grant]);
  }
  return next;
}

function sortParticipants(
  participants: ParticipantView[],
  role: Role,
  activeHelpRequests: Map<string, ClassroomHelpRequest>,
  activeGrants: Map<string, ClassroomBoardAccessGrant[]>
) {
  return [...participants].sort((left, right) => {
    if (role === "teacher") {
      const leftHelp = activeHelpRequests.has(left.id);
      const rightHelp = activeHelpRequests.has(right.id);
      if (leftHelp !== rightHelp) return leftHelp ? -1 : 1;

      const leftGrant = activeGrants.has(left.id);
      const rightGrant = activeGrants.has(right.id);
      if (leftGrant !== rightGrant) return leftGrant ? -1 : 1;

      const leftTeacher = left.role === "teacher";
      const rightTeacher = right.role === "teacher";
      if (leftTeacher !== rightTeacher) return leftTeacher ? 1 : -1;
    } else if (left.local !== right.local) {
      return left.local ? -1 : 1;
    }

    return left.displayName.localeCompare(right.displayName);
  });
}

function groupTagStyle(group: ClassroomGroup): React.CSSProperties {
  return {
    borderColor: `${group.color}55`,
    color: group.color,
    background: `${group.color}18`
  };
}

type RoleLabels = { hostSingular: string; hostInitial: string; guestSingular: string; guestPlural: string };

const CLASSROOM_ROLE_LABELS: RoleLabels = {
  hostSingular: "Teacher", hostInitial: "T", guestSingular: "Student", guestPlural: "Students"
};

export function Roster({
  participants,
  classroomState,
  role,
  roleLabels = CLASSROOM_ROLE_LABELS,
  enableTeacherControls = true,
  selectedStudentId,
  onSelectStudent
}: {
  participants: ParticipantView[];
  classroomState?: ClassroomState | null | undefined;
  role: Role;
  roleLabels?: RoleLabels;
  enableTeacherControls?: boolean;
  selectedStudentId: string;
  onSelectStudent(id: string): void;
}) {
  const helpRequestsByUserId = useMemo(() => activeHelpRequestMap(classroomState), [classroomState]);
  const activeGrantsByUserId = useMemo(() => activeGrantMap(classroomState), [classroomState]);
  const groupsByUserId = useMemo(() => groupByUserId(classroomState), [classroomState]);
  const sortedParticipants = useMemo(
    () => sortParticipants(participants, role, helpRequestsByUserId, activeGrantsByUserId),
    [activeGrantsByUserId, helpRequestsByUserId, participants, role]
  );

  return (
    <HudCard title="People" badge={sortedParticipants.length} ariaLabel="Participants">
      <ul className="roster-compact" role="list">
        {sortedParticipants.map((p) => {
          const camOn = p.state.media?.cameraEnabled;
          const micOn = p.state.media?.microphoneEnabled;
          const speaking = p.state.media?.speaking;
          const hasHelpRequest = helpRequestsByUserId.has(p.id);
          const hasActiveGrant = activeGrantsByUserId.has(p.id);
          const participantGroup = groupsByUserId.get(p.id);
          const dotColor = participantGroup?.color ?? (p.local ? "#eb5e28" : "#2f6b4f");
          const selectable = enableTeacherControls && role === "teacher" && p.role === "student";
          const selected = selectable && p.id === selectedStudentId;
          const content = (
            <>
              <span
                className="avatar-dot"
                style={{ background: dotColor }}
                aria-hidden="true"
              >
                {p.displayName.slice(0, 2).toUpperCase()}
              </span>
              <span className="roster-compact-name" title={p.displayName}>
                {p.displayName}
              </span>
              <span className="roster-compact-tags" aria-label={`${camOn ? "camera on" : "camera off"}, ${micOn ? "mic on" : "mic off"}`}>
                {hasHelpRequest ? <span className="tag tag-help">help</span> : null}
                {hasActiveGrant ? <span className="tag tag-board">board</span> : null}
                {participantGroup ? <span className="tag" style={groupTagStyle(participantGroup)}>{participantGroup.label.slice(0, 10)}</span> : null}
                {camOn ? <span className="tag active">cam</span> : null}
                {micOn ? <span className={`tag${speaking ? " active" : ""}`}>mic</span> : null}
                {p.role === "teacher" ? <span className="tag tag-teacher">{roleLabels.hostInitial}</span> : null}
              </span>
            </>
          );
          return (
            <li
              key={p.id}
              className={`roster-compact-item${selected ? " roster-compact-item--selected" : ""}`}
              data-testid={`participant-${p.id}`}
            >
              {selectable ? (
                <button
                  type="button"
                  className={`roster-compact-button${selected ? " roster-compact-button--selected" : ""}`}
                  aria-pressed={selected}
                  aria-expanded={selected}
                  onClick={() => onSelectStudent(selected ? "" : p.id)}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </HudCard>
  );
}

export function StudentDetailPanel({
  participant,
  helpRequest,
  activeGrants,
  manifest,
  studentMediaRuntime,
  error,
  onRunAction,
  onClose
}: {
  participant: ParticipantView;
  helpRequest: ClassroomHelpRequest | null;
  activeGrants: ClassroomBoardAccessGrant[];
  manifest: RoomManifest;
  studentMediaRuntime?: ClassroomState["studentMediaRuntime"];
  error?: string | undefined;
  onRunAction(action: ClassroomAction): Promise<void>;
  onClose(): void;
}) {
  return (
    <BoardAccessSidePanel
      userId={participant.id}
      displayName={participant.displayName}
      helpRequest={helpRequest}
      activeGrants={activeGrants}
      manifest={manifest}
      studentMediaRuntime={studentMediaRuntime}
      error={error}
      dock="left-people"
      showHelpActions={Boolean(helpRequest)}
      onRunAction={onRunAction}
      onClose={onClose}
    />
  );
}
