# Implementation — AI World Host (Free-for-All Room Type)

Source plan: [`./PLAN_FREE_FOR_ALL_AI_WORLD_HOST.md`](./PLAN_FREE_FOR_ALL_AI_WORLD_HOST.md)
Parent room type: [`../IMPL_FREE_FOR_ALL_ROOM.md`](../IMPL_FREE_FOR_ALL_ROOM.md)
Branch: `feature/ffa-ai-world-host`
Last updated: 2026-06-01

---

## Status / Scope

**Status:** Phases 1–2 complete (contracts + API host CRUD). Phases 3+ not started.

This doc implements the AI World Host described in the PLAN. It is **additive to Free-for-All Phase 1** and assumes **world building** (`ENABLE_FREE_FOR_ALL_BUILDING`) is available in the environments where build-help is tested — the tutor is still useful without building enabled (explains the feature), but E2E build answers need the build flag on.

**What ships:**

1. **`RetroRobotHostAvatar`** — procedural colorful retro-robot (teal/coral/yellow), idle/thinking/speaking animations, click-to-open panel.
2. **`RoomAiHost`** — one per room, user-chosen name, position, rename/reposition/dismiss.
3. **Build Help** — bundled world-building corpus + optional client context; streaming chat via OpenAI.
4. **Study Files** — presigned upload, extraction, chunk storage, per-user file-scoped chat.
5. **`WorldHostPanel`** — right-side HUD (Build Help | Study Files).
6. **Realtime** — host + file status sync (not private chat).
7. **Feature flag** `ENABLE_AI_WORLD_HOST` / `NEXT_PUBLIC_ENABLE_AI_WORLD_HOST` (default `false`).

**Out of scope (Phase 1):**

- Classroom / workforce-training / escape-room types.
- Voice, walking AI, tool-calling that mutates builds, shared public chat threads.
- `.docx`/`.pptx`, vector embeddings, multi-host.

---

## Codebase context (pre-implementation)

| File | What matters |
| --- | --- |
| `packages/contracts/src/index.ts` | `RoomTypeFeatureFlags` (~1227); `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS`; `RoomSettingsSchema`; add `aiWorldHost` flag + settings. Realtime message schemas near `room.board.*.v1`. |
| `apps/api/src/config.ts` | `AppConfig.tuning` — add `enableAiWorldHost`, model ids, storage prefix, limits. `requiredInProduction()` when flag on. |
| `apps/api/src/routes/` | New `ai-host.ts` route module; register in `buildApp`. Gate with room type + flag. |
| `apps/api/src/services/storage.ts` | `createUploadTarget`, signed download — reuse for file uploads. |
| `apps/api/src/ai-objects/` | Reference for OpenAI adapter patterns, job orchestration, retention — **do not** couple modules; copy patterns only. |
| `apps/api/src/repository.ts` + `models/mongoose.ts` | CRUD for host, files, chunks, messages. |
| `apps/api/src/ai-host/` | **New module**: corpus, prompts, chat service, extraction worker, chunker. |
| `apps/web/components/BlockyAvatar.tsx` | **Do not extend** for robot — sibling `RetroRobotHostAvatar.tsx`. |
| `apps/web/components/RoomView3D.tsx` | Render host alongside participant avatars; raycast layer. |
| `apps/web/components/RoomClient.tsx` | Mount `WorldHostPanel`, placement mode, realtime handlers. |
| `apps/web/lib/config.ts` | `CLIENT_TUNING.enableAiWorldHost`. |
| `apps/web/lib/api.ts` | Host/file/chat API wrappers + SSE reader. |
| `apps/web/lib/useAiWorldHost.ts` | **New hook** — host state, files, chat, realtime reconcile. |
| `apps/web/components/BuildControls.tsx` | Source of truth for tool labels/shortcuts in corpus maintenance. |
| `packages/room-engine/src/build.ts` + `free-for-all-build-mask.ts` | Rejection reasons for corpus. |

---

## Plan adjustments

**A. Double gating:** `getRoomTypeFeatureFlags(room.type).aiWorldHost && config.tuning.enableAiWorldHost` (API) and `CLIENT_TUNING.enableAiWorldHost` (UI). Same as AI Meeting Notes.

