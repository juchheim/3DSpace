# Implementation Doc — In-World Light Editor

Companion to `PLAN_IN_WORLD_LIGHT_EDITOR.md`. Phased, file-by-file build plan to
move light adjustment **out of the docked `LightInspector` form and into the 3D
world, attached to the selected light** — exact X/Y/Z, aim/direction, and every
other parameter — with strong, Verse/lobby-themed UI/UX.

Scope note: this is a **web/UX-only** change. No contracts, API, repository,
realtime-schema, OpenAPI, or env-flag work. It reuses the shipped lighting
stack (`RoomLight`, `useRoomLights`, `RoomLightsLayer`, realtime upserts) and the
existing flag `ENABLE_WORLD_BUILDER_LIGHTING` /
`NEXT_PUBLIC_ENABLE_WORLD_BUILDER_LIGHTING`. Flag-off path is untouched.

Conventions:
- Reuse `useRoomLights.updateLight(id, patch, { commit })`: drag/preview →
  `commit:false`; pointer-up / blur → `commit:true`.
- UI uses the `build-dock` `--bd-*` tokens + lobby blue-glow (see CSS phase).
- Each phase ends green on `npm run typecheck -w @3dspace/web`.

Legend: 🆕 new file · ✏️ edit existing · 🧪 test.

Stack confirmed: `@react-three/drei ^10.7.7` (`PivotControls`, `Html`, `Line`,
`useHelper` available), `@react-three/fiber ^9.6.1`, `three ^0.184.0`.

---

## Phase 0 — Plumbing, math, guards (no visible change)

Goal: land shared pieces later phases plug into; zero UX change on its own.

1. 🆕 `apps/web/components/lighting/StableRange.tsx`: extract the
   preview/commit slider component currently defined **inside**
   `LightInspector.tsx` (L12–72) into a shared file, exported for reuse by both
   the card and (temporarily) the inspector. ✏️ `LightInspector.tsx` imports it.
2. 🆕 `apps/web/lib/lightEditorMath.ts` (pure, framework-free, unit-tested):
   - `projectPointerToDragPlane(rayOrigin, rayDir, anchor, planeNormal)` →
     world point; used for camera-relative target/handle drags (avoids the
     grazing-plane fling).
   - `targetToAngles(position, target)` → `{ azimuthDeg, elevationDeg }` and
     `anglesToTarget(position, azimuthDeg, elevationDeg, distance)` (inverse).
   - `coneAngleFromConeMouth(position, target, mouthPoint)` → `angleDeg` (clamped
     1–90) and `coneMouthForAngle(...)` for handle placement.
   - `snap(value, step)`, `clampLightField` helpers honoring contract bounds
     (`LIGHT_MAX_INTENSITY/DISTANCE/AREA_SIZE`, `angle 1–90`, `penumbra 0–1`,
     `decay 0–4`).
3. ✏️ `apps/web/components/RoomClient.tsx`: add
   `const [lightEditorMode, setLightEditorMode] = useState<"move"|"aim"|"shape">("move")`.
   Reset to `"move"` whenever `selectedLightId` changes; when a point light is
   selected and mode is `"aim"`, coerce to `"move"`.
4. ✏️ `apps/web/lib/useRoomLights.ts`: throttle the **`commit:false`** realtime
   broadcast (the `publishRef.current?.(upsertMsg)` path, L92–99) to ~70 ms via a
   trailing timer keyed by light id, so a 60 fps gizmo drag doesn't flood the
   data channel. Local optimistic state still updates every call (instant
   visual); only the *broadcast* is throttled. `commit:true` always flushes
   immediately (and the pending throttled msg is cancelled). Add a tiny unit
   test of the throttle gate if practical.
5. ✏️ `apps/web/components/RoomClient.tsx` + `RoomView3D.tsx`: introduce a
   `wb-light-editing` body class (set while `selectedLightId != null` in the
   Lighting category) mirroring `wb-placement-active`, and pass
   `interactionDisabled` to the object/board layers when a light is selected
   (extend the existing `Boolean(assetPlacement) || buildMode.enabled` guard in
   `RoomView3D` ~L662).

