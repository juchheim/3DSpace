# Implementation — Verse Live Translation

Companion plan: [`PLAN_VERSE_TRANSLATION.md`](./PLAN_VERSE_TRANSLATION.md)
Branch target: `feature/verse-translation`
Last updated: 2026-06-13

This maps the plan to concrete files, schemas, and function signatures. It reuses the **AI Meeting Notes** scaffolding (contracts → REST → realtime → HUD panel → feature flags) and the **Live Captions** client pipeline (`useSpeechRecognition` → text chunks → LiveKit data channel → dock). Read the plan §0 and §7 first.

Line numbers below are anchors at time of writing; confirm before editing.

---

## Architecture recap (one paragraph)

Speaker's browser does on-device STT (`useSpeechRecognition`, Web Speech API) in the speaker's chosen language and publishes each finalized utterance as `room.translation.utterance.v1` (original text + `sourceLang`) over the LiveKit data channel. Each listener, on receiving a foreign-language utterance, calls `POST /v1/rooms/:roomId/translate` (server holds the OpenAI key, caches by `(src,tgt,text)`) and renders the result in a `TranslationDock` in the listener's own language. No translated text is ever broadcast; each client resolves its own language. Everything is gated by `translation` room-type flag + `ENABLE_TRANSLATION` / `NEXT_PUBLIC_ENABLE_TRANSLATION` + `room.settings.translation.enabled`.

---

## Phase 1 — Contracts + feature flags

### 1.1 `packages/contracts/src/index.ts`

**Room-type flag.** Add `translation: boolean;` to `RoomTypeFeatureFlags` (after `liveCaptions`, ~line 1528). Set values in each frozen table:

- `NON_CLASSROOM_*`: `false`
- `CLASSROOM_*`: `false` (classroom consent/FERPA deferred)
- `FREE_FOR_ALL_*`: `true`
- `ESCAPE_ROOM_*`: `false`
- `VERSE_ROOM_TYPE_FEATURE_FLAGS`: `true`  ← primary target (~line 1635)

`getRoomTypeFeatureFlags()` needs no change (it returns the frozen tables).

**Room settings.** Add to `RoomSettingsSchema` (near `aiMeetingNotes`, ~line 1753):

```ts
translation: z.object({
  enabled: z.boolean().default(true),
  defaultTargetLanguage: z.string().optional(), // BCP-47; client falls back to navigator.language
}).default({ enabled: true }),
```

`verseRoomSettings()` (`apps/api/src/rooms-core/settings.ts`) inherits the base `enabled: true`; `escapeRoomSettings()` may force `enabled:false` for symmetry (optional). Add a `normalizeRoomRecord()` heal if any pre-shipment verse rooms persist `translation.enabled:false` (mirror the `aiMeetingNotes` heal at `apps/api/src/repository.ts` ~64–71) — only needed if rooms were saved before this ships.

**Language code helper (optional but recommended).** Add a small curated list + normalizer used by both web and (optionally) API:

```ts
export const TRANSLATION_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" }, { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },  { code: "de", label: "German" },
  // … ~20 well-supported langs …
];
export function translationLanguageLabel(code: string): string { /* normalize en-US→English */ }
```

**Realtime message schemas.** Add near the captions schemas (~line 3013):

```ts
export const TranslationUtteranceMessageV1Schema = z.object({
  type: z.literal("room.translation.utterance.v1"),
  roomId: z.string(),
  participantId: z.string(),
  utteranceId: z.string(),
  sourceLang: z.string(),          // BCP-47 of the spoken text
  text: z.string().max(2000),
  isFinal: z.boolean(),            // true = translate + persist line; false = interim/dim
  startMs: z.number().int().nonnegative(),
  sentAt: z.number().int(),
});

// Optional Phase 2 fan-out:
export const TranslationLangMessageV1Schema = z.object({
  type: z.literal("room.translation.lang.v1"),
  roomId: z.string(), participantId: z.string(),
  targetLang: z.string(), active: z.boolean(), sentAt: z.number().int(),
});
```

Export inferred types (`TranslationUtteranceMessageV1`, …) alongside the captions exports (~line 3041+).

**REST schemas.** Add request/response (near the meeting-notes request schemas):

```ts
export const TranslateRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  sourceLang: z.string().min(2).max(20),
  targetLang: z.string().min(2).max(20),
  context: z.array(z.string().max(2000)).max(3).optional(),
});
export const TranslateResponseSchema = z.object({
  translatedText: z.string(),
  sourceLang: z.string(), targetLang: z.string(),
  cached: z.boolean(), model: z.string(),
});
```

