import { computeGroupTargetPositionFromAnchor, isBoardGrantActive } from "@3dspace/room-engine";
import {
  ClassroomStateSchema,
  LessonRunSchema,
  type ClassMembership,
  type ClassroomAction,
  type ClassroomGroup,
  type ClassroomPrivateCheck,
  type ClassroomSpotlight,
  type ClassroomState,
  type LessonActiveTimer,
  type LessonRecap,
  type LessonRun,
  type LessonRunStepRecord,
  type LessonStep,
  type LessonStepInput,
  type RoomSettings
} from "@3dspace/contracts";
import { badRequest, conflict, notFound } from "../errors.js";
import { newId, type Repository } from "../repository.js";

export type ClassroomActor = {
  userId: string;
  displayName: string;
  role: "teacher" | "student";
};

export const DEFAULT_PODS_RUNTIME = {
  podsEnabled: false,
  broadcastFromUserIds: [] as string[]
};

export type LessonEffectResult = {
  drifted?: boolean;
  driftReason?: string;
  emittedActionIds?: string[];
  createdCheckId?: string;
  createdGroupId?: string;
  createdGrantId?: string;
  createdWallObjectId?: string;
  createdExitTicket?: {
    reflectionCheckId: string;
    confidenceCheckId?: string;
    whatsNextCheckId?: string;
  };
};

export function ensurePodsRuntime(state: ClassroomState) {
  if (!state.podsRuntime) {
    state.podsRuntime = {
      podsEnabled: false,
      broadcastFromUserIds: []
    };
  }
  return state.podsRuntime;
}

function isActivePositionedGroup(group: ClassroomGroup) {
  return group.status === "active" && Boolean(group.targetPosition);
}

export function hasActivePositionedGroups(state: ClassroomState) {
  return state.groups.some((group) => isActivePositionedGroup(group));
}

export function findActivePositionedGroupForUser(state: ClassroomState, userId: string) {
  return state.groups.find((group) => isActivePositionedGroup(group) && group.memberUserIds.includes(userId));
}

function currentGroupIdForUser(state: ClassroomState, userId: string) {
  return state.groups.find((group) => group.status !== "archived" && group.memberUserIds.includes(userId))?.id;
}

export function isCheckVisibleToStudent(state: ClassroomState, check: ClassroomPrivateCheck, userId: string) {
  if (check.target.kind === "all") return true;
  if (check.target.kind === "users") return check.target.userIds.includes(userId);
  if (check.target.kind === "group") return check.target.groupId === currentGroupIdForUser(state, userId);
  return false;
}

export function findHelpRequest(state: ClassroomState, requestId: string) {
  const request = state.helpRequests.find((candidate) => candidate.id === requestId);
  if (!request) throw notFound("Help request not found");
  return request;
}

export function findBoardGrant(state: ClassroomState, grantId: string) {
  const grant = state.boardAccessGrants.find((candidate) => candidate.id === grantId);
  if (!grant) throw notFound("Board access grant not found");
  return grant;
}

export function findPrivateCheck(state: ClassroomState, checkId: string) {
  const check = state.privateChecks.find((candidate) => candidate.id === checkId);
  if (!check) throw notFound("Private check not found");
  return check;
}

export function findGroup(state: ClassroomState, groupId: string) {
  const group = state.groups.find((candidate) => candidate.id === groupId);
  if (!group) throw notFound("Group not found");
  return group;
}

export function validatePrivateCheckResponse(
  check: ClassroomPrivateCheck,
  action: Extract<ClassroomAction, { type: "submit-private-check" }>
) {
  if (check.promptType === "multiple-choice") {
    if (!action.choiceId) throw badRequest("choiceId is required for multiple-choice checks");
    if (!check.choices.some((choice) => choice.id === action.choiceId)) {
      throw badRequest("choiceId does not exist on this check");
    }
    return;
  }
  if (check.promptType === "short-answer") {
    if (!action.answer?.trim()) throw badRequest("answer is required for short-answer checks");
    return;
  }
  if (check.promptType === "confidence" && typeof action.confidence !== "number") {
    throw badRequest("confidence is required for confidence checks");
  }
}

const LESSON_ACTION_TYPES = new Set<ClassroomAction["type"]>([
  "init-lesson-run",
  "set-lesson-run-title",
  "add-lesson-step",
  "update-lesson-step",
  "move-lesson-step",
  "remove-lesson-step",
  "start-lesson-run",
  "advance-lesson-step",
  "retreat-lesson-step",
  "pause-lesson-run",
  "resume-lesson-run",
  "end-lesson-run",
  "abandon-lesson-run",
  "clear-lesson-run"
]);

export function isLessonAction(action: ClassroomAction) {
  return LESSON_ACTION_TYPES.has(action.type);
}

