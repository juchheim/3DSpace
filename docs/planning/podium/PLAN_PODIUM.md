# Planning Doc — Podium "stand & present" with importable notebook

Source request: World Builder podium should behave like the Student Desk —
walk up, press **E** to lock in at the podium, press **E** again to leave.
While standing at the podium a notebook overlay appears (reusing the Student
Desk notebook) with the added ability to **import a `.txt` file**, view/edit it,
and **export to PDF**.

Branch target: `feature/world-building` (active building branch).
Effort estimate: ~1.5–2.5 days.

---

## 1. One-line pitch

Turn the decorative `podium` World Builder object into an interactive
**presentation station**: stand at it with E (locked, standing — no chair), and
get the personal notebook as a teleprompter/script you can load from a text
file, edit, and export.

---

## 2. How the Student Desk works today (what we are mirroring)

The Student Desk is a world asset (`school-desk-chair2`) tagged
`sittable: true` + `deskNotebook: true` in `apps/web/lib/worldAssetCatalog.ts`.
The interaction chain:

| Concern | Mechanism (file) |
| --- | --- |
| Proximity + sit/stand state machine | `useSitting` (`apps/web/lib/useSitting.ts`) — phases `none → sitting → seated → standing → none` |
| Seat pose (where the avatar locks, facing) | `chairSeatPose()` + `findNearestChair()` (`apps/web/lib/usePlacedChairs.ts`) |
| Movement lock | `combinedLockedPosition` / `combinedLockedRotationY` → `useAvatarMovement` (`RoomClient.tsx` ~L1193) |
| Snap-on-engage | `movement.teleportToPosition(seatLockedPosition, seatYaw)` (`RoomClient.tsx` ~L1806) |
| E-key tap → sit/stand | keydown/keyup hold window → `sitting.tryInteract()` (`RoomClient.tsx` ~L1257) |
| Logic-interact suppression near a chair | guard `sittingPhaseRef`/`nearestChairRef` (`RoomClient.tsx` ~L1286) |
| Prompt HUD | "E sit" / "E stand up · N notebook" (`RoomClient.tsx` ~L4121) |
| Notebook overlay | `DeskNotebook` mounts when `seated && hasDeskNotebook(slug)` (`RoomClient.tsx` ~L4136) |
| Notebook doc model + persistence | `useDeskNotebook` (`apps/web/lib/useDeskNotebook.ts`), localStorage `3dspace.notebook:{roomId}:{userId}` |
| Page rendering (text + ink) | `NotebookPage.tsx` |
| PDF export | `notebookPdf.ts` (dynamic `jspdf`) |

The podium reuses **all** of the notebook stack (overlay, page, PDF) and the
**lock/teleport/E-key/prompt** plumbing, but replaces the *sit* state machine
with a simpler *stand-at* lock (no animation).

---

## 3. Functional scope

### 3.1 In scope (v1)

1. **Stand at podium.** Within ~1.5 m of a `podium`, the HUD shows `E present`.
   Pressing E (short tap, same hold window as sit) locks the avatar in a
   standing pose behind the podium, facing the podium front. The avatar plays
   its normal standing idle (no sit/stand clip).
2. **Leave podium.** While engaged, the prompt shows `E leave · N notebook`.
   Pressing E releases the lock and restores free movement.
3. **Notebook overlay.** While engaged, the existing `DeskNotebook` overlay
   mounts (same flip book, type/pen/highlighter/eraser tools, add pages, PDF
   export, `N` minimize/restore).
4. **Import a text file.** A toolbar **Import** button opens a file picker for
   `.txt` / `text/plain`. The file is read, paginated into notebook pages, and
   loaded into the book (replacing existing content after a confirm when the
   notebook is non-empty).
5. **Edit + export.** Imported text is editable via the existing per-page
   textarea, and exportable via the existing PDF path.
6. **Separate notebook scope.** The podium notebook persists under its own
   localStorage scope so it does not clobber the Student Desk notebook in the
   same room.

### 3.2 Out of scope (v1)

- Multi-user / shared podium content (the notebook stays personal + local, same
  as the desk).
- Podium collision (chairs/desks have no collider today; the avatar is simply
  repositioned behind the podium on engage).
- A live "presenter mode" that broadcasts the script to a board (could be a
  follow-up; v1 is a private teleprompter).
- Rich text, `.docx`/`.pdf` import, or syncing imported files to room storage.
  v1 imports plain text only, client-side.
- Auto-advance / scroll-on-speak teleprompter behavior.

---

## 4. Vocabulary

| Term | Meaning |
| --- | --- |
| **Station** | A world asset you can lock onto with E. Two kinds: a **seat** (chair/desk, with sit animation) and a **podium** (stand, no animation). |
| **Engaged** | Locked at the podium (analogous to `seated` for chairs). |
| **Stand pose** | World position + yaw the avatar snaps to when engaging a podium (`podiumStandPose`). |
| **Podium notebook** | The `DeskNotebook` overlay opened by the podium, with text import enabled and its own storage scope. |

---

## 5. Design decisions

### 5.1 Separate `useStanding` hook vs. extending `useSitting` (recommended: separate hook)

The podium lock has **no animation phases** (none → engaged → none), while
`useSitting` is a 4-phase animated machine (`sitting`/`standing` one-shot clips).
Folding the podium into `useSitting` would muddy that state machine and risk the
recently shipped desk feature.

