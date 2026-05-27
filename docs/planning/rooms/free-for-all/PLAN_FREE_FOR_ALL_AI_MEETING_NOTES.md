# Plan — AI Meeting Notes (Free-for-All Room Type)

Source room type: [`PLAN_FREE_FOR_ALL_ROOM.md`](./PLAN_FREE_FOR_ALL_ROOM.md)
Implementation parent: [`IMPL_FREE_FOR_ALL_ROOM.md`](./IMPL_FREE_FOR_ALL_ROOM.md)
Branch target: `room-types` (additive feature; lands after FFA Phase 1)
Last updated: 2026-05-27

---

## 1. Overview

Add an **AI Meeting Notes** capability to Free-for-All rooms. The feature behaves like the meeting-notes utility users expect from Zoom / Google Meet / Teams: while a session is active, the room captures spoken audio from all participants, produces a live running transcript with speaker attribution, and on demand generates an AI summary of the conversation. Both the raw transcript and the summary are downloadable from the same UI surface that toggled the session on.

The feature is **scoped to Free-for-All for v1.** Classroom and Workforce Training already have lesson-run + classroom-state orchestration, and adding meeting-notes to those room types raises additional pedagogical/consent questions (minors, FERPA, lesson recording policy) that are out of scope here. Free-for-All is the right beachhead: rooms are user-organized, participants are equal, and the feature maps cleanly onto its collaborative-meeting use case.

### 1.1 Product goals

1. Anyone in a Free-for-All room can start an AI meeting-notes **session**.
2. While the session is active, a right-side HUD panel shows live transcription with speaker labels.
3. When the session ends (manually or on room-exit by the last participant), the system finalizes the transcript and produces an AI summary.
4. From the same right-side panel, any participant in the room can download:
   - The full transcript (plain `.txt`, plus `.vtt` and `.srt` time-coded variants for archive/replay use).
   - The AI summary (`.md`, plain-text rendered version also available).
5. Consent indicators are visible to every participant the entire time the session is active — including 2D analog viewers.

### 1.2 Non-goals (Phase 1)

- Live multilingual translation (English-only transcription in v1; model supports more, but UX/copy stays English-only initially).
- Real-time captioning overlaid on avatars (separate feature; the LEARNING_FEATURE_IDEAS doc lists captions separately). Phase 1 transcript stays in the panel.
- Per-participant private notes / private highlights.
- Editable transcripts (read-only output in v1).
- Action-item extraction with assignees, calendar integration, or external CRM sync.
- Storing audio long-term (audio is processed and discarded; only transcript + summary persist past the configured retention window).
- Applying meeting-notes to classroom or workforce-training rooms.

---

## 2. UX surface

### 2.1 Right-side HUD panel — "Meeting Notes"

A new `HudCard` mounts in the right-side HUD rail (`room-hud-right`) for Free-for-All rooms when the room-type feature flag `aiMeetingNotes` is true. It follows the same visual idiom as `EnvironmentCard`, `AnchorPanel`, etc.

**Card states:**

| State | What participants see | Available actions |
|---|---|---|
| `idle` (no active session) | "Meeting Notes — Off. Recording is off and no transcript is being captured." plus a history list of previous sessions in this room with download buttons next to each. | **Start meeting notes** (primary) |
| `starting` | Spinner: "Starting recording…" | (Cancel during start) |
| `recording` | Live status: red recording dot + elapsed time. Scrollable transcript area below, newest at bottom, with speaker name + relative timestamp per segment. | **Stop meeting notes**, **Copy transcript so far**, **Open full transcript** (modal) |
| `finalizing` | "Wrapping up… generating summary." Spinner. Live transcript view stays visible (read-only, full session). | (none) |
| `ready` | "Meeting notes ready." Tabbed view: **Summary** \| **Transcript**. | **Download summary (.md)**, **Download transcript (.txt)**, **Download transcript (.vtt)**, **Download transcript (.srt)**, **Re-summarize**, **Delete session** (creator only) |
| `error` | Inline error message with retry guidance. | **Retry**, **Dismiss** |

