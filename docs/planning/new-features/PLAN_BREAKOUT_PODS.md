# Planning Doc — Breakout Pods (per-pod audio islands)

Source idea: `LEARNING_FEATURE_IDEAS.md` § Alternate B.
Branch target: `mvp-plus-one` (or a feature branch off it).
Effort estimate: ~3–5 weeks.

## One-line pitch

Turn the existing classroom groups into **breakout pods**: named, visible floor zones where members hear each other clearly and hear other pods as a faint murmur, while the teacher always carries to every pod.

---

## 1. Why this now

Today, groups are a **label + soft-hold position**. The 3D scene draws a thin ring under each group, and members optionally snap into a ring formation, but they remain in one shared LiveKit audio channel. A "group activity" with five groups talking simultaneously is therefore thirty people on one open mic — the 3D affordance for small-group work is purely visual.

Pods make group work *acoustically* viable. The `LessonRun` `group-work` step is already in production behind `ENABLE_CLASSROOM_LESSONS`; pods are the missing audio layer that makes that step deliver on its promise.

---

## 2. Vocabulary

| Term | Meaning |
| --- | --- |
| **Pod** | The audio/visual surface bound to a `ClassroomGroup`. v1 keeps the data model: a pod *is* a group. |
| **Pod member** | Any `userId` in `ClassroomGroup.memberUserIds` with `status === "active"`. |
| **Pod-floor** | The visible disc/partition drawn on the floor around `group.targetPosition`. |
| **Pod-positioned** | A group whose `targetPosition` is set; only positioned pods get audio routing in v1. |
| **Audio island** | Listener-side gain attenuation that makes cross-pod participants sound like a distant murmur. |
| **All-class voice** | Audio that bypasses pod attenuation (teacher always; students only when explicitly broadcast). |

---

## 3. Functional scope

### 3.1 What stays the same

- `ClassroomGroup` schema is unchanged in v1: `id`, `label`, `color`, `memberUserIds`, `targetPosition`, `targetWallAnchorId`, `hold`, `status: active|released|archived`, audit fields.
- Existing classroom actions continue to work: `create-group`, `update-group`, `assign-group`, `release-group`.
- `LessonStepGroupWorkPayloadSchema` is unchanged; lesson-run integration is purely additive.
- `GroupsPanel`, `Roster` group dots, and `BlockyAvatar` nameplate group color stay.
- `computeGroupMemberPosition` keeps positioning members in a ring.

### 3.2 What is new

#### A. Per-room pod settings

Add to `RoomSettingsSchema`:

```ts
pods: z.object({
  enabled: z.boolean().default(false),
  podRadiusMeters: z.number().positive().max(8).default(3),
  podMurmurFloor: z.number().min(0).max(1).default(0.08),
  drawPartitions: z.boolean().default(false)
}).default({ enabled: false, podRadiusMeters: 3, podMurmurFloor: 0.08, drawPartitions: false })
```

- **enabled** — global on/off for pod audio in this room. When `false`, groups behave as today.
- **podRadiusMeters** — visual radius of the pod-floor and the membership-based audio fence visualization. v1 uses *membership* (not geometry) for routing; the radius is mainly visual.
- **podMurmurFloor** — gain multiplier applied to cross-pod listeners (0.0 = silent, 1.0 = no attenuation). Default `0.08` (~ -22 dB) gives a discernible murmur without intelligibility.
- **drawPartitions** — optional low semi-transparent walls around each pod for stronger visual containment.

#### B. Pod state extension on `ClassroomState`

Add a single field (no new collection):

```ts
podsRuntime: z.object({
  podsEnabled: z.boolean().default(false),
  broadcastFromUserIds: z.array(z.string()).default([])
}).default({ podsEnabled: false, broadcastFromUserIds: [] }).optional()
```

- **podsEnabled** — runtime mirror of the room setting. Teacher can flip it without re-saving room settings (faster than `PATCH /v1/rooms/:id`); the room setting is the *default*, `podsRuntime.podsEnabled` is the *current* state.
- **broadcastFromUserIds** — students currently granted all-class voice. Empty by default. Teacher always has all-class voice without appearing in this list.

