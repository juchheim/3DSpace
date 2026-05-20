# MVP+1 Lesson Planning Discovery Slice Plan

Last updated: 2026-05-19
Branch target: `mvp-plus-one`
Parent docs:

- `MVP_PLUS_ONE_CLASSROOM_TOOLS_PLAN.md` (Feature 5: Full Lesson Planning And Presentation)
- `MVP_PLUS_ONE_CLASSROOM_TOOLS_IMPLEMENTATION.md` (Phase 7: Lesson Planning Discovery Slice)
- `MVP_PLUS_ONE_WALL_MEDIA_PLAN.md` (wall objects, anchors, signed assets, realtime)
- `MVP_STATUS.md` and `MVP_PLUS_ONE_STATUS.md` (current production state)

## Purpose

Phases 1–6 of the classroom tools roadmap (state contract, raise hand, board grants, private checks, groups, focus) are now implemented locally on `mvp-plus-one`. This document specifies Phase 7: a deliberately small, learn-by-shipping discovery slice for lesson planning.

Lesson planning is the highest-leverage feature in the 3DSpace roadmap. The whole product exists to let a teacher do something purposeful with a class. Until a teacher can sequence focus, prompts, group work, sharing, and timing into a single live flow, classroom tools are a kit of parts, not a lesson.

This phase is explicitly a **discovery slice**, not a full lesson-planning product. The slice exists to:

1. Validate the architectural assumption that "a lesson is an orchestrator of existing classroom actions."
2. Surface real teacher workflows so we can refine step types, ordering, persistence, and presentation mode.
3. Avoid over-investing in authoring/LMS UI before we know which step types teachers reach for in practice.

Everything in this document should be readable as "what we will ship for Phase 7 and what we will deliberately not ship yet."

## Why Lesson Planning Is The Most Important Feature

- Teachers do not adopt a tool because of avatars or wall media; they adopt it because it makes a live lesson easier to deliver.
- The classroom-tools primitives (focus, check, group, grant, timer) are powerful but high-touch. Without a plan, a teacher must remember to manually trigger each action in the right order while watching 30 students.
- A lesson plan is the place where instructional intent lives. Once we own that intent in the system, every downstream feature (analytics, exports, replay, AI assistance, multi-class reuse) has a meaningful object to attach to.
- A lesson plan is also the place where 3DSpace can defend against scope creep. With a sequenced plan, we know which classroom actions actually need polish and which are theoretical.

For these reasons, the discovery slice is small but treated as a strategically important foundation. We are not free to design lesson planning as a one-off side panel; we are designing the entry point for a long-lived subsystem.

## Existing Foundation We Build On

From MVP and MVP+1 the lesson planning slice can assume:

- Authenticated rooms with teacher/student roles.
- `RoomManifest` with wall anchors, bounds, spawn points, and a 2D projection.
- `WallObject` persistence and realtime sync for images, videos, audio, notes, polls, timers, links, allowlisted embeds, and live camera/mic/screen pins.
- `ClassroomState` with help requests, board access grants, private checks, groups, and spotlight; persisted in memory and Mongo with optimistic versioning.
- `POST /v1/rooms/:roomId/classroom/actions` discriminated-action endpoint with privacy filtering and `expectedVersion` optimistic locking.
- Realtime announcement of classroom state changes via `classroom.state.changed.v1`, plus role-filtered GET refresh.
- Frontend `useClassroomState`, `ClassroomPanel`, `Roster`, `BoardAccessSidePanel`, `BoardAccessGrantControls`, `PrivateChecksPanel`, `GroupsPanel`, `FocusPanel`, `AnchorPanel`, and `RoomView3D`/`RoomView2D`.
- LiveKit data channel for transient avatar/media state (kept strictly separate from classroom state).

The reserved field `ClassroomStateSchema.lessonRun` is already defined as `z.record(z.unknown()).nullable().default(null)` in the contracts. Phase 7 specializes this field with a concrete schema and threads orchestration through the existing action endpoint.

## Core Architectural Bet

> A lesson is not a new domain. A lesson is a saved sequence of teacher intentions, where each intention executes one or more existing classroom actions and is reversible.

Concretely:

- The lesson run is a **teacher-side orchestrator**.
- Each lesson step has a known **start side-effect** (one or more classroom actions) and a known **cleanup side-effect** (the inverse where it makes sense: clear spotlight, close check, release group, stop timer, revoke grant).
- Students never see "the lesson run" directly. They see the classroom-state side effects (active focus, active prompt, group assignment) plus a lightweight "Current step" callout.
- Teachers can override or interleave manual classroom actions during a run without crashing the script. Overriding only marks a step as "drifted," it does not block advancing.

This bet keeps the scope small and the failure modes well-bounded. If a teacher hates the lesson run, they fall back to manual classroom tools without breaking anything. If they love it, we have a runway to add reusable plans, presentation mode, and analytics on top of the same primitives.

## Scope Of The Discovery Slice

In scope for Phase 7:

- Add a concrete `LessonRun` schema slotted into `ClassroomState.lessonRun`.
- Add classroom actions for creating, editing, starting, advancing, retreating, pausing, resuming, and ending a lesson run.
- Implement a small set of step types that map cleanly to existing classroom actions: `instruction`, `focus-board`, `private-check`, `group-work`, `timer`, `student-share`.
- Teacher-side authoring UI inside the room: an ordered editable script.
- Teacher-side presentation UI inside the room: current step, next step preview, advance/back/pause/end.
- Student-side current-step callout that supplements existing classroom UI.
- Late-join hydration: a student joining mid-run sees the current step and all of its active side effects.
- Persistence of the script and run history inside `ClassroomState` only.
- Realtime announcement of run version changes through the existing `classroom.state.changed.v1`.
- API, contract, and limited Playwright coverage.

