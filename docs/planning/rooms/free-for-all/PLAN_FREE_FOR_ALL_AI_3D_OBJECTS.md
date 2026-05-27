# Plan — AI 3D Object Generator (Free-for-All Room Type)

Source room type: [`PLAN_FREE_FOR_ALL_ROOM.md`](./PLAN_FREE_FOR_ALL_ROOM.md)
Implementation parent: [`IMPL_FREE_FOR_ALL_ROOM.md`](./IMPL_FREE_FOR_ALL_ROOM.md)
Sibling Free-for-All feature: [`PLAN_FREE_FOR_ALL_AI_MEETING_NOTES.md`](./PLAN_FREE_FOR_ALL_AI_MEETING_NOTES.md)
Branch target: `room-types` (additive feature; lands after FFA Phase 1)
Last updated: 2026-05-27 (revised: procedural composer default; Meshy optional commercial shortcut only)

---

## 1. Overview

Add an **AI 3D Object Generator** capability to Free-for-All rooms. A participant in an FFA room can type a short prompt ("a stack of red cubes", "a stylized treasure chest", "a low-poly tree"), and the system returns a `.glb` they can place in the room and download.

**Default path (no new vendor):** OpenAI turns the prompt into a **`ProceduralObjectSpec`** — a declarative recipe of primitives, materials, and transforms — and the API **composes** that spec into a mesh server-side (same philosophy as existing procedural RoomObjects like the water molecule and Earth globe).

**Optional commercial shortcut:** When `AI_OBJECT_PROVIDER=meshy` and `MESHY_API_KEY` are set, Stage B delegates to Meshy text-to-3D for organic / photoreal props that the procedural kit cannot represent well.

The result is always:

1. Rendered in-room as a normal `RoomObject` the participant can position, scale, and rotate.
2. Available as a **downloadable `.glb`** through the same right-side panel that initiated generation.
3. Subject to the **same upload limits already enforced for custom RoomObject uploads**: ≤ 15 MiB file size, ≤ 200k triangles, ≤ 2048×2048 textures, allowlisted glTF extensions only.

The feature is **scoped to Free-for-All for v1** for the same reasons as AI Meeting Notes: classroom and workforce-training carry minor-presence/IP/policy concerns that aren't worth burning into a first cut. Free-for-All is the right beachhead — open collaboration rooms where participants already have equal permissions to place objects.

### 1.1 Product goals

1. Any participant in a Free-for-All room can craft a text prompt and ask the system to generate a 3D object.
2. **By default**, the system uses the **procedural composer** (OpenAI → spec → in-house GLB build). **Optionally**, operators can enable **Meshy** for higher-fidelity arbitrary meshes at additional cost.
3. The result must conform to the **already-configured** room object asset limits (size, triangles, texture dimensions, extension allowlist) — no new limits are introduced by this feature; both pipelines are constrained to fit existing ones.
4. The generated object can be:
   - **Placed** into the FFA room as a `RoomObject` (one-tap "Place in room" from the panel), and
   - **Downloaded** as a `.glb` to the user's device.
5. Generation is asynchronous: prompt → "generating…" with a progress indicator → result. The panel handles failure with retry guidance.
6. Cost and abuse are bounded by per-room / per-user / per-day quotas configurable via env.

### 1.2 Non-goals (Phase 1)

- Image-to-3D, sketch-to-3D, or photo-to-3D inputs (text-only in v1).
- Animated meshes / rigs / skeletons (single static mesh + materials only).
- Multi-object scenes ("a desk with a lamp and a notebook") — encouraged to be split into separate prompts.
- In-app mesh editing of generated objects beyond the existing `RoomObjectInspector` pose/scale/tint controls.
- Style transfer onto existing objects ("make this water molecule look bronze").
- Persisting AI-generated assets as **shareable community templates** outside the originating FFA room (each generated object lives scoped to the room that created it).
- Applying AI object generation to classroom or workforce-training rooms.
- Alternate text-to-3D vendors (Tripo, Luma, self-hosted Hunyuan/TRELLIS, etc.) — only `procedural` and `meshy` are supported.
- Photorealistic arbitrary meshes on the default path (use Meshy or accept procedural stylization).

---

## 2. UX surface

### 2.1 Right-side HUD panel — "AI Object"

A new `HudCard` mounts in the right-side HUD rail (`room-hud-right`) for Free-for-All rooms when the room-type feature flag `aiObjects` is true. It follows the visual idiom of `AnchorPanel`, `EnvironmentCard`, and `MeetingNotesPanel`.

**Card states:**

