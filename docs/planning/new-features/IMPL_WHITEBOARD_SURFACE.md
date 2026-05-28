# Implementation — Whiteboard Surface

Source plan: [`PLAN_WHITEBOARD_SURFACE.md`](./PLAN_WHITEBOARD_SURFACE.md)
Parity source: [`FRAME_FEATURE_PARITY_GAP_ANALYSIS.md`](../rooms/free-for-all/FRAME_FEATURE_PARITY_GAP_ANALYSIS.md) (High-Impact / Near-Term parity item #1)
Branch: `whiteboards` (additive feature; lands after Free-for-All Phase 1)
Last updated: 2026-05-28

---

## Status / Scope

**Status:** Not started. Planning only.

This doc implements the Whiteboard Surface described in the PLAN. It is **additive across all current room types** — classroom, workforce-training, and free-for-all. It is not gated on Free-for-All, but it does inherit and respect classroom board-access grants and student-permission policy where present.

**What ships:**

1. **`type: "whiteboard"` wall objects** are placeable from `AnchorPanel` on any anchor whose `metadata.accepts` allows whiteboards.
2. **Stroke ledger** in MongoDB (`WhiteboardStroke`) plus periodic **snapshot blobs** in R2.
3. **Realtime stroke stream** — `room.whiteboard.stroke-delta.v1` (unreliable previews) + `room.whiteboard.stroke-commit.v1` / `stroke-erase.v1` / `cleared.v1` / `snapshot-ready.v1` (reliable).
4. **Live remote cursor pucks** — `room.whiteboard.cursor.v1` (unreliable).
5. **Canvas component** with pen, highlighter, eraser, select, shape tools (line, rectangle, ellipse, arrow), text, color picker, per-user undo/redo, clear-all, and PNG export.
6. **3D and 2D parity** rendering via the existing `WallObjectSurface` extension point.
7. **Feature flag** `ENABLE_WHITEBOARDS` / `NEXT_PUBLIC_ENABLE_WHITEBOARDS` (default `true` after rollout; gated `false` during initial staging).

**Out of scope (Phase 1):**

- Multi-page whiteboards / page navigation.
- SVG / PDF export (PNG only).
- Generative AI helpers (sketch → shape, handwriting → equation).
- Embedded media inside the canvas.
- Per-stroke author UI ("Drawn by …" chips).
- Server-side rasterized export endpoint.
- Backfilling whiteboards into older sessions or auto-creating one per anchor.

---

## Codebase context (pre-implementation state)

Line numbers are accurate as of `main` HEAD on 2026-05-28.

| File | What matters |
|---|---|
| `packages/contracts/src/index.ts` | `WallObjectTypeSchema` at line 13 already includes `"whiteboard"`. `RoomTypeFeatureFlags` at line 815 — add `whiteboards: boolean`. `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` at line 833, `CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` at line 851, `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS` at line 869 — set `whiteboards` per room type (all three to `true` for Phase 1). `RoomSettingsSchema` at line 901 — add `whiteboards` settings block (matches `aiMeetingNotes` shape at line 952). `WallObjectSourceSchema` at line 1213 already supports the `"inline"` kind needed. `WallObjectSchema` at line 1247 — no change. `WallObjectControlRequestSchema` at line 1297 — no change (whiteboard ops do not use the existing control endpoint). Add `WhiteboardStrokeSchema`, `WhiteboardSnapshotSchema`, request/response schemas, and six realtime message schemas near the existing `WallObjectRealtimeUpsertSchema` at line 1359. |
| `packages/contracts/openapi/openapi.json` | Regenerate after contract changes (`npm run openapi` from `packages/contracts`). |
| `packages/room-engine/src/index.ts` | `FULL_WALL_OBJECT_ACCEPTS` at line 96 already lists `"whiteboard"` (line 111). The two narrower accept-lists at lines 252 and 271 (main board / left-rail) do **not** yet include `"whiteboard"` — add it to both so a whiteboard can be placed on the primary board surface and the resource rails. |
| `packages/room-engine/src/wallAnchorPolicy.ts` | `WallAnchorCreateOption` at line 7 — extend with `"whiteboard"`. `anchorSupportsCreateOption()` at line 40 — add a `case "whiteboard":` mapping to `anchorAcceptsWallObjectType(anchor, "whiteboard")`. No other changes needed here. |
| `apps/api/src/config.ts` | `AppConfig.tuning` — add `enableWhiteboards`, `whiteboardCompactionTickSeconds`, `whiteboardSnapshotAtStrokes`, `whiteboardMaxPointsPerStroke`, `whiteboardMaxActivePerRoom`, `whiteboardStoragePrefix`. `requiredInProduction()` — when `enableWhiteboards=true`, require `OBJECT_STORAGE_*`. |
| `apps/api/src/app.ts` | Existing whiteboard validation gate already lives at line 719 (`if (["note", "poll", "timer", "whiteboard"].includes(input.type))`) — no behavior change needed there. **New route block** mounts after the existing wall-object routes (POST at line 3372, control at line 3937) — see Phase 2 below. Add new `/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/*` endpoints. |
| `apps/api/src/repository.ts` | `Repository` interface — add stroke CRUD methods (`appendWhiteboardStroke`, `eraseWhiteboardStrokes`, `clearWhiteboard`, `listWhiteboardStrokes`, `upsertWhiteboardSnapshot`, `latestWhiteboardSnapshot`). Memory impl alongside Mongoose impl. |
| `apps/api/src/models/mongoose.ts` | New collections: `WhiteboardStroke`, `WhiteboardSnapshot`. Indexes from PLAN § 4.3. |
| `apps/api/src/whiteboards/` | **New module**: `orchestrator.ts` (commit/erase/clear with optimistic version checks), `compaction-worker.ts` (background snapshot writer), `validation.ts` (color/tool/point-cap rules), `prompts.ts` (none needed; placeholder for any future AI helper). |
| `apps/web/lib/config.ts` | `CLIENT_TUNING` at line 7 — add `enableWhiteboards: process.env.NEXT_PUBLIC_ENABLE_WHITEBOARDS !== "false"` (default-on once env templates ship). |
| `apps/web/lib/realtime.ts` | `WallRealtimeMessage` union at line 43 — extend with `WhiteboardRealtimeMessage`. Add `WhiteboardRealtimeMessage` type alias next to `BoardRealtimeMessage` (line 54) and `MeetingNotesRealtimeMessage` (line 59). Add the new union to the `RealtimeMessage` aggregate at line 66. `ROOM_OBJECT_UNRELIABLE_TYPES` at line 81 — add `"room.whiteboard.stroke-delta.v1"` and `"room.whiteboard.cursor.v1"`. |
| `apps/web/lib/api.ts` | Add wrappers: `listWhiteboardStrokes`, `commitWhiteboardStroke`, `eraseWhiteboardStrokes`, `clearWhiteboard`, `requestWhiteboardSnapshot`. Reuse the signed-URL fetch pattern already used by wall attachments. |
| `apps/web/lib/useWhiteboard.ts` | **New hook** — modeled after `useDynamicWallAnchors.ts` and `useWallObjects.ts`. Hydrates strokes (snapshot + ledger), subscribes to realtime, exposes `commitStroke()`, `eraseStrokes()`, `clear()`, and an `optimisticStrokes` buffer for in-progress preview. |
| `apps/web/components/Whiteboard/` | **New module**: `WhiteboardSurface.tsx` (canvas + overlay), `WhiteboardToolbar.tsx`, `WhiteboardCursorLayer.tsx`, `WhiteboardColorPicker.tsx`, `useWhiteboardCanvas.ts`, `useWhiteboardPointer.ts`, `strokeRenderer.ts` (pure stroke-to-canvas drawing). |
| `apps/web/components/AnchorPanel.tsx` | `FORM_TYPES` array at line 18 — add `{ id: "whiteboard", label: "Whiteboard" }`. `optionAllowedByGrant` at line 145 — add `option === "whiteboard"` branch checking the grant's `allowedObjectTypes`. `availableFormTypes` at line 161 — already iterates `FORM_TYPES`, no shape change needed once `WallAnchorCreateOption` includes `"whiteboard"`. |
| `apps/web/components/WallObjectCard.tsx` | Sidebar card body branching — add a `whiteboard` branch that renders a small thumbnail (`<canvas>` replay) + the **Open whiteboard** button + manage actions (Clear, Export PNG). |
| `apps/web/components/RoomView3D.tsx` | `WallObjectSurface` at line 706 — add a `type === "whiteboard"` branch that mounts `<WhiteboardSurface mode="3d" />`. The existing sizing via `wallObjectSurfacePixelSize` (line 757) carries over. |
| `apps/web/components/RoomView2D.tsx` | Equivalent surface branch — mount `<WhiteboardSurface mode="2d" />` inside the projected anchor rectangle, smaller toolbar density. |
| `apps/web/components/RoomClient.tsx` | Realtime dispatcher — wire `WhiteboardRealtimeMessage` ahead of the existing wall-object handlers. Mount `useWhiteboard(roomId, wallObjects)` alongside `useWallObjects`. |
| `apps/web/app/globals.css` | New `.whiteboard-*` styles. Reuse the `.wall-object-surface-mount` sizing tokens (`--wall-surface-font-size` etc.) so toolbar icon size scales with anchor surface. |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` — add whiteboard vars from PLAN § 5. |

---

## Plan adjustments

Clarifications derived from the codebase walkthrough, on top of the PLAN doc:

**A. Reuse `WallObject` lifecycle 1:1.** The `WallObjectTypeSchema` enum at line 13 already includes `"whiteboard"`, and `apps/api/src/app.ts:719` already routes whiteboard creates through the inline-source validator. We add no new wall-object lifecycle code — only the **stroke stream** sitting beside the wall object.

**B. `WallObject.state` stores only an aggregate.** The big stroke list is NOT inside the wall-object record. We keep `WallObject.state` light with `{ strokeCount, lastUpdatedAt, snapshotKey?, snapshotZ?, clearVersion }`. This avoids 16 MB document blowups and keeps wall-object refresh cheap.

**C. Realtime: extend `WallRealtimeMessage`, not a new top-level union.** Whiteboard messages are conceptually wall-object messages. Putting them under `WallRealtimeMessage` keeps the `RoomClient` dispatcher clean — there's already a single switch on `message.type` for wall events.

**D. Mark stroke-delta and cursor unreliable via existing helper.** Add to the `ROOM_OBJECT_UNRELIABLE_TYPES` set in `apps/web/lib/realtime.ts:81` (despite the name, it now mixes room-object + meeting-notes; we follow that pattern rather than introducing a new set).

**E. Stroke ids are client-generated ULIDs.** Author-stamped before unreliable broadcast so remote clients can correlate in-progress previews with the eventual commit. Server stamps `z` and `createdAt` on commit. We do not trust client `z`.

**F. Per-stroke `clearVersion` token.** When the client begins a stroke it captures `WallObject.state.clearVersion`. The commit POST carries that token; the server rejects the stroke with 409 if `clearVersion` has advanced. This is the only race in the design.

**G. Anchor-policy whiteboards default-on for primary boards.** Two existing accept-lists are narrower than `FULL_WALL_OBJECT_ACCEPTS` (`packages/room-engine/src/index.ts` lines 252 and 271). Add `"whiteboard"` to both so the default classroom theater's main board and left-rail accept whiteboards. Workforce-training and FFA already use `FULL_WALL_OBJECT_ACCEPTS` so they're already covered.

**H. Anchor-policy: `WallAnchorCreateOption` must learn the new option.** `apps/web/components/AnchorPanel.tsx` already builds its create button list from `WallAnchorCreateOption`. Adding `"whiteboard"` to the option union in `wallAnchorPolicy.ts` and routing it through `anchorSupportsCreateOption` is the smallest cross-cutting change.

**I. Pre-moderation rejected at validate time.** The existing `WallObjectModerationPolicySchema` allows `"pre"`. For whiteboards we reject `moderation.policy === "pre"` at create time (a blank board has no moderate-able content). Surfaced as `400 invalid_moderation_policy_for_whiteboard`.

**J. Local dev without LiveKit.** Existing BroadcastChannel fallback already covers data messages. Stroke deltas and commits flow over the same channel. No additional fallback work needed.

**K. Compaction worker lives in the API process, not a separate worker container.** Phase 1 piggybacks on an existing repeating timer (`apps/api/src/app.ts` has classroom-state cleaner patterns) running every `WHITEBOARD_COMPACTION_TICK_SECONDS` (default 30 s). If/when API workload grows, factor into `apps/api/src/workers/`.

**L. Export is fully client-side.** Render committed strokes to an `OffscreenCanvas` at 2×–4× DPR and download. Server-side raster endpoint is **out of Phase 1**.

**M. Cursor pucks render in 3D only by default.** 2D shows them only at zoom ≥ 1.0 to avoid clutter on the analog map.

**N. Filename format for exports.**

```
whiteboard-<roomName-slugified>-<anchorLabel-slugified>-<YYYYMMDD-HHmm>.png
```

Slugify: lowercase, spaces → hyphens, strip non-alphanumeric except hyphens, max 40 chars per segment.

---

## Phased implementation

### Phase 1 — Contracts + feature flags

Goal: schemas, feature flags, and realtime message types accept the new capability.

**File: `packages/contracts/src/index.ts`**

1. Extend `RoomTypeFeatureFlags` at line 815:

   ```ts
   whiteboards: boolean;
   ```

2. Set `whiteboards: true` in `CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` (line 851), `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS` (line 869), and (for workforce-training) the `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` default also at line 833 must remain `false`; explicitly opt in workforce-training by widening `getRoomTypeFeatureFlags()` at line 890 if needed. The cleanest approach is to add a `WORKFORCE_TRAINING_ROOM_TYPE_FEATURE_FLAGS` constant (mirroring the others) and switch on it in `getRoomTypeFeatureFlags()`; `whiteboards: true` there.

3. Add settings block to `RoomSettingsSchema` near `aiMeetingNotes` at line 952:

   ```ts
   whiteboards: z.object({
     enabled: z.boolean().default(true),
     maxActivePerRoom: z.number().int().min(0).max(16).default(4),
     maxStrokesPerBoard: z.number().int().min(100).max(50000).default(10000),
     maxPointsPerStroke: z.number().int().min(50).max(5000).default(2000),
     showRemoteCursors: z.boolean().default(true),
     cursorBroadcastHz: z.number().int().min(5).max(30).default(20),
     allowStudentDraw: z.boolean().default(true),
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

4. Add entity schemas (place near `WallObjectSchema` at line 1247):

   ```ts
   export const WhiteboardToolSchema = z.enum([
     "pen", "highlighter", "eraser",
     "line", "rectangle", "ellipse", "arrow",
     "text"
   ]);

   export const WhiteboardStrokeSchema = z.object({
     id: z.string().min(1),
     wallObjectId: z.string().min(1),
     roomId: z.string().min(1),
     authorUserId: z.string().min(1),
     tool: WhiteboardToolSchema,
     color: z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
     thickness: z.number().positive().max(64),
     points: z.array(z.object({
       x: z.number().min(0).max(1),
       y: z.number().min(0).max(1),
       pressure: z.number().min(0).max(1).optional()
     })).min(1),
     text: z.object({
       value: z.string().max(1024),
       fontSize: z.number().int().positive().max(256)
     }).optional(),
     z: z.number().int().nonnegative(),
     clearVersion: z.number().int().nonnegative(),
     createdAt: z.string().datetime()
   });

   export const WhiteboardSnapshotSchema = z.object({
     wallObjectId: z.string().min(1),
     snapshotZ: z.number().int().nonnegative(),
     storageKey: z.string().min(1),
     byteSize: z.number().int().nonnegative(),
     createdAt: z.string().datetime()
   });

   export const WhiteboardWallObjectStateSchema = z.object({
     strokeCount: z.number().int().nonnegative().default(0),
     lastUpdatedAt: z.string().datetime().optional(),
     snapshotKey: z.string().optional(),
     snapshotZ: z.number().int().nonnegative().optional(),
     clearVersion: z.number().int().nonnegative().default(0)
   });
   ```

5. Add request/response schemas:

   ```ts
   export const ListWhiteboardStrokesQuerySchema = z.object({
     sinceZ: z.coerce.number().int().nonnegative().optional()
   });

   export const ListWhiteboardStrokesResponseSchema = z.object({
     snapshot: WhiteboardSnapshotSchema.nullable(),
     snapshotDownloadUrl: z.string().url().nullable(),
     strokes: z.array(WhiteboardStrokeSchema).default([]),
     clearVersion: z.number().int().nonnegative(),
     strokeCount: z.number().int().nonnegative()
   });

   export const CommitWhiteboardStrokeRequestSchema = z.object({
     id: z.string().min(1),
     tool: WhiteboardToolSchema,
     color: z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
     thickness: z.number().positive().max(64),
     points: z.array(z.object({
       x: z.number().min(0).max(1),
       y: z.number().min(0).max(1),
       pressure: z.number().min(0).max(1).optional()
     })).min(1),
     text: z.object({
       value: z.string().max(1024),
       fontSize: z.number().int().positive().max(256)
     }).optional(),
     clearVersion: z.number().int().nonnegative()
   });

   export const CommitWhiteboardStrokeResponseSchema = z.object({
     stroke: WhiteboardStrokeSchema,
     realtimeMessages: z.array(z.unknown()).default([])
   });

   export const EraseWhiteboardStrokesRequestSchema = z.object({
     strokeIds: z.array(z.string().min(1)).min(1).max(500)
   });

   export const EraseWhiteboardStrokesResponseSchema = z.object({
     erasedIds: z.array(z.string()),
     realtimeMessages: z.array(z.unknown()).default([])
   });

   export const ClearWhiteboardResponseSchema = z.object({
     clearVersion: z.number().int().nonnegative(),
     realtimeMessages: z.array(z.unknown()).default([])
   });
   ```

6. Add realtime message schemas (place near `WallObjectRealtimeUpsertSchema` at line 1359):

   ```ts
   export const WhiteboardStrokeDeltaMessageV1Schema = z.object({
     type: z.literal("room.whiteboard.stroke-delta.v1"),
     roomId: z.string(),
     wallObjectId: z.string(),
     strokeId: z.string(),
     authorUserId: z.string(),
     tool: WhiteboardToolSchema,
     color: z.string(),
     thickness: z.number().positive(),
     deltaPoints: z.array(z.object({
       x: z.number(), y: z.number(), pressure: z.number().optional()
     })).min(1),
     sentAt: z.number().int(),
     senderId: z.string()
   });

   export const WhiteboardCursorMessageV1Schema = z.object({
     type: z.literal("room.whiteboard.cursor.v1"),
     roomId: z.string(),
     wallObjectId: z.string(),
     authorUserId: z.string(),
     x: z.number(),
     y: z.number(),
     visible: z.boolean(),
     sentAt: z.number().int(),
     senderId: z.string()
   });

   export const WhiteboardStrokeCommitMessageV1Schema = z.object({
     type: z.literal("room.whiteboard.stroke-commit.v1"),
     roomId: z.string(),
     wallObjectId: z.string(),
     stroke: WhiteboardStrokeSchema,
     sentAt: z.number().int(),
     senderId: z.string()
   });

   export const WhiteboardStrokeEraseMessageV1Schema = z.object({
     type: z.literal("room.whiteboard.stroke-erase.v1"),
     roomId: z.string(),
     wallObjectId: z.string(),
     strokeIds: z.array(z.string()),
     erasedByUserId: z.string(),
     sentAt: z.number().int(),
     senderId: z.string()
   });

   export const WhiteboardClearedMessageV1Schema = z.object({
     type: z.literal("room.whiteboard.cleared.v1"),
     roomId: z.string(),
     wallObjectId: z.string(),
     clearedByUserId: z.string(),
     clearVersion: z.number().int().nonnegative(),
     sentAt: z.number().int(),
     senderId: z.string()
   });

   export const WhiteboardSnapshotReadyMessageV1Schema = z.object({
     type: z.literal("room.whiteboard.snapshot-ready.v1"),
     roomId: z.string(),
     wallObjectId: z.string(),
     snapshot: WhiteboardSnapshotSchema,
     sentAt: z.number().int(),
     senderId: z.string()
   });
   ```

7. Type exports + OpenAPI routes near the existing wall-object route block:

   ```ts
   { method: "get",    path: "/v1/rooms/{roomId}/wall-objects/{objectId}/whiteboard/strokes",   summary: "List whiteboard strokes",   tags: ["whiteboards"], request: ListWhiteboardStrokesQuerySchema, response: ListWhiteboardStrokesResponseSchema },
   { method: "post",   path: "/v1/rooms/{roomId}/wall-objects/{objectId}/whiteboard/strokes",   summary: "Commit one whiteboard stroke", tags: ["whiteboards"], request: CommitWhiteboardStrokeRequestSchema, response: CommitWhiteboardStrokeResponseSchema },
   { method: "delete", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/whiteboard/strokes",   summary: "Erase strokes by id",       tags: ["whiteboards"], request: EraseWhiteboardStrokesRequestSchema, response: EraseWhiteboardStrokesResponseSchema },
   { method: "post",   path: "/v1/rooms/{roomId}/wall-objects/{objectId}/whiteboard/clear",     summary: "Clear all strokes",         tags: ["whiteboards"], response: ClearWhiteboardResponseSchema },
   { method: "post",   path: "/v1/rooms/{roomId}/wall-objects/{objectId}/whiteboard/snapshots", summary: "Request snapshot compaction", tags: ["whiteboards"], response: WhiteboardSnapshotSchema }
   ```

**File: `packages/room-engine/src/wallAnchorPolicy.ts`**

8. Extend `WallAnchorCreateOption` at line 7:

   ```ts
   export type WallAnchorCreateOption =
     | "file" | "note" | "timer" | "poll" | "link"
     | "camera" | "microphone" | "screen"
     | "whiteboard";
   ```

9. Add case to `anchorSupportsCreateOption()` at line 40:

   ```ts
   case "whiteboard":
     return anchorAcceptsWallObjectType(anchor, "whiteboard");
   ```

**File: `packages/room-engine/src/index.ts`**

10. Add `"whiteboard"` to the two narrower accept-lists at lines 252 and 271 so the default classroom theater anchors accept whiteboards. `FULL_WALL_OBJECT_ACCEPTS` already includes `"whiteboard"` so workforce-training and FFA accept-lists need no change.

**File: `apps/web/lib/config.ts`**

11. Extend `CLIENT_TUNING` at line 7:

    ```ts
    enableWhiteboards: process.env.NEXT_PUBLIC_ENABLE_WHITEBOARDS !== "false",
    ```

**Validation:**

```
npm --workspace @3dspace/contracts run typecheck
npm --workspace @3dspace/room-engine run typecheck
npm --workspace @3dspace/web run typecheck
npm --workspace @3dspace/contracts run openapi
```

### Phase 2 — API: persistence + lifecycle (no realtime publish yet)

Goal: durable stroke storage with full REST surface; realtime publish stubbed.

**File: `apps/api/src/models/mongoose.ts`**

1. Add Mongoose models:

   ```ts
   const whiteboardStrokeSchema = new Schema({
     _id: { type: String, required: true },           // ULID
     wallObjectId: { type: String, required: true, index: true },
     roomId: { type: String, required: true, index: true },
     authorUserId: { type: String, required: true },
     tool: { type: String, required: true },
     color: { type: String, required: true },
     thickness: { type: Number, required: true },
     points: { type: [{ x: Number, y: Number, pressure: Number }], required: true },
     text: { value: String, fontSize: Number },
     z: { type: Number, required: true },
     clearVersion: { type: Number, required: true, default: 0 },
     createdAt: { type: String, required: true }
   });
   whiteboardStrokeSchema.index({ wallObjectId: 1, z: 1 });
   whiteboardStrokeSchema.index({ wallObjectId: 1, authorUserId: 1, createdAt: -1 });

   const whiteboardSnapshotSchema = new Schema({
     _id: { type: String, required: true },           // wallObjectId + snapshotZ composite key
     wallObjectId: { type: String, required: true, index: true },
     snapshotZ: { type: Number, required: true },
     storageKey: { type: String, required: true },
     byteSize: { type: Number, required: true },
     createdAt: { type: String, required: true }
   });
   ```

**File: `apps/api/src/repository.ts`**

2. Add repository methods (mirror the `DynamicWallAnchor` pattern):

   ```ts
   appendWhiteboardStroke(input: Omit<WhiteboardStroke, "z" | "createdAt">, options: { clearVersion: number }): Promise<WhiteboardStroke>;
   eraseWhiteboardStrokes(wallObjectId: string, strokeIds: string[]): Promise<string[]>;
   clearWhiteboard(wallObjectId: string): Promise<{ clearVersion: number }>;
   listWhiteboardStrokesSince(wallObjectId: string, sinceZ: number): Promise<WhiteboardStroke[]>;
   getWhiteboardSnapshot(wallObjectId: string): Promise<WhiteboardSnapshot | null>;
   upsertWhiteboardSnapshot(snapshot: WhiteboardSnapshot): Promise<void>;
   ```

Each method has parallel memory + Mongoose impls. `appendWhiteboardStroke` reads `WallObject.state.clearVersion` atomically and throws `conflict("clearVersion stale")` when stale.

**File: `apps/api/src/whiteboards/` (new module)**

3. `validation.ts`: enforce point cap (`config.tuning.whiteboardMaxPointsPerStroke` × 2 hard limit), tool/color/thickness regex, point bounds (0..1), text payload required when `tool === "text"`. Whiteboard polls / poll-state validation is unrelated.

4. `orchestrator.ts`:
   - `commitStroke(roomId, wallObjectId, actorUserId, body)` → validates, stamps `z` (read-modify-write on `WallObject.state.strokeCount + 1`, then increment), persists stroke, bumps `WallObject.state.lastUpdatedAt + strokeCount`, returns `{ stroke, realtimeMessages: [{ type: "room.whiteboard.stroke-commit.v1", ... }] }`.
   - `eraseStrokes(roomId, wallObjectId, actorUserId, strokeIds)` → validates permission (manage OR all strokes authored by actor), removes, returns realtime message.
   - `clearAll(roomId, wallObjectId, actorUserId)` → requires manage permission, increments `clearVersion`, deletes all strokes for `wallObjectId`, returns realtime message.

5. `compaction-worker.ts`: every `WHITEBOARD_COMPACTION_TICK_SECONDS`, find whiteboards whose `strokeCount - (snapshotZ ?? 0) > WHITEBOARD_SNAPSHOT_AT_STROKES`, read post-snapshot strokes, gzip-serialize, upload to R2 under `WHITEBOARD_STORAGE_PREFIX<roomId>/<objectId>/snapshot-<z>.json.gz`, write `WhiteboardSnapshot` row, prune pre-snapshot strokes, emit `room.whiteboard.snapshot-ready.v1`.

**File: `apps/api/src/app.ts`**

6. Add route block after the existing `wall-objects/:objectId/control` route at line 3937:

   ```ts
   app.get("/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/strokes", async (request) => {
     const { roomId, objectId } = request.params as { roomId: string; objectId: string };
     const room = await requireRoomMembership(request, roomId);
     assertRoomTypeSupportsWhiteboards(room);
     await assertWallObjectIsWhiteboard(repository, roomId, objectId);
     const query = ListWhiteboardStrokesQuerySchema.parse(request.query);
     const snapshot = await repository.getWhiteboardSnapshot(objectId);
     const snapshotDownloadUrl = snapshot
       ? await signObjectStorageGet(snapshot.storageKey, { expirySeconds: 300 })
       : null;
     const strokes = await repository.listWhiteboardStrokesSince(objectId, query.sinceZ ?? (snapshot?.snapshotZ ?? 0));
     const object = await repository.getWallObject(roomId, objectId);
     return {
       snapshot,
       snapshotDownloadUrl,
       strokes,
       clearVersion: object.state?.clearVersion ?? 0,
       strokeCount: object.state?.strokeCount ?? 0
     };
   });

   app.post("/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/strokes", async (request) => { /* commit via orchestrator */ });
   app.delete("/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/strokes", async (request) => { /* erase via orchestrator */ });
   app.post("/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/clear", async (request) => { /* clear via orchestrator */ });
   app.post("/v1/rooms/:roomId/wall-objects/:objectId/whiteboard/snapshots", async (request) => { /* invoke compaction */ });
   ```

7. Helpers:

   ```ts
   function assertRoomTypeSupportsWhiteboards(room: { type?: RoomType | string | null | undefined }) {
     if (!getRoomTypeFeatureFlags(room.type).whiteboards) {
       throw notFound("Whiteboards are unavailable for this room type");
     }
     if (!config.tuning.enableWhiteboards) {
       throw notFound("Whiteboards are disabled");
     }
   }
   async function assertWallObjectIsWhiteboard(repo: Repository, roomId: string, objectId: string) {
     const object = await repo.getWallObject(roomId, objectId);
     if (!object) throw notFound("wall_object_not_found");
     if (object.type !== "whiteboard") throw badRequest("wall_object_not_whiteboard");
     return object;
   }
   ```

8. Add `whiteboards` to per-room enforcement helpers — extend `enforceWallObjectLimits()` at the existing helper at line 748 if needed (whiteboard counts against `maxActiveWallObjects` already; new bound is `room.settings.whiteboards.maxActivePerRoom`).

**Tests: `apps/api/tests/api.test.ts`**

9. Add tests:
   - Create a whiteboard wall object via existing `POST /v1/rooms/:roomId/wall-objects` with `type: "whiteboard"`, expect `state.clearVersion === 0`, `state.strokeCount === 0`.
   - Reject `moderation.policy: "pre"` on whiteboard creation with `400 invalid_moderation_policy_for_whiteboard`.
   - Commit one stroke; expect `z=1`, `clearVersion=0`.
   - Commit stroke with stale `clearVersion`; expect 409.
   - Erase by id; expect the stroke list shrinks.
   - Clear All; expect `state.clearVersion=1`, ledger empty.
   - List with `sinceZ` > current snapshot returns only post-snapshot strokes.
   - Whiteboard create rejected in a room type whose `RoomTypeFeatureFlags.whiteboards === false`.

### Phase 3 — Realtime fan-out

Goal: in-room realtime delivery for delta, cursor, commit, erase, clear, snapshot-ready.

**File: `apps/web/lib/realtime.ts`**

1. Add type union at line 43 (or alongside):

   ```ts
   export type WhiteboardRealtimeMessage =
     | z.infer<typeof WhiteboardStrokeDeltaMessageV1Schema>
     | z.infer<typeof WhiteboardCursorMessageV1Schema>
     | z.infer<typeof WhiteboardStrokeCommitMessageV1Schema>
     | z.infer<typeof WhiteboardStrokeEraseMessageV1Schema>
     | z.infer<typeof WhiteboardClearedMessageV1Schema>
     | z.infer<typeof WhiteboardSnapshotReadyMessageV1Schema>;
   ```

2. Extend `WallRealtimeMessage` at line 43 to include `WhiteboardRealtimeMessage` (or add the new union directly into the top-level `RealtimeMessage` union at line 66).

3. Extend `ROOM_OBJECT_UNRELIABLE_TYPES` at line 81:

   ```ts
   const ROOM_OBJECT_UNRELIABLE_TYPES = new Set([
     "room.object.pose.v1",
     "room.meeting-notes.segment.v1",
     "room.whiteboard.stroke-delta.v1",
     "room.whiteboard.cursor.v1"
   ]);
   ```

**File: `apps/api/src/app.ts`**

4. Each whiteboard mutation route returns the orchestrator's `realtimeMessages` array. Reuse the existing post-mutation publish pattern (`dispatchRealtime(roomId, messages)` if present, else collect into the response body and let the client publish — matches `dynamic-wall-anchors` shape).

**File: `apps/web/components/RoomClient.tsx`**

5. Add a `whiteboardRealtimeHandlerRef` and route in the dispatcher BEFORE the existing wall-object early-returns (similar to the meeting-notes ref pattern documented in `IMPL_FREE_FOR_ALL_AI_MEETING_NOTES.md`).

**Tests:**

6. `packages/contracts/tests/` — schema parse tests for each new realtime message.
7. `apps/api/tests/api.test.ts` — assert `realtimeMessages` payloads have the correct shape on each REST mutation.

### Phase 4 — Canvas component + tools

Goal: the actual drawing surface and toolbar.

**File: `apps/web/components/Whiteboard/strokeRenderer.ts`**

1. Pure function `renderStroke(ctx: CanvasRenderingContext2D, stroke: WhiteboardStroke, surfaceWidthPx: number, surfaceHeightPx: number)` — draws a single stroke at the right pixel position and applies tool-specific styling (highlighter uses globalAlpha, eraser uses composite operation, shapes use bbox).

**File: `apps/web/components/Whiteboard/useWhiteboardCanvas.ts`**

2. Hook owning a layered canvas:
   - `committedCanvasRef` — strokes already committed; redrawn only when a stroke arrives or board scrolls.
   - `overlayCanvasRef` — in-progress local + remote previews; cleared and re-rendered each rAF tick.
   - Provides `redrawCommitted()` and `redrawOverlay()`.

**File: `apps/web/components/Whiteboard/useWhiteboardPointer.ts`**

3. Hook that consumes `committedCanvas` pointer events. Pipeline:
   - On `pointerdown`: capture `clearVersion`, generate ULID, push new in-progress stroke into local state, broadcast first `stroke-delta.v1` (single point).
   - On `pointermove` (with `getCoalescedEvents()`): append normalized points, schedule rAF redraw of overlay, broadcast batched `stroke-delta.v1` at rAF cadence with max 16 ms throttle.
   - On `pointerup`: simplify points (Ramer-Douglas-Peucker, ε = 0.5 logical px), POST commit, optimistically draw to committed canvas, broadcast `stroke-commit.v1` on receiving the response's realtimeMessages.
   - On `pointercancel`: drop in-progress stroke (no commit; remote previews fade after 5 s no-commit timeout).

**File: `apps/web/components/Whiteboard/WhiteboardToolbar.tsx`**

4. Top-edge toolbar with the tools listed in PLAN § 2.2. Tool state is per-component (not broadcast). Toolbar is hidden in read-only mode but still shows Export.

**File: `apps/web/components/Whiteboard/WhiteboardColorPicker.tsx`**

5. 8 preset colors + custom hex input. Validates `#RRGGBB`.

**File: `apps/web/components/Whiteboard/WhiteboardCursorLayer.tsx`**

6. Renders remote cursor pucks. Listens to `room.whiteboard.cursor.v1`. Each remote cursor has a 1.5 s fade timer.

**File: `apps/web/components/Whiteboard/WhiteboardSurface.tsx`**

7. Composes the layered canvas, toolbar, cursor layer, and exposes `mode: "3d" | "2d"`. In 3D, sizes via `wallObjectSurfacePixelSize()` with the existing DPR-aware scale.

**File: `apps/web/lib/useWhiteboard.ts`**

8. Hook orchestrating data:
   - `useWhiteboard(roomId, wallObjectId)` hydrates strokes (snapshot + ledger), subscribes to realtime, exposes `commitStroke()`, `eraseStrokes()`, `clear()`, `commits[]`, `inProgressLocal`, `inProgressRemote`.
   - Reconciliation: local optimistic stroke matches commit by `id`; remote `stroke-commit.v1` replaces in-progress preview keyed by `strokeId`; commits sorted by `z`.

### Phase 5 — Wall-object integration + 2D parity

Goal: place a whiteboard from `AnchorPanel`, render in both views.

**File: `apps/web/components/AnchorPanel.tsx`**

1. `FORM_TYPES` at line 18 — add `{ id: "whiteboard", label: "Whiteboard" }`.
2. `CreateType` union at line 16 — add `"whiteboard"`.
3. `optionAllowedByGrant` at line 145 — add `if (option === "whiteboard") return grantAllowedTypes.has("whiteboard");`.
4. Add a render branch for the new option that calls a new `onCreateWhiteboard({ anchorId, title })` callback.

**File: `apps/web/components/RoomClient.tsx`**

5. Implement `onCreateWhiteboard` → calls existing `createWallObject` with `type: "whiteboard"`, `source: { kind: "inline", data: {} }`, `placement: {}`. No new wall-object REST surface needed.

**File: `apps/web/components/WallObjectCard.tsx`**

6. Add a `whiteboard` branch in the sidebar card body — render a small thumbnail (`<canvas>` replay from the most recent ~50 strokes), an **Open whiteboard** button, and manage actions (Clear All, Export PNG).

**File: `apps/web/components/RoomView3D.tsx`**

7. `WallObjectSurface` at line 706 — add `if (object.type === "whiteboard") return <WhiteboardSurface mode="3d" object={object} ... />`. Existing sizing via `wallObjectSurfacePixelSize()` carries over.

**File: `apps/web/components/RoomView2D.tsx`**

8. Add equivalent 2D branch inside the projected anchor rectangle. Toolbar layout uses denser icons.

### Phase 6 — Compaction, export, polish

1. Background compaction worker (Phase 2 § 5) goes live behind `WHITEBOARD_COMPACTION_TICK_SECONDS`.
2. Client-side PNG export with optional 2×/4× multiplier (`OffscreenCanvas` render).
3. "Cleared by …" toast triggered on `room.whiteboard.cleared.v1` for non-actor clients.
4. Long-press / right-click on a stroke (in Select tool) → "Erase stroke" quick action.
5. Stale in-progress preview cleanup — remote in-progress strokes without a commit for > 5 s are dropped.
6. Reconnect resync — on data-channel reconnect, `useWhiteboard` re-fetches `GET /strokes?sinceZ=<lastKnownZ>` to catch up missed commits.

### Phase 7 — Env templates, validation, rollout

1. Update env templates with PLAN § 5 vars.
2. Playwright e2e `apps/web/test/whiteboard.spec.ts`:
   - Teacher and student in one classroom; teacher places whiteboard on the primary board; both clients see the empty surface.
   - Teacher draws a quick pen stroke; student sees it within 500 ms.
   - Student draws (assuming grant); teacher sees it.
   - Teacher clears the board; both views go blank; student receives the "Cleared by Teacher" toast.
   - Teacher exports PNG; download succeeds and contains non-zero bytes.
3. Update `docs/planning/mvp/MVP_STATUS.md` to add a "Post-MVP — Whiteboards" row.
4. Staging rollout — `ENABLE_WHITEBOARDS=true` and `NEXT_PUBLIC_ENABLE_WHITEBOARDS=true` flipped together.

---

## Files-to-touch summary

| Area | Files |
|---|---|
| Contracts | `packages/contracts/src/index.ts`, `packages/contracts/openapi/openapi.json` (regenerated) |
| Room engine | `packages/room-engine/src/index.ts`, `packages/room-engine/src/wallAnchorPolicy.ts` |
| API | `apps/api/src/config.ts`, `apps/api/src/app.ts`, `apps/api/src/repository.ts`, `apps/api/src/models/mongoose.ts`, `apps/api/src/whiteboards/` (new module) |
| API tests | `apps/api/tests/api.test.ts` |
| Web hooks/libs | `apps/web/lib/config.ts`, `apps/web/lib/api.ts`, `apps/web/lib/realtime.ts`, `apps/web/lib/useWhiteboard.ts` (new) |
| Web components | `apps/web/components/AnchorPanel.tsx`, `apps/web/components/WallObjectCard.tsx`, `apps/web/components/RoomView3D.tsx`, `apps/web/components/RoomView2D.tsx`, `apps/web/components/RoomClient.tsx`, `apps/web/components/Whiteboard/*` (new module) |
| Styles | `apps/web/app/globals.css` |
| E2E | `apps/web/test/whiteboard.spec.ts` |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` |
| Status doc | `docs/planning/mvp/MVP_STATUS.md` |

---

## Risks

| Risk | Mitigation |
|---|---|
| Stroke storms during enthusiastic drawing (e.g. 5 students sketching at once) saturate the data channel. | Cursor messages capped at 20 Hz; stroke-delta capped at rAF cadence; commit messages are 1 per stroke (typically a few per second per drawer); LiveKit data-channel headroom is ample at these rates. |
| Optimistic in-progress strokes never commit (client dies between pointerup and POST). | Remote clients drop unresolved in-progress strokes after 5 s. Local client surfaces "Stroke failed — retry" inline. |
| Compaction race with concurrent strokes. | Compaction reads `strokeCount` at start; if `strokeCount > prevStrokeCount` after upload, falls back to a smaller snapshot range and retries next tick. No lost data. |
| Snapshot blob blows up over a long session. | Compaction is incremental — new snapshot supersedes the prior one; only the latest is loaded on hydrate. Pre-snapshot ledger rows are pruned. |
| Mobile touch input creates noisy strokes. | Client-side Ramer-Douglas-Peucker simplification (ε = 0.5 logical px) reduces point count by ~5×–10× before commit. |
| Whiteboard inside a 3D board with `occlude` hides the canvas DOM. | `WallObjectSurface` already handles this via the same conditional rendering pattern used for poll surfaces. Reuse `AnchorMesh` line-of-sight gating verbatim. |
| New `WhiteboardRealtimeMessage` types break older clients during partial rollout. | Each message type carries a `.v1` suffix; clients reject unknown types and degrade gracefully (rerender from REST). |
| Classroom moderation expectation that students cannot draw without explicit grant. | `RoomSettings.whiteboards.allowStudentDraw` ships `true` by default but can be flipped to `false` per room; per-anchor board-access grants further restrict. |

---

## Validation checkboxes

Maintain alongside implementation progress (mirrors `IMPL_FREE_FOR_ALL_AI_MEETING_NOTES.md`).

- [ ] Phase 1: `npm run typecheck` (contracts, room-engine, web).
- [ ] Phase 1: `npm --workspace @3dspace/contracts run openapi` (artifact updated).
- [ ] Phase 2: `npm run test -- apps/api/tests/api.test.ts -t "whiteboard"` (new tests pass).
- [ ] Phase 2: stroke commit round-trip < 50 ms in API integration test.
- [ ] Phase 3: realtime message round-trip in BroadcastChannel test < 30 ms.
- [ ] Phase 4: 1000-stroke render < 50 ms on the medium DPR target.
- [ ] Phase 5: 3D + 2D parity — whiteboard renders on every anchor whose `accepts` includes `"whiteboard"`.
- [ ] Phase 6: snapshot worker compacts after 500 strokes and post-snapshot ledger is pruned.
- [ ] Phase 7: Playwright e2e `whiteboard.spec.ts` passes locally.
- [ ] Phase 7: staging dashboards report no error spikes from whiteboard routes 24 h after rollout.

---

## Out-of-scope follow-ups (Phase 2+)

- Sticky notes as a richer text/shape type.
- Connector lines + flow-chart authoring.
- AI-assisted "tidy" / "shape recognize" pass.
- SVG / PDF export.
- Server-side rasterization endpoint.
- Whiteboard recap into AI Meeting Notes (attach board PNG to session artifacts).
- Per-stroke author chips on hover.
- Math/LaTeX rendering inside text strokes.
- Multi-page boards with page navigation.

These are intentionally deferred to keep Phase 1 scope minimal and shippable.
