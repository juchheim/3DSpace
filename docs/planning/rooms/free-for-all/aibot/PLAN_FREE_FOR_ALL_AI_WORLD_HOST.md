# Plan — AI World Host (Free-for-All Room Type)

Source room type: [`../PLAN_FREE_FOR_ALL_ROOM.md`](../PLAN_FREE_FOR_ALL_ROOM.md)
Implementation: [`./IMPL_FREE_FOR_ALL_AI_WORLD_HOST.md`](./IMPL_FREE_FOR_ALL_AI_WORLD_HOST.md)
World-building context: [`../world-building/PLAN_FREE_FOR_ALL_WORLD_BUILDING.md`](../world-building/PLAN_FREE_FOR_ALL_WORLD_BUILDING.md)
Brainstorm: [`../../../new-features/ROOM_TYPE_FEATURE_IDEAS.md`](../../../new-features/ROOM_TYPE_FEATURE_IDEAS.md) §3.4
Branch target: `feature/ffa-ai-world-host` (additive; lands after FFA Phase 1 + world building)
Last updated: 2026-06-01

---

## 1. Overview

Add an **AI World Host** to Free-for-All rooms: a persistent, **user-named** NPC with a **colorful retro-robot** 3D avatar that participants can talk to from a right-side HUD panel. The host has two jobs:

1. **World-building tutor** — answers natural-language questions like “How do I place a ramp?”, “What’s undo?”, “Why can’t I build here?” using a curated knowledge base of 3DSpace build controls and rules, optionally informed by **live room context** (build piece count, whether build mode is on, recent rejection reasons).
2. **File study companion** — participants **upload documents** that persist in the room until deleted; the host converses about the **extracted text** of those files, teaching and quizzing the uploader in a private chat thread.

The bot is **visible to everyone** in the 3D room (position, name, idle/thinking animation). **Chat is private per participant** in v1 — others see the robot’s state but not another user’s messages or file Q&A (important for study notes and HR docs).

Scoped to **Free-for-All** for v1 (same rationale as AI Meeting Notes and AI Objects: equal permissions, no minor/FERPA lesson-recording policy on day one).

### 1.1 Product goals

| # | Goal |
| --- | --- |
| G1 | Any participant can **summon** one AI World Host per room (if none exists), **name** it (3–24 characters), and **reposition** it in the world. |
| G2 | The host renders as a **distinct retro-robot** avatar (not a recolored human `BlockyAvatar`) with personality in silhouette, color, and motion. |
| G3 | **Build Help** tab: accurate, concise answers grounded in shipped world-building UX (tools, shortcuts, caps, stamps, undo, boards-on-walls). |
| G4 | **Study Files** tab: upload → persist → extract text → chat about content until the user deletes the file. |
| G5 | Uploaded files and extracted text **persist with the room** across sessions until explicitly deleted (by uploader or any participant, FFA cleanup norm). |
| G6 | Cost and abuse bounded via env-tunable per-room file caps, per-user message rate limits, and daily LLM spend guardrails. |

### 1.2 Non-goals (Phase 1)

- Classroom, workforce-training, or escape-room room types.
- Voice input/output (text panel only; TTS is a follow-up).
- The robot **walking**, pathfinding, or following players (fixed position; optional slow idle rotation only).
- **Shared/public** chat where the whole room sees one Q&A thread (private threads only in v1).
- Upload of audio/video for transcription (documents only).
- The host **placing build pieces** or mutating the world via tools (advice only).
- AI-generated 3D props (separate AI Objects feature).
- Multi-host rooms (exactly **one** host per room in v1).

---

## 2. UX

### 2.1 Summoning and naming

**First summon (no host in room):**

- Right-side HUD card **“World Host”** shows: “No guide in this room yet.” + **Summon guide** (primary).
- Click opens a small modal: **Name your guide** (text input, default `Chip`), preview silhouette of the retro robot, **Place here** (uses avatar’s current XZ + ground Y) or **Place at hub** (central square default).
- On confirm: API creates `RoomAiHost`, broadcasts position + name; robot appears in 3D/2D.

**When host already exists:**