| State | What participants see | Available actions |
|---|---|---|
| `idle` | Prompt text area (multi-line, ~500-char cap), optional style preset (Stylized / Low-poly / Cartoon / Realistic — *Realistic* nudges toward Meshy when enabled), optional complexity (Small / Medium / Detailed). Sub-line (procedural default): "AI builds a stylized 3D object from simple shapes — best for props, furniture, and geometric forms. Download as .glb." When Meshy is enabled, add: "Enable high-detail mode uses Meshy (paid)." | **Generate object** (primary) |
| `refining` | Spinner: "Understanding your prompt…" | (Cancel) |
| `composing` | Spinner: "Building your object…" (procedural) or progress bar (Meshy). Procedural: typically 2–10 s. Meshy: 30–90 s typical; cancel best-effort; Meshy may still bill. | **Cancel** |
| `validating` | "Checking the model fits this room (≤ 200k triangles, ≤ 15 MiB, textures ≤ 2048×2048)…" | (none) |
| `ready` | Thumbnail preview + final triangle count + file size. Tabbed: **Preview** \| **Prompt history**. | **Place in room**, **Download .glb**, **Generate variation**, **Discard** |
| `error` | Inline message with reason (bad prompt, provider timeout, validation failed, quota exceeded). Distinct copy for each. | **Retry**, **Edit prompt**, **Dismiss** |

A scrollable **history list** below the prompt area shows recent generations for this room (newest first, last 20). Each row:

```
[ thumb ] "low-poly red sports car"                Place • Download • Delete
           18,400 tri • 4.2 MiB • 2026-05-27 13:47
```

