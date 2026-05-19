# MVP+1 Classroom Tools Implementation Plan

Last updated: 2026-05-19
Branch target: `mvp-plus-one`
Companion plan: `MVP_PLUS_ONE_CLASSROOM_TOOLS_PLAN.md`

## Purpose

This document turns the classroom tools plan into an implementation roadmap. It is written for incremental delivery on top of the current MVP+1 wall media system.

The key implementation rule is: classroom state may add labels, requests, grants, prompts, groups, and focus targets, but it must not replace live avatar state. Avatar position and movement continue to flow through LiveKit data messages.

## Scope Summary

Implement in this order:

1. Classroom state contract and persistence.
2. People panel and help/hand raise.
3. Board access grants that authorize student wall sharing.
4. Private checks/quizzes with teacher-only responses.
5. Groups with positioning and hold zones.
6. Board highlight / focus.
7. Lesson planning and presentation as a separately phased system.

## Non-Goals For The First Pass

- Full LMS authoring.
- Gradebook integration.
- Complex student analytics.
- Durable avatar movement history.
- Multi-room group persistence.
- Whiteboard collaboration beyond wall-object integration.
- Rewriting wall media or room manifest architecture.

## Guiding Architecture

### Persisted State

Add a new room-scoped persisted record:

`ClassroomState`

- `roomId`
- `version`
- `helpRequests`
- `boardAccessGrants`
- `privateChecks`
- `groups`
- `spotlight`
- `lessonRun`
- `createdAt`
- `updatedAt`

The record should be stored in memory repository and Mongo repository, similar to wall objects. Use version increments on each mutation.

### Transient State

Keep these out of `ClassroomState`:

- Current avatar positions.
- Avatar movement state.
- Speaking state.
- LiveKit track subscription state.

The UI can decorate participants with classroom metadata, but classroom metadata should never create or overwrite avatar movement state except when a participant is newly discovered and needs a placeholder until their first avatar message arrives.

### API Pattern

Use a single action endpoint for classroom state mutations:

- `GET /v1/rooms/:roomId/classroom`
- `POST /v1/rooms/:roomId/classroom/actions`

Action endpoint advantages:

- One versioned state record.
- Easy optimistic locking.
- Realtime can announce version changes.
- Room authorization is centralized.
- Later lesson-run actions fit the same model.

Alternative dedicated endpoints are acceptable if preferred, but the action pattern keeps the first implementation compact.

## Contracts

Add schemas in `packages/contracts/src/index.ts`.

### Core Schemas

```ts
export const ClassroomHelpRequestSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  note: z.string().max(500).optional(),
  status: z.enum(["raised", "acknowledged", "closed", "cancelled"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedByUserId: z.string().optional()
});

export const ClassroomBoardAccessGrantSchema = z.object({
  id: z.string(),
  userId: z.string(),
  wallAnchorId: z.string(),
  requestId: z.string().optional(),
  allowedObjectTypes: z.array(WallObjectTypeSchema).default([]),
  status: z.enum(["active", "revoked", "expired"]),
  expiresAt: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ClassroomGroupSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(80),
  color: z.string().min(1).max(40),
  memberUserIds: z.array(z.string()),
  targetPosition: Vector3Schema.optional(),
  targetWallAnchorId: z.string().optional(),
  hold: z.object({
    enabled: z.boolean(),
    mode: z.enum(["soft", "hard"]).default("soft"),
    radiusMeters: z.number().positive().default(2)
  }).optional(),
  status: z.enum(["active", "released", "archived"]),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ClassroomSpotlightSchema = z.object({
  targetType: z.enum(["wall-anchor", "wall-object"]),
  anchorId: z.string().optional(),
  objectId: z.string().optional(),
  title: z.string().max(160).optional(),
  instruction: z.string().max(500).optional(),
  mode: z.enum(["highlight", "guide", "force"]),
  createdByUserId: z.string(),
  startedAt: z.string(),
  expiresAt: z.string().optional()
});
```

### Private Check Schemas

