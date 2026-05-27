# Implementation — AI 3D Object Generator (Free-for-All Room Type)

Source plan: [`PLAN_FREE_FOR_ALL_AI_3D_OBJECTS.md`](./PLAN_FREE_FOR_ALL_AI_3D_OBJECTS.md)
Parent room type: [`IMPL_FREE_FOR_ALL_ROOM.md`](./IMPL_FREE_FOR_ALL_ROOM.md)
Sibling FFA feature: [`IMPL_FREE_FOR_ALL_AI_MEETING_NOTES.md`](./IMPL_FREE_FOR_ALL_AI_MEETING_NOTES.md)
Branch: `room-types`
Last updated: 2026-05-27 (revised: procedural composer default; Meshy optional only)

---

## Status / Scope

**Status:** Not started. Planning only.

This doc implements the AI 3D Object Generator feature described in the PLAN. It is **additive to Free-for-All Phase 1** — FFA room type, open join, and dynamic boards must already be shipped on `room-types` before this work begins. (They are.)

**What ships:**

1. **Right-side HUD panel** (`AiObjectPanel`) on Free-for-All rooms with prompt entry, generation lifecycle UI, in-room placement, and `.glb` download.
2. **Default pipeline**: OpenAI `gpt-4.1` → **`ProceduralObjectSpec`** → in-house **`procedural-glb-builder`** → validate → R2 + `RoomObjectTemplate` (no Meshy account required).
3. **Optional pipeline**: same Stage A policy checks, but Meshy text-to-3D when `AI_OBJECT_PROVIDER=meshy` and `MESHY_API_KEY` are set.
4. **Two backends only**: `procedural` | `meshy`. No Tripo, stub provider, or self-hosted adapters.
5. **Reuse of all existing RoomObject limits**: 200k triangles, 15 MiB, 2048 px textures, allowlisted glTF extensions. Auto-repair mainly for Meshy output.
6. **Cost/abuse bounds**: per-room concurrent (3), per-user concurrent (1), per-user/day (20). Env-tunable.
7. **Authenticated `.glb` download** with `Content-Disposition: attachment`.
8. **Reliable realtime broadcast** of job lifecycle.
9. **Feature flag** `ENABLE_AI_OBJECT_GENERATION` / `NEXT_PUBLIC_ENABLE_AI_OBJECT_GENERATION` (default `false`), double-gated with `roomTypeFeatures.aiObjects`.

**Out of scope (Phase 1):**

- Classroom / workforce-training room types.
- Any generation backend other than **procedural** and **Meshy**.
- Image-to-3D, sketch-to-3D, photo-to-3D, or animated meshes.
- "Save to my library" cross-room template persistence.
- In-app mesh editing beyond pose/scale/tint via existing `RoomObjectInspector`.
- Mid-job rolling cost display.

---

## Codebase context (pre-implementation state)

Line numbers below are accurate as of `room-types` HEAD on 2026-05-27 (the meeting-notes contract Phase 1 has landed but the rest of meeting-notes is still pending).