The history is per-room (any participant sees and can re-place objects generated by anyone in the room — matches FFA's cooperative-cleanup norm). The original creator is shown on hover.

### 2.2 Placement flow

"Place in room" puts the generated mesh into the world as a normal `RoomObject` (existing system). The placement reuses the **existing custom-template placement path**:

1. The AI-generated GLB is materialized as a `RoomObjectTemplate` with `source: "ai-generated"` (new value), scoped to the room.
2. The template is placed via the existing `POST /v1/rooms/:roomId/objects` flow.
3. The participant then sees the object 0.5 m ahead of their avatar, can grab, move, scale, etc., exactly like a builtin object.

This deliberately routes the new feature through the existing object pipeline so it picks up grab locks, optimistic-pose sync, 2D parity, and triangle-budget enforcement at placement-time *for free*.

### 2.3 Download flow

"Download .glb" calls an authenticated `GET` that proxies the stored object from R2 with `Content-Disposition: attachment` (same pattern as `downloadLessonRecapCsv` / meeting-notes downloads). Filename:

```
ai-object-<prompt-slugified>-<YYYYMMDD-HHmm>.glb
```

Slugify: lowercase, spaces → hyphens, strip non-alphanumeric except hyphens, max 40 chars; fallback `ai-object-<jobId>.glb` if the prompt slugs to empty.

### 2.4 Generation indicator (in-world)

While a generation is in `refining`, `composing`, or `validating`, the requesting participant's avatar shows a small spinning gear icon next to their nameplate so other participants can see who is currently spending compute. This is informational only — no consent gating is needed because the prompt does not capture other participants' likeness or voice.

### 2.5 Where the panel renders

| View | Mount point |
|---|---|
| 3D | `room-hud-right` rail, after `AnchorPanel`, before `MeetingNotesPanel` (collapsed by default like the others). |
| 2D | `room-hud-right` in the 2D layout, same placement. Generation, placement, and download all work identically in 2D. |

Mobile/narrow viewports collapse history into a tap-to-expand list.

---

## 3. Architecture

### 3.1 Design principle

OpenAI does **not** expose a production "text → `.glb`" API. This feature therefore uses two **explicit** generation backends only:

| Backend | `AI_OBJECT_PROVIDER` | When to use |
|---|---|---|
| **Procedural composer** (default) | `procedural` | No Meshy account; stylized / geometric / educational props; runs on existing API infra. |
| **Meshy** (optional commercial shortcut) | `meshy` | Organic or photoreal meshes; requires `MESHY_API_KEY` and accepts per-generation cost. |

There is no Tripo adapter, no self-hosted GPU stack, and no other providers in v1.

**Shared pipeline** (both backends converge after Stage B):

```
   ┌────────────────────────────┐
   │ Stage A — Prompt → spec     │  OpenAI gpt-4.1
   │  user prompt + UI knobs     │  → ProceduralObjectSpec (procedural)
   │                             │     OR refined Meshy prompt (meshy)
   └─────────────┬──────────────┘
                 │
                 ▼
   ┌────────────────────────────┐
   │ Stage B — Generate GLB      │  procedural: compose spec → GLB + PNG thumb
   │                             │  meshy: poll Meshy API → download GLB
   └─────────────┬──────────────┘
                 │
                 ▼
   ┌────────────────────────────┐
   │ Stage C — Validation +     │  validateCustomRoomObjectAsset()
   │  optional re-compression    │  + auto-repair if over budget
   └─────────────┬──────────────┘
                 │
                 ▼
   ┌────────────────────────────┐
   │ Stage D — Persist + serve  │  R2, RoomObjectTemplate, download, realtime
   └────────────────────────────┘
```

### 3.2 Stage A — OpenAI prompt → spec (procedural default)

User prompts are usually terse ("a chest"). For the **procedural** path, OpenAI must output a **`ProceduralObjectSpec`**: a JSON recipe the server interprets — **not** executable code.

We call Chat Completions with `model = process.env.OPENAI_AI_OBJECT_COMPOSER_MODEL ?? "gpt-4.1"` and a system prompt that:

1. **Rejects** multi-object scenes, copyrighted characters, real-person likenesses, and policy violations (`rejected: true` + `rejectedReason`).
2. **Maps** the request to the **primitive vocabulary** (see § 3.3). If the user asks for something outside that vocabulary (e.g. "photorealistic sports car"), return `rejected: true` with reason `outside_procedural_scope` and suggest enabling Meshy if the deployment has it, or simplifying the prompt.
3. **Emits** a valid `ProceduralObjectSpec` with `displayName`, `parts[]`, `materials`, and optional `labels[]`.

Example spec (treasure chest):

```json
{
  "displayName": "Treasure chest",
  "style": "stylized-low-poly",
  "parts": [
    { "op": "box", "size": [1.2, 0.55, 0.75], "position": [0, 0.28, 0], "material": "wood-dark" },
    { "op": "box", "size": [1.22, 0.12, 0.77], "position": [0, 0.58, 0], "material": "wood-dark" },
    { "op": "cylinder", "radius": 0.035, "height": 0.45, "position": [-0.52, 0.5, 0.38], "rotation": [0, 0, 90], "material": "metal-brass" },
    { "op": "cylinder", "radius": 0.035, "height": 0.45, "position": [0.52, 0.5, 0.38], "rotation": [0, 0, 90], "material": "metal-brass" }
  ],
  "materials": {
    "wood-dark": { "colorHex": "#3d2817", "roughness": 0.85, "metalness": 0 },
    "metal-brass": { "colorHex": "#b5a642", "roughness": 0.4, "metalness": 0.9 }
  },
  "rejected": false,
  "rejectedReason": null
}
```

The spec is persisted on `AiObjectJob.proceduralSpecJson` for transparency ("Show build recipe" disclosure in the UI, analogous to "Show refined prompt" for Meshy).

**For the Meshy path**, Stage A instead produces the refined text prompt envelope (`refinedPrompt`, `negativePrompt`, `stylePreset`, `polycountTarget`) as in the original Meshy-oriented design — same policy rejections, but no `ProceduralObjectSpec`.

Stage A is always on when `OPENAI_API_KEY` is configured (required in production when the feature is enabled). There is no "raw prompt straight to builder" path in production.

### 3.3 Procedural primitive vocabulary (v1)

The composer may only use these ops (extensible later without new vendors):

| Op | Parameters | Notes |
|---|---|---|
| `box` | `size [x,y,z]`, `position`, `rotation?`, `material` | Axis-aligned box. |
| `sphere` | `radius`, `position`, `material` | UV sphere, low segment count by complexity preset. |
| `cylinder` | `radius`, `height`, `position`, `rotation?`, `material` | |
| `cone` | `radius`, `height`, `position`, `rotation?`, `material` | |
| `torus` | `radius`, `tube`, `position`, `rotation?`, `material` | Rings, hoops. |
| `extrude` | `profile` (2D polygon in XZ), `depth`, `position`, `material` | Simple silhouettes (star, L-shape). |
| `union` | `children: Part[]` | Merge sub-parts (max depth 2). |

**Complexity presets** control segment counts and max parts:

| Preset | Max parts | Typical triangle budget |
|---|---|---|
| `small` | 12 | ~2k–8k |
| `medium` | 24 | ~8k–25k |
| `detailed` | 40 | ~25k–80k |

Built-in **material palette** IDs (`wood-dark`, `metal-brass`, `stone-grey`, `plastic-red`, …) plus custom `{ colorHex, roughness, metalness }` entries in `materials`.

The server implements composition in `apps/api/src/ai-objects/procedural-glb-builder.ts` using `@gltf-transform` (and optionally `three` headless only if needed — prefer gltf-transform-only to avoid a second 3D runtime). It also renders a **PNG thumbnail** (simple orthographic snapshot or flat icon composite).

This mirrors how `roomObjectProcedurals/` builds district-demo manipulatives in React, but runs **once on the server** to produce a portable `.glb` for download and `renderer: "gltf"` templates.

### 3.4 Stage B — Procedural composer (default)

When `AI_OBJECT_PROVIDER=procedural` (default):

1. Validate `ProceduralObjectSpec` against a Zod schema (max parts, numeric bounds, known ops).
2. Run `buildGlbFromProceduralSpec(spec)` → `{ glbBytes, thumbnailBytes, triangleCount }`.
3. Transition job `composing → validating` (typically &lt; 10 s).

No external API besides OpenAI in Stage A. **No Meshy key required** for production when staying on procedural.

### 3.5 Stage B — Meshy (optional commercial shortcut)

When `AI_OBJECT_PROVIDER=meshy` and `MESHY_API_KEY` is set:

1. Stage A outputs `refinedPrompt` / `negativePrompt` (not `ProceduralObjectSpec`).
2. `POST https://api.meshy.ai/v2/text-to-3d` with `mode: "preview"`, art style from UI preset, `target_polycount` from complexity.
3. Poll until `SUCCEEDED`; optionally run Meshy **refine** pass when `AI_OBJECT_MESHY_REFINE_TEXTURES=true` (default on for Meshy only).
4. Download GLB + thumbnail from Meshy URLs → Stage C.

Meshy is **not** required for the feature to ship. Deployments that omit `MESHY_API_KEY` run procedural-only.

### 3.6 Stage C — Validation + optional decimation

Reuse the existing `apps/api/src/room-objects/custom-template-upload.ts::validateCustomRoomObjectAsset()` function for parity with manual uploads. It already enforces:

- File size ≤ `room.settings.roomObjects.maxUploadSizeBytes` (default 15 MiB).
- Triangle count ≤ `ROOM_OBJECT_MAX_TRIANGLES` (currently 200,000).
- Texture dimensions ≤ 2048×2048.
- Allowlisted glTF extensions only.
- No external buffer/image URIs (all embedded).

Procedural output is built within triangle budgets; Meshy output may need repair. When validation fails, the orchestrator attempts an automatic re-compression pass before failing:

1. **Triangle over-budget** → run `@gltf-transform` `weld` + `simplify` (meshoptimizer) targeting `min(ROOM_OBJECT_MAX_TRIANGLES, polycountTarget * 1.2)`, then re-validate.
2. **Texture over-budget** → downscale textures to 2048×2048 using `sharp` or `@gltf-transform` `textureResize`.
3. **Disallowed extensions** → if `KHR_materials_pbrSpecularGlossiness` or other unsupported extensions are present, attempt conversion to `pbrMetallicRoughness` via `@gltf-transform` if a clean transform exists; otherwise reject.
4. **File size over-budget after texture downscale** → run `KHR_draco_mesh_compression` or `EXT_meshopt_compression`, re-validate.
5. If all repair attempts fail, mark the job `error` with reason `validation_failed` and a clear message ("The model came back too detailed for this room — try simpler / lower-poly wording").

Re-compression is **server-side only**; the client never sees the raw GLB before validation.

Meshy outputs use the same repair path when over budget; procedural outputs rarely need it because triangle caps are enforced at compose time.

### 3.7 Stage D — Persist, register, broadcast

On success:

1. The final validated GLB is uploaded to R2 under:

   ```
   {AI_OBJECT_STORAGE_PREFIX}{roomId}/{jobId}/object.glb
   {AI_OBJECT_STORAGE_PREFIX}{roomId}/{jobId}/thumbnail.png
   ```

   (`AI_OBJECT_STORAGE_PREFIX` defaults to `ai-objects/`.)

2. A `RoomObjectTemplate` row is created with `source: "ai-generated"`, `visibleRoomTypes: ["free-for-all"]`, `ownerClassId` set to the FFA room's class, `assetUrl` / `thumbnailUrl` pointing to the proxied asset endpoint (same pattern as custom uploads, so the bucket can stay private).

3. An `AiObjectJob` row (see § 4.3) is updated to `status: "ready"` and linked to the new template.

4. A reliable realtime message `room.ai-object.ready.v1` broadcasts the job + template to all participants in the room so the history list updates everywhere live.

5. The downloading endpoint is now active for everyone in the room.

The participant who initiated generation can immediately tap **Place in room** which goes through the normal `POST /v1/rooms/:roomId/objects` flow with the new template id.

### 3.8 Generation backend interface

Only two implementations:

```ts
interface AiObjectGenerationBackend {
  readonly name: "procedural" | "meshy";
  generate(input: StageAOutput): Promise<{ glbBytes: Buffer; thumbnailBytes: Buffer; triangleCount: number }>;
  cancel?(jobId: string): Promise<void>;  // meaningful for meshy only
}
```

- `procedural` — synchronous compose from `ProceduralObjectSpec`.
- `meshy` — async poll loop; implements `cancel`.

Registry: `getGenerationBackend(config)` returns one of the above. No other backends.

---

## 4. Data and API model

### 4.1 Room-type feature flag

Extend `RoomTypeFeatureFlags` (in `packages/contracts/src/index.ts`) with:

```ts
aiObjects: boolean;
```

Default `false` in `CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` and `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS`. Set `true` only in `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS`.

### 4.2 Room settings

Add `aiObjects` to `RoomSettingsSchema`:

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
})
```

These are room-level defaults. The job runtime lives in `AiObjectJob` (next).

### 4.3 New entities

#### `AiObjectJob`

```ts
{
  id: string;
  roomId: string;
  requestedByUserId: string;
  prompt: string;                 // user's original prompt, untouched
  proceduralSpecJson?: string;    // serialized ProceduralObjectSpec (procedural path)
  refinedPrompt?: string;         // Meshy path only — post-Stage-A text prompt
  negativePrompt?: string;        // Meshy path only
  stylePreset?: "realistic" | "stylized-low-poly" | "cartoon" | "sculpture";
  complexity?: "small" | "medium" | "detailed";
  polycountTarget?: number;
  status: "queued" | "refining" | "composing" | "validating" | "ready" | "error" | "cancelled" | "rejected";
  providerName: "procedural" | "meshy";
  providerJobId?: string;         // Meshy only
  providerProgressPercent?: number; // Meshy only
  errorCode?:
    | "prompt_rejected"
    | "provider_timeout"
    | "provider_error"
    | "validation_failed"
    | "quota_exceeded"
    | "internal";
  errorMessage?: string;
  templateId?: string;            // RoomObjectTemplate.id on success
  glbStorageKey?: string;
  thumbnailStorageKey?: string;
  fileSizeBytes?: number;
  triangleCount?: number;
  textureMaxDim?: number;
  startedAt: string;              // ISO 8601
  finishedAt?: string;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
}
```

Indexes:

- `AiObjectJob { roomId: 1, createdAt: -1 }` for history listing.
- `AiObjectJob { requestedByUserId: 1, createdAt: -1 }` for per-user quota counting.
- `AiObjectJob { status: 1, updatedAt: 1 }` for the in-progress reaper.

### 4.4 REST endpoints

All endpoints are scoped to the room. Caller must be a current participant of the FFA room. There is no teacher gate (FFA equality model).

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/rooms/:roomId/ai-objects/jobs` | Start a new generation job. Body: `{ prompt, stylePreset?, complexity?, polycountTarget? }`. Returns `AiObjectJob`. Enforces room and per-user quotas. |
| `GET` | `/v1/rooms/:roomId/ai-objects/jobs` | List recent jobs for this room (default limit 20, ordered newest-first). |
| `GET` | `/v1/rooms/:roomId/ai-objects/jobs/:jobId` | Fetch a single job's state (used by polling clients during generation). |
| `PATCH` | `/v1/rooms/:roomId/ai-objects/jobs/:jobId` | Body `{ action: "cancel" }`. Best-effort cancel; ignored once the provider has billed. |
| `DELETE` | `/v1/rooms/:roomId/ai-objects/jobs/:jobId` | Delete a job, its R2 artifacts, and its `RoomObjectTemplate`. Allowed for the job's creator or any participant currently in the room (FFA cooperative cleanup). Existing placed objects derived from that template are also removed (cascade). |
| `GET` | `/v1/rooms/:roomId/ai-objects/jobs/:jobId/object.glb` | Authenticated GLB download; `Content-Disposition: attachment; filename="..."`. |
| `POST` | `/v1/rooms/:roomId/ai-objects/jobs/:jobId/place` | Convenience action: create a `RoomObject` from this job's template at the requester's position. Equivalent to clients calling the existing `POST /v1/rooms/:roomId/objects` directly with the AI template id. |