export function cloneLessonRun(run: LessonRun | null) {
  return run ? LessonRunSchema.parse(run) : null;
}

export function requireLessonRun(state: ClassroomState) {
  if (!state.lessonRun) throw notFound("Lesson run not found");
  return state.lessonRun;
}

function lessonDraftStatus(run: LessonRun) {
  return run.steps.length > 0 ? "ready" : "draft";
}

export function touchLessonRun(run: LessonRun, now: string) {
  run.updatedAt = now;
  if (run.status === "draft" || run.status === "ready") {
    run.status = lessonDraftStatus(run);
  }
}

export function clampLessonInsertIndex(run: LessonRun, index: number | undefined) {
  if (index === undefined) return run.steps.length;
  return Math.min(Math.max(index, 0), run.steps.length);
}

export function assertLessonCanEditIndex(run: LessonRun, index: number, operation: "add" | "update" | "move" | "remove") {
  if (run.status !== "running" && run.status !== "paused") return;
  if (operation === "update" && index === run.currentStepIndex) return;
  if (index <= run.currentStepIndex) {
    throw conflict("Only the current or upcoming lesson steps can be edited during a run");
  }
}

export function makeLessonStep(input: LessonStepInput, now: string): LessonStep {
  return {
    id: newId("lessonstep"),
    kind: input.kind,
    title: input.title,
    notes: input.notes?.trim() || undefined,
    payload: input.payload,
    createdAt: now,
    updatedAt: now
  };
}

function currentLessonRecordIndex(run: LessonRun) {
  const currentStep = run.steps[run.currentStepIndex];
  if (!currentStep) return -1;
  for (let index = run.timeline.length - 1; index >= 0; index -= 1) {
    const record = run.timeline[index];
    if (record?.stepId === currentStep.id && !record.completedAt) return index;
  }
  return -1;
}

function lastLessonRecordForStep(run: LessonRun, stepId: string) {
  for (let index = run.timeline.length - 1; index >= 0; index -= 1) {
    const record = run.timeline[index];
    if (record?.stepId === stepId) return record;
  }
  return undefined;
}

function hasAnchor(stateManifest: Awaited<ReturnType<Repository["getActiveManifest"]>>, anchorId: string | undefined) {
  if (!anchorId) return false;
  return Boolean(stateManifest?.wallAnchors.some((anchor) => anchor.id === anchorId));
}

function hydrateGroupPlacementFromAnchor(
  manifest: Awaited<ReturnType<Repository["getActiveManifest"]>>,
  group: Pick<ClassroomGroup, "targetPosition" | "targetWallAnchorId" | "hold">
) {
  if (!manifest || !group.targetWallAnchorId) return true;
  const nextPosition = group.targetPosition ?? computeGroupTargetPositionFromAnchor(manifest, group.targetWallAnchorId);
  if (!nextPosition) return false;
  group.targetPosition = nextPosition;
  return true;
}

export async function clearActiveLessonTimer(input: {
  repository: Repository;
  roomId: string;
  run: LessonRun;
  actor: ClassroomActor;
}): Promise<LessonEffectResult> {
  const activeTimer = input.run.activeTimer;
  if (!activeTimer) return {};

  input.run.activeTimer = null;
  if (activeTimer.placement !== "wall" || !activeTimer.wallObjectId) return {};

  const wallObject = await input.repository.getWallObject(input.roomId, activeTimer.wallObjectId);
  if (!wallObject || wallObject.status === "removed") {
    return { drifted: true, driftReason: "Wall timer was removed" };
  }
  if (wallObject.permissions?.lessonRunId !== input.run.id || wallObject.permissions?.lessonStepId !== activeTimer.stepId) {
    return { drifted: true, driftReason: "Wall timer ownership changed" };
  }
  await input.repository.softRemoveWallObject(input.roomId, wallObject.id, { updatedByUserId: input.actor.userId });
  return { emittedActionIds: ["remove-wall-timer"] };
}

function sameStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function spotlightForFocusStep(step: LessonStep, actor: ClassroomActor, now: string): ClassroomSpotlight {
  if (step.kind !== "focus-board" || step.payload.kind !== "focus-board") {
    throw badRequest("Lesson step is not a focus-board step");
  }
  return {
    targetType: step.payload.data.objectId ? "wall-object" : "wall-anchor",
    anchorId: step.payload.data.anchorId,
    objectId: step.payload.data.objectId,
    title: step.payload.data.title ?? step.title,
    instruction: step.payload.data.instruction,
    mode: step.payload.data.mode,
    createdByUserId: actor.userId,
    startedAt: now
  };
}

