# Implementation — Live Captions (Free-for-All Room Type)

Source plan: [`PLAN_FREE_FOR_ALL_LIVE_CAPTIONS.md`](./PLAN_FREE_FOR_ALL_LIVE_CAPTIONS.md)
Parent room type: [`IMPL_FREE_FOR_ALL_ROOM.md`](./IMPL_FREE_FOR_ALL_ROOM.md)
Related (separate feature): [`IMPL_FREE_FOR_ALL_AI_MEETING_NOTES.md`](./IMPL_FREE_FOR_ALL_AI_MEETING_NOTES.md)
Branch: `room-types`
Last updated: 2026-05-30

---

## Status / Scope

**Status:** Not started. Planning only.

Implements the **bottom-dock live captions** described in the PLAN. **Web-only, $0** — browser `SpeechRecognition` (Chrome/Edge) per contributor, broadcast over the existing LiveKit data channel, rendered in a viewport-bottom dock shared by 3D and 2D.

**What ships:**

1. A `liveCaptions` room-type feature flag (FFA only) + three `room.captions.*.v1` realtime message schemas in `@3dspace/contracts`.
2. `useSpeechRecognition` — a thin, typed wrapper over the Web Speech API with support detection and error recovery.
3. `useLiveCaptions` — contributor lifecycle (publish) + receiver buffer (subscribe), mirroring `useAvatarReactions` not `useMeetingNotes`.
4. `LiveCaptionsDock` — bottom dock UI: collapsed 2-line peek + expandable scroll tray, speaker attribution, interim/final lines, `Share my captions` toggle.
5. `RoomClient` wiring: handler ref, mic coupling, top-bar `CC` pill, drop-on-leave.
6. Lobby consent line + env templates.

**Out of scope (matches PLAN § 1.2):** server STT, persistence, translation, VTT/SRT export, wall-object captions, non-FFA room types, Safari/Firefox as contributors.

**Key constraint:** **No `apps/api` changes.** No routes, no `AppConfig`, no Mongo, no OpenAPI regeneration.

---

## Codebase context (pre-implementation state)

Line numbers are accurate as of `room-types` HEAD on 2026-05-30.

| File | What matters |
|---|---|
| `packages/contracts/src/index.ts` | `RoomTypeFeatureFlags` **type** at lines 808–834; `NON_CLASSROOM_*` (836–854), `CLASSROOM_*` (856–874), `FREE_FOR_ALL_*` (876–894) flag objects; `getRoomTypeFeatureFlags()` at 898. Meeting-notes realtime schemas at 1912–1964 are the **pattern to mirror** for `room.captions.*.v1`. |
| `apps/web/lib/realtime.ts` | `MeetingNotesRealtimeMessage` union at 61–66; `RealtimeMessage` union at 70–85; `ROOM_OBJECT_UNRELIABLE_TYPES` set at 87–93; `isRealtimeUnreliable()` at 99–101. |
| `apps/web/lib/config.ts` | `CLIENT_TUNING` at line 7; `enableAiMeetingNotes` at line 20 is the sibling pattern. |
| `apps/web/lib/useAvatarReactions.ts` | Whole file (54 lines) is the closest shape: receive map, TTL prune, `drop(participantId)`. |
| `apps/web/components/RoomClient.tsx` | `publishRealtime` at 200–202; hook instantiation block at ~203–272; `*RealtimeHandlerRef` refs at 447–462; `handleMessage` dispatch at 742–756; `participant.leave.v1` handler (calls `dropReaction`) at 758–767; `media.microphoneEnabled` ref (`micEnabledRef`) at 176–177; `fireReaction` publish pattern at 1451–1463; top HUD bar at ~1942; existing `REC` badge at 1949–1953; `.room-shell` / view render at ~1782–1812; right HUD aside at ~2027. |
| `apps/web/components/Lobby.tsx` | FFA meeting-notes consent line at ~648 is the sibling to copy. |
| `apps/web/app/globals.css` | `.room-hud-top` (423), `.room-hud-left` (525), `.room-hud-right` (573), `.room-hud-rec-badge` (623), `--hud-*` tokens, `@media (max-width: 640px)` HUD hiding at ~4055. |
| `.env.example` | `NEXT_PUBLIC_*` block; FFA/meeting-notes flags at lines 137–138. |
| `apps/web/.env.example` | Flags at lines 27–28. |

