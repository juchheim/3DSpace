# Implementation Plan — Whisper Circles

Source idea: `LEARNING_FEATURE_IDEAS.md` § Small 4.
Branch target: `mvp-plus-one` (or a feature branch off it).
Effort estimate: ~3 days.

## Status / Scope

A user (student or teacher) can toggle **Whisper mode**: their mic is heard at full gain only by listeners within a configurable radius (default 3 m) of the *speaker's* avatar; gain falls to zero outside. The room still hears the teacher and any non-whisper speakers at normal spatial-audio levels.

**In scope (v1):**

- Per-participant `audioMode: "normal" | "whisper"` broadcast over LiveKit data channel.
- Listener-side gain attenuation in `useSpatialAudio` based on distance + speaker mode.
- Floor ring + nameplate badge for whispering participants.
- Teacher room-wide allow / disallow toggle in `ClassroomState`.
- Auto-enable on `group-work` lesson steps (opt-in setting).
- 2D analog: dashed circle around the participant dot.

**Out of scope:**

- True LiveKit subrooms (audio still flows to everyone; we only attenuate locally).
- Recording whispers / teacher "super-hear" mode.
- Per-listener whisper allowlists.

## Feature flag

- `NEXT_PUBLIC_ENABLE_WHISPER` (web only).
- Default: `false`. Flip when Phase 4 ships.

> **Privacy note for K-12.** This is a *listener-side* attenuation, not real isolation. A determined party with devtools access could re-enable gain. Document this honestly in the teacher UI as "Whisper mode — quieter for the room, not private."

---

## Phase 1 — Contracts

**Goal:** Audio-mode message + classroom-level "Whisper allowed" setting in contracts.

**Files to change:**

- `packages/contracts/src/index.ts`:

  ```ts
  export const ParticipantAudioModeSchema = z.enum(["normal", "whisper"]);

  export const ParticipantAudioModeMessageSchema = z.object({
    type: z.literal("participant.audio-mode.v1"),
    participantId: z.string(),
    mode: ParticipantAudioModeSchema,
    radiusMeters: z.number().positive().max(20).default(3)
  });
  export type ParticipantAudioModeMessage = z.infer<typeof ParticipantAudioModeMessageSchema>;
  ```

- Add to `ClassroomStateSchema`:

  ```ts
  whisper: z.object({
    allowed: z.boolean().default(false),
    maxRadiusMeters: z.number().positive().max(20).default(3),
    autoEnableInGroupWork: z.boolean().default(true)
  }).default({ allowed: false, maxRadiusMeters: 3, autoEnableInGroupWork: true }).optional()
  ```

- New action:

  ```ts
  export const ClassroomUpdateWhisperSettingsActionSchema = ClassroomActionBaseSchema.extend({
    type: z.literal("update-whisper-settings"),
    allowed: z.boolean().optional(),
    maxRadiusMeters: z.number().positive().max(20).optional(),
    autoEnableInGroupWork: z.boolean().optional()
  });
  ```

  Add to `ClassroomActionSchema`.

**Checkpoint:** `npm run typecheck -w @3dspace/contracts` passes.

---

## Phase 2 — Server action

**Goal:** Teacher updates whisper settings; persisted in classroom state.

**Files to change:**

- `apps/api/src/app.ts`:

  ```ts
  case "update-whisper-settings": {
    requireTeacher(input.actor);
    const current = state.whisper ?? { allowed: false, maxRadiusMeters: 3, autoEnableInGroupWork: true };
    state.whisper = {
      allowed: input.action.allowed ?? current.allowed,
      maxRadiusMeters: input.action.maxRadiusMeters ?? current.maxRadiusMeters,
      autoEnableInGroupWork: input.action.autoEnableInGroupWork ?? current.autoEnableInGroupWork
    };
    break;
  }
  ```

**Tests:** student gets 403; teacher set persists.

**Checkpoint:** `npm test -- apps/api/tests/api.test.ts` passes.

---

## Phase 3 — Spatial audio attenuation

**Goal:** `useSpatialAudio` consumes a per-participant audio-mode map and a `localListenerPosition` and attenuates remote mics whose source is in whisper mode and outside the radius from the speaker.

**Files to change:**

- `apps/web/lib/realtime.ts` — add `ParticipantAudioModeMessage` to `RealtimeMessage` union.
- `apps/web/lib/useSpatialAudio.ts` — accept new optional input:

  ```ts
  audioModes?: Map<string, { mode: ParticipantAudioMode; radiusMeters: number }>;
  ```

  In the per-remote-participant block (around line 62–93 today), compute:

  ```ts
  const speaker = participant;
  const mode = input.audioModes?.get(speaker.id);
  const isWhisper = mode?.mode === "whisper";
  if (isWhisper) {
    const radius = mode!.radiusMeters;
    const dx = listenerPosition.x - sourcePosition.x;
    const dz = listenerPosition.z - sourcePosition.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const inside = dist <= radius;
    // Hard gate v1: full inside, silent outside. A short fade band is a nice v2.
    node.gain.gain.value = (participant.state.media?.microphoneEnabled ? 1 : 0) * (inside ? 1 : 0);
  } else {
    node.gain.gain.value = participant.state.media?.microphoneEnabled ? 1 : 0;
  }
  ```

  Note: the *speaker's* position is `sourcePosition`. The teacher is always treated as `normal` (override in the caller — see Phase 4).