**B. One host per room:** Enforce with unique Mongo index `{ roomId: 1 }` on `RoomAiHost` and `409 host_exists` on second `POST`.

**C. Private chat enforcement:** `GET/POST chat` always filters `userId === caller`. Never include other users’ messages. Speech bubbles computed client-side from local stream only.

**D. File list is shared; content is not:** `GET files` returns metadata for all participants; extraction endpoints never return full text in list API — only through chat completion path.

**E. Corpus maintenance:** Add `npm run corpus:ai-host` script (optional) that fails CI if `world-building-guide.md` exceeds token budget — Phase 7 polish.

**F. Placement uses ground Y:** Client calls `groundHeightAt` / manifest floor before `POST` host position so robot sits on floor/ramp/build surface.

**G. Dismiss vs delete files:** `DELETE ai-host?deleteFiles=true` cascades; default `false` keeps study materials for the room.

---

## Phased implementation

### Phase 1 — Contracts + feature flags

Goal: schemas, flags, settings, realtime message types.

**File: `packages/contracts/src/index.ts`**

1. Add `aiWorldHost: boolean` to `RoomTypeFeatureFlags`.
2. Set `aiWorldHost: true` in `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS` only; `false` elsewhere.
3. Add `aiWorldHost` settings block to `RoomSettingsSchema` (see PLAN §5.2).
4. Add Zod schemas: `RoomAiHostSchema`, `RoomAiHostFileSchema`, `RoomAiHostChatMessageSchema`, `RoomAiHostFileChunkSchema`.
5. Add realtime:
   - `RoomAiHostUpdatedMessageV1Schema`
   - `RoomAiHostDismissedMessageV1Schema`
   - `RoomAiHostFileUpdatedMessageV1Schema`
   - `RoomAiHostFileRemovedMessageV1Schema`
6. Regenerate OpenAPI.

**Env templates:** `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`.

**Checkpoint:**

- [x] `npm run typecheck -w @3dspace/contracts`
- [x] `npm test -- packages/contracts/tests/ai-world-host.test.ts`
- [x] `npm run openapi` (regenerated `packages/contracts/openapi/openapi.json`)

---

### Phase 2 — API repository + host CRUD

Goal: summon, rename, reposition, dismiss; broadcast updates.

**Files:**

- `apps/api/src/models/mongoose.ts` — schemas + indexes.
- `apps/api/src/repository.ts` — interface + memory/mongo impl.
- `apps/api/src/ai-host/host-service.ts`
- `apps/api/src/routes/ai-host.ts` — `GET|POST|PATCH|DELETE /v1/rooms/:roomId/ai-host`
- Register routes in app builder; feature gate.

**Steps:**

1. Implement `createAiHost`, `getAiHostByRoomId`, `updateAiHost`, `deleteAiHost`.
2. Validate `displayName` length/charset.
3. On mutations, publish `room.ai-host.updated.v1` or `dismissed.v1` via existing realtime publisher helper.
4. API tests: summon, 409 duplicate, rename, reposition, dismiss.

**Checkpoint:**

- [x] `npm run typecheck -w @3dspace/api`
- [x] `npm run test -- apps/api/tests/routes/ai-host-host.test.ts`

---

### Phase 3 — RetroRobotHostAvatar (3D + 2D icon)

Goal: visible robot with art-direction palette and animations.

**Files:**

- `apps/web/components/RetroRobotHostAvatar.tsx` — new
- `apps/web/lib/retroRobotMaterials.ts` — emissive helpers (optional)
- `apps/web/components/RoomView3D.tsx` — render host from `useAiWorldHost().host`
- `apps/web/components/RoomView2D.tsx` — map marker `🤖` or small SVG at projected position
- `apps/web/app/globals.css` — `.world-host-*` speech bubble styles

**Steps:**

