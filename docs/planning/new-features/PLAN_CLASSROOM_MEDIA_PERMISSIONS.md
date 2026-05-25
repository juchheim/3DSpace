# Planning Doc — Classroom Student Media Permissions

Source idea: direct teacher moderation request after confirming the current classroom has no teacher-side student cam/mic gate.  
Branch target: teacher-cam-mic-controls.  
Effort estimate: ~3-5 days.

## One-line pitch

Give teachers a dead-simple way to control whether students can use **camera** and **microphone** in the live classroom: room-wide toggles first, and per-student enable overrides second, all inside the existing student detail panel above **Grant board access**.

---

## 1. Why this now

Today, student camera and microphone are fully local/self-controlled:

- students click `Cam on/off` and `Mic on/off` in `MediaControls`
- `useLocalMedia` captures/unpublishes device tracks locally
- `RoomClient` / `realtime.ts` publish those tracks outward
- the teacher can *observe* cam/mic state in `Roster`, but cannot gate it

That is now an obvious gap because the rest of the classroom has already moved toward teacher-managed orchestration:

- board access is teacher-granted
- reactions can be locked
- avatar editing can be locked
- whisper can be allowed/disallowed
- hall pass can temporarily mute a student microphone

Camera/microphone access should follow the same product logic: the teacher sets the room norm quickly, then grants exceptions deliberately.

---

## 2. Vocabulary


| Term                               | Meaning                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Room-wide student media toggle** | Teacher control that allows or disallows a medium (`camera` or `microphone`) for all students in the current room.    |
| **Per-student media enable**       | Teacher override that allows one named student to use a medium even when the room-wide toggle for that medium is off. |
| **Effective permission**           | The computed answer to "may this student use this medium right now?"                                                  |
| **Local media toggle**             | The student's existing `Cam on/off` or `Mic on/off` button. These remain, but can be disabled by teacher policy.      |
| **Teacher media policy**           | The combined room-wide + per-student rules for student camera/microphone access.                                      |


---

## 3. Functional scope

### 3.1 What stays the same

- Teachers always control their own camera and microphone directly.
- Students still use the existing compact `MediaControls` buttons for self on/off once permitted.
- Avatar presence still advertises `media.cameraEnabled`, `media.microphoneEnabled`, and `media.speaking`.
- `Roster` keeps showing live `cam` / `mic` tags based on actual media state.
- LiveKit remains the transport for camera/microphone tracks.
- No new top-level HUD card is introduced in v1.

### 3.2 What is new

#### A. Room-wide student camera and microphone policy

Add to `RoomSettingsSchema`:

```ts
studentMedia: z.object({
  camerasEnabled: z.boolean().default(true),
  microphonesEnabled: z.boolean().default(true)
}).default({
  camerasEnabled: true,
  microphonesEnabled: true
})
```

Why default to `true`?

- It preserves current room behavior for all existing rooms.
- `parseRoomSettings()` can opt legacy rooms into the new field with no surprise lockout.
- It lets this ship as a control surface first, rather than a breaking policy flip.

This means v1 is a **bidirectional teacher control**:

- teacher can turn student cameras/mics **off**
- teacher can turn them back **on**

Future room templates or district presets can choose default-off rooms later if desired; that is not part of this plan.

#### B. Session runtime on `ClassroomState`

Add a fast room-scoped runtime mirror plus per-student exception lists:

```ts
studentMediaRuntime: z.object({
  camerasEnabled: z.boolean().default(true),
  microphonesEnabled: z.boolean().default(true),
  cameraEnabledUserIds: z.array(z.string()).default([]),
  microphoneEnabledUserIds: z.array(z.string()).default([])
}).default({
  camerasEnabled: true,
  microphonesEnabled: true,
  cameraEnabledUserIds: [],
  microphoneEnabledUserIds: []
}).optional()
```

Rationale:

- room settings are the durable default
- classroom runtime gives immediate teacher feedback, just like `podsRuntime`
- per-student exceptions belong in classroom state, not room settings

The runtime should initialize from `room.settings.studentMedia` when classroom state is created or loaded.

#### C. New classroom actions

Use one room-wide action and one per-student action, each generic across medium:

```ts
ClassroomSetStudentMediaGlobalActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-media-global"),
  medium: z.enum(["camera", "microphone"]),
  enabled: z.boolean()
});

ClassroomSetStudentMediaAccessActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-media-access"),
  userId: z.string().min(1),
  medium: z.enum(["camera", "microphone"]),
  enabled: z.boolean()
});
```

