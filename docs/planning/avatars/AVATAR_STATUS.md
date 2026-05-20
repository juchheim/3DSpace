# Avatar Customization — Implementation Status

**Planning docs:** `docs/planning/avatars/` — read these before continuing.  
**Branch:** `mvp-plus-one`  
**Last updated:** 2026-05-20

---

## Overall progress

| Phase | Description | Status |
|---|---|---|
| 1 | Contracts & types | ✅ Done |
| 2 | Database & API | ✅ Done |
| 3 | Box rig (Three.js geometry) | ✅ Done |
| 4 | Zone materials (canvas textures) | ✅ Done |
| 5 | Animation | ✅ Done |
| 6 | Appearance data flow (networking) | ✅ Done |
| 7 | Avatar editor UI | ✅ Done |
| 8 | Polish & edge cases | ✅ Done |

---

## Phases 1–3 — Done ✅

See previous entries for detail. Short summary:
- **Phase 1:** New schemas in `packages/contracts/src/index.ts` — `AvatarAppearanceSchema`, `AvatarAppearanceMessageSchema`, `ClassroomSetAvatarEditorLockedActionSchema`, `avatarEditorLocked` field on `ClassroomStateSchema`.
- **Phase 2:** DB schema extended, `PATCH /v1/users/me/avatar` and `GET /v1/users/me` added, session response includes `avatarAppearance`, classroom action handled.
- **Phase 3:** `BlockyAvatar.tsx` created with full box rig; `DEFAULT_APPEARANCE` constant; old `Avatar` removed from `RoomView3D.tsx`.

---

## Phase 4 — Done ✅

### What was changed

**`apps/web/lib/avatarMaterials.ts`** — new file

Core types and functions for the zone material system:

- **`FaceMaterials`** — 6-tuple type `[MeshStandardMaterial, ...(×6)]`. Used everywhere instead of `MeshStandardMaterial[]` to satisfy `noUncheckedIndexedAccess`.

- **`createZoneCanvasTexture(width, height, zones)`** — creates an HTML canvas, paints colored rectangles, wraps in a `CanvasTexture` with `NearestFilter` on both mag and min (keeps blocky zone edges sharp, no blurring).

- **`updateZoneCanvasTexture(texture, zones)`** — repaints the canvas in-place and sets `texture.needsUpdate = true`. Called on appearance change; never recreates the texture object.

- **Five `buildXMaterials(z)` functions** — each returns a `FaceMaterials` tuple for one body part, initialized from an `AvatarAppearance` object:
  - `buildHeadMaterials` — face 4 (+Z front) has a 16×16 canvas: hairline strip (y 0–3), face skin (y 3–13), chin accent (y 13–16)
  - `buildBodyMaterials` — face 4 has an 8×12 canvas: collar (y 0–2), chest (y 2–7), belly (y 7–12)
  - `buildArmMaterials` — all 6 faces are solid colors (sleeve, sleeve, shoulderCap, hand, sleeve, sleeve)
  - `buildLegMaterials` — face 4 has a 4×12 canvas: thigh (y 0–6), shin (y 6–12)
  - `buildFootMaterials` — all solid colors (shoeSide ×2, shoeTop, shoeSole, shoeToe, shoeSide)

- **Five `updateXMaterials(mats, z)` functions** — mutates an existing `FaceMaterials` in-place: calls `material.color.set(hex)` for solid faces, calls `updateZoneCanvasTexture` for canvas faces. No allocations.

- **`disposeMaterials(mats)`** — calls `mat.map?.dispose()` then `mat.dispose()` for each material. Called on unmount.

- **`ZONE_LABELS`** — `Record<keyof AvatarAppearance, string>` display names for all 23 zones. Used in Phase 7 editor.

- **`ZONE_GROUPS`** — ordered array of `{ label, keys[] }` groupings for the editor panel sections.

**`apps/web/components/BlockyAvatar.tsx`** — updated