```ts
export const ClassroomPrivateCheckChoiceSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(200)
});

export const ClassroomPrivateCheckResponseSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  choiceId: z.string().optional(),
  answer: z.string().max(2000).optional(),
  confidence: z.number().min(1).max(5).optional(),
  submittedAt: z.string()
});

export const ClassroomPrivateCheckSchema = z.object({
  id: z.string(),
  question: z.string().min(1).max(1000),
  promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
  choices: z.array(ClassroomPrivateCheckChoiceSchema).default([]),
  target: z.object({
    kind: z.enum(["all", "group", "users"]).default("all"),
    groupId: z.string().optional(),
    userIds: z.array(z.string()).default([])
  }).default({ kind: "all", userIds: [] }),
  status: z.enum(["draft", "open", "closed", "archived"]),
  visibility: z.enum(["teacher-only", "anonymous-aggregate"]).default("teacher-only"),
  responses: z.array(ClassroomPrivateCheckResponseSchema).default([]),
  wallAnchorId: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
```

### Classroom State Schema

```ts
export const ClassroomStateSchema = z.object({
  roomId: z.string(),
  version: z.number().int().positive(),
  helpRequests: z.array(ClassroomHelpRequestSchema).default([]),
  boardAccessGrants: z.array(ClassroomBoardAccessGrantSchema).default([]),
  privateChecks: z.array(ClassroomPrivateCheckSchema).default([]),
  groups: z.array(ClassroomGroupSchema).default([]),
  spotlight: ClassroomSpotlightSchema.nullable().default(null),
  lessonRun: z.record(z.unknown()).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string()
});
```

### Actions

Use a discriminated union:

- `raise-hand`
- `cancel-help`
- `acknowledge-help`
- `close-help`
- `grant-board-access`
- `revoke-board-access`
- `create-private-check`
- `open-private-check`
- `close-private-check`
- `reopen-private-check`
- `submit-private-check`
- `create-group`
- `update-group`
- `assign-group`
- `release-group`
- `set-spotlight`
- `clear-spotlight`

Each action should support optional `expectedVersion` for optimistic locking.

### Realtime Messages

Add:

```ts
export const ClassroomStateChangedRealtimeSchema = z.object({
  type: z.literal("classroom.state.changed.v1"),
  roomId: z.string(),
  version: z.number().int().positive(),
  sentAt: z.number().int(),
  senderId: z.string()
});

export const ClassroomStateRealtimeSchema = z.object({
  type: z.literal("classroom.state.v1"),
  roomId: z.string(),
  state: ClassroomStateSchema,
  sentAt: z.number().int(),
  senderId: z.string()
});
```

The first implementation can publish only `classroom.state.changed.v1` and let clients refresh. This avoids leaking private quiz responses to student clients.

## Backend Implementation

### Repository

Add methods:

- `getClassroomState(roomId: string): Promise<ClassroomState>`
- `updateClassroomState(roomId: string, input: { state: ClassroomState; expectedVersion?: number }): Promise<ClassroomState>`

Memory repository:

- Store in `Map<string, ClassroomState>`.
- Create default state lazily.
- Increment version on update.

Mongo repository:

- Add `ClassroomState` model.
- Unique index on `roomId`.
- Use `findOneAndUpdate` with expected version when supplied.
- Store arrays directly at first; split into collections only if size or query shape requires it later.

### API Routes

Add routes:

- `GET /v1/rooms/:roomId/classroom`
- `POST /v1/rooms/:roomId/classroom/actions`

Authorization rules:

- Any active room member can read classroom state, but private check responses must be filtered.
- Teacher gets full state.
- Student gets:
  - all help requests only if safe, or ideally only their own request status.
  - grants relevant to them plus public metadata.
  - private check prompts but only their own response.
  - groups and spotlight.
- Teacher-only actions enforced server-side.
- Student actions limited to own help request, own quiz response, own granted wall creation, own live-share stop.

### Privacy Filtering

Implement:

- `filterClassroomStateForActor(state, actor)`

Rules:

- Teacher: full state.
- Student:
  - private check `responses` array filtered to `response.userId === actor.userId`.
  - help requests filtered to own request unless teacher wants public raised-hand list.
  - board grants filtered to own grants plus minimal public grants if needed for board labels.

Do not publish full teacher state to all clients over realtime.

### Board Access Enforcement

Update wall object creation authorization:

Current student permissions are based mostly on room settings. Extend this with:

- If actor is teacher: allow existing teacher path.
- If room policy allows student direct creation: existing behavior.
- Else if active `ClassroomBoardAccessGrant` exists:
  - grant user matches actor.
  - grant wall anchor matches request.
  - grant status is active.
  - not expired.
  - object type is included in allowed types, or grant allows all configured student types.
  - room-level safety flags still apply for upload/live share types.
- Else deny.

Keep object moderation behavior:

- Teacher grants can either create active objects immediately or pending moderation based on room policy.
- First implementation should create active objects for explicit teacher grants.

### Room Events

Persist optional audit events:

- `classroom.help.raised.v1`
- `classroom.board_access.granted.v1`
- `classroom.private_check.created.v1`
- `classroom.group.updated.v1`
- `classroom.spotlight.set.v1`

Avoid storing private response payloads in generic room events unless access-controlled.

## Frontend Implementation

### New Hook: `useClassroomState`

Location: `apps/web/lib/useClassroomState.ts`

Responsibilities:

- Fetch `GET /classroom`.
- Expose `state`, `loading`, `error`, `refresh`, and `runAction`.
- Publish `classroom.state.changed.v1` after successful actions.
- Listen for classroom realtime messages and refresh on newer version.
- Keep polling modest as fallback, e.g. every 3-5 seconds, but only for classroom state. Never use this polling to create or overwrite participant avatar states.

### Realtime Adapter

Update `apps/web/lib/realtime.ts`:

- Add classroom realtime message schemas to `RealtimeMessage`.
- Ignore messages sent by the same participant where appropriate.
- Keep safe publish guards:
  - closed client should no-op.
  - LiveKit publish rejections during teardown should be caught.
- Add LiveKit participant discovery if needed for roster:
  - On `ParticipantConnected`, emit presence from LiveKit participant identity/name/metadata.
  - On initial connect, emit presence for existing remote participants.
  - Do not use API participant polling to synthesize avatar positions.

Important: participant discovery may create a placeholder at spawn until first avatar state arrives, but it must never overwrite an existing participant's `state` position.

### New Component: `ClassroomPanel`

Location: `apps/web/components/ClassroomPanel.tsx`

Teacher sections:

- Help queue.
- Board access.
- Private checks.
- Groups.
- Focus.
- Lesson run placeholder later.

Student sections:

- Raise hand / cancel hand.
- Active board grant.
- Active private checks.
- Group assignment.
- Current focus.

Design constraints:

- Compact enough for the existing right HUD.
- Use existing form styles where possible.
- Avoid adding scroll traps inside the 3D stage.

### Roster Enhancements

Update `apps/web/components/Roster.tsx`:

- Accept optional `classroomState`.
- Show group tag/color.
- Show help badge.
- Show teacher tag.
- Keep `data-testid` values for Playwright.
- Do not hide participants because of classroom state.

### Room Client Wiring

Update `apps/web/components/RoomClient.tsx`:

- Initialize `useClassroomState` after session/manifest are ready.
- Pass state to `Roster`, `RoomView3D`, and `RoomView2D`.
- Render `ClassroomPanel` alongside `AnchorPanel` or integrate it as a tabbed right panel.
- Handle focus navigation:
  - `goToClassroomFocus()`
  - `goToGroup(group)`
- Respect active board grants when showing wall creation actions to students.

Avoid:

- Polling active room participants from API and merging them into avatar state.
- Calling `createAvatarState` for known participants on classroom refresh.
- Resetting `lastSeenAt` except from actual presence/avatar/media events.

### 3D View

Update `RoomView3D`:

- Avatar color can use group color.
- Nameplate can show help/group/speaking state.
- Board highlight for `spotlight.anchorId`.
- Wall object highlight for `spotlight.objectId`.
- Optional group zones drawn as translucent floor circles or simple markers.

### 2D View

Update `RoomView2D`:

- Group color around participant dots.
- Focused board highlight.
- Group zones.
- Help/group badges in accessible list.

### Anchor Panel

Update `AnchorPanel`:

- Student can create on a board if:
  - room policy allows it, or
  - active grant allows the selected anchor and type.
- Show grant status and expiration.
- Hide unsupported object types using existing anchor metadata.

