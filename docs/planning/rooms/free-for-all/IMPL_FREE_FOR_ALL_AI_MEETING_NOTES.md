# Implementation — AI Meeting Notes (Free-for-All Room Type)

Source plan: [`PLAN_FREE_FOR_ALL_AI_MEETING_NOTES.md`](./PLAN_FREE_FOR_ALL_AI_MEETING_NOTES.md)
Parent room type: [`IMPL_FREE_FOR_ALL_ROOM.md`](./IMPL_FREE_FOR_ALL_ROOM.md)
Branch: `room-types`
Last updated: 2026-05-27

---

## Status / Scope

**Status:** Not started. Planning only.

This doc implements the AI Meeting Notes feature described in the PLAN. It is **additive to Free-for-All Phase 1** — FFA room type, open join, and dynamic boards must already be shipped on `room-types` before this work begins.

**What ships:**

1. **Server-side audio capture** via LiveKit Track Egress (per-participant mic tracks) in production; a lightweight client-side mixer fallback for local dev when LiveKit is not configured.
2. **Live transcription** via OpenAI Realtime API in `transcription` mode (`gpt-4o-transcribe` by default).
3. **Session finalize + summary** via OpenAI Chat Completions (`gpt-4.1` by default) producing structured Markdown.
4. **Right-side HUD panel** (`MeetingNotesPanel`) with start/stop, live transcript, and authenticated downloads (`.txt`, `.vtt`, `.srt`, `.md`).
5. **Global REC indicator** in the top HUD bar plus per-avatar mic dots while a session is active.
6. **Lobby consent line** on FFA join when the feature is enabled.
7. **Feature flag** `ENABLE_AI_MEETING_NOTES` / `NEXT_PUBLIC_ENABLE_AI_MEETING_NOTES` (default `false`).

**Out of scope (Phase 1):**

- Classroom / workforce-training room types.
- Avatar-overlay live captions (transcript stays in the panel).
- Editable transcripts, per-participant opt-out, multilingual UI.
- Mid-session rolling summary (Phase 8 candidate).
- Webhook / external archive integrations.
- Self-hosted LiveKit OSS without Egress (document as Cloud-only unless fallback is explicitly enabled).

---

## Codebase context (pre-implementation state)

Line numbers below are accurate as of `room-types` HEAD on 2026-05-27. Free-for-All is shipped; this doc focuses on what is *additionally* needed for AI Meeting Notes.