All download buttons use authenticated `GET` against the API (server returns appropriate `Content-Disposition`); UI uses the same `downloadLessonRecapCsv` pattern already in `apps/web/lib/api.ts`.

### 2.2 Global recording indicator

While a session is `recording` or `finalizing`:

- A red **REC** badge appears in the top HUD bar next to room name (3D and 2D), visible to every participant.
- Each avatar nameplate shows a small microphone-on-recording dot when that participant's audio is currently being captured (i.e., they have a mic published).
- The 2D analog map displays a single global REC chip in the same position as the 3D top-bar badge.

This indicator is non-dismissable and is the single source of truth that recording is happening. It does **not** require teacher-style authority — every participant has equal visibility into it.

### 2.3 Consent gate on join

The first time a new participant enters a Free-for-All room with `aiMeetingNotes` enabled (per-user per-room remembered), the lobby's invite-join panel shows a one-time consent line:

> "Anyone in this room can start recording the conversation and producing an AI transcript and summary. By joining, you understand that your microphone audio may be transcribed."

Joining is the consent action. A participant who does not consent should not join the room. This is intentionally lightweight; v1 does not implement per-participant audio opt-out within a running session (see § 9 Privacy).

### 2.4 Where the panel renders

| View | Mount point |
|---|---|
| 3D | `room-hud-right` rail, between `AnchorPanel` and `EnvironmentCard` (collapsed by default like the others). |
| 2D | `room-hud-right` in the 2D layout, same placement. |

Mobile/narrow viewports collapse the live transcript into a tappable summary chip that opens a full-screen modal.

---

## 3. Architecture

### 3.1 Audio capture — LiveKit Track Egress

LiveKit Cloud is already the canonical realtime transport in production. Use **LiveKit Track Egress** (or **Room Composite Egress** with audio-only) to deliver mixed room audio (or per-track audio) to the API service in near-real time, instead of asking each browser to mix and upload audio.

Recommended Phase 1 path: **per-track egress** so each participant's audio is delivered as a separate stream identified by `participantIdentity`. This gives accurate per-speaker attribution without diarization heuristics.

Why server-side egress and not client-side capture:

- 30 browsers each uploading their own audio doesn't compose cleanly into one transcript and multiplies network and CPU cost on student laptops/Chromebooks.
- LiveKit Egress is purpose-built for this, runs in LiveKit Cloud, and is what production hands like Zoom and Meet use under the hood.
- Server-side capture is the only path that produces a complete record even if one participant's tab crashes mid-session.

Local development without LiveKit (the existing BroadcastChannel fallback) uses a simpler client-side fallback: the browser that started the session captures `navigator.mediaDevices.getUserMedia` for its own mic + the WebAudio destination stream of remote tracks, and chunks it up. This is good enough for local QA but is not the production path.

### 3.2 Transcription pipeline

Two-stage pipeline:

**Stage A — Live streaming transcription (per active session).**

- Per-track audio frames from LiveKit Egress flow through the API to OpenAI's **Realtime API in transcription mode** (model: `gpt-4o-transcribe`).
- The API service maintains one transcription session per LiveKit room participant whose mic is published.
- Partial deltas (interim text) update the panel via a new `room.meeting-notes.segment.v1` realtime message (best-effort, unreliable channel).
- Finalized segments are persisted to MongoDB Atlas (`MeetingNotesSegment` collection) and rebroadcast on the reliable channel.

**Stage B — Final transcript + summary (on session end).**

- When the session ends, the API closes all per-participant transcription streams, waits for any in-flight finalizations, and assembles the canonical chronological transcript ordered by `(segmentStartMs, speakerIdentity)` tiebreak.
- The final transcript is re-run (optional, behind a flag) through **`gpt-4o-transcribe` non-streaming with `timestamp_granularities=["segment", "word"]`** for the highest-quality VTT/SRT output. Phase 1 may skip this step and use the streamed transcript directly to reduce cost.
- The full transcript text is sent to **`gpt-4.1`** for the summary pass with a structured prompt (see § 3.5).
- Both artifacts are written to object storage (R2) and signed-URL download is exposed through the API.