---

## Plan adjustments (codebase-derived)

**A. Web-only double gate.** Mirror `roomTypeFeatures.aiMeetingNotes && CLIENT_TUNING.enableAiMeetingNotes` but with no API counterpart:

```ts
const liveCaptionsEnabled =
  roomTypeFeatures.liveCaptions &&
  CLIENT_TUNING.enableLiveCaptions &&
  Boolean(session);
```

**B. `RoomTypeFeatureFlags` is a frozen object in three places.** Adding a field to the type requires adding it to **all three** `Object.freeze({...})` literals or `npm run typecheck -w @3dspace/contracts` fails. `true` only in `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS`.

**C. Reuse the reaction TTL/drop pattern, not the meeting-notes session pattern.** `useLiveCaptions` keeps everything in client memory and prunes on `participant.leave.v1` — there is no REST hydration, no 30 s refresh, no `currentSessionId`.

**D. Speaker names resolved at render, not in the message.** The chunk message carries `participantId` only. The dock resolves display names from the `participants`/`participantList` map already threaded through `RoomClient` (same as `useMeetingNotes.speakerLabel`). This keeps payloads small and labels unspoofable.

**E. Single dock mount, shared by 3D and 2D.** Mount `LiveCaptionsDock` as a direct child of `<main className="app-shell room-shell">` in `RoomClient` — a sibling of the `room-stage`, `room-hud-top`, `room-hud-left`, `room-hud-right` layers — so toggling `viewMode` never unmounts it.

**F. `SpeechRecognition` needs local TS types.** `lib.dom.d.ts` does not ship `webkitSpeechRecognition`. Add a minimal ambient declaration inside `useSpeechRecognition.ts` (no global `.d.ts` file).

**G. Interim uses the existing unreliable channel.** Adding `"room.captions.interim.v1"` to `ROOM_OBJECT_UNRELIABLE_TYPES` makes `publish()` send it best-effort (the set name is historical; it gates all unreliable types).

---

## Phase 1 — Contracts

**Goal:** `liveCaptions` flag + caption message schemas exist and typecheck.

**Files:** `packages/contracts/src/index.ts`

**Steps:**

1. Add `liveCaptions: boolean;` to the `RoomTypeFeatureFlags` type (after `sharedBrowsers`, line ~833).
2. Add `liveCaptions: false` to `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` and `CLASSROOM_ROOM_TYPE_FEATURE_FLAGS`; add `liveCaptions: true` to `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS`.
3. After the meeting-notes schemas (line ~1955), add:

   ```ts
   export const LiveCaptionsChunkMessageV1Schema = z.object({
     type: z.literal("room.captions.chunk.v1"),
     roomId: z.string(),
     participantId: z.string(),
     chunkId: z.string(),
     text: z.string().max(2000),
     isFinal: z.literal(true),
     startMs: z.number().int().nonnegative(),
     sentAt: z.number().int()
   });

   export const LiveCaptionsInterimMessageV1Schema = z.object({
     type: z.literal("room.captions.interim.v1"),
     roomId: z.string(),
     participantId: z.string(),
     chunkId: z.string(),
     text: z.string().max(2000),
     sentAt: z.number().int()
   });

   export const LiveCaptionsContributorMessageV1Schema = z.object({
     type: z.literal("room.captions.contributor.v1"),
     roomId: z.string(),
     participantId: z.string(),
     active: z.boolean(),
     sentAt: z.number().int()
   });

   export type LiveCaptionsChunkMessageV1 = z.infer<typeof LiveCaptionsChunkMessageV1Schema>;
   export type LiveCaptionsInterimMessageV1 = z.infer<typeof LiveCaptionsInterimMessageV1Schema>;
   export type LiveCaptionsContributorMessageV1 = z.infer<typeof LiveCaptionsContributorMessageV1Schema>;
   ```

