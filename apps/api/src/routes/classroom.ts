import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  ClassroomActionSchema,
  ClassroomStateSchema,
  RoomSkinMessageSchema,
  getRoomTypeFeatureFlags,
  type ClassroomState,
  type RoomType
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import type { AuthContext } from "../auth.js";
import { requireRoomAccess, requireUser } from "../http/auth-guards.js";
import { parseBody, parseParams, parseQuery } from "../http/parse.js";
import { forbidden, notFound, unprocessableEntity, worldSkinsDisabled } from "../errors.js";
import type { Repository } from "../repository.js";
import { runClassroomAction } from "../classroom/run-classroom-action.js";
import { hydrateClassroomDisplayNames, sanitizeClassroomState } from "../classroom/state.js";
import {
  type ClassroomActor,
  buildLessonRecap,
  DEFAULT_PODS_RUNTIME,
  filterLessonRunForActor,
  isCheckVisibleToStudent,
  renderRecapCsv
} from "../classroom/lesson-runtime.js";

const ParamsWithRoomId = z.object({ roomId: z.string() });
const ParamsWithRoomAndRunId = z.object({ roomId: z.string(), runId: z.string() });

function requireTeacher(actor: ClassroomActor) {
  if (actor.role !== "teacher") throw forbidden("Teacher role required for this classroom action");
}

function assertRoomTypeSupportsClassroomState(room: { type?: RoomType | string | null | undefined }) {
  if (!getRoomTypeFeatureFlags(room.type).classroomState) {
    throw notFound("Classroom features are unavailable for this room type");
  }
}

async function resolveClassroomActor(input: {
  repository: Repository;
  room: { classId: string };
  membership: { role: string; displayName: string } | undefined;
  auth: AuthContext;
}): Promise<ClassroomActor> {
  const classRecord = await input.repository.getClass(input.room.classId);
  const teacher = input.membership?.role === "teacher" || classRecord?.teacherUserId === input.auth.userId;
  return {
    userId: input.auth.userId,
    displayName: input.membership?.displayName ?? input.auth.displayName,
    role: teacher ? "teacher" : "student"
  };
}

function filterClassroomStateForActor(state: ClassroomState, actor: ClassroomActor) {
  if (actor.role === "teacher") {
    return ClassroomStateSchema.parse(state);
  }

  const podsRuntime = state.podsRuntime ?? DEFAULT_PODS_RUNTIME;

  return ClassroomStateSchema.parse({
    ...state,
    helpRequests: state.helpRequests.filter((request) => request.userId === actor.userId),
    boardAccessGrants: state.boardAccessGrants.filter((grant) => grant.userId === actor.userId),
    privateChecks: state.privateChecks
      .filter((check) => isCheckVisibleToStudent(state, check, actor.userId))
      .map((check) => ({
        ...check,
        responses: check.responses.filter((response) => response.userId === actor.userId)
      })),
    podsRuntime: {
      podsEnabled: podsRuntime.podsEnabled,
      broadcastFromUserIds: podsRuntime.broadcastFromUserIds.includes(actor.userId) ? [actor.userId] : []
    },
    lessonRun: filterLessonRunForActor(state.lessonRun, actor)
  });
}

