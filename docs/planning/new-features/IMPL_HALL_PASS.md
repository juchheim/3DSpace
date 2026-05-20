# Implementation Plan — Digital Hall Pass

Source idea: `LEARNING_FEATURE_IDEAS.md` § Small 6.
Branch target: `mvp-plus-one` (or a feature branch off it).
Effort estimate: ~2 days.

## Status / Scope

Students can silently request to "step out." Teachers approve with one tap. The student's avatar parks in a holding zone outside the seating area with a timer; their mic auto-mutes. Per-room durations log to `RoomEvents` for principal-level reports.

**In scope (v1):**

- Request → approve / deny → return flow.
- Holding-zone region in the room manifest with a visible "Hall pass" floor decal.
- Auto-mute mic on approve; restore on return.
- Per-room durations persisted to `RoomEvents`.
- Teacher panel: currently-out list + cumulative weekly totals **per room**.
- Concurrent + per-period limits as room settings.

**Out of scope:**

- Cross-classroom hall-pass visibility across a student's full day (district service).
- SIS attendance integration.
- Custom destinations ("bathroom" vs "nurse"); v1 has only one kind: "hallpass."

## Feature flag

- `ENABLE_HALL_PASS` (API) + `NEXT_PUBLIC_ENABLE_HALL_PASS` (web).
- Default: `false`. Flip after Phase 5 ships.

---

## Phase 1 — Contracts

**Goal:** Help-request schema gains a `kind`; new classroom actions exist; manifest carries the holding zone.

**Files to change:**

- `packages/contracts/src/index.ts`:

  1. Extend `ClassroomHelpRequestSchema`:

     ```ts
     kind: z.enum(["help", "hallpass"]).default("help"),
     approvedAt: z.string().optional(),
     returnedAt: z.string().optional(),
     durationSeconds: z.number().int().nonnegative().optional()
     ```

     Existing `status` reuses `raised | acknowledged | closed | cancelled`. Map: request → `raised`; approve → `acknowledged` + set `approvedAt`; deny → `cancelled`; return → `closed` + set `returnedAt` + `durationSeconds`.

  2. New actions:

     ```ts
     export const ClassroomRequestHallpassActionSchema = ClassroomActionBaseSchema.extend({
       type: z.literal("request-hallpass")
     });
     export const ClassroomApproveHallpassActionSchema = ClassroomActionBaseSchema.extend({
       type: z.literal("approve-hallpass"),
       requestId: z.string().min(1)
     });
     export const ClassroomDenyHallpassActionSchema = ClassroomActionBaseSchema.extend({
       type: z.literal("deny-hallpass"),
       requestId: z.string().min(1)
     });
     export const ClassroomReturnFromHallpassActionSchema = ClassroomActionBaseSchema.extend({
       type: z.literal("return-from-hallpass"),
       requestId: z.string().optional()
     });
     ```

     Add all four to `ClassroomActionSchema`.

  3. Extend `RoomSettingsSchema`:

     ```ts
     hallpass: z.object({
       enabled: z.boolean().default(true),
       maxConcurrent: z.number().int().min(0).max(10).default(1),
       perPeriodLimit: z.number().int().min(0).max(20).default(2)
     }).default({ enabled: true, maxConcurrent: 1, perPeriodLimit: 2 })
     ```

- `packages/room-engine/src/index.ts` — add `hallpassHoldingZone` to `RoomManifestSchema` (top-level field) + an inline default region in `createDefaultRoomManifest` placed off to the side of the front-row seating area but inside `bounds`. Suggested rectangle, behind teacher / off-stage:

  ```ts
  hallpassHoldingZone: { minX: -13, maxX: -11, minZ: -8, maxZ: -6 }
  ```

  (Choose a spot that does not overlap spawn points or walkable group zones — verify by eye in 3D first.)

**Checkpoint:** `npm run typecheck` passes; existing classroom tests still pass (the new `kind` field defaults to `"help"` so old data round-trips).

---

## Phase 2 — Server actions