Material system wired in:
- Imports all build/update/dispose functions and `FaceMaterials` type from `avatarMaterials`
- Five `useRef<FaceMaterials | null>(null)` for material arrays (head, body, arm, leg, foot)
- Eight `useRef<Mesh>(null)` for mesh nodes (head, body, leftArm, rightArm, leftLeg, rightLeg, leftFoot, rightFoot)
- **Lazy init in render body**: `if (headMatsRef.current === null) { headMatsRef.current = buildHeadMaterials(appearance); ... }` — runs only once
- **Mount effect** `[]`: assigns each material array to its mesh(es) via `mesh.material = matsRef.current`; left and right arms share `armMatsRef`, left and right legs share `legMatsRef`, left and right feet share `footMatsRef`
- **Update effect** `[appearance]`: calls all five `updateXMaterials` functions whenever appearance prop changes; no re-allocation
- **Cleanup effect** `[]` returning disposal: disposes all five material arrays on unmount
- `appearance` prop is now actively used (no longer `_appearance`)
- `MeshStandardMaterial` removed from `three` import (no longer needed directly)

### Implementation note: shared arm/leg materials

Left and right arms share the same `armMatsRef` instance (same for legs and feet). This means both sides always have identical colors, which matches the design spec. If per-side asymmetry is ever needed, split into separate refs.

### Verification

`tsc --noEmit` passes zero errors on all packages.

Visual checkpoint:
- Avatars show zone colors from `DEFAULT_APPEARANCE`: dark brown hair, skin-tone face, white collar, navy shirt, navy legs with thigh/shin bands, near-black shoes
- Head front face shows three horizontal bands (hairline / face / chin)
- Body front shows collar strip at top, then chest, then belly
- Leg front shows thigh / shin split
- No blurry zone borders (NearestFilter confirmed)
- Changing `DEFAULT_APPEARANCE` values and hot-reloading updates avatar colors

---

## Phase 5 — Done ✅

### What was changed

**`apps/web/components/BlockyAvatar.tsx`** — animation system added

Added a `useFrame` callback that drives all five animations. The six group refs (`headGroupRef`, `bodyGroupRef`, `leftArmPivotRef`, `rightArmPivotRef`, `leftLegPivotRef`, `rightLegPivotRef`) were already attached to their JSX groups in Phase 3 — Phase 5 just wires them to animation logic.

**Three new `useRef` fields (persistent animation state, no re-renders):**
```typescript
const walkBlendRef  = useRef(0);     // 0=idle → 1=walking, interpolated
const wavePhaseRef  = useRef(0);     // 0..1 progress through wave emote
const waveActiveRef = useRef(false);
```

**Five animations implemented in `useFrame`:**
1. **Walk cycle** — `walkBlendRef` lerps to 1 (walking) or 0 (idle) at `delta * 8`. `swing = Math.sin(t * WALK_FREQ * 2π) * WALK_AMP * blend`. Left arm: `+swing`, right arm: `-swing`, left leg: `-swing`, right leg: `+swing`.
2. **Idle bob** — `bodyGroupRef.position.y = Math.sin(t * 0.8 * 2π) * 0.004 * (1 - blend)`. Fades out while walking.
3. **Speaking bob** — `headGroupRef.position.y = Math.sin(t * 4 * 2π) * 0.008` while `media?.speaking`, else 0.
4. **Raise hand** — right arm `rotation.x` lerps toward `Math.PI * 0.80` while `helpRequestActive`, lerps back when false.
5. **Wave emote** — triggered by `waveTriggered` prop. `wavePhaseRef` advances 0→1 over 2.0 seconds. Right arm oscillates at raised-sideways position with sinusoidal envelope. Calls `onWaveComplete()` when done.

**Priority on right arm**: wave > raise hand > walk. Left arm and legs: walk cycle only.

**Constants:**
- `WALK_FREQ = 2.5` Hz, `WALK_AMP = Math.PI / 6`
- `WAVE_DURATION = 2.0` s, `WAVE_FREQ = 3.5` Hz, `WAVE_AMP = Math.PI / 5`, `WAVE_BASE = -Math.PI / 2`

Props `helpRequestActive`, `waveTriggered`, `onWaveComplete` had `_` prefixes removed — now actively used.

### Verification

`tsc --noEmit` on `apps/web/tsconfig.json` passes zero errors.

---

## Phase 6 — Done ✅

### What was changed

**`apps/web/lib/realtime.ts`** — `AvatarAppearanceMessage` added to `RealtimeMessage` union. Reliable delivery is automatic: the existing publish logic already sends all non-`avatar.state.v1` messages as reliable (TCP-backed).

**`apps/web/lib/useAvatarAppearance.ts`** — new file. Manages a `Map<participantId, AvatarAppearance>` in React state.
- `receiveAppearance(id, appearance)` — called when an `avatar.appearance.v1` message arrives from a remote participant.
- `setLocalAppearance(id, appearance)` — called on session load and on save (Phase 7).
- `getAppearance(id)` — returns stored appearance for the given participant, or `DEFAULT_APPEARANCE` if not yet received.