- Card shows the bot’s **display name**, **Reposition** (enter placement mode: ghost at feet, click ground to commit), **Rename** (any participant), **Dismiss guide** (confirm; removes host + optional “keep files?” checkbox defaulting to keep files).

Naming rules: `3–24` chars, Unicode letters/numbers/spaces/hyphens, trimmed, profanity filter optional (server-side basic blocklist in v1).

### 2.2 Right-side HUD — `WorldHostPanel`

Mounts in `room-hud-right` when `roomTypeFeatures.aiWorldHost && CLIENT_TUNING.enableAiWorldHost`. Collapsed by default like other cards.

**Tabs:**

| Tab | Purpose |
| --- | --- |
| **Build Help** | Free-text ask + suggested chips (“How do I undo?”, “Place a wall”, “Boards on build walls”, “Why was build rejected?”). Streaming reply in panel. |
| **Study Files** | File list (name, size, uploader, date), **Upload**, per-file **Chat** / **Delete**. Active file chat opens inline below list. |

**3D affordances while chatting:**

- Clicking the robot in 3D opens/focuses the panel (same as clicking the HUD card).
- **Speech bubble** (`<Html>` billboard) above the robot shows the **last assistant reply** for **that viewer only** (truncated ~120 chars + “…”); full text in panel.
- **Thinking state:** emissive eyes cycle cyan→magenta; antenna tips pulse; panel shows typing indicator.

**2D analog:** Robot shown as a distinct icon on the map at host position; same panel in `room-hud-right`.

### 2.3 File upload UX

1. User picks file (`.pdf`, `.txt`, `.md` in v1).
2. Client requests `POST .../ai-host/files/upload-target` → presigned PUT to R2.
3. Client uploads, then `POST .../ai-host/files` to register + queue extraction.
4. List shows `processing` → `ready` | `failed` (with retry).
5. **Chat** enabled only when `ready`. Deletion requires confirm; removes DB row + R2 objects + extracted text chunks.

### 2.4 Empty / error states

| State | Copy / action |
| --- | --- |
| No host | Summon CTA (§2.1) |
| Build help, LLM down | “Guide is taking a break. Try again in a moment.” |
| File too large | Inline limit from settings |
| Extraction failed | “Couldn’t read this file. Try .txt or .md, or a simpler PDF.” |
| Rate limited | “Slow down — you can send another message in N seconds.” |

---

## 3. Retro-robot avatar (art direction + behavior)

The host **must not** reuse `BlockyAvatar` (humanoid rig). It gets a dedicated **`RetroRobotHostAvatar`** R3F component: procedural box/cylinder geometry, emissive accents, no external glTF in v1.

### 3.1 Silhouette and personality

- **Chunky torso** (~0.9 m wide × 0.7 m deep × 0.8 m tall) with a **rounded “CRT chest screen”** inset (dark glass + faint scanline emissive).
- **Head** = squat cube + **V-shaped brow** + two **round LED eyes** (large, expressive).
- **Antenna** on head with a **ball tip** (primary idle motion).
- **Arms** = segmented tubes (upper + forearm + claw hand); asymmetric rest pose (one hand slightly raised = “ready to help”).
- **Base** = short **tread housing** or stub legs (0.3 m) so total height ≈ **1.75 m** (eye line similar to human avatars for speech bubbles).
- **Personality read:** friendly museum guide from a 1980s sci-fi poster — **not** menacing, not corporate glossy.

### 3.2 Color palette (defaults; no user recolor in v1)

| Part | Color | Notes |
| --- | --- | --- |
| Main body | `#3ECFCC` (teal) | Slightly weathered; metalness 0.4 |
| Accents / trim | `#FF6B4A` (coral) | Shoulder caps, knee bands |
| Secondary | `#FFD166` (warm yellow) | Chest trim, antenna tip |
| Dark panels | `#2D3142` | Screen bezel, treads |
| Eyes (idle) | `#7DF9FF` (cyan emissive) | |
| Eyes (thinking) | `#FF4FD8` (magenta emissive) | Pulse 1.2 Hz |
| Eyes (speaking) | alternates cyan/yellow | Soft blink every 3–4 s |