export async function registerClassroomRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, repository } = ctx;

  app.get("/v1/rooms/:roomId/classroom", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const { room, membership } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomTypeSupportsClassroomState(room);
    const actor = await resolveClassroomActor({ repository, room, membership, auth });
    const state = sanitizeClassroomState(await repository.getClassroomState(params.roomId));
    const hydrated = await hydrateClassroomDisplayNames(repository, room.classId, state);
    return filterClassroomStateForActor(hydrated, actor);
  });

  app.post("/v1/rooms/:roomId/classroom/actions", async (request) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomId, request);
    const body = parseBody(ClassroomActionSchema, request);
    const { room, membership } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomTypeSupportsClassroomState(room);
    const actor = await resolveClassroomActor({ repository, room, membership, auth });

    // Global student media toggle also persists to room settings (runtime seeded from settings on join).
    if (body.type === "set-student-media-global") {
      if (!config.tuning.enableStudentMediaPermissions) throw forbidden("Student media permissions are not enabled");
      requireTeacher(actor);
      const current = room.settings.studentMedia ?? { camerasEnabled: true, microphonesEnabled: true };
      const next = body.medium === "camera"
        ? { ...current, camerasEnabled: body.enabled }
        : { ...current, microphonesEnabled: body.enabled };
      await repository.updateRoom(params.roomId, { settings: { studentMedia: next } });
      // fall through to runClassroomAction so studentMediaRuntime is also updated
    }

    // World-skin actions mutate room settings rather than classroom state
    if (body.type === "set-room-skin" || body.type === "set-room-skin-day-night") {
      if (!config.tuning.enableWorldSkins) throw worldSkinsDisabled();
      requireTeacher(actor);
      const ws = room.settings.worldSkins ?? { enabled: true, skinId: null, skinDayNightMode: "day" as const, ambientGainOverride: null };

      if (body.type === "set-room-skin") {
        if (body.skinId !== null) {
          const exists = await repository.getWorldSkin(body.skinId);
          if (!exists) throw notFound("World skin not found");
        }
        await repository.updateRoom(params.roomId, { settings: { worldSkins: { ...ws, skinId: body.skinId } } });
        const msg = RoomSkinMessageSchema.parse({ type: "room.skin.v1", skinId: body.skinId, dayNight: ws.skinDayNightMode, crossfadeMs: 1000 });
        return { skinId: body.skinId, realtimeMessages: [msg] };
      }

      if (body.type === "set-room-skin-day-night") {
        if (ws.skinId !== "roman-forum") throw unprocessableEntity("Day/night mode is only supported for the roman-forum skin");
        await repository.updateRoom(params.roomId, { settings: { worldSkins: { ...ws, skinDayNightMode: body.mode } } });
        const msg = RoomSkinMessageSchema.parse({ type: "room.skin.v1", skinId: ws.skinId, dayNight: body.mode, crossfadeMs: 1000 });
        return { dayNight: body.mode, realtimeMessages: [msg] };
      }
    }

    const state = await runClassroomAction({
      repository,
      roomId: params.roomId,
      classId: room.classId,
      actor,
      action: body,
      lessonsEnabled: config.tuning.enableClassroomLessons,
      breakoutPodsEnabled: config.tuning.enableBreakoutPods,
      studentMediaPermissionsEnabled: config.tuning.enableStudentMediaPermissions,
      roomSettings: room.settings
    });
    const hydrated = await hydrateClassroomDisplayNames(repository, room.classId, sanitizeClassroomState(state));
    return filterClassroomStateForActor(hydrated, actor);
  });

  app.get("/v1/rooms/:roomId/lesson-runs/:runId/recap", async (request, reply: FastifyReply) => {
    const auth = await requireUser(request, config, repository);
    const params = parseParams(ParamsWithRoomAndRunId, request);
    const { room, membership } = await requireRoomAccess(repository, params.roomId, auth);
    assertRoomTypeSupportsClassroomState(room);
    const actor = await resolveClassroomActor({ repository, room, membership, auth });
    requireTeacher(actor);

    const state = sanitizeClassroomState(await repository.getClassroomState(params.roomId));
    const hydrated = await hydrateClassroomDisplayNames(repository, room.classId, state);
    const run = hydrated.lessonRun;
    if (!run || run.id !== params.runId) throw notFound("Lesson run not found");

    const memberships = await repository.listMemberships(room.classId);
    const recap = buildLessonRecap({ memberships, room, state: hydrated, run });

    const format = parseQuery(z.object({ format: z.string().optional() }), request).format;
    if (format === "csv") {
      const displayNameById = new Map(memberships.map((m) => [m.userId, m.displayName]));
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="recap-${run.id}.csv"`)
        .send(renderRecapCsv(recap, displayNameById));
    }
    return recap;
  });
}