### 3.3 Model selection

| Stage | Model | Why |
|---|---|---|
| Live transcription (streaming) | **`gpt-4o-transcribe`** via the Realtime API in `transcription` mode. | Highest-accuracy current OpenAI transcription model. Streams partial deltas with low latency suitable for live captions. Better than `whisper-1` on noisy, multi-speaker, conversational audio. |
| Cost-tier alternative for transcription | **`gpt-4o-mini-transcribe`** | Used when `OPENAI_TRANSCRIPTION_MODEL` is set to the mini variant for cost-sensitive deployments. Slightly lower WER but ~⅓ the cost. |
| Final clean transcript with timestamps (optional) | **`gpt-4o-transcribe`** non-streaming via `audio/transcriptions` with `response_format=verbose_json` + `timestamp_granularities=["segment","word"]`. | Produces clean VTT/SRT timestamps. Falls back to streamed-segments timestamps if disabled. |
| Summary generation | **`gpt-4.1`** | Strong reasoning + long context, ideal for structured meeting summaries. Up to 1M-token context handles hour-plus sessions trivially. |
| Cost-tier alternative for summary | **`gpt-4.1-mini`** | Used when `OPENAI_SUMMARY_MODEL` is set to mini. Acceptable summary quality at lower cost. |
| Optional rolling mid-session summary | **`gpt-4.1-mini`** | Every N minutes, summarize the running transcript so the UI can show a "so far" recap. Phase 2 enhancement, not v1. |

All model identifiers are passed through environment variables (§ 5) so we can swap as OpenAI deprecates or releases newer transcription/reasoning models without code change.

### 3.4 Data flow diagram

```
   ┌──────────────────────┐
   │  Free-for-All room   │   participants speaking
   │  (LiveKit)           │
   └──────────┬───────────┘
              │ per-track audio
              ▼
   ┌──────────────────────┐
   │  LiveKit Egress      │
   │  (per-track audio)   │
   └──────────┬───────────┘
              │ audio frames (per participant)
              ▼
   ┌──────────────────────┐        ┌──────────────────────────────┐
   │  3DSpace API service │────────►  OpenAI Realtime API         │
   │  meeting-notes/      │        │  model: gpt-4o-transcribe    │
   │  orchestrator        │◄───────│  partial + final deltas      │
   └──────┬───────────┬───┘        └──────────────────────────────┘
          │           │
          │           │ segment.v1 (live)
          │           ▼
          │   ┌─────────────────────────┐
          │   │ Realtime broadcast      │ → rendered in right-side panel
          │   │ (LiveKit data channel)  │
          │   └─────────────────────────┘
          │
          │ persisted segments
          ▼
   ┌──────────────────────┐
   │   MongoDB Atlas      │
   │   MeetingNotesSession│
   │   MeetingNotesSegment│
   └──────┬───────────────┘
          │
          │ on session end
          ▼
   ┌──────────────────────┐        ┌──────────────────────────────┐
   │  Summary worker      │────────►  OpenAI Chat Completions    │
   │                      │        │  model: gpt-4.1              │
   └──────┬───────────────┘        └──────────────────────────────┘
          │
          │ transcript.txt / .vtt / .srt + summary.md
          ▼
   ┌──────────────────────┐
   │  R2 (signed URLs)    │
   └──────────────────────┘
```

### 3.5 Summary prompt outline

The summary worker calls the chat completions endpoint with `model = process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4.1"`, a fixed system prompt, and the full transcript as the user message. Output is structured Markdown:

```
# Meeting Notes — <room name> — <date, ISO 8601>

## Participants
- <name 1>
- <name 2>

## TL;DR
<1–3 sentence summary>

## Discussion highlights
- <bullet>
- <bullet>

## Decisions
- <bullet>

## Action items
- <bullet> (owner: <name or "unassigned">)

## Open questions
- <bullet>
```

