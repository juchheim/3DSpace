# Implementation Plan — Podium "stand & present" + importable notebook

Companion to `PLAN_PODIUM.md`. Mirrors the shipped Student Desk notebook.
Branch target: `feature/world-building`.

## Status / Scope

**Status:** Implemented (Phases 1–5 complete; Phase 6 tuning/smoke pending manual verification).

Make the `podium` World Builder object interactive: walk up → **E** to lock in
standing, **E** to leave. While engaged, the existing `DeskNotebook` overlay
mounts with a new **Import .txt** button; imported text is editable and exports
to PDF. No server changes, no new env flag (gated by placing the podium, which
already requires World Builder).

**Key reuse:** the entire notebook stack (`DeskNotebook.tsx`, `NotebookPage.tsx`,
`notebookPdf.ts`, `useDeskNotebook.ts`) and the lock / teleport / E-key / prompt
plumbing in `RoomClient.tsx`. The only genuinely new logic is a stand-lock hook,
a stand pose, and the text importer.

---

## Phase 1 — Catalog flag + station-pose helpers

**Goal:** the podium is flagged as a stand-station and we can compute where the
avatar locks in.

### 1a. `apps/web/lib/worldAssetCatalog.ts`

Add the flag to the `WorldAsset` type (next to `sittable` / `deskNotebook`):

```ts
/** When true, avatars can stand & lock at this asset with E (podium/lectern). */
podiumStand?: boolean;
```

Set it on the existing `podium` entry:

```ts
{
  slug: "podium",
  displayName: "Podium",
  glbUrl: "/objects/podium.glb",
  thumbnailUrl: "/objects/thumbnails/podium.jpg",
  scale: 0.42,
  podiumStand: true
},
```

Add helpers near `isSittableWorldAsset` / `hasDeskNotebook`:

```ts
export function isPodiumWorldAsset(slug: string): boolean {
  return worldAssetBySlug(slug)?.podiumStand === true;
}

/** True when standing at this asset should open the importable notebook. */
export function hasPodiumNotebook(slug: string): boolean {
  return worldAssetBySlug(slug)?.podiumStand === true;
}
```

### 1b. `apps/web/lib/usePlacedChairs.ts`

Add a stand pose + nearest-podium finder, mirroring `chairSeatPose` /
`findNearestChair`. The podium body is at the asset origin; the presenter stands
**behind** it (opposite the front) and faces the front.

```ts
import { isPodiumWorldAsset, isSittableWorldAsset } from "./worldAssetCatalog";

/** Distance (m) the presenter stands behind the podium origin. Tune vs. GLB. */
const PODIUM_STAND_OFFSET = 0.6;

/** World-space standing pose for an avatar presenting at `podium`. */
export function podiumStandPose(podium: PlacedChair): {
  position: { x: number; y: number; z: number };
  rotationY: number;
} {
  // Front faces (sin(yaw), 0, cos(yaw)); the presenter stands opposite the
  // front and faces the same direction (toward the audience).
  const forwardX = Math.sin(podium.yaw);
  const forwardZ = Math.cos(podium.yaw);
  return {
    position: {
      x: podium.position.x - forwardX * PODIUM_STAND_OFFSET,
      y: podium.position.y,
      z: podium.position.z - forwardZ * PODIUM_STAND_OFFSET
    },
    rotationY: podium.yaw
  };
}

/** Nearest podium-station within `radius` metres of `avatarPos`, or null. */
export function findNearestPodium(
  avatarPos: { x: number; z: number },
  assets: PlacedChair[],
  radius = 1.5
): PlacedChair | null {
  let best: PlacedChair | null = null;
  let bestDist = radius;
  for (const asset of assets) {
    if (!isPodiumWorldAsset(asset.slug)) continue;
    const d = distanceXZ(avatarPos, asset.position);
    if (d < bestDist) {
      best = asset;
      bestDist = d;
    }
  }
  return best;
}
```

> **Tuning note:** if the avatar ends up *in front of* or facing *away from* the
> lectern, flip the offset sign (`+` instead of `-`) and/or set
> `rotationY: podium.yaw + Math.PI`. This is the same hand-tuning the chair's
> `forwardOffset = 0.42` required. Verify in a running room before locking it in.

**Checkpoint:** `npm run typecheck -w @3dspace/web` passes.

