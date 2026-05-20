# Avatar Editor UI

## Design principles

- **Zero-instruction usable**: the UI makes the 23 zones self-evident without labels requiring explanation.
- **Live preview**: every color change immediately updates the avatar in the 3D scene (no "preview" mode — the real avatar IS the preview).
- **Grouped, not overwhelming**: 23 zones are organized into 5 collapsible sections (Head, Body, Arms, Legs, Feet).
- **Keyboard-accessible**: focus management follows tab order; Escape closes the panel.
- **Lesson lock**: when locked, the editor opens in a read-only "locked" state with a teacher-controlled message rather than completely hiding, so users understand why it's unavailable.

## Entry points

### 1. HUD button

A new icon button in the existing HUD toolbar (alongside mic/camera controls). Use a small figure/person icon. On click, toggles the avatar editor panel open/closed.

Location to add: `apps/web/components/RoomClient.tsx` in the HUD render section (around line 1000+), adjacent to `MediaControls`. Add a local state variable `avatarEditorOpen: boolean`.

### 2. Click own avatar in the 3D scene

In `RoomView3D.tsx`, the `BlockyAvatar` component (when rendered for the local participant) attaches an `onClick` handler to the avatar root group. Clicking any part of your own avatar emits an event that opens the editor. Remote avatars are NOT clickable in this way.

Implementation: pass a callback `onSelfClick?: () => void` to `BlockyAvatar`. Only attach it when `participant.local === true`.

```tsx
// In RoomView3D, when rendering the local avatar:
<BlockyAvatar
  participant={participant}
  appearance={localAppearance}
  onSelfClick={() => emit("open-avatar-editor")}
  ...
/>
```

Use a lightweight event bus or a ref callback to bridge the 3D canvas click to the React UI layer. The simplest approach is a `useAvatarEditorBridge` hook that exposes `{ open, onSelfClick }`.

## Panel layout

The editor is a floating panel, positioned on the left side of the screen (following the `--hud-lw` pattern). It uses the `HudCard` component as its outer wrapper.

```
┌──────────────────────┐
│  ✦ Your Avatar   [×] │  ← Header with close button
├──────────────────────┤
│  ▶ Head              │  ← Collapsible section
│  ▼ Body              │  ← Expanded section
│    Collar       ████ │  ← Zone row: label + color swatch
│    Chest        ████ │
│    Belly        ████ │
│    Shirt back   ████ │
│    Shirt sides  ████ │
│    Shoulder top ████ │
│  ▶ Arms              │
│  ▶ Legs              │
│  ▶ Feet              │
├──────────────────────┤
│  [Reset defaults] [Save] │
└──────────────────────┘
```

Width: 220px (fits the `--hud-lw` 180px slot — override to 220px for this panel).
Max-height: 80vh with `overflow-y: auto` on the zone list.

## Zone rows

Each zone row contains:
- A label (from `ZONE_LABELS` in `03-zone-system.md`)
- A color swatch button (a 24×24 square with a border, showing current color)
- Clicking the swatch opens a native `<input type="color">` picker

```tsx
function ZoneRow({ zoneKey, label, value, onChange }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="avatar-editor__zone-row">
      <span className="avatar-editor__zone-label">{label}</span>
      <button
        className="avatar-editor__swatch"
        style={{ background: value }}
        onClick={() => inputRef.current?.click()}
        aria-label={`Pick color for ${label}`}
      />
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={e => onChange(zoneKey, e.target.value)}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
```

The native `<input type="color">` is hidden visually — the swatch button acts as the trigger. This avoids building a custom color picker.

## Collapsible sections

Each section header is a `<button>` that toggles the section open/closed. Store expand state per-section in `useState`. Default: all sections collapsed except "Head" (which is the most expressive and differentiating).

```tsx
const [openSections, setOpenSections] = useState<Set<string>>(new Set(["Head"]));

function toggleSection(label: string) {
  setOpenSections(prev => {
    const next = new Set(prev);
    next.has(label) ? next.delete(label) : next.add(label);
    return next;
  });
}
```