1. Build procedural mesh hierarchy per PLAN §3 (torso, head, eyes, antenna, arms, treads).
2. Implement `idle` / `thinking` / `speaking` animation states driven by props.
3. Add `Billboard` nameplate: `displayName` + “AI guide”.
4. Add speech bubble `Html` (viewer-local text prop).
5. Raycast: `onClick` → `onInteract()` to open panel.
6. **Placement ghost** variant: semi-transparent, follows cursor during reposition mode.

**Checkpoint:**

- [ ] Manual: robot reads as retro-robot, not humanoid
- [ ] `npm run typecheck -w @3dspace/web`

---

### Phase 4 — Client hook + host wiring in RoomClient

Goal: load host, realtime sync, summon/reposition/dismiss UI.

**Files:**

- `apps/web/lib/useAiWorldHost.ts`
- `apps/web/lib/realtime.ts` — extend union
- `apps/web/components/RoomClient.tsx` — realtime handler, placement mode
- `apps/web/lib/api.ts` — host CRUD functions

**Steps:**

1. Hydrate host on room join; subscribe to `room.ai-host.*`.
2. Summon modal (name + place at avatar / hub).
3. Reposition mode: ghost follows ground click; `PATCH` on confirm.
4. Pass `thinking` / `lastBubbleText` into `RetroRobotHostAvatar`.

**Checkpoint:**

- [ ] Two tabs: summon in tab A visible in tab B
- [ ] Reposition syncs live

---

### Phase 5 — World-building corpus + Build Help chat

Goal: accurate build tutor with streaming replies.

**Files:**

- `apps/api/src/ai-host/corpus/world-building-guide.md` — **author manually** from BuildControls + PLAN world-building
- `apps/api/src/ai-host/prompts.ts` — `buildHelpSystemPrompt(corpus, context)`
- `apps/api/src/ai-host/chat-service.ts` — OpenAI streaming, rate limit, persist messages
- `apps/api/src/routes/ai-host.ts` — `GET|POST .../chat` with SSE
- `apps/web/components/WorldHostPanel.tsx` — Build Help tab (initial)
- `apps/web/lib/api.ts` — `streamAiHostChat`

**Steps:**

1. Write corpus covering: tools 1–7, destroy, rotate R, drag-paint, undo/redo, stamps, materials, caps, FFA destroy policy, boards on build walls, rejection reasons.
2. `POST chat` body: `{ mode: "build-help", content, context?: BuildHelpContext }`.
3. Stream tokens to client; save user + assistant messages to `RoomAiHostChatMessage`.
4. Suggested question chips in UI.
5. API tests with mocked OpenAI: system prompt contains corpus header; context echoed.

**Checkpoint:**

- [ ] Manual: “How do I undo?” → mentions ⌘Z / Ctrl+Z
- [ ] Manual: “What does key 3 do?” → Ramp

---

### Phase 6 — File upload, extraction, and Study Files chat

Goal: persistent files and file-grounded conversation.

**Files:**

- `apps/api/src/ai-host/file-service.ts`
- `apps/api/src/ai-host/extract-text.ts` — pdf/txt/md
- `apps/api/src/ai-host/chunker.ts`
- `apps/api/src/ai-host/retrieval.ts` — keyword scoring v1
- `apps/api/src/routes/ai-host.ts` — file routes
- `apps/web/components/WorldHostPanel.tsx` — Study Files tab

**Steps:**

1. `upload-target` → presign; client PUT; `POST files` register → `processing`.
2. Async extraction (in-request for small txt/md; background for pdf):
   - On success: chunk, store, `status: ready`, broadcast `file.updated`.
   - On failure: `failed` + message.
3. `POST chat` with `{ mode: "file-study", fileId, content }` retrieves chunks, builds prompt, streams answer.
4. `DELETE files/:id` — R2 delete + chunks + messages for that file optional (v1: keep chat history but mark file deleted, or cascade delete file-scoped messages — **choose cascade** for simplicity).
5. Upload banner about sensitive data.

**Dependencies:** `pdf-parse` or equivalent in `apps/api/package.json`.

**Checkpoint:**

- [ ] Upload `.txt` → ask question → answer references content
- [ ] Delete file → list empty; chat returns 404 for fileId
- [ ] `npm run test -- apps/api/tests/routes/ai-host-files.test.ts`

