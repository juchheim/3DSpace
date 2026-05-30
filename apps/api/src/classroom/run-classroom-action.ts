import { isBoardGrantActive } from "@3dspace/room-engine";
import { type ClassroomAction, type ClassroomState, type RoomSettings } from "@3dspace/contracts";
import { badRequest, conflict, exitTicketIncomplete, forbidden, notFound, unprocessableEntity } from "../errors.js";
import { newId, type Repository } from "../repository.js";
import { sanitizeClassroomState } from "./state.js";
import {
  type ClassroomActor,
  assertLessonCanEditIndex,
  buildLessonRecap,
  clampLessonInsertIndex,
  cloneLessonRun,
  completeCurrentLessonStep,
  DEFAULT_PODS_RUNTIME,
  ensurePodsRuntime,
  filterLessonRunForActor,
  findActivePositionedGroupForUser,
  findBoardGrant,
  findExitTicketBlocker,
  findGroup,
  findHelpRequest,
  findPrivateCheck,
  hasActivePositionedGroups,
  isCheckVisibleToStudent,
  isLessonAction,
  makeLessonStep,
  renderRecapCsv,
  requireLessonRun,
  startLessonStep,
  touchLessonRun,
  clearActiveLessonTimer,
  validatePrivateCheckResponse
} from "./lesson-runtime.js";

function requireTeacher(actor: ClassroomActor) {
  if (actor.role !== "teacher") throw forbidden("Teacher role required for this classroom action");
}

export type RunClassroomActionInput = {
  repository: Repository;
  roomId: string;
  classId: string;
  actor: ClassroomActor;
  action: ClassroomAction;
  lessonsEnabled: boolean;
  breakoutPodsEnabled: boolean;
  studentMediaPermissionsEnabled: boolean;
  roomSettings?: RoomSettings;
};

