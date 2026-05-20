# Implementation Plan — Exit Ticket Step + Lesson Recap

Source idea: `LEARNING_FEATURE_IDEAS.md` § Small 3.
Companion: `docs/planning/mvp+1/MVP_PLUS_ONE_LESSON_PLANNING_DISCOVERY_PLAN.md` (the lesson-run discovery slice we are building on).
Branch target: `mvp-plus-one`.
Effort estimate: ~3–4 days.

## Status / Scope

Add a seventh lesson-run step kind, `exit-ticket`, that bundles a short-answer reflection + a confidence rating (1–5) + an optional multi-choice "what next?" question. When the teacher ends the lesson, the system surfaces a teacher-only `LessonRecap` with attendance, per-check counts, exit-ticket aggregates, and a CSV export.

**In scope (v1):**

- New `exit-ticket` step kind reusing `ClassroomPrivateCheck` underneath.
- `requiredToEnd` flag that gates `end-lesson-run` until all currently-connected students have submitted (or the teacher forces).
- Recap view computed on demand from `LessonRun.timeline`, classroom state, and (optionally) `RoomEvents`.
- CSV export of per-student exit-ticket responses.
- "Last lesson recap" entry point in the lesson HUD.

**Out of scope:**

- Cross-lesson trend comparison.
- Parent / admin views.
- LMS export (Canvas, Schoology, etc.).
- AI-generated recap summaries (deferred to LessonSmith big idea).
- Exit-ticket templates persisted across lessons (lives only inside the active `LessonRun` for v1).

## Feature flag

- Gated by the existing `ENABLE_CLASSROOM_LESSONS` / `NEXT_PUBLIC_ENABLE_CLASSROOM_LESSONS` flag — exit ticket ships as part of the lesson-run subsystem, not a separate flag.

---

## Phase 1 — Contracts

**Goal:** New step kind + payload + start/cleanup actions typed cleanly, discriminated union still exhaustive.

**Files to change:**

- `packages/contracts/src/index.ts`:

  1. Extend `LessonStepKindSchema`:

     ```ts
     export const LessonStepKindSchema = z.enum([
       "instruction", "focus-board", "private-check",
       "group-work", "timer", "student-share",
       "exit-ticket"
     ]);
     ```

  2. New payload:

     ```ts
     export const LessonStepExitTicketChoiceSchema = ClassroomPrivateCheckChoiceSchema;

     export const LessonStepExitTicketPayloadSchema = z.object({
       reflectionPrompt: z.string().min(1).max(500),
       includeConfidence: z.boolean().default(true),
       confidenceRange: z
         .object({ min: z.number().int().min(1), max: z.number().int().min(2).max(10) })
         .default({ min: 1, max: 5 }),
       whatsNext: z
         .object({
           question: z.string().min(1).max(500),
           choices: z.array(LessonStepExitTicketChoiceSchema).min(2).max(6)
         })
         .optional(),
       requiredToEnd: z.boolean().default(false),
       autoCloseOnAdvance: z.boolean().default(true),
       wallAnchorId: z.string().optional()
     });
     ```

  3. Add to the discriminated union (`LessonStepPayloadSchema`):

     ```ts
     z.object({ kind: z.literal("exit-ticket"), data: LessonStepExitTicketPayloadSchema })
     ```

  4. Extend `LessonRunStepRecordSchema` to carry up to three child check ids:

     ```ts
     createdExitTicket: z.object({
       reflectionCheckId: z.string(),
       confidenceCheckId: z.string().optional(),
       whatsNextCheckId: z.string().optional()
     }).optional()
     ```

  5. New end-run action variant:

     ```ts
     // Replace the existing single ClassroomEndLessonRunActionSchema with:
     export const ClassroomEndLessonRunActionSchema = ClassroomActionBaseSchema.extend({
       type: z.literal("end-lesson-run"),
       force: z.boolean().default(false)
     });
     ```

  6. Recap response schema:

     ```ts
     export const LessonRecapSchema = z.object({
       lessonRunId: z.string(),
       roomId: z.string(),
       title: z.string(),
       startedAt: z.string().optional(),
       endedAt: z.string().optional(),
       attendance: z.object({
         knownParticipantIds: z.array(z.string()),
         total: z.number().int().nonnegative()
       }),
       steps: z.array(z.object({
         stepId: z.string(),
         kind: LessonStepKindSchema,
         title: z.string(),
         drifted: z.boolean(),
         driftReason: z.string().optional()
       })),
       privateChecks: z.array(z.object({
         checkId: z.string(),
         question: z.string(),
         promptType: z.enum(["multiple-choice", "short-answer", "confidence"]),
         responseCount: z.number().int().nonnegative(),
         choiceCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
         confidenceAverage: z.number().optional()
       })),
       exitTicket: z.object({
         stepId: z.string(),
         submittedCount: z.number().int().nonnegative(),
         expectedCount: z.number().int().nonnegative(),
         confidenceAverage: z.number().optional(),
         reflections: z.array(z.object({
           userId: z.string(),
           displayName: z.string(),
           answer: z.string(),
           confidence: z.number().optional(),
           whatsNextChoiceId: z.string().optional(),
           submittedAt: z.string()
         }))
       }).optional()
     });
     export type LessonRecap = z.infer<typeof LessonRecapSchema>;
     ```