- `apps/web/lib/useAudioModes.ts` — **new file**, mirror `useAvatarReactions`: keeps a `Map<participantId, { mode, radiusMeters }>` updated by `participant.audio-mode.v1` messages; entries dropped on `participant.leave.v1`.

**Checkpoint:** Two students + one teacher in a room. Manually inject `useAudioModes.receive({ participantId: studentA, mode: "whisper", radiusMeters: 3 })` from console. Student B at 5 m hears silence from A; student B at 2 m hears full gain.

---

## Phase 4 — UI + broadcast

**Goal:** Speakers can toggle whisper; floor ring + nameplate badge appear; teacher has settings.

**Files to change:**

- `apps/web/components/RoomClient.tsx`:
  - Mount `useAudioModes()`.
  - Route `participant.audio-mode.v1` in `handleMessage` to `audioModes.receive`.
  - Local `whisperMode` state + a HUD button "🔇 Whisper" / "🔊 Normal":
    - Disabled if `classroom.state?.whisper?.allowed === false` (and the local user is not the teacher).
    - On click: flip mode, publish `participant.audio-mode.v1` with `radiusMeters = Math.min(localPreferred, classroom.state.whisper.maxRadiusMeters)`.
  - **Teacher always normal in v1**: if local participant role is `teacher`, force `mode: "normal"` and disable the whisper toggle (or label "Teacher voice always carries"). Revisit in a later phase if teachers want to coach quietly.
  - Pass `audioModes.all` to `useSpatialAudio`.
- `apps/web/components/BlockyAvatar.tsx`:
  - New optional prop `audioMode?: "normal" | "whisper"`.
  - When `whisper`, render a translucent ring on the floor (`<Circle>` or a flat ring mesh with `transparent` material) sized to `radiusMeters`, plus a "🔇" badge inside the existing nameplate.
- `apps/web/components/RoomView3D.tsx` — pass `audioMode={getAudioMode(participant.id)}` to each avatar.
- `apps/web/components/RoomView2D.tsx` — dashed circle around the participant dot at `radiusMeters` scale.
- `apps/web/components/ClassroomPanel.tsx`:
  - Teacher-only "Whisper" section with three controls:
    - Toggle "Allow whisper in this room"
    - Slider: max radius (1–10 m).
    - Toggle: "Auto-enable during group-work steps".
- `apps/web/lib/useClassroomState.ts` (or `RoomClient`) — when `lessonRun.currentStep.kind === "group-work"` and `classroom.state.whisper.autoEnableInGroupWork`, expose a `whisperSuggested: true` flag that the HUD button shows as a glow / prompt. Do not auto-flip mode without consent.

**Checkpoint:** With three tabs (T, A, B), allow whisper, A toggles whisper, B at 2 m hears A normally, B at 5 m hears silence. T always hears A. Toggle off → all hear A normally.

---

## Phase 5 — Polish and safety

**Goal:** Visual clarity and safeguarding.

**Files to change:**

- `apps/web/app/globals.css` — `.whisper-ring`, `.nameplate-badge--whisper`, dashed 2D circle.
- `apps/web/components/BlockyAvatar.tsx`:
  - Soft fade band on the ring's outer 0.5 m (visual cue only; the audio gate stays hard in v1).
- Add an inline "Reminder: whisper is quieter for the room, not private" sub-label under the whisper toggle in `ClassroomPanel`.
- Optional but recommended for K-12: when a student enables whisper, fire a `RoomEvent` `whisper.toggled.v1` so a teacher can audit retroactively if needed.

**Checkpoint:** Visuals readable from front and back tiers; teacher reminder copy in place.

---

## Acceptance criteria

- Toggle propagates within 250 ms (LiveKit reliable RTT).
- Listener gain is 1.0 inside radius, 0.0 outside (v1 hard gate).
- Teacher voice is never attenuated by another participant's whisper.
- Disallow toggle in `ClassroomState` disables the student HUD button live.
- 2D analog shows the dashed circle.
- `npm run typecheck`, `npm test` pass.

## Validation evidence (fill in)

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] Manual: 3-tab whisper smoke (inside / outside radius)
- [ ] Manual: teacher toggle gates student UI

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Listener-side gate is not real privacy | Documented in UI; teacher can disallow per room. |
| Audio popping at radius boundary | Use a 100 ms `gain.setTargetAtTime` ramp instead of direct assignment. |
| Teacher needs to coach quietly | Future "teacher whisper" with audit log; not v1. |
| 30 participants × per-frame distance calc | Already O(participants); current spatial audio loop is the same shape. |

## Files summary

**New:**

- `apps/web/lib/useAudioModes.ts`

**Modified:**

- `packages/contracts/src/index.ts`
- `apps/api/src/app.ts`
- `apps/web/lib/realtime.ts`
- `apps/web/lib/useSpatialAudio.ts`
- `apps/web/lib/useClassroomState.ts`
- `apps/web/components/RoomClient.tsx`
- `apps/web/components/RoomView3D.tsx`
- `apps/web/components/RoomView2D.tsx`
- `apps/web/components/BlockyAvatar.tsx`
- `apps/web/components/ClassroomPanel.tsx`
- `apps/web/app/globals.css`
