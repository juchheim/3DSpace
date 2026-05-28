# Plan — Whiteboard Surface

Source: [`FRAME_FEATURE_PARITY_GAP_ANALYSIS.md`](../rooms/free-for-all/FRAME_FEATURE_PARITY_GAP_ANALYSIS.md) (High-Impact / Near-Term parity item #1)
Branch target: `whiteboards` (additive feature; lands after Free-for-All Phase 1)
Last updated: 2026-05-28

---

## 1. Overview

Add a **collaborative whiteboard** as a first-class wall-mounted surface across every 3DSpace room type. The whiteboard renders inside an existing `WallAnchor` (or a Free-for-All dynamic anchor) the same way other wall objects do, but its content is a live, multi-user drawing canvas rather than a static asset, web resource, or live media track.

This closes the most-requested Frame parity gap (`Whiteboards` is listed in Frame's Collaboration capability set at https://learn.framevr.io/features) and gives every room type — classroom, workforce-training, and free-for-all — the same expressive co-creation surface.

The whiteboard piggybacks on the existing `WallObject` lifecycle (`type: "whiteboard"` is already in the `WallObjectTypeSchema` enum and reserved by `apps/api/src/app.ts`). What is new is the **stroke stream**, the **realtime fan-out**, the **persistence model for ink**, and the **UI/UX surface** for drawing.

### 1.1 Product goals

1. Any participant with create-permission for an anchor can place a whiteboard on it from `AnchorPanel`. The whiteboard occupies the anchor like any other `WallObject`.
2. Once placed, every participant who has access to the room can **see** the whiteboard updating in near-real time, in both 3D and 2D views.
3. Participants with **write** access can draw, erase, write text, and use basic shape tools. Read-only participants only observe.
4. Strokes appear locally with no perceptible latency (optimistic render) and are confirmed across all clients within ~150 ms on a healthy network.
5. The whiteboard survives page refresh, late-join, and brief disconnect. A new joiner sees the current board state.
6. The whiteboard can be **exported as a PNG** (downloadable from the wall object card), enabling artifact capture into lesson recap, AI meeting notes, or external workflows.
7. The whiteboard can be **cleared** by any user with manage-permission; that action is realtime and audited.

### 1.2 Non-goals (Phase 1)

- Persistent multi-page whiteboards. v1 is a single canvas per `WallObject`.
- Vector export (SVG/PDF). v1 exports PNG only.
- Diagram primitives (sticky-note rearrangement, connector lines, flowchart shapes). v1 ships ink, eraser, basic shapes (rectangle, ellipse, line, arrow), and text.
- Embedded media inside the whiteboard (pasted images, video, GIFs).
- Voice / video annotation overlays on the whiteboard.
- Per-stroke author chips ("Drawn by …" overlays). The board is collaboratively authored without attribution UI in v1 (author metadata is persisted, just not surfaced).
- Server-side rasterization for previewing. Thumbnails are generated client-side at export time.
- Math/LaTeX rendering or handwriting → equation conversion.
- Generative AI sketch assist (Phase 2+ candidate; deliberately not in v1).

---

## 2. UX surface

### 2.1 Creating a whiteboard

`AnchorPanel` gains a new **Whiteboard** option in its create-form list (`FORM_TYPES`) alongside File, Note, Timer, Poll, Link. The new option appears only when:

- The selected anchor's `metadata.accepts` array includes `"whiteboard"` (existing per-anchor allowlist mechanism in `room-engine`).
- The acting participant has create-permission for the anchor (room policy + classroom board-access grants apply as for other wall objects).
- The active session room type has `whiteboards: true` in `RoomTypeFeatureFlags`.

Clicking **Whiteboard** opens a small create form with a single field: **Title** (default "Whiteboard"). Submitting creates an active wall object with `type: "whiteboard"`, `source.kind: "inline"`, and an empty stroke state.

### 2.2 Drawing on the whiteboard

When the whiteboard wall object is rendered on a board surface (3D `WallObjectSurface` and 2D parity), it shows a full-bleed canvas plus a thin **toolbar** anchored to the top edge:

| Tool | Icon | Behavior |
|---|---|---|
| Select | ▢ | Click to select a stroke; Backspace removes; drag bounding box to reposition. |
| Pen | ✏ | Freehand ink; selectable thickness (1, 2, 4, 8 px logical). |
| Highlighter | █ | Semi-transparent ink at 50% alpha; thicker default. |
| Eraser | ◌ | Stroke-level eraser (removes any stroke it touches). |
| Line | / | Click-drag straight line. |
| Rectangle | ▭ | Click-drag rectangle (Shift = square). |
| Ellipse | ○ | Click-drag ellipse (Shift = circle). |
| Arrow | → | Click-drag arrow. |
| Text | T | Click to place a text caret; type to add text. |
| Color | ● | Color picker with 8 preset colors + custom hex. |
| Undo | ↶ | Reverts the **local user's** most recent stroke (per-user history). |
| Redo | ↷ | Re-applies the most recently undone local stroke. |
| Clear | 🗑 | Clears all strokes. Available only to manage-permission users. Confirmation modal. |
| Export | ⤓ | Downloads current canvas as PNG. |

Touch and pen-tablet input use the same gestures. Pointer events are coalesced (Web `getCoalescedEvents()`) to recover full sample resolution for stylus and trackpad input.

Toolbar state (current tool, color, thickness) is **per-participant local state**; it is never broadcast. Only the resulting strokes are shared.

### 2.3 Realtime feedback

Other participants see:

- **Live cursor pucks** while a peer is drawing — a small colored dot with the peer's display name above the dot, broadcast on the unreliable channel at ≤ 20 Hz. The puck fades after 1.5 s of pointer inactivity. Configurable in `RoomSettings.whiteboards.showRemoteCursors`.
- **In-progress stroke preview** — the same stroke deltas drive a translucent in-progress polyline rendered on remote clients until the stroke is finalized.
- **Final committed stroke** — replaces the in-progress preview when the local pointer-up event commits the stroke (sent on the reliable channel).

The 2D view renders the same whiteboard inside the anchor rectangle at scale, with input enabled identically.

### 2.4 States

| State | UI |
|---|---|
| `creating` | Spinner inside the form while POST is in flight. |
| `active` | Toolbar + canvas, full interaction. |
| `read-only` | Toolbar visible but tool buttons disabled with tooltip "Read-only — no draw permission." Export still available. |
| `cleared` (transient) | After Clear, a brief "Cleared by …" toast on remote clients. |
| `loading-late-join` | New joiner sees a brief "Loading whiteboard…" placeholder while initial state hydrates. |
| `error` | Inline error with retry button if the stroke stream loses connectivity. |

### 2.5 Where the surface mounts

Whiteboards inherit the same world-space sizing as any wall object on its anchor. The canvas resolution is derived from the anchor's world-meter dimensions and the device-pixel-ratio-aware resolution scale already used by `wallObjectSurfacePixelSize()`.

In 3D, the whiteboard ignores camera billboarding (it stays flat on the wall like other surfaces). In 2D, it renders inside the anchor's projected rectangle.

---

## 3. Architecture

### 3.1 Data model — strokes, not pixels

A whiteboard is a **list of vector strokes**, not a raster image. This is the only viable approach for collaborative editing:

- Strokes are small enough to broadcast incrementally.
- Each stroke has a stable id, so erase / undo / select can target it precisely.
- The board is resolution-independent — re-rendered crisply at any DPR.
- Snapshots and exports are produced by replaying strokes to a canvas at export time.

**Stroke shape (Phase 1):**

```ts
type WhiteboardStroke = {
  id: string;                       // ULID
  authorUserId: string;
  tool: "pen" | "highlighter" | "eraser" | "line" | "rectangle" | "ellipse" | "arrow" | "text";
  color: string;                    // CSS hex, validated #RRGGBB or #RRGGBBAA
  thickness: number;                // logical px at 1× DPR
  // For freehand-ish tools (pen, highlighter, eraser): polyline points.
  // For shape tools (line, rect, ellipse, arrow): exactly two points = bbox corners.
  // For text: exactly one point = baseline-left anchor; payload carries the text + font size.
  points: Array<{ x: number; y: number; pressure?: number }>; // x,y normalized 0..1 to anchor dimensions
  text?: { value: string; fontSize: number };                  // text tool only
  createdAt: string;                // ISO 8601
  z: number;                        // monotonic stack order (server-stamped)
};
```

Points are stored as **normalized coordinates (0..1)** of the anchor's surface so the board adapts to anchor resizes (Free-for-All dynamic anchors, future resize tooling) without re-projecting every stroke.

### 3.2 Persistence — split metadata vs. blob

Whiteboards may accumulate thousands of strokes over a long session, so we split storage the same way `WallObject` and `WallAttachment` split today.

| Layer | What | Where |
|---|---|---|
| Wall object record | Title, anchor, status, version, permissions, creation metadata | `WallObject` (existing collection); `source.kind: "inline"`. The `state` field caches `{ strokeCount, lastUpdatedAt, snapshotKey }` (no raw strokes). |
| Stroke ledger (recent) | The N most recent strokes, indexed | `WhiteboardStroke` (new collection) — `{ id, wallObjectId, roomId, authorUserId, tool, color, thickness, points, text?, z, createdAt }`. Strokes have stable ids and are individually addressable for erase. |
| Stroke snapshot (compacted blob) | Periodic compacted stroke set as a single JSON blob | R2 under `whiteboards/<roomId>/<objectId>/snapshot-<z>.json.gz` (gzipped). |

**Hydration on join / refresh:**

1. Read snapshot (`GET signed-url` and decompress) to get strokes up to snapshot `z`.
2. Read post-snapshot strokes from `WhiteboardStroke` collection by `wallObjectId + z > snapshotZ`.
3. Merge by `z` ascending; render canvas.

**Snapshot compaction:** A background worker (or end-of-session hook) compacts strokes when the post-snapshot ledger crosses a threshold (default 500 strokes or 5 MB). The compaction concatenates strokes into a fresh snapshot blob, updates `WallObject.state.snapshotKey` + `snapshotZ`, and prunes pre-snapshot rows. Compaction is idempotent and never destructive — the old snapshot stays in R2 for 24 h as a safety net.

**Why not store every stroke inside `WallObject.state`:** Document size limits (Mongo 16 MB), state-blob version churn, slow read-modify-write for high-frequency updates. The split keeps `WallObject` lightweight and the stroke stream append-only.

### 3.3 Realtime — two channels, three message types

We reuse the existing LiveKit data-channel split.

**Unreliable channel** (high frequency, lossy ok):

- `room.whiteboard.stroke-delta.v1` — `{ wallObjectId, strokeId, authorUserId, tool, color, thickness, deltaPoints[], isFinal: false }` — partial stroke as the local pointer moves. Delta points are appended to the current in-progress stroke buffer on remote clients.
- `room.whiteboard.cursor.v1` — `{ wallObjectId, authorUserId, x, y, visible }` — remote cursor puck. Rate-limited to ≤ 20 Hz client-side.

**Reliable channel** (state of record):

- `room.whiteboard.stroke-commit.v1` — `{ wallObjectId, stroke }` — the finalized stroke (full point list). On receipt, clients replace any in-progress preview keyed by `strokeId`.
- `room.whiteboard.stroke-erase.v1` — `{ wallObjectId, strokeIds[], erasedByUserId }` — eraser tool committed a removal. (Different from the user-local Undo, which only removes the local user's last stroke and uses the same erase message under the hood.)
- `room.whiteboard.cleared.v1` — `{ wallObjectId, clearedByUserId, clearedAt }` — Clear All.
- `room.whiteboard.snapshot-ready.v1` — `{ wallObjectId, snapshotKey, snapshotZ }` — compaction worker fired.

Both channels are scoped to the active room; the message dispatcher rejects messages whose `wallObjectId.roomId !== room.id`.

### 3.4 Conflict model

The board is **append-only** — strokes are never edited after commit. The only destructive operation is **erase**, which removes whole strokes by id. Because each stroke has a unique id and a server-stamped `z` order, two simultaneous strokes by two users are simply both kept and rendered in `z` order. There is no merge conflict.

Erasing is similarly conflict-free: erasing the same stroke twice is idempotent (the second call no-ops). Undo is implemented as "erase the local user's most recent stroke id", which means undo is per-user and never collides.

Clear-all takes a global lock via a small `WhiteboardClearVersion` counter on the wall object so a stroke racing with a clear is dropped if its `z` predates the clear's `clearVersion`.

### 3.5 Data flow

```
  ┌──────────────────────────────┐
  │  Local user drawing          │
  │  (canvas + pointer events)   │
  └────────┬─────────────────────┘
           │ stroke-delta.v1 (unreliable, ~20 Hz)
           ▼
  ┌──────────────────────────────┐
  │  LiveKit data channel        │  →  Remote clients render in-progress preview
  └────────┬─────────────────────┘
           │
           │ on pointer-up:
           │   POST /v1/rooms/:roomId/wall-objects/:objectId/whiteboard/strokes
           ▼
  ┌──────────────────────────────┐
  │  API: orchestrator           │
  │   - validates stroke         │
  │   - stamps z, createdAt      │
  │   - persists stroke          │
  │   - publishes commit message │
  └────────┬─────────────────────┘
           │ stroke-commit.v1 (reliable)
           ▼
  ┌──────────────────────────────┐
  │  All clients commit stroke    │
  │  and drop in-progress preview │
  └──────────────────────────────┘
```

### 3.6 Export

Client-side export draws every stroke onto an `OffscreenCanvas` at the anchor's intrinsic resolution × the requested export multiplier (default 2× DPR, max 4×) and downloads the PNG. Export does not hit the server.

A second export form (`?include=metadata`) writes a small JSON sidecar with stroke count, author count, and created-at range, useful for archiving alongside an AI Meeting Notes summary.

---

## 4. Data and API model

### 4.1 Room-type feature flag

Extend `RoomTypeFeatureFlags` (in `packages/contracts/src/index.ts`):

```ts
whiteboards: boolean;
```

Default `true` in classroom, workforce-training, and free-for-all. Future room types opt in explicitly.

### 4.2 Room settings

Add `whiteboards` to `RoomSettingsSchema`:

```ts
whiteboards: z.object({
  enabled: z.boolean().default(true),
  maxActivePerRoom: z.number().int().min(0).max(16).default(4),
  maxStrokesPerBoard: z.number().int().min(100).max(50000).default(10000),
  maxPointsPerStroke: z.number().int().min(50).max(5000).default(2000),
  showRemoteCursors: z.boolean().default(true),
  cursorBroadcastHz: z.number().int().min(5).max(30).default(20),
  allowStudentDraw: z.boolean().default(true),   // classroom default; students still need anchor access
  snapshotEvery: z.number().int().min(50).max(2000).default(500),
}).default({
  enabled: true,
  maxActivePerRoom: 4,
  maxStrokesPerBoard: 10000,
  maxPointsPerStroke: 2000,
  showRemoteCursors: true,
  cursorBroadcastHz: 20,
  allowStudentDraw: true,
  snapshotEvery: 500,
}),
```

### 4.3 New entities

#### `WhiteboardStroke`

```ts
{
  id: string;                        // ULID, stable across clients
  wallObjectId: string;
  roomId: string;
  authorUserId: string;
  tool: "pen" | "highlighter" | "eraser" | "line" | "rectangle" | "ellipse" | "arrow" | "text";
  color: string;
  thickness: number;
  points: Array<{ x: number; y: number; pressure?: number }>;
  text?: { value: string; fontSize: number };
  z: number;                         // monotonic per-board order; server-stamped
  clearVersion: number;              // matches WallObject.state.clearVersion at insert time
  createdAt: string;                 // ISO 8601
}
```

Indexes: `{ wallObjectId: 1, z: 1 }`, `{ wallObjectId: 1, authorUserId: 1, createdAt: -1 }`.

#### `WhiteboardSnapshot` (lightweight pointer; blob in R2)

```ts
{
  wallObjectId: string;
  snapshotZ: number;     // strokes with z <= snapshotZ are baked into the snapshot blob
  storageKey: string;    // R2 key
  byteSize: number;
  createdAt: string;
}
```

`WallObject.state` for a whiteboard caches:

```ts
{
  strokeCount: number;
  lastUpdatedAt: string;
  snapshotKey?: string;
  snapshotZ?: number;
  clearVersion: number;   // increments on Clear All
}
```

### 4.4 REST endpoints

All endpoints scope to room + wall object; the caller must be a current participant of the room and pass the existing wall-object permission check.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/rooms/:roomId/wall-objects` (existing) | Create a whiteboard by passing `type: "whiteboard"`, `source: { kind: "inline", data: {} }`. |
| `GET` | `/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/strokes` | List committed strokes. Query: `sinceZ` (incremental hydration). Returns the snapshot URL + post-snapshot strokes. |
| `POST` | `/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/strokes` | Commit one finalized stroke. Body = `WhiteboardStroke` minus `z`/`createdAt`/`clearVersion`. Returns the stamped stroke + the realtime-message envelope (clients then publish on the LiveKit data channel; mirrors `dynamic-wall-anchors` pattern). |
| `DELETE` | `/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/strokes` | Erase strokes by id list. Body `{ strokeIds: string[] }`. Eraser-tool and Undo route here. |
| `POST` | `/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/clear` | Clear all strokes. Manage-permission only. Increments `clearVersion`. |
| `POST` | `/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/snapshots` | Manually request compaction. Idempotent. Background job also calls this internally. |
| `GET` | `/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/export.png` | Optional server-side raster export (Phase 2). Phase 1 export is client-side only. |

### 4.5 Realtime events

Unreliable channel:

- `room.whiteboard.stroke-delta.v1`
- `room.whiteboard.cursor.v1`

Reliable channel:

- `room.whiteboard.stroke-commit.v1`
- `room.whiteboard.stroke-erase.v1`
- `room.whiteboard.cleared.v1`
- `room.whiteboard.snapshot-ready.v1`

All clients subscribe in the same dispatch path the existing `wall.object.*.v1` messages use, after the room-type feature-flag check.

---

## 5. Environment variables

Added in this feature (root `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` as appropriate):

```
# --- Whiteboard surface ---
ENABLE_WHITEBOARDS=true
NEXT_PUBLIC_ENABLE_WHITEBOARDS=true

# Server-side compaction worker tick (seconds). 0 disables background compaction.
WHITEBOARD_COMPACTION_TICK_SECONDS=30

# Server-side compaction threshold (strokes since last snapshot).
WHITEBOARD_SNAPSHOT_AT_STROKES=500

# Soft upper bound on points per stroke. Hard rejection above 2x.
WHITEBOARD_MAX_POINTS_PER_STROKE=2000

# Per-room hard cap on active whiteboard wall objects.
WHITEBOARD_MAX_ACTIVE_PER_ROOM=4

# Storage prefix for stroke snapshot blobs.
WHITEBOARD_STORAGE_PREFIX=whiteboards/
```

Strict env validation in production: when `ENABLE_WHITEBOARDS=true`, R2 (`OBJECT_STORAGE_*`) is required. LiveKit is already required by the core stack.

---

## 6. Phased implementation

### Phase 1 — Contracts + feature flags

- Add `whiteboards` to `RoomTypeFeatureFlags`; default `true` for classroom / workforce-training / free-for-all.
- Add `RoomSettings.whiteboards` defaults.
- Add `WhiteboardStrokeSchema`, `WhiteboardSnapshotSchema`, `WhiteboardWallObjectStateSchema`.
- Add request/response schemas for the new REST endpoints.
- Add realtime message schemas (six new union entries).
- Regenerate OpenAPI.

### Phase 2 — API persistence (no realtime yet)

- Mongoose + in-memory repository implementations for `WhiteboardStroke` and `WhiteboardSnapshot`.
- New API routes from § 4.4 except the realtime publish step (return empty `realtimeMessages`).
- Enforce per-room caps, point caps, color/tool validation.
- Erase-by-id and Clear-All semantics.
- Unit tests in `apps/api/tests/api.test.ts`: stroke commit, erase, clear, hydration with snapshot, point-cap rejection, non-whiteboard-type rejection.

### Phase 3 — Realtime wiring

- Add `WhiteboardRealtimeMessage` union to `apps/web/lib/realtime.ts`; mark stroke-delta / cursor as unreliable.
- API: each REST mutation returns the appropriate realtime message envelope (mirrors `dynamic-wall-anchors`).
- Web: dispatcher in `RoomClient` routes the new messages before the existing wall-object handlers.
- Add server-side `clearVersion` race protection: strokes whose body carries a stale `clearVersion` are rejected with 409.

### Phase 4 — Canvas component + tools

- New `apps/web/components/Whiteboard/` module: `WhiteboardSurface.tsx`, `WhiteboardToolbar.tsx`, `WhiteboardCursorLayer.tsx`, `useWhiteboardState.ts`.
- Rendering: layered `<canvas>` (committed strokes baked) + overlay `<canvas>` (in-progress + remote previews) + DOM toolbar.
- Pointer pipeline with coalesced events, pressure when available, normalized coordinates.
- Tools: pen, highlighter, eraser, line, rectangle, ellipse, arrow, text, select.
- Local undo/redo stack keyed on `(userId, strokeId)`.
- Color picker (8 presets + custom hex).
- Optimistic rendering: local stroke commits to canvas before server roundtrip; reconciliation on commit message.

### Phase 5 — Wall-object integration + 2D parity

- Extend `AnchorPanel`'s `FORM_TYPES` to include `whiteboard`.
- Extend `WallObjectCard` to dispatch to the new whiteboard renderer when `object.type === "whiteboard"`.
- Add a 3D `WallObjectSurface` branch that mounts `<WhiteboardSurface mode="3d" />`.
- 2D analog renderer in `RoomView2D` mounts `<WhiteboardSurface mode="2d" />` inside the projected anchor rectangle.
- Hide remote cursor pucks in 2D below a configurable scale to avoid clutter.

### Phase 6 — Compaction, export, polish

- Background compaction worker: idle ticker reads `strokeCount` deltas and compacts when threshold exceeded.
- Client-side PNG export with optional 2×/4× multiplier and optional metadata sidecar.
- Cursor puck name fading + remote-cursor accessibility (`aria-live: polite` announce for screen readers when a peer starts drawing — opt-in via `RoomSettings`).
- "Cleared by …" toast.
- Long-press / right-click on a stroke → "Erase stroke" quick action in Select tool.
- 30 s reconnect resync: on data-channel reconnect, replay from `state.clearVersion + state.snapshotZ`.

### Phase 7 — Env templates, validation, rollout

- Env templates updated with the keys in § 5.
- Playwright e2e (`apps/web/test/whiteboard.spec.ts`): two-tab classroom, teacher draws, student sees strokes within 500 ms, student draws, teacher sees strokes, teacher clears, both views go blank.
- Status doc updates (`docs/planning/mvp/MVP_STATUS.md` "Post-MVP" section, new feature row).
- Staging rollout behind `ENABLE_WHITEBOARDS`.

---

## 7. Permissions and moderation

Whiteboards inherit the existing wall-object permission model:

| Action | Required permission |
|---|---|
| Place whiteboard on anchor | Existing anchor-create permission for the room type (classroom teacher, workforce instructor, FFA participant). Classroom board-access grants must allow `"whiteboard"` for students. |
| Draw on whiteboard | `state.allowStudentDraw` (room setting) + actor must be a current room participant + (in classroom) student must have an active board-access grant on the anchor OR `state.allowStudentDraw` opens it room-wide. |
| Erase someone else's stroke | Manage-permission on the wall object. Students can always undo their own latest stroke via Undo. |
| Clear all strokes | Manage-permission only. |
| Delete whiteboard wall object | Same as any other wall object (creator + manage roles). |

Classroom-specific addition: `WallObjectModerationPolicy.pre` is **invalid** for whiteboards (a whiteboard cannot be moderated before becoming active — there is no static content to moderate). The API rejects whiteboard creation with `moderation.policy === "pre"`. `"post"` and `"off"` are allowed.

---

## 8. Performance and scale

| Bound | Default | Why |
|---|---|---|
| Active whiteboards per room | 4 | Each whiteboard adds N% rendering cost + N data-channel traffic. 4 is well below LiveKit pub/sub limits and the existing `maxActiveWallObjects` ceiling. |
| Strokes per board | 10,000 | Compaction keeps the in-memory list bounded by `snapshotEvery`; 10k is a soft cap with a warning UI at 80%. |
| Points per stroke | 2,000 | Long ink strokes simplify on the client (Ramer-Douglas-Peucker, ε = 0.5 logical px) before commit. The server still allows 2× the cap as a hard wall before rejection. |
| Cursor broadcast rate | ≤ 20 Hz | Bound on remote-cursor traffic. Configurable per room. |
| Stroke-delta broadcast rate | Pointer-event coalesced | The browser already throttles pointermove events; we batch deltas at requestAnimationFrame boundaries. |
| Snapshot size | < 10 MB gz | At 10,000 strokes × ~300 bytes each gzipped ≈ 3 MB. Well within R2 + browser fetch budget. |

Stroke simplification (Phase 4): every stroke is simplified on the client before commit. Render path uses the raw (unsimplified) buffer for the local in-progress preview to avoid jitter, then commits the simplified form.

---

## 9. Failure modes and mitigations

| Failure | Mitigation |
|---|---|
| LiveKit data channel drops mid-stroke | Local canvas keeps rendering; in-flight POST still goes via HTTPS. On reconnect, late `stroke-commit.v1` messages replace the optimistic local stroke. |
| Two participants Clear All at the same time | Each call increments `clearVersion` once; both succeed; second clear is effectively a no-op because the post-first-clear stroke set is empty. |
| Stroke commit POST fails after the unreliable delta was already broadcast | Remote clients see an in-progress preview that never commits. Remote clients drop unresolved in-progress strokes after a 5 s no-commit timeout. The author sees a "Stroke failed — retry" inline error and the local optimistic stroke is rolled back. |
| Snapshot compaction fails | Strokes remain in the ledger; next compaction attempt will retry. The board still hydrates correctly (snapshot + post-snapshot ledger). |
| Player joins mid-session with weak connection | Initial hydration: fetch snapshot blob via signed URL with retry/backoff (existing `WallAttachment` pattern). Display a placeholder until either the snapshot or the post-snapshot stroke list arrives. |
| Eraser races with a new stroke | Stroke commits with the `clearVersion` it captured at pointer-down; if a Clear happened in between, the server rejects with 409 and the client discards the local stroke with an "Cleared while drawing" toast. |
| Whiteboard wall object is deleted while a user is drawing | The active draw session detects the soft-removal via `wall.object.remove.v1` and disables further input with a toast. |

---

## 10. Technical decisions

| Decision | Choice | Rationale |
|---|---|---|
| Vector vs raster | Vector strokes only in v1 | Lossless collab; small payloads; easy erase/undo; resolution-independent rendering. |
| Stroke storage | Dedicated `WhiteboardStroke` collection + R2 snapshot blob | Keeps `WallObject` records small; supports incremental hydration and append-only writes. |
| Stroke id authority | Client-generated ULID, server-stamped `z` | Stable id for optimistic rendering; server controls global ordering. |
| In-progress preview transport | Unreliable channel only | Best-effort low-latency preview; final correctness comes from the reliable commit. |
| Final stroke transport | Reliable channel via REST roundtrip → server publish | Avoids dropped commits; pairs with persistence atomically. |
| Permissions | Reuse `WallObject` + `ClassroomBoardAccessGrant` model | No new permission surface to teach. |
| Pre-moderation | Disallowed for whiteboards | A blank board has nothing to pre-moderate; post-moderation suffices via Clear and Erase tools. |
| Export format | PNG client-side in v1 | Zero new server-side dependencies; SVG/PDF deferred to Phase 2. |
| Touch / stylus input | Pointer Events API + `getCoalescedEvents()` | Universal across Chrome/Safari/Firefox/Edge on iPad and Surface. |
| Coordinate system | Normalized 0..1 of anchor surface | Supports anchor resize (Free-for-All) without re-projecting strokes. |
| Conflict model | Append-only strokes + idempotent erase + `clearVersion` | Lock-free, ordering well-defined, no merge code. |
| Cross-room-type availability | All current room types | Whiteboard is platform infrastructure, not a room-type-specific feature like AI Meeting Notes. |

---

## 11. Open questions

1. Should classroom default `allowStudentDraw` to `false` (teacher-only by default) or `true` (open by default)? Plan defaults `true`; per-room toggle lives in `RoomSettings.whiteboards.allowStudentDraw`.
2. Do we ship a basic shape **fill** (filled rectangle / ellipse), or stroke-only in v1? Plan ships stroke-only; fill deferred.
3. Should we expose a one-click background grid / lined / dotted background? Plan defers; v1 ships plain white background tinted by room theme.
4. Do we add an explicit author legend (e.g. hover a stroke → "Drawn by Jane at 10:14")? Plan stores author per stroke but doesn't surface UI in v1.
5. Should we add a basic AI helper (e.g. "tidy up handwriting" → smoothed strokes; "convert sketch → shape"). Frame markets AI features broadly; this would be a parity bonus. Deferred to Phase 2+ to keep v1 deterministic.
6. Whiteboard inside live-pinned camera or screen share — out of scope? Plan keeps whiteboards as their own wall-object type; mixed surfaces are not supported.
7. Limit on number of *active drawers* per board concurrently (e.g. ≤ 8 simultaneous), or unlimited? Plan defaults unlimited; revisit if scale testing surfaces traffic issues.
8. Mobile touch palm rejection — accept Phase 1 native browser behavior, or implement two-finger pan vs. single-finger draw distinction? Plan accepts native behavior in v1; revisit during e2e.
9. Late-join hydration: prefer snapshot-first then deltas (proposed), or pure stroke replay with server LRU cache? Plan goes snapshot-first; reconsider only if first-paint metrics regress.
10. Should Clear All be undoable for a short grace window (5 s)? Plan does not include this; might be worth a quick add to reduce destructive-action risk.

---

## 12. Relationship to existing planning

```
Platform-wide collaboration surfaces
├── Wall attachments / WallObject (existing)
│      ├── image/video/audio file
│      ├── camera/microphone/screen live
│      ├── web link / embed
│      ├── document/slides
│      ├── note / poll / timer
│      └── whiteboard (this plan)
└── Room manipulatives / RoomObject (existing)
```

This plan is fully additive: it does not change any existing wall-object behavior, does not regress classroom/workforce-training/free-for-all flows, and lives behind its own room-type feature flag plus env flag for staged rollout. A paired `IMPL_WHITEBOARD_SURFACE.md` accompanies this plan and maps each phase above to concrete files on the current main branch.
