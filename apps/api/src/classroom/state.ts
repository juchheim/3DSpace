import {
  ClassroomStateSchema,
  LessonRunSchema,
  type ClassroomState,
  type LessonRun
} from "@3dspace/contracts";
import type { Repository } from "../repository.js";

const DEFAULT_PODS_RUNTIME = {
  podsEnabled: false,
  broadcastFromUserIds: [] as string[]
};

function normalizeLegacyLessonRun(run: LessonRun | null | undefined) {
  if (run == null) return null;

  function stripNulls(value: unknown): unknown {
    if (value === null) return undefined;
    if (Array.isArray(value)) return value.map((entry) => stripNulls(entry));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).flatMap(([key, entry]) => {
          const normalized = stripNulls(entry);
          return normalized === undefined ? [] : [[key, normalized]];
        })
      );
    }
    return value;
  }

  const parsed = LessonRunSchema.safeParse(stripNulls(run));
  return parsed.success ? parsed.data : null;
}

export async function hydrateClassroomDisplayNames(repository: Repository, classId: string, state: ClassroomState) {
  const memberships = await repository.listMemberships(classId);
  const displayNames = new Map(memberships.map((membership) => [membership.userId, membership.displayName]));
  const resolvedDisplayName = (userId: string, current: string) => {
    const membershipDisplayName = displayNames.get(userId);
    if (!membershipDisplayName || membershipDisplayName === userId) return current;
    return membershipDisplayName;
  };
  return ClassroomStateSchema.parse({
    ...state,
    helpRequests: state.helpRequests.map((request) => ({
      ...request,
      displayName: resolvedDisplayName(request.userId, request.displayName)
    })),
    privateChecks: state.privateChecks.map((check) => ({
      ...check,
      responses: check.responses.map((response) => ({
        ...response,
        displayName: resolvedDisplayName(response.userId, response.displayName)
      }))
    }))
  });
}

export function sanitizeClassroomState(state: ClassroomState): ClassroomState {
  const normalizedLessonRun = normalizeLegacyLessonRun(state.lessonRun);
  const podsRuntime = state.podsRuntime ?? DEFAULT_PODS_RUNTIME;

  return ClassroomStateSchema.parse({
    ...state,
    helpRequests: state.helpRequests.map((request) => ({
      id: request.id,
      userId: request.userId,
      displayName: request.displayName,
      ...(typeof request.note === "string" ? { note: request.note } : {}),
      kind: request.kind,
      status: request.status,
      ...(typeof request.approvedAt === "string" ? { approvedAt: request.approvedAt } : {}),
      ...(typeof request.returnedAt === "string" ? { returnedAt: request.returnedAt } : {}),
      ...(typeof request.durationSeconds === "number" ? { durationSeconds: request.durationSeconds } : {}),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      ...(typeof request.closedByUserId === "string" ? { closedByUserId: request.closedByUserId } : {})
    })),
    boardAccessGrants: state.boardAccessGrants.map((grant) => ({
      id: grant.id,
      userId: grant.userId,
      wallAnchorId: grant.wallAnchorId,
      ...(typeof grant.requestId === "string" ? { requestId: grant.requestId } : {}),
      allowedObjectTypes: grant.allowedObjectTypes,
      status: grant.status,
      ...(typeof grant.expiresAt === "string" ? { expiresAt: grant.expiresAt } : {}),
      createdByUserId: grant.createdByUserId,
      createdAt: grant.createdAt,
      updatedAt: grant.updatedAt
    })),
    privateChecks: state.privateChecks.map((check) => ({
      id: check.id,
      question: check.question,
      promptType: check.promptType,
      choices: check.choices.map((choice) => ({ id: choice.id, label: choice.label })),
      target: {
        kind: check.target.kind,
        ...(typeof check.target.groupId === "string" ? { groupId: check.target.groupId } : {}),
        userIds: check.target.userIds
      },
      status: check.status,
      visibility: check.visibility,
      responses: check.responses.map((response) => ({
        userId: response.userId,
        displayName: response.displayName,
        ...(typeof response.choiceId === "string" ? { choiceId: response.choiceId } : {}),
        ...(typeof response.answer === "string" ? { answer: response.answer } : {}),
        ...(typeof response.confidence === "number" ? { confidence: response.confidence } : {}),
        submittedAt: response.submittedAt
      })),
      ...(typeof check.wallAnchorId === "string" ? { wallAnchorId: check.wallAnchorId } : {}),
      createdByUserId: check.createdByUserId,
      createdAt: check.createdAt,
      updatedAt: check.updatedAt
    })),
    groups: state.groups.map((group) => ({
      id: group.id,
      label: group.label,
      color: group.color,
      memberUserIds: group.memberUserIds,
      ...(group.targetPosition ? { targetPosition: group.targetPosition } : {}),
      ...(typeof group.targetWallAnchorId === "string" ? { targetWallAnchorId: group.targetWallAnchorId } : {}),
      ...(group.hold
        ? {
            hold: {
              enabled: group.hold.enabled,
              mode: group.hold.mode,
              radiusMeters: group.hold.radiusMeters
            }
          }
        : {}),
      status: group.status,
      createdByUserId: group.createdByUserId,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    })),
    spotlight:
      state.spotlight && typeof state.spotlight === "object"
        ? {
            targetType: state.spotlight.targetType,
            ...(typeof state.spotlight.anchorId === "string" ? { anchorId: state.spotlight.anchorId } : {}),
            ...(typeof state.spotlight.objectId === "string" ? { objectId: state.spotlight.objectId } : {}),
            ...(typeof state.spotlight.title === "string" ? { title: state.spotlight.title } : {}),
            ...(typeof state.spotlight.instruction === "string" ? { instruction: state.spotlight.instruction } : {}),
            mode: state.spotlight.mode,
            createdByUserId: state.spotlight.createdByUserId,
            startedAt: state.spotlight.startedAt,
            ...(typeof state.spotlight.expiresAt === "string" ? { expiresAt: state.spotlight.expiresAt } : {})
          }
        : null,
    podsRuntime: {
      podsEnabled: podsRuntime.podsEnabled,
      broadcastFromUserIds: [...new Set(podsRuntime.broadcastFromUserIds.filter((userId) => typeof userId === "string" && userId.length > 0))]
    },
    lessonRun: normalizedLessonRun
  });
}