The `place` endpoint is provided so the panel can do single-tap placement without first reading the template id (and so failure recovery — placement fails after a successful generation — is one round-trip).

### 4.5 Realtime events

Reliable channel (state — must hydrate late joiners):

- `room.ai-object.started.v1` — `{ jobId, requestedByUserId, prompt, startedAt }`
- `room.ai-object.progress.v1` — `{ jobId, status, providerProgressPercent? }`
- `room.ai-object.ready.v1` — `{ jobId, templateId, fileSizeBytes, triangleCount, thumbnailUrl }`
- `room.ai-object.error.v1` — `{ jobId, errorCode, errorMessage }`
- `room.ai-object.cancelled.v1` — `{ jobId }`
- `room.ai-object.deleted.v1` — `{ jobId, templateId }`

Unreliable channel: none in v1 (generation is too slow to benefit from sub-second progress streaming; reliable progress events every few seconds is plenty).

---

## 5. Environment variables

Added in this feature (root `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` as appropriate):

```
# --- AI 3D Object Generator (Free-for-All) ---
ENABLE_AI_OBJECT_GENERATION=false
NEXT_PUBLIC_ENABLE_AI_OBJECT_GENERATION=false

# Generation backend: procedural (default, no Meshy) | meshy (commercial shortcut)
AI_OBJECT_PROVIDER=procedural

# Meshy — only when AI_OBJECT_PROVIDER=meshy
MESHY_API_KEY=

# Stage A — OpenAI composer (required when feature is on)
OPENAI_AI_OBJECT_COMPOSER_MODEL=gpt-4.1
# OPENAI_AI_OBJECT_COMPOSER_MODEL=gpt-4.1-mini

# Meshy-only: two-step preview → refine texture pass
AI_OBJECT_MESHY_REFINE_TEXTURES=true

# Object storage prefix for generated GLBs + thumbnails
AI_OBJECT_STORAGE_PREFIX=ai-objects/

# Cost/abuse bounds (also enforced per-room via room.settings.aiObjects)
AI_OBJECT_MAX_PROMPT_CHARS=500
AI_OBJECT_MESHY_TIMEOUT_SEC=300
AI_OBJECT_MAX_JOBS_PER_USER_PER_DAY=20

# Retention: AI-generated GLBs older than this are pruned along with their templates.
AI_OBJECT_RETENTION_DAYS=30
```