Both are teacher-only.

Semantics:

- `set-student-media-global`
  - updates `ClassroomState.studentMediaRuntime`
  - also persists the same booleans into `room.settings.studentMedia`
- `set-student-media-access`
  - updates the per-student allow list for the chosen medium
  - does **not** modify room settings

#### D. Effective permission logic

For a participant with role `student`:

```text
canUseCamera =
  studentMediaRuntime.camerasEnabled
  OR cameraEnabledUserIds.includes(userId)

canUseMicrophone =
  studentMediaRuntime.microphonesEnabled
  OR microphoneEnabledUserIds.includes(userId)
```

For a participant with role `teacher`:

```text
canUseCamera = true
canUseMicrophone = true
```

This is intentionally simple. v1 does **not** add deny lists or tri-state inheritance beyond "room-wide on/off + individual allow".

#### E. Enforcement behavior

When a student loses effective permission for a medium:

- the local toggle becomes disabled
- the client immediately turns that medium off
- the associated local track is unpublished / removed just as if the student toggled it off manually

Concretely:

- if `canUseCamera` flips to `false`, the client calls the same local path as `setCameraEnabled(false)`
- if `canUseMicrophone` flips to `false`, the client calls the same local path as `setMicrophoneEnabled(false)`

This is necessary; otherwise "teacher turned student mic off" would only block *future* enables, not *current* use.

#### F. Panel placement and UI

The existing teacher flow already works like this:

1. teacher opens **People**
2. teacher clicks a student name
3. the right-side student panel opens
4. the panel currently shows board-access controls

v1 keeps that flow and inserts a new section **above** board access.

Proposed order inside the current right-side panel:

1. **Student media**
2. **Grant board access** (existing)

The new top section contains two subsections.

**Room-wide**

- `Students can use cameras` toggle
- `Students can use microphones` toggle

These controls are room-scoped, even though they appear in a student-specific panel. Copy must make that clear, e.g.:

> Room-wide student media  
> Applies to all students in this room.

**For {displayName}**

- `Allow camera for this student` toggle
- `Allow microphone for this student` toggle

Recommended behavior:

- always show the per-student toggles
- when the room-wide toggle is already on, show helper copy such as `Already allowed for all students`
- clicking the per-student toggle while the room-wide toggle is on is harmless but visually redundant

This keeps the UI learnable:

- top rows answer "what is the rule for everyone?"
- next rows answer "what exception am I giving this student?"
- board access remains directly below, where it already lives

#### G. Suggested component split

Current shape:

- `Roster` handles student selection
- `StudentDetailPanel` renders `BoardAccessSidePanel`
- `BoardAccessSidePanel` renders `BoardAccessGrantControls`

Planned shape:

- keep the selection behavior unchanged
- either rename `BoardAccessSidePanel` to a more general `StudentDetailSidePanel`, or keep the file name and broaden its responsibility
- add a new `StudentMediaAccessControls` component rendered above `BoardAccessGrantControls`

This keeps scope small and matches the user request exactly.

---

## 4. Policy behavior in the client

### 4.1 Student experience

When allowed:

- student sees the same `Cam on/off` and `Mic on/off` controls as today
- toggles behave normally

When disallowed:

- the relevant button is disabled
- the label should explain why, e.g. `Cam locked by teacher` / `Mic locked by teacher`
- the permission helper text under the controls should explain the current state

Recommended `MediaControls` copy examples:

- `Camera disabled by teacher.`
- `Microphone disabled by teacher.`
- `Camera and microphone disabled by teacher.`

If only one medium is blocked, the other medium should still work normally.

### 4.2 Teacher experience

The teacher does not need a new workflow.

They already click a student name to:

- inspect raised-hand context
- grant board access

This plan extends that same panel so the teacher can also:

- turn student cameras on/off for the whole room
- turn student microphones on/off for the whole room
- grant a specific student an exception

### 4.3 Joining late / refreshing

On load, the student client should derive effective permission from classroom state before honoring any local media intent.

If the room policy says a student cannot use a medium:

- that medium must remain off after refresh
- a stale browser tab must not republish just because it previously had local permission

The policy therefore needs to be checked every time classroom state refreshes, not only when the teacher clicks the toggle.

---

## 5. Overlap with existing functionality

### 5.1 `MediaControls` / `useLocalMedia`