## State management

The editor holds a **draft** copy of the appearance. Changes are applied to the draft and immediately reflected in the 3D scene (for live feedback). The draft is committed to the DB only when the user clicks "Save".

```typescript
type EditorState = {
  draft: AvatarAppearance;       // what the user is currently editing
  saved: AvatarAppearance;       // last successfully saved state
  saving: boolean;
  dirty: boolean;                // draft !== saved
};
```

On save:
1. Set `saving: true`
2. PATCH `/v1/users/me/avatar` with `{ appearance: draft }`
3. On success: set `saved = draft`, `dirty = false`, `saving = false`, broadcast `avatar.appearance.v1`
4. On error: show inline error message, leave `dirty = true`

On "Reset defaults":
- Set `draft = DEFAULT_APPEARANCE` (derived from user's role color)
- Does NOT auto-save — user must still click Save

On panel close without saving:
- If `dirty`, show a brief "You have unsaved changes" tooltip or restore draft to `saved`
- Decision: **restore draft to saved on close** (no confirm dialog — keeps UX simple)

## Live preview integration

The `draft` appearance object is passed directly to `BlockyAvatar` as the `appearance` prop for the local participant. Since `BlockyAvatar` updates materials in a `useEffect` on `appearance` changes, every color change is reflected in the next frame. No separate preview window is needed.

## Wave emote button

Add a "Wave" button at the bottom of the editor panel (above Save/Reset). Clicking it triggers the wave emote on the local avatar. This is a quick delight feature discoverable from the editor.

```tsx
<button
  className="avatar-editor__wave-btn"
  onClick={onTriggerWave}
  disabled={waveActive}
>
  {waveActive ? "Waving..." : "Wave 👋"}
</button>
```

Note: the only place in the codebase where an emoji is appropriate — it's a user-facing personality element, not code commentary.

## Lesson lock behavior

When `avatarEditorLocked === true`:
- The HUD button is still visible but shows a lock icon and is disabled (`aria-disabled`)
- If the user somehow opens the panel (e.g., via click on avatar before lock was applied), the panel shows a full-width banner: "Avatar editing is paused during this lesson." and all zone rows are read-only (pointer-events: none on swatches).
- The Save button is hidden when locked.

## Component tree

```
AvatarEditorPanel
  HudCard
    AvatarEditorHeader
      title "Your Avatar"
      CloseButton
    AvatarEditorBody
      [ZONE_GROUPS.map →]
        AvatarEditorSection (collapsible)
          SectionHeader (toggle button)
          [section.keys.map →]
            ZoneRow
              label
              SwatchButton → hidden <input type="color">
      AvatarEditorFooter
        WaveButton
        ResetButton
        SaveButton
    [if locked → LessonLockBanner]
```

## CSS class conventions

Follow the existing BEM pattern in the codebase:

```
.avatar-editor__panel
.avatar-editor__header
.avatar-editor__close-btn
.avatar-editor__section
.avatar-editor__section--open
.avatar-editor__section-header
.avatar-editor__zone-row
.avatar-editor__zone-label
.avatar-editor__swatch
.avatar-editor__footer
.avatar-editor__wave-btn
.avatar-editor__reset-btn
.avatar-editor__save-btn
.avatar-editor__save-btn--saving
.avatar-editor__lock-banner
```

## Files to create or modify

| File | Change |
|---|---|
| `apps/web/components/AvatarEditorPanel.tsx` | New file — the entire editor panel component |
| `apps/web/lib/useAvatarEditor.ts` | New file — editor state hook (draft, saving, dirty) |
| `apps/web/lib/useAvatarAppearance.ts` | New file — per-participant appearance map, broadcast/receive |
| `apps/web/components/RoomClient.tsx` | Add HUD button, `avatarEditorOpen` state, lesson lock derivation |
| `apps/web/components/RoomView3D.tsx` | Pass `onSelfClick` to local avatar, receive open event |
| `apps/web/app/globals.css` | Add avatar editor CSS |