Strict env validation when `ENABLE_AI_OBJECT_GENERATION=true` in production:

- **`OPENAI_API_KEY`** — always required (Stage A for both backends).
- **`MESHY_API_KEY`** — required only when `AI_OBJECT_PROVIDER=meshy`.

`OPENAI_API_KEY` is shared with AI Meeting Notes when that feature is enabled.

---

## 6. Phased implementation

### Phase 1 — Contracts + feature flags

- Add `aiObjects` to `RoomTypeFeatureFlags`; turn on only for `"free-for-all"`.
- Add `RoomSettings.aiObjects` defaults.
- Add `AiObjectJobSchema` and its status enum to contracts.
- Add the six realtime message schemas.
- Extend `RoomObjectTemplateSourceSchema` with `"ai-generated"`.
- Add env templates and `CLIENT_TUNING.enableAiObjectGeneration`.

### Phase 2 — API: job lifecycle (canned procedural fixture)

- Mongoose model + memory-repository impls for `AiObjectJob`.
- REST endpoints from § 4.4 with procedural backend using a **fixed canned `ProceduralObjectSpec`** (unit cube) when `NODE_ENV=test` or `AI_OBJECT_USE_TEST_FIXTURE=true` — no OpenAI, no Meshy.
- Reliable-channel `room.ai-object.*.v1` realtime messages.
- API tests: start → poll → place → download → delete; quota enforcement; non-FFA-room 403; double-cancel idempotent; non-participant 403.