**Decision: keep the local buttons, but gate them.**

- Students still decide whether to actively speak/show video once permitted.
- Teacher policy determines whether those buttons are enabled at all.
- No new browser permission prompt flow is added; existing `getUserMedia` behavior stays.

This is important for privacy and browser semantics: the teacher is not "turning a student's camera on"; the teacher is deciding whether the student is allowed to turn it on.

### 5.2 `Roster`

**Decision: keep roster selection as the entry point.**

- Clicking a student name remains the only way to reach per-student controls.
- `Roster` already shows live `cam` and `mic` tags; that remains useful and should not be replaced.
- v1 does not require new roster tags like `cam blocked` or `mic blocked`, though they could be added later if scanability becomes an issue.

### 5.3 `BoardAccessSidePanel` and board grants

**Decision: media controls sit above board access; board grants remain separate.**

Board grants and media permissions answer different questions:

- **Student media permission** = may this student use their own device camera/microphone in the room at all?
- **Board access grant** = may this student place content on a specific wall anchor, and what types may they place there?

For live wall shares, both must be satisfied:

- to pin `camera.live`, the student needs board grant for `camera.live` **and** camera permission
- to pin `microphone.live`, the student needs board grant for `microphone.live` **and** microphone permission

So the layout order is correct:

1. can this student use device media?
2. can this student put that media on a board?

### 5.4 Hall pass

**Decision: hall pass temporary mute continues to work and wins while active.**

Hall pass already does a local mic-off on acknowledge. That remains true.

Precedence:

```text
effectiveMicOn =
  teacherPolicyAllowsMic
  AND notHallpassMuted
  AND studentLocalToggleOn
```

Restore behavior needs one adjustment:

- when hall pass ends, the client should only restore prior mic state if teacher policy still allows microphone use

Otherwise hall pass could incorrectly re-enable a mic the teacher has since disabled.

### 5.5 Live wall shares

**Decision: teacher policy also gates creation and continuation of live device-backed shares.**

If a student loses permission:

- a normal avatar mic/camera turns off
- any dependent `camera.live` or `microphone.live` wall share from that student should end naturally as its source track disappears

This is desirable; a student should not be able to keep a camera pinned to a board after the teacher has withdrawn camera access.

### 5.6 Lesson `student-share` step

**Decision: no automatic media exception in v1.**

The lesson `student-share` step already handles board-oriented sharing flow. v1 should not silently grant camera/mic permission just because a student-share step begins.

Reasons:

- it hides a meaningful moderation action
- the teacher may want a student to share a note, slide, or image, not live device media
- automatic device-media permission is harder to explain and audit

The teacher can still:

- grant the board
- grant device media for that student in the same right-side panel

If this becomes too click-heavy in practice, an IMPL doc can add an optional "grant live student media too" shortcut later.

### 5.7 Reactions / avatar lock / whisper / pods

**Decision: no behavior change.**

These remain adjacent classroom controls with their own state:

- `avatarEditorLocked`
- `reactionsLocked`
- `whisper`
- `podsRuntime`

Student media policy should be another peer control in the same family, not a replacement for any of them.

---

## 6. User stories

1. A teacher starts direct instruction and turns student microphones off for everyone in two clicks, while leaving student cameras available.
2. A teacher running quiet work turns both student cameras and microphones off room-wide, then clicks one student in **People** and grants microphone access so that student can ask a question aloud.
3. A teacher asks a single student to present, clicks that student's name, enables camera for that student, then grants `camera.live` board access on the same panel.
4. A student who refreshes the browser while microphones are teacher-disabled rejoins with microphone still unavailable.
5. A student whose microphone is currently on sees it turn off immediately when the teacher disables student microphones room-wide.

---

## 7. Acceptance criteria

- A teacher can enable/disable student cameras room-wide from the student detail panel.
- A teacher can enable/disable student microphones room-wide from the student detail panel.
- A teacher can enable camera for one student even while room-wide student cameras are off.
- A teacher can enable microphone for one student even while room-wide student microphones are off.
- The student detail panel shows the new media section above the existing board-access controls.
- Students cannot locally enable a teacher-disallowed medium.
- If a medium is revoked while active, it turns off promptly and stops publishing.
- Teacher media is unaffected.
- Existing rooms continue to behave as they do today after migration because room-setting defaults parse to `true`.
- Live board share permissions and student device-media permissions remain distinct and composable.

---

## 8. Risks and mitigations