| File | What matters |
|---|---|
| `packages/contracts/src/index.ts` | `RoomTypeFeatureFlags` at line ~808. `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS` at line 861 — currently has `dynamicBoards: true`, `openJoin: true`; must add `aiMeetingNotes: true`. `getRoomTypeFeatureFlags()` at line 880. `RoomSettingsSchema` at line 891 — add `aiMeetingNotes` settings block. Realtime message patterns at line 1364 (`RoomBoardCreatedMessageV1Schema`) — mirror for `room.meeting-notes.*.v1`. |
| `packages/contracts/openapi/openapi.json` | Regenerate after contract changes (`npm run openapi` from `packages/contracts`). |
| `apps/api/src/config.ts` | `AppConfig.tuning` at line 30 — add `enableAiMeetingNotes`, `openAiApiKey`, `openAiTranscriptionModel`, `openAiSummaryModel`, `aiMeetingNotesMaxDurationMinutes`, `aiMeetingNotesStoragePrefix`, `aiMeetingNotesIdleTimeoutSec`. `requiredInProduction()` at line 115 — when `enableAiMeetingNotes=true`, require `OPENAI_API_KEY` and object storage vars. |
| `apps/api/src/app.ts` | New route block after dynamic-wall-anchors (~line 3387). Gate with `getRoomTypeFeatureFlags(room.type).aiMeetingNotes && config.tuning.enableAiMeetingNotes`. Lesson recap CSV download at line 3828 is the `Content-Disposition` proxy pattern to copy. |
| `apps/api/src/repository.ts` | `Repository` interface — add meeting-notes CRUD methods mirroring `DynamicWallAnchor` pattern (lines 133–138). Memory impl alongside Mongoose impl. |
| `apps/api/src/models/mongoose.ts` | New collections: `MeetingNotesSession`, `MeetingNotesSegment`. Index `{ roomId: 1, status: 1 }` and `{ sessionId: 1, startMs: 1 }`. |
| `apps/api/src/meeting-notes/` | **New module** (see Phase 3–5). Orchestrator, egress client, OpenAI transcription bridge, summary worker, transcript formatters, retention reaper. |
| `apps/web/lib/config.ts` | `CLIENT_TUNING` at line 7 — add `enableAiMeetingNotes: process.env.NEXT_PUBLIC_ENABLE_AI_MEETING_NOTES === "true"`. |
| `apps/web/lib/api.ts` | Download pattern at lines 517–545 (`downloadLessonRecapCsv`). Add meeting-notes API wrappers here. |
| `apps/web/lib/realtime.ts` | `RealtimeMessage` union at line 53 — extend with `MeetingNotesRealtimeMessage`. `isRealtimeUnreliable()` at line 72 — add `room.meeting-notes.segment.v1`. |
| `apps/web/lib/useMeetingNotes.ts` | **New hook** — mirror `useDynamicWallAnchors.ts` (hydrate, 30 s refresh, realtime reconcile, start/stop/download). |
| `apps/web/components/MeetingNotesPanel.tsx` | **New component** — right-side `HudCard` with panel states from PLAN § 2.1. |
| `apps/web/components/RoomClient.tsx` | Right HUD rail at line 1865. Mount `MeetingNotesPanel` when `roomTypeFeatures.aiMeetingNotes && CLIENT_TUNING.enableAiMeetingNotes`. Top HUD at line 1785 — add REC badge. Realtime dispatch at line 663 — wire `meetingNotesRealtimeHandlerRef` before the early-return stubs. |
| `apps/web/components/BlockyAvatar.tsx` | Nameplate at line 346 — add recording mic dot when `recordingActive && participant.state.media?.microphoneEnabled`. |
| `apps/web/components/Lobby.tsx` | FFA join flow at line 598 — add consent line when `enableAiMeetingNotes` is on. |
| `apps/web/app/globals.css` | Add `.meeting-notes-*`, `.room-hud-rec-badge`, `.avatar-nameplate__recording-dot` styles near existing `.room-hud-right` block (line ~573). |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` — add AI Meeting Notes vars from PLAN § 5. |

---

## Plan adjustments

Clarifications derived from the codebase walkthrough, on top of the PLAN doc:

**A. Double gating: room-type flag + env flag.** Other features use this pattern (`roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons`). Meeting Notes requires **both**:

- `getRoomTypeFeatureFlags(room.type).aiMeetingNotes === true` (only FFA), and
- `config.tuning.enableAiMeetingNotes === true` / `CLIENT_TUNING.enableAiMeetingNotes === true`.

This keeps the feature off in production until explicitly flipped, even though FFA is the only room type that *can* use it.

**B. Per-track egress IDs, not a single egress ID.** PLAN § 4.3 lists `livekitEgressId?: string`. Implementation stores a map:

```ts
livekitEgressByParticipantId: Record<string, string>; // participantId → egressId
```

One Track Egress job is started per published mic track. When a participant mutes/unmutes or republishes, the orchestrator starts/stops the corresponding egress + transcription stream independently.

**C. Interim segments are ephemeral.** Only `isFinal: true` segments persist to MongoDB. Interim deltas flow over the unreliable realtime channel only. The panel merges by `segmentId`, replacing interim text in place until a final segment arrives.

**D. Speaker attribution via LiveKit identity → session userId.** LiveKit participant identity is the Clerk `userId` (existing convention in token minting). The orchestrator resolves display names from the active session roster at segment-finalize time for transcript output; the segment stores `speakerUserId` only.

**E. Transcript downloads use display names.** Resolved open question #5 from the PLAN: `.txt` / `.vtt` / `.srt` files label speakers by display name, not raw user IDs. The API looks up names from session/participant records at finalize time and embeds them in the artifact.

**F. Delete permission: any current participant.** Matches PLAN § 9 default and FFA cooperative-cleanup norms. Any authenticated participant currently in the room may delete a session (not just the creator). Deletion removes DB records and R2 artifacts.

**G. Local dev without LiveKit Egress.** When `!livekitConfigured(config)`, the API returns `503 egress_unavailable` on session start **unless** `AI_MEETING_NOTES_ALLOW_CLIENT_FALLBACK=true`. In that mode, the browser that started the session runs a client-side audio mixer (local mic + WebAudio destination of remote LiveKit tracks) and POSTs PCM chunks to a new endpoint `POST /v1/rooms/:roomId/meeting-notes/sessions/:sessionId/audio-chunks`. This path is dev/QA only — not production.

**H. Filename format.** Downloads use:

```
meeting-notes-<roomName-slugified>-<YYYYMMDD-HHmm>.{txt|vtt|srt|md}
```

Slugify: lowercase, spaces → hyphens, strip non-alphanumeric except hyphens, max 40 chars.

**I. Optional second-pass transcription is off by default.** VTT/SRT timestamps come from streamed segment `startMs`/`endMs` in v1. Enable `AI_MEETING_NOTES_FINAL_TRANSCRIPTION_PASS=true` to re-run audio through non-streaming `gpt-4o-transcribe` with `timestamp_granularities=["segment","word"]` on finalize (higher cost, cleaner captions).

---

## Phased implementation

### Phase 1 — Contracts + feature flags

Goal: schemas, feature flags, and realtime message types accept the new capability.

**File: `packages/contracts/src/index.ts`**

1. Extend `RoomTypeFeatureFlags` (~line 808):

   ```ts
   aiMeetingNotes: boolean;
   ```

2. Set `aiMeetingNotes: false` in `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS`, `CLASSROOM_ROOM_TYPE_FEATURE_FLAGS`, and `aiMeetingNotes: true` in `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS`.

3. Add settings block to `RoomSettingsSchema` (~line 891):

   ```ts
   aiMeetingNotes: z.object({
     enabled: z.boolean().default(true),
     autoStartOnFirstJoin: z.boolean().default(false),
     maxSessionDurationMinutes: z.number().int().positive().max(360).default(120),
     retentionDays: z.number().int().positive().max(365).default(30),
   }).default({
     enabled: true,
     autoStartOnFirstJoin: false,
     maxSessionDurationMinutes: 120,
     retentionDays: 30,
   }),
   ```

4. Add entity schemas:

   ```ts
   export const MeetingNotesSessionStatusSchema = z.enum([
     "starting", "recording", "finalizing", "ready", "error", "cancelled"
   ]);

   export const MeetingNotesSessionSchema = z.object({
     id: z.string().min(1),
     roomId: z.string().min(1),
     startedByUserId: z.string().min(1),
     startedAt: z.string().datetime(),
     endedAt: z.string().datetime().optional(),
     status: MeetingNotesSessionStatusSchema,
     livekitEgressByParticipantId: z.record(z.string(), z.string()).default({}),
     transcriptStorageKeys: z.object({
       txt: z.string().optional(),
       vtt: z.string().optional(),
       srt: z.string().optional(),
     }).optional(),
     summaryStorageKey: z.string().optional(),
     summaryGeneratedAt: z.string().datetime().optional(),
     durationSec: z.number().int().nonnegative().optional(),
     participantUserIds: z.array(z.string()).default([]),
     errorMessage: z.string().optional(),
     createdAt: z.string().datetime(),
     updatedAt: z.string().datetime(),
   });

   export const MeetingNotesSegmentSchema = z.object({
     id: z.string().min(1),
     sessionId: z.string().min(1),
     roomId: z.string().min(1),
     speakerUserId: z.string().min(1),
     startMs: z.number().int().nonnegative(),
     endMs: z.number().int().nonnegative(),
     text: z.string(),
     isFinal: z.boolean(),
     language: z.string().optional(),
     createdAt: z.string().datetime(),
   });
   ```

5. Add request/response schemas:

   ```ts
   export const StartMeetingNotesSessionResponseSchema = z.object({
     session: MeetingNotesSessionSchema,
     realtimeMessages: z.array(z.unknown()).default([]),
   });

   export const PatchMeetingNotesSessionRequestSchema = z.object({
     action: z.enum(["stop", "cancel"]),
   });

   export const MeetingNotesSessionDetailSchema = MeetingNotesSessionSchema.extend({
     segments: z.array(MeetingNotesSegmentSchema).default([]),
   });
   ```

6. Add realtime message schemas (mirror `RoomBoardCreatedMessageV1Schema` at line 1364):

   ```ts
   export const MeetingNotesStartedMessageV1Schema = z.object({
     type: z.literal("room.meeting-notes.started.v1"),
     roomId: z.string(),
     sessionId: z.string(),
     startedByUserId: z.string(),
     startedAt: z.string().datetime(),
     sentAt: z.number().int(),
     senderId: z.string(),
   });

   export const MeetingNotesEndedMessageV1Schema = z.object({
     type: z.literal("room.meeting-notes.ended.v1"),
     roomId: z.string(),
     sessionId: z.string(),
     endedAt: z.string().datetime(),
     status: MeetingNotesSessionStatusSchema,
     sentAt: z.number().int(),
     senderId: z.string(),
   });

   export const MeetingNotesSummaryReadyMessageV1Schema = z.object({
     type: z.literal("room.meeting-notes.summary-ready.v1"),
     roomId: z.string(),
     sessionId: z.string(),
     summaryStorageKey: z.string(),
     sentAt: z.number().int(),
     senderId: z.string(),
   });

   export const MeetingNotesErrorMessageV1Schema = z.object({
     type: z.literal("room.meeting-notes.error.v1"),
     roomId: z.string(),
     sessionId: z.string(),
     errorMessage: z.string(),
     sentAt: z.number().int(),
     senderId: z.string(),
   });

   export const MeetingNotesSegmentMessageV1Schema = z.object({
     type: z.literal("room.meeting-notes.segment.v1"),
     roomId: z.string(),
     sessionId: z.string(),
     segmentId: z.string(),
     speakerUserId: z.string(),
     startMs: z.number().int().nonnegative(),
     endMs: z.number().int().nonnegative(),
     text: z.string(),
     isFinal: z.boolean(),
     sentAt: z.number().int(),
     senderId: z.string(),
   });
   ```

7. Add OpenAPI route stubs for all endpoints in § 4.4 of the PLAN. Regenerate: `npm run openapi`.

**File: `apps/web/lib/config.ts`**

8. Add `enableAiMeetingNotes` to `CLIENT_TUNING`.

**Env templates**

9. Add vars from PLAN § 5 to `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/contracts` passes.
- [ ] `npm test -- packages/contracts/tests` passes.

---

### Phase 2 — API: session lifecycle (stubbed pipeline)

Goal: REST endpoints, persistence, and reliable realtime state messages — no LiveKit Egress or OpenAI yet.

**File: `apps/api/src/repository.ts`**

1. Extend `Repository` interface:

   ```ts
   getActiveMeetingNotesSession(roomId: string): Promise<MeetingNotesSession | undefined>;
   listMeetingNotesSessions(roomId: string, limit?: number): Promise<MeetingNotesSession[]>;
   getMeetingNotesSession(id: string): Promise<MeetingNotesSession | undefined>;
   createMeetingNotesSession(input: MeetingNotesSession): Promise<MeetingNotesSession>;
   updateMeetingNotesSession(id: string, patch: Partial<MeetingNotesSession>): Promise<MeetingNotesSession>;
   deleteMeetingNotesSession(id: string, roomId: string): Promise<void>;
   listMeetingNotesSegments(sessionId: string): Promise<MeetingNotesSegment[]>;
   upsertMeetingNotesSegment(input: MeetingNotesSegment): Promise<MeetingNotesSegment>;
   deleteMeetingNotesSegmentsForSession(sessionId: string): Promise<void>;
   ```

2. Implement in both `MemoryRepository` and `MongooseRepository`.

**File: `apps/api/src/models/mongoose.ts`**

3. Add `meetingNotesSessionSchema` and `meetingNotesSegmentSchema` with indexes noted above.

**File: `apps/api/src/config.ts`**

4. Add tuning fields:

   ```ts
   enableAiMeetingNotes: boolean;
   openAiApiKey: string | undefined;
   openAiTranscriptionModel: string;       // default "gpt-4o-transcribe"
   openAiSummaryModel: string;             // default "gpt-4.1"
   aiMeetingNotesMaxDurationMinutes: number;
   aiMeetingNotesStoragePrefix: string;    // default "meeting-notes/"
   aiMeetingNotesIdleTimeoutSec: number;   // default 60
   aiMeetingNotesAllowClientFallback: boolean;
   aiMeetingNotesFinalTranscriptionPass: boolean;
   ```

5. Extend `requiredInProduction()`: when `enableAiMeetingNotes`, require `OPENAI_API_KEY` + object storage vars.

**File: `apps/api/src/app.ts`**

6. Add helper `assertMeetingNotesEnabled(room)`:

   ```ts
   function assertMeetingNotesEnabled(room: Room) {
     if (!config.tuning.enableAiMeetingNotes) throw forbidden("AI meeting notes are disabled");
     if (!getRoomTypeFeatureFlags(room.type).aiMeetingNotes) throw forbidden("AI meeting notes are not available for this room type");
     if (!room.settings.aiMeetingNotes?.enabled) throw forbidden("AI meeting notes are disabled for this room");
   }
   ```

7. Add routes (search for `dynamic-wall-anchors` block ~line 3205 as insertion anchor):

   | Route | Handler sketch |
   |---|---|
   | `POST .../meeting-notes/sessions` | Assert enabled + caller is room participant. 409 if active session exists (`getActiveMeetingNotesSession`). Create session `status: "starting"`. Transition to `recording` immediately in stub phase. Emit `room.meeting-notes.started.v1`. Return `{ session, realtimeMessages }`. |
   | `PATCH .../meeting-notes/sessions/:sessionId` | `{ action: "stop" }` → `finalizing` then stub-finalize to `ready` with empty artifacts. `{ action: "cancel" }` → `cancelled`. Emit `room.meeting-notes.ended.v1`. |
   | `GET .../meeting-notes/sessions` | List sessions, most recent first, default limit 20. |
   | `GET .../meeting-notes/sessions/:sessionId` | Return session + segments. |
   | `DELETE .../meeting-notes/sessions/:sessionId` | Any current participant. Delete session + segments. |
   | `POST .../resummarize` | Stub: 501 until Phase 5. |
   | Download routes | Stub: 404 until Phase 5. |

8. Wire reliable realtime outbox the same way wall-object mutations return `realtimeMessages[]` for the client to publish.

**File: `apps/api/tests/api.test.ts`**

9. Add tests:

   - Start → stop → list → get detail (FFA room, flag on).
   - Double-start returns 409.
   - Classroom room returns 403.
   - Flag off returns 403.
   - Non-participant returns 403.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/api` passes.
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "meeting-notes"` passes.

---

### Phase 3 — LiveKit Egress integration

Goal: on session start, begin per-participant Track Egress; on stop/cancel/idle-timeout, tear down all egress jobs.

**New files under `apps/api/src/meeting-notes/`:**

```
meeting-notes/
  index.ts                  // public exports
  orchestrator.ts           // session state machine + lifecycle
  egress-client.ts          // LiveKit EgressClient wrapper
  participant-track-watch.ts // subscribe to track publish/unpublish events
  types.ts