**`apps/web/components/RoomClient.tsx`** — four additions:
1. **Session load**: reads `nextSession.avatarAppearance ?? DEFAULT_APPEARANCE`, stores in both `localAppearanceRef` (for use in callbacks) and calls `setLocalAppearance(participantId, ...)` (for rendering).
2. **On connect**: after publishing `participant.presence.v1`, immediately publishes `{ type: "avatar.appearance.v1", participantId, appearance: localAppearanceRef.current }`.
3. **New participant detection**: a `seenParticipantsRef: Set<string>` tracks participants we've already re-broadcast to. When the `participant.presence.v1` handler first sees a participant (`!seenParticipants.has(id)`), it re-publishes our appearance so the new joiner receives it.
4. **Incoming appearance messages**: `handleMessage` now handles `avatar.appearance.v1` — validates with `AvatarAppearanceMessageSchema.safeParse`, calls `receiveAppearance`.

**`apps/web/components/RoomView3D.tsx`** — `getAppearance: (id: string) => AvatarAppearance` prop added. `BlockyAvatar` call site uses `appearance={getAppearance(participant.id)}` instead of the hardcoded `DEFAULT_APPEARANCE`.

### Key implementation decisions

- **Render-time derivation** (not storing in `ParticipantView`): appearance is resolved at render via `getAppearance` prop, avoiding stale data in state and eliminating the need to update every `setParticipants` construction site.
- **`localAppearanceRef`** avoids stale closures: the connect effect captures `session` at mount time, so `localAppearanceRef.current` is used for the on-connect broadcast rather than reading from the hook's state.
- **`seenParticipantsRef` outside state updaters**: re-broadcast on new participant is checked and published *before* `setParticipants`, keeping the updater pure (no side effects inside).

### Verification

`tsc --noEmit` passes zero errors on all packages (`contracts`, `api`, `web`).

Functional checkpoint (manual):
- Open the room in two windows with no saved appearance → both render `DEFAULT_APPEARANCE`.
- `PATCH /v1/users/me/avatar` with a custom appearance for one user, then reload their window → their avatar renders with custom colors on join.
- Second window sees the updated colors within ~1 second of the first user joining.

---

## Phase 7 — Done ✅

### What was changed

**`apps/web/lib/useAvatarEditor.ts`** — new file. Manages editor draft state:
- `draft: AvatarAppearance` — in-flight edits
- `dirty: boolean` — `JSON.stringify(draft) !== JSON.stringify(savedAppearance)`
- `saving: boolean`, `saveError: string`
- `setZone(key, color)` — updates one zone in the draft
- `resetDraft()` — reverts draft to `savedAppearance`, clears error
- `save(onSave)` — wraps the async save call with loading/error state

**`apps/web/components/AvatarEditorPanel.tsx`** — new file. Receives `savedAppearance`, `onSave`, `onDraftChange`, `onClose`, `onTriggerWave`, `waveActive`, `locked`. Internally calls `useAvatarEditor`. Propagates draft changes via `onDraftChange` in a `useEffect` on `draft`. Closes on Escape key.

Structure: header + lock banner + scrollable zone body + footer.
- **Zone body**: `ZONE_GROUPS` → collapsible sections. Default open: "Head". Each zone row has a swatch `<button>` that clicks a hidden `<input type="color">`.
- **Footer**: Wave button (disabled while `waveActive || locked`), Reset button (hidden if `!dirty || locked`), Save button (disabled while `!dirty || saving`, hidden when `locked`), inline save-error paragraph.
- `exactOptionalPropertyTypes` fix: `onChange` on `ZoneRow` uses conditional spread `{...(locked ? {} : { onChange: setZone })}`.

**`apps/web/lib/api.ts`** — added `patchAvatarAppearance(identity, appearance)` calling `PATCH /v1/users/me/avatar`.

**`apps/web/components/BlockyAvatar.tsx`** — `onClick?: () => void` prop added. Wired to the root `<group>` via `{...(onClick ? { onClick } : {})}` (exactOptionalPropertyTypes-safe).

**`apps/web/components/RoomView3D.tsx`** — three new optional props:
- `onSelfClick?: () => void` — passed as `onClick` to the local avatar's group
- `localWaveTriggered?: boolean` — `waveTriggered` for local avatar only
- `onLocalWaveComplete?: () => void` — resets wave state in RoomClient