#### C. New classroom actions

```ts
// Teacher: flip pod audio routing on/off for the current session.
ClassroomTogglePodsActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("toggle-pods"),
  enabled: z.boolean()
});

// Teacher: grant or revoke all-class voice for one student.
ClassroomSetStudentBroadcastActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-broadcast"),
  userId: z.string().min(1),
  enabled: z.boolean()
});
```

Both are teacher-only.

#### D. Realtime audio mode broadens slightly

Extend `ParticipantAudioModeMessageSchema` (currently `mode: "normal" | "whisper"`) with a non-breaking addition:

```ts
mode: z.enum(["normal", "whisper", "broadcast"]),
podId: z.string().optional()
```

- `broadcast` — speaker is bypassing pod attenuation. Teacher publishes `broadcast` constantly while pods are enabled; students publish `broadcast` only while their userId is in `podsRuntime.broadcastFromUserIds`.
- `podId` — informational; reduces client lookups. Authoritative membership stays in `ClassroomState.groups`.

#### E. Visual treatment

- **3D pod-floor**: replace the thin ring (`GroupTargetMarker`) with a filled disc at `podRadiusMeters` and a billboard label that scales legibly from across the room. Floor opacity ramps based on whether the local viewer is inside that pod.
- **3D partitions** (when `drawPartitions === true`): four 0.6 m tall semi-transparent panels around the disc with a small visible gap so members can walk in/out. Panels do **not** block movement (no collision); they are purely visual.
- **2D pod-floor**: keep the existing filled circle in `RoomView2D`, but make it larger (proportional to `podRadiusMeters`), opaque enough to read across pods, and label the pod center.
- **Pod nameplate hint**: avatar nameplates already include a pod-color dot; add an outline ring around non-podmates' nameplates when pods are enabled to reinforce "not in my pod."

#### F. HUD additions

For students:

- "Go to my pod" 1-click teleport into `computeGroupMemberPosition(targetPosition, slotIndex)`. Active only when the local participant is assigned to a positioned, active pod.
- "Broadcast to class" toggle, only visible when teacher has granted `broadcast` and `podsRuntime.podsEnabled === true`. Off by default.

For teachers:

- Pods on/off toggle on the existing **Groups** HudCard. Sticky across the session; defaults to room setting.
- Per-group "Grant broadcast" / "Revoke broadcast" buttons in `GroupsPanel`.
- A small pod legend listing each positioned pod, its color, member count, and a "Listen in" tap-to-spotlight action (teacher temporarily zooms third-person camera to the pod center; audio is unchanged because teacher already hears everyone clearly).

---

## 4. Audio routing model

### 4.1 Source of truth

For every pair `(listener, source)`:

1. Resolve `listenerPodId` = the pod containing listener.userId, or `null`.
2. Resolve `sourcePodId` = the pod containing source.userId, or `null`.
3. Resolve `sourceMode` from `participant.audio-mode.v1` (default `"normal"`).
4. Resolve `sourceIsTeacher` from participant role (teacher voice always carries).
5. Compute base gain `g_base` from existing HRTF panner + distance attenuation (unchanged).
6. Compute pod attenuation `g_pod`:

```text
if !podsEnabled               → g_pod = 1
else if sourceIsTeacher       → g_pod = 1
else if sourceMode === "broadcast" → g_pod = 1
else if sourcePodId === null  → g_pod = 1            # unassigned student speaks normally
else if listenerPodId === null → g_pod = murmurFloor  # unassigned listener hears all pods muted
else if listenerPodId === sourcePodId → g_pod = 1     # same pod
else                          → g_pod = murmurFloor   # cross-pod
```

7. Compute whisper attenuation `g_whisper` (existing):

```text
if sourceMode === "whisper"   → g_whisper = (dist ≤ whisperRadius) ? 1 : 0
else                          → g_whisper = 1
```

8. Final gain: `g = g_base · g_pod · g_whisper · micOn`.

