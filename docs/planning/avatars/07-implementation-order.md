# Implementation Order

Work through these phases sequentially. Each phase produces a testable checkpoint. Do not start the next phase until the current one is verified.

---

## Phase 1 — Contracts & types (no UI, no rendering)

**Goal:** All new TypeScript types and Zod schemas compile cleanly across all packages.

**Files to change:**
- `packages/contracts/src/index.ts` — add `AvatarAppearanceSchema`, `AvatarAppearanceMessageSchema`

**Steps:**
1. Add `AvatarAppearanceSchema` (23 string fields) as defined in `06-data-and-networking.md §1`.
2. Add `AvatarAppearanceMessageSchema` as defined in `06-data-and-networking.md §2`.
3. Export both from the package's index.
4. Run `tsc` across the monorepo and fix any type errors.

**Checkpoint:** `pnpm build` or `tsc --noEmit` passes in all packages with zero errors.

---

## Phase 2 — Database & API

**Goal:** The API can store and retrieve avatar appearance. No frontend changes yet.

**Files to change:**
- `apps/api/src/models/mongoose.ts` — extend `userSchema.avatar`
- `apps/api/src/routes/users.ts` (or equivalent) — add `PATCH /v1/users/me/avatar`
- Extend the `GET /v1/users/me` response to include `avatar.appearance`

**Steps:**
1. Add the 23 string fields to `userSchema.avatar` (all optional).
2. Add the `PATCH /v1/users/me/avatar` route as specified in `06-data-and-networking.md §4`. Validate with `AvatarAppearanceSchema`.
3. Ensure `GET /v1/users/me` includes `avatar.appearance` in its response.
4. Add `set-avatar-editor-locked` to the classroom actions handler and add `avatarEditorLocked` to the classroom state schema/model.

**Checkpoint:** Use `curl` or a REST client to:
- `PATCH /v1/users/me/avatar` with a valid appearance body → `{ ok: true }`
- `GET /v1/users/me` → response includes `avatar.appearance` with stored values
- `PATCH /v1/users/me/avatar` with an invalid body → `400`

---

## Phase 3 — Box rig (no zones, no animation)

**Goal:** The blocky humanoid shape appears in the 3D scene with flat placeholder colors. The old capsule+sphere avatar is gone.

**Files to change:**
- `apps/web/components/RoomView3D.tsx` — replace the `Avatar` function with `BlockyAvatar`
- Create `apps/web/components/BlockyAvatar.tsx` (new file)

**Steps:**
1. Create `BlockyAvatar.tsx`. Build the full group hierarchy from `02-avatar-rig.md` using hard-coded placeholder colors (e.g., all parts gray). No material arrays yet — use a single `meshStandardMaterial` per mesh.
2. Add refs for all animated groups (`leftArmPivotRef`, etc.) — leave them unused for now.
3. Replace the `Avatar` call in `RoomView3D.tsx` with `<BlockyAvatar>`. Pass stub props for `appearance` (a hardcoded default object), `helpRequestActive={false}`, `waveTriggered={false}`, `onWaveComplete={() => {}}`.
4. Keep the nameplate and camera feed billboard exactly as they are — just move them into `BlockyAvatar`.

**Checkpoint:** Load the room. All avatars appear as blocky gray humanoids at the correct height. Nameplate still shows above head. No console errors.

---

## Phase 4 — Zone materials

**Goal:** Zone colors from the appearance object are applied to the correct faces. The 23 zones are visually distinct when given different colors.

**Files to change:**
- Create `apps/web/lib/avatarMaterials.ts` — all material builder functions
- `apps/web/components/BlockyAvatar.tsx` — wire materials to meshes

**Steps:**
1. Create `avatarMaterials.ts` with:
   - `createZoneCanvasTexture` and `updateZoneCanvasTexture` (from `03-zone-system.md`)
   - `buildHeadMaterials`, `buildBodyMaterials`, `buildArmMaterials`, `buildLegMaterials`, `buildFootMaterials`