export async function runClassroomAction(input: RunClassroomActionInput) {
  if (isLessonAction(input.action) && !input.lessonsEnabled) {
    throw notFound("Classroom lessons are disabled");
  }
  if ((input.action.type === "toggle-pods" || input.action.type === "set-student-broadcast") && !input.breakoutPodsEnabled) {
    throw notFound("Breakout pods are disabled");
  }
  if (
    (input.action.type === "set-student-media-global" || input.action.type === "set-student-media-access") &&
    !input.studentMediaPermissionsEnabled
  ) {
    throw forbidden("Student media permissions are not enabled");
  }

  const current = sanitizeClassroomState(await input.repository.getClassroomState(input.roomId));
  const state: ClassroomState = {
    ...current,
    helpRequests: [...current.helpRequests],
    boardAccessGrants: [...current.boardAccessGrants],
    privateChecks: current.privateChecks.map((check) => ({
      ...check,
      choices: [...check.choices],
      responses: [...check.responses],
      target: { ...check.target }
    })),
    groups: current.groups.map((group) => ({
      ...group,
      memberUserIds: [...group.memberUserIds],
      hold: group.hold ? { ...group.hold } : undefined
    })),
    spotlight: current.spotlight ? { ...current.spotlight } : null,
    podsRuntime: current.podsRuntime
      ? { ...current.podsRuntime, broadcastFromUserIds: [...current.podsRuntime.broadcastFromUserIds] }
      : { ...DEFAULT_PODS_RUNTIME },
    whisper: current.whisper ? { ...current.whisper } : undefined,
    studentMediaRuntime: current.studentMediaRuntime
      ? {
          ...current.studentMediaRuntime,
          cameraEnabledUserIds: [...current.studentMediaRuntime.cameraEnabledUserIds],
          microphoneEnabledUserIds: [...current.studentMediaRuntime.microphoneEnabledUserIds]
        }
      : undefined,
    lessonRun: cloneLessonRun(current.lessonRun)
  };

  if (input.studentMediaPermissionsEnabled && !state.studentMediaRuntime) {
    const sm = input.roomSettings?.studentMedia ?? { camerasEnabled: true, microphonesEnabled: true };
    state.studentMediaRuntime = {
      camerasEnabled: sm.camerasEnabled,
      microphonesEnabled: sm.microphonesEnabled,
      cameraEnabledUserIds: [],
      microphoneEnabledUserIds: []
    };
  }

  const now = new Date().toISOString();

  switch (input.action.type) {
    case "raise-hand": {
      const existing = state.helpRequests.find(
        (request) => request.userId === input.actor.userId && ["raised", "acknowledged"].includes(request.status)
      );
      if (existing) {
        existing.status = "raised";
        existing.displayName = input.actor.displayName;
        existing.note = input.action.note?.trim() || undefined;
        existing.updatedAt = now;
        delete existing.closedByUserId;
        break;
      }
      state.helpRequests.unshift({
        id: newId("help"),
        userId: input.actor.userId,
        displayName: input.actor.displayName,
        note: input.action.note?.trim() || undefined,
        kind: "help",
        status: "raised",
        createdAt: now,
        updatedAt: now
      });
      break;
    }
    case "cancel-help": {
      const request = input.action.requestId
        ? findHelpRequest(state, input.action.requestId)
        : state.helpRequests.find(
            (candidate) => candidate.userId === input.actor.userId && ["raised", "acknowledged"].includes(candidate.status)
          );
      if (!request) throw notFound("Active help request not found");
      if (request.userId !== input.actor.userId && input.actor.role !== "teacher") {
        throw forbidden("You can only cancel your own help request");
      }
      request.status = "cancelled";
      request.closedByUserId = input.actor.userId;
      request.updatedAt = now;
      break;
    }
    case "acknowledge-help": {
      requireTeacher(input.actor);
      const request = findHelpRequest(state, input.action.requestId);
      request.status = "acknowledged";
      request.updatedAt = now;
      break;
    }
    case "close-help": {
      requireTeacher(input.actor);
      const request = findHelpRequest(state, input.action.requestId);
      request.status = "closed";
      request.closedByUserId = input.actor.userId;
      request.updatedAt = now;
      break;
    }
    case "grant-board-access": {
      requireTeacher(input.actor);
      for (const grant of state.boardAccessGrants) {
        if (grant.userId !== input.action.userId) continue;
        if (!isBoardGrantActive(grant, Date.parse(now))) continue;
        grant.status = "revoked";
        grant.updatedAt = now;
      }
      state.boardAccessGrants.unshift({
        id: newId("grant"),
        userId: input.action.userId,
        wallAnchorId: input.action.wallAnchorId,
        requestId: input.action.requestId,
        allowedObjectTypes: input.action.allowedObjectTypes,
        status: "active",
        expiresAt: input.action.expiresAt,
        createdByUserId: input.actor.userId,
        createdAt: now,
        updatedAt: now
      });
      break;
    }
    case "revoke-board-access": {
      requireTeacher(input.actor);
      const grant = findBoardGrant(state, input.action.grantId);
      grant.status = "revoked";
      grant.updatedAt = now;
      break;
    }
    case "create-private-check": {
      requireTeacher(input.actor);
      if (input.action.promptType === "multiple-choice" && input.action.choices.length < 2) {
        throw badRequest("Multiple-choice checks require at least two choices");
      }
      state.privateChecks.unshift({
        id: newId("check"),
        question: input.action.question,
        promptType: input.action.promptType,
        choices: input.action.choices,
        target: input.action.target,
        status: "draft",
        visibility: input.action.visibility,
        responses: [],
        wallAnchorId: input.action.wallAnchorId,
        createdByUserId: input.actor.userId,
        createdAt: now,
        updatedAt: now
      });
      break;
    }
    case "open-private-check":
    case "close-private-check":
    case "reopen-private-check": {
      requireTeacher(input.actor);
      const check = findPrivateCheck(state, input.action.checkId);
      check.status =
        input.action.type === "open-private-check" ? "open" : input.action.type === "close-private-check" ? "closed" : "open";
      check.updatedAt = now;
      break;
    }
    case "submit-private-check": {
      const check = findPrivateCheck(state, input.action.checkId);
      if (!isCheckVisibleToStudent(state, check, input.actor.userId) && input.actor.role !== "teacher") {
        throw forbidden("This private check is not assigned to you");
      }
      if (check.status !== "open") throw conflict("Private check is not open for responses");
      validatePrivateCheckResponse(check, input.action);
      const response = {
        userId: input.actor.userId,
        displayName: input.actor.displayName,
        choiceId: input.action.choiceId,
        answer: input.action.answer?.trim() || undefined,
        confidence: input.action.confidence,
        submittedAt: now
      };
      const existingIndex = check.responses.findIndex((candidate) => candidate.userId === input.actor.userId);
      if (existingIndex >= 0) check.responses[existingIndex] = response;
      else check.responses.push(response);
      check.updatedAt = now;
      break;
    }
    case "create-group": {
      requireTeacher(input.actor);
      const assigned = new Set(input.action.memberUserIds);
      state.groups = state.groups.map((group) =>
        assigned.size === 0 ? group : { ...group, memberUserIds: group.memberUserIds.filter((userId) => !assigned.has(userId)) }
      );
      state.groups.unshift({
        id: newId("group"),
        label: input.action.label,
        color: input.action.color,
        memberUserIds: [...new Set(input.action.memberUserIds)],
        targetPosition: input.action.targetPosition,
        targetWallAnchorId: input.action.targetWallAnchorId,
        hold: input.action.hold,
        status: input.action.status,
        createdByUserId: input.actor.userId,
        createdAt: now,
        updatedAt: now
      });
      break;
    }
    case "update-group": {
      requireTeacher(input.actor);
      const group = findGroup(state, input.action.groupId);
      if (input.action.label !== undefined) group.label = input.action.label;
      if (input.action.color !== undefined) group.color = input.action.color;
      if (input.action.targetPosition !== undefined) group.targetPosition = input.action.targetPosition ?? undefined;
      if (input.action.targetWallAnchorId !== undefined) group.targetWallAnchorId = input.action.targetWallAnchorId;
      if (input.action.hold !== undefined) group.hold = input.action.hold;
      if (input.action.status !== undefined) group.status = input.action.status;
      group.updatedAt = now;
      break;
    }
    case "assign-group": {
      requireTeacher(input.actor);
      const group = findGroup(state, input.action.groupId);
      const assigned = new Set(input.action.memberUserIds);
      const memberUserIds = [...new Set(input.action.memberUserIds)];
      state.groups = state.groups.map((candidate) => ({
        ...candidate,
        memberUserIds: candidate.id === group.id ? memberUserIds : candidate.memberUserIds.filter((userId) => !assigned.has(userId))
      }));
      const updated = state.groups.find((candidate) => candidate.id === group.id);
      if (updated) updated.updatedAt = now;
      break;
    }
    case "release-group": {
      requireTeacher(input.actor);
      const group = findGroup(state, input.action.groupId);
      group.status = "released";
      group.updatedAt = now;
      break;
    }
    case "toggle-pods": {
      requireTeacher(input.actor);
      if (input.action.enabled && !hasActivePositionedGroups(state)) {
        throw unprocessableEntity("Pod audio requires at least one active group with a target position");
      }
      ensurePodsRuntime(state).podsEnabled = input.action.enabled;
      break;
    }
    case "set-student-broadcast": {
      requireTeacher(input.actor);
      const podsRuntime = ensurePodsRuntime(state);
      if (input.action.enabled && !findActivePositionedGroupForUser(state, input.action.userId)) {
        throw unprocessableEntity("Student must belong to an active positioned group to broadcast");
      }
      const nextBroadcastIds = new Set(podsRuntime.broadcastFromUserIds);
      if (input.action.enabled) nextBroadcastIds.add(input.action.userId);
      else nextBroadcastIds.delete(input.action.userId);
      podsRuntime.broadcastFromUserIds = [...nextBroadcastIds];
      break;
    }
    case "set-spotlight": {
      requireTeacher(input.actor);
      if (input.action.targetType === "wall-anchor" && !input.action.anchorId) {
        throw badRequest("anchorId is required for wall-anchor spotlight targets");
      }
      if (input.action.targetType === "wall-object" && !input.action.objectId) {
        throw badRequest("objectId is required for wall-object spotlight targets");
      }
      state.spotlight = {
        targetType: input.action.targetType,
        anchorId: input.action.anchorId,
        objectId: input.action.objectId,
        title: input.action.title,
        instruction: input.action.instruction,
        mode: input.action.mode,
        createdByUserId: input.actor.userId,
        startedAt: now,
        expiresAt: input.action.expiresAt
      };
      break;
    }
    case "clear-spotlight": {
      requireTeacher(input.actor);
      state.spotlight = null;
      break;
    }
    case "init-lesson-run": {
      requireTeacher(input.actor);
      state.lessonRun = {
        id: newId("lessonrun"),
        title: input.action.title?.trim() || "Untitled lesson",
        status: "draft",
        steps: [],
        currentStepIndex: -1,
        timeline: [],
        activeTimer: null,
        createdByUserId: input.actor.userId,
        createdAt: now,
        updatedAt: now
      };
      break;
    }
    case "set-lesson-run-title": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      run.title = input.action.title.trim();
      touchLessonRun(run, now);
      break;
    }
    case "add-lesson-step": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      const index = clampLessonInsertIndex(run, input.action.index);
      assertLessonCanEditIndex(run, index, "add");
      run.steps.splice(index, 0, makeLessonStep(input.action.step, now));
      if (run.currentStepIndex >= index) run.currentStepIndex += 1;
      touchLessonRun(run, now);
      break;
    }
    case "update-lesson-step": {
      requireTeacher(input.actor);
      const action = input.action as Extract<ClassroomAction, { type: "update-lesson-step" }>;
      const run = requireLessonRun(state);
      const index = run.steps.findIndex((step) => step.id === action.stepId);
      if (index < 0) throw notFound("Lesson step not found");
      assertLessonCanEditIndex(run, index, "update");
      const existing = run.steps[index]!;
      const payload = action.payload ?? existing.payload;
      run.steps[index] = {
        ...existing,
        kind: payload.kind,
        title: action.title ?? existing.title,
        notes: action.notes?.trim() || (action.notes === "" ? undefined : existing.notes),
        payload,
        updatedAt: now
      };
      touchLessonRun(run, now);
      break;
    }
    case "move-lesson-step": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (input.action.from >= run.steps.length || input.action.to >= run.steps.length) throw badRequest("Lesson step index is out of range");
      assertLessonCanEditIndex(run, input.action.from, "move");
      assertLessonCanEditIndex(run, input.action.to, "move");
      const [step] = run.steps.splice(input.action.from, 1);
      if (step) run.steps.splice(input.action.to, 0, { ...step, updatedAt: now });
      touchLessonRun(run, now);
      break;
    }
    case "remove-lesson-step": {
      requireTeacher(input.actor);
      const action = input.action as Extract<ClassroomAction, { type: "remove-lesson-step" }>;
      const run = requireLessonRun(state);
      const index = run.steps.findIndex((step) => step.id === action.stepId);
      if (index < 0) throw notFound("Lesson step not found");
      assertLessonCanEditIndex(run, index, "remove");
      run.steps.splice(index, 1);
      if (run.currentStepIndex > index) run.currentStepIndex -= 1;
      touchLessonRun(run, now);
      break;
    }
    case "start-lesson-run": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (run.status === "running") return current;
      if (run.status !== "draft" && run.status !== "ready") throw conflict("Lesson run cannot be started from its current status");
      if (run.steps.length === 0) throw badRequest("Add at least one step before starting a lesson run");
      run.status = "running";
      run.currentStepIndex = 0;
      run.startedAt = now;
      delete run.endedAt;
      run.updatedAt = now;
      run.timeline.push(
        await startLessonStep({
          repository: input.repository,
          roomId: input.roomId,
          state,
          run,
          step: run.steps[0]!,
          actor: input.actor,
          roomSettings: input.roomSettings,
          breakoutPodsEnabled: input.breakoutPodsEnabled,
          now
        })
      );
      break;
    }
    case "advance-lesson-step": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (run.status !== "running") throw conflict("Lesson run is not running");
      if (run.currentStepIndex < 0) throw conflict("Lesson run has no current step");
      await completeCurrentLessonStep({
        repository: input.repository,
        roomId: input.roomId,
        state,
        run,
        actor: input.actor,
        roomSettings: input.roomSettings,
        breakoutPodsEnabled: input.breakoutPodsEnabled,
        now
      });
      if (run.currentStepIndex >= run.steps.length - 1) {
        await clearActiveLessonTimer({ repository: input.repository, roomId: input.roomId, run, actor: input.actor });
        run.status = "ended";
        run.endedAt = now;
        run.updatedAt = now;
        break;
      }
      run.currentStepIndex += 1;
      run.updatedAt = now;
      run.timeline.push(
        await startLessonStep({
          repository: input.repository,
          roomId: input.roomId,
          state,
          run,
          step: run.steps[run.currentStepIndex]!,
          actor: input.actor,
          roomSettings: input.roomSettings,
          breakoutPodsEnabled: input.breakoutPodsEnabled,
          now
        })
      );
      break;
    }
    case "retreat-lesson-step": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (run.status !== "running" && run.status !== "paused") throw conflict("Lesson run is not active");
      if (run.currentStepIndex <= 0) throw conflict("Already at the first lesson step");
      await completeCurrentLessonStep({
        repository: input.repository,
        roomId: input.roomId,
        state,
        run,
        actor: input.actor,
        roomSettings: input.roomSettings,
        breakoutPodsEnabled: input.breakoutPodsEnabled,
        now
      });
      run.currentStepIndex -= 1;
      run.status = "running";
      run.updatedAt = now;
      run.timeline.push(
        await startLessonStep({
          repository: input.repository,
          roomId: input.roomId,
          state,
          run,
          step: run.steps[run.currentStepIndex]!,
          actor: input.actor,
          roomSettings: input.roomSettings,
          breakoutPodsEnabled: input.breakoutPodsEnabled,
          now
        })
      );
      break;
    }
    case "pause-lesson-run": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (run.status !== "running") throw conflict("Lesson run is not running");
      run.status = "paused";
      run.updatedAt = now;
      break;
    }
    case "resume-lesson-run": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (run.status !== "paused") throw conflict("Lesson run is not paused");
      run.status = "running";
      run.updatedAt = now;
      break;
    }
    case "end-lesson-run":
    case "abandon-lesson-run": {
      requireTeacher(input.actor);
      const run = requireLessonRun(state);
      if (input.action.type === "end-lesson-run" && !input.action.force) {
        const blocker = await findExitTicketBlocker({ repository: input.repository, classId: input.classId, state, run });
        if (blocker) throw exitTicketIncomplete(blocker);
      }
      if (run.status === "running" || run.status === "paused") {
        await completeCurrentLessonStep({
          repository: input.repository,
          roomId: input.roomId,
          state,
          run,
          actor: input.actor,
          roomSettings: input.roomSettings,
          breakoutPodsEnabled: input.breakoutPodsEnabled,
          now
        });
      }
      await clearActiveLessonTimer({ repository: input.repository, roomId: input.roomId, run, actor: input.actor });
      run.status = input.action.type === "end-lesson-run" ? "ended" : "abandoned";
      run.endedAt = now;
      run.updatedAt = now;
      break;
    }
    case "clear-lesson-run": {
      requireTeacher(input.actor);
      if (state.lessonRun) {
        await clearActiveLessonTimer({ repository: input.repository, roomId: input.roomId, run: state.lessonRun, actor: input.actor });
      }
      state.lessonRun = null;
      break;
    }
    case "set-avatar-editor-locked": {
      requireTeacher(input.actor);
      state.avatarEditorLocked = input.action.locked;
      break;
    }
    case "set-reactions-locked": {
      requireTeacher(input.actor);
      state.reactionsLocked = input.action.locked;
      break;
    }
    case "request-hallpass": {
      const hp = input.roomSettings?.hallpass;
      if (hp && !hp.enabled) throw badRequest("Hall pass is disabled for this room");
      const active = state.helpRequests.find(
        (r) => r.userId === input.actor.userId && r.kind === "hallpass" && ["raised", "acknowledged"].includes(r.status)
      );
      if (active) throw badRequest("You already have an active hall pass request");
      if (hp && hp.perPeriodLimit > 0) {
        const todayPrefix = now.slice(0, 10);
        const usedToday = state.helpRequests.filter(
          (r) => r.userId === input.actor.userId && r.kind === "hallpass" && r.status === "closed" && r.returnedAt?.startsWith(todayPrefix)
        ).length;
        if (usedToday >= hp.perPeriodLimit) throw badRequest("You have reached today's hall-pass limit");
      }
      state.helpRequests.unshift({
        id: newId("help"),
        userId: input.actor.userId,
        displayName: input.actor.displayName,
        kind: "hallpass",
        status: "raised",
        createdAt: now,
        updatedAt: now
      });
      break;
    }
    case "approve-hallpass": {
      requireTeacher(input.actor);
      const maxConcurrent = input.roomSettings?.hallpass?.maxConcurrent ?? 1;
      const concurrentCount = state.helpRequests.filter((r) => r.kind === "hallpass" && r.status === "acknowledged").length;
      if (concurrentCount >= maxConcurrent) throw badRequest("Maximum concurrent hall passes reached");
      const approveRequest = findHelpRequest(state, input.action.requestId);
      approveRequest.status = "acknowledged";
      approveRequest.approvedAt = now;
      approveRequest.updatedAt = now;
      break;
    }
    case "deny-hallpass": {
      requireTeacher(input.actor);
      const denyRequest = findHelpRequest(state, input.action.requestId);
      denyRequest.status = "cancelled";
      denyRequest.closedByUserId = input.actor.userId;
      denyRequest.updatedAt = now;
      break;
    }
    case "return-from-hallpass": {
      const returnRequest = input.action.requestId
        ? findHelpRequest(state, input.action.requestId)
        : state.helpRequests.find(
            (r) => r.userId === input.actor.userId && r.kind === "hallpass" && ["raised", "acknowledged"].includes(r.status)
          );
      if (!returnRequest) throw notFound("Active hall pass not found");
      if (returnRequest.userId !== input.actor.userId && input.actor.role !== "teacher") {
        throw forbidden("You can only return your own hall pass");
      }
      const durationSeconds = returnRequest.approvedAt
        ? Math.max(0, Math.round((Date.parse(now) - Date.parse(returnRequest.approvedAt)) / 1000))
        : 0;
      returnRequest.status = "closed";
      returnRequest.returnedAt = now;
      returnRequest.durationSeconds = durationSeconds;
      returnRequest.closedByUserId = input.actor.userId;
      returnRequest.updatedAt = now;
      await input.repository.recordRoomEvent({
        roomId: input.roomId,
        type: "hallpass.completed.v1",
        payload: {
          userId: returnRequest.userId,
          displayName: returnRequest.displayName,
          requestedAt: returnRequest.createdAt,
          approvedAt: returnRequest.approvedAt ?? null,
          returnedAt: now,
          durationSeconds
        },
        createdByUserId: input.actor.userId
      });
      break;
    }
    case "update-whisper-settings": {
      requireTeacher(input.actor);
      const currentWhisper = state.whisper ?? { allowed: false, maxRadiusMeters: 3, autoEnableInGroupWork: true };
      state.whisper = {
        allowed: input.action.allowed ?? currentWhisper.allowed,
        maxRadiusMeters: input.action.maxRadiusMeters ?? currentWhisper.maxRadiusMeters,
        autoEnableInGroupWork: input.action.autoEnableInGroupWork ?? currentWhisper.autoEnableInGroupWork
      };
      break;
    }
    case "set-student-media-global": {
      requireTeacher(input.actor);
      const runtime = state.studentMediaRuntime ?? {
        camerasEnabled: true,
        microphonesEnabled: true,
        cameraEnabledUserIds: [],
        microphoneEnabledUserIds: []
      };
      if (input.action.medium === "camera") runtime.camerasEnabled = input.action.enabled;
      else runtime.microphonesEnabled = input.action.enabled;
      state.studentMediaRuntime = runtime;
      break;
    }
    case "set-student-media-access": {
      requireTeacher(input.actor);
      const { userId: targetUserId, medium, enabled } = input.action;
      const runtime = state.studentMediaRuntime ?? {
        camerasEnabled: true,
        microphonesEnabled: true,
        cameraEnabledUserIds: [],
        microphoneEnabledUserIds: []
      };
      const listKey = medium === "camera" ? "cameraEnabledUserIds" : "microphoneEnabledUserIds";
      const list = runtime[listKey];
      if (enabled && !list.includes(targetUserId)) list.push(targetUserId);
      else if (!enabled) runtime[listKey] = list.filter((id) => id !== targetUserId);
      state.studentMediaRuntime = runtime;
      break;
    }
  }

  return input.repository.updateClassroomState(input.roomId, {
    state,
    ...(input.action.expectedVersion !== undefined ? { expectedVersion: input.action.expectedVersion } : {})
  });
}

export { buildLessonRecap, filterLessonRunForActor, renderRecapCsv };