| File | What matters |
|---|---|
| `packages/contracts/src/index.ts` | `RoomObjectSourceSchema` at line 340 — extend to add `"ai-generated"`. `RoomObjectTemplateSchema` at line ~408. `RoomObjectsSettingsSchema` at line 469. `RoomTypeFeatureFlags` at line 815 — add `aiObjects: boolean`. `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` at 832, `CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` at 849, `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS` at 866 — all need the new key. `RoomSettingsSchema` at line 897 — add `aiObjects` settings block (default fill at ~line 923 where `roomObjects` defaults are written). Realtime message patterns mirror `RoomBoardCreatedMessageV1Schema` at line 1364 (used by FFA dynamic boards) and `MeetingNotesStartedMessageV1Schema` (in same file, added in meeting-notes Phase 1). |
| `packages/contracts/openapi/openapi.json` | Regenerate after contract changes (`npm run openapi` from `packages/contracts`). |
| `apps/api/src/config.ts` | `AppConfig.tuning` — add `enableAiObjectGeneration`, `aiObjectProvider: "procedural" \| "meshy"`, `meshyApiKey`, `openAiAiObjectComposerModel`, `aiObjectMeshyRefineTextures`, `aiObjectStoragePrefix`, `aiObjectMaxPromptChars`, `aiObjectMeshyTimeoutSec`, `aiObjectMaxJobsPerUserPerDay`, `aiObjectRetentionDays`, `aiObjectUseTestFixture`. `requiredInProduction()`: always `OPENAI_API_KEY` when feature on; `MESHY_API_KEY` only when `aiObjectProvider === "meshy"`. |
| `apps/api/src/app.ts` | Custom-template upload validation reused at lines 4229–4236 (`validateCustomRoomObjectAsset` from `room-objects/custom-template-upload.ts`). Custom-template create route at 4207. Object placement route at `POST /v1/rooms/:roomId/objects` around 4292. Realtime outbox pattern reused throughout dynamic-wall-anchors at 3324–3470 (the natural insertion anchor for the new `/v1/rooms/:roomId/ai-objects/*` block). Lesson recap CSV download at 3828 is the `Content-Disposition` proxy pattern to copy. |
| `apps/api/src/repository.ts` | `Repository` interface — add `AiObjectJob` CRUD methods mirroring `DynamicWallAnchor` shape. Memory + Mongoose impls. |
| `apps/api/src/models/mongoose.ts` | New `AiObjectJob` collection with `{ roomId: 1, createdAt: -1 }`, `{ requestedByUserId: 1, createdAt: -1 }`, `{ status: 1, updatedAt: 1 }` indexes. |
| `apps/api/src/room-objects/custom-template-upload.ts` | `validateCustomRoomObjectAsset()` already enforces 200k tri / 15 MiB / 2048 px / allowlisted extensions / no external URIs. **Reuse as-is.** `ROOM_OBJECT_MAX_TRIANGLES = 200_000` at line 20. |
| `apps/api/src/ai-objects/` | **New module** (see Phases 2–6). Orchestrator, `prompt-composer.ts`, `procedural-glb-builder.ts`, `procedural-spec-schema.ts`, `backends/{procedural,meshy}.ts`, repair pipeline (Meshy-heavy), retention reaper. |
| `apps/web/lib/config.ts` | `CLIENT_TUNING` at line 7 — add `enableAiObjectGeneration: process.env.NEXT_PUBLIC_ENABLE_AI_OBJECT_GENERATION === "true"`. |
| `apps/web/lib/api.ts` | `uploadRoomObjectGlb` at line 399 demonstrates the multi-step upload pattern. `downloadLessonRecapCsv` at lines 517–545 is the authenticated download → Blob → anchor click pattern to mirror. |
| `apps/web/lib/realtime.ts` | `RealtimeMessage` union — extend with `AiObjectRealtimeMessage`. `isRealtimeUnreliable()` — no AI-object events are unreliable in v1 (reliable channel only). |
| `apps/web/lib/useAiObjectGenerator.ts` | **New hook** — mirror `apps/web/lib/useMeetingNotes.ts` (once Phase 1 of meeting notes lands) and `apps/web/lib/useDynamicWallAnchors.ts`. |
| `apps/web/components/AiObjectPanel.tsx` | **New component** — right-side `HudCard` with panel states from PLAN § 2.1. |
| `apps/web/components/RoomClient.tsx` | Right HUD rail mount (same area `MeetingNotesPanel` will land). Mount `AiObjectPanel` when `roomTypeFeatures.aiObjects && CLIENT_TUNING.enableAiObjectGeneration`. Realtime dispatch — wire `aiObjectRealtimeHandlerRef` before the early-return stubs. |
| `apps/web/components/BlockyAvatar.tsx` | Nameplate — optional small "generating" gear icon when the participant has an in-flight AI object job. |
| `apps/web/components/Lobby.tsx` | FFA join flow — add a one-liner mention of AI-generated content under the consent block (PLAN § 7). |
| `apps/web/app/globals.css` | Add `.ai-object-panel-*` styles in the same area as `.meeting-notes-*`. |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` — add AI Object vars from PLAN § 5. |

---

## Plan adjustments

Clarifications derived from the codebase walkthrough, on top of the PLAN doc:

**A. Double-gating: room-type flag + env flag.** Matches the existing pattern (`roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons`, and the freshly-landed `roomTypeFeatures.aiMeetingNotes && CLIENT_TUNING.enableAiMeetingNotes`). AI Object Generator requires both:

- `getRoomTypeFeatureFlags(room.type).aiObjects === true` (only FFA), and
- `config.tuning.enableAiObjectGeneration === true` / `CLIENT_TUNING.enableAiObjectGeneration === true`.

**B. Reuse `validateCustomRoomObjectAsset()` verbatim.** No new limit constants. If we ever need to raise the AI-specific budget (e.g. allow 300k triangles for AI uploads because decimation already happens server-side), we change it in `room-objects/custom-template-upload.ts` and document it as a global change — not as a fork. Phase 1 holds at the current 200k / 15 MiB / 2048 px limits.

**C. Reuse the existing `RoomObjectTemplate` + `RoomObject` placement pipeline.** The AI feature does **not** introduce a parallel object system. It:

1. Adds `"ai-generated"` to `RoomObjectSourceSchema` (line 340 in contracts).
2. Creates the `RoomObjectTemplate` row from the orchestrator (bypassing `POST /v1/room-objects/templates` because that endpoint requires `requireRoomTeacher` — see line 4211 in `app.ts` — which doesn't apply in FFA). Server-internal write goes straight through `repository.createRoomObjectTemplate(...)`.
3. The new `POST /v1/rooms/:roomId/ai-objects/jobs/:jobId/place` convenience endpoint internally calls the same logic as `POST /v1/rooms/:roomId/objects` to instantiate.

This keeps grab locks, optimistic-pose sync, 2D parity, and template caching unchanged.

**D. Existing custom-upload teacher gate doesn't apply.** `POST /v1/rooms/:roomId/room-objects/uploads` and `POST /v1/room-objects/templates` both call `requireRoomTeacher` (lines 4178, 4211). The new AI endpoints **do not** — they call `requireRoomAccess` only, since FFA is participant-equal. This is enforced by also checking `getRoomTypeFeatureFlags(room.type).aiObjects` so the looser permission only applies in FFA rooms.

**E. Two backends only: `procedural` and `meshy`.** Registry in `backends/index.ts`:

```ts
export function getGenerationBackend(config): AiObjectGenerationBackend {
  return config.tuning.aiObjectProvider === "meshy" ? meshyBackend : proceduralBackend;
}
```

Default env: `AI_OBJECT_PROVIDER=procedural`. No Tripo, stub, or Hunyuan paths.

**F. Stage A outputs differ by backend.**

- **Procedural:** `ProceduralObjectSpec` JSON → stored on `AiObjectJob.proceduralSpecJson`. UI: collapsible **Show build recipe**.
- **Meshy:** `refinedPrompt` / `negativePrompt` → stored on job. UI: collapsible **Show refined prompt**.

Refusals → `422 prompt_rejected`. New code `outside_procedural_scope` when the model cannot map the request to the primitive vocabulary (suggest Meshy if `room.settings.aiObjects.allowMeshy`).

**F2. Procedural path never executes LLM-generated code.** Only validated JSON specs interpreted by `procedural-glb-builder.ts`.

**G. Auto-repair pipeline order.** Server-side, before mark `validation_failed`:

1. Try triangle decimation via `meshoptimizer.simplify` to `min(ROOM_OBJECT_MAX_TRIANGLES, polycountTarget * 1.2)`.
2. Try texture downscale via `sharp` to 2048×2048.
3. Try draco / meshopt compression via `@gltf-transform`.
4. Re-run `validateCustomRoomObjectAsset()`.
5. If still over budget, mark `validation_failed` with the same error envelope the user would have seen from a manual upload.

**H. Local dev / CI without OpenAI.** When `AI_OBJECT_USE_TEST_FIXTURE=true` or `NODE_ENV=test`, Stage A is skipped and a **canned `ProceduralObjectSpec`** (unit cube) is fed to the procedural builder. This is not a separate provider — it is a test bypass on the procedural path. Production requires `OPENAI_API_KEY`.

**I. Filename slug.**

```
ai-object-<prompt-slug>-<YYYYMMDD-HHmm>.glb
```

Slugify: lowercase, spaces → hyphens, strip non-alphanumeric, max 40 chars; fallback `ai-object-<jobId>.glb` if empty.

**J. Cancellation semantics.** A user cancel always transitions the local job to `cancelled` immediately. The provider cancel attempt is best-effort; if the provider has already billed, we eat the cost and the job still ends in `cancelled` — we don't surface partial results.

**K. Concurrency enforcement is at job-create time.** Server reads count of `AiObjectJob` rows for the room (status in {`queued`, `refining`, `composing`, `validating`}) and the user, returns `429 quota_exceeded` with `reason: "room_concurrency" | "user_concurrency" | "user_daily"`. No locking is needed because the bound is small and the cost of being slightly over isn't catastrophic.

---

## Phased implementation

### Phase 1 — Contracts + feature flags

Goal: schemas, feature flags, and realtime message types accept the new capability.

**File: `packages/contracts/src/index.ts`**

1. Extend `RoomObjectSourceSchema` (line 340):

   ```ts
   export const RoomObjectSourceSchema = z.enum(["builtin", "custom", "partner", "ai-generated"]);
   ```

2. Extend `RoomTypeFeatureFlags` (line 815):

   ```ts
   aiObjects: boolean;
   ```

3. Set `aiObjects: false` in `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` (832) and `CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` (849); set `aiObjects: true` in `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS` (866).

4. Add settings block to `RoomSettingsSchema` (~line 923, where `roomObjects` defaults live):

   ```ts
   aiObjects: z.object({
     enabled: z.boolean().default(true),
     maxConcurrentJobsPerRoom: z.number().int().positive().max(8).default(3),
     maxConcurrentJobsPerUser: z.number().int().positive().max(4).default(1),
     maxJobsPerUserPerDay: z.number().int().positive().max(200).default(20),
     allowMeshy: z.boolean().default(false),
     meshyRefineTextures: z.boolean().default(true),
     defaultPolycountTarget: z.number().int().positive().max(200000).default(15000),
   }).default({
     enabled: true,
     maxConcurrentJobsPerRoom: 3,
     maxConcurrentJobsPerUser: 1,
     maxJobsPerUserPerDay: 20,
     allowMeshy: false,
     meshyRefineTextures: true,
     defaultPolycountTarget: 15000,
   }),
   ```

5. Add entity + request/response schemas:

   ```ts
   export const AiObjectJobStatusSchema = z.enum([
     "queued", "refining", "composing", "validating",
     "ready", "error", "cancelled", "rejected"
   ]);

   export const AiObjectJobErrorCodeSchema = z.enum([
     "prompt_rejected", "outside_procedural_scope", "provider_timeout", "provider_error",
     "validation_failed", "quota_exceeded", "internal"
   ]);

   // ProceduralObjectSpec — see PLAN § 3.3; full Zod in procedural-spec-schema.ts
   export const ProceduralObjectSpecSchema = z.object({ /* parts, materials, displayName, style */ });

   export const AiObjectJobStylePresetSchema = z.enum([
     "realistic", "stylized-low-poly", "cartoon", "sculpture"
   ]);

   export const AiObjectJobComplexitySchema = z.enum(["small", "medium", "detailed"]);

   export const AiObjectJobSchema = z.object({
     id: z.string().min(1),
     roomId: z.string().min(1),
     requestedByUserId: z.string().min(1),
     prompt: z.string().min(1).max(2000),
     proceduralSpecJson: z.string().optional(),
     refinedPrompt: z.string().optional(),
     negativePrompt: z.string().optional(),
     stylePreset: AiObjectJobStylePresetSchema.optional(),
     complexity: AiObjectJobComplexitySchema.optional(),
     polycountTarget: z.number().int().positive().optional(),
     status: AiObjectJobStatusSchema,
     providerName: z.string(),
     providerJobId: z.string().optional(),
     providerProgressPercent: z.number().min(0).max(100).optional(),
     errorCode: AiObjectJobErrorCodeSchema.optional(),
     errorMessage: z.string().optional(),
     templateId: z.string().optional(),
     glbStorageKey: z.string().optional(),
     thumbnailStorageKey: z.string().optional(),
     fileSizeBytes: z.number().int().nonnegative().optional(),
     triangleCount: z.number().int().nonnegative().optional(),
     textureMaxDim: z.number().int().nonnegative().optional(),
     startedAt: z.string().datetime(),
     finishedAt: z.string().datetime().optional(),
     durationMs: z.number().int().nonnegative().optional(),
     createdAt: z.string().datetime(),
     updatedAt: z.string().datetime(),
   });

   export const StartAiObjectJobRequestSchema = z.object({
     prompt: z.string().min(1).max(500),
     stylePreset: AiObjectJobStylePresetSchema.optional(),
     complexity: AiObjectJobComplexitySchema.optional(),
     polycountTarget: z.number().int().positive().max(200000).optional(),
   });

   export const StartAiObjectJobResponseSchema = z.object({
     job: AiObjectJobSchema,
     realtimeMessages: z.array(z.unknown()).default([]),
   });

   export const PatchAiObjectJobRequestSchema = z.object({
     action: z.literal("cancel"),
   });

   export const ListAiObjectJobsResponseSchema = z.object({
     jobs: z.array(AiObjectJobSchema),
   });

   export const PlaceAiObjectRequestSchema = z.object({
     position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
     rotation: z.object({ yaw: z.number(), pitch: z.number(), roll: z.number() }).optional(),
   });
   ```

6. Add realtime message schemas (mirror `RoomBoardCreatedMessageV1Schema` at line 1364):

   ```ts
   export const AiObjectStartedMessageV1Schema = z.object({
     type: z.literal("room.ai-object.started.v1"),
     roomId: z.string(),
     jobId: z.string(),
     requestedByUserId: z.string(),
     prompt: z.string(),
     startedAt: z.string().datetime(),
     sentAt: z.number().int(),
     senderId: z.string(),
   });

   export const AiObjectProgressMessageV1Schema = z.object({
     type: z.literal("room.ai-object.progress.v1"),
     roomId: z.string(),
     jobId: z.string(),
     status: AiObjectJobStatusSchema,
     providerProgressPercent: z.number().min(0).max(100).optional(),
     sentAt: z.number().int(),
     senderId: z.string(),
   });

   export const AiObjectReadyMessageV1Schema = z.object({
     type: z.literal("room.ai-object.ready.v1"),
     roomId: z.string(),
     jobId: z.string(),
     templateId: z.string(),
     fileSizeBytes: z.number().int().nonnegative(),
     triangleCount: z.number().int().nonnegative(),
     thumbnailUrl: z.string(),
     sentAt: z.number().int(),
     senderId: z.string(),
   });

   export const AiObjectErrorMessageV1Schema = z.object({
     type: z.literal("room.ai-object.error.v1"),
     roomId: z.string(),
     jobId: z.string(),
     errorCode: AiObjectJobErrorCodeSchema,
     errorMessage: z.string(),
     sentAt: z.number().int(),
     senderId: z.string(),
   });

   export const AiObjectCancelledMessageV1Schema = z.object({
     type: z.literal("room.ai-object.cancelled.v1"),
     roomId: z.string(),
     jobId: z.string(),
     sentAt: z.number().int(),
     senderId: z.string(),
   });

   export const AiObjectDeletedMessageV1Schema = z.object({
     type: z.literal("room.ai-object.deleted.v1"),
     roomId: z.string(),
     jobId: z.string(),
     templateId: z.string().optional(),
     sentAt: z.number().int(),
     senderId: z.string(),
   });
   ```

   All six are reliable-channel messages. Add to the `RealtimeMessage` union in `apps/web/lib/realtime.ts` (and do **not** add to `isRealtimeUnreliable()`).

7. Add OpenAPI route stubs for all endpoints in § 4.4 of the PLAN. Regenerate: `npm run openapi` from `packages/contracts`.

**File: `apps/web/lib/config.ts`**

8. Add `enableAiObjectGeneration: process.env.NEXT_PUBLIC_ENABLE_AI_OBJECT_GENERATION === "true"` to `CLIENT_TUNING` (line 7 block).

**Env templates**

9. Add vars from PLAN § 5 to `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/contracts` passes.
- [ ] `npm test -- packages/contracts/tests` passes.
- [ ] `npm run openapi -w @3dspace/contracts` regenerates without diff drift beyond the new routes.

---

### Phase 2 — API: job lifecycle (canned procedural fixture)

Goal: REST endpoints, persistence, quota enforcement, reliable realtime — without OpenAI or Meshy.

**File: `apps/api/src/repository.ts`**

1. Extend `Repository` interface (mirror `listDynamicWallAnchorsForRoom` shape):

   ```ts
   listAiObjectJobsForRoom(roomId: string, opts?: { limit?: number }): Promise<AiObjectJob[]>;
   countActiveAiObjectJobsForRoom(roomId: string): Promise<number>;
   countActiveAiObjectJobsForUser(roomId: string, userId: string): Promise<number>;
   countAiObjectJobsForUserSince(userId: string, sinceIso: string): Promise<number>;
   getAiObjectJob(id: string): Promise<AiObjectJob | undefined>;
   createAiObjectJob(input: AiObjectJob): Promise<AiObjectJob>;
   updateAiObjectJob(id: string, patch: Partial<AiObjectJob>): Promise<AiObjectJob>;
   deleteAiObjectJob(id: string, roomId: string): Promise<void>;
   listExpiredAiObjectJobs(beforeIso: string, limit: number): Promise<AiObjectJob[]>;
   ```

2. Implement in `MemoryRepository` and `MongooseRepository`.

**File: `apps/api/src/models/mongoose.ts`**

3. Add `aiObjectJobSchema` with indexes:

   ```ts
   aiObjectJobSchema.index({ roomId: 1, createdAt: -1 });
   aiObjectJobSchema.index({ requestedByUserId: 1, createdAt: -1 });
   aiObjectJobSchema.index({ status: 1, updatedAt: 1 });
   ```

**File: `apps/api/src/config.ts`**

4. Add tuning fields:

   ```ts
   enableAiObjectGeneration: boolean;
   aiObjectProvider: "procedural" | "meshy";  // default "procedural"
   meshyApiKey: string | undefined;
   openAiAiObjectComposerModel: string;       // default "gpt-4.1"
   aiObjectMeshyRefineTextures: boolean;        // default true; meshy only
   aiObjectStoragePrefix: string;               // default "ai-objects/"
   aiObjectMaxPromptChars: number;              // default 500
   aiObjectMeshyTimeoutSec: number;             // default 300
   aiObjectMaxJobsPerUserPerDay: number;        // default 20
   aiObjectRetentionDays: number;               // default 30
   aiObjectUseTestFixture: boolean;             // default false
   ```

5. Extend `requiredInProduction()`:

   ```ts
   if (config.tuning.enableAiObjectGeneration) {
     require("OPENAI_API_KEY");
   }
   if (config.tuning.enableAiObjectGeneration && config.tuning.aiObjectProvider === "meshy") {
     require("MESHY_API_KEY");
   }
   ```

**File: `apps/api/src/ai-objects/index.ts` (new module)**

6. Stand up module structure:

   ```
   ai-objects/
     index.ts
     orchestrator.ts
     prompt-composer.ts          // Stage A (Phase 3)
     procedural-spec-schema.ts
     procedural-glb-builder.ts   // Stage B procedural (Phase 4)
     repair-pipeline.ts            // mainly Meshy over-budget (Phase 5)
     retention-reaper.ts
     types.ts
     backends/
       index.ts                  // procedural | meshy only
       procedural.ts
       meshy.ts                  // Phase 6
     fixtures/
       test-cube-spec.json       // canned ProceduralObjectSpec for Phase 2 / CI
   ```

7. Implement `orchestrator.startJob()` Phase 2 path:
   - Quota + prompt length checks.
   - If `aiObjectUseTestFixture` or `NODE_ENV=test`: use `fixtures/test-cube-spec.json`, skip OpenAI.
   - `proceduralBackend.generate(spec)` → GLB bytes.
   - Run validate + persist + `ready` (same as Phase 5; validation can be relaxed for known-good fixture in Phase 2 only).

**File: `apps/api/src/app.ts`**

8. Add helper `assertAiObjectsEnabled(room)`:

   ```ts
   function assertAiObjectsEnabled(room: Room) {
     if (!config.tuning.enableAiObjectGeneration) throw forbidden("AI object generation is disabled");
     if (!getRoomTypeFeatureFlags(room.type).aiObjects) throw forbidden("AI object generation is not available for this room type");
     if (!room.settings.aiObjects?.enabled) throw forbidden("AI object generation is disabled for this room");
   }
   ```

9. Add routes (insertion anchor: after the dynamic-wall-anchors block at line ~3470):

   | Route | Handler sketch |
   |---|---|
   | `POST /v1/rooms/:roomId/ai-objects/jobs` | `requireRoomAccess`, `assertAiObjectsEnabled`, validate body, check quotas, `orchestrator.startJob()`. Returns `{ job, realtimeMessages }`. |
   | `GET .../ai-objects/jobs` | List by room with default limit 20. |
   | `GET .../ai-objects/jobs/:jobId` | Return job with current status. |
   | `PATCH .../ai-objects/jobs/:jobId` | `{ action: "cancel" }` → `orchestrator.cancelJob()`. Emit `room.ai-object.cancelled.v1`. |
   | `DELETE .../ai-objects/jobs/:jobId` | Any current participant. Cascades to `RoomObjectTemplate` + R2 objects + already-placed `RoomObject` instances. Emit `room.ai-object.deleted.v1`. |
   | `GET .../ai-objects/jobs/:jobId/object.glb` | Proxy R2 with `Content-Disposition` (copy the lesson-recap pattern at line 3828). |
   | `POST .../ai-objects/jobs/:jobId/place` | Resolve template id; internally call the same logic as `POST /v1/rooms/:roomId/objects` to create a `RoomObject` at requester's position. Emit standard `room.object.created.v1` realtime. |

10. All mutations return `realtimeMessages[]` for the client to publish (same pattern as wall-objects, dynamic-anchors).

**File: `apps/api/tests/api.test.ts`**

11. Add tests (`AI_OBJECT_USE_TEST_FIXTURE=true`, `AI_OBJECT_PROVIDER=procedural`):

    - Start → ready (canned cube spec) → list → get detail → place → download → delete.
    - Classroom room returns 403 (`forbidden`).
    - Flag off returns 403.
    - Non-participant returns 403.
    - Prompt > `aiObjectMaxPromptChars` returns 400.
    - Per-room concurrency exceeded returns 429 with `reason: "room_concurrency"`.
    - Per-user concurrency exceeded returns 429 with `reason: "user_concurrency"`.
    - Per-user/day exceeded returns 429 with `reason: "user_daily"`.
    - Cancel on already-ready job is a 200 no-op.
    - Delete cascades the `RoomObjectTemplate` and any placed `RoomObject` instances.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/api` passes.