### 4.2 Properties

- **Composable**: pods and whisper stack. A whispering speaker in pod A is heard at full gain only by listeners inside whisper radius **and** in pod A (or by the teacher / broadcast).
- **Symmetric except for teacher**: teacher always carries; students need explicit broadcast.
- **Server-trustable membership, client-computed gain**: like whisper, all routing is in the listener's browser. Pod *membership* is server-authoritative; gain math is not.
- **No LiveKit re-architecture in v1**: single Room, all participants subscribed to everyone. Audio streams still arrive at every client — pods are an attenuation, not a subscription filter.

### 4.3 Distance attenuation interaction

`useSpatialAudio` already applies HRTF distance attenuation. Pod attenuation **multiplies** on top of it; we do not bypass distance attenuation when pods are enabled. A podmate 10 m away is quieter than a podmate 1 m away; both are still louder than a non-podmate 1 m away.

This avoids the "pod members shout into each others' ears" anti-pattern when pods are placed close together.

### 4.4 Privacy framing

Same as whisper: pods are **quieter, not private.** Cross-pod audio streams are still subscribed and decoded; only the gain is attenuated. A determined participant could write `gain.gain.value = 1` in DevTools and listen in. v1 does not market pods as confidential. Document in IMPL doc and in the teacher pod settings card.

v2 path (out of scope): server-side selective subscribe so cross-pod tracks aren't decoded at all.

---

## 5. Overlap with existing functionality

This is the section the user asked us to be careful about. Below is each adjacent feature and the decision.

### 5.1 `ClassroomGroup` (Phase 5 of MVP+1)

**Decision: reuse as-is. Pods are not a separate entity.**

- A group with `targetPosition` set and `status === "active"` *is* a pod when `podsRuntime.podsEnabled === true`.
- Groups without `targetPosition` continue to be label-only ("Group A" tag on the roster, color on the nameplate) and **do not get audio routing**.
- Rationale: avoiding a parallel entity means lesson-step authoring, the People panel, Roster, BlockyAvatar nameplate dot, and `computeGroupMemberPosition` all continue to work unchanged.

**Migration: none.** All existing groups become latent pods the moment a teacher enables pods.

### 5.2 `ClassroomGroupHold` (soft vs. hard hold)

**Decision: keep, with documentation clarification.**

- `hold.mode === "soft"` + pods = the recommended default. Students can walk freely; audio still routes by pod.
- `hold.mode === "hard"` + pods = the strongest configuration: students are snapped into their pod's member slot via `lockedPosition`, and they only hear their pod. Suitable for testing or for situations where the teacher wants zero wandering.
- The IMPL doc adds a note to the lesson-step authoring UI: "Hard hold + pods means students cannot leave their pod for the duration of this step."

**Migration: none.** Existing `hold` semantics are unchanged.

### 5.3 Whisper circles (`IMPL_WHISPER.md`)

**Decision: keep both; deprecate `autoEnableInGroupWork`.**

Whisper and pods are orthogonal axes (distance-based vs. membership-based attenuation), and the final gain composes both. But the *original purpose* of `ClassroomState.whisper.autoEnableInGroupWork = true` — auto-suggesting whisper during group-work to reduce cross-talk — is solved more directly by pods. When pods are enabled, the whisper "Suggested for group work" UI hint should be suppressed.

Concretely:

- v1: keep the field; the client suppresses the whisper-suggested glow whenever `podsRuntime.podsEnabled === true`.
- v2 candidate: remove `autoEnableInGroupWork` from the schema.

Whisper continues to be the right tool for **inside-pod side conversations** (one pair of students wants a quieter moment within their pod).

### 5.4 `ParticipantAudioModeMessage` (`participant.audio-mode.v1`)

**Decision: additively widen.**

- Add `"broadcast"` to the `mode` enum.
- Add optional `podId` for client convenience (informational only).
- Existing `"normal" | "whisper"` clients keep working; older clients reading a `"broadcast"` message will fall through to "normal" via Zod's safe-parse fallback, which is the correct safe default (treat unknown as normal; pod attenuation will still apply since teacher status is the bypass, not the message).
- **No breaking change**; no migration of stored data (this message is ephemeral).