---

## Phase 2 — Stand-lock hook (`useStanding`)

**Goal:** a hook with the same lock interface as `useSitting` but no animation.

**New file:** `apps/web/lib/useStanding.ts`

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { PlacedChair } from "./usePlacedChairs";
import { chairWithGroundY, findNearestPodium, podiumStandPose } from "./usePlacedChairs";

export type UseStandingReturn = {
  /** True while locked in at a podium. */
  engaged: boolean;
  /** Non-null while engaged — feeds `lockedPosition` in useAvatarMovement. */
  standLockedPosition: { x: number; y: number; z: number } | null;
  /** Yaw override while engaged (radians). */
  standYaw: number | null;
  /** Podium the avatar is currently next to (within 1.5 m) or engaged at. */
  nearestPodium: PlacedChair | null;
  /** Short E-key tap: engage (if near a podium) or leave (if engaged). */
  tryInteract: () => void;
};

export function useStanding({
  assets,
  getAvatarPosition,
  resolveGroundY
}: {
  assets: PlacedChair[];
  getAvatarPosition: () => { x: number; y: number; z: number } | null;
  resolveGroundY?: (x: number, z: number) => number;
}): UseStandingReturn {
  const [engagedId, setEngagedId] = useState<string | null>(null);
  const [standLockedPosition, setStandLockedPosition] = useState<{ x: number; y: number; z: number } | null>(null);
  const [standYaw, setStandYaw] = useState<number | null>(null);
  const engagedIdRef = useRef(engagedId);
  engagedIdRef.current = engagedId;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const pos = getAvatarPosition();
  // Recompute every render (getAvatarPosition is a stable ref callback).
  let nearestPodium: PlacedChair | null = null;
  if (pos) {
    nearestPodium = engagedId
      ? assets.find((a) => a.id === engagedId) ?? null
      : findNearestPodium(pos, assets, 1.5);
  }

  const tryInteract = useCallback(() => {
    if (engagedIdRef.current) {
      setEngagedId(null);
      setStandLockedPosition(null);
      setStandYaw(null);
      return;
    }
    const here = getAvatarPosition();
    const podium = here ? findNearestPodium(here, assetsRef.current, 1.5) : null;
    if (!podium) return;
    const grounded = resolveGroundY ? chairWithGroundY(podium, resolveGroundY) : podium;
    const { position, rotationY } = podiumStandPose(grounded);
    setEngagedId(podium.id);
    setStandLockedPosition(position);
    setStandYaw(rotationY);
  }, [getAvatarPosition, resolveGroundY]);

  return {
    engaged: engagedId !== null,
    standLockedPosition,
    standYaw,
    nearestPodium,
    tryInteract
  };
}
```

**Checkpoint:** unit test in Phase 6 covers engage/leave + nearest filtering.

---

## Phase 3 — RoomClient wiring

**Goal:** the E key engages/leaves the podium, movement locks, and logic interact
defers near a podium. All edits in `apps/web/components/RoomClient.tsx`.

### 3a. Instantiate the hook (next to `useSitting`, ~L1187)

```ts
import { useStanding } from "../lib/useStanding";
import { findNearestPodium } from "../lib/usePlacedChairs";
import { hasDeskNotebook, hasPodiumNotebook, /* … */ } from "../lib/worldAssetCatalog";

const standing = useStanding({
  assets: chairs.chairs,
  getAvatarPosition: () => avatarPositionRef.current,
  resolveGroundY: resolveWorldAssetGroundY
});
```

### 3b. Merge the lock (extend `combinedLockedPosition`, ~L1193)

```ts
// classroom lock wins, then seat, then podium.
const combinedLockedPosition =
  lockedPosition ?? sitting.seatLockedPosition ?? standing.standLockedPosition;
const combinedLockedRotationY =
  lockedPosition !== null && lockedPosition !== undefined
    ? null
    : (sitting.seatYaw ?? standing.standYaw);