function spotlightMatchesStep(spotlight: ClassroomSpotlight | null, step: LessonStep) {
  if (!spotlight || step.kind !== "focus-board" || step.payload.kind !== "focus-board") return false;
  const expectedTargetType = step.payload.data.objectId ? "wall-object" : "wall-anchor";
  return (
    spotlight.targetType === expectedTargetType &&
    spotlight.anchorId === step.payload.data.anchorId &&
    spotlight.objectId === step.payload.data.objectId &&
    spotlight.mode === step.payload.data.mode &&
    spotlight.title === (step.payload.data.title ?? step.title) &&
    spotlight.instruction === step.payload.data.instruction
  );
}

function assignGroupMembers(state: ClassroomState, groupId: string, memberUserIds: string[], now: string) {
  const assigned = new Set(memberUserIds);
  const uniqueMembers = [...assigned];
  state.groups = state.groups.map((candidate) => ({
    ...candidate,
    memberUserIds: candidate.id === groupId ? uniqueMembers : candidate.memberUserIds.filter((userId) => !assigned.has(userId)),
    updatedAt: candidate.id === groupId ? now : candidate.updatedAt
  }));
}

function upsertCreatedLessonGroup(
  state: ClassroomState,
  input: NonNullable<Extract<LessonStep["payload"], { kind: "group-work" }>["data"]["newGroup"]>,
  actor: ClassroomActor,
  now: string,
  existingGroupId?: string
) {
  const existing = existingGroupId ? state.groups.find((group) => group.id === existingGroupId && group.status !== "archived") : undefined;
  if (existing) {
    existing.label = input.label;
    existing.color = input.color;
    existing.targetPosition = input.targetPosition;
    existing.targetWallAnchorId = input.targetWallAnchorId;
    existing.hold = input.hold;
    existing.status = "active";
    existing.updatedAt = now;
    assignGroupMembers(state, existing.id, input.memberUserIds, now);
    return existing.id;
  }

  const group: ClassroomGroup = {
    id: newId("group"),
    label: input.label,
    color: input.color,
    memberUserIds: [],
    targetPosition: input.targetPosition,
    targetWallAnchorId: input.targetWallAnchorId,
    hold: input.hold,
    status: "active",
    createdByUserId: actor.userId,
    createdAt: now,
    updatedAt: now
  };
  state.groups.unshift(group);
  assignGroupMembers(state, group.id, input.memberUserIds, now);
  return group.id;
}

export async function findExitTicketBlocker(input: {
  repository: Repository;
  classId: string;
  state: ClassroomState;
  run: LessonRun;
}): Promise<{ stepId: string; missingUserIds: string[]; submittedCount: number; expectedCount: number } | null> {
  let blockerRecord: LessonRunStepRecord | undefined;
  let blockerStep: LessonStep | undefined;
  for (let i = input.run.timeline.length - 1; i >= 0; i--) {
    const record = input.run.timeline[i]!;
    const step = input.run.steps.find((s) => s.id === record.stepId);
    if (step?.kind === "exit-ticket" && step.payload.kind === "exit-ticket" && step.payload.data.requiredToEnd) {
      blockerRecord = record;
      blockerStep = step;
      break;
    }
  }
  if (!blockerRecord?.createdExitTicket || !blockerStep) return null;

  const { reflectionCheckId } = blockerRecord.createdExitTicket;
  const reflectionCheck = input.state.privateChecks.find((c) => c.id === reflectionCheckId);
  const submittedUserIds = new Set((reflectionCheck?.responses ?? []).map((r) => r.userId));

  const memberships = await input.repository.listMemberships(input.classId);
  const expectedStudents = memberships.filter((m) => m.status === "active" && m.role === "student");
  const missingUserIds = expectedStudents.map((m) => m.userId).filter((id) => !submittedUserIds.has(id));

  if (missingUserIds.length === 0) return null;

  return {
    stepId: blockerStep.id,
    missingUserIds,
    submittedCount: submittedUserIds.size,
    expectedCount: expectedStudents.length
  };
}