**Recommendation:** add a small parallel hook `useStanding` that exposes the same
*lock interface* (`standLockedPosition`, `standYaw`, `nearestPodium`,
`engaged`, `tryInteract`). RoomClient merges it into the existing
`combinedLockedPosition` chain and adds one branch to the E-key handler.

Coordination rule (deterministic; chairs and podiums are mutually exclusive
catalog flags, and the avatar is near at most one):

```
on E tap:
  if seated OR near a chair        → sitting.tryInteract()
  else if engaged OR near a podium → standing.tryInteract()
  else                             → logic interact (unchanged)
```

*Alternative considered:* generalize both into a single `useStation` hook with a
`kind: "seat" | "podium"`. Cleaner long-term, more refactor risk now. Noted for a
future consolidation.

### 5.2 Stand pose (where the avatar locks)

`podiumStandPose(asset)` mirrors `chairSeatPose()`: the presenter stands a fixed
offset **behind** the podium body and faces the podium's front (toward the
audience). The exact offset distance and whether yaw needs `+ Math.PI` must be
**tuned against `podium.glb`** — exactly like the chair's `forwardOffset = 0.42`
was hand-tuned. Start from ~0.5–0.7 m behind, yaw = asset yaw.

### 5.3 Notebook reuse + text import

- Reuse `DeskNotebook` unchanged in spirit; add two optional props:
  - `storageScope?: string` — selects the localStorage key (desk vs podium) so
    the two notebooks don't share a document.
  - `enableTextImport?: boolean` — shows the **Import** toolbar button. `true`
    for the podium; `false` (default) keeps the desk identical to today.
- Import pagination is approximate-but-deterministic: soft-wrap to an estimated
  chars-per-line, chunk into `linesPerPage` derived from `NOTEBOOK_PAGE`. This
  keeps each notebook page ≈ one printed page so the PDF shows the whole script.
- Import into a non-empty notebook asks for confirmation, then replaces text
  pages (imported text drops prior ink — it is a fresh document).

### 5.4 Catalog flag

Add `podiumStand?: boolean` to `WorldAsset` and set it on `podium`. The podium
notebook is keyed off this flag (no separate `deskNotebook` flag needed on the
podium). Helpers: `isPodiumWorldAsset(slug)`, `hasPodiumNotebook(slug)`.

### 5.5 Feature flag

**None.** Like the Student Desk notebook, the capability ships with the world
asset; placing a podium already requires World Builder to be enabled. No new env
var.

---

## 6. UX details

- **Prompt (near, not engaged):** `E present`.
- **Prompt (engaged):** `E leave` · `N notebook`.
- **Engage feel:** the avatar snaps behind the podium facing front; camera
  behaves as in the seated case (locked position + fixed facing yaw; notebook
  overlay fills the lower-center). No sit clip plays.
- **Notebook toolbar (podium):** adds an **Import** (upload) button left of the
  PDF export button; everything else is identical to the desk notebook.
- **Import errors:** non-text or oversized file (> ~200 KB) → a small inline
  toast/aria-live message ("Choose a plain-text file under 200 KB"); the
  notebook is left unchanged.
- **Leaving the podium** flushes the debounced notebook save (existing unmount
  flush in `useDeskNotebook`).

---

## 7. Data + persistence

- No server changes. The podium is already a persisted `PlacedWorldAsset`
  (`usePlacedWorldAssets`); only its catalog flag changes.
- Notebook content stays in `localStorage` under a podium-specific scope, e.g.
  `3dspace.notebook:podium:{roomId}:{userId}`.

---

## 8. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Stand pose looks wrong (avatar inside/in front of podium, facing away) | Treat offset + yaw as tunables; verify against `podium.glb`, mirroring how the chair offset was tuned. |
| Double E handling (sit + podium both fire) | Single deterministic branch in the E handler; chairs/podiums are mutually exclusive catalog flags. |
| Import clobbers desk notes | Separate storage scope + confirm-before-replace. |
| Huge text file freezes paginator | Cap import size (~200 KB) and cap total pages. |
| Imported page overflows the printed PDF page | Paginate to `linesPerPage` so each page ≈ one printed page; PDF export already clips overflow as a backstop. |
| Logic/escape interact steals E near a podium | Extend the existing logic-suppression guard to also skip when near/engaged at a podium. |

---

## 9. Acceptance criteria

- Standing within range of a podium shows `E present`; tapping E locks the avatar
  behind it (standing, no sit animation); tapping E again releases.
- While engaged, the notebook overlay appears with an **Import** button; the desk
  notebook is unchanged (no Import button, same storage).
- Importing a `.txt` file fills the notebook with the file's text across pages;
  the text is editable and exports to a multi-page PDF.
- The podium notebook and the desk notebook in the same room keep separate
  content.
- `npm run typecheck -w @3dspace/web` and the web vitest suite pass.

---

## 10. Implementation outline (see `IMPL_PODIUM.md`)

1. Catalog flag + station-pose helpers (`worldAssetCatalog.ts`, `usePlacedChairs.ts`).
2. `useStanding` stand-lock hook.
3. RoomClient wiring (lock merge, E-key branch, logic suppression, prompt).
4. Notebook reuse for the podium (scope + mount).
5. Text-file import (paginator + hook method + toolbar button).
6. Tuning, polish, tests, validation.