Typecheck web. No visual diff.

---

## Phase 1 — The attached control card (scalars move in-world)

Goal: every **non-spatial** adjustment moves onto a card tethered to the light;
the dock loses its per-light form.

1. 🆕 `apps/web/components/lighting/LightControlCard.tsx`:
   - Rendered via drei `<Html>` anchored at `light.position` with an upward/side
     offset, `center`, `occlude`, and `style={{ pointerEvents: "auto" }}`; stops
     pointer propagation so the canvas/camera doesn't grab drags (cf.
     `DeskNotebook` / `dice-pair` patterns).
   - Header: type badge (point/spot/area glyph + tint), inline-editable `name`
     (commit on blur/Enter), on/off toggle (`enabled`), Focus button, Delete.
   - Segmented **Move / Aim / Shape** control (Aim omitted for `point`); calls
     `onSetMode`. (Gizmos arrive in P2–P4; the control ships now and simply
     drives state.)
   - Scalar controls via `StableRange` + native color input, type-conditional per
     PLAN §3.2 table: color, intensity (all); range, falloff (point/spot); cone,
     softness (spot); width, height (area); cast-shadow toggle (point/spot, area
     disabled with note). Read-only `x/y/z` (and `target` az/el in Aim mode)
     readout with an optional "exact value" expander (number inputs that commit
     on blur/Enter — keeps a numeric fallback without the old form).
   - Props: `light`, `mode`, `verseTinted` styling via CSS vars,
     `onUpdate(patch, commit)`, `onSetMode`, `onDelete`, `onDuplicate`,
     `onFocusCamera`, `onDeselect`.
2. ✏️ `apps/web/components/RoomLightsLayer.tsx`:
   - Accept new props: `mode`, `onUpdate`, `onDelete`, `onDuplicate`,
     `onFocusCamera`, `onDeselect`.
   - For the **selected** light, render `<LightControlCard>` (replacing nothing
     visual yet besides adding the card). Keep the `DragHandle` for now (removed
     in P2).
3. ✏️ `apps/web/components/RoomView3D.tsx`: thread the card callbacks
   (`onLightUpdate`, `onDeleteLight`, `onDuplicateLight`, `onFocusLightCamera`,
   `lightEditorMode`, `onSetLightEditorMode`) from props into `<RoomLightsLayer>`
   (~L618). Add prop types alongside the existing lighting props (~L510–518).
4. ✏️ `apps/web/components/RoomClient.tsx`: pass the new props into the 3D view
   (the `lightingEnabled ? {…}` spread ~L2625): wire `onLightUpdate` →
   `roomLights.updateLight`, `onDeleteLight` → `deleteLight` + clear selection,
   `onDuplicateLight` → `createLight` from the selected light (offset +1 m, then
   select), `onSetLightEditorMode` → `setLightEditorMode`, `onFocusLightCamera`
   → camera framing helper (see P5; stub to no-op now).
5. ✏️ `apps/web/components/BuildControls.tsx`: **remove** the `<LightInspector>`
   block (~L1171–1180) from the lighting tab. Keep Add tiles, the lights list,
   and the Environment panel. Update the coachmark copy to: "Click a light in the
   3D view (or a row below) to open its controls." Make a list row's click both
   select **and** request camera focus (`onSelectLight` already exists; add an
   `onFocusLight` if framing is wired).
6. ✏️ `apps/web/components/lighting/LightInspector.tsx`: delete the file (its
   scalar logic now lives in `LightControlCard` + `StableRange`). Remove its
   import from `BuildControls.tsx`. (Keep `StableRange` from P0.)
7. 🆕/✏️ `apps/web/app/globals.css`: add `.light-card*` rules (see §"CSS" below);
   remove the now-unused `.light-inspector*` rules.