- [ ] `AI_OBJECT_USE_TEST_FIXTURE=true npm run test -- apps/api/tests/api.test.ts -t "ai-object"` passes.

---

### Phase 3 — Stage A: OpenAI prompt composer

Goal: user prompt → `ProceduralObjectSpec` (procedural) or Meshy prompt envelope (meshy), with policy enforcement.

**New files:** `prompt-composer.ts`, `prompts.ts`, `openai-client.ts` (shared with meeting-notes if available).

**File: `apps/api/src/ai-objects/prompts.ts`**

1. Two system prompts (or one prompt with `outputMode`):
   - **`AI_OBJECT_PROCEDURAL_COMPOSER_PROMPT`** — emit `ProceduralObjectSpec` using only the vocabulary in PLAN § 3.3; set `rejected` + `outside_procedural_scope` when the request cannot be built from primitives.
   - **`AI_OBJECT_MESHY_REFINER_PROMPT`** — emit `refinedPrompt`, `negativePrompt`, style/complexity fields (used only when `aiObjectProvider === "meshy"`).

**File: `apps/api/src/ai-objects/prompt-composer.ts`**

2. ```ts
   export async function composeFromPrompt(input, deps): Promise<
     | { mode: "procedural"; spec: ProceduralObjectSpec }
     | { mode: "meshy"; refined: MeshyPromptEnvelope }
     | { rejected: true; reason: string; code?: "outside_procedural_scope" }
   >
   ```