export async function startLessonStep(input: {
  repository: Repository;
  roomId: string;
  state: ClassroomState;
  run: LessonRun;
  step: LessonStep;
  actor: ClassroomActor;
  roomSettings: RoomSettings | undefined;
  breakoutPodsEnabled: boolean;
  now: string;
}): Promise<LessonRunStepRecord> {
  const record: LessonRunStepRecord = {
    stepId: input.step.id,
    startedAt: input.now,
    drifted: false,
    emittedActionIds: []
  };
  const prior = lastLessonRecordForStep(input.run, input.step.id);

  if (input.step.kind === "instruction") {
    return record;
  }

  if (input.step.kind === "focus-board" && input.step.payload.kind === "focus-board") {
    const manifest = await input.repository.getActiveManifest(input.roomId);
    if (!hasAnchor(manifest, input.step.payload.data.anchorId)) {
      return { ...record, drifted: true, driftReason: "Missing wall anchor" };
    }
    input.state.spotlight = spotlightForFocusStep(input.step, input.actor, input.now);
    return { ...record, emittedActionIds: ["set-spotlight"] };
  }

  if (input.step.kind === "private-check" && input.step.payload.kind === "private-check") {
    const payload = input.step.payload.data;
    if (payload.promptType === "multiple-choice" && payload.choices.length < 2) {
      throw badRequest("Multiple-choice checks require at least two choices");
    }
    const existingCheck = prior?.createdCheckId ? input.state.privateChecks.find((check) => check.id === prior.createdCheckId) : undefined;
    if (existingCheck) {
      if (payload.autoCloseOnAdvance && existingCheck.status === "closed") {
        existingCheck.status = "open";
        existingCheck.updatedAt = input.now;
        record.emittedActionIds.push("reopen-private-check");
      }
      record.createdCheckId = existingCheck.id;
      return record;
    }

    const checkId = newId("check");
    input.state.privateChecks.unshift({
      id: checkId,
      question: payload.question,
      promptType: payload.promptType,
      choices: payload.choices,
      target: payload.target,
      status: "open",
      visibility: "teacher-only",
      responses: [],
      wallAnchorId: payload.wallAnchorId,
      createdByUserId: input.actor.userId,
      createdAt: input.now,
      updatedAt: input.now
    });
    return { ...record, createdCheckId: checkId, emittedActionIds: ["create-private-check", "open-private-check"] };
  }

  if (input.step.kind === "group-work" && input.step.payload.kind === "group-work") {
    const payload = input.step.payload.data;
    const manifest = await input.repository.getActiveManifest(input.roomId);
    if (payload.existingGroupId) {
      const group = input.state.groups.find((candidate) => candidate.id === payload.existingGroupId && candidate.status !== "archived");
      if (!group) return { ...record, drifted: true, driftReason: "Missing group" };
      if (!hydrateGroupPlacementFromAnchor(manifest, group)) {
        return { ...record, drifted: true, driftReason: "Missing group target board" };
      }
      group.status = "active";
      group.updatedAt = input.now;
      const emittedActionIds = ["update-group"];
      if (input.breakoutPodsEnabled && input.roomSettings?.pods.enabled === true && hasActivePositionedGroups(input.state)) {
        ensurePodsRuntime(input.state).podsEnabled = true;
        emittedActionIds.push("toggle-pods");
      }
      return { ...record, createdGroupId: group.id, emittedActionIds };
    }
    if (!payload.newGroup) return { ...record, drifted: true, driftReason: "Missing group configuration" };
    if (payload.newGroup.targetWallAnchorId && !hasAnchor(manifest, payload.newGroup.targetWallAnchorId)) {
      return { ...record, drifted: true, driftReason: "Missing group target board" };
    }
    const normalizedGroup = {
      ...payload.newGroup,
      targetPosition:
        payload.newGroup.targetPosition ??
        (manifest && payload.newGroup.targetWallAnchorId
          ? computeGroupTargetPositionFromAnchor(manifest, payload.newGroup.targetWallAnchorId) ?? undefined
          : undefined)
    };
    const groupId = upsertCreatedLessonGroup(input.state, normalizedGroup, input.actor, input.now, prior?.createdGroupId);
    const group = input.state.groups.find((candidate) => candidate.id === groupId);
    if (group) {
      group.targetPosition = normalizedGroup.targetPosition;
      group.targetWallAnchorId = normalizedGroup.targetWallAnchorId;
      group.hold = normalizedGroup.hold;
      group.updatedAt = input.now;
    }
    const emittedActionIds = prior?.createdGroupId ? ["update-group", "assign-group"] : ["create-group", "assign-group"];
    if (input.breakoutPodsEnabled && input.roomSettings?.pods.enabled === true && hasActivePositionedGroups(input.state)) {
      ensurePodsRuntime(input.state).podsEnabled = true;
      emittedActionIds.push("toggle-pods");
    }
    return { ...record, createdGroupId: groupId, emittedActionIds };
  }

  if (input.step.kind === "timer" && input.step.payload.kind === "timer") {
    const payload = input.step.payload.data;
    const activeTimer: LessonActiveTimer = {
      stepId: input.step.id,
      title: input.step.title,
      label: payload.label,
      durationSeconds: payload.durationSeconds,
      placement: payload.placement,
      ...(payload.wallAnchorId ? { wallAnchorId: payload.wallAnchorId } : {}),
      autoAdvanceOnComplete: payload.autoAdvanceOnComplete,
      startedAt: input.now
    };
    if (payload.placement === "hud") {
      const clearedTimer = await clearActiveLessonTimer(input);
      input.run.activeTimer = activeTimer;
      return {
        ...record,
        drifted: Boolean(record.drifted || clearedTimer.drifted),
        driftReason: clearedTimer.driftReason ?? record.driftReason,
        emittedActionIds: [...record.emittedActionIds, ...(clearedTimer.emittedActionIds ?? [])]
      };
    }
    const manifest = await input.repository.getActiveManifest(input.roomId);
    if (!hasAnchor(manifest, payload.wallAnchorId)) {
      return { ...record, drifted: true, driftReason: "Missing timer wall anchor" };
    }
    const clearedTimer = await clearActiveLessonTimer(input);
    const wallObject = await input.repository.createWallObject({
      roomId: input.roomId,
      wallAnchorId: payload.wallAnchorId!,
      type: "timer",
      title: payload.label || input.step.title,
      source: { kind: "inline", data: { seconds: payload.durationSeconds } },
      placement: { x: 0, y: 0, width: 1, height: 1, zIndex: Date.now() % 1000, fit: "contain" },
      state: {
        playback: {
          status: "playing",
          positionSeconds: 0,
          startedAt: input.now,
          sentAt: Date.now(),
          rate: 1,
          muted: false
        }
      },
      permissions: { lessonRunId: input.run.id, lessonStepId: input.step.id },
      moderation: {},
      status: "active",
      createdByUserId: input.actor.userId,
      updatedByUserId: input.actor.userId
    });
    input.run.activeTimer = { ...activeTimer, wallObjectId: wallObject.id };
    return {
      ...record,
      createdWallObjectId: wallObject.id,
      drifted: Boolean(record.drifted || clearedTimer.drifted),
      driftReason: clearedTimer.driftReason ?? record.driftReason,
      emittedActionIds: [...record.emittedActionIds, ...(clearedTimer.emittedActionIds ?? []), "create-wall-timer"]
    };
  }

  if (input.step.kind === "student-share" && input.step.payload.kind === "student-share") {
    const payload = input.step.payload.data;
    const manifest = await input.repository.getActiveManifest(input.roomId);
    if (!hasAnchor(manifest, payload.wallAnchorId)) {
      return { ...record, drifted: true, driftReason: "Missing share wall anchor" };
    }
    const emittedActionIds: string[] = [];
    if (input.breakoutPodsEnabled && ensurePodsRuntime(input.state).podsEnabled) {
      ensurePodsRuntime(input.state).podsEnabled = false;
      emittedActionIds.push("toggle-pods");
    }
    if (payload.acknowledgeHandIfRaised) {
      const help = input.state.helpRequests.find(
        (request) => request.userId === payload.userId && (request.status === "raised" || request.status === "acknowledged")
      );
      if (help) {
        help.status = "acknowledged";
        help.updatedAt = input.now;
        emittedActionIds.push("acknowledge-help");
      }
    }
    for (const grant of input.state.boardAccessGrants) {
      if (grant.userId !== payload.userId) continue;
      if (!isBoardGrantActive(grant, Date.parse(input.now))) continue;
      grant.status = "revoked";
      grant.updatedAt = input.now;
    }
    const grantId = newId("grant");
    input.state.boardAccessGrants.unshift({
      id: grantId,
      userId: payload.userId,
      wallAnchorId: payload.wallAnchorId,
      allowedObjectTypes: payload.allowedObjectTypes,
      status: "active",
      expiresAt: payload.expiresAt,
      createdByUserId: input.actor.userId,
      createdAt: input.now,
      updatedAt: input.now
    });
    emittedActionIds.push("grant-board-access");
    return { ...record, createdGrantId: grantId, emittedActionIds };
  }

  if (input.step.kind === "exit-ticket" && input.step.payload.kind === "exit-ticket") {
    const payload = input.step.payload.data;

    if (prior?.createdExitTicket) {
      const { reflectionCheckId, confidenceCheckId, whatsNextCheckId } = prior.createdExitTicket;
      const checkIds = [reflectionCheckId, confidenceCheckId, whatsNextCheckId].filter((id): id is string => Boolean(id));
      let reopened = false;
      for (const checkId of checkIds) {
        const check = input.state.privateChecks.find((c) => c.id === checkId);
        if (check && check.status === "closed") {
          check.status = "open";
          check.updatedAt = input.now;
          reopened = true;
        }
      }
      record.createdCheckId = reflectionCheckId;
      record.createdExitTicket = prior.createdExitTicket;
      if (reopened) record.emittedActionIds.push("reopen-private-check");
      return record;
    }

    const reflectionCheckId = newId("check");
    input.state.privateChecks.unshift({
      id: reflectionCheckId,
      question: payload.reflectionPrompt,
      promptType: "short-answer",
      choices: [],
      target: { kind: "all", userIds: [] },
      status: "open",
      visibility: "teacher-only",
      responses: [],
      wallAnchorId: payload.wallAnchorId,
      createdByUserId: input.actor.userId,
      createdAt: input.now,
      updatedAt: input.now
    });

    let confidenceCheckId: string | undefined;
    if (payload.includeConfidence) {
      confidenceCheckId = newId("check");
      input.state.privateChecks.unshift({
        id: confidenceCheckId,
        question: "How confident do you feel about today's material?",
        promptType: "confidence",
        choices: [],
        target: { kind: "all", userIds: [] },
        status: "open",
        visibility: "teacher-only",
        responses: [],
        createdByUserId: input.actor.userId,
        createdAt: input.now,
        updatedAt: input.now
      });
    }

    let whatsNextCheckId: string | undefined;
    if (payload.whatsNext) {
      whatsNextCheckId = newId("check");
      input.state.privateChecks.unshift({
        id: whatsNextCheckId,
        question: payload.whatsNext.question,
        promptType: "multiple-choice",
        choices: payload.whatsNext.choices,
        target: { kind: "all", userIds: [] },
        status: "open",
        visibility: "teacher-only",
        responses: [],
        createdByUserId: input.actor.userId,
        createdAt: input.now,
        updatedAt: input.now
      });
    }

    const createdExitTicket = { reflectionCheckId, confidenceCheckId, whatsNextCheckId };
    return {
      ...record,
      createdCheckId: reflectionCheckId,
      createdExitTicket,
      emittedActionIds: ["create-private-check", "open-private-check"]
    };
  }

  return record;
}