## Lesson Planning Implementation

Treat lesson planning as a second project layered on classroom state.

### Phase L0: Design Contracts

Add schemas:

- `LessonPlan`
- `LessonStep`
- `LessonRun`
- `LessonRunAction`

Step types:

- `instruction`
- `focus-board`
- `wall-object`
- `private-check`
- `group-work`
- `timer`
- `student-share`

### Phase L1: Live Lesson Script

Implement room-local live scripts:

- Teacher creates ordered steps inside a room.
- Steps are stored in `lessonRun`.
- Teacher advances/backtracks.
- Current step updates spotlight, checks, groups, or timers through existing classroom actions.

### Phase L2: Reusable Plans

Promote scripts to reusable plans:

- Persist at class scope.
- Duplicate into room runs.
- Attach wall assets by reference or template slots.

### Phase L3: Presentation Mode

Teacher mode:

- Current step.
- Next step preview.
- Speaker notes.
- Advance/back.
- Start/stop run.

Student mode:

- Current instruction.
- Active prompt.
- Active group/focus state.
- Minimal controls.

## Implementation Phases

### Phase 0: Safety Baseline

Deliverables:

- Confirm local LiveKit env works and clients receive JWTs, not `dev-token`, for cross-device local testing.
- Add safe LiveKit publish guards if not already present.
- Add participant discovery from LiveKit without API avatar-state merging.
- Add tests or manual checklist for teacher/student avatar movement after any classroom-state changes.

Validation:

- Teacher and student see each other's movement in production-like LiveKit mode.
- No `UnexpectedConnectionState: PC manager is closed` unhandled rejections during leave/navigation.
- BroadcastChannel fallback still works for two same-origin local tabs.

### Phase 1: Contracts And Persistence

Deliverables:

- Classroom schemas in contracts.
- OpenAPI route entries.
- Memory/Mongo repository support.
- API routes for get/action.
- Role-filtered classroom state responses.

Validation:

- Typecheck contracts/API.
- API tests for default state, teacher action, student action, privacy filtering, optimistic version conflict.

### Phase 2: Help / Raise Hand

Deliverables:

- Student raise/cancel hand UI.
- Teacher help queue.
- Realtime refresh on state change.
- Roster help badges.

Validation:

- Student raises hand; teacher sees it.
- Teacher acknowledges/closes; student sees status.
- Student cannot close another student's request.

### Phase 3: Board Access Grants

Deliverables:

- Teacher grant/revoke UI.
- Student grant UI.
- Backend wall-object creation checks grant scope.
- Anchor panel respects active grants.
- Teacher can remove student object.

Validation:

- Student without grant cannot create on teacher-only room.
- Student with grant can create only on granted board.
- Grant expiration/revoke stops creation.
- Teacher can moderate/remove object.

### Phase 4: Private Checks

Status: Complete locally as of 2026-05-19.

Deliverables:

- Teacher create/open/close simple private check.
- Student active check form.
- Teacher response list.
- Student response filtering.
- Optional aggregate result wall object after close.

Validation:

- Multiple students answer.
- Teacher sees all responses.
- Student sees only own response.
- Closed check rejects new submissions unless reopened.

Validation evidence:

- `npm --workspace @3dspace/web run typecheck` — pass.
- `npm --workspace @3dspace/api run typecheck` — pass.
- `npm run test -- apps/api/tests/api.test.ts -t "filters classroom state|private-check"` — pass.
- `npm run test -- apps/api/tests/api.test.ts` currently has an unrelated wall-object policy assertion failure (`409` received where the older test expects `400`).

### Phase 5: Groups

Deliverables:

- Teacher create group.
- Assign students.
- Group color/tag in roster and avatars.
- Target position and "go to group" action.
- Soft hold first; hard hold optional.
- Release group.

Validation:

- Student assignment hydrates on join.
- Group labels/color visible in 3D and 2D.
- Hold does not break keyboard/touch movement.
- Release restores normal movement.

### Phase 6: Board Focus

Deliverables:

- Teacher set/clear focus target.
- Highlight in 3D and 2D.
- Student focus callout.
- Optional force/guide behavior.

Validation:

- Mid-session and late-joining students see active focus.
- Clearing focus removes highlight.
- Accessibility path exists in 2D.