3. `response_format: { type: "json_object" }`; Zod validate; one retry on parse failure; **no** fallback to raw prompt in production.

**Tests:** fixture prompts in `apps/api/tests/fixtures/ai-object-prompts.json`; mock OpenAI; `OPENAI_INTEGRATION=true` optional.

**Checkpoint:** `npm run test -- apps/api/tests/api.test.ts -t "prompt composer"` passes.

---

### Phase 4 — Procedural GLB builder (default backend)

Goal: `ProceduralObjectSpec` → `.glb` + thumbnail on the API process (no Meshy).

**File: `apps/api/src/ai-objects/procedural-glb-builder.ts`**

1. For each `part` in spec: generate geometry (boxes, spheres, …) via `@gltf-transform` primitives or precomputed vertex buffers.
2. Apply materials from `spec.materials` (`pbrMetallicRoughness`).
3. Merge into single scene root; enforce triangle budget from complexity preset **before** export.
4. Export GLB; render thumbnail (simple orthographic PNG via `@gltf-transform` + `sharp`, or pre-rasterized placeholder).

**File: `apps/api/src/ai-objects/backends/procedural.ts`**

5. ```ts
   export const proceduralBackend: AiObjectGenerationBackend = {
     name: "procedural",
     async generate({ spec }) {
       return buildGlbFromProceduralSpec(spec);
     },
   };
   ```