2. In `BlockyAvatar.tsx`:
   - Call all builder functions with the `appearance` prop to create material arrays.
   - Apply them to each mesh using `material-0` through `material-5` primitives (R3F pattern).
   - Add a `useEffect` that updates materials (via `updateZoneCanvasTexture` + `material.color.set`) whenever `appearance` changes.
   - Add cleanup (dispose all materials and textures) on unmount.
3. Pass the hardcoded default appearance from Phase 3 — verify all zones have visible, distinct colors.

**Checkpoint:** Each body part shows the correct zone colors. The front of the head shows three horizontal bands (hairline / face / chin). Body front shows collar/chest/belly. Leg front shows thigh/shin. No blurry texture edges (verify `NearestFilter` is set). Switching between two hardcoded appearance objects updates colors in real time.

---

## Phase 5 — Animation

**Goal:** Walk cycle, idle bob, speaking bob, raise hand, and wave emote all work correctly.

**Files to change:**
- `apps/web/components/BlockyAvatar.tsx` — add `useFrame` with the full animation logic

**Steps:**
1. Add the `useFrame` callback from `04-animation.md` to `BlockyAvatar.tsx`.
2. Test each animation in isolation:
   - **Walk**: Move the local avatar around. Arms and legs should swing in opposition. Blend should be smooth on start/stop.
   - **Idle bob**: Stand still. Body should gently breathe up/down.
   - **Speaking bob**: Enable microphone and speak (or mock `media.speaking = true`). Head should bob slightly.
   - **Raise hand**: Raise hand in ClassroomPanel. Right arm should smoothly rise and hold up. Lower it when the request is closed.
   - **Wave**: Trigger programmatically for now (will be wired to UI in Phase 6). Right arm should wave for 2 seconds and return.
3. Tune constants (`WALK_FREQ`, `WALK_AMP`, etc.) until the motion feels natural.

**Checkpoint:** All five animations play correctly. Walk blend is smooth. Raise hand correctly tracks help request status. Wave emote fires once and resets.

---

## Phase 6 — Appearance data flow (networking + persistence)

**Goal:** Appearance is loaded from the DB on startup, persisted on save, and broadcast to all room participants.

**Files to change:**
- Create `apps/web/lib/useAvatarAppearance.ts`
- `apps/web/components/RoomClient.tsx` — add message listener, re-broadcast on join, extend `ParticipantView`
- Wherever `GET /v1/users/me` is called on auth load — read `avatar.appearance`

**Steps:**
1. Create `useAvatarAppearance.ts` as specified in `06-data-and-networking.md §5`.
2. On auth load, read `user.avatar.appearance` from the API response. If null, compute `defaultAppearance(user.avatar.color)`. Store as local appearance.
3. In `RoomClient.tsx`:
   - Add the `avatar.appearance.v1` message listener.
   - On room join, broadcast local appearance.
   - On `participantJoined` event, re-broadcast local appearance.
   - Extend `ParticipantView` to include `avatarAppearance`.
4. Pass `participant.avatarAppearance` to `BlockyAvatar` instead of the hardcoded stub.

**Checkpoint:** 
- Open the app in two browser windows (two participants).
- Participant A's avatar appears with default colors in participant B's view.
- (Editor not built yet — manually PATCH appearance via API or hardcode a different default.)
- Verify appearance persists across page reload.

---

## Phase 7 — Avatar editor UI

**Goal:** The in-room editor panel opens, allows color changes, and saves.

**Files to create/change:**
- Create `apps/web/components/AvatarEditorPanel.tsx`
- Create `apps/web/lib/useAvatarEditor.ts`
- `apps/web/components/RoomClient.tsx` — add HUD button, `avatarEditorOpen` state
- `apps/web/components/RoomView3D.tsx` — add `onSelfClick` to local avatar
- `apps/web/app/globals.css` — add editor CSS