The system prompt explicitly instructs the model not to fabricate participants, decisions, or action items, and to omit any section that is not supported by the transcript content. The full prompt template lives in `apps/api/src/meeting-notes/prompts.ts`.

---

## 4. Data and API model

### 4.1 Room-type feature flag

Extend `RoomTypeFeatureFlags` (in `packages/contracts/src/index.ts`) with:

```ts
aiMeetingNotes: boolean;
```

Default `false` in both `CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` and `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS`. Set `true` only for `"free-for-all"`.

### 4.2 Room settings

Add `aiMeetingNotes` to `RoomSettingsSchema`:

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
})
```

These act as room-level defaults. The runtime session itself lives in `MeetingNotesSession` (next section), not on the room manifest.

### 4.3 New entities

#### `MeetingNotesSession`

```ts
{
  id: string;
  roomId: string;
  startedByUserId: string;
  startedAt: string;          // ISO 8601
  endedAt?: string;
  status: "starting" | "recording" | "finalizing" | "ready" | "error" | "cancelled";
  livekitEgressId?: string;   // for cleanup on abort
  audioRetainedUntil?: string; // when raw audio chunks (if any retained) are deleted
  transcriptStorageKeys?: {
    txt?: string;
    vtt?: string;
    srt?: string;
  };
  summaryStorageKey?: string;
  summaryGeneratedAt?: string;
  durationSec?: number;
  participantUserIds: string[]; // anyone who spoke at least one finalized segment
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
```

#### `MeetingNotesSegment`

```ts
{
  id: string;
  sessionId: string;
  roomId: string;
  speakerUserId: string;     // resolved from LiveKit participantIdentity
  startMs: number;           // ms since session start
  endMs: number;
  text: string;
  isFinal: boolean;          // false for interim deltas, true for committed segments
  language?: string;         // detected, e.g. "en"
  createdAt: string;
}
```

Indexes: `MeetingNotesSession { roomId: 1, status: 1 }`, `MeetingNotesSegment { sessionId: 1, startMs: 1 }`.

### 4.4 REST endpoints

All endpoints are scoped to the room and require the caller to be a current participant of that room. There is no teacher/student distinction; in Free-for-All, anyone in the room can start, stop, and download.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/rooms/:roomId/meeting-notes/sessions` | Start a new session. 409 if one is already active in the room. Returns `MeetingNotesSession`. |
| `PATCH` | `/v1/rooms/:roomId/meeting-notes/sessions/:sessionId` | Stop / cancel the active session. Body `{ action: "stop" \| "cancel" }`. |
| `GET` | `/v1/rooms/:roomId/meeting-notes/sessions` | List sessions for this room (most recent first), with status + duration + speaker count. |
| `GET` | `/v1/rooms/:roomId/meeting-notes/sessions/:sessionId` | Fetch a single session, including segments and metadata. |
| `GET` | `/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/transcript.txt` | Download plain-text transcript. |
| `GET` | `/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/transcript.vtt` | Download WebVTT transcript. |
| `GET` | `/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/transcript.srt` | Download SRT transcript. |
| `GET` | `/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/summary.md` | Download summary (Markdown). |
| `POST` | `/v1/rooms/:roomId/meeting-notes/sessions/:sessionId/resummarize` | Re-run the summary on an already-finalized session (e.g. after upgrading the summary prompt). |
| `DELETE` | `/v1/rooms/:roomId/meeting-notes/sessions/:sessionId` | Delete a session. Allowed for the session creator or any participant of the room (parity with FFA's everyone-can-cleanup model). |

Download endpoints return the artifact body with `Content-Disposition: attachment; filename="meeting-notes-<roomName>-<startedAt>.txt"`. Internally they look up the signed R2 URL and proxy the response — same pattern as the existing wall-attachment signed-download flow.

### 4.5 Realtime events

Reliable channel (state):

- `room.meeting-notes.started.v1` — `{ sessionId, startedByUserId, startedAt }`
- `room.meeting-notes.ended.v1` — `{ sessionId, endedAt, status }`
- `room.meeting-notes.summary-ready.v1` — `{ sessionId, summaryStorageKey }`
- `room.meeting-notes.error.v1` — `{ sessionId, errorMessage }`

Unreliable channel (high-frequency captions):

- `room.meeting-notes.segment.v1` — `{ sessionId, segmentId, speakerUserId, startMs, endMs, text, isFinal }`

All client subscriptions are scoped to the active room. The right-side panel listens to both channels and reconciles segment state by `segmentId`, replacing interim deltas when a final segment arrives.

---

## 5. Environment variables

Added in this feature (root `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` as appropriate):

```
# --- AI Meeting Notes (Free-for-All) ---
ENABLE_AI_MEETING_NOTES=false
NEXT_PUBLIC_ENABLE_AI_MEETING_NOTES=false

OPENAI_API_KEY=
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
OPENAI_SUMMARY_MODEL=gpt-4.1

# Optional cost-tier overrides:
# OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
# OPENAI_SUMMARY_MODEL=gpt-4.1-mini

# Maximum minutes of audio per session before auto-stop (matches room setting upper bound).
AI_MEETING_NOTES_MAX_DURATION_MINUTES=120

# Object storage prefix for transcripts and summaries.
AI_MEETING_NOTES_STORAGE_PREFIX=meeting-notes/

# LiveKit Egress reuses LIVEKIT_API_KEY / LIVEKIT_API_SECRET.
# If a dedicated key pair is preferred:
# LIVEKIT_EGRESS_API_KEY=
# LIVEKIT_EGRESS_API_SECRET=
```

Strict env validation throws on missing `OPENAI_API_KEY` in production when `ENABLE_AI_MEETING_NOTES=true`. Local dev with the flag off needs no OpenAI key.

---

## 6. Phased implementation

### Phase 1 — Contracts + feature flags

- Add `aiMeetingNotes` to `RoomTypeFeatureFlags`; turn on only for `"free-for-all"`.
- Add `RoomSettings.aiMeetingNotes` defaults.
- Add `MeetingNotesSessionSchema` and `MeetingNotesSegmentSchema` to contracts.
- Add the realtime message union entries.
- Add env templates and `CLIENT_TUNING.enableAiMeetingNotes`.

### Phase 2 — API: session lifecycle (without OpenAI yet)

- Add Mongoose models + memory-repository impls for `MeetingNotesSession` and `MeetingNotesSegment`.
- Add the REST endpoints in § 4.4 with stubbed transcription (no LiveKit egress, no OpenAI calls; status transitions only).
- Add reliable-channel `started.v1` / `ended.v1` realtime messages.
- Tests in `apps/api/tests/api.test.ts` covering start → stop → retrieve, double-start 409, non-FFA-room rejection.

### Phase 3 — LiveKit Egress integration

- Wire LiveKit Track Egress on session start; capture per-participant audio.
- Persist raw audio to a temp R2 prefix during the session for crash-recovery (deleted after summary).
- Implement Egress cleanup on session stop, cancel, and crash (idle-timeout cleaner).
- Tests: simulate Egress callbacks, validate session transitions; integration test gated behind `LIVEKIT_INTEGRATION=true`.

### Phase 4 — OpenAI transcription

- Implement the per-participant streaming bridge to OpenAI Realtime API in `transcription` mode (`gpt-4o-transcribe`).
- Persist final segments to `MeetingNotesSegment`.
- Emit unreliable `segment.v1` realtime messages.
- Handle reconnects and per-stream backoff; one participant's transcription failure must not abort others.
- Tests: deterministic transcription test using a recorded audio fixture, gated behind `OPENAI_INTEGRATION=true` (uses real OPENAI_API_KEY in CI secret).

### Phase 5 — Summary + downloads

- On session stop, finalize transcript: order segments, generate `.txt`, `.vtt`, `.srt`.
- Call OpenAI chat completions (`gpt-4.1`) with the structured prompt; write `summary.md`.
- Upload all artifacts to R2 under `AI_MEETING_NOTES_STORAGE_PREFIX`.
- Implement download endpoints with signed-URL proxy.
- Emit `summary-ready.v1`.
- Tests: deterministic summary test using a fixed transcript fixture, validating the output sections exist; do not assert on exact wording.

### Phase 6 — Web UI

- New `MeetingNotesPanel.tsx` rendered in `room-hud-right` for FFA rooms when `aiMeetingNotes` is true.
- States as in § 2.1; reuse `HudCard` collapse semantics.
- Top-bar **REC** badge in `RoomClient` top HUD when an active session exists.
- 2D analog parity: identical card in 2D right rail + same global REC chip.
- Avatar nameplate mic-dot styling in `BlockyAvatar`.
- `apps/web/lib/api.ts` adds `startMeetingNotes`, `stopMeetingNotes`, `listMeetingNotes`, `getMeetingNotes`, `meetingNotesDownloadUrl`, `downloadMeetingNotesTranscript(format)`, `downloadMeetingNotesSummary`.
- New `useMeetingNotes(roomId)` hook hydrates session state, listens to realtime messages, and exposes start/stop/download.
- E2E `apps/web/test/meeting-notes.spec.ts`: two-tab FFA room, one participant starts notes, both see REC badge and live transcript card, stop → summary downloads succeed.

### Phase 7 — Consent + polish + rollout

- Lobby join consent line for FFA rooms with the feature on.
- Retention cleaner: scheduled job deletes sessions whose `endedAt + retentionDays` has passed.
- Status doc updates and validation evidence.
- Staging rollout behind `ENABLE_AI_MEETING_NOTES` flag.

---

## 7. Privacy, consent, and safeguards

Recording other people's voices imposes legal, ethical, and product obligations. Phase 1 takes the following baseline:

1. **Highly visible recording indicator.** Persistent REC badge and per-avatar mic dots; never hidden, never opt-outable by anyone — including the participant who started the session.
2. **Consent on join.** Lobby join screen surfaces a one-line notice (§ 2.3). Joining is the consent action.
3. **No silent transcription.** A session must be explicitly started; auto-start is opt-in per room and off by default.
4. **Free-for-All only.** No minor-presence rooms (classroom) capture audio in v1.
5. **Audio is ephemeral.** Raw audio (or its R2 staging copy) is deleted after the session finalizes. Only the transcript and summary persist.
6. **Bounded retention.** Default 30-day retention; sessions auto-purge thereafter. Anyone in the room can delete a session at any time before that.
7. **No third-party hand-off besides OpenAI.** Audio chunks travel to OpenAI for transcription; the OpenAI API key used has [zero data retention](https://openai.com/policies/api-data-usage-policies/) enabled at the org level (operator setup requirement, documented in `DEPLOYMENT_CHECKLIST.md`).
8. **Geographic limits.** If a deployment has GDPR-bound users, this feature should remain off until consent flow and data-residency policy are reviewed (out of scope for this plan).

---

## 8. Failure modes and mitigations

| Failure | Mitigation |
|---|---|
| LiveKit Egress fails to start | Session transitions to `error` with a typed reason; UI shows retry. No partial recording is shown. |
| OpenAI Realtime drops a stream mid-session | Per-participant reconnect with exponential backoff. Other participants' streams keep flowing. Final transcript flags any gap with a `[audio gap, NNs]` marker. |
| Browser tab that started the session disconnects | Server-side egress + transcription continue. Any in-room participant can still stop the session from their UI. |
| All participants leave with session still running | Idle-timeout cleaner ends the session after 60 s of zero participants (configurable) and runs the finalize+summary pipeline. |
| Session exceeds `maxSessionDurationMinutes` | Auto-stop with status `recording → finalizing` and a UI notice. |
| Summary model returns a refusal or empty body | Retry once with a slightly relaxed prompt; if still empty, mark `status: ready` with `summaryStorageKey` absent and surface a UI fallback ("Summary unavailable — transcript still downloadable"). |
| R2 upload failure | Backoff + retry; on permanent failure, mark `status: error` with `errorMessage`; segments remain queryable from the API. |

---

## 9. Technical decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where audio is captured | LiveKit Track Egress (server-side, per-track) | Reliable, scales to 30 participants, gives clean speaker attribution without diarization. |
| Live transcription model | `gpt-4o-transcribe` via Realtime API in `transcription` mode | Highest current OpenAI transcription accuracy; supports streaming partial deltas with low latency. |
| Final transcript timestamps | Streamed segment timestamps in v1; optional `gpt-4o-transcribe` second pass with `timestamp_granularities` behind a flag | Cuts cost by ~½ while keeping VTT/SRT viable; quality upgrade path is one config switch. |
| Summary model | `gpt-4.1` | Strong long-context reasoning; produces the structured Markdown shape we want. Mini variant available via env override. |
| Persistence layout | `MeetingNotesSession` + `MeetingNotesSegment` collections, transcripts/summary in R2 | Mirrors how `WallObject` / `WallAttachment` split metadata from blob storage. Searchable + cheap. |
| Realtime delivery | Reliable channel for state, unreliable channel for live caption deltas | Matches how wall-objects vs avatar state are split today. |
| Who can start/stop/download | Any current participant of the room | Free-for-All's equal-permissions model; no teacher concept exists in this room type. |
| Who can delete a session | Creator or any participant in the room | Matches FFA's cooperative-cleanup norms; § 10 lists this as an open-question candidate for tightening. |
| Room-type scope | Free-for-All only in v1 | Avoids classroom consent/FERPA complications; keeps blast radius small. |
| Recording indicator | Persistent and non-dismissable | Legal/ethical baseline; matches industry norm. |

---

## 10. Open questions

1. Should delete-session be creator-only, or any-participant, or behind the FFA host-class concept? Plan defaults to any-participant for cooperative-cleanup; happy to tighten.
2. Should we expose a per-participant local mute that excludes that participant's audio from transcription (e.g. "private aside" mode), or is consent-on-join sufficient for v1?
3. Should the feature be limited to a configurable max participant count (e.g. ≤ 12) in v1 to bound cost, even though FFA rooms can have up to `MAX_ROOM_PARTICIPANTS`?
4. Do we want a mid-session rolling summary (every N minutes) in v1, or defer to Phase 8?
5. Should transcript downloads include speaker user IDs, display names, or both? Display-name default is friendlier; user-ID variant useful for moderation/auditing.
6. What is the canonical filename format for downloads? Proposed: `meeting-notes-<roomName-slugified>-<YYYYMMDD-HHmm>.{txt,vtt,srt,md}`.
7. Multilingual transcription is supported by `gpt-4o-transcribe` automatically — do we expose a language hint in the UI, or rely on auto-detection?
8. Should we additionally publish meeting-notes events to a webhook (org-level integration) for external archive/search systems? Phase 2 candidate.
9. For deployments without LiveKit Cloud Egress (self-hosted LiveKit OSS), do we ship a fallback client-mixer path, or document the feature as Cloud-only?

---

## 11. Relationship to existing room-type planning

```
Room Types
├── Classroom            (existing, AI Meeting Notes: off)
├── Workforce Training   (existing, AI Meeting Notes: off)
└── Free-for-All         (existing, AI Meeting Notes: on by default in Phase 1)
       │
       └── AI Meeting Notes feature (this plan)
              ├── new RoomTypeFeatureFlags.aiMeetingNotes
              ├── new RoomSettings.aiMeetingNotes
              ├── new MeetingNotesSession + Segment entities
              ├── new /v1/rooms/:roomId/meeting-notes/* REST surface
              ├── new room.meeting-notes.*.v1 realtime messages
              ├── new MeetingNotesPanel right-side HUD card
              ├── new MeetingNotesPanel 2D parity
              └── new global REC indicator + avatar mic dots
```

This plan is fully additive. It does not change the FFA Phase 1 scope, does not regress classroom/workforce-training behavior, and lives behind its own feature flag for staged rollout. A paired `IMPL_FREE_FOR_ALL_AI_MEETING_NOTES.md` should follow once the plan is accepted, mapping each phase above to concrete files and line numbers in the `room-types` branch.