```

**File: `apps/api/src/meeting-notes/egress-client.ts`**

1. Use `livekit-server-sdk` `EgressClient`:

   ```ts
   import { EgressClient, EncodedFileType } from "livekit-server-sdk";

   export async function startTrackAudioEgress(input: {
     roomName: string;
     trackId: string;
     participantIdentity: string;
     webhookUrl: string; // or websocket URL for audio frames
   }): Promise<string> { /* returns egressId */ }

   export async function stopEgress(egressId: string): Promise<void>
   ```

2. Phase 1 egress delivery: **WebSocket** from LiveKit Egress to the API service. Add `POST /internal/meeting-notes/egress-audio` (not exposed publicly — validate LiveKit webhook signature or shared secret header `MEETING_NOTES_EGRESS_SECRET`).

   Alternative if WebSocket ingress is too heavy for Koyeb: use **S3-compatible direct upload** to a temp R2 prefix (`meeting-notes/audio/<sessionId>/<participantId>/`) and poll/process chunks. Choose WebSocket for lower latency in v1 if Koyeb supports it; otherwise S3 chunk path.

**File: `apps/api/src/meeting-notes/orchestrator.ts`**

3. `MeetingNotesOrchestrator` singleton (or per-process map keyed by `sessionId`):

   - `startSession(session, room)` → for each participant with a published mic track, call `startTrackAudioEgress`, store egress IDs on session, set `status: "recording"`.
   - `onTrackPublished(roomId, participantIdentity, trackId)` → if active session, start egress for new mic track.
   - `onTrackUnpublished(...)` → stop egress + transcription stream for that track.
   - `stopSession(sessionId, reason)` → stop all egress jobs, transition to `finalizing`, hand off to summary pipeline (Phase 5).
   - `cancelSession(sessionId)` → stop egress, delete temp audio, set `cancelled`.

4. Idle-timeout reaper: if zero participants remain in the LiveKit room for `aiMeetingNotesIdleTimeoutSec` (default 60), auto-stop the active session.

5. Max-duration timer: auto-stop at `min(room.settings.aiMeetingNotes.maxSessionDurationMinutes, config.tuning.aiMeetingNotesMaxDurationMinutes)`.

**File: `apps/api/src/app.ts`**

6. On `POST .../meeting-notes/sessions`, after creating the DB record, call `orchestrator.startSession()`. On failure, set `status: "error"`, emit `room.meeting-notes.error.v1`, return 503.

7. Hook LiveKit webhook handler (existing or new) for `track_published` / `track_unpublished` / `room_finished` events → orchestrator.

**Checkpoint:**

- [ ] Unit tests for orchestrator state transitions (mock egress client).
- [ ] Integration test gated behind `LIVEKIT_INTEGRATION=true`.

---

### Phase 4 — OpenAI live transcription

Goal: bridge egress audio frames to OpenAI Realtime transcription; persist final segments; emit live caption messages.

**New files:**

```
meeting-notes/
  transcription-bridge.ts   // one OpenAI Realtime WS per participant track
  openai-client.ts          // shared OpenAI SDK setup