async function cleanupLessonStep(input: {
  repository: Repository;
  roomId: string;
  state: ClassroomState;
  run: LessonRun;
  step: LessonStep;
  record: LessonRunStepRecord;
  actor: ClassroomActor;
  roomSettings: RoomSettings | undefined;
  breakoutPodsEnabled: boolean;
  now: string;
}): Promise<LessonEffectResult> {
  if (input.step.kind === "focus-board") {
    if (!spotlightMatchesStep(input.state.spotlight, input.step)) {
      return { drifted: true, driftReason: "Spotlight changed before cleanup" };
    }
    input.state.spotlight = null;
    return { emittedActionIds: ["clear-spotlight"] };
  }

  if (input.step.kind === "private-check" && input.step.payload.kind === "private-check") {
    if (!input.step.payload.data.autoCloseOnAdvance) return {};
    if (!input.record.createdCheckId) return { drifted: true, driftReason: "Missing private check id" };
    const check = input.state.privateChecks.find((candidate) => candidate.id === input.record.createdCheckId);
    if (!check) return { drifted: true, driftReason: "Private check was removed" };
    if (check.status === "open") {
      check.status = "closed";
      check.updatedAt = input.now;
      return { emittedActionIds: ["close-private-check"] };
    }
    return {};
  }

  if (input.step.kind === "group-work" && input.step.payload.kind === "group-work") {
    if (!input.step.payload.data.releaseOnAdvance) return {};
    if (!input.record.createdGroupId) return { drifted: true, driftReason: "Missing group id" };
    const group = input.state.groups.find((candidate) => candidate.id === input.record.createdGroupId);
    if (!group) return { drifted: true, driftReason: "Group was removed" };
    let drifted = false;
    let driftReason: string | undefined;
    if (group.status !== "active") {
      drifted = true;
      driftReason = "Group was already released";
    }
    if (input.step.payload.data.newGroup && !sameStringArray(group.memberUserIds, input.step.payload.data.newGroup.memberUserIds)) {
      drifted = true;
      driftReason = "Group membership changed before cleanup";
    }
    group.status = "released";
    group.updatedAt = input.now;
    return { emittedActionIds: ["release-group"], drifted, ...(driftReason ? { driftReason } : {}) };
  }

  if (input.step.kind === "timer" && input.step.payload.kind === "timer") {
    return {};
  }

  if (input.step.kind === "student-share" && input.step.payload.kind === "student-share") {
    const emittedActionIds: string[] = [];
    let drifted = false;
    let driftReason: string | undefined;

    if (input.step.payload.data.revokeOnAdvance) {
      if (!input.record.createdGrantId) {
        drifted = true;
        driftReason = "Missing grant id";
      } else {
        const grant = input.state.boardAccessGrants.find((candidate) => candidate.id === input.record.createdGrantId);
        if (grant?.status === "active") {
          grant.status = "revoked";
          grant.updatedAt = input.now;
          emittedActionIds.push("revoke-board-access");
        }
      }
    }

    if (input.breakoutPodsEnabled && input.record.emittedActionIds.includes("toggle-pods") && !ensurePodsRuntime(input.state).podsEnabled) {
      ensurePodsRuntime(input.state).podsEnabled = true;
      emittedActionIds.push("toggle-pods");
    }

    return emittedActionIds.length > 0 || drifted
      ? {
          emittedActionIds,
          ...(drifted ? { drifted: true } : {}),
          ...(driftReason ? { driftReason } : {})
        }
      : {};
  }

  if (input.step.kind === "exit-ticket" && input.step.payload.kind === "exit-ticket") {
    if (!input.step.payload.data.autoCloseOnAdvance) return {};
    if (!input.record.createdExitTicket) return { drifted: true, driftReason: "Missing exit ticket check ids" };
    const { reflectionCheckId, confidenceCheckId, whatsNextCheckId } = input.record.createdExitTicket;
    const checkIds = [reflectionCheckId, confidenceCheckId, whatsNextCheckId].filter((id): id is string => Boolean(id));
    const emittedActionIds: string[] = [];
    for (const checkId of checkIds) {
      const check = input.state.privateChecks.find((c) => c.id === checkId);
      if (check && check.status === "open") {
        check.status = "closed";
        check.updatedAt = input.now;
        emittedActionIds.push("close-private-check");
      }
    }
    return { emittedActionIds };
  }

  return {};
}