### 5.5 Lesson `group-work` step

**Decision: keep; pods activate automatically when the step starts.**

- `LessonStepGroupWorkPayloadSchema` is unchanged in v1.
- When a `group-work` step begins, the server side-effect dispatches `toggle-pods { enabled: true }` if `room.settings.pods.enabled === true` (i.e., pods are configured for this room). The teacher can manually override mid-step.
- When the step advances, pod audio stays on. Teachers turn pods off explicitly. Rationale: avoids surprise cut-outs when the teacher continues a discussion past the formal step.
- Lesson recap already records groups created/positioned; nothing new is needed for pods to surface in the recap.

### 5.6 `GroupTargetMarker` / 2D zone circle / `groupColor` nameplate dot

**Decision: extend the visual treatment, keep the components.**

- `GroupTargetMarker` is renamed to `PodFloor` in the IMPL doc but lives in the same file (`RoomView3D.tsx`). The visual is upgraded from a thin ring to a filled disc + optional partitions + larger label. Behavior is gated by `podsRuntime.podsEnabled`: when off, the disc reverts to the old thin ring.
- The 2D zone in `RoomView2D` is similarly upgraded: filled circle becomes more opaque, label larger.
- The nameplate group dot stays; we add an outline ring around non-podmate nameplates when pods are enabled.

### 5.7 `GroupsPanel` teacher UI

**Decision: add pod controls inline; do not split into a new panel.**

- The existing **Groups** HudCard gains:
  - A "Pod audio: on/off" toggle row at the top.
  - A per-group "Grant broadcast" button next to **Position** / **Release**.
  - A small inline help: "Pods make group work quieter, not private."
- New panel files are not needed.

### 5.8 Camera billboards / wall live shares

**Decision: no change.**