**Goal:** API enforces request/approve/deny/return + concurrency limits + emits a `RoomEvent` on return.

**Files to change:**

- `apps/api/src/app.ts` — extend `runClassroomAction` switch:

  - `request-hallpass`:
    - 400 if `room.settings.hallpass.enabled === false`.
    - 400 if student already has a `kind: "hallpass"` request in `raised | acknowledged` status.
    - 400 if student has hit `perPeriodLimit` of returned hall passes today (lookup via existing `RoomEvents` filter or a counter on classroom state — v1 use `RoomEvents`).
    - Insert a new `helpRequests` entry: `kind: "hallpass", status: "raised"`.
  - `approve-hallpass`:
    - `requireTeacher`.
    - 400 if `state.helpRequests.filter(r => r.kind === "hallpass" && r.status === "acknowledged").length >= maxConcurrent`.
    - Find request; set `status: "acknowledged"`, `approvedAt: now`.
  - `deny-hallpass`:
    - `requireTeacher`. Set `status: "cancelled"`, `closedByUserId`, `updatedAt`.
  - `return-from-hallpass`:
    - Student (or teacher acting for them) closes own request.
    - Set `status: "closed"`, `returnedAt: now`, `durationSeconds: Math.round((Date.parse(now) - Date.parse(approvedAt)) / 1000)`.
    - Record a `RoomEvent`:

      ```ts
      await repository.recordRoomEvent({
        roomId,
        type: "hallpass.completed.v1",
        payload: {
          userId: request.userId,
          displayName: request.displayName,
          requestedAt: request.createdAt,
          approvedAt: request.approvedAt,
          returnedAt: request.returnedAt,
          durationSeconds: request.durationSeconds
        },
        createdByUserId: actor.userId
      });
      ```

- `apps/api/src/app.ts` (filter): `filterClassroomStateForActor` already filters help requests by `userId` for students — that remains correct (students see only their own hallpass).

**Tests** (`apps/api/tests/api.test.ts`):

- Request → approve → return path persists a `RoomEvent` with `type: "hallpass.completed.v1"` and a positive `durationSeconds`.
- Approving above `maxConcurrent` returns 400.
- Student attempting `approve-hallpass` returns 403.

**Checkpoint:** `npm test -- apps/api/tests/api.test.ts` passes.

---

## Phase 3 — Holding zone + auto-mute client behavior

**Goal:** When the local student's hall pass is `acknowledged`, their avatar moves to the holding zone and their mic mutes. On `closed`, they walk back.

**Files to change:**

- `apps/web/lib/useAvatarMovement.ts` — accept an optional `parkPosition?: Vector3 | null`. While set, override movement: clamp avatar to that position and ignore WASD/pointer movement input. Pointer + keyboard still ignored (no escape mid-pass).
- `apps/web/components/RoomClient.tsx`:
  - Derive `myActiveHallpass` from classroom state.
  - When `myActiveHallpass?.status === "acknowledged"`:
    - Call `useLocalMedia` to mute mic (do not stop the track — quick resume on return).
    - Pass a `parkPosition` (center of `manifest.hallpassHoldingZone`) into `useAvatarMovement`.
  - On `closed`: clear `parkPosition`, restore previous mic state.
- `apps/web/components/RoomView3D.tsx` — render a translucent floor disc + label "Hall pass" on the holding zone (read from `manifest.hallpassHoldingZone`).
- `apps/web/components/RoomView2D.tsx` — render the same region as a labeled rect.

**Checkpoint:** With student + teacher tabs, student requests pass, teacher approves: student's avatar warps to the holding zone, mic icon shows muted. Teacher uses "Mark returned" → student walks back to their seat.

---

## Phase 4 — HUD UI + teacher panel

**Goal:** Student HUD has a "Step out" button. Teacher panel shows pending requests, currently-out list, and weekly totals.

**Files to change:**