**Error codes.** Add to the API error-code enum (~line 1465): `"translation-unavailable"`, `"translation-failed"`.

**OpenAPI.** Add the `/v1/rooms/{roomId}/translate` POST entry to the route registry block (~line 4281) and regenerate the OpenAPI artifact per the repo's generation step.

### 1.2 `apps/web/lib/config.ts`

Add to `CLIENT_TUNING` (~line 19):

```ts
enableTranslation: process.env.NEXT_PUBLIC_ENABLE_TRANSLATION === "true",
```

### 1.3 `apps/api/src/config.ts`

Add to `tuning` (near the meeting-notes models, ~line 359):

```ts
enableTranslation: envBoolean(raw, "ENABLE_TRANSLATION", false),
openAiTranslationModel: envString(raw, "OPENAI_TRANSLATION_MODEL") ?? "gpt-4.1-mini",
translationRateLimitPerMinute: envNumber(raw, "TRANSLATION_RATE_LIMIT_PER_MINUTE", 240),
translationMaxInputChars: envNumber(raw, "TRANSLATION_MAX_INPUT_CHARS", 2000),
```

Extend the production validation block (where it requires `OPENAI_API_KEY` for meeting notes/AI host, ~247–249) to also require it when `enableTranslation` is true.

### 1.4 Env templates

Add the §6 block from the plan to root `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`.

### 1.5 `apps/web/lib/realtime.ts`

- Add the new message types to the `RealtimeMessage` union (~76–118).
- In `isRealtimeUnreliable` (~116–118), classify **interim** `utterance.v1` (`isFinal:false`) and `room.translation.lang.v1` as unreliable; finals are reliable. (Simplest: treat the whole `utterance.v1` as reliable and skip interims entirely in v1 — see Phase 3 note.)

**Validation:** `npm run typecheck -w @3dspace/contracts`, `-w @3dspace/api`, `-w @3dspace/web`.

---

## Phase 2 — Server translate endpoint

### 2.1 Availability guard — `apps/api/src/http/auth-guards.ts`

Add next to `assertMeetingNotesAvailable` (~49–54):

```ts
export async function assertTranslationAvailable(repository, config, roomId, auth) {
  const { room } = await requireRoomAccess(repository, roomId, auth);
  if (!config.tuning.enableTranslation) throw forbidden("Translation is disabled");
  if (!getRoomTypeFeatureFlags(room.type).translation) throw forbidden("Translation is not available for this room type");
  if (!room.settings.translation?.enabled) throw forbidden("Translation is disabled for this room");
  return room;
}
```

### 2.2 Translation service — `apps/api/src/translation/service.ts` (new)

```ts
export interface TranslateInput { text: string; sourceLang: string; targetLang: string; context?: string[]; }
export interface TranslateResult { translatedText: string; cached: boolean; model: string; }

export async function translateText(config, input: TranslateInput, cache: TranslationCache): Promise<TranslateResult>
```

Behavior:
1. **Short-circuit:** if `normalize(sourceLang) === normalize(targetLang)` → return `{ translatedText: text, cached:false, model:"identity" }`.
2. **Cache:** `key = sha1(`${src}|${tgt}|${text}`)`; on hit return `{ ..., cached:true }`.
3. **No key:** if `!config.openAiApiKey` → return `{ translatedText: text, cached:false, model:"passthrough" }` (graceful degrade, like Meeting Notes summary fallback).
4. **Model call:** copy the `fetch("https://api.openai.com/v1/chat/completions", …)` shape from `apps/api/src/meeting-notes/service.ts` `summarizeMeetingNotes`, with `model = config.tuning.openAiTranslationModel`, `temperature: 0`. Reuse its 429 retry/backoff helper (the one in `transcribeAudioChunk`).
5. **Prompt:** fixed system prompt from plan §4.3; user message = `text`; prepend `context` lines as prior assistant/user turns if provided, instructing "translate only the final line."
6. On error → throw a typed error mapped to `translation-failed`.

### 2.3 Cache — `apps/api/src/translation/cache.ts` (new)

Small LRU (cap ~5–10k entries) `Map`-backed, instantiated once in `apps/api/src/app.ts` (next to `MeetingNotesAudioStore`, ~line 61) and injected via `AppContext`. Same "in-memory, lost on restart, acceptable" posture. Phase 2-opt: Mongo/KV backing for cross-instance hits.