---

### Phase 7 — Polish, rate limits, E2E

Goal: production-ready rollout.

**Files:**

- `apps/api/src/ai-host/rate-limit.ts`
- `apps/web/test/ai-world-host.spec.ts`
- `playwright.config.ts` — env flags

**Steps:**

1. Per-user hourly message cap (429).
2. Name profanity blocklist (small static set).
3. 2D panel parity check.
4. Playwright: summon → ask build question → see bubble text (mock OpenAI in test env OR use `AI_WORLD_HOST_E2E_MOCK=true` stub).
5. Update `.cursor/memory.md`, optional `docs/planning/mvp+1` note.

**Checkpoint:**

- [ ] `npm run test:e2e -- --grep "ai world host"`
- [ ] Flags off → no panel

---

## Files-to-touch summary

| Area | File | Phase |
| --- | --- | --- |
| Contracts | `packages/contracts/src/index.ts` | 1 |
| Contracts tests | `packages/contracts/tests/ai-world-host.test.ts` | 1 |
| API config | `apps/api/src/config.ts` | 1 |
| API module | `apps/api/src/ai-host/*` | 5–6 |
| API routes | `apps/api/src/routes/ai-host.ts` | 2, 5–6 |
| Mongoose | `apps/api/src/models/mongoose.ts` | 2 |
| Repository | `apps/api/src/repository.ts` | 2, 6 |
| API tests | `apps/api/tests/routes/ai-host-*.test.ts` | 2, 5–6 |
| Robot avatar | `apps/web/components/RetroRobotHostAvatar.tsx` | 3 |
| Panel | `apps/web/components/WorldHostPanel.tsx` | 5–6 |
| Hook | `apps/web/lib/useAiWorldHost.ts` | 4 |
| API client | `apps/web/lib/api.ts` | 4–6 |
| Room client | `apps/web/components/RoomClient.tsx` | 4 |
| 3D view | `apps/web/components/RoomView3D.tsx` | 3 |
| 2D view | `apps/web/components/RoomView2D.tsx` | 3 |
| Realtime | `apps/web/lib/realtime.ts` | 4 |
| Styles | `apps/web/app/globals.css` | 3 |
| E2E | `apps/web/test/ai-world-host.spec.ts` | 7 |
| Env | `.env.example` files | 1 |

---

## Acceptance criteria (v1)

Aligned with PLAN §10:

- Named retro-robot visible to all participants; private chat per user.
- Build Help answers match shipped controls (verified by scripted API test + manual checklist).
- Files persist until deleted; extraction powers Q&A.
- Feature-flagged off by default; FFA-only.

---

## Validation evidence (fill in after implementation)

```bash
npm run typecheck
npm test
npm run test:e2e -- --grep "ai world host"
```

Manual checklist:

- [ ] Summon, rename, reposition, dismiss
- [ ] Build Help: undo, ramp, rejection reason
- [ ] Upload PDF/txt, chat, delete
- [ ] Second user cannot fetch first user’s chat
- [ ] Robot visually distinct (screenshot attached to PR)

---

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Hallucinated build controls | Corpus-only grounding + tests on canonical Q&A |
| PDF extraction failures | Clear errors; prefer txt/md in UI copy |
| LLM cost | mini model default; rate limits; token cap per message |
| Private chat leak | API always filters by `userId`; no broadcast of messages |
| Robot perf (extra mesh) | Low poly count (<2k tris); single host per room |
| Corpus drift when build UX changes | PR checklist: update `world-building-guide.md` when touching `BuildControls` |

---

## Open implementation questions (resolved here)

| Question | Decision |
| --- | --- |
| Cascade delete messages on file delete? | **Yes** — delete `RoomAiHostChatMessage` where `fileId` matches |
| Keep chunks in Mongo or only R2 extracted blob? | **Mongo chunks** for retrieval; optional full text in R2 for reprocessing |
| SSE vs WebSocket for chat? | **SSE** on POST (simpler with Fastify) |
| E2E without OpenAI? | `AI_WORLD_HOST_MOCK_RESPONSES=true` returns canned stream in test env |