### Phase 3 — Stage A: OpenAI → `ProceduralObjectSpec` (and Meshy prompt when applicable)

- `apps/api/src/ai-objects/prompt-composer.ts` — Chat Completions with system prompt from § 3.2–3.3.
- Zod schema for `ProceduralObjectSpec`; rejections → `422 prompt_rejected`.
- Unit tests: multi-object, copyright, `outside_procedural_scope`, valid chest/tree specs.

### Phase 4 — Procedural GLB builder (default backend)

- `procedural-glb-builder.ts` — compose primitives → `.glb` + PNG thumbnail.
- `procedural-spec-schema.ts` — vocabulary validation, part caps per complexity.
- Orchestrator: `refining → composing → validating` on procedural path (seconds, not minutes).

### Phase 5 — Stage C validation + Stage D persistence

- Reuse `validateCustomRoomObjectAsset()` from `apps/api/src/room-objects/custom-template-upload.ts`.
- Auto-repair pipeline: decimate-to-budget, texture downscale, draco/meshopt compression.
- On success, create the `RoomObjectTemplate` with `source: "ai-generated"` and write final artifacts to `{AI_OBJECT_STORAGE_PREFIX}{roomId}/{jobId}/`.
- Implement the download proxy endpoint.
- Implement the `place` convenience endpoint.
- Retention reaper: delete `AiObjectJob`s and their R2 artifacts + templates older than `AI_OBJECT_RETENTION_DAYS`.