### 2.4 Route — `apps/api/src/routes/translation.ts` (new)

```ts
export function registerTranslationRoutes(app, ctx) {
  app.post("/v1/rooms/:roomId/translate", async (req, reply) => {
    const auth = await requireAuth(req);
    const body = TranslateRequestSchema.parse(req.body);
    await assertTranslationAvailable(ctx.repository, ctx.config, req.params.roomId, auth);
    enforceRateLimit(auth.userId, req.params.roomId, ctx.config.tuning.translationRateLimitPerMinute);
    const result = await translateText(ctx.config, body, ctx.translationCache);
    return TranslateResponseSchema.parse({ ...result, sourceLang: body.sourceLang, targetLang: body.targetLang });
  });
}
```

Register in `apps/api/src/routes/register-routes.ts` (next to meeting-notes at line 44). Rate-limit helper can mirror the AI-host chat per-hour limiter (`apps/api/src/routes/ai-host.ts`).

### 2.5 Tests — `apps/api/tests/routes/translation.test.ts` (new)

- member-only (non-member → 403/401);
- room with `translation.enabled:false` → 403;
- non-verse/non-FFA room type → 403;
- `sourceLang === targetLang` → identity, no model call (assert via a stub);
- second identical request → `cached:true`;
- no `OPENAI_API_KEY` → `model:"passthrough"`, original text;
- rate limit exceeded → 429.

Mock OpenAI like the meeting-notes tests (no live calls).

**Validation:** `npm run test -- apps/api/tests/routes/translation.test.ts`.

---

## Phase 3 — Client capture + broadcast (`useTranslation`)

### 3.1 `apps/web/lib/useTranslation.ts` (new) — model on `useLiveCaptions.ts`

Inputs:

```ts
useTranslation({
  roomId, participantId,
  enabled,                 // translationEnabled (gate)
  micEnabled,              // from media
  readLang, speakLang,     // BCP-47 (localStorage-backed in v1)
  sharing,                 // "Share my speech" toggle
  publish,                 // publishRealtime
})
```

Capture (speaker side): reuse `useSpeechRecognition({ lang: speakLang, onInterim, onFinal, onError })` **unchanged** (`apps/web/lib/useSpeechRecognition.ts`).

- `onFinal(text)` → assign `utteranceId = newId()`, `startMs = now - sharingStartedAt`, publish `room.translation.utterance.v1 { isFinal:true }` (reliable), and push a local line (your own text in source).
- `onInterim(text)` → **v1: render locally dimmed only**; optionally publish interim (unreliable) for others' "typing" feel — guarded by a debounce like captions' `INTERIM_MIN_INTERVAL_MS`. Simplest v1: skip publishing interims.
- Mirror captions' lifecycle: `enableSharing`/`disableSharing`, mic-off auto-stop, unmount cleanup, error→friendly copy (`speechErrorMessage`).

Receive (listener side): `handleRealtimeMessage(message)` returns boolean (like captions):

- On `utterance.v1` from another participant with `isFinal:true`:
  - if `normalize(sourceLang) === normalize(readLang)` → push line as-is (`translatedFrom:null`);
  - else enqueue a translate request (see 3.2); push a placeholder line that updates in place when the translation resolves, keyed by `(participantId, utteranceId)`.
- Dedupe by `(participantId, utteranceId)`; ignore your own.

State exposed: `lines` (each `{ id, participantId, utteranceId, sourceText, displayText, sourceLang, translatedFrom, startMs, sentAt, pending }`), `interimByParticipant`, `sharing`, `listening`, `supported`, `error`, `dockOpen`, plus `setReadLang`, `setSpeakLang`, `toggleSharing`, `handleRealtimeMessage`, `copyVisible`, `speakerLabel` passthrough.

### 3.2 Listener translate calls — `apps/web/lib/api.ts`

Add (near meeting-notes helpers ~1272–1343):

```ts
export async function translateText(roomId, body: { text; sourceLang; targetLang; context? }): Promise<TranslateResponse>
```