```

### 3c. Snap on engage (new effect next to the sit-start effect, ~L1806)

```ts
const engagedPodiumRef = useRef(standing.engaged);
useEffect(() => {
  if (!standing.engaged) { engagedPodiumRef.current = false; return; }
  if (engagedPodiumRef.current) return; // only snap on the engage transition
  engagedPodiumRef.current = true;
  if (standing.standLockedPosition) {
    movement.teleportToPosition(standing.standLockedPosition, standing.standYaw ?? undefined);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [standing.engaged, standing.standLockedPosition, standing.standYaw]);
```

### 3d. Refs + derived state (near the sitting refs, ~L1229)

```ts
const podiumEngaged = standing.engaged;
const podiumNotebook =
  standing.engaged && standing.nearestPodium !== null && hasPodiumNotebook(standing.nearestPodium.slug);

const standingTryInteractRef = useRef(standing.tryInteract);
standingTryInteractRef.current = standing.tryInteract;
const nearestPodiumRef = useRef(standing.nearestPodium);
nearestPodiumRef.current = standing.nearestPodium;
const podiumEngagedRef = useRef(standing.engaged);
podiumEngagedRef.current = standing.engaged;
```

### 3e. E-key branch (extend the sit handler keyup, ~L1263)

Replace the single `sittingTryInteractRef.current()` call with the deterministic
branch:

```ts
const held = e.timeStamp - downAt;
if (held >= AVATAR_KEYBOARD_INTERACT_MAX_HOLD_MS) return;
e.preventDefault();
if (sittingPhaseRef.current !== "none" || nearestChairRef.current) {
  sittingTryInteractRef.current();      // seat: sit / stand
} else if (podiumEngagedRef.current || nearestPodiumRef.current) {
  standingTryInteractRef.current();     // podium: engage / leave
}
```

### 3f. Logic-interact suppression (extend the guard, ~L1292)

```ts
if (
  sittingPhaseRef.current !== "none" || nearestChairRef.current ||
  podiumEngagedRef.current || nearestPodiumRef.current
) return;
```

### 3g. Prompt HUD (extend the block at ~L4121)

```tsx
{sitting.sittingPhase !== "none" ? (
  /* …existing seated prompt… */
) : podiumEngaged ? (
  <div className="hud-interaction-prompt" role="status" aria-live="polite">
    <kbd>E</kbd> leave
    <span aria-hidden="true">·</span>
    <kbd>N</kbd> notebook
  </div>
) : nearestChairForPrompt ? (
  <div className="hud-interaction-prompt" role="status" aria-live="polite">
    <kbd>E</kbd> sit
  </div>
) : standing.nearestPodium ? (
  <div className="hud-interaction-prompt" role="status" aria-live="polite">
    <kbd>E</kbd> present
  </div>
) : null}
```

> Note: `nearestChairForPrompt` already excludes the podium (it filters by
> `isSittableWorldAsset`), so the chair/podium prompts never collide.

**Checkpoint:** in a running room, place a podium, walk up → `E present` shows →
E locks the avatar standing behind it → E leaves. `npm run typecheck -w @3dspace/web`.

---

## Phase 4 — Notebook reuse for the podium

**Goal:** mount `DeskNotebook` while engaged, with its own storage scope.

### 4a. `apps/web/lib/useDeskNotebook.ts` — scoped key

```ts
export function notebookStorageKey(roomId: string, userId: string, scope?: string): string {
  return scope
    ? `${NOTEBOOK_STORAGE_PREFIX}:${scope}:${roomId}:${userId}`
    : `${NOTEBOOK_STORAGE_PREFIX}:${roomId}:${userId}`;
}

export function useDeskNotebook({
  roomId, userId, scope
}: { roomId: string; userId: string; scope?: string }): UseDeskNotebookReturn {
  const storageKey = notebookStorageKey(roomId, userId, scope);
  // …unchanged…
}
```

The existing desk call site passes no `scope`, so the desk key is byte-identical
to today (back-compat).

### 4b. `DeskNotebook.tsx` — pass scope through

```tsx
export function DeskNotebook({
  roomId, userId, roomLabel, storageScope, enableTextImport
}: {
  roomId: string; userId: string; roomLabel?: string;
  storageScope?: string; enableTextImport?: boolean;
}) {
  const notebook = useDeskNotebook({ roomId, userId, scope: storageScope });
  // …
}
```

### 4c. `RoomClient.tsx` — mount for the podium (next to the desk mount, ~L4136)

```tsx
{seatedNotebookDesk && session ? (
  <DeskNotebook roomId={session.room.id} userId={identity.userId} roomLabel={session.room.name} />
) : null}
{podiumNotebook && session ? (
  <DeskNotebook
    roomId={session.room.id}
    userId={identity.userId}
    roomLabel={session.room.name}
    storageScope="podium"
    enableTextImport
  />
) : null}
```

**Checkpoint:** engaging the podium shows the notebook; the desk and podium
notebooks hold different content in the same room.

---

## Phase 5 — Text-file import

**Goal:** load a `.txt` file into the notebook, paginated; editable + exportable.

### 5a. Pagination + import-to-doc helpers in `useDeskNotebook.ts`

```ts
const IMPORT_MAX_BYTES = 200 * 1024;     // ~200 KB
const IMPORT_MAX_PAGES = 60;
const IMPORT_CHARS_PER_LINE = 52;        // ≈ usable width / avg glyph at NOTEBOOK_PAGE.fontSize
const IMPORT_LINES_PER_PAGE = Math.max(
  6,
  Math.floor((NOTEBOOK_PAGE.height - NOTEBOOK_PAGE.ruleTop - 18) / NOTEBOOK_PAGE.ruleSpacing)
); // ≈ 15

/** Soft-wrap raw text to ~charsPerLine, then chunk into page-sized strings. */
export function paginateImportedText(
  raw: string,
  charsPerLine = IMPORT_CHARS_PER_LINE,
  linesPerPage = IMPORT_LINES_PER_PAGE,
  maxPages = IMPORT_MAX_PAGES
): string[] {
  const wrapped: string[] = [];
  for (const rawLine of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (rawLine.length === 0) { wrapped.push(""); continue; }
    let current = "";
    for (const word of rawLine.split(" ")) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (current.length > 0 && candidate.length > charsPerLine) {
        wrapped.push(current);
        current = word;
      } else {
        current = candidate;
      }
      while (current.length > charsPerLine) {        // hard-break long words
        wrapped.push(current.slice(0, charsPerLine));
        current = current.slice(charsPerLine);
      }
    }
    wrapped.push(current);
  }
  const pages: string[] = [];
  for (let i = 0; i < wrapped.length && pages.length < maxPages; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage).join("\n"));
  }
  return pages.length > 0 ? pages : [""];
}