Explicitly out of scope for Phase 7:

- Reusable lesson plan templates that live outside a single room session.
- Plan authoring outside the room (no `/lessons` page).
- LMS-style metadata: standards alignment, grade levels, learning objectives.
- Auto-advancing timers driving step transitions on the server.
- Per-step analytics or post-run reports beyond a simple timeline.
- AI-assisted lesson authoring.
- Step types we have not yet validated by hand: `discussion`, `exit-ticket`, `wall-object` auto-creation, multi-question quizzes inside a step, branching.
- Lesson run export (CSV, PDF, LTI, etc.).
- Cross-room lesson reuse.

We will revisit each "out of scope" item once the discovery slice has revealed which next investment is justified.

## Non-Goals

Beyond the out-of-scope items above, this slice is explicitly not:

- An attempt to define a complete teacher authoring product. It is a "live script" that lives with the room.
- A replacement for any manual classroom action. Every classroom action stays usable on its own.
- A second source of truth for classroom state. Lesson steps mutate `ClassroomState` through the same action endpoint that teacher hands use.
- A presentation system that takes over the screen. Presentation mode in this slice is a HUD treatment, not a full-screen mode.
- An authorization model with student authoring or co-teacher editing.

## User Stories

### Teacher Stories

1. As a teacher, in a live room, I can write a short ordered script of steps (focus a board, open a check, send to a group, run a timer, invite a student to share).
2. As a teacher, I can run the script live and step through it without leaving the room.
3. As a teacher, while running the script, I can advance, go back one step, pause the run, or end it early.
4. As a teacher, if I manually override a classroom state during a run (e.g., I drag focus to another board), the run does not crash; the current step is marked as drifted.
5. As a teacher, after I end a run, I can see a simple timeline of which steps ran and for how long.
6. As a teacher, I can clear the script and start a new one in the same room session.

### Student Stories

1. As a student, when a teacher starts a lesson run, I see a clear callout in the HUD: "Step 2 of 5 — Look at the diagram and discuss with your group."
2. As a student, the existing classroom UI (focus highlight, active check, group tag, board grant) continues to be authoritative for what I should do.
3. As a student, when I join mid-lesson, I see the current step and any active side effects without needing the teacher to re-trigger them.
4. As a student, I never see future steps, speaker notes, or other students' private responses.

### Failure / Edge Stories

1. As a teacher, when I lose connectivity mid-step, on reconnect the run resumes from the current step with the same side effects.
2. As a teacher, if a step references a deleted wall anchor or group, the step is shown as broken with a fix-it affordance, and advancing skips its side effect.
3. As a teacher, if two co-teachers are in the same room (future case), only one of us can edit the run at a time; the other sees the run in read-only.

## Vocabulary And Entity Model

### `LessonRun`

A teacher-owned, room-scoped, ordered sequence of `LessonStep`s plus a small amount of runtime state (current index, status, started/ended timestamps, drift markers).

Stored at `ClassroomState.lessonRun`. There is at most one `LessonRun` per room session in this slice.

### `LessonStep`

A single intention with a type, title, optional instruction body, optional teacher-only notes, and a type-specific payload that the orchestrator knows how to execute.

Steps are owned by a `LessonRun`. They are not addressable across runs in this slice.

### `LessonRunStepRecord`

A per-step execution record appended to `LessonRun.timeline` as the run progresses. Used for the simple post-run timeline view and for late-joiner hydration of the currently active step.

### `LessonStepSideEffect`

A descriptor of which classroom actions a step issues on start and on cleanup. Side effects are computed on the server when a step transitions; clients never invent them.

### `LessonAssetRef`

A typed pointer to an existing wall anchor, wall object, group, or private check that a step references. Asset refs are stored as IDs; the executor resolves them at transition time and emits the right classroom actions. Missing refs are tolerated and surfaced as broken steps.

## Step Types For The Discovery Slice

Each step type is defined by:

- Authoring payload (what the teacher fills in).
- Start side effect (the ordered list of classroom actions issued when the step becomes current).
- Cleanup side effect (issued when the step is no longer current, if reversible).
- Student visibility.
- Drift detection (how we know the teacher manually overrode this step's effect).

### 1. `instruction`

Authoring payload:

- `title` (≤120 chars).
- `body` (≤2000 chars; markdown-lite, plain text first).

Start side effect: none.

Cleanup side effect: none.

Student visibility: title and body shown in the lesson-step callout while this is the current step.

Drift detection: not applicable.

Use case: opening prompts, transitions, "Take 30 seconds to skim the diagram."

### 2. `focus-board`

Authoring payload:

- `anchorId` (required).
- `objectId` (optional; targets a specific wall object on that anchor).
- `mode`: `highlight` | `guide` | `force` (defaults to `highlight`).
- `title`, `instruction` (forwarded to the spotlight).

Start side effect: `set-spotlight` with `targetType`, `anchorId`, optional `objectId`, mode, title, instruction.

Cleanup side effect: `clear-spotlight` only if the live spotlight still equals what this step set. If the teacher manually changed the spotlight, leave it alone and mark the step as drifted.

Student visibility: existing focus callout and board highlight (no new UI required).

Drift detection: compare `state.spotlight` against the step's start descriptor at advance time.

### 3. `private-check`

Authoring payload:

- `question` (≤1000 chars).
- `promptType`: `multiple-choice` | `short-answer` | `confidence`.
- `choices` (for multiple-choice).
- `target`: `all` | `group` (with `groupId`) | `users` (with `userIds`).
- `wallAnchorId` (optional; mirrors the existing check anchor field).
- `autoCloseOnAdvance`: boolean, default `true`.

Start side effect: `create-private-check` (status `draft`) followed by `open-private-check`. The orchestrator stores the created `checkId` back into the step's execution record so the cleanup can target it.

Cleanup side effect: when `autoCloseOnAdvance` is true and the check is still `open`, issue `close-private-check`. Do not delete responses.

Student visibility: existing private check form. The lesson callout adds "Active check" context.

Drift detection: if the check is already `closed` when advancing, treat as already-cleaned-up. If `autoCloseOnAdvance` is false, leave the check open and let the teacher close it manually.

Notes: re-running a step that already created a check reuses the existing `checkId` instead of creating a new one. Going Back to a closed check should call `reopen-private-check` if `autoCloseOnAdvance` is true; otherwise leave as-is.

### 4. `group-work`

Authoring payload:

- One of:
  - `existingGroupId`: reuse a group already present in `ClassroomState.groups`.
  - `newGroup`: `{ label, color, memberUserIds, targetPosition?, targetWallAnchorId?, hold? }`.
- `releaseOnAdvance`: boolean, default `true`.

Start side effect:

- If `existingGroupId` is set: `assign-group` to refresh membership only if the step provides a roster override; otherwise no-op.
- If `newGroup` is set: `create-group` followed by `assign-group` for each member.
- Optionally `update-group` if the step changes `hold` settings vs the stored group.

Cleanup side effect: when `releaseOnAdvance` is true, issue `release-group` on the step's group(s). Do not delete the group from `ClassroomState.groups`; only flip status to `released`.

Student visibility: existing group tags in roster, avatar color, and group zone in 3D/2D.

Drift detection: compare `group.status` and `memberUserIds` at advance time; if the teacher reassigned everyone manually, mark as drifted but still attempt cleanup.

### 5. `timer`

Authoring payload:

- `durationSeconds` (≥5, ≤60×60).
- `label` (≤80 chars).
- `placement`: `hud` | `wall` (defaults to `hud`).
- `wallAnchorId` (required if `placement === "wall"`).
- `autoAdvanceOnComplete`: boolean, default `false`. (Stays client-driven in this slice; see "Auto-advance" below.)

Start side effect:

- `hud` placement: writes the timer into the step execution record only. The teacher HUD renders a live countdown driven by client time math. No classroom action is needed.
- `wall` placement: issues a wall-object `create` for an existing `timer` wall-object type on the chosen anchor, with `playback.state.v1 = playing` and `startedAt = now`, and stores the resulting `wallObjectId` in the step record.

Cleanup side effect: `wall` placement issues a wall-object `remove` only if the wall object is still owned by the step. `hud` placement clears the local timer.

Student visibility:

- `hud`: small countdown in the lesson-step callout.
- `wall`: existing wall timer rendering.

Drift detection: if the wall-object timer was deleted by the teacher, mark as drifted.

Auto-advance: server does not auto-advance steps in this slice. If `autoAdvanceOnComplete` is set, the teacher's client may issue an `advance-lesson-step` action when the local timer reaches zero, but only while the teacher's client is active and focused. We document this as best-effort.

### 6. `student-share`

Authoring payload:

- `userId` (required; the student we plan to invite to share).
- `wallAnchorId` (required).
- `allowedObjectTypes` (subset of board-grant types).
- `acknowledgeHandIfRaised`: boolean, default `true`.
- `revokeOnAdvance`: boolean, default `true`.
- `expiresAt` (optional ISO string; if absent, the grant lives until cleanup).

Start side effect:

- If `acknowledgeHandIfRaised` and the student has a raised hand: `acknowledge-help`.
- `grant-board-access` for the configured anchor and types.

Cleanup side effect: `revoke-board-access` on the grant that this step created, only if it is still `active`.

Student visibility: existing "Board access granted" panel and student wall-share affordances. Lesson callout adds "Your turn to share."

Drift detection: if the teacher manually revoked the grant before advance, the cleanup is a no-op and the step is marked complete normally.

### Deferred Step Types

We are intentionally not designing these for Phase 7. They are listed here so the schema leaves room for them later:

- `discussion`: an instruction + soft timer, possibly with a private-check follow-up.
- `exit-ticket`: a closing private check with optional public aggregate.
- `wall-object`: pre-create or pre-stage a wall object on a target anchor and clean it up on advance.
- `branching`: conditional advance based on private-check aggregate.
- `section-break`: a header used purely for navigation in long plans.

The schema includes a forward-compatible `kind` enum so we can extend without rewriting the executor.

## State Model

### Where Lesson State Lives

- The run, its steps, and its timeline live inside `ClassroomState.lessonRun`.
- Reusable templates do **not** exist yet. There is no `LessonPlan` collection in this slice.
- Per-step assets continue to live in their existing tables: spotlight, private checks, groups, wall objects.
- The lesson run only stores **IDs and intentions**, not duplicated copies of created assets.

This means the lesson run is small, the rest of `ClassroomState` is unchanged, and an authoring mistake in the run does not corrupt classroom state.

### `LessonRun` Shape

```ts
export const LessonStepKindSchema = z.enum([
  "instruction",
  "focus-board",
  "private-check",
  "group-work",
  "timer",
  "student-share"
]);

export const LessonStepInstructionPayloadSchema = z.object({
  body: z.string().max(2000).default("")
});

export const LessonStepFocusBoardPayloadSchema = z.object({
  anchorId: z.string(),
  objectId: z.string().optional(),
  mode: z.enum(["highlight", "guide", "force"]).default("highlight"),
  title: z.string().max(160).optional(),
  instruction: z.string().max(500).optional()
});

export const LessonStepPrivateCheckPayloadSchema = z.object({
  question: z.string().min(1).max(1000),
  promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
  choices: z.array(ClassroomPrivateCheckChoiceSchema).default([]),
  target: ClassroomPrivateCheckTargetSchema.default({ kind: "all", userIds: [] }),
  wallAnchorId: z.string().optional(),
  autoCloseOnAdvance: z.boolean().default(true)
});

export const LessonStepGroupWorkPayloadSchema = z.object({
  existingGroupId: z.string().optional(),
  newGroup: z.object({
    label: z.string().min(1).max(80),
    color: z.string().min(1).max(40),
    memberUserIds: z.array(z.string()).default([]),
    targetPosition: Vector3Schema.optional(),
    targetWallAnchorId: z.string().optional(),
    hold: ClassroomGroupHoldSchema.optional()
  }).optional(),
  releaseOnAdvance: z.boolean().default(true)
}).refine((v) => Boolean(v.existingGroupId) !== Boolean(v.newGroup), {
  message: "Provide existingGroupId or newGroup, not both."
});

export const LessonStepTimerPayloadSchema = z.object({
  durationSeconds: z.number().int().min(5).max(60 * 60),
  label: z.string().max(80).default(""),
  placement: z.enum(["hud", "wall"]).default("hud"),
  wallAnchorId: z.string().optional(),
  autoAdvanceOnComplete: z.boolean().default(false)
});

export const LessonStepStudentSharePayloadSchema = z.object({
  userId: z.string(),
  wallAnchorId: z.string(),
  allowedObjectTypes: z.array(WallObjectTypeSchema).default([]),
  acknowledgeHandIfRaised: z.boolean().default(true),
  revokeOnAdvance: z.boolean().default(true),
  expiresAt: z.string().optional()
});

export const LessonStepSchema = z.object({
  id: z.string(),
  kind: LessonStepKindSchema,
  title: z.string().min(1).max(120),
  notes: z.string().max(2000).optional(),
  payload: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("instruction"), data: LessonStepInstructionPayloadSchema }),
    z.object({ kind: z.literal("focus-board"), data: LessonStepFocusBoardPayloadSchema }),
    z.object({ kind: z.literal("private-check"), data: LessonStepPrivateCheckPayloadSchema }),
    z.object({ kind: z.literal("group-work"), data: LessonStepGroupWorkPayloadSchema }),
    z.object({ kind: z.literal("timer"), data: LessonStepTimerPayloadSchema }),
    z.object({ kind: z.literal("student-share"), data: LessonStepStudentSharePayloadSchema })
  ]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const LessonRunStepRecordSchema = z.object({
  stepId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  drifted: z.boolean().default(false),
  driftReason: z.string().optional(),
  emittedActionIds: z.array(z.string()).default([]),
  createdCheckId: z.string().optional(),
  createdGroupId: z.string().optional(),
  createdGrantId: z.string().optional(),
  createdWallObjectId: z.string().optional()
});

export const LessonRunStatusSchema = z.enum([
  "draft",
  "ready",
  "running",
  "paused",
  "ended",
  "abandoned"
]);

export const LessonRunSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(160).default("Untitled lesson"),
  status: LessonRunStatusSchema.default("draft"),
  steps: z.array(LessonStepSchema).default([]),
  currentStepIndex: z.number().int().min(-1).default(-1),
  timeline: z.array(LessonRunStepRecordSchema).default([]),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
```

`ClassroomState.lessonRun` becomes `LessonRunSchema.nullable().default(null)` instead of the current `z.record(z.unknown())` placeholder. This is a forward-compatible change that does not affect existing classroom features.

### Why This Schema Shape

- Steps are ordered by array position. We do not introduce per-step order keys yet, to keep the discovery slice small. Re-ordering is array replacement.
- `timeline` is append-only; we never mutate a past record. Going Back appends a new record for the re-entered step.
- `currentStepIndex` of `-1` means "not running yet."
- Drift markers and created-asset IDs live in `timeline`, never in `steps`. Steps stay authorable; timeline is execution history.
- A single `status` field lets us distinguish drafting, paused, and ended runs without piling boolean flags.

## Side Effect Orchestration

The orchestrator is implemented on the server inside the existing classroom action handler. When a teacher dispatches an `advance-lesson-step` action, the server:

1. Validates the actor is a teacher in the room.
2. Loads the latest `ClassroomState` with `expectedVersion`.
3. Computes the **cleanup actions** for the current step (if any) using its stored `LessonRunStepRecord`.
4. Computes the **start actions** for the next step using its payload.
5. Applies all of those actions atomically in a single transaction-like update: classroom state is mutated once, version is incremented once.
6. Appends a `completed` timestamp to the outgoing record and pushes a new record for the entering step.
7. Returns the updated, role-filtered classroom state.

Two key consequences:

- A lesson advance is **one server round trip**. Clients do not need to chain client-side actions.
- Drift is detected **inside the orchestrator**, not in the UI. The outgoing record's `drifted` flag is the authoritative signal.

### Idempotency

Repeating an `advance-lesson-step` action with the same `expectedVersion` is rejected by the optimistic lock. Retries from the same client see the new version and re-evaluate without double-applying side effects.

Repeating a `start-lesson-run` is idempotent: if the run is already `running`, it returns the current state without re-applying step 0's start effects.

### Going Back

`retreat-lesson-step` mirrors `advance-lesson-step`:

1. Validate teacher and version.
2. Compute cleanup for the current step.
3. Re-apply the start effects for the previous step using the step's payload.
4. Append timeline records accordingly.

We accept that "going back" cannot perfectly reverse all side effects. A closed private check can be reopened, but its existing responses remain. A revoked grant can be regranted, but a deleted wall object created by a `wall` timer cannot come back. The cleanup contract is "leave classroom state in a sane state," not "perfectly time-travel."

### Pause / Resume

`pause-lesson-run` flips status to `paused` and emits no classroom actions. The teacher and student callouts both indicate paused state. Resuming flips status back to `running` and also emits no side effects.

The point of pause is purely UX: it lets the teacher leave the script visibly hovering on a step while they handle something off-script, without auto-advance fighting them later. (Reminder: we do not auto-advance in this slice.)

### End

`end-lesson-run` cleans up the current step (if any) and sets status to `ended`. The script remains in `ClassroomState.lessonRun` so the teacher can review the timeline. Starting a new run replaces it.

`abandon-lesson-run` cleans up the current step but skips the post-run UI; useful if the teacher cancels mid-flow.

### Side-Effect Drift

When the orchestrator detects drift (e.g., the spotlight no longer matches what the step set), it:

- Skips the cleanup that would have un-done the step's effect.
- Marks the outgoing record as `drifted = true` and records a short reason string.
- Continues advancing normally.

This keeps the run honest: drift is visible in the timeline but never blocks progress.

## API Surface

We extend the existing classroom action endpoint instead of introducing new routes. This preserves authorization, optimistic locking, and realtime fan-out.

New actions on `POST /v1/rooms/:roomId/classroom/actions` (all teacher-only unless noted):

- `init-lesson-run`: creates an empty `LessonRun` in `draft`. Title optional.
- `set-lesson-run-title`: updates title.
- `add-lesson-step`: inserts a step at an index, with payload validated by step kind.
- `update-lesson-step`: replaces a step's title, notes, or payload.
- `move-lesson-step`: re-orders by `{ from, to }` indices.
- `remove-lesson-step`: removes a step by id.
- `start-lesson-run`: status `draft|ready` -> `running`. Sets `currentStepIndex = 0` and emits step 0's start side effects.
- `advance-lesson-step`: progress to next step, with cleanup + start side effects as described above. Errors if not `running`.
- `retreat-lesson-step`: go to previous step. Errors if `currentStepIndex <= 0`.
- `pause-lesson-run`: status `running` -> `paused`.
- `resume-lesson-run`: status `paused` -> `running`.
- `end-lesson-run`: cleanup + status `ended`.
- `abandon-lesson-run`: cleanup + status `abandoned`.
- `clear-lesson-run`: deletes the current run entirely; intended for "start over" UX after end/abandon.

Each action carries an `expectedVersion` and returns the updated, role-filtered state. The endpoint contract does not change beyond this.

Authorization additions:

- All lesson run actions require teacher role.
- The server still applies per-class membership checks as today.

Privacy additions:

- For students, the role-filtered classroom state only exposes:
  - `LessonRun.id`, `title`, `status`, `currentStepIndex`, and **only the current step**, with `notes` stripped.
  - `LessonRun.steps` array length but not future or past step payloads.
  - `LessonRun.timeline` is teacher-only.

This is the same filtering style we use for private check responses today. We add a `filterLessonRunForActor(run, actor)` helper next to the existing `filterClassroomStateForActor`.

## Realtime Model

We continue to use the existing `classroom.state.changed.v1` realtime message. Adding lesson-specific realtime messages is out of scope for the discovery slice. Reasons:

- Lesson-state changes happen at human-clicked frequency (every few seconds at most). Refresh-on-version-change handles this comfortably.
- Lesson-state contains private targets and grants. Broadcasting full payloads risks leaking responses or grant details to students.
- Reusing one realtime path keeps the client adapter simple.

Future phases can introduce `lesson.run.step.changed.v1` or similar if we need lower latency or richer signaling.

## Frontend Implementation

### New Hook: `useLessonRun`

Location: `apps/web/lib/useLessonRun.ts`.

Wraps the existing `useClassroomState` so the lesson run is always derived from the same source of truth. Responsibilities:

- Expose `run`, `currentStep`, `nextStep`, `previousStep`, `isTeacher`, `loading`, `error`.
- Provide thin wrappers: `runAction(action)` calls `classroom.runAction` with the lesson action types.
- Provide computed selectors: `stepStatus(stepIndex)` → `not-run | current | completed | drifted`.
- Maintain a local HUD timer countdown when the current step is a `hud` timer.
- Never derive classroom side effects locally; all side effects come from the server-returned state.

### New Components

- `LessonAuthoringPanel`: teacher-only. Renders the step list, an "Add step" picker, and an inline editor for the selected step. Lives in the right HUD rail.
- `LessonStepEditor`: per-kind editor that renders the right fields and validation feedback.
- `LessonRunControls`: teacher-only Start / Advance / Back / Pause / End buttons plus version-conflict handling.
- `LessonStudentCallout`: student-side callout showing current step title and `instruction` body (for `instruction` and `focus-board` step types) plus a small step counter.
- `LessonTimerHud`: small countdown component used by both teacher and student when the current step is a `hud` timer.
- `LessonTimelinePanel`: teacher-only, opened after `end-lesson-run`, shows the timeline with timestamps and drift markers.

### Existing Components To Update

- `RoomClient.tsx`: instantiate `useLessonRun`; render `LessonAuthoringPanel` and `LessonRunControls` for teachers; render `LessonStudentCallout` for students; route classroom actions through the same `classroom.runAction`.
- `ClassroomPanel.tsx`: gain a "Lesson" section that toggles between author and run modes. Authoring panel collapses when a run is `running` or `paused`; run controls collapse when no run exists.
- `Roster.tsx`: optionally surface "current lesson step affects you" badges on a participant when a step's target includes them (e.g., `student-share` targeting a specific student). Out of scope to make this elaborate.
- `RoomView3D` / `RoomView2D`: no required changes; lesson side effects continue to flow through existing spotlight/group/wall systems.
- `BoardAccessSidePanel.tsx`: no required changes; `student-share` step issues the same grant action it already supports.

### HUD Layout

- Teacher authoring sits in the right HUD rail as a collapsible section under `ClassroomPanel`.
- When a run is `running`, the right HUD shows a compact `LessonRunControls` (current step title, next step preview, advance/back/pause buttons). Authoring stays accessible behind a toggle so a teacher can fix a typo mid-run.
- The student callout sits as a separate `hud-panel` block at the top of the right HUD rail when a run is active. It does not replace any existing classroom UI.
- Presentation "mode" in this slice is simply the visual emphasis applied to the current step block. No full-screen takeover.

### Late-Join Hydration

Because the lesson run lives in `ClassroomState`, the existing classroom GET + privacy filter already gives a joining student exactly what they need: the current step, its instruction text, and the resulting classroom side effects (active spotlight, active check, group assignment).

We do not replay a step's start side effects on join, because those side effects are already in `ClassroomState`. We only render the lesson callout from the current run snapshot.

## 3D / 2D Parity

The discovery slice deliberately does not add any new 3D or 2D primitives. All visible classroom-state from a lesson run flows through existing systems:

- Focus highlight in 3D / 2D.
- Group color and zone in 3D / 2D.
- Wall object timers in 3D / 2D.
- Wall object share regions in 3D / 2D.

The student callout is HUD-only. We accept that a fully kiosk-style 2D-only student may need the HUD callout to be accessibility-friendly. We satisfy that with text-first markup and ARIA labels rather than canvas overlays.

## Authorization Summary

| Action | Teacher | Student |
| --- | --- | --- |
| Read lesson run (filtered) | Full | Current step only |
| Author / edit steps | Allowed | Denied |
| Start / advance / back / pause / end | Allowed | Denied |
| Submit responses / accept grants emitted by steps | N/A | Allowed under existing classroom rules |

Backend enforces all action-level checks. Frontend role checks are not load-bearing.

## Persistence

### Memory Repository

The memory repository extends the existing in-memory `ClassroomState` record by serializing the typed `LessonRun` in `lessonRun`. No new keys are introduced.

### Mongo Repository

We do not introduce a `LessonRun` collection in this slice. The lesson run rides along inside the existing `ClassroomState` document. Mongo schema:

- Replace `lessonRun: Schema.Types.Mixed` with the same flexible `Mixed` type but enforce shape via Zod parse on read and write.
- Continue using `findOneAndUpdate` with `expectedVersion` for optimistic locking.

We accept the trade-off that a busy lesson means slightly larger classroom documents. The slice's data volume is small (single-digit kilobytes per run) and well below Mongo document size limits.

### Migration

Existing rooms that already have `ClassroomState` documents will hydrate `lessonRun: null` because that is the documented default. No data migration script is required.

## Data Retention And History

For the discovery slice:

- `LessonRun.timeline` is kept indefinitely while the room exists.
- Ending a run does not delete it; teachers can review the timeline.
- Starting a new run via `init-lesson-run` after `clear-lesson-run` replaces the previous run.
- No export endpoints in this slice.
- Private check responses created by a step continue to follow the existing private-check retention rules.

Future slices may persist completed runs in a dedicated collection for cross-session review.

## Authoring UX Details

- The authoring panel lists steps in a vertical list with index numbers.
- Add step menu offers the six step kinds in a fixed order: instruction, focus-board, private-check, group-work, timer, student-share.
- Selecting a step opens an inline editor with fields matching that step's payload. Required fields are validated client-side; the server is the final authority.
- A drag handle for reordering is **deferred**; in the discovery slice, reordering uses up/down buttons on each row. This is intentional to avoid investing in DnD before learning if reordering matters.
- Steps that reference deleted assets (anchor, group, user) show a broken-asset banner with "Fix" affordances that re-pick the asset.
- Authoring is allowed while the run is `running` or `paused` for steps that have not yet been entered. Editing the current step is allowed but does not retroactively change side effects already issued.

## Presentation UX Details

- Teacher control block shows: `Step N of M`, current step title, next step preview, primary `Advance` button, secondary `Back` and `Pause` buttons, `End` confirmation button.
- A small drift indicator appears when the orchestrator marks the current step drifted, with a short tooltip explanation.
- Speaker notes from `LessonStep.notes` show only on the teacher control block.
- For `private-check` steps, the control block embeds a compact response counter (reuses existing `PrivateChecksPanel` summary).
- For `timer` steps with `placement: "hud"`, the control block embeds the `LessonTimerHud`.

Student callout shows:

- Current step title.
- `instruction` body for `instruction` and `focus-board` steps.
- Short hint for `private-check` ("Answer in the Help panel below"), `group-work` ("You are in [Group Label]"), `student-share` ("You can share to [Anchor Label]").
- For `timer` steps, the same `LessonTimerHud` minus teacher-only controls.

## Discovery Experiments

The slice is named "Discovery" because we deliberately want to learn from real use. Once the slice is in a teacher's hands, we should capture:

- Which step kinds get used and which get ignored.
- How often "Back" is used.
- Whether `autoCloseOnAdvance` defaults match teacher expectations.
- Whether HUD-only timers feel sufficient or wall placement is preferred.
- Whether teachers want auto-advance, and at what granularity.
- Whether drift indicators are useful or noise.
- How many steps are in a typical script (likely small; aim to optimize for ≤8 steps).
- How often teachers re-run the same script.

We will not instrument analytics in this slice. Discovery is captured through teacher interviews and direct observation. A follow-up slice may add lightweight per-step event counters.

## Acceptance Criteria

Phase 7 is complete when:

- Contracts: `LessonRun`, `LessonStep`, `LessonRunStepRecord`, and the action additions are added to `packages/contracts`, exported, and parse on round-trip.
- API: the six step kinds' start/cleanup paths are implemented in the action handler; teacher-only actions enforce role; student requests receive filtered state with current-step-only visibility; `expectedVersion` conflicts return `409`.
- Persistence: memory and Mongo repositories store the run; round-trip preserves run, steps, and timeline.
- Frontend: a teacher can create, edit, run, advance, back, pause, end, and clear a run entirely from the room HUD.
- Frontend: a student sees the current step callout and joins mid-run cleanly.
- Side effects: each step kind's start and cleanup actions match the table in this document; drift is recorded in the timeline.
- Tests: contract round-trip, API authorization and version conflict, side-effect composition (mocked classroom state), and at least one Playwright happy path that authors a 3-step script and runs it end-to-end.
- Status: `MVP_PLUS_ONE_STATUS.md` and `.cursor/memory.md` reflect Phase 7 completion.
- Documentation: this plan stays current and is amended with discovery findings before promoting to Phase 8.

## Phasing Within The Discovery Slice

To keep the slice shippable, internal sub-phases:

### L7.0 Contracts And Repository

- Add `LessonRun*` schemas to contracts and the existing OpenAPI surface.
- Update memory and Mongo repository serialization.
- Unit tests for round-trip parse and default value behavior.

### L7.1 Server Orchestrator

- Implement the action handlers for the lesson actions.
- Implement step-start and step-cleanup builders per step kind.
- Implement drift detection.
- API tests covering authorization, optimistic version, side-effect composition for each step kind, and student privacy filtering.

### L7.2 Frontend Authoring

- `useLessonRun` hook.
- `LessonAuthoringPanel` and `LessonStepEditor` per step kind.
- Wire into `ClassroomPanel` and `RoomClient`.
- Local-only e2e: create / edit / reorder a run without starting it.

### L7.3 Frontend Run And Student Surface

- `LessonRunControls`, `LessonStudentCallout`, `LessonTimerHud`.
- Side-effect visualization through existing classroom systems (no new 3D/2D primitives).
- Playwright happy-path: teacher authors instruction → focus-board → private-check, runs all three, student joins and sees the right things.

### L7.4 Polish And Drift UX

- Drift indicators in `LessonRunControls`.
- Broken-asset banners in authoring.
- Pause/resume/end/abandon affordances.
- `LessonTimelinePanel` summary.

Each sub-phase ends with typecheck + targeted tests + status update. A sub-phase may be skipped only if it has been demonstrably implemented end-to-end in the previous one.

## Testing Plan

### Contract

- Zod parse for each step kind payload.
- Discriminated union enforcement (mixed kind/payload combinations fail).
- Round-trip: parse → serialize → parse equals input.
- Default values for optional booleans behave as documented.

### API

- Teacher can run the full lifecycle: init → add steps → start → advance × N → end.
- Student receives filtered run: only current step, no notes, no timeline.
- Student request for any lesson-mutating action returns `403`.
- Version conflict on advance returns `409`.
- Side-effect composition tests: `focus-board` produces a `set-spotlight` whose result lives in `state.spotlight`; advance triggers `clear-spotlight` when not drifted and leaves it alone when drifted.
- Private check step composition: advance closes the check; reopens on retreat when `autoCloseOnAdvance` is true.
- Group step composition: release on advance; do not delete the group from `state.groups`.
- Student share step composition: advance revokes the grant emitted by the step.

### Frontend Unit / Component

- `useLessonRun` selectors for `currentStep`, `stepStatus`.
- `LessonStepEditor` renders the right fields per kind.
- `LessonStudentCallout` renders correctly for each step kind.

### Playwright

- Teacher creates a 3-step script, starts it, advances through, ends. Asserts spotlight appears/clears, check opens/closes, callout text matches.
- Student joins mid-run and asserts the current step callout.
- Drift scenario: teacher manually changes spotlight while a `focus-board` step is current, then advances; assert the outgoing step is marked drifted in the teacher timeline.

### Manual Validation

- LiveKit-on cross-tab cross-device run with two participants.
- Pause/resume across page reload.
- Browser back / forward / refresh during a run.

## Risks And Mitigations

### Risk: Orchestrator Becomes A Second Source Of Truth

Mitigation: the orchestrator never reads from itself for "what state should be." It reads `ClassroomState`, computes diffs, and emits the same classroom actions teachers already use. The lesson run carries intent and history; it does not carry duplicated current state.

### Risk: Cleanup Mistakes Strand Classroom State

Mitigation: each cleanup explicitly checks the live target before issuing a destructive action (only clear spotlight if it matches, only revoke a grant if it is still active, only close a check if it is still open). Drift means "I noticed something else, so I left it alone."

### Risk: Late-Joiner Confusion

Mitigation: server-side filtering ensures late joiners always receive the **current** step record; existing classroom-state side effects rehydrate everything else they need. We do not try to replay past step side effects on join.

### Risk: Scope Creep Into Reusable Plans

Mitigation: the schema deliberately scopes runs inside `ClassroomState`. Promoting to reusable plans means introducing a new `LessonPlan` collection in a future phase, not retrofitting this one.

### Risk: Auto-Advance Race Conditions

Mitigation: in the discovery slice, no server-side auto-advance. The teacher client may emit `advance-lesson-step` on local timer expiry, but the server treats it as a normal teacher action. We will revisit server-driven timers only after we have observed real classroom behavior.

### Risk: Drift Indicators Get Noisy

Mitigation: drift is recorded silently in the timeline. The teacher UI surfaces a small badge but does not interrupt advance. If interviews show drift indicators are ignored or confusing, we hide them in a follow-up.

### Risk: Authoring Inside The Live Room Feels Cramped

Mitigation: authoring is HUD-rail-only in this slice. If teachers report cramped editing, the next slice introduces a focused authoring view (still inside the room) without committing to a separate authoring app.

## Migration Notes

- `ClassroomState.lessonRun` was already defined as a nullable object; this slice replaces the open `z.record(z.unknown())` type with a concrete `LessonRunSchema`. Existing records with `lessonRun: null` continue to validate.
- Existing wall objects, anchors, classroom actions, and realtime messages are not modified.
- No env flags are required to ship the orchestrator, but we add an opt-in feature flag for the UI to keep the slice behind a switch during discovery.

Proposed env flag:

- `ENABLE_CLASSROOM_LESSONS` (existing in the parent doc) gates the lesson UI surfaces and the lesson actions on the API. When the flag is off, the lesson actions return `404` and the UI surfaces do not mount.

## Definition Of Done For The Discovery Slice

The discovery slice is done when:

- All six step kinds run their start and cleanup side effects correctly through the existing classroom-action endpoint.
- A teacher can complete a full session from script authoring to script-ended without touching any other tool.
- A student can join mid-run, see the current step, and participate in any active classroom side effect.
- Server-side authorization and privacy filtering are covered by API tests.
- Playwright covers at least one happy path.
- The lesson UI is behind `ENABLE_CLASSROOM_LESSONS` so we can land code without forcing the feature on existing production rooms.
- `MVP_PLUS_ONE_STATUS.md` and `.cursor/memory.md` are updated with implementation and validation evidence.
- This plan is amended with a "Discovery Findings" section once the slice has run with at least one teacher.

## Discovery Findings

Phase 7 has been implemented and validated through an automated teacher/student classroom run. Human teacher observation is still required before Phase 8 product decisions.

Implementation findings:

- The single-room `ClassroomState.lessonRun` model was sufficient for the discovery slice. It avoided a second repository or reusable-plan abstraction while still preserving a teacher-visible timeline.
- Running lesson side effects through the existing classroom-action handler kept focus, private checks, groups, timers, and board grants consistent with manually triggered teacher tools.
- Late join hydration worked best when the server filtered the run to the current step while the existing classroom-state side effects rehydrated the rest of the room.
- Drift detection should stay non-blocking. The API can record that a teacher changed a spotlight, group, timer, check, or grant without interrupting lesson advance.
- The right HUD is usable for discovery-scale scripts, but it is the main pressure point. If observed scripts exceed roughly eight steps, a focused authoring view should be the next UX investment.
- The feature flag is necessary for release control. Lesson actions return `404` when disabled, and the web surfaces do not mount unless the client flag is enabled.

Validation evidence:

- `npm run typecheck` passed.
- `npm test` passed with 47 tests.
- `npx vitest run packages/contracts/tests/lesson-run.test.ts apps/api/tests/api.test.ts` passed with 33 tests.
- `PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 npx playwright test apps/web/test/mvp.spec.ts --grep "three-step lesson"` passed for the teacher authors instruction -> focus-board -> private-check path and a student joining mid-run.

## What Comes After

Phases beyond this slice (documented here so we keep the door open without committing scope):

- **Reusable Plans**: introduce `LessonPlan` and `LessonPlanStep` schemas in a separate collection; allow teachers to duplicate a plan into a new room run.
- **Presentation Mode**: dedicated full-screen presenter view with speaker notes and timing.
- **Auto-Advance**: server-driven step progression for timer steps that signed up for it.
- **Step Library**: discussion, exit-ticket, wall-object pre-staging, branching, sections.
- **Lesson Analytics**: per-step engagement, per-student response timing, completion rates.
- **Multi-Class Reuse**: plans owned at class scope, instantiated into multiple rooms.
- **Templates and Authoring App**: an out-of-room authoring surface for teachers who plan asynchronously.
- **AI-Assisted Authoring**: suggested steps, suggested checks, suggested groupings.

Each of these is a meaningful phase on its own. We do not start them until the discovery slice has shipped, been used, and produced findings.

## Maintenance Rules

1. Update this document with discovery findings before moving to a follow-up phase.
2. Keep `MVP_PLUS_ONE_STATUS.md` current with Phase 7 progress.
3. Mirror lesson-related env flags into `.env.example` and `apps/api/.env.example` when added.
4. Update `.cursor/memory.md` after each implementation sub-phase as we do for other work.
5. Treat any new step kind as a separate small slice with its own design notes; never add a step kind ad hoc inside another feature.