**Checkpoint:** `npm run typecheck` passes. Existing `LessonStepSchema.refine((value) => value.kind === value.payload.kind)` still holds for the new kind.

---

## Phase 2 — Server orchestration (start step)

**Goal:** When the teacher advances *into* an exit-ticket step, the server creates 1–3 private checks bound to that step, opens them automatically, and records the ids on the step's timeline record.

**Files to change:**

- `apps/api/src/app.ts` — extend `applyLessonStepStart` (the function that branches on `input.step.kind` around lines 800–1043):

  Add a branch for `exit-ticket`:

  ```ts
  if (input.step.kind === "exit-ticket" && input.step.payload.kind === "exit-ticket") {
    const payload = input.step.payload.data;

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

    return {
      ...record,
      createdCheckId: reflectionCheckId, // primary for cleanup-by-id heuristics
      createdExitTicket: { reflectionCheckId, confidenceCheckId, whatsNextCheckId },
      emittedActionIds: ["create-private-check", "open-private-check"]
    };
  }
  ```

- Extend `cleanupLessonStep` mirror branch — if `autoCloseOnAdvance`, close all up-to-three checks the record created.

**Tests** (`apps/api/tests/api.test.ts`):

- Advancing into an `exit-ticket` step with `includeConfidence: true` and a `whatsNext` choice list creates 3 `open` private checks.
- All 3 checks list `visibility: "teacher-only"` and `target.kind: "all"`.
- Student GET of classroom state shows the prompts; teacher GET shows responses.

**Checkpoint:** `npm test -- apps/api/tests/api.test.ts` passes.

---

## Phase 3 — End-of-run gating

**Goal:** Teacher hitting "End lesson" while an exit-ticket step has `requiredToEnd: true` and unsubmitted students is blocked unless they pass `force: true`.

**Files to change:**

- `apps/api/src/app.ts` — modify the `end-lesson-run` branch (around line 1572):

  ```ts
  case "end-lesson-run":
  case "abandon-lesson-run": {
    requireTeacher(input.actor);
    const run = requireLessonRun(state);

    if (input.action.type === "end-lesson-run" && !input.action.force) {
      const blocker = findExitTicketBlocker(state, run);
      if (blocker) {
        throw conflict({
          code: "exit-ticket-incomplete",
          message: `${blocker.missingUserIds.length} student(s) have not submitted the exit ticket.`,
          stepId: blocker.stepId,
          missingUserIds: blocker.missingUserIds,
          submittedCount: blocker.submittedCount,
          expectedCount: blocker.expectedCount
        });
      }
    }

    if (run.status === "running" || run.status === "paused") {
      await completeCurrentLessonStep({ ... });
    }
    await clearActiveLessonTimer({ ... });
    run.status = input.action.type === "end-lesson-run" ? "ended" : "abandoned";
    run.endedAt = now;
    run.updatedAt = now;
    break;
  }
  ```

  `findExitTicketBlocker` iterates `run.timeline` looking for the latest record whose step is `exit-ticket` with `requiredToEnd: true`, then compares `reflectionCheckId.responses[].userId` against the **currently expected roster** (active class membership minus the teacher).

  `conflict()` is a 409 error helper modeled on the existing `forbidden()` / `notFound()` helpers in `errors.ts`. The structured payload lets the client open a confirm dialog with a list.