In the hook, maintain a **client-side cache** `Map<hash, string>` so re-renders / language re-selection don't refetch, and a small in-flight de-dupe so two lines needing the same string don't double-call. On failure, fall back to showing the original text with a subtle "translation unavailable" marker (don't drop the line).

**Validation:** unit-test the reducer (dedupe, self-skip, same-lang passthrough, placeholder→resolved update) similar to existing hook tests.

---

## Phase 4 — Render: `TranslationDock`

### 4.1 `apps/web/components/TranslationDock.tsx` (new) — model on `LiveCaptionsDock.tsx`

- Same bottom-dock chrome, ordering by `sentAt`/`startMs`, speaker grouping, auto-scroll (reduced-motion aware), Copy, idle "peek" button.
- Each row: time · speaker · `displayText`. If `translatedFrom`, append a muted `(translated from <label> · show original)`; clicking toggles `sourceText`/`displayText` for that row.
- `pending` rows render dimmed with a tiny spinner/ellipsis until the translation resolves.
- Interim rows: dimmed, untranslated, replaced by the final.
- CSS: add `.translation-dock*` to `apps/web/app/globals.css` reusing `.room-captions-dock*` tokens (`--hud-*`); verse hue applies via the `<main>` style already in `RoomClient`.

---

## Phase 5 — Right-HUD panel + RoomClient wiring

### 5.1 `apps/web/components/TranslationPanel.tsx` (new) — model on `MeetingNotesPanel.tsx`

`HudCard title="Translation"` with:

- **Show me captions in:** `<select>` bound to `readLang` (options from `TRANSLATION_LANGUAGES` + "Other").
- **Translate others' speech** toggle (master read switch).
- **Share my speech** button (`hud-btn--active` when on, disabled if `!supported` or `!micEnabled`, with the captions-style tooltip) + **I speak:** `<select>` bound to `speakLang`.
- Status line: listening/translating/mic-off/unsupported, reusing Live Captions copy.
- `forceExpanded` when sharing or when foreign lines are arriving; `hasAlert` on error.

### 5.2 `apps/web/components/RoomClient.tsx`

- Gate (near `meetingNotesEnabled`, ~361):
  ```ts
  const translationEnabled = roomTypeFeatures.translation && CLIENT_TUNING.enableTranslation && Boolean(session);
  ```
- `readLang`/`speakLang` state seeded from `localStorage` (`3dspace.translation:{userId}`) defaulting to `navigator.language`; persist on change.
- Instantiate `const translation = useTranslation({ roomId, participantId: session.participantId, enabled: translationEnabled, micEnabled: media.microphoneEnabled, readLang, speakLang, sharing, publish: publishRealtime })`.
- Register the realtime handler ref in the `handleMessage` chain (~1846), next to `meetingNotesRealtimeHandlerRef` / `liveCaptionsRealtimeHandlerRef`:
  ```ts
  if (translationRealtimeHandlerRef.current(message)) return;
  ```
- Mount `<TranslationPanel … />` in `room-hud-right` > `hud-panel` (after `MeetingNotesPanel`, ~3657) gated by `translationEnabled && session`.
- Mount `<TranslationDock … />` near the existing captions dock placement (bottom strip), passing `speakerLabel` and `selfParticipantId`.
- Top-bar capture chip: when `translation.sharing` (any participant) → small "🎙" indicator next to the REC badge (~3342). v1 can show only the local sharing state; full "anyone sharing" needs the `lang`/contributor presence (Phase 9) — acceptable to scope to local in v1.
- Optional: pass `sharingActive` to `BlockyAvatar` for a per-avatar dot, reusing the Meeting Notes `recordingActive` dot wiring (~3151).

**Validation:** `npm run typecheck -w @3dspace/web`, `npm run build -w @3dspace/web`.

---

## Phase 6 — 2D parity + polish

- Render `TranslationDock` in the 2D layout branch of `RoomClient` (wherever Live Captions renders in 2D), same props.
- Curated language list; "Other" free BCP-47 input.
- Reduced-motion, mic-off and unsupported-browser hints (reuse captions copy).
- Empty/idle states ("Pick a language and others' speech will appear here.").

---

## Phase 7 — Tests + rollout

### 7.1 Playwright — `apps/web/test/translation.spec.ts` (new)

Two tabs in a verse room with `ENABLE_TRANSLATION=true` / `NEXT_PUBLIC_ENABLE_TRANSLATION=true` (add to `playwright.config.ts` like other flags). Because real Web Speech can't run headless, **inject utterances directly**: expose a debug hook (like the physics `requestJump` debug hooks) `window.__translationEmit(utterance)` that calls the hook's publish path, OR assert at the realtime layer.

Flow:
- Tab A: open Translation card, set "I speak: English", emit a final utterance "hello".
- Tab B: set "Show me: Spanish"; assert a dock line appears with the Spanish translation (stub the `/translate` endpoint in test to return a deterministic string), attributed to A.
- Tab B clicks "show original" → sees "hello".
- Same-language tab sees passthrough (no translate call).

### 7.2 Rollout

- Ship behind `ENABLE_TRANSLATION` (default off). Enable in staging verse rooms first.
- Confirm OpenAI org key has zero-data-retention before enabling in any room with minors.
- Update `MVP_STATUS.md` if relevant; update `.cursor/memory.md`.

---

## Optional later phases (additive, same flags)

- **Phase 8 — Persisted language.** `user.preferredLanguage` on `UserSchema`; `PATCH /v1/users/me/language`; `user.language.v1` realtime — template: avatar body (`PATCH /v1/users/me/body`, `avatar.body.v1`). Seed `readLang`/`speakLang` from it; People-panel flags.
- **Phase 9 — Speaker fan-out.** `room.translation.lang.v1` presence + `POST /v1/rooms/:id/translate/batch` + `room.translation.bundle.v1`. Listener-pull stays the fallback.
- **Phase 10 — Server STT (v2 capture).** Replace Web Speech with MediaRecorder chunks → `gpt-4o-transcribe` streaming (reuse Meeting Notes capture path) to remove the Chrome/Edge + manual-source-lang limits.
- **Phase 11 — TTS.** OpenAI TTS playback of translated lines, opt-in per listener, ducking the original audio.

---

## New / touched files

**New**
- `apps/api/src/translation/service.ts`
- `apps/api/src/translation/cache.ts`
- `apps/api/src/routes/translation.ts`
- `apps/api/tests/routes/translation.test.ts`
- `apps/web/lib/useTranslation.ts`
- `apps/web/components/TranslationDock.tsx`
- `apps/web/components/TranslationPanel.tsx`
- `apps/web/test/translation.spec.ts`

**Touched**
- `packages/contracts/src/index.ts` (flags, settings, realtime, REST, error codes, OpenAPI, language helper)
- `apps/api/src/config.ts` (env tuning + prod validation)
- `apps/api/src/http/auth-guards.ts` (`assertTranslationAvailable`)
- `apps/api/src/app.ts` (instantiate cache, inject via `AppContext`)
- `apps/api/src/routes/register-routes.ts` (register route)
- `apps/api/src/rooms-core/settings.ts` (verse/escape settings; optional)
- `apps/api/src/repository.ts` (optional `normalizeRoomRecord` heal)
- `apps/web/lib/config.ts` (`CLIENT_TUNING.enableTranslation`)
- `apps/web/lib/realtime.ts` (union + reliability)
- `apps/web/lib/api.ts` (`translateText`)
- `apps/web/components/RoomClient.tsx` (gate, state, hook, handler ref, panel + dock mount, indicators)
- `apps/web/app/globals.css` (`.translation-dock*`, panel styles)
- `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`
- `apps/web/playwright.config.ts` (E2E flags)

---

## Testing checklist

**Unit / contract**
- Zod parse for new schemas; `translationLanguageLabel` normalization.
- `useTranslation` reducer: self-skip, dedupe by `(participantId, utteranceId)`, same-lang passthrough, placeholder→resolved update, mic-off auto-stop.

**API**
- Guard (member/room-type/room-setting); identity short-circuit; cache hit; passthrough no-key; rate-limit 429; model failure → `translation-failed`.

**Web component**
- `TranslationDock` renders translated line + speaker, "show original" toggle, pending state, interim dimmed.
- `TranslationPanel` language selects persist to `localStorage`; share button disabled states.

**Playwright**
- Two-tab verse: A speaks (injected) English, B reads Spanish → translated line attributed to A; show-original reveals English; same-language passthrough makes no translate call.

**Manual**
- Real mic in Chrome: share speech, second device different language reads translation; latency feel; mic-off pauses; Safari reads but can't share.

---

## Definition of Done (v1 = Phases 1–7)

- A verse-room participant picks a read language and sees others' shared speech as captions in that language, in 3D and 2D.
- Translation runs server-side with the OpenAI key never exposed; cache + same-lang short-circuit + rate limit in place; graceful passthrough without a key.
- Capture is opt-in with a visible indicator; nothing persisted in v1.
- Triple feature gate enforced server-side; default-off via `ENABLE_TRANSLATION`.
- Avatar movement and existing Meeting Notes / Live Captions behavior unchanged.
- Typecheck (contracts/api/web), API tests, and the two-tab Playwright flow pass.
- `.env.example` files and `.cursor/memory.md` updated.