Typecheck web. Manual: select a light → card appears on it; all scalars editable
in-world; dock shows only Add/list/Environment.

---

## Phase 2 — Move gizmo (true X/Y/Z)

Goal: replace the floor-only `DragHandle` with a 3-axis translate gizmo.

1. 🆕 `apps/web/components/lighting/LightMoveGizmo.tsx`: wrap drei
   `<PivotControls>` in translate-only config (`disableRotations`,
   `disableScaling`, `activeAxes=[true,true,true]`, `depthTest={false}`,
   `fixed` + screen-space `scale`, `lineWidth`, axis colors). Anchor at
   `light.position`. `onDrag` (matrix → world position) → `onTransform(id, pos)`
   (`commit:false`); `onDragEnd` → `onTransformCommit(id, pos)` (`commit:true`).
   Render a small `<Html>`/sprite `x,y,z` readout near the gizmo. Hold-Shift
   snapping via `snap()` from `lightEditorMath`.
2. ✏️ `apps/web/components/RoomLightsLayer.tsx`: **remove `DragHandle`** (L26–68
   and its usage L169–185). When `mode === "move"` for the selected light, mount
   `<LightMoveGizmo>`. Pin the selected light into the active set so it always
   renders while edited (union `selectedId` into `activeLights` before the budget
   slice, or always-render selected).
3. ✏️ existing `onLightTransform` / `onLightTransformCommit` wiring in
   `RoomClient`/`RoomView3D` already exists (~L2630–2631) — reuse it; just make
   sure it's passed through to the gizmo.
4. ✏️ `apps/web/components/RoomClient.tsx` keyboard effect (~L1308): add arrow-key
   position nudges (±0.1 m, ±0.5 m with Shift) and PageUp/PageDown for Y, all
   `commit:true`, gated by `isKeyboardOwnedTarget` and `selectedLightId`.

Typecheck web. Manual: drag the light up/down and along each axis; readout
tracks; second browser sees the move live; release writes once.

---

## Phase 3 — Aim gizmo (directionality)

Goal: aim spot/area lights in 3D instead of typing target X/Y/Z.

1. 🆕 `apps/web/components/lighting/LightAimGizmo.tsx` (spot + area):
   - A draggable **target handle** (ringed sphere at `light.target`) using the
     `projectPointerToDragPlane` math (camera-facing plane through the current
     target) so dragging changes all three target components, not just X/Z.
   - A dashed **beam** from `light.position` to `target` via drei `<Line>`.
   - Live cone/normal preview (reuse the P4 helper) so direction is obvious.
   - `onDrag` → `onUpdate({ target }, false)`; `onDragEnd` → `{ target }, true`.
   - Azimuth/elevation readout (`targetToAngles`) shown on the card in Aim mode.
2. ✏️ `apps/web/components/RoomLightsLayer.tsx`: when `mode === "aim"` and type is
   spot/area, mount `<LightAimGizmo>` (instead of the move gizmo). For `point`,
   the card never offers Aim.
3. ✏️ `apps/web/components/RoomClient.tsx` keyboard: `Q`/`E` rotate aim around the
   light's vertical axis (recompute `target` via `anglesToTarget`), `commit:true`.
4. Optional "look at surface": clicking a surface while in Aim mode sets `target`
   to the hit point — reuse the placement intercept pattern if cheap; otherwise
   defer.

Typecheck web. Manual: drag a spotlight's target; the cone follows; az/el reads
out; point lights show no Aim tab.

---

## Phase 4 — Shape gizmo + always-on visualization

Goal: shape range/cone/panel directly, and ground every selected light visually.

1. 🆕 `apps/web/components/lighting/LightHelpers.tsx`: always-on (while selected)
   tinted visualization — range sphere (point, radius `distance`), cone (spot,
   from `angleDeg` + `distance`, oriented at `target`), rect outline (area,
   `width`×`height`, oriented at `target`), plus a faint **vertical stem + ground
   disc** under the fixture. Prefer drei `useHelper`
   (`PointLightHelper`/`SpotLightHelper`/`RectAreaLightHelper`) where it reads
   well; otherwise lightweight custom meshes/`<Line>`.
