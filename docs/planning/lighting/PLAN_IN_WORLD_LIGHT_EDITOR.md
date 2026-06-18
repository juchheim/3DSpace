# Planning Doc — In-World Light Editor

Source request: in **World Builder → Lighting**, users can place Bulb (point),
Spotlight (spot) and Soft Panel (area) lights, but **adjusting** them today is
limited and has poor UI/UX. Build the ability to adjust a light **in the 3D
environment, attached to the light being adjusted** — exact X/Y/Z position,
directionality (aim), and *every other adjustable parameter* — instead of the
cramped 2D form docked at the bottom of the screen. The tool must be built with
**strong, explicitly-documented UI/UX considerations**, and its look must be
**influenced by the Verse rooms HUD and the lobby UI**.

Companion: `IMPL_IN_WORLD_LIGHT_EDITOR.md` (phased, file-by-file build plan).
Builds on the shipped lighting system (`PLAN_WORLD_BUILDER_LIGHTING.md`).

Branch target: `feature/world-building`.
Feature flag: **reuses** the existing `ENABLE_WORLD_BUILDER_LIGHTING` /
`NEXT_PUBLIC_ENABLE_WORLD_BUILDER_LIGHTING` (no new flag). With the flag off the
product is byte-for-byte unchanged.

---

## 1. One-line pitch

Replace the bottom-docked light form with an **in-world editor that lives on the
light**: a 3-axis move gizmo, a draggable aim handle, direct shape handles, and a
small Verse-themed control card tethered to the fixture — so builders adjust a
light **where they're looking at it**, in real space, with immediate visual
feedback.

---

## 2. What exists today (what we're replacing / building on)

The lighting feature is **shipped** behind the flag. Relevant pieces:

| Concern | Today | File |
| --- | --- | --- |
| Light entity + edits | `RoomLight` (point/spot/area), optimistic + realtime upsert, `commit` flag to defer the DB write to drag-end | `apps/web/lib/useRoomLights.ts`, `packages/contracts/src/lighting.ts` |
| In-world manipulation | **One `DragHandle` sphere** at the light; drags on a giant horizontal plane → **moves X/Z only, Y is locked** to the current height | `apps/web/components/RoomLightsLayer.tsx` (`DragHandle`, L26–68) |
| Findability | `LightGlyph` — a tiny `<Html>` dot you click to select | `apps/web/components/LightGlyph.tsx` |
| All other editing | `LightInspector` — a 2D form **docked at the bottom** inside the World Builder: name, on/off, color, intensity, position X/Y/Z (typed), distance, decay, **spot angle/penumbra/target X/Y/Z (typed)**, area width/height, shadow, delete | `apps/web/components/lighting/LightInspector.tsx`, rendered by `BuildControls.tsx` (~L1171) |
| Selection / placement state | `selectedLightId`, `pendingLightType` in RoomClient; `onSelectLight` / `onLightTransform(Commit)` callbacks | `apps/web/components/RoomClient.tsx` (~L1141, ~L2625) |
| Render of selected helpers | none beyond the drag sphere (no range/cone/rect helper is drawn) | `RoomLightsLayer.tsx` |
| Keyboard | `[`/`]` intensity, `Delete` remove, `Esc` cancel placement | `RoomClient.tsx` (~L1308) |

### 2.1 Why the current control is "limited and poor UX" (the problem, named)

1. **Eye ping-pong / split attention.** The light is in the world; its controls
   are a form in the opposite corner. You constantly look away from the thing
   you're editing to a 2D panel and back. This is the core complaint.
2. **No height control in the world.** The only handle drags on a floor-parallel
   plane, so Y can *only* be changed by typing a number. Lights are overhead
   fixtures — height is the most important axis and it's the one you can't grab.
3. **Direction is numbers-only.** Spot/area aim is set by typing `target` X/Y/Z.
   There is no visual aim handle, so "point the spotlight at the stage" is a
   guess-and-check typing exercise.
4. **No shape feedback or shape handles.** Range, cone angle, penumbra, and panel
   size are sliders with no in-scene preview (no range sphere, no cone, no rect),
   so you can't see what a number does without hunting.
5. **Camera-naive drag math.** The plane-drag uses the raw ray/plane hit at the
   light's current Y; at grazing camera angles small mouse moves fling the light
   metres, and there's no axis constraint or snapping.
6. **Cramped form styling.** Uppercase 11px micro-labels and tiny number inputs —
   functional, but not the "strong UI/UX" bar this request sets.

---

## 3. The design — an editor that lives on the light

