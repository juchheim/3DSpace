# Implementation Plan — Breakout Pods (per-pod audio islands)

Source plan: [`PLAN_BREAKOUT_PODS.md`](./PLAN_BREAKOUT_PODS.md).
Source idea: `LEARNING_FEATURE_IDEAS.md` § Alternate B.
Branch target: `mvp-plus-one` (or a feature branch off it).
Effort estimate: ~3–5 weeks.

## Status / Scope

**Status:** Planned. Not started.

Phase-by-phase implementation of breakout pods. Pods reuse the existing `ClassroomGroup` entity; new behavior is (a) per-pod audio attenuation in `useSpatialAudio`, (b) an upgraded pod-floor visual in 3D / 2D, (c) teacher controls on the existing **Groups** HudCard, and (d) a small server runtime field on `ClassroomState`.

**In scope (v1):**

- Pod audio routing via listener-side gain attenuation (single LiveKit Room).
- Teacher toggle: pod audio on/off.
- Teacher per-student broadcast grant.
- Upgraded pod-floor visual (filled disc + optional low partitions).
- "Go to my pod" student HUD.
- Lesson-run `group-work` step auto-enables pods when room is configured for them.
- Persistent on-screen "Pods on" indicator.

**Out of scope (v1):**

- Per-pod LiveKit subrooms.
- Server-side selective subscribe.
- Per-pod chat, per-pod whiteboard, per-pod recording.
- Student-initiated pod join (walking into a pod-floor).
- VAD-driven pod highlights.

## Feature flag

- `ENABLE_BREAKOUT_PODS` (API) + `NEXT_PUBLIC_ENABLE_BREAKOUT_PODS` (web).
- Default: `false`. Flip after Phase 6 ships.
- Lesson-run `group-work` auto-enable depends on `room.settings.pods.enabled === true` (which itself requires the flag to be on).

---

## Phase 1 — Contracts

**Goal:** Schemas exist for pod settings, runtime, new classroom actions, and the widened audio-mode message. No behavior yet.

**Files to change:**

- `packages/contracts/src/index.ts`:

  1. Extend `RoomSettingsSchema` (alongside `hallpass`):

     ```ts
     pods: z.object({
       enabled: z.boolean().default(false),
       podRadiusMeters: z.number().positive().max(8).default(3),
       podMurmurFloor: z.number().min(0).max(1).default(0.08),
       drawPartitions: z.boolean().default(false)
     }).default({ enabled: false, podRadiusMeters: 3, podMurmurFloor: 0.08, drawPartitions: false })
     ```

  2. Add `ClassroomPodsRuntimeSchema` and extend `ClassroomStateSchema`:

     ```ts
     export const ClassroomPodsRuntimeSchema = z.object({
       podsEnabled: z.boolean().default(false),
       broadcastFromUserIds: z.array(z.string()).default([])
     });

     // inside ClassroomStateSchema:
     podsRuntime: ClassroomPodsRuntimeSchema
       .default({ podsEnabled: false, broadcastFromUserIds: [] })
       .optional()
     ```

  3. Add two classroom actions:

     ```ts
     export const ClassroomTogglePodsActionSchema = ClassroomActionBaseSchema.extend({
       type: z.literal("toggle-pods"),
       enabled: z.boolean()
     });
     export const ClassroomSetStudentBroadcastActionSchema = ClassroomActionBaseSchema.extend({
       type: z.literal("set-student-broadcast"),
       userId: z.string().min(1),
       enabled: z.boolean()
     });
     ```

     Add both to `ClassroomActionSchema`.

  4. Widen `ParticipantAudioModeSchema` and `ParticipantAudioModeMessageSchema`:

     ```ts
     export const ParticipantAudioModeSchema = z.enum(["normal", "whisper", "broadcast"]);
     // message schema gets:
     podId: z.string().optional()
     ```

  5. Export type aliases.

- `packages/contracts/openapi/openapi.json` (regenerated) — verify the new fields/actions appear; no hand edits.

**Checkpoint:**

- `npm run typecheck -w @3dspace/contracts` passes.
- `npm test -- packages/contracts` passes (existing tests untouched; no behavior tests in this package yet).
- `apps/api` and `apps/web` typecheck fail in known places that the next phases will fix; verify the failures are *only* in pod-related code paths.

---

## Phase 2 — API: runtime, validators, server-side side effects

**Goal:** New actions land; runtime field persists; pod state validates; existing actions unchanged. No client UI yet.