**Tests:**

- End-lesson with `requiredToEnd: true` and one missing submission returns 409 `exit-ticket-incomplete`.
- Same call with `force: true` succeeds.

**Checkpoint:** `npm test` passes.

---

## Phase 4 — Recap API + CSV

**Goal:** Teacher-only endpoint computes a recap on demand. CSV export uses the same payload.

**Files to change:**

- `apps/api/src/app.ts`:

  1. New route:

     ```ts
     app.get("/v1/rooms/:roomId/lesson-runs/:runId/recap", async (request, reply) => {
       const auth = await requireUser(request, config, repository);
       const params = parseParams(z.object({ roomId: z.string(), runId: z.string() }), request);
       const { room, membership } = await requireRoomAccess(repository, params.roomId, auth);
       const actor = await resolveClassroomActor({ repository, room, membership, auth });
       requireTeacher(actor);

       const state = sanitizeClassroomState(await repository.getClassroomState(params.roomId));
       const run = state.lessonRun;
       if (!run || run.id !== params.runId) throw notFound("Lesson run not found");

       const recap = await buildLessonRecap({ repository, room, state, run });

       const format = (request.query as { format?: string } | undefined)?.format;
       if (format === "csv") {
         reply.header("Content-Type", "text/csv; charset=utf-8");
         reply.header("Content-Disposition", `attachment; filename="recap-${run.id}.csv"`);
         return renderRecapCsv(recap);
       }
       return recap;
     });
     ```

  2. `buildLessonRecap` constructs the `LessonRecap` from `run.timeline` + `state.privateChecks`. Attendance comes from active `ClassMembership` minus the teacher. Confidence average is over `response.confidence` values where present.

  3. `renderRecapCsv` emits headers:

     ```
     userId,displayName,reflection,confidence,whatsNextChoiceId,submittedAt
     ```

     One row per active student; empty rows for non-submitters.

- `apps/api/tests/api.test.ts` — recap GET returns expected counts; student GET returns 403; CSV path returns text starting with the header row.

**Checkpoint:** Curl `GET /v1/rooms/:id/lesson-runs/:rid/recap` as teacher returns JSON; `?format=csv` returns text/csv.

---

## Phase 5 — Authoring UI (teacher)

**Goal:** Teacher can add an exit-ticket step from the existing lesson authoring panel.

**Files to change:**

- `apps/web/components/LessonAuthoringPanel.tsx`:
  - Add `"exit-ticket"` to the step-kind picker.
  - Render an editor with fields:
    - **Reflection prompt** (textarea, required)
    - **Include confidence** (toggle, default on)
    - **What's next?** (optional sub-form: question + 2–6 choices)
    - **Required to end lesson** (toggle, default off)
    - **Auto-close on advance** (toggle, default on)
    - **Wall anchor for prompt** (anchor picker, optional — leaves the reflection prompt as a hud-only check if blank)

- Reuse existing private-check edit components for the embedded multi-choice editor.

**Checkpoint:** Teacher can add, edit, reorder, and remove an exit-ticket step; payload validates client-side.

---

## Phase 6 — Run-time UI (teacher + student)

**Goal:** Students see the exit ticket in their HUD when the step is active; teachers see a "submit progress" indicator.

**Files to change:**

- `apps/web/components/LessonStudentCallout.tsx` (and/or `PrivateChecksPanel.tsx`):
  - When the active lesson step kind is `exit-ticket`, surface a single combined card with: reflection textbox, confidence buttons (1–N), what's-next radios.
  - Submit posts three (or fewer) `submit-private-check` classroom actions in sequence.
  - On success, show "Submitted — see you tomorrow."