- Pinned `microphone.live` and `camera.live` wall objects route the source mic through the wall-anchor position (existing behavior). Pod attenuation must still apply to them: if the speaker is in pod A and the pinned mic is being heard by someone in pod B, pod attenuation kicks in. This means the routing in `useSpatialAudio` must look up the *speaker's* pod even when the source position is a wall anchor.
- One edge case: a pinned mic in a shared all-class context (the teacher's pinned mic) — teacher voice always bypasses pod attenuation, so this Just Works.

### 5.9 Roster / People panel

**Decision: small read-only addition.**

- Each roster row already shows a group color dot when the participant is in a group. When pods are enabled, the dot is augmented with a tiny "broadcast" badge if that student has all-class voice. No new actions in the People panel; broadcast toggles live in **Groups**.

### 5.10 `hallpassHoldingZone`, `spotlight`, `boardAccessGrants`, `helpRequests`

**Decision: no change.**

- A hallpass'ed student is parked in the holding zone (away from pods). They have no podmates; pod routing treats them as `listenerPodId = null`, so they hear all pods at murmur and teacher at full. This is the right behavior.
- Spotlight / focus-board / board access are unrelated; pod audio composes orthogonally.

### 5.11 Feature-flag interactions

| Flag | Pods behavior |
| --- | --- |
| `ENABLE_BREAKOUT_PODS=false` (default) | Pod UI hidden; pod settings hidden; classroom action handlers return 404; runtime field is never set; `useSpatialAudio` ignores pods. |
| `ENABLE_BREAKOUT_PODS=true`, `room.settings.pods.enabled=false` | Pods toggle is visible to teachers but defaults to off. Teacher can flip on for a single session via `toggle-pods`. |
| `ENABLE_BREAKOUT_PODS=true`, `room.settings.pods.enabled=true` | Pods default to on for every join; teacher can still flip off via `toggle-pods`. |
| `ENABLE_CLASSROOM_LESSONS=true` + `group-work` step | When the step starts, server dispatches `toggle-pods { enabled: true }` only if `room.settings.pods.enabled=true`. |
| `NEXT_PUBLIC_ENABLE_WHISPER=true` + pods on | Whisper-suggested glow is suppressed during pods. Manual whisper still works. |

---

## 6. User stories

### Teacher

- **T1.** As a teacher, I create three groups, assign students, position each group at a different board, then click "Pod audio: on" so each table can hear themselves clearly without the room sounding like a cafeteria.
- **T2.** As a teacher, I walk over to Pod B and listen in. (I always hear everyone; my voice always carries.)
- **T3.** As a teacher, I tap "Grant broadcast" on a student so they can share their pod's finding with the class for 30 seconds, then revoke it.
- **T4.** As a teacher, I press a single **Pod audio: off** to bring everyone back to one shared audio channel for the share-out.
- **T5.** As a teacher running a lesson with a `group-work` step, pods turn on automatically when the step begins.

### Student

- **S1.** As a student in Pod A, I hear my podmates clearly and the teacher clearly; other pods sound like a faint murmur (I know they are talking but can't follow words).
- **S2.** As a student new to the room, I click "Go to my pod" and teleport into my group's ring.
- **S3.** As a student given broadcast permission, I see a "Broadcast on" indicator on my HUD so I know my voice carries to every pod; the indicator goes away when the teacher revokes it.
- **S4.** As a student with no pod assignment, I can still talk to anyone within earshot at normal gain; I hear pod conversations as murmurs.

### Observer (non-pod participant)

- **O1.** I am unassigned (e.g., a visiting principal). I hear the teacher clearly, hear all pods at murmur, and my voice carries normally.

---

## 7. Acceptance criteria

A v1 ship requires all of the following:

1. **Two pods test.** Two students in Pod A, two in Pod B, one teacher. Pod A talks. Pod B hears a murmur but cannot transcribe the words. Teacher hears both clearly. Confirmed by VU meter readings and a 5-second perceptual check.
2. **Teacher carries.** Teacher speaks; every pod hears full gain regardless of `podsEnabled`.
3. **Broadcast bypass.** Teacher grants broadcast to student X in Pod A. Pods B hears X at full gain. Teacher revokes broadcast. Pod B hears X at murmur again.
4. **Whisper composes.** Student in Pod A turns on whisper; student in Pod B hears nothing from them (cross-pod attenuation + outside-whisper-radius = 0). Podmate of speaker within whisper radius hears full gain.
5. **Hall pass interaction.** A hallpass'ed student hears teacher full and other pods at murmur (matches "unassigned listener" rule).
6. **Lesson-run integration.** Starting a `group-work` step with `room.settings.pods.enabled=true` flips `podsRuntime.podsEnabled` to true; advancing past the step does not flip it back (teacher controls).
7. **No regression of existing classroom features.** Whisper still works when pods are off; group hold-mode `soft` and `hard` still position members correctly; lesson recap continues to render.
8. **Visible pod-floor.** Each positioned active group shows a filled disc + label that is visible from across the room (eye level + third-person camera).
9. **2D analog parity.** The 2D map shows the same pods with the same colors, members, and labels.
10. **Teardown.** Teacher toggles pods off. All clients reset gain multipliers to 1 within 250 ms.

---

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Cross-pod audio still transmits, so 30 mics simultaneously will bandwidth-saturate weak networks | Document v1 as up to ~6 pods of ~5 each; v2 explores server-side selective subscribe. |
| Murmur floor too low → pods feel "broken" (cross-pod totally silent, weird); too high → no audio improvement | Make `podMurmurFloor` per-room tunable; default 0.08 is hand-tuned starting point. |
| Teachers forget pods are on, students think their off-task chat is private | Persistent on-screen indicator: tiny "Pods on" badge in the top HUD bar for every participant when pods are enabled. Document the "quieter, not private" framing in the teacher HudCard. |
| Lesson-run `group-work` step auto-enabling pods surprises teachers who don't want them | Only auto-enable when `room.settings.pods.enabled === true`. Teacher opts in at room creation. |
| Conflict with whisper auto-enable | Pods suppress the whisper-suggested glow but do not force whisper off; documented. |
| Drift between `room.settings.pods.enabled` (saved) and `podsRuntime.podsEnabled` (live) | UI shows both: the room default and the current session state, with a "reset to default" affordance. |
| Visible partitions block the camera view | Partitions opt-in via `drawPartitions: false` default; height capped at 0.6 m so over-camera sightlines remain clear. |
| Server-side `toggle-pods` race with `release-group` (group released → pod disappears mid-conversation) | Releasing a positioned group already removes its `targetPosition`. Client immediately recomputes membership; affected students' gain reverts to "unassigned listener" rules. |

---

## 9. What we deliberately don't build in v1

- Per-pod LiveKit subrooms (separate Room objects per pod). Too much rework for too little win at our scale; revisit when we have a >50-participant class request.
- Server-side audio selective-subscribe filtering. Same reason.
- Pods without a `targetPosition` (purely virtual pods). Membership is enough technically, but a visible pod-floor is core to the UX promise — "I can see where to stand."
- Student-initiated pod join (a student walking into someone else's pod-floor automatically joins it). Membership stays teacher-controlled.
- Per-pod chat / per-pod whiteboard / per-pod recording. All deferred to v2.
- Voice activity detection-driven pod highlights ("the loud pod glows"). Nice-to-have polish for v2.

---

## 10. Feature flag and rollout

- `ENABLE_BREAKOUT_PODS` (API) + `NEXT_PUBLIC_ENABLE_BREAKOUT_PODS` (web). Both default `false`.
- Rollout sequence:
  1. Ship behind the flag with `room.settings.pods.enabled` default `false`.
  2. Internal QA in a real classroom with 3 pods.
  3. Flip the flag on in staging; teachers can opt-in per room.
  4. Make `room.settings.pods.enabled` default `true` after a one-week soak.
- Kill switch: flipping the flag off mid-session causes every client to set `podsRuntime.podsEnabled = false` on the next classroom-state sync (3 s); gain multipliers reset to 1.

---

## 11. Validation evidence (filled in during implementation)

- [ ] `npm run typecheck` — pass
- [ ] `npm test` — pass (existing 47 + new pod tests)
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "pod|toggle-pods|set-student-broadcast"` — pass
- [ ] `npm run test:e2e` — pass (existing + new two-pod browser test)
- [ ] Manual: two-pod perceptual test with three users, recorded as a screen capture, attached in PR.
- [ ] Manual: lesson-run `group-work` step auto-enable confirmed in staging.

---

## 12. Open product questions

These are not blockers but deserve a quick decision before IMPL Phase 4 (UI):

1. **Murmur floor default.** Is `0.08` too low for older laptop speakers? Pilot in real classroom; tune if students complain pods sound "broken."
2. **Should pods be auto-disabled when a `student-share` lesson step begins?** A share-out usually wants one student heard everywhere. Decision: yes — the `student-share` step server-side dispatches `toggle-pods { enabled: false }` and restores prior state on advance. (Mirrors hallpass auto-mute logic.)
3. **Should an unassigned student still hear cross-pod murmurs, or full silence?** Default: murmur (matches the teacher-listening experience). Teachers can flip via `podMurmurFloor`.
4. **Are pods visible to students with `viewMode: "2d"`?** Yes — the 2D map already shows group zones; we extend the styling to match the 3D pod-floor.
5. **Do we want per-pod color audio cues** (a brief color flash on the pod-floor when someone in it speaks)? Nice-to-have, defer to polish.

---

## 13. Glossary of state machine

```
Group lifecycle (unchanged):
  draft → active → released → archived

Pod runtime (new, classroom-state scoped):
  podsRuntime.podsEnabled : false → true → false (teacher toggle)
  podsRuntime.broadcastFromUserIds : [] ↔ [...userIds] (teacher per-student grant)

Per-participant audio mode (broadens):
  "normal" ↔ "whisper" ↔ "broadcast"
```

---

## 14. Next document

`IMPL_BREAKOUT_PODS.md` — phase-by-phase implementation plan, file-by-file changes, validation steps.