At the BlockyAvatar call site, `isLocal = participant.id === localParticipantId` determines which props to pass.

**`apps/web/components/RoomClient.tsx`** — five additions:
1. **State**: `avatarEditorOpen`, `localDraftAppearance: AvatarAppearance | null`, `waveTriggered: boolean`
2. **`avatarEditorLocked`**: derived from `classroom.state?.lessonRun?.status === "running" && classroom.state?.avatarEditorLocked === true`
3. **`effectiveGetAppearance`**: returns `localDraftAppearance` for the local participant when set (live preview), falls back to `getAppearance(id)`
4. **HUD button**: "👤 Avatar" button inside the identity panel, visible in 3D mode. Becomes "🔒 Avatar" and disabled when `avatarEditorLocked`.
5. **`<AvatarEditorPanel>`** rendered conditionally at the bottom of `<main>`. `onSave` handler: `patchAvatarAppearance` → update `localAppearanceRef` → `setLocalAppearance` → `publishRealtime(avatar.appearance.v1)`. `onDraftChange` updates `localDraftAppearance` state.

**`apps/web/app/globals.css`** — CSS for all `.avatar-editor__*` classes appended at end of file. Panel is `position: fixed; left: calc(var(--hud-lw) + 12px); bottom: 6px; width: 220px; max-height: 80vh`.

### Key implementation decisions

- **`onDraftChange` callback** (not lifting state): draft is managed inside `AvatarEditorPanel` but propagated to `RoomClient` via `onDraftChange(draft)` on each `useEffect` on `draft`. This keeps the editor self-contained while enabling live preview.
- **Draft resets on close** (no confirm dialog): the panel unmounts when `avatarEditorOpen` becomes false, discarding draft state. `localDraftAppearance` is set to null in `onClose`, instantly restoring the last saved appearance.
- **Wave tracking**: `waveTriggered` boolean in RoomClient; passed as `localWaveTriggered` to `RoomView3D` → local `BlockyAvatar`. `onLocalWaveComplete` resets it to `false`. The Wave button in the editor disables while `waveTriggered === true`.

### Verification

`tsc --noEmit` passes zero errors on all packages.

Functional checkpoint (manual):
- Open editor via "👤 Avatar" HUD button → panel slides in on left.
- Click own avatar mesh in 3D scene → same panel opens.
- Change a zone color → avatar in scene updates immediately (live preview confirmed).
- Click Save → `PATCH /v1/users/me/avatar` 200; appearance persists after reload.
- Second window sees updated colors within ~1 second.
- Close without saving → avatar reverts to last saved colors.
- Wave button → right arm waves for 2 seconds, button shows "Waving…" then resets.

---

## Phase 8 — Done ✅

### What was changed

**`apps/web/lib/useAvatarAppearance.ts`** — `getAppearance` now merges the stored appearance over `DEFAULT_APPEARANCE` instead of returning one or the other wholesale:
```typescript
return { ...DEFAULT_APPEARANCE, ...stored };
```
This means users who saved before a new zone was added to the schema still get a sensible default for the missing key, rather than falling all the way back to all-default.

**`apps/web/lib/useAvatarEditor.ts`** — `save()` catch block now extracts the error message:
```typescript
} catch (e) {
  setSaveError(e instanceof Error ? e.message : "Couldn't save. Try again.");
}
```
The API returns `{ message: string }` on 400/401 and `apiFetch` wraps it in `new Error(payload.message)`, so the user sees the actual server reason (e.g., "invalid appearance") rather than a generic string.

**`apps/web/components/LessonRunControls.tsx`** — Two new optional props added:
- `avatarEditorLocked?: boolean`
- `onToggleAvatarLock?: () => void`

When `isActive && onToggleAvatarLock` is truthy, a "Avatar editing on" / "🔒 Avatars" toggle button appears in the `lesson-controls` row. Uses `.hud-btn--active` when locked.

**`apps/web/components/RoomClient.tsx`** — Passes `avatarEditorLocked` and `onToggleAvatarLock` to `<LessonRunControls>`. The toggle handler calls `classroom.runAction({ type: "set-avatar-editor-locked", locked: !avatarEditorLocked })`.

**`apps/web/app/globals.css`** — Mobile media query added at end of avatar editor section:
```css
@media (max-width: 640px) {
  .avatar-editor__panel {
    left: 6px;
    right: 6px;
    width: auto;
    bottom: calc(var(--hud-th) + 140px);
  }
}
```
Floats the panel edge-to-edge above the D-pad on narrow screens.