- `apps/web/components/RoomClient.tsx` — add a small "🚪 Step out" button in the identity/HUD area:
  - Visible when `NEXT_PUBLIC_ENABLE_HALL_PASS === "true"` and `room.settings.hallpass.enabled`.
  - Hidden / disabled when student already has an active hallpass request.
  - On click: `classroom.runAction({ type: "request-hallpass" })`.
  - When `status === "acknowledged"`: button label becomes "🚪 I'm back" → triggers `return-from-hallpass`. Show a tiny live timer.
- `apps/web/components/ClassroomPanel.tsx`:
  - New "Hall passes" section, teacher-only:
    - **Pending requests** (status `raised`, `kind: "hallpass"`): row per request with Approve / Deny.
    - **Currently out** (status `acknowledged`): row per pass with name, elapsed time, "Mark returned" button.
    - **Today** rollup: count of `hallpass.completed.v1` `RoomEvents` for this room since midnight + total minutes.
  - Add a small `GET /v1/rooms/:roomId/events?type=hallpass.completed.v1&since=…` call in `useClassroomState` to populate the rollup (or paginate from an existing room events list endpoint if one is added; otherwise restrict to live-session counts only and defer the rollup to Phase 5).

**Checkpoint:** Teacher panel reflects request within 1 s of student tap. Approve → student parks. "Mark returned" closes pass and increments today's rollup.

---

## Phase 5 — Limits + safety polish

**Goal:** `maxConcurrent` and `perPeriodLimit` enforced; teacher cannot accidentally leave a student stranded.

**Files to change:**

- `apps/api/src/app.ts` — enforce limits in Phase 2 actions if not done already.
- `apps/web/components/ClassroomPanel.tsx`:
  - Show "(limit reached)" disabled state on Approve buttons when concurrent ≥ `maxConcurrent`.
  - Show a yellow callout for any pass that has been `acknowledged` for > 10 minutes.
- `apps/web/components/RoomClient.tsx`:
  - If `room.settings.hallpass.perPeriodLimit > 0`, prevent the student "Step out" button from firing again after the limit; show "You've reached today's hall-pass limit."
- Room settings UI (lobby): expose the three settings (enabled / max concurrent / per-period limit).

**Checkpoint:** Limits enforced server-side and reflected in UI without page reload.

---

## Acceptance criteria

- Student can request, get approved, park in the holding zone, and return without manual movement.
- Mic auto-mutes during the pass and restores after return.
- Teacher cannot approve more than `maxConcurrent` simultaneous passes.
- Each completed pass produces exactly one `hallpass.completed.v1` `RoomEvent`.
- Pass durations visible in the teacher panel rollup.
- Per-period limit prevents request loops.
- `npm run typecheck`, `npm test`, and a focused Playwright path (request → approve → return) pass.

## Validation evidence (fill in)

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npx playwright test apps/web/test/mvp.spec.ts --grep hallpass` (add this test)
- [ ] Manual: student cannot escape holding zone with keyboard / pointer / D-pad

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Student stranded if teacher disconnects mid-pass | Auto-close after `maxMinutes` (configurable; default off in v1, log a warning instead). |
| Mic re-acquire latency on return | Mute without stopping the track; toggle `enabled` only. |
| Holding zone visual conflicts with classroom geometry | Verify position fits inside `bounds` and outside spawn points; allow per-room override later. |
| Spam requests after deny | Server returns 429 / 400 if a denied request was created in the last 60 s. |

## Files summary

**Modified:**

- `packages/contracts/src/index.ts`
- `packages/room-engine/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/models/mongoose.ts` (if classroom state needs explicit fields — likely not, since stored as `Mixed`)
- `apps/web/lib/useAvatarMovement.ts`
- `apps/web/lib/useClassroomState.ts` (rollup fetch)
- `apps/web/components/RoomClient.tsx`
- `apps/web/components/RoomView3D.tsx`
- `apps/web/components/RoomView2D.tsx`
- `apps/web/components/ClassroomPanel.tsx`
- `apps/web/app/globals.css` (HUD + holding-zone label styles)