```

**File: `apps/api/src/meeting-notes/openai-client.ts`**

1. Initialize OpenAI client with `config.tuning.openAiApiKey`.

2. Export factory:

   ```ts
   export function createTranscriptionSession(input: {
     model: string; // config.tuning.openAiTranscriptionModel
     onDelta: (text: string, itemId: string) => void;
     onFinal: (text: string, itemId: string) => void;
     onError: (err: Error) => void;
   }): TranscriptionSession
   ```

3. Connect to OpenAI Realtime API with `intent: "transcription"`, `input_audio_format: "pcm16"`, `model: openAiTranscriptionModel`.

**File: `apps/api/src/meeting-notes/transcription-bridge.ts`**

4. One `TranscriptionSession` per active egress stream:

   - Forward PCM frames from egress → OpenAI input buffer.
   - On delta: emit unreliable `room.meeting-notes.segment.v1` with `isFinal: false`, stable `segmentId` per OpenAI item.
   - On final: persist `MeetingNotesSegment` with `isFinal: true`, update `participantUserIds` on session, emit reliable segment message (or unreliable — finals can use reliable for durability; choose **reliable for finals** so late joiners can hydrate).

5. Per-stream reconnect with exponential backoff (max 3 retries). On permanent failure, insert a gap marker segment:

   ```
   text: "[audio gap, 12s]"
   isFinal: true
   ```

6. Resolve `speakerUserId` from LiveKit `participantIdentity`.

**File: `apps/api/src/meeting-notes/orchestrator.ts`**

7. Wire egress audio callback → `transcription-bridge.appendAudio(sessionId, participantIdentity, pcmChunk)`.

**Tests:**

8. Fixture-based test with a short `.wav` converted to PCM16 fed through the bridge. Gate behind `OPENAI_INTEGRATION=true`.

**Checkpoint:**

- [ ] Final segments persist and appear in `GET .../sessions/:sessionId`.
- [ ] Unreliable deltas reach a second browser tab via LiveKit data channel.

---

### Phase 5 — Summary, artifact generation, downloads

Goal: finalize transcript files, generate AI summary, upload to R2, expose download endpoints.

**New files:**

```
meeting-notes/
  finalize.ts               // assemble transcript, write txt/vtt/srt
  summary-worker.ts         // gpt-4.1 chat completion
  prompts.ts                // system + user prompt templates
  retention-reaper.ts       // delete expired sessions
  filename.ts               // slugify + timestamp naming