### 3.3 Animation (procedural, `useFrame`)

| State | Motion |
| --- | --- |
| `idle` | Body bob ±0.04 m @ 1.5 Hz; antenna sway ±8°; slow claw open/close |
| `thinking` | Faster eye emissive pulse; chest screen scroll emissive; slight head tilt |
| `speaking` | Subtle head nod on word boundaries (noise-driven, not phoneme-accurate) |
| `placement-ghost` | 50% opacity, cyan wireframe outline, bobs in place |

### 3.4 Interaction hit target

Invisible **capsule** (~0.6 m radius, 1.8 m tall) for raycast “talk to guide.” Nameplate: **user-chosen name** + small “AI guide” subtitle (muted).

---

## 4. Architecture

### 4.1 High-level diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  FFA Room (3D)                                                  │
│  RetroRobotHostAvatar ← position/name from RoomAiHost           │
│  WorldHostPanel (Build Help | Study Files)                      │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ REST + SSE                     │ presigned upload
                ▼                                ▼
┌───────────────────────────┐          ┌─────────────────────┐
│  API: ai-host module      │          │  R2                  │
│  · host CRUD              │          │  · raw files         │
│  · chat (stream)          │          │  · extracted .txt    │
│  · file register/delete   │          └─────────────────────┘
│  · text extraction worker │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐          ┌─────────────────────┐
│  MongoDB                  │          │  OpenAI Chat         │
│  · RoomAiHost             │─────────►│  gpt-4.1-mini (default)│
│  · RoomAiHostFile         │          │  + build corpus      │
│  · RoomAiHostChatMessage  │          │  + file chunks (RAG) │
└───────────────────────────┘          └─────────────────────┘
            │
            │ reliable: room.ai-host.updated.v1
            ▼
┌───────────────────────────┐
│  LiveKit data channel      │
└───────────────────────────┘
```

### 4.2 World-building tutor — knowledge strategy

**Static corpus (v1):** At API build time, bundle a **single markdown corpus** compiled from:

- World-building PLAN/IMPL “how to play” sections (tools 1–7, rotate, drag-paint, undo, stamps, caps).
- `BuildControls` coachmark text and rejection reason strings from `isBuildAllowedAt`.
- FAQ entries for boards-on-build-walls, destroy policy, clear-all.

Store as `apps/api/src/ai-host/corpus/world-building-guide.md` (maintained manually when build UX changes). Inject into the system prompt; target **< 12k tokens**.

**Dynamic context (per request):** Optional JSON snapshot the client sends:

```ts
{
  buildModeEnabled: boolean;
  selectedTool: string | null;
  pieceCount: number;
  lastBuildRejectionReason: string | null; // from placement UI
}
```

The model is instructed to **prefer corpus facts**, cite controls by key (`Press 3 for Ramp`), and **never invent** piece types that are not shipped.

### 4.3 File study — extraction and RAG

| Stage | Behavior |
| --- | --- |
| Upload | Max size/count from `RoomSettings.aiWorldHost` |
| Extract | `.txt`/`.md` direct; `.pdf` via `pdf-parse` (or equivalent) server-side |
| Chunk | ~800-token chunks, 100-token overlap, store in `RoomAiHostFileChunk` |
| Chat | On message, retrieve top-k chunks (k=6) from **selected file only** via keyword + simple embedding optional in v2; v1 **keyword/BM25-lite** ok |
| Teach | System prompt: Socratic tutor — summarize, quiz, check understanding, cite file sections |

**Privacy:** Extracted text never sent to other users’ clients; only visible through own chat. API never logs full document body in application logs.

### 4.4 Model selection

| Use | Model | Why |
| --- | --- | --- |
| Build help + file chat (default) | **`gpt-4.1-mini`** | Fast, cheap, good instruction-following |
| Long PDF / complex doc | **`gpt-4.1`** | Optional when `AI_WORLD_HOST_USE_FULL_MODEL=true` or file > N pages |

Env: `OPENAI_AI_HOST_MODEL`, `OPENAI_AI_HOST_MODEL_LARGE`. Reuse existing `OPENAI_API_KEY`.

Streaming: SSE (`text/event-stream`) from `POST .../chat` with `Accept: text/event-stream`.

---

## 5. Data and API model

### 5.1 Room-type feature flag

```ts
// RoomTypeFeatureFlags
aiWorldHost: boolean;
```

`true` only for `free-for-all`. Default `false` elsewhere.

### 5.2 Room settings

```ts
aiWorldHost: z.object({
  enabled: z.boolean().default(true),
  maxFilesPerRoom: z.number().int().positive().max(50).default(10),
  maxFileSizeBytes: z.number().int().positive().max(20_000_000).default(5_000_000),
  maxMessagesPerUserPerHour: z.number().int().positive().max(500).default(60),
  maxContextMessages: z.number().int().positive().max(50).default(20),
  allowedMimeTypes: z.array(z.string()).default([
    "application/pdf",
    "text/plain",
    "text/markdown",
  ]),
}).default({ ... }),
```

### 5.3 Entities

#### `RoomAiHost` (one per room)

```ts
{
  id: string;
  roomId: string;
  displayName: string;           // user-chosen
  position: { x: number; y: number; z: number };
  rotationY: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}