### Phase 7: Lesson Planning Discovery Slice

Detailed plan: see `MVP_PLUS_ONE_LESSON_PLANNING_DISCOVERY_PLAN.md`.

Deliverables:

- Contract/design spike for lesson plans and runs.
- Implement live lesson script only if the classroom tools foundation is stable.
- Do not block classroom tools release on lesson planning.

Validation:

- Teacher can create a short run with focus, timer, check, group work.
- Advancing steps drives existing classroom actions.

## Testing Plan

### Unit / Contract

- Zod schema parsing for all classroom entities.
- Action reducer/state mutation tests.
- Privacy filter tests.
- Board grant authorization tests.
- Group hold utility tests in room engine if movement clamps are added.

### API

- Teacher can create classroom actions.
- Student can only perform own allowed actions.
- Private responses filtered by role.
- Board grant unlocks student wall-object creation only in scope.
- Version conflict returns `409`.
- Mongo repository mirrors memory repository behavior.

### Web Component

- Roster badges for help/group.
- Classroom panel teacher/student states.
- Private check form validation.
- Anchor panel grant gating.

### Playwright

Minimum browser flows:

- Teacher/student join room and maintain avatar movement.
- Student raises hand, teacher acknowledges.
- Teacher grants board, student shares note/file/live object, teacher revokes.
- Teacher creates private check, student submits, teacher sees answer.
- Teacher creates group, assigns student, student sees group tag.
- Teacher focuses board, student sees focus highlight/callout.

### Manual Validation

Because browser media permissions and LiveKit provider behavior are hard to fully automate:

- Camera pin with active board grant.
- Screen share with active board grant.
- Mic/camera publish while classroom updates are flowing.
- Leave/rejoin room while focus/check/group state is active.
- Local dev using real LiveKit env vars and production deployment.

## Rollout Plan

1. Ship hidden behind room settings or feature flags.
2. Enable teacher-only help/focus first.
3. Enable private checks.
4. Enable explicit board grants.
5. Enable groups/hold after movement QA.
6. Keep lesson planning behind a separate flag until re-planned.

Potential env flags:

- `ENABLE_CLASSROOM_TOOLS`
- `ENABLE_CLASSROOM_PRIVATE_CHECKS`
- `ENABLE_CLASSROOM_BOARD_GRANTS`
- `ENABLE_CLASSROOM_GROUPS`
- `ENABLE_CLASSROOM_LESSONS`

Room settings should also carry classroom capabilities so deployed clients know what to show.

## Migration Notes

- Existing rooms should hydrate a default empty `ClassroomState`.
- No room manifest migration should be required.
- Existing wall objects remain valid.
- Board grants should layer on top of room settings without changing existing teacher-only defaults.
- If full lesson planning adds reusable plans, that should be a new collection and not embedded into current room records.

## Risks And Mitigations

### Risk: Classroom Polling Breaks Avatar Movement

Do not poll participants from API and synthesize avatar positions. Classroom state can decorate known participants, but avatar position must come from avatar realtime messages.

### Risk: Private Responses Leak To Students

Use role-filtered API responses and avoid full-state broadcasts to all clients. Realtime should announce changed versions, not response payloads.

### Risk: Teacher Grants Become Permanent Student Admin Rights

Make grants explicit, scoped, revocable, and expiring. Check server-side on every wall object creation.

### Risk: Hard Hold Feels Hostile Or Buggy

Start with soft hold or a clearly visible radius. Add hard hold only if classroom UX proves it is necessary.

### Risk: Lesson Planning Scope Creep

Keep lesson planning separate from first classroom tools release. Start with live lesson scripts, then reusable plans.

## Definition Of Done

The classroom tools implementation is done when:

- All first-pass features work in 3D and 2D.
- Teacher/student authorization is enforced server-side.
- Private quiz response privacy is covered by tests.
- Board grants are scoped and revocable.
- Group state is visible and does not destabilize movement.
- Focus state hydrates for late joiners.
- Avatar movement remains stable in LiveKit mode and BroadcastChannel fallback.
- `MVP_PLUS_ONE_STATUS.md` is updated with validation evidence.
- Env docs are updated if classroom feature flags are added.