```

**File: `apps/api/src/meeting-notes/finalize.ts`**

1. Load all final segments ordered by `(startMs, speakerUserId)`.

2. Resolve display names from participant records at finalize time.

3. Generate artifacts:

   - **`.txt`:** `[HH:MM:SS] Speaker Name: text` per line.
   - **`.vtt`:** standard WebVTT with `NOTE` header + cues from segment timestamps.
   - **`.srt`:** sequential index + timestamps + text.

4. Upload to R2 under `{storagePrefix}{roomId}/{sessionId}/transcript.{txt,vtt,srt}`.

5. Optional: if `aiMeetingNotesFinalTranscriptionPass`, concatenate temp audio and call `openai.audio.transcriptions.create` with `timestamp_granularities`.

**File: `apps/api/src/meeting-notes/summary-worker.ts`**

6. Build prompt from `prompts.ts` (PLAN § 3.5 shape).

7. Call:

   ```ts
   await openai.chat.completions.create({
     model: config.tuning.openAiSummaryModel,
     messages: [
       { role: "system", content: MEETING_NOTES_SUMMARY_SYSTEM_PROMPT },
       { role: "user", content: transcriptPlainText },
     ],
   });
   ```

8. Retry once on empty/refusal. Upload `summary.md` to R2. Update session with storage keys + `summaryGeneratedAt`. Emit `room.meeting-notes.summary-ready.v1`. Set `status: "ready"`.

9. Delete temp audio prefix for the session.

**File: `apps/api/src/app.ts`**

10. Implement download routes — proxy R2 content with `Content-Disposition` (copy lesson recap pattern at line 3828):

    ```ts
    reply
      .header("Content-Type", "text/plain; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(body);
    ```

11. Implement `POST .../resummarize` — re-run summary worker on existing transcript without re-transcribing.

**File: `apps/api/src/meeting-notes/retention-reaper.ts`**

12. Interval job (start in `app.ts` bootstrap): delete sessions where `endedAt + room.settings.aiMeetingNotes.retentionDays < now`. Remove R2 objects + DB rows.

**Tests:**

13. Summary test with fixed transcript fixture — assert Markdown sections exist (`## TL;DR`, `## Participants`, etc.), not exact wording.

14. VTT/SRT formatter unit tests (no OpenAI).

**Checkpoint:**

- [ ] Stop session → `ready` within reasonable time; downloads return valid files.
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "meeting-notes"` passes.

---

### Phase 6 — Web UI

Goal: right-side panel, REC badge, avatar dots, hook wiring, 2D parity.

**File: `apps/web/lib/api.ts`**

1. Add wrappers:

   ```ts
   export function startMeetingNotesSession(identity, roomId)
   export function patchMeetingNotesSession(identity, roomId, sessionId, action: "stop" | "cancel")
   export function listMeetingNotesSessions(identity, roomId)
   export function getMeetingNotesSession(identity, roomId, sessionId)
   export function deleteMeetingNotesSession(identity, roomId, sessionId)
   export function resummarizeMeetingNotesSession(identity, roomId, sessionId)
   export function meetingNotesTranscriptDownloadUrl(roomId, sessionId, format: "txt" | "vtt" | "srt")
   export function meetingNotesSummaryDownloadUrl(roomId, sessionId)
   export async function downloadMeetingNotesArtifact(identity, url, filename)
   ```

**File: `apps/web/lib/useMeetingNotes.ts`**

2. Mirror `useDynamicWallAnchors.ts`:

   - State: `activeSession`, `history`, `segments` (live map by `segmentId`), `loading`, `error`.
   - `refresh()` on mount + 30 s interval.
   - `handleRealtimeMessage()` for all `room.meeting-notes.*.v1` types.
   - Actions: `start()`, `stop()`, `cancel()`, `deleteSession(id)`, `resummarize(id)`.
   - Derived: `isRecording`, `elapsedSec`, `sortedSegments`.

**File: `apps/web/components/MeetingNotesPanel.tsx`**

3. Props:

   ```ts
   {
     identity: ApiIdentity;
     roomId: string;
     roomName: string;
     meetingNotes: ReturnType<typeof useMeetingNotes>;
     participantNamesByUserId: Record<string, string>;
   }
   ```

4. Render states from PLAN § 2.1 inside `HudCard` (`defaultCollapsed`, title "Meeting Notes").

5. Live transcript area: auto-scroll to bottom on new segments; speaker name from `participantNamesByUserId[speakerUserId]`.

6. Download buttons call `downloadMeetingNotesArtifact` → Blob + anchor click (same as `LessonRecapPanel` lines 67–78).

7. Full-transcript modal on "Open full transcript" during recording.

8. Mobile: `@media (max-width: 768px)` — collapse live area into chip that opens modal (CSS in `globals.css`).

**File: `apps/web/components/RoomClient.tsx`**

9. Mount hook:

   ```tsx
   const meetingNotes = useMeetingNotes({
     identity,
     roomId: session?.room.id,
     enabled: roomTypeFeatures.aiMeetingNotes && CLIENT_TUNING.enableAiMeetingNotes,
   });
   ```

10. Wire realtime handler in `handleMessage` (~line 663):

    ```tsx
    if (meetingNotesRealtimeHandlerRef.current(message)) return;
    ```

11. Insert panel in `room-hud-right` (~line 2094), **after** `AnchorPanel`, **before** `EnvironmentCard`:

    ```tsx
    {roomTypeFeatures.aiMeetingNotes && CLIENT_TUNING.enableAiMeetingNotes ? (
      <MeetingNotesPanel
        identity={identity}
        roomId={roomId}
        roomName={roomName}
        meetingNotes={meetingNotes}
        participantNamesByUserId={participantNamesByUserId}
      />
    ) : null}
    ```

12. Top HUD REC badge (~line 1791, after room name):

    ```tsx
    {meetingNotes.isRecording ? (
      <>
        <div className="room-hud-top-sep" />
        <span className="room-hud-rec-badge" data-testid="meeting-notes-rec-badge">
          ● REC
        </span>
      </>
    ) : null}
    ```

13. Pass `recordingActive={meetingNotes.isRecording}` to `RoomView3D`, `RoomView2D`, and `BlockyAvatar`.

**File: `apps/web/components/BlockyAvatar.tsx`**

14. When `recordingActive && participant.state.media?.microphoneEnabled`, render:

    ```tsx
    <span className="avatar-nameplate__recording-dot" aria-label="Being transcribed" />
    ```

**File: `apps/web/components/RoomView2D.tsx`**

15. Render the same REC chip in the 2D top overlay when `recordingActive`.

**File: `apps/web/app/globals.css`**

16. Add styles:

    - `.room-hud-rec-badge` — red pill, pulsing dot.
    - `.meeting-notes-panel__transcript` — scrollable, monospace timestamps.
    - `.meeting-notes-panel__segment--interim` — reduced opacity for non-final text.
    - `.avatar-nameplate__recording-dot` — small red circle beside mic status.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/web` passes.
- [ ] Manual: two-tab FFA room, start notes, both see REC badge + live captions, stop → downloads work.

---

### Phase 7 — Consent, client fallback, E2E, rollout

**File: `apps/web/components/Lobby.tsx`**

1. When `roomType === "free-for-all" && CLIENT_TUNING.enableAiMeetingNotes`, show consent line in the join/browse panel (PLAN § 2.3). Store acknowledgment in `sessionStorage` key `ffa-meeting-notes-consent-v1` (informational only — joining is the consent action).

**File: `apps/api/src/app.ts`**

2. If `aiMeetingNotesAllowClientFallback`, add:

   ```
   POST /v1/rooms/:roomId/meeting-notes/sessions/:sessionId/audio-chunks
   ```

   Body: `{ participantId, encoding: "pcm16", sampleRate: 16000, data: base64 }`. Forward to transcription bridge. **Reject in production** unless explicitly enabled.

**File: `apps/web/lib/meetingNotesClientFallback.ts`** (new, dev only)

3. When API returns `503 egress_unavailable` and fallback is allowed, start WebAudio mixer and chunk uploader.

**Playwright: `apps/web/test/meeting-notes.spec.ts`**

4. Serial suite (seed FFA room via API, flags on):

   ```ts
   test("participant starts meeting notes and second tab sees REC badge", ...)
   test("stop produces downloadable transcript and summary", ...)
   test("classroom room does not show Meeting Notes panel", ...)
   ```

5. Update `playwright.config.ts` webServer env:

   ```
   ENABLE_FREE_FOR_ALL=true
   NEXT_PUBLIC_ENABLE_FREE_FOR_ALL=true
   ENABLE_AI_MEETING_NOTES=true
   NEXT_PUBLIC_ENABLE_AI_MEETING_NOTES=true
   ```

   For CI transcript tests without OpenAI/LiveKit: mock API returns canned segments on start and stub downloads.

**Docs:**

6. Add AI Meeting Notes section to `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md`.

7. Add OpenAI zero-data-retention + `OPENAI_API_KEY` provisioning steps to `docs/planning/mvp/DEPLOYMENT_CHECKLIST.md`.

**Rollout:**

1. Land Phases 1–7 with both flags `false`. CI green.
2. Staging: enable flags, set `OPENAI_API_KEY`, verify LiveKit Egress on LiveKit Cloud project.
3. Internal walkthrough: 3 participants, 5-minute session, verify transcript accuracy + summary quality.
4. Production: flip flags on. Feature visible only in FFA rooms.

**Checkpoint:**

- [ ] `npm run test:e2e -- --grep "meeting-notes"` passes.
- [ ] Staging walkthrough complete.

---

## Files-to-touch summary

| Area | File | Phase |
|---|---|---|
| Contracts | `packages/contracts/src/index.ts` | 1 |
| OpenAPI | `packages/contracts/openapi/openapi.json` | 1 |
| API config | `apps/api/src/config.ts` | 1, 2 |
| API routes | `apps/api/src/app.ts` | 2, 3, 5, 7 |
| API repository | `apps/api/src/repository.ts` | 2 |
| API persistence | `apps/api/src/models/mongoose.ts` | 2 |
| Meeting notes module | `apps/api/src/meeting-notes/*.ts` | 3, 4, 5, 7 |
| API tests | `apps/api/tests/api.test.ts` | 2, 5 |
| Web config | `apps/web/lib/config.ts` | 1 |
| Web API client | `apps/web/lib/api.ts` | 6 |
| Web hook | `apps/web/lib/useMeetingNotes.ts` | 6 (new) |
| Client fallback | `apps/web/lib/meetingNotesClientFallback.ts` | 7 (new) |
| Web realtime | `apps/web/lib/realtime.ts` | 1, 6 |
| Meeting notes panel | `apps/web/components/MeetingNotesPanel.tsx` | 6 (new) |
| Room client | `apps/web/components/RoomClient.tsx` | 6 |
| Avatars | `apps/web/components/BlockyAvatar.tsx` | 6 |
| 2D view | `apps/web/components/RoomView2D.tsx` | 6 |
| Lobby | `apps/web/components/Lobby.tsx` | 7 |
| Styles | `apps/web/app/globals.css` | 6 |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` | 1, 7 |
| Playwright | `apps/web/test/meeting-notes.spec.ts`, `playwright.config.ts` | 7 |
| Deployment docs | `docs/planning/mvp/DEPLOYMENT_CHECKLIST.md` | 7 |
| Status docs | `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md` | 7 |
| Memory | `.cursor/memory.md` | 7 |

---

## Risks during implementation

| Risk | Mitigation |
|---|---|
| LiveKit Egress not available on self-hosted / dev | Document Cloud-only for production; ship `AI_MEETING_NOTES_ALLOW_CLIENT_FALLBACK` for local QA only. |
| OpenAI Realtime API latency or disconnects | Per-stream reconnect + gap markers; one failed stream must not abort the session. |
| Cost at 30 participants × hour-long session | Env override to `gpt-4o-mini-transcribe` + `gpt-4.1-mini`; optional max-participant cap (`AI_MEETING_NOTES_MAX_PARTICIPANTS`, default unset = room max). |
| Koyeb cannot receive Egress WebSocket audio | Fall back to S3 chunk upload path from Egress; accept higher finalize latency. |
| Transcript out-of-order across speakers | Sort by `(startMs, speakerUserId)` at finalize; live UI may interleave — acceptable. |
| Summary hallucination | System prompt forbids fabrication; omit empty sections; no automated action-item sync to external systems. |
| Consent insufficient for regulated deployments | Feature off by default; GDPR note in PLAN § 7; operator must enable zero-data-retention on OpenAI org. |
| Download proxy loads large transcripts into API memory | Stream R2 → response; set reasonable max transcript size (e.g. 10 MB) with 413 above that. |
| Idle-timeout stops session while participants are present but silent | Only trigger idle stop when **participant count = 0** in LiveKit room, not on silence. |

---

## Open implementation questions (resolved here)

| Question | Decision |
|---|---|
| Single or per-track egress ID? | **Per-track map** on session (`livekitEgressByParticipantId`). |
| Persist interim transcription deltas? | **No.** Unreliable realtime only; DB stores finals. |
| Transcript speaker labels | **Display names** at finalize time. |
| Delete permission | **Any current participant** in the room. |
| Second-pass transcription for VTT/SRT | **Off by default** (`AI_MEETING_NOTES_FINAL_TRANSCRIPTION_PASS=false`). |
| Local dev without LiveKit | **Client fallback** behind `AI_MEETING_NOTES_ALLOW_CLIENT_FALLBACK=true`; rejected in production. |
| Final segment realtime channel | **Reliable** so late joiners hydrate; interim stays unreliable. |
| Auto-start on first join | **Off by default** (`autoStartOnFirstJoin: false`). Explicit start only in v1. |
| Max participants for meeting notes | **No separate cap in v1** unless cost testing warrants `AI_MEETING_NOTES_MAX_PARTICIPANTS` env (optional, unset = use room max). |
| Mid-session rolling summary | **Deferred to Phase 8.** |
| Filename format | `meeting-notes-<slug>-<YYYYMMDD-HHmm>.{ext}` |

---

## Validation evidence (fill in after implementation)

- [ ] `npm run typecheck` — pass
- [ ] `npm test` — pass (existing + new meeting-notes API tests)
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "meeting-notes"` — pass
- [ ] `OPENAI_INTEGRATION=true npm run test -- apps/api/tests/meeting-notes.integration.test.ts` — pass (optional CI secret)
- [ ] `LIVEKIT_INTEGRATION=true npm run test -- apps/api/tests/meeting-notes-egress.integration.test.ts` — pass (optional CI secret)
- [ ] `npm run test:e2e -- --grep "meeting-notes"` — pass
- [ ] Manual staging: 3 participants, 5-min session, transcript + summary downloads verified
- [ ] Manual: REC badge + mic dots visible in 3D and 2D
- [ ] Manual: classroom room does not show Meeting Notes panel

---

## Dependency additions

| Package | Workspace | Purpose |
|---|---|---|
| `openai` | `apps/api` | Realtime transcription + chat completions |
| `livekit-server-sdk` | `apps/api` | Already present — extend usage for EgressClient |

No new frontend dependencies required.