export async function completeCurrentLessonStep(input: {
  repository: Repository;
  roomId: string;
  state: ClassroomState;
  run: LessonRun;
  actor: ClassroomActor;
  roomSettings: RoomSettings | undefined;
  breakoutPodsEnabled: boolean;
  now: string;
}) {
  const step = input.run.steps[input.run.currentStepIndex];
  if (!step) return;
  let recordIndex = currentLessonRecordIndex(input.run);
  if (recordIndex < 0) {
    input.run.timeline.push({ stepId: step.id, startedAt: input.now, drifted: false, emittedActionIds: [] });
    recordIndex = input.run.timeline.length - 1;
  }
  const record = input.run.timeline[recordIndex]!;
  const cleanup = await cleanupLessonStep({ ...input, step, record });
  input.run.timeline[recordIndex] = {
    ...record,
    completedAt: input.now,
    drifted: Boolean(record.drifted || cleanup.drifted),
    driftReason: cleanup.driftReason ?? record.driftReason,
    emittedActionIds: [...record.emittedActionIds, ...(cleanup.emittedActionIds ?? [])]
  };
}

export function filterLessonRunForActor(run: LessonRun | null, actor: ClassroomActor): LessonRun | null {
  if (!run) return null;
  if (actor.role === "teacher") return LessonRunSchema.parse(run);
  const currentStep = run.steps[run.currentStepIndex];
  const steps = run.steps.map((step, index) => {
    if (currentStep && index === run.currentStepIndex) {
      const { notes: _notes, ...visibleStep } = step;
      return visibleStep;
    }
    return {
      id: step.id,
      kind: "instruction" as const,
      title: "Hidden step",
      payload: { kind: "instruction" as const, data: { body: "" } },
      createdAt: step.createdAt,
      updatedAt: step.updatedAt
    };
  });
  return LessonRunSchema.parse({
    id: run.id,
    title: run.title,
    status: run.status,
    steps,
    currentStepIndex: run.currentStepIndex,
    timeline: [],
    activeTimer: run.activeTimer,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    createdByUserId: run.createdByUserId,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  });
}