**Checkpoint:** `npm run typecheck -w @3dspace/contracts` passes. No `openapi.json` change (realtime + flag only).

---

## Phase 2 — Realtime + config + env wiring

**Goal:** Caption messages flow through `publish()` / `onMessage` with interim on the unreliable channel; web flag exists.

**Files:** `apps/web/lib/realtime.ts`, `apps/web/lib/config.ts`, `.env.example`, `apps/web/.env.example`

**Steps:**

1. In `realtime.ts`, import the three caption types from `@3dspace/contracts`, then add the union (after `MeetingNotesRealtimeMessage`, line ~66):

   ```ts
   export type LiveCaptionsRealtimeMessage =
     | LiveCaptionsChunkMessageV1
     | LiveCaptionsInterimMessageV1
     | LiveCaptionsContributorMessageV1;
   ```

2. Add `| LiveCaptionsRealtimeMessage` to the `RealtimeMessage` union (line ~85).
3. Add `"room.captions.interim.v1"` to `ROOM_OBJECT_UNRELIABLE_TYPES` (line ~87). Chunk + contributor stay reliable.
4. In `config.ts`, add to `CLIENT_TUNING`:

   ```ts
   enableLiveCaptions: process.env.NEXT_PUBLIC_ENABLE_LIVE_CAPTIONS === "true",
   ```

5. Add `NEXT_PUBLIC_ENABLE_LIVE_CAPTIONS=false` to both env templates (next to the FFA/meeting-notes flags). **Do not** add an `apps/api/.env.example` entry.

**Checkpoint:** `npm run typecheck -w @3dspace/web` passes.

---

## Phase 3 — `useSpeechRecognition`

**Goal:** A reusable, typed wrapper that detects support, starts/stops recognition, and emits interim/final results with auto-restart.

**Files:** `apps/web/lib/useSpeechRecognition.ts` (**new**)

**Steps:**

1. Ambient types at top of file (no global `.d.ts`):

   ```ts
   type SpeechRecognitionResultLike = { transcript: string };
   interface SpeechRecognitionEventLike extends Event {
     resultIndex: number;
     results: ArrayLike<{ 0: SpeechRecognitionResultLike; isFinal: boolean }>;
   }
   interface SpeechRecognitionLike extends EventTarget {
     lang: string; continuous: boolean; interimResults: boolean;
     start(): void; stop(): void; abort(): void;
     onresult: ((e: SpeechRecognitionEventLike) => void) | null;
     onerror: ((e: Event) => void) | null;
     onend: (() => void) | null;
   }
   type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
   ```

2. Support detection:

   ```ts
   function getRecognitionCtor(): SpeechRecognitionCtor | null {
     if (typeof window === "undefined") return null;
     return (window as unknown as {
       SpeechRecognition?: SpeechRecognitionCtor;
       webkitSpeechRecognition?: SpeechRecognitionCtor;
     }).SpeechRecognition ?? (window as unknown as {
       webkitSpeechRecognition?: SpeechRecognitionCtor;
     }).webkitSpeechRecognition ?? null;
   }
   export const speechRecognitionSupported = () => getRecognitionCtor() !== null;
   ```

3. Hook API:

   ```ts
   useSpeechRecognition({
     lang?: string;                 // default "en-US"
     onInterim: (text: string) => void;
     onFinal: (text: string) => void;
     onError?: (code: string) => void;
   }): { supported: boolean; listening: boolean; start(): void; stop(): void };
   ```

4. Behavior:
   - `start()` constructs a recognizer with `continuous = true`, `interimResults = true`, sets `lang`, wires handlers, calls `.start()`, sets `listening = true`.
   - `onresult`: iterate `results` from `resultIndex`; accumulate `isFinal` text → `onFinal`; otherwise concatenate interim → `onInterim`.
   - `onend`: if still intended to listen (a `wantRef` boolean), restart after ~300 ms backoff; otherwise set `listening = false`. (Chrome ends sessions periodically even with `continuous`.)
   - `onerror`: on `not-allowed`/`service-not-allowed` → `onError(code)`, stop and clear intent; on transient (`no-speech`, `network`, `aborted`) let `onend` restart.
   - `stop()` clears intent and calls `.stop()`.
   - Cleanup on unmount: clear intent, `.abort()`.