| Risk                                                              | Why it matters                                                              | Mitigation                                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Client-only enforcement is not hard security                      | A modified client could ignore the policy and keep publishing               | Accept for v1, same trust model as whisper/pods; optionally add server-side track moderation later              |
| Global controls live in a student-specific panel                  | Teachers may not initially expect a room-wide toggle there                  | Clear section title: `Room-wide student media`; helper copy says `Applies to all students in this room`         |
| Redundant per-student toggles when room-wide access is already on | The override rows can look confusing                                        | Keep visible but explain with helper copy like `Already allowed for all students`                               |
| Revocation races with local media state                           | A student may briefly show as on while the policy is changing               | Drive revocation through the same local off path as existing manual toggle and rely on current realtime refresh |
| Hall-pass restore can re-enable a blocked mic                     | Existing restore logic remembers previous state, not current teacher policy | Update restore path to check effective permission before restoring                                              |


---

## 9. What we deliberately do not build in v1

- Remote force-enable of a student's camera or microphone.
- Teacher-side "unmute this student now" controls.
- Per-student deny lists when room-wide media is on.
- Timed grants that auto-expire after N minutes.
- Separate lobby approval flow before a student first speaks or appears on camera.
- A dedicated new HUD card for student media policy.
- Server-side LiveKit track moderation or selective subscribe.

v1 is intentionally the smallest useful moderation surface:

- room-wide allow/disallow
- individual allow override
- obvious placement in the current student detail workflow

---

## 10. Feature flag and rollout

Recommended flag pair:

- `ENABLE_STUDENT_MEDIA_PERMISSIONS=false`
- `NEXT_PUBLIC_ENABLE_STUDENT_MEDIA_PERMISSIONS=false`

Why still flag this if it is "core"?

- it changes classroom moderation semantics
- it adds new contract fields and classroom actions
- it needs browser-behavior validation around track teardown

Rollout:

1. Implement behind flag
2. Validate local two-tab teacher/student behavior
3. Validate deployed LiveKit behavior for active revocation
4. Enable for staging / demo rooms
5. Remove flag only after product confidence is high

---

## 11. Validation evidence (filled in during implementation)

- `npm run typecheck`
- `npm run test -- apps/api/tests/api.test.ts`
- targeted contracts tests for `parseRoomSettings` defaults
- targeted web typecheck for new panel props and media gating
- Playwright or equivalent two-tab flow covering:
  - teacher turns student mic off globally
  - student sees disabled mic control
  - teacher enables one student mic
  - student can turn mic on
  - teacher revokes while active
  - student mic turns off again

---

## 12. Files likely touched

Contracts / shared schema:

- `packages/contracts/src/index.ts`
- `packages/contracts/tests/...` (new or existing settings/classroom tests)

API / classroom orchestration:

- `apps/api/src/app.ts`
- `apps/api/tests/api.test.ts`

Web UI / client behavior:

- `apps/web/components/BoardAccessSidePanel.tsx`
- `apps/web/components/Roster.tsx`
- `apps/web/components/MediaControls.tsx`
- `apps/web/components/RoomClient.tsx`
- `apps/web/lib/useClassroomState.ts` (types only if needed)
- `apps/web/lib/useLocalMedia.ts` or a sibling helper if gating is best enforced there
- new `apps/web/components/StudentMediaAccessControls.tsx` (recommended)

Env / status / docs:

- `.env.example`
- `apps/web/.env.example`
- `apps/api/.env.example`
- `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md`
- `.cursor/memory.md`

---

## 13. Open product questions

1. Should room creation eventually expose `studentMedia` defaults, or is this first version strictly an in-room runtime control?
2. Do we want the room-wide toggles duplicated anywhere else later (for example in a `ClassroomPanel`), or is the student detail panel enough?
3. Should the per-student override rows be hidden when the room-wide toggle is on, or always visible for consistency?
4. Do we want a passive roster hint for "this student is individually allowed while room-wide media is off", or is the right-side panel sufficient?
5. Should teacher revocation of an active `camera.live` / `microphone.live` board share show a specific toast, or is normal source-ended behavior enough?

---

## 14. Next document

If accepted, the next artifact should be:

- `IMPL_CLASSROOM_MEDIA_PERMISSIONS.md`

That IMPL doc should convert this plan into phased slices:

1. contracts and defaults
2. API classroom actions
3. right-panel UI
4. student media gating and teardown
5. tests, env flags, rollout notes