export function buildLessonRecap(input: {
  memberships: ClassMembership[];
  room: { id: string; classId: string };
  state: ClassroomState;
  run: LessonRun;
}): LessonRecap {
  const activeStudents = input.memberships.filter((m) => m.status === "active" && m.role === "student");

  const lessonCheckIds = new Set<string>();
  for (const record of input.run.timeline) {
    if (record.createdCheckId) lessonCheckIds.add(record.createdCheckId);
    if (record.createdExitTicket) {
      lessonCheckIds.add(record.createdExitTicket.reflectionCheckId);
      if (record.createdExitTicket.confidenceCheckId) lessonCheckIds.add(record.createdExitTicket.confidenceCheckId);
      if (record.createdExitTicket.whatsNextCheckId) lessonCheckIds.add(record.createdExitTicket.whatsNextCheckId);
    }
  }

  const lessonChecks = input.state.privateChecks.filter((c) => lessonCheckIds.has(c.id));

  const privateChecks = lessonChecks.map((check) => {
    const choiceCounts: Record<string, number> = {};
    let confidenceSum = 0;
    let confidenceCount = 0;
    for (const response of check.responses) {
      if (response.choiceId) {
        choiceCounts[response.choiceId] = (choiceCounts[response.choiceId] ?? 0) + 1;
      }
      if (response.confidence != null) {
        confidenceSum += response.confidence;
        confidenceCount++;
      }
    }
    return {
      checkId: check.id,
      question: check.question,
      promptType: check.promptType,
      responseCount: check.responses.length,
      ...(Object.keys(choiceCounts).length > 0 ? { choiceCounts } : {}),
      ...(confidenceCount > 0 ? { confidenceAverage: confidenceSum / confidenceCount } : {})
    };
  });

  const steps = input.run.timeline.map((record) => {
    const step = input.run.steps.find((s) => s.id === record.stepId);
    return {
      stepId: record.stepId,
      kind: (step?.kind ?? "instruction") as LessonRecap["steps"][number]["kind"],
      title: step?.title ?? "Unknown step",
      drifted: record.drifted,
      ...(record.driftReason ? { driftReason: record.driftReason } : {})
    };
  });

  let exitTicket: LessonRecap["exitTicket"];
  for (let i = input.run.timeline.length - 1; i >= 0; i--) {
    const record = input.run.timeline[i]!;
    if (!record.createdExitTicket) continue;
    const step = input.run.steps.find((s) => s.id === record.stepId);
    if (!step || step.kind !== "exit-ticket") continue;

    const { reflectionCheckId, confidenceCheckId, whatsNextCheckId } = record.createdExitTicket;
    const reflectionCheck = input.state.privateChecks.find((c) => c.id === reflectionCheckId);
    const confidenceCheck = confidenceCheckId ? input.state.privateChecks.find((c) => c.id === confidenceCheckId) : undefined;
    const whatsNextCheck = whatsNextCheckId ? input.state.privateChecks.find((c) => c.id === whatsNextCheckId) : undefined;

    const confidenceByUser = new Map<string, number>();
    let confidenceSum = 0;
    for (const r of confidenceCheck?.responses ?? []) {
      if (r.confidence != null) {
        confidenceByUser.set(r.userId, r.confidence);
        confidenceSum += r.confidence;
      }
    }
    const whatsNextByUser = new Map<string, string>();
    for (const r of whatsNextCheck?.responses ?? []) {
      if (r.choiceId) whatsNextByUser.set(r.userId, r.choiceId);
    }

    const reflections = (reflectionCheck?.responses ?? []).map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      answer: r.answer ?? "",
      ...(confidenceByUser.has(r.userId) ? { confidence: confidenceByUser.get(r.userId) } : {}),
      ...(whatsNextByUser.has(r.userId) ? { whatsNextChoiceId: whatsNextByUser.get(r.userId) } : {}),
      submittedAt: r.submittedAt
    }));

    const confidenceAverage = confidenceByUser.size > 0 ? confidenceSum / confidenceByUser.size : undefined;
    exitTicket = {
      stepId: record.stepId,
      submittedCount: reflectionCheck?.responses.length ?? 0,
      expectedCount: activeStudents.length,
      ...(confidenceAverage != null ? { confidenceAverage } : {}),
      ...(whatsNextCheck && whatsNextCheck.choices.length > 0 ? { whatsNextChoices: whatsNextCheck.choices } : {}),
      reflections
    };
    break;
  }

  return {
    lessonRunId: input.run.id,
    roomId: input.room.id,
    title: input.run.title,
    ...(input.run.startedAt ? { startedAt: input.run.startedAt } : {}),
    ...(input.run.endedAt ? { endedAt: input.run.endedAt } : {}),
    attendance: {
      knownParticipantIds: activeStudents.map((m) => m.userId),
      total: activeStudents.length
    },
    steps,
    privateChecks,
    ...(exitTicket ? { exitTicket } : {})
  };
}