2. 🆕 `apps/web/components/lighting/LightShapeGizmo.tsx`:
   - **point** → draggable ring at the range-sphere equator → `distance`.
   - **spot** → draggable cone-mouth ring → `angleDeg`; inner ring → `penumbra`.
   - **area** → four edge handles on the rect → `width`/`height`.
   - Uses `coneAngleFromConeMouth` etc.; `commit:false` on drag, `true` on
     release; Shift snaps.
3. ✏️ `apps/web/components/RoomLightsLayer.tsx`: render `<LightHelpers>` for the
   selected light in **all** modes; mount `<LightShapeGizmo>` when
   `mode === "shape"`.

Typecheck web. Manual: range sphere/cone/rect render and reshape by dragging;
card sliders and handles stay in lock-step.

---

## Phase 5 — UX polish, accessibility, multi-user, framing

1. ✏️ `LightControlCard.tsx` + CSS: coachmark line ("Drag arrows to move · drag
   the dot to aim · drag the ring to shape"), hover tooltips on handles/segments,
   auto-flip the card to the side with more screen room, dim/shrink with camera
   distance, `prefers-reduced-motion` (disable float/pulse). Real focusable
   inputs, ARIA labels, visible focus ring, ≥24px hit targets.
2. ✏️ Multi-user pip: derive "edited by ___" from incoming
   `room.light.upsert.v1` sender activity (transient, ~2 s decay) and show a
   small pip on the card. (No schema change — purely from existing upserts.)
3. 🆕 `apps/web/lib/cameraFraming.ts` (or extend an existing camera util):
   implement `onFocusLightCamera` — orient/ease the camera toward the selected
   light (used by the card Focus button and dock list row). Keep modest (look-at
   + gentle distance), respecting reduced-motion.
4. ✏️ `apps/web/components/RoomView2D.tsx`: confirm light **icons** still render
   (no editing in 2D — documented design choice); add a tooltip "Edit lights in
   3D view." No editing controls added.
5. ✏️ `apps/api/src/ai-host/corpus/world-building-guide.md` + `prompts.ts`: update
   the Lighting section — adjusting a light now happens **in the 3D view** on the
   selected light (Move/Aim/Shape gizmos + the attached card); the dock holds
   Add/list/Environment only. ✏️ `apps/api/tests/ai-host/prompts.test.ts` if it
   asserts lighting copy.

Typecheck web + api.

---

## Phase 6 — Validation

1. 🧪 `apps/web/tests/lightEditorMath.test.ts`: `targetToAngles`/`anglesToTarget`
   round-trip, `projectPointerToDragPlane`, `coneAngleFromConeMouth`, snap/clamp
   bounds.
2. 🧪 ✏️ `apps/web/test/world-builder-lighting.spec.ts` (Playwright, flag on):
   select a light → assert the **in-world card** appears and the **dock has no
   per-light form**; change intensity/color on the card and confirm persistence
   on reload + visibility to a second context; use **keyboard nudges**
   (arrows / `[` `]`) to assert position/intensity changes (3D gizmo dragging is
   unreliable in Playwright — drive via card inputs + keyboard, noted in the
   spec); toggle on/off + delete.
3. Perf pass: confirm gizmo/helpers/card mount only for the selected light and
   dispose on deselect; realtime broadcast throttled during drag; one DB write
   per drag; selected light always renders (pinned active); flag-off path
   unchanged.
4. Run: `npm run typecheck -w @3dspace/web`, `npm run typecheck -w @3dspace/api`,
   `npm run build -w @3dspace/web`, web vitest, the Playwright lighting spec.
5. ✏️ `.cursor/memory.md` (dated entry) + this folder's `README.md` status.

---

## CSS — `.light-card*` (Verse HUD + lobby influence)

Add to `apps/web/app/globals.css`, reusing the `--bd-*` tokens so it inherits the
verse hue automatically (set by `verseRoomThemeVars`). Remove the old
`.light-inspector*` block.

```css
.light-card {
  /* same deep-glass family as .build-dock / .dice-pair-panel */
  width: 232px;
  background: var(--bd-glass, rgba(7,12,22,0.93));
  border: 1px solid var(--bd-line-m, rgba(70,120,180,0.34));
  border-radius: var(--bd-rs, 7px);
  backdrop-filter: blur(22px);
  color: var(--bd-tx, #cdd8ec);
  font-family: "Barlow", system-ui, sans-serif;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 40px -24px #000;
  padding: 10px;
  display: flex; flex-direction: column; gap: 8px;
}
.light-card__modes { display: grid; grid-template-columns: repeat(3,1fr); gap: 4px; }
.light-card__mode.is-active {
  /* lobby blue-glow, cf. .dice-pair-panel__roll */
  background: linear-gradient(180deg, rgba(44,122,235,0.32), rgba(22,72,158,0.34));
  border: 1px solid color-mix(in oklch, var(--bd-acc) 55%, transparent);
  box-shadow: 0 0 0 1px rgba(40,120,240,0.25), 0 6px 22px -10px rgba(0,140,255,0.7);
  color: #eaf4ff;
}
.light-card__readout { font-variant-numeric: tabular-nums; color: var(--bd-tx-m); }
.light-card__readout strong { color: #6fc6ff; text-shadow: 0 0 14px rgba(0,184,245,0.5); }
.light-card__slider { accent-color: var(--bd-acc, #4678b4); }
.light-card__action { /* Duplicate / Focus — lobby glow on hover */ }
.light-card__leader { /* thin connector to the fixture (drawn in 3D or as ::before) */ }
@media (prefers-reduced-motion: reduce) { .light-card { transition: none; } }
```

---

## File touch summary

**Web — new:** `components/lighting/StableRange.tsx`,
`components/lighting/LightControlCard.tsx`,
`components/lighting/LightMoveGizmo.tsx`,
`components/lighting/LightAimGizmo.tsx`,
`components/lighting/LightShapeGizmo.tsx`,
`components/lighting/LightHelpers.tsx`, `lib/lightEditorMath.ts`,
`lib/cameraFraming.ts` (or extend existing), `tests/lightEditorMath.test.ts`.

**Web — edit:** `components/RoomLightsLayer.tsx` (remove `DragHandle`; mount
gizmos + helpers + card; pin selected active), `components/RoomView3D.tsx`
(thread card/mode/transform props; `interactionDisabled` guard),
`components/RoomClient.tsx` (`lightEditorMode` state, duplicate/focus/mode/
keyboard wiring, body class), `components/BuildControls.tsx` (remove inspector;
keep Add/list/Environment; coachmark + list focus),
`components/lighting/LightInspector.tsx` (**delete**),
`components/RoomView2D.tsx` (icons-only note/tooltip), `lib/useRoomLights.ts`
(throttle `commit:false` broadcast), `app/globals.css` (`.light-card*`; remove
`.light-inspector*`).

**API — edit (docs only):** `ai-host/corpus/world-building-guide.md`,
`ai-host/prompts.ts`, `tests/ai-host/prompts.test.ts`.

**No changes:** contracts, repository, mongoose, routes, realtime schema,
OpenAPI, `.env.example`, `playwright.config.ts` (flag already present).

---

## Sequencing & dependencies

```
P0 (math + StableRange + mode state + throttle + guard)
 └─ P1 (control card; remove dock inspector)
      └─ P2 (move gizmo) ─ P3 (aim gizmo) ─ P4 (shape gizmo + helpers)
                                              └─ P5 (polish/a11y/framing/AI)
                                                   └─ P6 (validation)
```

P1 alone is already a UX win (controls move onto the light). P2 delivers the
headline X/Y/Z-in-world ask; P3 delivers directionality. Each phase ends green on
typecheck so the flag-off product is never broken.