**Checkpoint:** Temporary dev button logs interim/final to console in Chrome; `supported === false` in Safari.

---

## Phase 4 — `useLiveCaptions`

**Goal:** Receive + buffer caption messages from everyone; manage the local contributor lifecycle and publishing.

**Files:** `apps/web/lib/useLiveCaptions.ts` (**new**)

**Steps:**

1. Signature (mirrors `useAvatarReactions` + the `publish` arg used by `useWallObjects`):

   ```ts
   useLiveCaptions(input: {
     roomId?: string | undefined;
     participantId: string;
     enabled: boolean;
     micEnabled: boolean;
     publish?: (m: RealtimeMessage) => void;
   })
   ```

2. State:
   - `lines: CaptionLine[]` — finalized, sorted by `(sentAt, participantId)`, capped at **100** (`slice(-100)`).
   - `interimByParticipant: Map<participantId, { chunkId; text; sentAt }>`.
   - `contributors: Set<participantId>` — who is actively sharing (from `contributor.v1` + first chunk; pruned on stop/leave/TTL ~10 s without updates).
   - `sharing: boolean` — local opt-in toggle state.
   - `error: string` — e.g. mic-permission denied.

3. `handleRealtimeMessage(message): boolean` — return `true` if handled:
   - `room.captions.chunk.v1` → upsert/replace the matching interim for `(participantId, chunkId)`, push final line, trim, add to `contributors`.
   - `room.captions.interim.v1` → set `interimByParticipant[participantId]`, add to `contributors`.
   - `room.captions.contributor.v1` → add/remove from `contributors`; on `active:false` also clear that participant's interim.
   - else `return false`.

4. Local contribution via `useSpeechRecognition`:
   - `enableSharing()` → require `enabled && micEnabled && speechRecognitionSupported()`; set `sharing=true`; record `startedAtMs = Date.now()`; publish `contributor.v1 {active:true}`; `recognition.start()`.
   - `disableSharing()` → `sharing=false`; `recognition.stop()`; publish `contributor.v1 {active:false}`.
   - `onInterim(text)` → throttle to ~6 Hz (rAF or `Date.now()` gate); publish `interim.v1 { chunkId: currentUtteranceId, text, sentAt }` and update local interim immediately for self-preview.
   - `onFinal(text)` → publish `chunk.v1 { chunkId, text, isFinal:true, startMs: Date.now()-startedAtMs, sentAt }`, append to local `lines`, mint a new `currentUtteranceId` for the next utterance.
   - `onError("not-allowed")` → set `error`, `disableSharing()`.

5. Effects:
   - When `micEnabled` flips to `false` while `sharing` → auto `disableSharing()` and set a transient "Mic off — captions paused" note.
   - `dropContributor(participantId)` exported for `RoomClient` to call on `participant.leave.v1` (removes from `contributors` + clears interim; keep their already-final lines).
   - Unmount: `disableSharing()`.

6. Return: `{ lines, interimByParticipant, contributors, sharing, supported, error, enableSharing, disableSharing, handleRealtimeMessage, dropContributor, copyVisible }`.

**Checkpoint:** Two Chrome windows in an FFA room — speaking in A pushes final lines into B's hook state (verify via `window.__debug` log or temporary render).

---

## Phase 5 — `LiveCaptionsDock` + CSS

**Goal:** Bottom dock renders the buffer per PLAN § 2.

**Files:** `apps/web/components/LiveCaptionsDock.tsx` (**new**), `apps/web/app/globals.css`

**Steps:**

1. Component props:

   ```ts
   {
     controller: ReturnType<typeof useLiveCaptions>;
     speakerLabel: (participantId: string) => string;
     selfParticipantId: string;
   }
   ```