```

Unique index: `{ roomId: 1 }` (enforces one host).

#### `RoomAiHostFile`

```ts
{
  id: string;
  roomId: string;
  uploadedByUserId: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;            // R2 raw
  extractedTextStorageKey?: string;
  status: "uploading" | "processing" | "ready" | "failed";
  errorMessage?: string;
  pageCount?: number;
  charCount?: number;
  createdAt: string;
  updatedAt: string;
}
```

#### `RoomAiHostFileChunk` (optional separate collection or embedded array if small)

```ts
{
  id: string;
  fileId: string;
  roomId: string;
  index: number;
  text: string;
}
```

#### `RoomAiHostChatMessage`

```ts
{
  id: string;
  roomId: string;
  userId: string;                 // participant — private thread
  mode: "build-help" | "file-study";
  fileId?: string;                // required when mode === file-study"
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}
```

Index: `{ roomId: 1, userId: 1, createdAt: -1 }`.

### 5.4 REST endpoints

All require current room participant. Gate: `getRoomTypeFeatureFlags(room.type).aiWorldHost && config.tuning.enableAiWorldHost`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/v1/rooms/:roomId/ai-host` | Get host or `null` |
| `POST` | `/v1/rooms/:roomId/ai-host` | Summon `{ displayName, position, rotationY? }` — 409 if exists |
| `PATCH` | `/v1/rooms/:roomId/ai-host` | Rename and/or reposition |
| `DELETE` | `/v1/rooms/:roomId/ai-host` | Dismiss bot (`?deleteFiles=false` default) |
| `GET` | `/v1/rooms/:roomId/ai-host/files` | List files (metadata only) |
| `POST` | `/v1/rooms/:roomId/ai-host/files/upload-target` | Presign `{ fileName, contentType, sizeBytes }` |
| `POST` | `/v1/rooms/:roomId/ai-host/files` | Register after upload `{ fileId, storageKey, ... }` → queue extract |
| `DELETE` | `/v1/rooms/:roomId/ai-host/files/:fileId` | Delete file + chunks |
| `GET` | `/v1/rooms/:roomId/ai-host/chat` | List messages `?mode=&fileId=&limit=` |
| `POST` | `/v1/rooms/:roomId/ai-host/chat` | Send message `{ mode, fileId?, content }` → SSE stream |

### 5.5 Realtime events

| Message | Channel | Payload |
| --- | --- | --- |
| `room.ai-host.updated.v1` | reliable | Full `RoomAiHost` |
| `room.ai-host.dismissed.v1` | reliable | `{ roomId }` |
| `room.ai-host.file.updated.v1` | reliable | `RoomAiHostFile` (status changes) |
| `room.ai-host.file.removed.v1` | reliable | `{ fileId }` |

Chat messages are **not** broadcast (private).

---

## 6. Feature flags and environment