**File: `apps/api/src/ai-objects/orchestrator.ts`**

6. Flow: `queued → refining` (composer) → `composing` (procedural backend) → `validating` → persist.

**Tests:** `apps/api/tests/procedural-glb-builder.test.ts` — cube spec, chest spec, part-cap rejection.

**Checkpoint:** procedural path produces valid GLB under 200k tri without OpenAI in tests (canned spec).

---

### Phase 5 — Validation, persistence, downloads, retention

Goal: take GLB bytes from either backend, fit room limits, persist, expose download + place.

**File: `apps/api/src/ai-objects/repair-pipeline.ts`**

1. Implement the auto-repair sequence (PLAN § 3.4):

   ```ts
   export async function repairAiObjectGlb(input: { bytes: Buffer; polycountTarget?: number }) {
     // Decimate via meshoptimizer.simplify if over triangle budget.
     // Texture downscale via sharp if any texture > 2048 px.
     // Draco / meshopt compress if size still over budget.
     // Returns Buffer + applied-steps log.
   }
   ```

2. Reuse `apps/api/src/room-objects/custom-template-upload.ts::validateCustomRoomObjectAsset()` after each repair attempt. Three repair passes max, then fail with `validation_failed`.

**File: `apps/api/src/ai-objects/orchestrator.ts`**

3. Stage C:

   ```ts
   const repaired = await repairAiObjectGlb({ bytes: rawGlb, polycountTarget });
   const validation = await validateCustomRoomObjectAsset({
     bytes: repaired.bytes,
     maxUploadSizeBytes: room.settings.roomObjects.maxUploadSizeBytes,
   });
   ```

4. Stage D — persist:
   - Write `{aiObjectStoragePrefix}{roomId}/{jobId}/object.glb` and `thumbnail.png` to R2 via existing storage adapter.
   - Build a synthetic `assetUrl` / `thumbnailUrl` through `roomObjectAssetUrl(config, storageKey)` so the bucket stays private.
   - Call `repository.createRoomObjectTemplate(...)` directly (bypassing the teacher-only HTTP route) with:

     ```ts
     {
       slug: buildRoomObjectTemplateSlug(`ai-${shortPrompt}`),
       displayName: shortPrompt,
       category: undefined,
       description: job.proceduralSpecJson ?? job.refinedPrompt ?? job.prompt,
       assetUrl, thumbnailUrl,
       defaultPose: { position: { x: 0, y: 1.1, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 } },
       defaultScale: 1,
       recommendedTouchPolicy: room.settings.roomObjects.defaultTouchPolicy,
       kinematic: false,
       ownerClassId: room.classId,
       visibleRoomTypes: ["free-for-all"],
       source: "ai-generated",
       license: "ai-generated",
       attribution: `Generated (${providerName}) from prompt "${prompt}"`,
       renderer: "gltf",
       exportable: true,
       fileSizeBytes: validation.fileSizeBytes,
       triangleCount: validation.triangleCount,
     }
     ```