**Files to change:**

- `apps/api/src/app.ts`:

  1. Extend the in-memory classroom-state initializer (`createInitialClassroomState`) to set `podsRuntime: { podsEnabled: false, broadcastFromUserIds: [] }`.
  2. Extend the Mongoose `ClassroomState` schema with `podsRuntime` (subdocument with `podsEnabled: Boolean, broadcastFromUserIds: [String]`). Existing rooms with no field default-populate on load.
  3. Add action handlers (teacher-only):
     - `applyTogglePods(state, action, actor, now)` — sets `state.podsRuntime.podsEnabled = action.enabled`; emits classroom-state change.
     - `applySetStudentBroadcast(state, action, actor, now)` — adds/removes `action.userId` in `state.podsRuntime.broadcastFromUserIds`. Validates that the user is currently a member of an active group with `targetPosition` (cannot broadcast from "outside any pod" because that would be meaningless).
  4. Both actions: 403 for students, 422 for missing/invalid groups.
  5. Wire both into the `ClassroomActionSchema` discriminator that `processClassroomAction` consumes.
  6. Lesson-run side effect for `group-work` step:
     - In `applyLessonStepBegin(...step, kind === "group-work"...)`: after the existing group create-or-attach, if `room.settings.pods.enabled === true`, dispatch an implicit `toggle-pods { enabled: true }` (no auth re-check; teacher already initiated the lesson).
     - In `applyLessonStepBegin(...step, kind === "student-share"...)`: capture prior `podsRuntime.podsEnabled`, then dispatch `toggle-pods { enabled: false }`. Restore on advance via `applyLessonStepAdvance`.
     - Record both side effects in the lesson step audit trail.
  7. Role filtering in `GET /v1/classroom/:roomId`: students see `podsRuntime.podsEnabled` and the **size** of `broadcastFromUserIds` only when their own userId is in the list; never the full list (privacy: don't leak who else can broadcast). Teachers see everything.

- `apps/api/tests/api.test.ts`:

  - New describe block: `"pods runtime"`.
  - Teacher creates room with `pods.enabled = true`; verifies `podsRuntime.podsEnabled === false` initially.
  - Teacher calls `toggle-pods { enabled: true }`; verifies state.
  - Student attempts `toggle-pods`; verifies 403.
  - Teacher creates a group with `targetPosition` and assigns student A; teacher calls `set-student-broadcast { userId: A, enabled: true }`; verifies A is in the list.
  - Teacher tries to broadcast an unassigned student; verifies 422.
  - Lesson-run with `group-work` step + `pods.enabled=true` flips `podsRuntime.podsEnabled` to `true`; advancing past the step leaves it `true`.
  - Lesson-run with `student-share` step temporarily flips `podsEnabled` to `false`, restores on advance.

- Feature-flag handling:

  - `apps/api/src/config.ts` reads `ENABLE_BREAKOUT_PODS` (boolean, default `false`).
  - When the flag is `false`, the two new action types return 404 from `processClassroomAction`. The lesson-run side effects are guarded by the flag check.

**Checkpoint:**

- `npm run typecheck -w @3dspace/api` passes.
- `npm run test -- apps/api/tests/api.test.ts -t "pods runtime"` passes.
- Existing 47 tests still pass.

---

## Phase 3 — Audio routing in `useSpatialAudio`

**Goal:** Per-pod gain attenuation works end-to-end with a fresh `audioModes` map and the new `podsRuntime`. No UI yet for toggling; verify by injecting state in DevTools.

**Files to change:**

- `apps/web/lib/useSpatialAudio.ts`:

  1. New `input` field:

     ```ts
     pods?: {
       enabled: boolean;
       murmurFloor: number;
       broadcastUserIds: Set<string>;
       groupByUserId: Map<string, string>;
     } | undefined;
     ```

     `groupByUserId` is a small derived map: `participantId → groupId` for participants in an active, positioned group.

  2. In the per-source iteration:

     - Look up `sourcePodId = pods?.groupByUserId.get(participant.id)` and `listenerPodId = pods?.groupByUserId.get(input.localParticipantId)`.
     - Determine `sourceIsTeacher` from `participant.role === "teacher"`.
     - Determine `sourceIsBroadcasting` from `pods?.broadcastUserIds.has(participant.id) || sourceMode === "broadcast"`.
     - Compute `g_pod` per the formula in `PLAN_BREAKOUT_PODS.md` § 4.1.
     - Multiply: `node.gain.gain.setTargetAtTime(prevGain * g_pod, context.currentTime, 0.1)`.

  3. When `pods?.enabled === false`, skip pod math entirely (preserve existing behavior).

  4. **Wall-anchor audio routing**: when the source's audio is routed through a pinned wall mic/camera (existing branch using `wallMicAnchors`), still look up the *speaker's* pod by `participant.id`. The pod attenuation applies to the wall-anchor-sourced audio too.

- `apps/web/components/RoomClient.tsx`:

  1. Derive `groupByUserId` with `useMemo` from `classroom.state?.groups`:

     ```ts
     const groupByUserId = useMemo(() => {
       const map = new Map<string, string>();
       for (const g of classroom.state?.groups ?? []) {
         if (g.status !== "active" || !g.targetPosition) continue;
         for (const userId of g.memberUserIds) map.set(userId, g.id);
       }
       return map;
     }, [classroom.state?.groups]);
     ```

  2. Build the `pods` input for `useSpatialAudio`:

     ```ts
     const podsInput = useMemo(() => {
       if (!FEATURES.enableBreakoutPods) return undefined;
       const runtime = classroom.state?.podsRuntime;
       if (!runtime?.podsEnabled) return undefined;
       return {
         enabled: true,
         murmurFloor: session?.room.settings.pods?.podMurmurFloor ?? 0.08,
         broadcastUserIds: new Set(runtime.broadcastFromUserIds),
         groupByUserId
       };
     }, [classroom.state?.podsRuntime, groupByUserId, session]);
     ```

  3. Pass `pods: podsInput` to `useSpatialAudio`.

- `apps/web/lib/config.ts`:

  - Add `enableBreakoutPods: process.env.NEXT_PUBLIC_ENABLE_BREAKOUT_PODS === "true"`.

- `apps/web/lib/useAudioModes.ts`:

  - Already handles arbitrary `mode` strings via the message schema; no change required because the schema accepts `"broadcast"` after Phase 1.

**Checkpoint:**

- Manual DevTools test:

  1. Open three browsers in a dev room.
  2. From the teacher's tab, dispatch `runAction({ type: "create-group", label: "Pod A", color: "#16a085", memberUserIds: ["A"], status: "active" })` and assign one student.
  3. Position the group (click on the floor in 3D positioning mode).
  4. Dispatch `runAction({ type: "toggle-pods", enabled: true })`.
  5. From the second student (Pod B is empty so they are "unassigned"), confirm they hear A at murmur (gain ~0.08) while the teacher carries clearly.
- VU-meter readings recorded; attach screenshot in PR description.

---

## Phase 4 — Teacher UI: GroupsPanel pod controls

**Goal:** Teacher can flip pods on/off and grant/revoke per-student broadcast from the existing **Groups** HudCard.

**Files to change:**

- `apps/web/components/GroupsPanel.tsx`:

  1. New props: `podsEnabled: boolean`, `broadcastUserIds: string[]`, `podsAllowedInRoom: boolean`.
  2. At the top of the teacher card, render a "Pod audio" row when `podsAllowedInRoom === true`:
     - Switch labeled "Pod audio" with a small tooltip "Quieter, not private."
     - Disabled while no positioned active groups exist.
  3. Per active positioned group: a "Grant broadcast" button (or "Revoke broadcast" when on).
  4. Defensive UI: if there are no positioned pods, the toggle row shows a hint "Position a group to enable pod audio."

- `apps/web/components/RoomClient.tsx`:

  1. Plumb `classroom.state?.podsRuntime?.podsEnabled`, `classroom.state?.podsRuntime?.broadcastFromUserIds ?? []`, and `session?.room.settings.pods?.enabled` into `GroupsPanel`.
  2. The two new classroom actions reach `classroom.runAction` directly; the panel calls them via the existing `onRunAction` prop.

- `apps/web/app/globals.css`:

  1. New `.pod-toggle-row` styling consistent with existing HudCard chrome.
  2. Small "Pods on" pill style for the persistent indicator (Phase 5).

**Checkpoint:**

- Manual: teacher toggles pod audio on from the panel; runtime field flips and Phase 3 routing activates.
- Manual: teacher grants broadcast to one student; that student hears their HUD indicator (Phase 5).
- `npm run typecheck -w @3dspace/web` passes.

---

## Phase 5 — Student UI + persistent indicator

**Goal:** Students see a clear "Pods on" status, can teleport to their pod, and (when granted) toggle their broadcast.

**Files to change:**

- `apps/web/components/RoomClient.tsx`:

  1. New HUD pill (top bar, next to invite button) when `podsRuntime.podsEnabled === true`:
     - For students: "Pods on" with the current pod color dot if assigned, or "Pods on • unassigned" if not.
     - For teacher: "Pods on" with a small "off" button inline.
  2. Student-only HUD button "Go to my pod" when `myActiveGroup?.targetPosition` exists. On click:
     - Call `movement.moveTo3DPoint({ x, z })` where `(x, z)` is `computeGroupMemberPosition(group.targetPosition, memberIndex)`.
     - Triggers existing avatar-state publish.
  3. Student broadcast toggle visible only when `session?.participantId` is in `broadcastFromUserIds`:
     - Button "Broadcast off" / "Broadcast on" emits `participant.audio-mode.v1` with `mode: "broadcast"`.
     - When toggled off, publishes `mode: "normal"`.
     - Auto-revert to normal when revoked by teacher (mirror existing whisper auto-revert in `RoomClient.tsx`).

- `apps/web/lib/useAvatarMovement.ts` — no change; existing `moveTo3DPoint` already supports programmatic moves.

- `apps/web/app/globals.css`:

  1. `.hud-pill--pods` styling for the persistent indicator.
  2. `.hud-btn--broadcast` distinct from `.hud-btn--active` so it's visually different from whisper.

**Checkpoint:**

- Manual: student in pod sees "Pods on" indicator + can teleport.
- Manual: student given broadcast can toggle; their voice carries across pods only while toggled on; revoke makes it auto-flip off.

---

## Phase 6 — Pod visual upgrade in 3D and 2D

**Goal:** Pod-floors are visible from across the room with filled discs, optional low partitions, larger labels, and crisp 2D map parity.

**Files to change:**

- `apps/web/components/RoomView3D.tsx`:

  1. Rename `GroupTargetMarker` → `PodFloor` (same file). Replace the ring with:
     - A filled `circleGeometry` at `podRadiusMeters` (default 3 m) with `meshBasicMaterial` color = `group.color`, opacity = 0.18 baseline (0.32 when local participant is inside the disc).
     - Floor decal at `y = 0.015` (above the existing spawn point indicator z-order).
     - Billboard label above the disc center: pod name, member count, and a small "Broadcast" pill if anyone in the pod has broadcast active.
  2. When `room.settings.pods.drawPartitions === true`:
     - Four 0.6 m-tall semi-transparent `boxGeometry` panels around the disc with a gap on the camera-side.
     - `meshBasicMaterial` with `transparent: true`, `opacity: 0.12`, color = `group.color`.
     - **No collision** — panels are visual only; movement engine ignores them.
  3. `PodFloor` is rendered for every group with `status === "active"` and `targetPosition`. When `podsRuntime.podsEnabled === false` (or feature flag off), fall back to the old thin-ring rendering.

- `apps/web/components/RoomView2D.tsx`:

  1. Replace the existing group circle with a larger, more opaque filled circle whose radius is proportional to `podRadiusMeters` in world space (already projected through `projectPositionTo2D`).
  2. Pod label is rendered at 2× current font size when `podsRuntime.podsEnabled === true`.
  3. Pod-floor stroke is solid (not dashed) when pods are enabled; dashed when only the soft-hold ring is showing.

- `apps/web/components/BlockyAvatar.tsx`:

  1. When `podsRuntime.podsEnabled === true` and the local participant is in a pod, draw an outline ring around non-podmates' nameplates (~1 px stroke in the pod color, neutral grey for unassigned). Cheap CSS-only treatment via a new `.avatar-nameplate--cross-pod` class.

**Checkpoint:**

- Visual review with two pods placed at opposite sides of the room: pod-floors are visible at default camera distance; labels are legible.
- Toggle pods off in DevTools; pod-floor reverts to thin ring.

---

## Phase 7 — Polish, validation, and rollout

**Goal:** Ship-ready. Tests pass, docs updated, flag flipped in staging.

**Files to change:**

- `apps/web/.env.example` — add `NEXT_PUBLIC_ENABLE_BREAKOUT_PODS=false`.
- `apps/api/.env.example` — add `ENABLE_BREAKOUT_PODS=false`.
- `.env.example` — same.
- `playwright.config.ts` — extend web/api dev commands with `ENABLE_BREAKOUT_PODS=true NEXT_PUBLIC_ENABLE_BREAKOUT_PODS=true` for e2e.
- `apps/web/test/mvp.spec.ts` (or new `apps/web/test/breakout-pods.spec.ts`) — focused 2-pod test:
  - Teacher logs in, creates room, opts in `pods.enabled = true`.
  - Teacher creates two groups, positions them at different boards, assigns one student each.
  - Teacher dispatches `toggle-pods { enabled: true }`.
  - The two student tabs each report (a) seeing "Pods on" indicator, (b) seeing their pod-floor disc, (c) seeing the cross-pod outline on the other student's nameplate.
  - Teacher grants broadcast to student A; the test asserts the API state and student A's HUD button appears.
- `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md` — add a "Breakout Pods" section linking to PLAN/IMPL and the staging rollout date.
- `.cursor/memory.md` — append a `Bug Fixes` / observations entry summarizing the ship.

**Validation evidence (fill in):**

- [ ] `npm run typecheck` — pass
- [ ] `npm test` — pass
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "pods runtime"` — pass
- [ ] `npm run test:e2e -- --grep "breakout pods"` — pass
- [ ] Manual: 3-user, 2-pod perceptual test (recorded clip in PR)
- [ ] Manual: `group-work` lesson step auto-enables pods, `student-share` temporarily disables

**Rollout:**

1. Merge to `mvp-plus-one` with flag off.
2. Flip `ENABLE_BREAKOUT_PODS=true` in staging only.
3. Internal teacher walks through a 5-pod session, reports issues.
4. Flip in production with `room.settings.pods.enabled` default still `false`.
5. After a week, flip `room.settings.pods.enabled` default to `true`.

---

## Files-to-touch summary

| Area | File | Phase |
| --- | --- | --- |
| Contracts | `packages/contracts/src/index.ts` | 1 |
| API runtime | `apps/api/src/app.ts` | 2 |
| API tests | `apps/api/tests/api.test.ts` | 2 |
| API config | `apps/api/src/config.ts` | 2 |
| Audio routing | `apps/web/lib/useSpatialAudio.ts` | 3 |
| RoomClient wiring | `apps/web/components/RoomClient.tsx` | 3, 4, 5 |
| Web config | `apps/web/lib/config.ts` | 3 |
| Teacher panel | `apps/web/components/GroupsPanel.tsx` | 4 |
| Avatar nameplate | `apps/web/components/BlockyAvatar.tsx` | 6 |
| 3D view | `apps/web/components/RoomView3D.tsx` | 6 |
| 2D view | `apps/web/components/RoomView2D.tsx` | 6 |
| Styling | `apps/web/app/globals.css` | 4, 5, 6 |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` | 7 |
| Playwright | `playwright.config.ts`, `apps/web/test/breakout-pods.spec.ts` | 7 |
| Docs | `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md`, `.cursor/memory.md` | 7 |

---

## Risks during implementation

- **Audio glitches when `podsEnabled` flips**: `setTargetAtTime` with a 0.1 s constant smooths the gain ramp. Confirm no clicks or pops in Safari (test on Safari 17+).
- **Stale `groupByUserId` during group release**: when a group is released mid-conversation, the next classroom-state push must arrive before the next audio frame; otherwise the speaker's gain stays at pod-routed for ~3 s until sync. Acceptable for v1; document as known minor drift.
- **Lesson-run auto-toggle race**: if a teacher manually toggles pods *after* the lesson step starts and *before* it ends, advancing the step must not blindly restore prior state. Pattern: only the `student-share` step restores prior state; `group-work` is fire-and-forget.
- **Schema migration for existing classroom-state documents**: `podsRuntime` is optional; existing documents load without it. Mongoose defaults populate on first write.
- **Whisper UX collision**: when pods are on, the whisper-suggested glow must be suppressed in `RoomClient.tsx` (`whisperSuggested` calculation gets `&& !podsRuntime?.podsEnabled`).
- **3D partition geometry z-fighting**: keep partition `y` between 0.02 and 0.62; render after the pod-floor.

---

## Open questions resolved during IMPL

These need explicit decisions before Phase 4 ships (UI). Track in PR description.

1. Pods auto-disable on `student-share` lesson step — **yes** (per PLAN § 12).
2. Unassigned student still hears cross-pod murmurs — **yes** (default).
3. 2D pods parity required — **yes**.
4. Pod color flash on speak — **deferred**.
5. Murmur floor default — **0.08**; tune in pilot.
