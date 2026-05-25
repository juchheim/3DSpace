# Implementation — Classroom Student Media Permissions

Source plan: `PLAN_CLASSROOM_MEDIA_PERMISSIONS.md`  
Branch: `teacher-cam-mic-controls`  
Last updated: 2026-05-25

---

## Codebase context (pre-implementation state)

Before touching anything, note these relevant facts about the current code:

| File | What matters |
|---|---|
| `packages/contracts/src/index.ts` | `RoomSettingsSchema` (line 770) has no `studentMedia` field. `ClassroomStateSchema` (line 1520) has no `studentMediaRuntime`. `ClassroomActionSchema` (line 1788) has a discriminated union; both new action schemas must be added to it. |
| `apps/api/src/app.ts` | `set-room-skin` and `set-room-skin-day-night` are special-cased *before* `runClassroomAction` (line 3349) because they mutate room settings. `set-student-media-global` requires the same two-step approach: update `room.settings.studentMedia` via `repository.updateRoom()`, then update `studentMediaRuntime` via the action handler. |
| `apps/api/src/app.ts` | Feature flag gate pattern: `if ((type === "toggle-pods" …) && !breakoutPodsEnabled) throw forbidden(…)` (line 1715). The new actions get the same treatment. |
| `apps/web/components/RoomClient.tsx` | Hall pass mic restore (line 382–393): `media.setMicrophoneEnabled(priorHallpassMicRef.current)` fires without checking teacher policy — known bug to fix here. |
| `apps/web/components/RoomClient.tsx` | Two `BoardAccessSidePanel` render sites: (a) `StudentDetailPanel` from the Roster flow (line 2050), and (b) a direct `BoardAccessSidePanel` for the help-flow `helpBoardAccessUserId` (line 2023). Both need the new media controls section. |
| `apps/web/components/MediaControls.tsx` | Takes a `media` prop bag. No disabled state on buttons. Interface must grow to accept `canUseCamera` / `canUseMicrophone` booleans. |
| `apps/web/lib/useLocalMedia.ts` | `setCameraEnabled` / `setMicrophoneEnabled` are returned setters. Calling them from RoomClient to enforce policy is the correct approach — no changes needed inside the hook itself. |
| `apps/web/lib/config.ts` | Feature flags follow `NEXT_PUBLIC_ENABLE_...` convention via `CLIENT_TUNING` object. |

---

## Plan adjustments

The PLAN doc is accurate in substance. Two clarifications from the code review:

**A. Two panel call sites, not one.**  
`BoardAccessSidePanel` is rendered at two spots in `RoomClient.tsx`: the Roster-selected-student flow *and* the help-board-access flow (when a student raises their hand). Both should show the new media section. The simplest fix is to add the controls to `BoardAccessSidePanel` itself (not only to `StudentDetailPanel`), and pass the necessary runtime data into both call sites.

**B. `set-student-media-global` is a two-step API operation.**  
The action must:
1. Persist `room.settings.studentMedia` via `repository.updateRoom()` (same as `set-room-skin`).
2. Update `ClassroomState.studentMediaRuntime` via the normal classroom state writer.

Handle this in a special-case block before `runClassroomAction`, mirroring the `set-room-skin` pattern. The classroom state update uses the action's values to set `studentMediaRuntime.camerasEnabled` / `microphonesEnabled`; it does **not** touch `cameraEnabledUserIds` / `microphoneEnabledUserIds` (those are runtime-only).

---

## Phased implementation

### Phase 1 — Contracts and defaults

**File: `packages/contracts/src/index.ts`**

1. Add `studentMedia` to `RoomSettingsSchema` (after the `worldSkins` block):

```ts
studentMedia: z.object({
  camerasEnabled: z.boolean().default(true),
  microphonesEnabled: z.boolean().default(true)
}).default({
  camerasEnabled: true,
  microphonesEnabled: true
})
```

2. Add `studentMediaRuntime` to `ClassroomStateSchema` (after the `whisper` field):

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

3. Add the two new action schemas. Place them after `ClassroomUpdateWhisperSettingsActionSchema`:

```ts
export const ClassroomSetStudentMediaGlobalActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-media-global"),
  medium: z.enum(["camera", "microphone"]),
  enabled: z.boolean()
});

export const ClassroomSetStudentMediaAccessActionSchema = ClassroomActionBaseSchema.extend({
  type: z.literal("set-student-media-access"),
  userId: z.string().min(1),
  medium: z.enum(["camera", "microphone"]),
  enabled: z.boolean()
});
```

4. Add both to the `ClassroomActionSchema` discriminated union (line 1788 area).

5. Export the inferred types:

```ts
export type ClassroomSetStudentMediaGlobalAction = z.infer<typeof ClassroomSetStudentMediaGlobalActionSchema>;
export type ClassroomSetStudentMediaAccessAction = z.infer<typeof ClassroomSetStudentMediaAccessActionSchema>;
```

**Verify:** `npm run typecheck` in `packages/contracts`. Run contracts tests.

---

### Phase 2 — API classroom actions

**File: `apps/api/src/app.ts`**

#### 2a. Feature flag

Add `enableStudentMediaPermissions` to `config.tuning` wherever the other flags live (search for `enableWorldSkins` in app.ts). Wire it to `process.env.ENABLE_STUDENT_MEDIA_PERMISSIONS === "true"`.

#### 2b. Special-case route handler for `set-student-media-global`

Inside the `/v1/rooms/:roomId/classroom/actions` handler, add a block before the call to `runClassroomAction`. Model it directly after the existing `set-room-skin` block:

```ts
if (body.type === "set-student-media-global") {
  if (!config.tuning.enableStudentMediaPermissions) throw forbidden("Student media permissions are not enabled");
  requireTeacher(actor);
  const current = room.settings.studentMedia ?? { camerasEnabled: true, microphonesEnabled: true };
  const next = body.medium === "camera"
    ? { ...current, camerasEnabled: body.enabled }
    : { ...current, microphonesEnabled: body.enabled };
  await repository.updateRoom(params.roomId, { settings: { studentMedia: next } });
  // Fall through to runClassroomAction so that studentMediaRuntime is also updated.
}
```

Then let `runClassroomAction` continue for all classroom state mutations, including `set-student-media-global`.

#### 2c. Action handlers inside `runClassroomAction`

Add two new cases to the switch:

```ts
case "set-student-media-global": {
  if (!input.studentMediaPermissionsEnabled) throw forbidden("Student media permissions are not enabled");
  requireTeacher(input.actor);
  const runtime = state.studentMediaRuntime ?? {
    camerasEnabled: true,
    microphonesEnabled: true,
    cameraEnabledUserIds: [],
    microphoneEnabledUserIds: []
  };
  if (input.action.medium === "camera") {
    runtime.camerasEnabled = input.action.enabled;
  } else {
    runtime.microphonesEnabled = input.action.enabled;
  }
  state.studentMediaRuntime = runtime;
  break;
}

case "set-student-media-access": {
  if (!input.studentMediaPermissionsEnabled) throw forbidden("Student media permissions are not enabled");
  requireTeacher(input.actor);
  const runtime = state.studentMediaRuntime ?? {
    camerasEnabled: true,
    microphonesEnabled: true,
    cameraEnabledUserIds: [],
    microphoneEnabledUserIds: []
  };
  const listKey = input.action.medium === "camera" ? "cameraEnabledUserIds" : "microphoneEnabledUserIds";
  const list = runtime[listKey];
  if (input.action.enabled && !list.includes(input.action.userId)) {
    list.push(input.action.userId);
  } else if (!input.action.enabled) {
    runtime[listKey] = list.filter((id) => id !== input.action.userId);
  }
  state.studentMediaRuntime = runtime;
  break;
}
```

Pass `studentMediaPermissionsEnabled: config.tuning.enableStudentMediaPermissions` into `runClassroomAction` alongside `breakoutPodsEnabled`.

#### 2d. Classroom state initialization

When a new room's classroom state is first created (wherever `getClassroomState` returns a blank state), ensure `studentMediaRuntime` is initialized from `room.settings.studentMedia`. The Zod schema default handles JSON-deserialized existing rooms; new rooms need the runtime seeded from settings. Add a small helper or inline logic:

```ts
if (!state.studentMediaRuntime) {
  const sm = room.settings.studentMedia ?? { camerasEnabled: true, microphonesEnabled: true };
  state.studentMediaRuntime = {
    camerasEnabled: sm.camerasEnabled,
    microphonesEnabled: sm.microphonesEnabled,
    cameraEnabledUserIds: [],
    microphoneEnabledUserIds: []
  };
}
```

Apply this at every point where classroom state is freshly read from the repository (before returning to the client).

**Verify:** `npm run typecheck` in `apps/api`. Run `npm run test -- apps/api/tests/api.test.ts`.

---

### Phase 3 — Teacher UI (right-panel)

#### 3a. New component: `StudentMediaAccessControls.tsx`

Create `apps/web/components/StudentMediaAccessControls.tsx`. Props:

```ts
type StudentMediaRuntime = {
  camerasEnabled: boolean;
  microphonesEnabled: boolean;
  cameraEnabledUserIds: string[];
  microphoneEnabledUserIds: string[];
};

type Props = {
  userId: string;
  displayName: string;
  studentMediaRuntime: StudentMediaRuntime | null | undefined;
  busy: boolean;
  onRunAction(action: ClassroomAction): Promise<void>;
};
```

Layout (two subsections):

**Room-wide student media**  
- Label: "Applies to all students in this room."
- Toggle: "Students can use cameras" → `set-student-media-global` with `medium: "camera"`
- Toggle: "Students can use microphones" → `set-student-media-global` with `medium: "microphone"`

**For {displayName}**  
- Toggle: "Allow camera for this student" → `set-student-media-access` with `medium: "camera"` and this student's `userId`
- Toggle: "Allow microphone for this student" → `set-student-media-access` with `medium: "microphone"` and this student's `userId`
- Helper text when room-wide is already on: "Already allowed for all students"

Derived values:

```ts
const roomCamsOn = studentMediaRuntime?.camerasEnabled ?? true;
const roomMicsOn = studentMediaRuntime?.microphonesEnabled ?? true;
const studentCamException = studentMediaRuntime?.cameraEnabledUserIds.includes(userId) ?? false;
const studentMicException = studentMediaRuntime?.microphoneEnabledUserIds.includes(userId) ?? false;
```

Checked state for per-student toggles: `roomCamsOn || studentCamException` (and same for mic). When clicked while `roomCamsOn`, the per-student exception is toggled anyway (harmless but visible).

#### 3b. Update `BoardAccessSidePanel.tsx`

Add to its props:

```ts
studentMediaRuntime?: {
  camerasEnabled: boolean;
  microphonesEnabled: boolean;
  cameraEnabledUserIds: string[];
  microphoneEnabledUserIds: string[];
} | null | undefined;
```

Render `<StudentMediaAccessControls>` above `<BoardAccessGrantControls>`, gated on `CLIENT_TUNING.enableStudentMediaPermissions && studentMediaRuntime !== undefined`:

```tsx
{CLIENT_TUNING.enableStudentMediaPermissions && studentMediaRuntime !== undefined ? (
  <StudentMediaAccessControls
    userId={userId}
    displayName={displayName}
    studentMediaRuntime={studentMediaRuntime}
    busy={busy !== ""}
    onRunAction={onRunAction}
  />
) : null}
```

#### 3c. Update both call sites in `RoomClient.tsx`

Both `BoardAccessSidePanel` render sites (help-flow at line 2023 and Roster-flow at line 2050 via `StudentDetailPanel`) need `studentMediaRuntime={classroom.state?.studentMediaRuntime}` added.

For the `StudentDetailPanel` call at line 2050, either:
- Pass `studentMediaRuntime` through `StudentDetailPanel` → `BoardAccessSidePanel`, or
- Restructure `StudentDetailPanel` to render `StudentMediaAccessControls` directly above the board access panel.

Recommended: thread `studentMediaRuntime` through `StudentDetailPanel` → `BoardAccessSidePanel` (one extra prop on each). Keeps the component hierarchy intact.

**Verify:** Teacher can toggle both room-wide and per-student controls. Visual confirms correct section header and helper copy.

---

### Phase 4 — Student-side gating and teardown

All enforcement runs inside `RoomClient.tsx`, which is the single place that owns `media` and `classroom.state`.