2. Layout (single dock, `role="log" aria-live="polite"`):
   - **Header row** (`.room-captions-dock__bar`): `CC` badge; contributor chips `Captioning: A, B (+N)` from `controller.contributors` via `speakerLabel`; `Share my captions` toggle (`hud-btn`, `hud-btn--active` when `sharing`, `disabled` + tooltip when `!supported`); expand/collapse chevron; **Copy** button (expanded only).
   - **Transcript** (`.room-captions-dock__lines`): map `controller.lines` to rows (`[mm:ss] Speaker  text`); show the speaker pill only when speaker changes or >8 s gap; append interim rows (muted italic) from `interimByParticipant`. Collapsed = clamp to 2 visible lines; expanded = scrollable up to `32vh`.
   - Auto-scroll to bottom on new final line via a ref + `scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" })`.
3. Empty/edge states: `!supported` → toggle disabled + "Chrome or Edge required to share captions"; `error` → inline note; no lines + has contributors → "Waiting for speech…".
4. CSS (`globals.css`, near `.room-hud-right` ~573), using `--hud-*` tokens + backdrop blur:

   ```css
   .room-captions-dock {
     position: absolute;
     bottom: 6px;
     left: calc(var(--hud-lw) + 18px);
     right: calc(var(--hud-pw) + 18px);
     z-index: 21;
     display: flex;
     flex-direction: column;
     gap: 4px;
     max-height: 32vh;
     pointer-events: none;
   }
   .room-captions-dock > * { pointer-events: auto; }
   .room-captions-dock--collapsed { max-height: 4.5rem; }
   /* .room-captions-dock__bar, __lines, __line, __speaker, __interim, __chip, __cc-badge … */
   ```

   In the `@media (max-width: 640px)` block (~4055), override `.room-captions-dock { right: 6px; }` (right HUD is hidden there).

**Checkpoint:** Dock renders over both 3D and 2D; collapse/expand works; lines wrap; clears left/right HUD columns at desktop width and spans wider on mobile.

---

## Phase 6 — `RoomClient` integration

**Goal:** Hook is instantiated, routed, mic-coupled, mounted, and surfaced in the top bar.

**Files:** `apps/web/components/RoomClient.tsx`

**Steps:**

1. Import `useLiveCaptions`, `LiveCaptionsDock`, `CLIENT_TUNING`.
2. Compute the gate near `roomTypeFeatures` (line ~218):

   ```ts
   const liveCaptionsEnabled =
     roomTypeFeatures.liveCaptions && CLIENT_TUNING.enableLiveCaptions && Boolean(session);
   ```

3. Instantiate in the hook block (~203–272), after `meetingNotes`:

   ```ts
   const liveCaptions = useLiveCaptions({
     roomId: session?.room.id ?? roomId,
     participantId: session?.participantId ?? identity.userId,
     enabled: liveCaptionsEnabled,
     micEnabled: media.microphoneEnabled,
     publish: publishRealtime
   });
   ```

4. Add a handler ref next to the others (~447–462):

   ```ts
   const liveCaptionsRealtimeHandlerRef = useRef(liveCaptions.handleRealtimeMessage);
   liveCaptionsRealtimeHandlerRef.current = liveCaptions.handleRealtimeMessage;
   ```

5. Route in `handleMessage` (~742, before the `message.type.startsWith` early returns) and add a `startsWith` guard:

   ```ts
   if (liveCaptionsRealtimeHandlerRef.current(message)) return;
   // …
   if (message.type.startsWith("room.captions.")) return;
   ```

6. In the `participant.leave.v1` handler (~758), add `liveCaptions.dropContributor(message.participantId);` next to `dropReaction(...)`.
7. Mount the dock inside `<main className="app-shell room-shell">` (sibling of `room-stage`, after the right HUD `aside`, ~2027):

   ```tsx
   {liveCaptionsEnabled && session ? (
     <LiveCaptionsDock
       controller={liveCaptions}
       speakerLabel={(id) => participantNameMap.get(id) ?? id}
       selfParticipantId={session.participantId}
     />
   ) : null}
   ```

   Reuse the existing `participantNameMap`/`participantList` name resolver already in `RoomClient`.
