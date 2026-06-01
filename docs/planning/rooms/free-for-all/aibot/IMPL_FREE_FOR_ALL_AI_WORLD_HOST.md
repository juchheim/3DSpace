# Implementation — AI World Host (Free-for-All Room Type)

Source plan: [`./PLAN_FREE_FOR_ALL_AI_WORLD_HOST.md`](./PLAN_FREE_FOR_ALL_AI_WORLD_HOST.md)
Parent room type: [`../IMPL_FREE_FOR_ALL_ROOM.md`](../IMPL_FREE_FOR_ALL_ROOM.md)
Branch: `feature/ffa-ai-world-host`
Last updated: 2026-06-01

---

## Status / Scope

**Status:** Phases 1–2 complete (contracts + API host CRUD). Phase 3 complete (RetroRobotHostAvatar 3D + 2D, consumed via Phase 4 context). Phase 4 complete (client hook + RoomClient wiring). Phase 5 complete (world-building corpus + Build Help streaming chat). Phase 6 (file upload/study) not started.

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

**Implementation notes (done):**

- `RetroRobotHostAvatar.tsx` + `lib/retroRobotMaterials.ts` build a fully custom robot — **no bare box/sphere/cylinder primitives**. Primary masses are `ExtrudeGeometry` rounded+bevelled shells (torso, head, visor, tread housing, brow), `LatheGeometry` revolved profiles (dome, eyes, shoulders, wheels, antenna tip, neck, rivets), and `TubeGeometry` swept curves (arm segments, antenna stalk, claw fingers). `MeshPhysicalMaterial` clearcoat body + emissive LED eyes + animated CRT chest screen (`CanvasTexture`) + ground contact shadow.
- States `idle` / `thinking` / `speaking` (+ translucent `placement-ghost`) driven by `animationState`; head tilt/nod, antenna sway, eye blink/pulse, claw open-close, equalizer/scope screen, typing-dot bubble.
- Integrated via the Phase 4 **context** (`useAiWorldHostScene()` / `AiWorldHostSceneContext`), not new RoomView props: `RoomView3D` reads the scene outside the R3F `<Canvas>` and passes it to an in-canvas `AiHostLayer`; `RoomView2D` renders a robot map marker. Bubble/nameplate CSS under `.world-host-*`; 2D marker `.world-host-marker-2d`.
- Dev harness: `/dev/ai-host-hero` (`RetroRobotHostHarness.tsx`) with state toggles + triangle readout.
- Scene cost ≈ 13k unique-geo tris (~18–20k instanced) — above the original 2k note by design (per "go the extra mile" direction); negligible for one host/room.

**Checkpoint:**

- [x] `npm run typecheck -w @3dspace/web` (clean; only pre-existing unrelated test-file errors remain)
- [x] Headless smoke test `apps/web/tests/retro-robot-avatar.test.ts` (kit builds, finite geometry, triangle budget, dispose, all 3 screen states paint)
- [x] Dev route SSRs the harness without error (`curl /dev/ai-host-hero`)
- [ ] Manual: robot reads as retro-robot, not humanoid — open `/dev/ai-host-hero` under `next dev` (live WebGL capture was blocked by the sandbox preview proxy, which only serves the SPA root)

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

- [x] `npm run typecheck -w @3dspace/web`
- [x] `npx vitest run apps/web/tests/ai-host-realtime.test.ts apps/web/tests/ai-host-placement.test.ts`
- [x] Phase 4 review fixes: refresh preserves in-progress placement; dismiss confirm + hub placement; `ApiError` messages; loading state; card title “World Host”
- [ ] Manual: two tabs — summon in tab A visible in tab B
- [ ] Manual: reposition syncs live (needs Phase 3 ghost render for full UX)

**Phase 3 handoff:** `useAiWorldHostScene()` / `AiWorldHostSceneContext` exposes `host`, `ghost`, `placementMode`, `animationState`, `speechBubbleText`, `onHostInteract` for `RetroRobotHostAvatar` in `RoomView3D` / `RoomView2D`.

---

### Phase 5 — World-building corpus + Build Help chat — COMPLETE

Goal: accurate build tutor with streaming replies.

**Files (shipped):**

- `apps/api/src/ai-host/corpus/world-building-guide.md` — thorough corpus authored from `BuildControls`, `buildStamps`, `buildMaterials`, `build.ts`/`free-for-all-build-mask.ts` constants, and `buildPlacementStatusMessage` rejection reasons. ~14.8 KB / <12k tokens.
- `apps/api/src/ai-host/corpus.ts` — `loadWorldBuildingCorpus()` (reads md via `import.meta.url`, cached) + `estimateCorpusTokens()`. Copied to `dist/ai-host/corpus/` by `scripts/copy-builtin-catalog.mjs`.
- `apps/api/src/ai-host/prompts.ts` — `buildHelpSystemPrompt({ context })` (persona + corpus + live build context with friendly rejection mapping) and `fileStudySystemPrompt()` (Phase 6-ready, anti-injection).
- `apps/api/src/ai-host/chat-service.ts` — `streamChatCompletion()` async-generator over OpenAI SSE; `mockChatReply()` / `AI_WORLD_HOST_MOCK_RESPONSES` for tests; `collectChatReply()`.
- `apps/api/src/ai-host/chat-message-service.ts` — record creation, `toChatHistory` (cap `maxContextMessages`), `countRecentUserMessages` (rate limit).
- `apps/api/src/routes/ai-host.ts` — `GET .../chat` (private per `userId`), `POST .../chat` SSE (`reply.hijack()` + `event: delta|done|error`). Requires a summoned host; file-study deferred to Phase 6 (`ai-host-file-not-found`); per-user/hour rate limit (`ai-host-rate-limited`).
- Repository: `appendAiHostChatMessage` / `listAiHostChatMessages` (memory + Mongo `room_ai_host_chat_messages`); chat cascades on host dismiss + room delete.
- Contracts: `ApiErrorCode` adds `ai-host-unavailable`, `ai-host-rate-limited`.
- Config: `aiWorldHostMockResponses` (`AI_WORLD_HOST_MOCK_RESPONSES`).
- `apps/web/lib/api.ts` — `listAiHostChat`, `streamAiHostChat` (SSE reader).
- `apps/web/lib/useAiWorldHost.ts` — chat state (`chatMessages`, `chatStreaming`, `streamingReply`, `chatError`), `actions.sendBuildHelp`, history load, speech-bubble + animation wiring, dismiss clears chat.
- `apps/web/components/WorldHostPanel.tsx` — Build Help tab (messages, suggested chips, composer, streaming); mounted in `RoomClient` when a host exists.