| Env | Purpose |
| --- | --- |
| `ENABLE_AI_WORLD_HOST` | API gate |
| `NEXT_PUBLIC_ENABLE_AI_WORLD_HOST` | Lobby + client UI |
| `OPENAI_API_KEY` | Required when enabled in production |
| `OPENAI_AI_HOST_MODEL` | Default `gpt-4.1-mini` |
| `OPENAI_AI_HOST_MODEL_LARGE` | Default `gpt-4.1` |
| `AI_WORLD_HOST_STORAGE_PREFIX` | R2 prefix, default `ai-host/` |
| `AI_WORLD_HOST_MAX_FILES_PER_ROOM` | Override settings default |
| `AI_WORLD_HOST_MAX_FILE_BYTES` | Override settings default |

Defaults: **off** until staging validation.

---

## 7. Privacy, safety, and abuse

| Topic | v1 policy |
| --- | --- |
| Chat visibility | Private per `userId`; speech bubble only on asker’s client |
| File visibility | Metadata (name, uploader) visible to room; **content** only via own chat |
| Delete file | Uploader or any participant (FFA cleanup) |
| Delete host | Any participant; files retained unless `deleteFiles=true` |
| PII in uploads | User responsibility; banner: “Don’t upload secrets; files stay in this room.” |
| Prompt injection | System prompt instructs model to ignore file instructions that contradict tutor role |
| Rate limits | Per-user messages/hour; 429 with retry-after |
| Cost cap | Per-room daily token budget (env); hard stop with friendly error |

No recording of chats to R2 in v1 (Mongo only, same retention as room lifecycle).

---

## 8. Technical decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Avatar implementation | New `RetroRobotHostAvatar` procedural mesh | User requirement; humanoid rig wrong silhouette |
| Host count | One per room | Simpler UX and state; avoids crowd of bots |
| Chat privacy | Per-user threads | File study often sensitive |
| File persistence | Room-scoped until delete | User requirement |
| Build knowledge | Bundled markdown corpus + optional live context | Accurate, testable, no hallucinated controls |
| File RAG v1 | Chunk + keyword retrieval | Avoid embedding infra in v1; upgrade to vectors in v2 |
| Upload pipeline | Presigned R2 (same as room objects) | Proven pattern |
| LLM transport | SSE streaming | Matches modern chat UX |
| 2D parity | Panel + map icon | Required 2D analog rule |

---

## 9. Relationship to other features

```
Free-for-All
├── World Building (tools the tutor teaches)
├── AI Objects (separate — generates meshes, not dialogue)
├── AI Meeting Notes (room audio → transcript)
└── AI World Host (this plan)
       ├── RetroRobotHostAvatar (3D presence)
       ├── Build Help (corpus + context)
       └── Study Files (upload + RAG chat)
```

---

## 10. Success criteria (Phase 1 complete)

- [ ] Participant summons a named robot in an FFA room; all participants see it at the same position.
- [ ] Build Help correctly answers: undo shortcut, tool keys 1–7, ramp vs floor, “spawn keep-out” rejection (FFA mask).
- [ ] User uploads a `.txt` or `.pdf`; after processing, can ask questions and get answers grounded in file content.
- [ ] File survives rejoin until deleted; deletion removes R2 + DB chunks.
- [ ] Another participant cannot read the first user’s chat history via API.
- [ ] Feature off → no HUD card, API 403 on routes.
- [ ] Robot is visually distinct (teal/coral/yellow retro robot), not a human avatar.

---

## 11. Open questions

1. **Profanity filter** on names — basic blocklist vs open?
2. **PDF-only office docs** — defer `.docx` to v2 (needs LibreOffice/unzip) or ship?
3. **Embeddings** for file RAG — worth v1.1 if keyword retrieval feels weak?
4. **Host auto-summon** when entering empty FFA room — helpful or noisy?
5. **Cross-pod visibility** — if breakout pods ship in FFA, is host global to room (yes, recommended)?

---

## 12. Future enhancements (post v1)

- Voice in/out (STT question, TTS answer with lip/LED sync).
- Host **reacts** to room events (“Nice tower!” on build piece milestone).
- **Shared** study session mode (one file, group chat visible to all).
- `.docx` / `.pptx` extraction.
- Vector embeddings + citation links (“see page 3”).
- Localized tutor (Spanish build help).