- `apps/web/components/LessonRunControls.tsx`:
  - When the current step is `exit-ticket`, render `X / Y submitted` under the step title using the teacher's view of `privateChecks[reflectionCheckId].responses.length` vs the active roster.

- `apps/web/components/LessonRunControls.tsx` (End button handler):
  - On 409 `exit-ticket-incomplete`, open a confirm dialog listing missing student display names and offering **End anyway** (sends `{ type: "end-lesson-run", force: true }`).

**Checkpoint:** Two-tab smoke: teacher advances into exit-ticket, student submits, teacher's `X/Y` increments, "End lesson" succeeds. With student not submitting, "End lesson" shows the confirm dialog.

---

## Phase 7 — Recap UI + entry points

**Goal:** Modal appears automatically when a lesson ends; reachable from the lesson HUD afterwards.

**Files to change:**

- `apps/web/components/LessonRecapPanel.tsx` — **new file**. Modal that:
  - Shows attendance count, per-check counts, exit-ticket submission ratio and confidence average.
  - Lists exit-ticket reflections (teacher-only) in a scroll list.
  - "Download CSV" button hits `/recap?format=csv`.
- `apps/web/lib/api.ts` — add `fetchLessonRecap(identity, roomId, runId)` and `lessonRecapCsvUrl(roomId, runId)`.
- `apps/web/components/RoomClient.tsx`:
  - When `classroom.state.lessonRun?.status` transitions from `running | paused` → `ended`, open `<LessonRecapPanel />` once.
  - Also expose a "Last lesson recap" button in the lesson HUD that re-opens the modal for the most recent ended run.

**Checkpoint:** Ending a lesson opens the recap modal with correct numbers. Clicking Download CSV downloads a file whose first line is the documented header.

---

## Acceptance criteria

- A teacher can author and run an exit-ticket step using only UI in the room.
- 1–3 underlying private checks are created server-side on step start.
- Students see one combined exit-ticket card and submit once.
- `requiredToEnd: true` blocks `end-lesson-run` with a structured 409; `force: true` succeeds.
- Recap GET (teacher-only) returns accurate attendance + per-check counts + reflections.
- CSV export matches the documented header and one row per active student.
- Auto-close cleanup closes all three checks when the step advances (if `autoCloseOnAdvance`).
- `npm run typecheck`, `npm test`, and the existing focused lesson Playwright test (extended to cover exit-ticket end-gate) pass.

## Validation evidence (fill in)

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 npx playwright test --grep "exit ticket"`
- [ ] Manual: CSV opens cleanly in Excel + Google Sheets

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Forgotten students stuck waiting | "End anyway" with required confirm and missing-student list; never silent. |
| Late-join students count against "expected" | Recap uses **currently connected** roster snapshot at end-of-run, not enrollment. |
| CSV with unescaped newlines in reflections | Quote all fields; escape internal quotes per RFC 4180. |
| Schema drift breaks recap on old runs | Recap is computed on demand; only consumes current `LessonRun` + `privateChecks` shape. |
| FERPA / student data export | Recap and CSV are teacher-only; never include another student's reflection in any student-facing response. |

## Files summary

**New:**

- `apps/web/components/LessonRecapPanel.tsx`

**Modified:**

- `packages/contracts/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/errors.ts` (add `conflict()` helper if absent)
- `apps/api/src/repository.ts` and `apps/api/src/models/mongoose.ts` (only if `LessonRun.timeline.createdExitTicket` needs explicit storage — likely not, since lesson run is already `Mixed`)
- `apps/web/lib/api.ts`
- `apps/web/lib/useLessonRun.ts`
- `apps/web/components/LessonAuthoringPanel.tsx`
- `apps/web/components/LessonRunControls.tsx`
- `apps/web/components/LessonStudentCallout.tsx` (or `PrivateChecksPanel.tsx`)
- `apps/web/components/RoomClient.tsx`
- `apps/web/app/globals.css`