When a light is **selected**, an **editor rig mounts in the 3D scene, anchored to
that light**. It has two coordinated halves, matched to the *nature* of each
parameter:

> **Design law: spatial parameters get spatial controls; scalar parameters get a
> card.** Position, aim, and size are *places and shapes in 3D* → manipulate them
> with **3D handles** in the world. Color, intensity, falloff, shadow, name,
> on/off are *values* → expose them on a compact **card tethered to the light**.

### 3.1 Half A — the in-world transform handles (gizmos)

Anchored on the selected light's transform. **Only one gizmo mode is active at a
time** (selected from the card's segmented `Move / Aim / Shape` control) so the
scene never fills with competing handles. The handles auto-size in screen space
so they stay grabbable at any camera distance.

1. **Move (all light types)** — a true 3-axis translate gizmo (drei
   `<PivotControls>` in translate-only config) on the light: drag the **X (red) /
   Y (green) / Z (blue)** arrows or the planar quads to move in *every* dimension,
   including height. A live `x, y, z` readout floats by the gizmo. Solves
   problems #2 and #5 (axis-constrained, camera-correct, with snapping).
2. **Aim (spot + area only)** — a draggable **target handle** (a ringed sphere at
   `light.target`) joined to the fixture by a **dashed beam line**, with the cone
   / panel-normal preview updating live as you drag. A polar readout shows
   **azimuth / elevation** for precision. Point lights are omnidirectional, so
   Aim is hidden for them. Solves problem #3.
3. **Shape (type-specific)** — direct-manipulation rim handles:
   - **point** → drag the equatorial ring of the **range sphere** to set
     `distance`.
   - **spot** → drag the **cone-mouth ring** to widen/narrow `angleDeg`; an inner
     ring drags `penumbra` (edge softness); cone length tracks `distance`.
   - **area** → drag the **four edge handles** of the panel rectangle to set
     `width` / `height`.
   Solves problem #4 — you *shape the light by reshaping its visualization*.

**Always-on visualization for the selected light** (independent of mode): a
range sphere (point), cone (spot), or rect outline (area), tinted to the light's
color, plus a faint **vertical stem + ground disc** under the fixture so its
height and ground position read at a glance.

### 3.2 Half B — the attached control card (Verse-themed in-world HUD)

A compact card rendered with drei `<Html>`, **tethered to the light** by a thin
leader line and offset so it never covers the fixture it controls. It carries the
scalar controls and the mode switch:

```
        ╭─ leader line to the light ─╮
   ┌───────────────────────────────────────┐
   │ ◉ Stage key            ● on   ⤢   🗑   │   type badge · inline name · on/off · focus · delete
   │ ┌───────┬───────┬────────┐             │
   │ │ Move  │  Aim  │ Shape  │  ← segmented mode (Aim hidden for Bulb)
   │ └───────┴───────┴────────┘             │
   │ Color  ◑ #ffd9a0     Intensity ──●── 2.4
   │ Range  ───●──── 14 m   Falloff ──●── 2.0   (point/spot)
   │ Cone   ──●── 32°       Soft ──●── 0.40     (spot)
   │ Size   W ──●── 2.0  H ──●── 1.2 m          (area)
   │ ☑ Cast shadows                            (point/spot)
   │ ⎘ Duplicate            x 4.0  y 3.2  z -1.5
   └───────────────────────────────────────┘
```

Card contents (type-conditional, covering **every** adjustable field in
`RoomLightSchema`):

| Control | point | spot | area | Maps to |
| --- | --- | --- | --- | --- |
| Inline name | ✓ | ✓ | ✓ | `name` |
| On / off | ✓ | ✓ | ✓ | `enabled` |
| Color swatch | ✓ | ✓ | ✓ | `color` |
| Intensity | ✓ | ✓ | ✓ | `intensity` |
| Range (distance) | ✓ | ✓ | — | `distance` |
| Falloff (decay) | ✓ | ✓ | — | `decay` |
| Cone angle | — | ✓ | — | `angleDeg` |
| Softness (penumbra) | — | ✓ | — | `penumbra` |
| Width / Height | — | — | ✓ | `width` / `height` |
| Cast shadows | ✓ | ✓ | — (disabled + note) | `castShadow` |
| Move / Aim / Shape mode | ✓ (no Aim) | ✓ | ✓ | which gizmo is live |
| Position readout x/y/z | ✓ | ✓ | ✓ | `position` (and `target` in Aim mode) |
| Duplicate · Focus · Delete | ✓ | ✓ | ✓ | actions |

Position and direction are *displayed* numerically on the card (read-only
readouts, with an optional "type exact value" expander for precision), but the
**primary** way to set them is the gizmos — the card is for values, the world is
for places.

### 3.3 What moves out of the World Builder dock

The request is explicit: per-light adjustment must live **in the 3D environment,
not the dock panel**. So:

- **Removed from the dock:** the `LightInspector` form (all per-light editing).
- **Kept in the dock** (these are *room-level*, not per-light, so they belong in
  the builder): the **Add Light** tiles (Bulb / Spot / Soft Panel), the
  **Lights-in-room list** (with on/off + delete + a "select" that opens the
  in-world card and frames the camera on it), and the **Environment** panel
  (sun/sky/IBL/fog/exposure — global, not attached to one light).

The dock list becomes a *navigator* ("jump to this light"); the editing happens
on the light. Clicking a light glyph in the world, or a row in the list, selects
it and reveals the card.

---

## 4. UI / UX considerations (required — the heart of this work)

This section is the bar the implementation is held to. Every item is testable.

### 4.1 Principles

1. **Edit-in-place / direct manipulation.** The control is *on the object*. No
   travelling between a 3D light and a 2D corner form. This is the entire reason
   the tool exists.
2. **Modality matches the parameter.** Spatial things (position, aim, size) are
   manipulated *spatially*; scalar things (color, intensity, falloff) live on the
   card. Don't make people type coordinates, and don't make them drag a slider to
   set a position.
3. **One active gizmo at a time.** Move / Aim / Shape are mutually exclusive,
   chosen on the card. Prevents handle clutter, mis-grabs, and ambiguous drags.
4. **Continuous, honest feedback.** The light updates *live* while dragging
   (optimistic), with a numeric readout and a matching visualization (range
   sphere / cone / rect / aim beam). You always see exactly what the value does.
5. **The card never fights the light.** It's offset and billboarded so it can't
   occlude the fixture it controls; it auto-flips to the side with more room;
   it dims and shrinks when the camera is far so it never dominates the scene.
6. **Camera-correct, forgiving input.** Drags use camera-relative plane/axis
   projection (no grazing-angle fling). Modifier keys: hold to **snap** (0.25 m
   position / 5° aim / 5° cone), arrow keys nudge, `Esc` deselects, `Delete`
   removes, all edits are undoable, and dragging never writes the DB until
   pointer-up (optimistic + commit-on-release).
7. **Discoverable & self-teaching.** Selecting a light reveals labeled handles
   and a one-line coachmark ("Drag the arrows to move · drag the dot to aim ·
   drag the ring to shape"); hover tooltips name each handle; the mode segmented
   control makes the three capabilities obvious.
8. **Multi-user aware.** Lights are shared and broadcast live; while another
   participant has a light selected, show a faint "edited by ___" pip on its
   card so two people don't tug the same fixture blindly.
9. **Accessible.** Card controls are real focusable inputs with ARIA labels and
   visible focus rings; hit targets meet the WCAG 24px minimum; full keyboard
   path (select → nudge position/aim/intensity → toggle/delete) without the
   pointer; honors `prefers-reduced-motion` (no card float/pulse animation).
10. **Performant.** Gizmos/helpers mount **only for the selected light** and
    dispose on deselect; the selected light is pinned into the active light
    budget so it always renders while edited; realtime upserts during a drag are
    throttled (~60–80 ms) and the DB write happens once, on release.

### 4.2 Interaction details

- **Select:** click a glyph (world) or list row (dock) → rig + card appear; the
  light is pinned active (renders even if outside the nearest-N budget).
- **Move:** default mode. Drag XYZ arrows / planar quads. Live `x,y,z` readout.
  Hold Shift to snap to 0.25 m. Arrow keys nudge ±0.1 m (±0.5 m with Shift);
  PageUp/PageDown nudge Y.
- **Aim (spot/area):** drag the target handle anywhere in space (the beam + cone
  follow); azimuth/elevation readout; `Q`/`E` rotate aim around the light;
  "look at surface" — click a surface to point the beam there.
- **Shape:** drag the range/cone/panel handles; numeric readout on the card moves
  in lock-step. Shift snaps (0.5 m range / 5° cone / 0.5 m size).
- **Scalars (card):** color swatch opens the native picker (live preview on
  `input`, commit on `change`); sliders preview on drag, commit on release
  (reusing the existing `StableRange` behavior so the DB isn't spammed).
- **Actions:** Duplicate (clones the light +1 m offset, selects the copy), Focus
  (orients the camera toward the light), Delete (with the existing
  keyboard + button paths), on/off, inline rename.
- **Deselect:** click empty space, press `Esc`, or toggle the glyph.

### 4.3 Visual language — Verse rooms HUD + lobby influence (required)

The card and handles inherit the **exact** token system already used by the
World Builder dock and the in-world object panels, so the editor feels native:

- **Deep-glass card** using the `build-dock` `--bd-*` tokens: `--bd-glass`
  (`rgba(7,12,22,0.93)`) background, `backdrop-filter: blur(22px)`, `--bd-rs`
  radius, `--bd-line(-m)` hairline borders, `--bd-tx` / `--bd-tx-m` text — the
  same surface language as `BuildControls` and the `EnvironmentPanel`.
- **Verse hue theming.** `--bd-acc` derives from `--hud-blu`/`--hud-acc`, set per
  room by `verseRoomThemeVars(verse.hue)` (`apps/web/lib/verses.ts`). The card's
  active mode tab, slider accents, and selection ring tint to the room's verse —
  the card matches the Verse HUD automatically.
- **Lobby blue-glow on primary actions.** The mode toggle's active segment and
  the Duplicate/Focus buttons use the lobby/dice-panel glow recipe
  (`linear-gradient(180deg, rgba(44,122,235,…), rgba(22,72,158,…))` + blue
  `box-shadow`, cf. `.dice-pair-panel__roll` and `.xband-lead em`'s
  `text-shadow: 0 0 30px rgba(0,184,245,.5)`). Readouts use the lobby's bright
  blue accent text.
- **In-world panel idiom.** Anchored, billboarded, rounded-glass with a thin
  leader line — the same family as `.room-object-label` and `.dice-pair-panel`,
  so an attached control card reads as "part of this world," not a browser
  overlay.
- **Type & motion.** Barlow (the HUD font), tabular-nums for readouts, calm
  150 ms transitions, gentle entrance — matching the dock and lobby cadence.

Handle colors stay consistent with the existing glyph tinting (point `#fde68a`,
spot `#a5f3fc`, area `#d9f99d`) so a light's identity is constant from glyph →
gizmo → helper.

---

## 5. Coverage — "X/Y/Z, directionality, and any other adjustments possible"

Mapped to `RoomLightSchema` (`packages/contracts/src/lighting.ts`) so nothing is
missed:

| Adjustable | How (in-world) | Types |
| --- | --- | --- |
| `position` x/y/z | Move gizmo (3-axis) + readout / exact-entry | all |
| `target` (direction) | Aim gizmo (target handle + beam) + az/el readout | spot, area |
| `color` | card swatch (verse-ringed) | all |
| `intensity` | card slider + `[`/`]` keys | all |
| `distance` (range) | Shape range-ring + card slider | point, spot |
| `decay` (falloff) | card slider | point, spot |
| `angleDeg` (cone) | Shape cone-mouth handle + card slider | spot |
| `penumbra` (softness) | Shape inner-ring + card slider | spot |
| `width` / `height` | Shape edge handles + card sliders | area |
| `castShadow` | card toggle (disabled + note for area) | point, spot |
| `enabled` (on/off) | card toggle + list toggle | all |
| `name` | inline rename on card | all |
| duplicate / delete / focus | card actions + keyboard | all |

`rotation` (an optional Euler field in the schema) stays **target-driven** for
area lights, matching the current renderer (`lookAt={target}` in
`RoomLightsLayer`); we standardize on `target` for aim and leave `rotation`
reserved/unused to avoid two sources of truth.

---

## 6. Architecture & data flow (no new persistence)

This is a **client/UX evolution** of the shipped feature. No contract, API,
repository, realtime-schema, or env-flag changes.

- **State (RoomClient):** existing `selectedLightId` + new `lightEditorMode:
  "move" | "aim" | "shape"` (default `move`, auto-reset to `move`/hide Aim by
  type). Existing `useRoomLights` is the single source of truth.
- **Writes:** reuse `useRoomLights.updateLight(id, patch, { commit })` — gizmo
  drag → `commit:false` (optimistic + throttled realtime), pointer-up →
  `commit:true` (one DB PATCH). Card scalars reuse the same `commit` discipline
  via the existing `StableRange`. Duplicate → `createLight`. Delete →
  `deleteLight`.
- **Realtime:** unchanged messages (`room.light.upsert.v1` / `remove`). Add a
  client-side **throttle on the `commit:false` broadcast** in `useRoomLights` so
  a 60 fps drag doesn't flood the LiveKit data channel (the original lighting
  PLAN called for ~80 ms; it isn't implemented yet — we add it here).
- **Render tree (inside `<Canvas>`):** `RoomLightsLayer` keeps glyphs + the real
  Three lights, and—for the selected light—mounts a new `LightEditorRig`
  (gizmo + helper viz + the `<Html>` `LightControlCard`). The dock
  `BuildControls` loses the inspector and keeps Add/list/Environment.
- **Interaction guard:** while a light is selected/edited, set a body class
  (e.g. `wb-light-editing`, sibling of the proven `wb-placement-active`) and pass
  `interactionDisabled` to object/board layers so gizmo/card pointer events win
  over avatar move / camera orbit (the established pattern in `RoomView3D`).

---

## 7. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Gizmo drag vs. camera orbit / avatar move fighting for the pointer | `wb-light-editing` body class + `interactionDisabled` on other layers + `stopPropagation` on card/handles (proven pattern). One active gizmo mode at a time. |
| `<Html>` card occludes the fixture or floats off-screen | Offset + auto-flip + leader line; clamp on-screen; dim/shrink with distance; `occlude` so geometry can hide it naturally. |
| Realtime upsert flood during 60 fps drags | Throttle `commit:false` broadcasts (~60–80 ms) in `useRoomLights`; DB write only on release. |
| Editing a light outside the nearest-N budget shows no light | Pin the selected light into the active budget so it always renders while edited. |
| PivotControls visual scale unreadable at distance / tiny up close | Use screen-space-fixed sizing (`fixed`/`scale`/`depthTest:false`); helpers tinted + always-on stem/disc for grounding. |
| drei `<PivotControls>` API drift (v10) | Thin wrapper component (`LightMoveGizmo`) isolates the dependency; fall back to the existing custom-handle approach if needed (already proven by `DragHandle`). |
| Two users edit the same light | "Edited by ___" pip from the existing realtime upserts; last-write-wins is acceptable for v1 (same as build pieces). |
| Removing the dock inspector orphans 2D editing | 2D view keeps light *icons* only (no editing) per the shipped plan; editing is a 3D affordance by design — documented, not a regression. |
| Accessibility regression vs. the form | Card uses real inputs + ARIA + keyboard nudges; keyboard-only path covered in acceptance + Playwright. |

---

## 8. Acceptance criteria

1. With the flag on, selecting a light (glyph or dock list) reveals an **in-world
   editor attached to that light** — a transform gizmo + a Verse-themed control
   card — and **no per-light form appears in the dock**.
2. **Position:** the user can move the light along **X, Y and Z** with the gizmo
   (height included), with a live numeric readout; Shift snaps; arrows nudge.
3. **Directionality:** for spot/area, the user can **aim** the light by dragging a
   target handle in 3D, with a visible beam/cone and an azimuth/elevation
   readout; point lights correctly hide Aim.
4. **Every other parameter** (color, intensity, range, falloff, cone angle,
   softness, width/height, cast-shadow, on/off, name) is adjustable from the
   attached card and/or shape handles, with live feedback.
5. Changes are **optimistic + live to other participants** and **persist on
   release** (one DB write per drag); a second participant sees moves/aims/edits
   live and they survive refresh.
6. The editor's look clearly follows the **Verse HUD `--bd-*` glass + verse-hue
   theming** and **lobby blue-glow** language; it never permanently occludes the
   light; it honors reduced-motion and is keyboard-accessible.
7. With the flag **off**, behavior and visuals are unchanged (no editor, no
   gizmos, no card).
8. `npm run typecheck` (web), the lighting math unit tests, and an updated
   Playwright lighting spec pass; 2D light icons still render.

---

## 9. Implementation outline

See `IMPL_IN_WORLD_LIGHT_EDITOR.md`. Phases (each shippable behind the flag):

0. **Plumbing & math** — extract `StableRange`, add `lightEditorMath.ts` (+tests),
   `lightEditorMode` state, `wb-light-editing` guard, realtime drag throttle.
1. **Attached control card** — `LightControlCard` (`<Html>`), Verse/lobby CSS;
   move all scalar editing in-world; remove `LightInspector` from the dock.
2. **Move gizmo (XYZ)** — `LightMoveGizmo` (PivotControls) replaces `DragHandle`;
   readout; pin selected light active.
3. **Aim gizmo (direction)** — `LightAimGizmo` for spot/area; target handle, beam,
   cone preview, az/el readout; Aim mode.
4. **Shape gizmo + helper viz** — `LightShapeGizmo` (range/cone/panel handles);
   always-on range sphere / cone / rect + stem/disc.
5. **UX polish & a11y** — coachmark, tooltips, snapping, keyboard, multi-user pip,
   reduced-motion, dock list "focus camera", 2D parity note, AI corpus update.
6. **Validation** — typecheck, vitest, Playwright, perf pass, docs/memory.