5. Persist final job row: `status: "ready"`, `templateId`, `glbStorageKey`, `thumbnailStorageKey`, `fileSizeBytes`, `triangleCount`, `textureMaxDim`, `finishedAt`, `durationMs`. Emit `room.ai-object.ready.v1`.

**File: `apps/api/src/app.ts`**

6. Implement the download endpoint at `GET /v1/rooms/:roomId/ai-objects/jobs/:jobId/object.glb`:

   ```ts
   const job = await repository.getAiObjectJob(params.jobId);
   if (!job || job.roomId !== room.id || !job.glbStorageKey) throw notFound("Job not found");
   const object = await readStoredObject(config, { storageKey: job.glbStorageKey });
   if (!object) throw notFound("Object not found");
   const filename = aiObjectDownloadFilename(job);
   reply
     .header("Content-Type", "model/gltf-binary")
     .header("Content-Disposition", `attachment; filename="${filename}"`)
     .send(object.body);
   ```

7. Implement `POST .../jobs/:jobId/place`. Internally reuse the existing object-create handler logic so all the usual checks (room-object enable flag, active object cap, bounds clamp) still apply.

8. Implement `DELETE .../jobs/:jobId` cascade:
   - Delete placed `RoomObject` instances using this template via `repository.listRoomObjectsForRoom + delete`.
   - Delete the `RoomObjectTemplate`.
   - Delete R2 artifacts (`object.glb`, `thumbnail.png`).
   - Delete the job row.
   - Emit `room.ai-object.deleted.v1` + per-object `room.object.removed.v1` for any cascaded objects.

**File: `apps/api/src/ai-objects/retention-reaper.ts`**

9. Interval job (start in `app.ts` bootstrap alongside the meeting-notes reaper once that lands):

   - Every hour, find jobs where `finishedAt + retentionDays < now`.
   - Run the same DELETE cascade for each.

**Tests:**

10. Unit tests for `repair-pipeline.ts` against deliberately oversized fixtures (oversize triangle, oversize texture, draco-needed). Verify all three repair paths succeed.

11. API tests for download (`Content-Type`, `Content-Disposition`, byte parity with test fixture).

12. API tests for delete cascade (placed RoomObject instances disappear).

**Checkpoint:**

- [ ] `npm run test -- apps/api/tests/api.test.ts -t "ai-object"` passes.
- [ ] `npm run test -- apps/api/tests/ai-object-repair.test.ts` passes.

---

### Phase 6 — Meshy backend (optional commercial shortcut)

Goal: when `AI_OBJECT_PROVIDER=meshy`, delegate mesh generation to Meshy after Stage A produces `refinedPrompt`.

**File: `apps/api/src/ai-objects/backends/meshy.ts`**

1. Implement `meshyBackend: AiObjectGenerationBackend` with internal poll loop:
   - `POST https://api.meshy.ai/v2/text-to-3d` (`mode: "preview"`, `art_style`, `target_polycount`).
   - Poll every 3 s; emit `room.ai-object.progress.v1` on ≥ 5 pt change.
   - Optional refine pass when `aiObjectMeshyRefineTextures` / `room.settings.aiObjects.meshyRefineTextures`.
   - Download GLB + thumbnail → return bytes to orchestrator → Phase 5 validate/persist.

2. `cancel(jobId)` — best-effort Meshy cancel.

3. Timeout: `aiObjectMeshyTimeoutSec` (default 300) → `provider_timeout`.

**File: `apps/api/src/ai-objects/backends/index.ts`**

4. ```ts
   export function getGenerationBackend(config): AiObjectGenerationBackend {
     if (config.tuning.aiObjectProvider !== "meshy") return proceduralBackend;
     if (!config.tuning.meshyApiKey) throw new Error("MESHY_API_KEY required for meshy provider");
     return meshyBackend;
   }
   ```

**Orchestrator:** when provider is `meshy`, Stage A uses `prompt-composer` Meshy branch; skip `proceduralSpecJson` unless storing for audit.

**Tests:** mock `fetch` unit tests; `MESHY_INTEGRATION=true` optional E2E.

**Checkpoint:**

- [ ] `MESHY_INTEGRATION=true npm run test -- apps/api/tests/ai-object-meshy.integration.test.ts` passes (optional).

---

### Phase 7 — Web UI

Goal: right-side panel, generation lifecycle UI, in-room placement, download, 2D parity.

**File: `apps/web/lib/api.ts`**

1. Add wrappers:

   ```ts
   export function startAiObjectJob(identity, roomId, body)
   export function getAiObjectJob(identity, roomId, jobId)
   export function listAiObjectJobs(identity, roomId)
   export function patchAiObjectJob(identity, roomId, jobId, action: "cancel")
   export function deleteAiObjectJob(identity, roomId, jobId)
   export function placeAiObjectInRoom(identity, roomId, jobId, body)
   export function aiObjectDownloadUrl(roomId, jobId)
   export async function downloadAiObjectGlb(identity, roomId, jobId, filename)
   ```

   Mirror the auth + Blob + anchor-click pattern from `downloadLessonRecapCsv` (lines 517–545).

**File: `apps/web/lib/useAiObjectGenerator.ts` (new)**

2. Hook signature:

   ```ts
   export function useAiObjectGenerator(input: {
     identity: ApiIdentity;
     roomId: string | undefined;
     enabled: boolean;
   })
   ```

3. State:
   - `jobs: Record<string, AiObjectJob>` (keyed by id).
   - `loading`, `error`, `lastRefreshedAt`.

4. `refresh()` on mount + 30 s interval. Reconcile by `id`.

5. `handleRealtimeMessage()` for all six `room.ai-object.*.v1` types. Apply locally; the existing `RoomClient` realtime router forwards to this handler before generic handling.

6. Actions:
   - `startJob({ prompt, stylePreset?, complexity?, polycountTarget? })`
   - `cancelJob(jobId)`
   - `deleteJob(jobId)`
   - `placeInRoom(jobId)`
   - `downloadGlb(jobId)`

7. Derived selectors:
   - `activeJobsForCurrentUser`
   - `historyForRoom` (sorted desc by `createdAt`, limit 20)
   - `byStatus(status)`

**File: `apps/web/components/AiObjectPanel.tsx` (new)**

8. Props:

   ```ts
   {
     identity: ApiIdentity;
     roomId: string;
     currentUserId: string;
     ai: ReturnType<typeof useAiObjectGenerator>;
     participantNamesByUserId: Record<string, string>;
   }
   ```