**Checkpoint:**

- [x] `npx vitest run apps/api/tests/routes/ai-host-chat.test.ts apps/api/tests/ai-host/prompts.test.ts` (12 tests)
- [x] Mock-mode: “How do I undo?” → reply mentions ⌘Z; “What does key 3 do?” → Ramp
- [x] Chat is private per user (cross-user GET returns empty); rate limit 429; no-host 404
- [x] `npm run typecheck -w @3dspace/api`; web typecheck clean except 2 pre-existing unrelated test files
- [ ] Manual: real OpenAI streaming reply renders token-by-token in the panel

---

### Phase 6 — File upload, extraction, and Study Files chat — COMPLETE

Goal: persistent files and file-grounded conversation.

**Files (shipped):**

- `apps/api/src/ai-host/file-service.ts` — upload target, register, in-request extraction (txt/md/pdf), chunk persist, delete with R2 + cascade chat.
- `apps/api/src/ai-host/extract-text.ts` — txt/md + `pdf-parse` (dynamic import).
- `apps/api/src/ai-host/chunker.ts` — ~3200 char chunks, 400 overlap.
- `apps/api/src/ai-host/retrieval.ts` — keyword top-k (default 6) for file-study prompts.
- `apps/api/src/ai-host/realtime-outbox.ts` — `file.updated` / `file.removed` events.
- `apps/api/src/routes/ai-host.ts` — `GET/POST .../files`, upload-target, register, delete; `POST .../chat` `mode: "file-study"`.
- Repository + Mongoose: `room_ai_host_files`, `room_ai_host_file_chunks`; dismiss/room delete cascades files; delete file cascades file-scoped chat messages.
- `apps/api/package.json` — `pdf-parse`; `apps/api/src/types/pdf-parse.d.ts`.
- `apps/web/lib/api.ts` — list/upload/delete study file helpers.
- `apps/web/lib/useAiWorldHost.ts` — `studyFiles`, `uploadStudyFile`, `deleteStudyFile`, `sendFileStudy`, file realtime + per-file chat history.
- `apps/web/components/WorldHostPanel.tsx` — Study Files tab (privacy banner, upload, list, per-file chat).
- `apps/web/app/globals.css` — study-files panel styles.

**Checkpoint:**

- [x] Upload `.txt` → file-study chat (mock mode) answers with retrieval context; delete → 404 on chat
- [x] `npx vitest run apps/api/tests/routes/ai-host-files.test.ts apps/api/tests/ai-host/chunker.test.ts apps/api/tests/ai-host/retrieval.test.ts` (5 tests)
- [x] `npm run typecheck -w @3dspace/api`
- [ ] Manual: upload PDF, wait for ready, quiz-style Q&A

**Phase 6 review fixes (post-ship):**

- Dismiss without `deleteFiles` preserves chat + files; `deleteFiles` on dismissed realtime + per-file `file.removed` events; R2 cleanup on dismiss-with-files.
- PDF register returns `processing` immediately; client polls + publishes `file.updated` when ready.
- `POST .../files/:fileId/reprocess` for failed files; Retry in Study Files UI.
- File routes work without summoned host; panel visible when files remain after dismiss.
- Delete limited to uploader or teacher; optimistic chat rolled back on stream error.
- Rate limit `retryAfterSeconds` from oldest message in window.

---

### Phase 7 — Polish, rate limits, E2E — COMPLETE

Goal: production-ready rollout.

**Files (shipped):**

- `apps/api/src/ai-host/rate-limit.ts` — hourly cap helpers + `assertAiHostChatRateLimit` with accurate `retryAfterSeconds`.
- `apps/api/src/ai-host/profanity.ts` — display-name blocklist (used by `host-service.ts`).
- `apps/api/tests/ai-host/rate-limit.test.ts`, `apps/api/tests/ai-host/profanity.test.ts`
- `apps/web/test/ai-world-host.spec.ts` — classroom (no HUD), FFA summon + build help + bubble, 2D marker + panel.
- `playwright.config.ts` — `ENABLE_AI_WORLD_HOST`, `AI_WORLD_HOST_MOCK_RESPONSES`, `NEXT_PUBLIC_ENABLE_AI_WORLD_HOST` on E2E servers.
- `apps/web/components/WorldHostPanel.tsx` — `data-testid="ai-world-host-panel"`.

**Checkpoint:**

- [x] Per-user hourly cap (429) via `assertAiHostChatRateLimit` (wired in Phase 5/6 chat route).
- [x] Profanity blocklist extracted + unit tests.
- [x] E2E: 2D view shows `.world-host-marker-2d` and chat panel; build-help mock reply in panel + `ai-host-bubble`.
- [x] E2E: classroom room has no World Host region/panel (room-type gate).
- [ ] `npm run test:e2e -- --grep "ai world host"` (run locally with Playwright webServer).

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