8. Top-bar `CC` pill: in `room-hud-top` next to the `REC` badge (~1949):

   ```tsx
   {liveCaptionsEnabled && liveCaptions.contributors.size > 0 ? (
     <span className="room-hud-cc-badge" data-testid="live-captions-cc-badge">CC</span>
   ) : null}
   ```

   Add `.room-hud-cc-badge` to `globals.css` (amber/neutral, distinct from the red `.room-hud-rec-badge`).

**Checkpoint:** Two Chrome tabs in an FFA room with flags on: A enables share + mic → B sees lines in the dock and a `CC` pill appears in both top bars; muting A's mic stops new lines within ~1 s.

---

## Phase 7 — Lobby consent + polish

**Goal:** Consent copy, reduced-motion, and final acceptance.

**Files:** `apps/web/components/Lobby.tsx`, `apps/web/app/globals.css`

**Steps:**

1. In the FFA join section (~648, beside the meeting-notes consent), render the PLAN § 2.6 line when `CLIENT_TUNING.enableLiveCaptions` (and the room is/will be FFA):

   > Participants may optionally share live captions using their browser (Chrome or Edge). Caption text is sent to others in the room over realtime channels; audio may be processed by your browser vendor. No transcript is stored on 3DSpace servers.

2. Respect `prefers-reduced-motion` for auto-scroll and the `CC` pulse.
3. Confirm `CC` and `REC` can both show without overlap/confusion.

**Checkpoint:** Consent line visible on FFA join only when the flag is on.

---

## Acceptance criteria (from PLAN § 7)

- [ ] FFA room with flags on: bottom dock renders in 3D and 2D; single mount survives view switches.
- [ ] Chrome contributor enables **Share my captions** + mic on → speech appears in the dock for all participants within ~2 s.
- [ ] Speaker name + relative timestamp per final line; speaker pill collapses on repeats within 8 s.
- [ ] Interim text updates in place; final replaces interim with no duplicate row.
- [ ] Muting mic or toggling off stops new lines within ~1 s and shows the paused note.
- [ ] Safari/Firefox participant sees the dock but the share toggle is disabled with the Chrome/Edge message.
- [ ] No network calls to `apps/api` or any STT vendor billed to 3DSpace during captioning (verify Network tab: only LiveKit data + browser-internal speech).
- [ ] `CC` (captions) and `REC` (meeting notes) coexist with distinct badges and no shared panel.

## Validation evidence (fill in)

- [ ] `npm run typecheck -w @3dspace/contracts`
- [ ] `npm run typecheck -w @3dspace/web`
- [ ] `npm run typecheck`
- [ ] `npm test` (no new API tests expected; confirm suite still green)
- [ ] Manual: two-Chrome-tab FFA smoke (lines cross, `CC` pill, mute stops)
- [ ] Manual: Safari viewer sees dock, cannot share
- [ ] Manual: dock does not obscure dpad/floor at desktop or mobile widths

## Risks & mitigations (from PLAN § 5)

| Risk | Mitigation |
|---|---|
| Safari/iPad cannot contribute | View-only dock + disabled toggle with explanation |
| Bottom dock obscures dpad/floor | Left/right insets; collapsed default; `max-height` cap; mobile override |
| Interim floods data channel | ~6 Hz throttle + unreliable channel |
| Confusion with AI Meeting Notes | Separate flags, `CC` vs `REC`, no shared component |
| Contributor audio leaves to Google | Accurate lobby/dock consent copy |
| No history for late joiners | Documented v1 limitation |
| Double mic capture (LiveKit + SR) | Chromebook smoke test |

## Files summary

**New:**

- `apps/web/lib/useSpeechRecognition.ts`
- `apps/web/lib/useLiveCaptions.ts`
- `apps/web/components/LiveCaptionsDock.tsx`

**Modified:**

- `packages/contracts/src/index.ts`
- `apps/web/lib/realtime.ts`
- `apps/web/lib/config.ts`
- `apps/web/components/RoomClient.tsx`
- `apps/web/components/Lobby.tsx`
- `apps/web/app/globals.css`
- `.env.example`, `apps/web/.env.example`

**Untouched:** all of `apps/api`, `packages/contracts/openapi/openapi.json`, `packages/room-engine`.