9. Render states from PLAN § 2.1 inside `HudCard` (`defaultCollapsed`, title `"AI Object"`):
   - Idle state: textarea, style preset selector, complexity selector, `Generate object` button.
   - Active state: status text + progress bar + cancel button.
   - Ready state: thumbnail, triangle/size readout, `Place in room`, `Download .glb`, `Generate variation`, `Discard`, plus collapsible **Show build recipe** (procedural) or **Show refined prompt** (Meshy).
   - Error state: typed copy per `errorCode`.
   - History list at the bottom.

10. Disable the generate button when user is at concurrent-job cap; show inline hint "Wait for your current generation to finish first."

11. Mobile: `@media (max-width: 768px)` — fold the live preview area into a chip that opens a modal.

**File: `apps/web/components/RoomClient.tsx`**

12. Mount hook:

    ```tsx
    const aiObjects = useAiObjectGenerator({
      identity,
      roomId: session?.room.id,
      enabled: roomTypeFeatures.aiObjects && CLIENT_TUNING.enableAiObjectGeneration,
    });
    ```

13. Realtime dispatch — add `if (aiObjectRealtimeHandlerRef.current(message)) return;` near the same spot the meeting-notes handler is wired (mirror the pattern from `useDynamicWallAnchors` already in this file).

14. Insert panel in `room-hud-right` after `AnchorPanel` and before `MeetingNotesPanel`:

    ```tsx
    {roomTypeFeatures.aiObjects && CLIENT_TUNING.enableAiObjectGeneration ? (
      <AiObjectPanel
        identity={identity}
        roomId={roomId}
        currentUserId={identity.userId}
        ai={aiObjects}
        participantNamesByUserId={participantNamesByUserId}
      />
    ) : null}
    ```

15. Pass `aiGeneratingByUserId` (derived `Record<string, boolean>` from `aiObjects.activeJobsForCurrentUser` broadcast back) to `RoomView3D` / `RoomView2D` / `BlockyAvatar`.

**File: `apps/web/components/BlockyAvatar.tsx`**

16. When `aiGeneratingByUserId[participant.userId]` is true, render a small gear/spinner near the nameplate. Subtle — must not crowd the nameplate.

**File: `apps/web/components/RoomView2D.tsx`**

17. Render the same panel and the same generating indicator in the 2D layout.

**File: `apps/web/app/globals.css`**