#### 4a. Compute effective permissions

After `classroom` and `session` are available, derive:

```ts
const studentMediaRuntime = classroom.state?.studentMediaRuntime;

const canUseCamera =
  role === "teacher" ||
  (studentMediaRuntime?.camerasEnabled ?? true) ||
  (studentMediaRuntime?.cameraEnabledUserIds ?? []).includes(session?.participantId ?? "");

const canUseMicrophone =
  role === "teacher" ||
  (studentMediaRuntime?.microphonesEnabled ?? true) ||
  (studentMediaRuntime?.microphoneEnabledUserIds ?? []).includes(session?.participantId ?? "");
```

Derive this with `useMemo` keyed on `classroom.state?.studentMediaRuntime`, `session?.participantId`, and `role`.

#### 4b. Revocation effect

Add a `useEffect` that enforces the computed permissions on the local media:

```ts
useEffect(() => {
  if (!session || role === "teacher") return;
  if (!canUseCamera && media.cameraEnabled) {
    media.setCameraEnabled(false);
  }
  if (!canUseMicrophone && media.microphoneEnabled) {
    media.setMicrophoneEnabled(false);
  }
}, [canUseCamera, canUseMicrophone, media.cameraEnabled, media.microphoneEnabled, role, session]);
```

This fires on every classroom state refresh (the 5-second poll) and immediately when the teacher updates policy. If a student currently has camera or mic on, it turns off at the next state delivery.

#### 4c. Fix hallpass mic restore

The existing restore logic at RoomClient.tsx:388–390:

```ts
// CURRENT (line 388-390):
} else if (priorHallpassMicRef.current !== null) {
  media.setMicrophoneEnabled(priorHallpassMicRef.current);
  priorHallpassMicRef.current = null;
}
```

Change to:

```ts
} else if (priorHallpassMicRef.current !== null) {
  const shouldRestore = priorHallpassMicRef.current;
  priorHallpassMicRef.current = null;
  if (shouldRestore && canUseMicrophone) {
    media.setMicrophoneEnabled(true);
  }
}
```

This requires `canUseMicrophone` to be in scope, which it is after Phase 4a adds it to `RoomClient.tsx`.

#### 4d. Update `MediaControls` to reflect locked state

Add `canUseCamera` and `canUseMicrophone` to `MediaControlsProps`:

```ts
type MediaControlsProps = {
  media: {
    cameraEnabled: boolean;
    microphoneEnabled: boolean;
    speaking: boolean;
    cameraStream: MediaStream | null;
    setCameraEnabled(value: boolean): void;
    setMicrophoneEnabled(value: boolean): void;
  };
  canUseCamera?: boolean;      // default true
  canUseMicrophone?: boolean;  // default true
};
```

Apply to buttons:

```tsx
<button
  className={`media-toggle${media.cameraEnabled ? " on" : ""}`}
  disabled={!(canUseCamera ?? true)}
  onClick={() => (canUseCamera ?? true) && media.setCameraEnabled(!media.cameraEnabled)}
  title={!(canUseCamera ?? true) ? "Camera disabled by teacher" : undefined}
>
  <span className={`media-dot${media.cameraEnabled ? " live" : ""}`} />
  {!(canUseCamera ?? true) ? "Cam locked" : media.cameraEnabled ? "Cam on" : "Cam off"}
</button>
```

Apply same pattern to the mic button using `canUseMicrophone`.

Pass `canUseCamera={canUseCamera}` and `canUseMicrophone={canUseMicrophone}` from `RoomClient.tsx` where `<MediaControls media={media} />` is rendered (line 1436).

#### 4e. Permission text update

The `useLocalMedia` hook returns `permissionText`. When a medium is teacher-locked, override the displayed text in `RoomClient.tsx` before rendering:

```ts
const mediaPermissionText = (() => {
  if (role === "teacher") return media.permissionText;
  if (!canUseCamera && !canUseMicrophone) return "Camera and microphone disabled by teacher.";
  if (!canUseCamera) return "Camera disabled by teacher.";
  if (!canUseMicrophone) return "Microphone disabled by teacher.";
  return media.permissionText;
})();
```

Pass `mediaPermissionText` to the `<p className="hud-permission">` element at RoomClient.tsx:1472.