/** Build a fresh doc from paginated text (even page count for spreads). */
export function docFromImportedText(raw: string): NotebookDoc {
  const textPages = paginateImportedText(raw);
  const pages: NotebookPage[] = textPages.map((text) => ({ id: makeId("page"), text, strokes: [] }));
  if (pages.length % 2 !== 0) pages.push(createNotebookPage());
  return { version: 1, pages, updatedAt: new Date().toISOString() };
}
```

Expose an `importText` action from the hook (replaces the whole doc, resets to
spread 0, and persists):

```ts
const importText = useCallback((raw: string) => {
  const next = docFromImportedText(raw);
  setDoc(next);
  setSpreadIndexState(0);
  docRef.current = next;
  persist();
}, [persist]);

return { /* …existing… */, importText };
```

Add `importText: (raw: string) => void;` to `UseDeskNotebookReturn`.

### 5b. Import button in `DeskNotebook.tsx`

A hidden file input + a toolbar button (reuses `.desk-notebook__action`):

```tsx
const fileInputRef = useRef<HTMLInputElement | null>(null);
const [importError, setImportError] = useState<string | null>(null);

async function handleImportFile(file: File | null) {
  if (!file) return;
  const isText = file.type === "text/plain" || /\.(txt|md)$/i.test(file.name);
  if (!isText || file.size > 200 * 1024) {
    setImportError("Choose a plain-text file under 200 KB");
    return;
  }
  try {
    const raw = await file.text();
    if (notebookHasContent(notebook.pages) &&
        !window.confirm("Replace the current notebook with the imported text?")) return;
    notebook.importText(raw);
    setImportError(null);
  } catch {
    setImportError("Could not read that file");
  }
}
```

In the toolbar (before the export button), gated by `enableTextImport`:

```tsx
{enableTextImport ? (
  <>
    <input
      ref={fileInputRef}
      type="file"
      accept=".txt,.md,text/plain"
      style={{ display: "none" }}
      onChange={(e) => { void handleImportFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
    />
    <button
      type="button"
      className="desk-notebook__action"
      onClick={() => fileInputRef.current?.click()}
      title="Import a text file"
      aria-label="Import a text file"
    >
      <IconImport />
    </button>
  </>
) : null}
```

Add a small `IconImport` (an upward tray arrow) alongside the existing icon
components, and render `importError` in an `aria-live` span near the toolbar
(auto-clear after a few seconds, or on next successful import).

**Checkpoint:** import a `.txt` → pages fill with the text → edit a page → export
PDF shows the edited multi-page content.

---

## Phase 6 — Tuning, polish, tests, validation

### 6a. Stand-pose tuning
Place a podium, engage, and confirm the avatar stands just behind the lectern
facing the audience. Adjust `PODIUM_STAND_OFFSET` and, if needed, flip the offset
sign / add `+ Math.PI` to `rotationY` in `podiumStandPose`.

### 6b. Tests

- **New** `apps/web/tests/useStanding.test.ts` — engage near a podium sets a lock
  position; a second `tryInteract` clears it; `findNearestPodium` ignores
  non-podium assets and respects the radius. (Mirror `useSitting.test.ts`.)
- **Extend** `apps/web/tests/worldAssetCatalog.test.ts` — `isPodiumWorldAsset`
  /`hasPodiumNotebook` true for `podium`, false for `school-desk-chair2` and
  unknown slugs; `podiumStandPose` returns a point behind the origin with the
  asset yaw.
- **Extend** `apps/web/tests/deskNotebook.test.ts`:
  - `paginateImportedText` wraps long lines, honors blank lines, and chunks into
    `linesPerPage`-sized pages; caps at `IMPORT_MAX_PAGES`.
  - `docFromImportedText` returns an even page count and version 1.
  - `notebookStorageKey(room, user, "podium")` differs from the unscoped key
    (scope isolation).
  - `importText` replaces the doc and persists under the scoped key.

### 6c. Manual smoke
1. Place a podium (World Builder → Objects → Podium).
2. Walk up → `E present` → E → locked standing behind it.
3. `N` toggles the notebook; **Import** loads a `.txt`; edit a page; export PDF.
4. E again → released, free movement restored.
5. A Student Desk in the same room still opens its own (separate) notebook with
   no Import button.

### 6d. Commands
- `npm run typecheck -w @3dspace/web`
- `npm test -w @3dspace/web -- deskNotebook useStanding worldAssetCatalog`

---

## Files summary

**New:**
- `apps/web/lib/useStanding.ts`
- `apps/web/tests/useStanding.test.ts`
- `docs/planning/podium/PLAN_PODIUM.md`, `docs/planning/podium/IMPL_PODIUM.md`

**Modified:**
- `apps/web/lib/worldAssetCatalog.ts` — `podiumStand` flag + `isPodiumWorldAsset` / `hasPodiumNotebook`
- `apps/web/lib/usePlacedChairs.ts` — `podiumStandPose`, `findNearestPodium`
- `apps/web/lib/useDeskNotebook.ts` — `scope` param, `paginateImportedText`, `docFromImportedText`, `importText`
- `apps/web/components/DeskNotebook/DeskNotebook.tsx` — `storageScope` + `enableTextImport` props, Import button + `IconImport`, error message
- `apps/web/components/RoomClient.tsx` — `useStanding`, lock merge, engage snap, E-key branch, logic suppression, prompt, podium notebook mount
- `apps/web/tests/worldAssetCatalog.test.ts`, `apps/web/tests/deskNotebook.test.ts`
- `apps/web/app/globals.css` — only if the import error toast needs styling (the button reuses `.desk-notebook__action`)

---

## Acceptance criteria

- `E present` / `E leave` lock cycle works at a podium with no sit animation.
- Notebook overlay appears while engaged, with a working **Import .txt** button.
- Imported text paginates, is editable, and exports to a multi-page PDF.
- Podium and desk notebooks are independent in the same room; the desk notebook
  is unchanged (no Import button, same storage key).
- `npm run typecheck -w @3dspace/web` and the web vitest suite pass.

## Validation evidence (fill in)

- [x] `npm run typecheck -w @3dspace/web`
- [x] `npm test -w @3dspace/web -- deskNotebook useStanding worldAssetCatalog` (48 tests pass)
- [ ] Manual: podium engage/leave + stand pose looks correct
- [ ] Manual: import → edit → PDF export round-trip
- [ ] Manual: desk vs podium notebook isolation