18. Add `.ai-object-panel__*` styles co-located with `.meeting-notes-*`:
    - `.ai-object-panel__prompt` (textarea).
    - `.ai-object-panel__progress` (progress bar + status text).
    - `.ai-object-panel__history-row` (thumb + meta + actions).
    - `.ai-object-panel__recipe` (collapsible build recipe / refined prompt).
    - `.avatar-nameplate__generating-dot` (small gear icon).

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/web` passes.
- [ ] Manual: two-tab FFA room with `AI_OBJECT_USE_TEST_FIXTURE=true`, start a generation, both tabs see progress + ready, place + download work.

---

### Phase 8 — Polish, safety, E2E, rollout

**File: `apps/web/components/Lobby.tsx`**

1. Under the existing FFA consent block, append:

   > "AI-generated 3D objects placed here are room-scoped and may be downloaded by anyone in the room. Do not generate copyrighted characters or trademarked designs."

   Visible only when `CLIENT_TUNING.enableAiObjectGeneration === true`.

**Playwright: `apps/web/test/ai-object-generator.spec.ts`**

2. Serial suite (FFA room seeded via API, both flags on, `AI_OBJECT_PROVIDER=procedural`, `AI_OBJECT_USE_TEST_FIXTURE=true`):

   ```ts
   test("participant generates an object, places it, downloads it", ...)
   test("second tab sees room.ai-object.ready.v1 and history updates", ...)
   test("classroom room does not show AI Object panel", ...)
   test("quota: third concurrent job rejected with 429 quota_exceeded", ...)
   test("delete cascades placed instance and history row", ...)
   ```

3. Update `playwright.config.ts` webServer env:

   ```
   ENABLE_FREE_FOR_ALL=true
   NEXT_PUBLIC_ENABLE_FREE_FOR_ALL=true
   ENABLE_AI_OBJECT_GENERATION=true
   NEXT_PUBLIC_ENABLE_AI_OBJECT_GENERATION=true
   AI_OBJECT_PROVIDER=procedural
   AI_OBJECT_USE_TEST_FIXTURE=true
   ```

**Docs:**

4. Add an AI Object Generator section to `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md`.

5. Add deployment notes to `docs/planning/mvp/DEPLOYMENT_CHECKLIST.md`: **`OPENAI_API_KEY` required**; **`MESHY_API_KEY` optional** (only when `AI_OBJECT_PROVIDER=meshy`). OpenAI zero-data-retention org setting. Meshy: budget ~$1/generation if enabled.

6. Cross-link the feature from `docs/planning/new-features/LEARNING_FEATURE_IDEAS.md` if/when the doc is next touched (AI Object Generator is a strong sales-narrative item).

**Rollout:**

1. Land Phases 1–8 with both flags `false`. CI green.
2. Staging: enable flags + `OPENAI_API_KEY`; ship **procedural-only** first (`AI_OBJECT_PROVIDER=procedural`).
3. Optional staging pass: `AI_OBJECT_PROVIDER=meshy` + `MESHY_API_KEY` for organic-asset QA.
4. Production: flip flags on. Procedural default; Meshy only if operator opts in.

**Checkpoint:**

- [ ] `npm run test:e2e -- --grep "ai-object"` passes.
- [ ] Staging walkthrough complete with mesh quality sign-off.

---

## Files-to-touch summary

| Area | File | Phase |
|---|---|---|
| Contracts | `packages/contracts/src/index.ts` | 1 |
| OpenAPI | `packages/contracts/openapi/openapi.json` | 1 |
| API config | `apps/api/src/config.ts` | 1, 2 |
| API routes | `apps/api/src/app.ts` | 2, 5, 8 |
| API repository | `apps/api/src/repository.ts` | 2 |
| API persistence | `apps/api/src/models/mongoose.ts` | 2 |
| AI Objects module | `apps/api/src/ai-objects/*.ts` | 2–6 |
| Backends | `apps/api/src/ai-objects/backends/{procedural,meshy}.ts` | 4, 6 |
| Procedural builder | `apps/api/src/ai-objects/procedural-glb-builder.ts` | 4 |
| Repair pipeline | `apps/api/src/ai-objects/repair-pipeline.ts` | 5 |
| Reuse existing | `apps/api/src/room-objects/custom-template-upload.ts` | 5 (reuse only) |
| API tests | `apps/api/tests/api.test.ts` | 2, 5 |
| Web config | `apps/web/lib/config.ts` | 1 |
| Web API client | `apps/web/lib/api.ts` | 7 |
| Web hook | `apps/web/lib/useAiObjectGenerator.ts` | 7 (new) |
| Web realtime | `apps/web/lib/realtime.ts` | 1, 7 |
| AI Object panel | `apps/web/components/AiObjectPanel.tsx` | 7 (new) |
| Room client | `apps/web/components/RoomClient.tsx` | 7 |
| Avatars | `apps/web/components/BlockyAvatar.tsx` | 7 |
| 2D view | `apps/web/components/RoomView2D.tsx` | 7 |
| Lobby | `apps/web/components/Lobby.tsx` | 8 |
| Styles | `apps/web/app/globals.css` | 7 |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` | 1, 8 |
| Playwright | `apps/web/test/ai-object-generator.spec.ts`, `playwright.config.ts` | 8 |
| Deployment docs | `docs/planning/mvp/DEPLOYMENT_CHECKLIST.md` | 8 |
| Status docs | `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md` | 8 |
| Memory | `.cursor/memory.md` | 8 |

---

## Risks during implementation

| Risk | Mitigation |
|---|---|
| Provider GLB consistently exceeds 200k triangles even at low-poly setting | Repair pipeline auto-decimates via `meshoptimizer.simplify`. If quality collapses on decimation, mark `validation_failed` and surface the budget in the error so users can retry with a simpler prompt. |
| Provider GLB textures > 2048 px | Auto-downscale via `sharp` in repair pipeline. |
| Provider returns multi-mesh scenes | Pre-validation pass uses `@gltf-transform` to weld into a single root mesh. If structural merge fails, reject with `validation_failed`. |
| Provider returns disallowed glTF extensions | Adapter logs the extension; repair pipeline attempts conversion to `pbrMetallicRoughness` where possible (Meshy occasionally emits `KHR_materials_pbrSpecularGlossiness`). Else reject. |
| Provider latency variability (30 s – 5 min) | UI sets expectation in idle state ("typical: 1–3 minutes"). Hard timeout from env. |
| Meshy downtime | Only affects `AI_OBJECT_PROVIDER=meshy`; procedural deployments unaffected. |
| Cost runaway from a single abusive user | Per-user/day cap, per-user concurrent cap, per-room concurrent cap, all env-tunable. |
| Generated content IP exposure (school district concerns) | Feature off by default; FFA-only; lobby copy on IP responsibility; classroom never enables. |
| OpenAI refusal false positives blocking valid prompts | Logged refusal rate metric; if > 10% on benign prompts, lower Stage A strictness or disable refinement entirely via env. |
| Download proxy loads large GLBs into API memory | Stream R2 → response; reject GLBs over 15 MiB before reaching this path (already guaranteed by validation). |
| Cascade delete races with simultaneous place | DB cascade is sequential within a single delete request; placement after delete will 404 on missing template. |

---

## Open implementation questions (resolved here)

| Question | Decision |
|---|---|
| Default backend? | **`procedural`** — OpenAI composes spec, API builds GLB. No Meshy required. |
| Optional backend? | **`meshy` only** — set `AI_OBJECT_PROVIDER=meshy` + `MESHY_API_KEY`. |
| Local dev / CI without OpenAI? | **`AI_OBJECT_USE_TEST_FIXTURE=true`** — canned cube `ProceduralObjectSpec` on procedural path. |
| Permission for create / place / download / delete? | **Any current participant of the FFA room.** Matches PLAN § 9; matches FFA equality + cooperative-cleanup norms. |
| Where do AI-generated templates live? | **Room-scoped** under `ownerClassId = room.classId` and `visibleRoomTypes: ["free-for-all"]`. Deleting the room cleans them up. |
| Reuse existing teacher-only template create endpoint? | **No** — orchestrator writes directly via `repository.createRoomObjectTemplate` to bypass teacher gate. New AI HTTP endpoints enforce `assertAiObjectsEnabled` instead. |
| Reuse `validateCustomRoomObjectAsset`? | **Yes, verbatim.** Limits stay at 200k tri / 15 MiB / 2048 px. |
| Auto-repair before failing validation? | **Yes**, three passes: decimate → texture downscale → draco/meshopt. |
| Show recipe / refined prompt? | **Yes** — **Show build recipe** (procedural) or **Show refined prompt** (Meshy) on ready state. |
| Realtime channel for progress? | **Reliable** (5-pt throttle). Generation is too slow for unreliable to matter. |
| Final segment / completion delivery? | **Reliable** so late joiners hydrate from history. |
| Cancellation refund? | **No** — we eat provider cost; UI documents this on the idle state. |
| Generated GLB filename | `ai-object-<prompt-slug>-<YYYYMMDD-HHmm>.glb` (or `ai-object-<jobId>.glb` fallback). |

---

## Validation evidence (fill in after implementation)

- [ ] `npm run typecheck` — pass
- [ ] `npm test` — pass (existing + new AI-object API tests)
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "ai-object"` — pass with test fixture
- [ ] `OPENAI_INTEGRATION=true npm run test -- apps/api/tests/ai-object-prompt-refiner.integration.test.ts` — pass (optional CI secret)
- [ ] `MESHY_INTEGRATION=true npm run test -- apps/api/tests/ai-object-meshy.integration.test.ts` — pass (optional CI secret)
- [ ] `npm run test -- apps/api/tests/ai-object-repair.test.ts` — pass (decimation + texture downscale + draco)
- [ ] `npm run test:e2e -- --grep "ai-object"` — pass
- [ ] Manual staging: 3 participants generate, place, download, delete; no console errors
- [ ] Manual: classroom room does not show AI Object panel
- [ ] Manual: validation rejects deliberately oversized prompts after auto-repair attempts

---

## Dependency additions

| Package | Workspace | Purpose |
|---|---|---|
| `openai` | `apps/api` | Stage A prompt refinement (Chat Completions). Already required by AI Meeting Notes; shared client. |
| `@gltf-transform/core` | `apps/api` | Already present (used by `validateCustomRoomObjectAsset`). Reused for repair pipeline. |
| `@gltf-transform/functions` | `apps/api` | New — exposes `weld`, `simplify`, `textureResize`, `draco` transforms. |
| `meshoptimizer` | `apps/api` | Already present (used by `EXTMeshoptCompression`). Reused for `simplify`. |
| `sharp` | `apps/api` | New — texture downscale during repair. |

No new frontend dependencies required.