### Phase 6 — Meshy backend (optional commercial shortcut)

- `apps/api/src/ai-objects/backends/meshy.ts` — poll Meshy text-to-3D; only loaded when `AI_OBJECT_PROVIDER=meshy`.
- `prompt-composer.ts` Meshy branch: outputs `refinedPrompt` instead of `ProceduralObjectSpec`.
- Integration test gated behind `MESHY_INTEGRATION=true`.
- UI: show "High detail (Meshy)" toggle only when deployment has `allowMeshy` / Meshy configured.

### Phase 7 — Web UI

- `apps/web/lib/api.ts` wrappers; `useAiObjectGenerator` hook; `AiObjectPanel.tsx` (states § 2.1).
- Copy distinguishes procedural (default) vs Meshy; collapsible **Show build recipe** / **Show refined prompt**.
- 2D parity; E2E with test fixture (`AI_OBJECT_USE_TEST_FIXTURE=true`).

### Phase 8 — Polish, safety, rollout

- Per-room quota counters + UI surfacing (`quota_exceeded` error copy).
- Prompt-history pagination; `outside_procedural_scope` error copy with Meshy hint when allowed.
- Staging: procedural-only first; enable Meshy on staging only for quality comparison.
- DEPLOYMENT_CHECKLIST.md: `OPENAI_API_KEY` required; `MESHY_API_KEY` optional.

---

## 7. Limits, safety, abuse controls

| Concern | Control |
|---|---|
| Triangle bomb (model too detailed) | Same `ROOM_OBJECT_MAX_TRIANGLES = 200_000` cap. Auto-decimation pass before failing. |
| File size bomb | `room.settings.roomObjects.maxUploadSizeBytes` (default 15 MiB) reused. Auto draco/meshopt pass before failing. |
| Texture bomb | `ROOM_OBJECT_MAX_TEXTURE_DIMENSION = 2048` reused. Auto-downscale before failing. |
| Prompt-injection / policy violation | Stage A composer enforces rejection categories. Meshy adds its own filter when used. |
| Cost runaway | Per-room concurrent cap (3), per-user concurrent cap (1), per-user/day cap (20). Procedural path: OpenAI tokens only. Meshy path: per-generation billing — gate behind `allowMeshy`. |
| Storage runaway | 30-day retention reaper deletes both the job row and its R2 artifacts. |
| Meshy downtime | Only affects `AI_OBJECT_PROVIDER=meshy` deployments; procedural unaffected. |
| Procedural scope mismatch | `outside_procedural_scope` rejection with clear copy; offer Meshy toggle when enabled. |
| Generated-asset IP | UI copy: do not recreate copyrighted characters. Meshy deployments add Meshy ToS note. |
| FERPA / minor presence | Feature off in classroom and workforce-training room types entirely. |

The feature inherits **all** the existing custom-RoomObject upload safeguards rather than introducing a parallel set; this is the most important design discipline of the feature.

---

## 8. Failure modes and mitigations

| Failure | Mitigation |
|---|---|
| OpenAI composer returns invalid JSON | Retry once with schema reminder; on second failure, mark `internal` — do not guess a spec. |
| Spec references unknown op or material | Zod validation → `prompt_rejected` with "couldn't build that shape — try simpler wording." |
| Meshy rejects the prompt | Surface Meshy reason in panel; edit-and-retry. |
| Meshy returns multi-mesh scene | `@gltf-transform` weld to single root; else `validation_failed`. |
| Meshy returns mesh > 200k tri | Auto-decimate; procedural path rarely hits this. |
| User asks for photoreal organic asset on procedural-only deploy | `outside_procedural_scope` with hint to enable Meshy or simplify. |
| Meshy job stuck | `AI_OBJECT_MESHY_TIMEOUT_SEC` (default 300 s) → `provider_timeout`. |
| User cancels mid-generation | Procedural: immediate `cancelled`. Meshy: best-effort cancel; may still bill (documented in UI). |
| Participant leaves room mid-generation | Job continues server-side; result appears in history list when they return (or anyone else in the room sees it live). |
| R2 upload failure | Backoff + retry; on permanent failure, mark `error` with `internal` code; provider artifact preserved for retry from temp prefix. |
| Mass-generation abuse from one user | Per-user-per-day quota + lockout if exceeded; admins can override via raised env defaults. |