function csvField(value: string | number | undefined | null): string {
  if (value == null) return '""';
  return '"' + String(value).replace(/"/g, '""') + '"';
}

export function renderRecapCsv(recap: LessonRecap, displayNameById: Map<string, string>): string {
  const header = "userId,displayName,reflection,confidence,whatsNextChoiceId,submittedAt";
  if (!recap.exitTicket) return header + "\n";

  const whatsNextLabelById = new Map((recap.exitTicket.whatsNextChoices ?? []).map((choice) => [choice.id, choice.label]));
  const reflectionMap = new Map(recap.exitTicket.reflections.map((r) => [r.userId, r]));
  const rows = recap.attendance.knownParticipantIds.map((userId) => {
    const r = reflectionMap.get(userId);
    if (!r) {
      return [csvField(userId), csvField(displayNameById.get(userId) ?? ""), csvField(""), csvField(""), csvField(""), csvField("")].join(",");
    }
    const whatsNextValue = r.whatsNextChoiceId ? whatsNextLabelById.get(r.whatsNextChoiceId) ?? r.whatsNextChoiceId : undefined;
    return [
      csvField(r.userId),
      csvField(r.displayName),
      csvField(r.answer),
      csvField(r.confidence),
      csvField(whatsNextValue),
      csvField(r.submittedAt)
    ].join(",");
  });

  return [header, ...rows].join("\n");
}