---

### Phase 5 — Feature flag, env, and tests

#### 5a. `apps/web/lib/config.ts`

```ts
enableStudentMediaPermissions: process.env.NEXT_PUBLIC_ENABLE_STUDENT_MEDIA_PERMISSIONS === "true"
```

#### 5b. `.env.example` files

Add to `.env.example`, `apps/web/.env.example`, `apps/api/.env.example`:

```
NEXT_PUBLIC_ENABLE_STUDENT_MEDIA_PERMISSIONS=false
ENABLE_STUDENT_MEDIA_PERMISSIONS=false
```

#### 5c. Contracts tests

Add to `packages/contracts/tests/` (or the existing settings/classroom test file):

- `parseRoomSettings({})` → `studentMedia.camerasEnabled === true`, `studentMedia.microphonesEnabled === true`
- `ClassroomStateSchema.parse({})` → `studentMediaRuntime` is undefined (optional) or has correct defaults when provided
- Round-trip encode/decode for both new action schemas

#### 5d. API tests (`apps/api/tests/api.test.ts`)

- `set-student-media-global` by a teacher: verify classroom state `studentMediaRuntime.camerasEnabled` flips
- `set-student-media-global` persists into `room.settings.studentMedia`
- `set-student-media-access` adds and removes userId from the allow list
- Both actions fail (403) for a student actor
- Both actions fail (403) when `enableStudentMediaPermissions = false`
- Existing rooms with no `studentMedia` field in settings parse without error (defaults to `true`)

#### 5e. Manual two-tab validation

Open two browser windows: one as teacher, one as student.

1. Teacher turns student microphones off globally → student's mic button becomes disabled immediately (on next classroom state poll, ≤5 s).
2. Student cannot re-enable mic while locked.
3. Teacher enables microphone for that specific student → student's mic button becomes available.
4. Student turns mic on.
5. Teacher revokes global again → student's mic turns off, button locks.
6. Student refreshes → rejoins with mic still unavailable.
7. Teacher grants hallpass → student's mic mutes. Teacher also turns off mics globally. Student returns from hallpass → mic does NOT restore.

---

## Files touched (complete list)

| File | Change |
|---|---|
| `packages/contracts/src/index.ts` | `studentMedia` in `RoomSettingsSchema`, `studentMediaRuntime` in `ClassroomStateSchema`, two new action schemas, union registration, type exports |
| `packages/contracts/tests/…` | New/updated settings and classroom tests |
| `apps/api/src/app.ts` | `enableStudentMediaPermissions` in config, special-case route block for `set-student-media-global`, two new action cases in switch, runtime initialization logic |
| `apps/api/tests/api.test.ts` | Coverage for new actions and flag gate |
| `apps/web/lib/config.ts` | `enableStudentMediaPermissions` flag |
| `apps/web/components/StudentMediaAccessControls.tsx` | New component |
| `apps/web/components/BoardAccessSidePanel.tsx` | Accept and render `StudentMediaAccessControls` |
| `apps/web/components/Roster.tsx` | Thread `studentMediaRuntime` through `StudentDetailPanel` |
| `apps/web/components/MediaControls.tsx` | Add `canUseCamera` / `canUseMicrophone` props; update button disabled state and labels |
| `apps/web/components/RoomClient.tsx` | Derived permissions, revocation effect, hallpass restore fix, media permission text override, pass new props to both `BoardAccessSidePanel` and `StudentDetailPanel` call sites |
| `.env.example` | New flag |
| `apps/web/.env.example` | New NEXT_PUBLIC flag |
| `apps/api/.env.example` | New API flag |

---

## Sequencing recommendation

The phases are mostly independent, but:
- Phase 1 (contracts) must land before Phase 2 (API) and Phase 3/4 (web).
- Phase 2 and Phase 3 can be done in parallel once Phase 1 is done.
- Phase 4 depends on Phase 3 (for `canUseCamera` derivation in scope).
- Phase 5 (tests + flags) should be written alongside each phase, not saved for the end.

Start with Phase 1, run `npm run typecheck` across all packages to confirm schema changes propagate, then proceed to Phases 2, 3, and 4 together in a single PR.