### Memory audit — code verified correct, no changes needed

`BlockyAvatar.tsx` `useEffect` cleanup (empty deps, runs on unmount):
- `disposeMaterials(xMatsRef.current ?? [])` called for all 5 body parts
- `disposeMaterials` calls `mat.map?.dispose()` (canvas textures) then `mat.dispose()` for each material
- Left/right arms share one `armMatsRef` — disposed once, correct
- `BoxGeometry` nodes use R3F's built-in disposal on unmount — no manual disposal needed

### Join flash — accepted as-is

Remote avatars briefly render with `DEFAULT_APPEARANCE` until their `avatar.appearance.v1` arrives (~100ms on local networks). This is acceptable — the flash is brief and distinguishable only when two users have very different color schemes. A future improvement could hold the avatar render transparent until appearance arrives, but this adds complexity for minimal gain.

### Verification

`tsc --noEmit` passes zero errors on all packages.

---

## Avatar customization — complete ✅

All 8 phases shipped. The system provides:
- 23 named color zones across head, body, arms, legs, and feet
- Blocky humanoid rig with walk cycle, idle bob, speaking bob, raise-hand, and wave emote
- In-room color picker editor with live preview, save/reset, wave button
- Appearance persisted in MongoDB, broadcast to all room participants via LiveKit reliable messages
- Lesson lock for teachers during active lessons
- Mobile-friendly editor layout

---

## Key architectural context

- **`FaceMaterials`** is a 6-tuple, not a plain array. Required by `noUncheckedIndexedAccess`. Any code that builds or updates materials must use this type.
- **Left/right arms share one `FaceMaterials` instance**; same for legs and feet. Setting colors on one side sets both.
- **Canvas textures use `NearestFilter`** — never change this; it's what keeps zone edges sharp.
- **`appearance` prop changes trigger imperative material updates** via `useEffect([appearance])`. React does NOT re-mount the component or recreate materials.
- **Disposal**: all GPU materials and textures are disposed in the `useEffect` cleanup on unmount. Do not skip this.
- **`DEFAULT_APPEARANCE`** lives in `BlockyAvatar.tsx`. `useAvatarAppearance.ts` imports it from there as the fallback for participants whose appearance hasn't arrived yet.
- **`localAppearanceRef`** in `RoomClient.tsx` mirrors `localAppearanceRef.current` for use in the connect-effect callback (avoids stale closure). Always update both the ref and `setLocalAppearance` together when saving.
- **`getAppearance`** is derived at render time (not stored in `ParticipantView`). This is intentional — appearance updates arrive asynchronously and shouldn't require re-constructing participant state.

## Where to find things

| Thing | Location |
|---|---|
| `FaceMaterials` type + all material builders/updaters | `apps/web/lib/avatarMaterials.ts` |
| `ZONE_LABELS`, `ZONE_GROUPS` (for editor) | `apps/web/lib/avatarMaterials.ts` |
| `BlockyAvatar` component | `apps/web/components/BlockyAvatar.tsx` |
| `DEFAULT_APPEARANCE` constant | `apps/web/components/BlockyAvatar.tsx` |
| Avatar render call site | `apps/web/components/RoomView3D.tsx` — search `BlockyAvatar` |
| Appearance state hook | `apps/web/lib/useAvatarAppearance.ts` |
| Editor draft/save state hook | `apps/web/lib/useAvatarEditor.ts` |
| Avatar editor panel component | `apps/web/components/AvatarEditorPanel.tsx` |
| `localAppearanceRef` + broadcast logic | `apps/web/components/RoomClient.tsx` — search `localAppearanceRef` |
| Live preview + HUD button + wave state | `apps/web/components/RoomClient.tsx` — search `avatarEditorOpen` |
| `patchAvatarAppearance` API call | `apps/web/lib/api.ts` |
| `RealtimeMessage` union (includes appearance) | `apps/web/lib/realtime.ts` |
| Avatar appearance schemas | `packages/contracts/src/index.ts` — search `AvatarAppearanceSchema` |
| User API routes | `apps/api/src/app.ts` — search `GET /v1/users/me` |
| Classroom action handler | `apps/api/src/app.ts` — search `set-avatar-editor-locked` |
| Session response with appearance | `apps/api/src/app.ts` — search `sessionUser` |
| Planning docs | `docs/planning/avatars/` |