---

## 9. Technical decisions

| Decision | Choice | Rationale |
|---|---|---|
| Default backend | **Procedural composer** (OpenAI → spec → in-house GLB) | No new vendor; runs on existing API; aligns with procedural RoomObject patterns; good for stylized/edu props. |
| Optional backend | **Meshy only** | Commercial shortcut for organic/photoreal meshes; explicit opt-in via `AI_OBJECT_PROVIDER=meshy`. |
| Other providers | **None in v1** | No Tripo, self-hosted, or Shap-E paths — reduces ops and doc drift. |
| Pipeline shape | OpenAI Stage A → backend-specific Stage B → shared validate/persist | OpenAI does not emit GLBs; procedural composes; Meshy delegates mesh AI. |
| Input modality | Text prompt only (v1) | Smallest viable surface. |
| Limits | Reuse existing `validateCustomRoomObjectAsset` (200k tri / 15 MiB / 2048 px / allowlist) | The feature must adhere to limits already set in the project — same as the user's directive. Avoids forking quality bars. |
| Over-budget handling | Server-side auto-decimation + texture downscale + draco/meshopt | High success rate without forcing users to learn 3D-asset triage. |
| Placement | Reuse `RoomObjectTemplate` + `RoomObject` flow with new `source: "ai-generated"` | Free re-use of grab locks, optimistic pose, 2D parity, triangle enforcement. |
| Download | Authenticated proxy through API (not signed CDN URL) | Keeps bucket private; consistent with `roomObjectAssetUrl()` pattern. |
| Who can generate/place/download/delete | Any current participant of the FFA room | Matches FFA equality model and cooperative cleanup norm. |
| Room-type scope | Free-for-All only in v1 | Avoids classroom/FERPA/IP review for first release. |
| Persistence scope | AI-generated templates are room-scoped, not org-wide | Generated content lives with the room that created it; deleting the room removes its AI templates. |
| Feature flag | Dual: `ENABLE_AI_OBJECT_GENERATION` env + `roomTypeFeatures.aiObjects` | Matches AI Meeting Notes double-gate pattern; safe rollout. |
| Cost guardrails | Room + per-user + per-day caps | Bounds OpenAI token use (procedural) and Meshy spend (optional). |

---

## 10. Open questions

1. Should generated objects be downloadable by anyone currently in the room, or creator-only? Plan: anyone in the room.
2. Should we offer "Generate variation" in v1 (re-run same spec with perturbed params / new Meshy seed)? Defer unless needed.
3. Should the panel expose a per-request **"Use Meshy (high detail)"** toggle when `allowMeshy`, or is env-level `AI_OBJECT_PROVIDER=meshy` enough? Plan: env-level for v1; per-request toggle is Phase 8.
4. Do we offer "save to my library" cross-room? Plan defers (room-scoped only).
5. Should we expose **Show build recipe** (`proceduralSpecJson`) and **Show refined prompt** (Meshy) on the ready state? Plan: yes, both collapsible.
6. Long-tail: expand primitive vocabulary (`lathe`, `text extrude`) before adding any new vendor?

---

## 11. Relationship to existing planning

```
Room Types
├── Classroom            (existing, AI Object Generator: off)
├── Workforce Training   (existing, AI Object Generator: off)
└── Free-for-All
       │
       ├── AI Meeting Notes        (planned, sibling feature)
       └── AI 3D Object Generator  (this plan)
              ├── default: procedural composer (OpenAI → ProceduralObjectSpec → GLB)
              ├── optional: Meshy commercial shortcut (AI_OBJECT_PROVIDER=meshy)
              ├── new RoomTypeFeatureFlags.aiObjects
              ├── new RoomSettings.aiObjects
              ├── new AiObjectJob entity (+ proceduralSpecJson)
              ├── new /v1/rooms/:roomId/ai-objects/* REST surface
              ├── new room.ai-object.*.v1 realtime messages
              ├── new RoomObjectTemplate.source = "ai-generated"
              ├── reuses validateCustomRoomObjectAsset() limits
              ├── reuses RoomObject placement + grab/move pipeline
              └── new AiObjectPanel right-side HUD card (3D + 2D)
```

This plan is fully additive. It does not change FFA Phase 1, AI Meeting Notes, or classroom/workforce-training behavior, and lives behind its own feature flag for staged rollout. The paired `IMPL_FREE_FOR_ALL_AI_3D_OBJECTS.md` maps each phase above to concrete files in the `room-types` branch.