**Steps:**
1. Create `useAvatarEditor.ts` with draft/saved/dirty/saving state as specified in `05-editor-ui.md §State management`.
2. Create `AvatarEditorPanel.tsx`:
   - All 5 collapsible sections with zone rows.
   - Each zone row uses a hidden `<input type="color">` triggered by a swatch button.
   - Color changes update draft immediately (live preview — avatar updates in the scene).
   - Save button calls `PATCH /v1/users/me/avatar` then broadcasts `avatar.appearance.v1`.
   - Reset button restores draft to `defaultAppearance(roleColor)`.
   - Wave button triggers wave emote.
3. Add HUD button to `RoomClient.tsx` that toggles `avatarEditorOpen`.
4. Add `onSelfClick` callback to the local participant's `BlockyAvatar` in `RoomView3D.tsx`. Wire it to open the editor.
5. Implement lesson lock: derive `avatarEditorLocked` from classroom state and pass to the panel.
6. Write CSS for all editor classes.

**Checkpoint:**
- Open editor via HUD button — panel appears.
- Click own avatar in scene — panel appears.
- Change a color — avatar updates immediately in the scene (live preview confirmed).
- Click Save — appearance persists after page reload.
- In a second window, the other participant sees the updated colors appear within ~1 second of saving.
- Lesson lock: start a lesson, set `avatarEditorLocked: true` via teacher action — editor button disables, panel shows lock banner.
- Close panel without saving — draft resets to last saved state.

---

## Phase 8 — Polish & edge cases

**Steps (no particular order):**
1. **Memory leak audit**: Confirm materials and canvas textures are disposed on avatar unmount. Test by having a participant leave and rejoin the room — check browser DevTools memory profile for leaks.
2. **Join flash**: Ensure there's no brief "wrong color" flash when joining a room that already has participants. If flash occurs, increase the timeout for waiting for `avatar.appearance.v1` before first render, or show the avatar only after appearance is received.
3. **Mobile layout**: Test the editor panel on a narrow viewport. Apply responsive adjustments to panel width and zone row layout as needed.
4. **Accessibility**: Verify all swatch buttons have `aria-label`. Verify the panel can be navigated by keyboard. Verify Escape closes the panel.
5. **2D view**: The 2D map view (`RoomView2D.tsx`) still renders avatars as circles — this is intentional and requires no change. The circle fill color should continue using the existing group/role color, not the avatar appearance.
6. **Default appearance for new zones on old users**: If an existing user has a partially-saved appearance (from an older schema version), fill missing keys with defaults before applying. Handle this in `useAvatarAppearance.getAppearance`.
7. **Error state**: If the PATCH to save appearance fails, show an inline error in the editor ("Couldn't save. Try again.") and keep `dirty: true`.

---

## File creation summary

New files:
```
apps/web/components/BlockyAvatar.tsx
apps/web/components/AvatarEditorPanel.tsx
apps/web/lib/avatarMaterials.ts
apps/web/lib/useAvatarAppearance.ts
apps/web/lib/useAvatarEditor.ts
```

Modified files:
```
packages/contracts/src/index.ts
apps/api/src/models/mongoose.ts
apps/api/src/routes/users.ts   (or wherever user routes live)
apps/web/components/RoomView3D.tsx
apps/web/components/RoomClient.tsx
apps/web/app/globals.css
```

## Estimated effort per phase

| Phase | Description | Days |
|---|---|---|
| 1 | Contracts & types | 0.5 |
| 2 | Database & API | 0.5 |
| 3 | Box rig | 0.5 |
| 4 | Zone materials | 1.0 |
| 5 | Animation | 1.0 |
| 6 | Networking & persistence | 1.0 |
| 7 | Editor UI | 1.5 |
| 8 | Polish | 1.0 |
| **Total** | | **~7 days** |
