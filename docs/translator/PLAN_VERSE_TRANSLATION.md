# Plan — Verse Live Translation

Source room type: Dream IXR verses (`skill-verse`, `culture-verse`, `creator-verse`, `food-verse`, `mondi-verse`, `work-verse`)
Reuses patterns from: [`PLAN_FREE_FOR_ALL_AI_MEETING_NOTES.md`](../planning/rooms/free-for-all/PLAN_FREE_FOR_ALL_AI_MEETING_NOTES.md), Live Captions (`apps/web/lib/useLiveCaptions.ts`)
Companion: [`IMPL_VERSE_TRANSLATION.md`](./IMPL_VERSE_TRANSLATION.md)
Branch target: `feature/verse-translation` (additive; default-off feature flag)
Last updated: 2026-06-13

---

## 0. The way we'll do this (read this first)

**Recommended architecture: caption-relay translation with listener-side rendering.**

This is the same pattern Google Meet, Microsoft Teams, and Zoom use for "translated captions." We do **not** try to dub people's voices in real time (speech-to-speech). We turn speech into text, translate the text, and show each listener readable captions **in their own language**. Text is the simplest, cheapest, lowest-latency, most reliable surface, and it is exactly what the user asked for: *"ideally the user receives the translation(s) in their language plain and simple."*

The end-to-end loop:

1. **Capture (speaker side).** A speaker turns on translation and their browser does on-device speech-to-text in the language they speak (reusing the existing `useSpeechRecognition` Web Speech API hook). Each finalized utterance becomes a short text chunk tagged with its source language.
2. **Broadcast.** The chunk is published once over the existing LiveKit data channel as `room.translation.utterance.v1` — the *original* text plus `sourceLang` and the speaker's identity. No translation has happened yet.
3. **Translate (listener side, server-backed).** Every other client looks at the incoming chunk. If `sourceLang` already equals *my* reading language, it renders as-is. Otherwise the client calls `POST /v1/rooms/:roomId/translate` with `{ text, sourceLang, targetLang }`; the API calls the LLM (server holds the key), translates, and returns the text. Results are cached on the server by `hash(sourceLang|targetLang|text)` so the 2nd…Nth listener who wants the same language is a cache hit, not a new model call.
4. **Render.** The translated line appears in the captions/translation dock, in the reader's language, labeled with the speaker's name and a quiet "translated from Spanish" tag with a "show original" toggle.

**Why listener-side translation (vs. translating for everyone up front):** each client only ever asks for the *one* language it needs, so the design is trivially correct for any mix of N languages in a room, needs no global "who-speaks-what" coordination, and degrades per-user (if my translation call fails, everyone else is unaffected). The server cache collapses duplicate work, so the cost is effectively "one model call per (utterance × distinct target language)," which is the same as the more complex fan-out approach. The fan-out optimization (speaker translates into every language present and publishes a bundle) is documented in §4.4 as a Phase 2 cost optimization, not the v1 path.

**Two user-facing settings, both trivial:**

- **"Show me captions in:"** — the hero control. A language dropdown, defaulting to the browser locale (`navigator.language`). This is all a *listener* needs.
- **"I speak:"** — only matters if you turn on *sharing* your speech for translation; defaults to the browser locale too.

**LLM:** OpenAI chat model, default `gpt-4.1-mini` (env `OPENAI_TRANSLATION_MODEL`), `temperature: 0`, with `gpt-4.1` as the quality tier. Reuses the existing `OPENAI_API_KEY` and the exact `fetch` pattern already in `apps/api/src/ai-host/chat-service.ts` / `apps/api/src/meeting-notes/service.ts`. See §5 for the full rationale and alternatives (DeepL / Google Cloud Translation).

**Speech-to-text source, layered:**

- **v1 (ship first):** on-device Web Speech API (`useSpeechRecognition`) — zero new infra, low latency, free, already in the repo. Honest limitation: speech *capture* works in Chrome/Edge only, and each speaker must pick the language they speak. Everyone (any browser) can still *read* translations.
- **v2 (robustness):** server-side streaming STT via OpenAI `gpt-4o-transcribe` (the model already used by Meeting Notes) to remove the browser/source-language limitations. Same realtime/translate plumbing; only the capture source changes.

Everything below expands on this with contracts, API, UI, gotchas, phases, and reuse points.

---

## 1. Overview

Add an **on-the-fly translation service** to Dream IXR verse rooms, reachable from the right-hand HUD. While translation is on, anything a participant says (who is sharing their speech) is delivered to every other participant as live captions **in that participant's own chosen language**. The feature is conversational and bidirectional: a Spanish speaker and an English speaker can talk naturally, each reading the other in their language.

This is deliberately modeled on two features that already exist in the codebase:

- **Live Captions** (`apps/web/lib/useLiveCaptions.ts`, `useSpeechRecognition.ts`, `LiveCaptionsDock.tsx`) — client-side Web Speech API → text chunks → LiveKit data channel → rendered in a bottom dock. Translation is "Live Captions + a translate step + a per-user language."
- **AI Meeting Notes** (`apps/api/src/meeting-notes/*`, `useMeetingNotes.ts`, `MeetingNotesPanel.tsx`) — the contracts/REST/realtime/feature-flag/OpenAI scaffolding we copy for the server translate endpoint and the right-HUD panel.

### 1.1 Product goals

1. Anyone in a verse room can pick the language they want to **read** in (default: browser locale).
2. Anyone can turn on **share my speech** so what they say is captured and made translatable for others.
3. Every participant sees others' speech as captions **in their own language**, with the speaker's name, plain and simple.
4. A "show original" affordance reveals the untranslated text when wanted.
5. Works in the 3D view and the required 2D analog.
6. A visible indicator shows when speech capture (mic → text) is active, consistent with the Meeting Notes/captions consent posture.

### 1.2 Non-goals (v1)

- **Speech-to-speech / dubbed audio.** No synthesized translated voice in v1 (TTS is a clearly-scoped Phase 3 add-on; see §9). The user asked for the *simplest* path — text wins.
- **Persisted transcripts / downloadable translated logs.** Translation is ephemeral and lives in the dock. (Meeting Notes already covers durable transcripts; the two can be combined later.)
- **Translating wall objects, whiteboards, slide decks, chat, or UI chrome (i18n).** Scope is live spoken conversation only.
- **Guaranteeing capture on every browser.** v1 capture is Chrome/Edge (Web Speech API). Reading translations is universal.
- **Offline / on-device translation models.** Translation goes through the API → OpenAI.
- **Per-message editing or correction UI.**

---

## 2. The standard pattern (background)

Real-time cross-language conversation is solved one of two ways in industry:

| Approach | What it does | Who uses it | Fit for us |
|---|---|---|---|
| **Caption-relay (cascade: STT → MT → text)** | Speech → text → machine translation → readable captions per listener. Optionally TTS at the end. | Google Meet "Translated captions", Teams "Live translated captions", Zoom "Translated captions". | **Recommended.** Lowest latency for *reading*, cheapest, most robust, matches existing Live Captions plumbing, and is exactly the "plain and simple text in my language" UX requested. |
| **Direct speech-to-speech (S2ST)** | Speech in → translated *speech* out (dubbed voice), via a direct model or STT→MT→TTS cascade. | KUDO, Meta SeamlessM4T demos, some Teams "interpreter" features. | **Deferred.** Higher latency, voice-identity/consent issues, far more infra. A TTS layer on top of caption-relay (Phase 3) gets 80% of the value at 20% of the cost. |

We adopt **caption-relay**. The translation step is a small, stateless text task — ideal for a fast, cheap LLM call with caching. The hard part (turning audio into text) is already solved in the repo by the Live Captions Web Speech path, with a documented upgrade to server STT.

A note on **where translation happens**:

- **Listener-pull (recommended v1):** each receiving client requests the one language it needs. Simple, per-user fault isolation, no coordination. Server cache dedupes across listeners.
- **Speaker fan-out (Phase 2 optimization):** the speaker's client gathers the set of distinct reading-languages currently in the room (advertised via a presence message) and asks the server to translate into all of them in one batched call, then publishes a `{ lang: text }` bundle. Saves a little latency/HTTP overhead in large rooms with few languages. Strictly an optimization; the listener-pull path remains the correctness fallback for late joiners.

---

## 3. UX surface (the simplest thing that works)

### 3.1 Right-HUD "Translation" card

A single `HudCard` (same primitive as `MeetingNotesPanel`/`AnchorPanel`, see `apps/web/components/HudCard.tsx`) mounts in the right rail (`room-hud-right`) when translation is enabled for the room. Contents, top to bottom:

| Control | Default | Notes |
|---|---|---|
| **Show me captions in:** `<language select>` | `navigator.language` | The hero control. Changing it re-renders the dock in the new language (and triggers fresh translate calls as new utterances arrive). |
| **Translate others' speech** toggle | On (when card is on) | Master switch for the *reading* experience. Off = show originals only. |
| **Share my speech** toggle + **I speak:** `<language select>` | Off / `navigator.language` | Turns on local speech capture (Web Speech API). Mirrors the Live Captions "Share my captions" button + a source-language picker. Requires mic on + Chrome/Edge. |
| Status line | — | "Listening… (English)" / "Translating to French" / mic-off / unsupported-browser hints, reusing Live Captions copy. |

That's the entire surface a user must understand: **pick the language you read in** (and optionally **turn on sharing + pick the language you speak**).

### 3.2 Where the translated lines render

Reuse the **bottom captions dock** idiom (`LiveCaptionsDock.tsx`) — a horizontal, low-friction, glanceable strip — but as a translation-aware variant (`TranslationDock`). Each line shows:

```
[00:12]  María:  Where is the museum?   (translated from Spanish · show original)
```

- Speaker name via the existing `speakerLabel(participantId)` resolver.
- Body text is **already in the reader's language**.
- A muted "translated from <lang>" tag; clicking "show original" swaps to the source text for that line.
- Interim (in-progress) results render dimmed, like captions interim lines, but are **not** translated until finalized (see Gotcha §8.3).

Rationale for reusing the dock rather than inventing a new render surface: it already handles ordering by `sentAt`, speaker grouping, auto-scroll, reduced-motion, "Copy", and 2D-friendly layout. The right-HUD card is *controls*; the dock is *output*.

### 3.3 3D and 2D parity

- **3D:** dock at the bottom of the stage (as captions today). Optional nameplate dot when a participant is actively sharing speech (reuse the Meeting Notes recording-dot wiring on `BlockyAvatar`).
- **2D:** identical dock in the 2D layout; the project's 2D-analog requirement means translated lines must be readable there too. Reuse whatever placement Live Captions uses in 2D.

### 3.4 Capture indicator (consent)

Whenever *anyone* is sharing speech for translation, show a small persistent "🎙 transcribing" chip near the top bar (parallel to the Meeting Notes **REC** badge) and a per-avatar dot for active sharers. Capture is opt-in (you must toggle "Share my speech"), never silent. See §10.

---

## 4. Architecture

### 4.1 Data flow

```
 Speaker (Chrome/Edge)                          Listener (any browser)
 ─────────────────────                          ──────────────────────
 mic on + "Share my speech"
        │
        ▼
 useSpeechRecognition (Web Speech API)
   lang = speaker's "I speak"
        │  final utterance text + sourceLang
        ▼
 publish room.translation.utterance.v1  ───────►  receive utterance
   { roomId, participantId, utteranceId,            │
     sourceLang, text, isFinal, sentAt }            │ sourceLang == myReadLang ?
        (LiveKit data channel, reliable)            │   yes → render as-is
                                                    │   no  ▼
                                          POST /v1/rooms/:id/translate
                                            { text, sourceLang, targetLang }
                                                    │
                                          API: cache lookup → OpenAI chat (temp 0)
                                                    │  { translatedText, cached }
                                                    ▼
                                          render line in dock (reader's language)
```

Notes:

- The **utterance broadcast carries the original text only.** Translation is never published; each listener resolves its own language. This keeps the data-channel payload small and avoids leaking N translations to everyone.
- **Interim** results (`isFinal:false`) are published for the live "typing" feel but are rendered untranslated/dimmed; only `isFinal:true` chunks are translated (cost + coherence; §8.3).
- Translation requests go over **HTTPS to the API**, not the LiveKit channel. The API owns the OpenAI key, the cache, and rate-limiting.

### 4.2 Server translate endpoint + cache

A stateless route, parallel to `apps/api/src/routes/meeting-notes.ts`:

```
POST /v1/rooms/:roomId/translate
body:  { text: string(≤2000), sourceLang: BCP47, targetLang: BCP47, context?: string[] }
resp:  { translatedText: string, sourceLang, targetLang, cached: boolean, model: string }
```

- **Availability guard** mirrors `assertMeetingNotesAvailable` (`apps/api/src/http/auth-guards.ts`): caller is a current room member **AND** `config.tuning.enableTranslation` **AND** `getRoomTypeFeatureFlags(room.type).translation` **AND** `room.settings.translation.enabled`.
- **Cache:** in-process LRU keyed by `hash(normalize(text)|sourceLang|targetLang)`; on hit, return `cached:true` with no model call. (Same "live, in-memory, lost on restart, that's fine" posture as `MeetingNotesAudioStore`.) Optional Phase 2: back the cache with a small Mongo collection or KV for cross-instance reuse.
- **Short-circuit:** if `sourceLang === targetLang`, return the input unchanged with no model call.
- **No-key fallback:** if `OPENAI_API_KEY` is unset (local dev with flag off), return the original text with a `model:"passthrough"` marker so the UI shows untranslated text rather than erroring — same graceful-degradation choice Meeting Notes makes for summaries.
- **Rate limit:** per-user/per-room cap (reuse the AI-host chat rate-limit approach), e.g. `TRANSLATION_RATE_LIMIT_PER_MINUTE` default 240 (high, because a busy listener in a fast conversation makes many calls; cache absorbs most).

### 4.3 LLM call shape

Single non-streaming `POST /v1/chat/completions` (copy the `fetch` in `apps/api/src/meeting-notes/service.ts` `summarizeMeetingNotes`, including the 429 retry/backoff in `transcribeAudioChunk`):

- `model = config.tuning.openAiTranslationModel` (`OPENAI_TRANSLATION_MODEL`, default `gpt-4.1-mini`).
- `temperature: 0`, `max_tokens` proportional to input length.
- **System prompt (fixed):** "You are a translation engine. Translate the user's text from `<sourceLang>` to `<targetLang>`. Output ONLY the translation, with no quotes, notes, or commentary. Preserve names, numbers, and tone. If the text is already in `<targetLang>`, return it unchanged." Optionally include the last 1–3 lines of conversation as `context` to disambiguate pronouns/gender/formality (§8.6), instructing the model to translate only the final line.
- Streaming is unnecessary for short utterances and adds complexity; use a plain request.

### 4.4 Speaker fan-out (Phase 2 optimization, optional)

To cut HTTP round-trips when a room has many listeners but few languages:

1. Each client advertises its reading language via a lightweight presence message (`room.translation.lang.v1`, unreliable) or piggybacks on the existing presence payload.
2. On a final utterance, the speaker's client computes `distinctTargetLangs = roomLangs − {sourceLang}` and calls `POST /translate/batch` once.
3. It publishes `room.translation.bundle.v1 = { utteranceId, sourceLang, text, byLang: { fr: "...", de: "..." } }`.
4. Listeners read `byLang[myReadLang]`, falling back to listener-pull if their language isn't in the bundle (late join / changed language).

This is purely additive and behind the same flags; v1 ships listener-pull only.

### 4.5 User language preference: where it lives

- **v1 (no schema change):** the chosen read/speak languages live in `localStorage` (e.g. `3dspace.translation:{userId}`), defaulting to `navigator.language`. A listener only needs its *own* local preference for listener-pull to work, so **no User migration, no presence dependency** is required to ship.
- **Phase 2 (persisted):** add `user.preferredLanguage` (BCP-47) to `UserSchema` + `PATCH /v1/users/me/language` + an `avatar.*`-style realtime broadcast, exactly like avatar body slug (`PATCH /v1/users/me/body`, `avatar.body.v1`). This enables fan-out, People-panel language flags, and cross-device persistence.

---

## 5. LLM recommendation

**Use OpenAI chat models for translation; default `gpt-4.1-mini`.**

| Need | Model | Why |
|---|---|---|
| **Live text translation (default)** | `gpt-4.1-mini` (env `OPENAI_TRANSLATION_MODEL`) | Fast, cheap, strong multilingual quality, low latency — ideal for short conversational turns. Same family/default already used by the AI World Host (`OPENAI_AI_HOST_MODEL`), so no new vendor, key, or client pattern. `gpt-4o-mini` is an equivalent drop-in if preferred. |
| **Quality tier (idioms, formal/legal, low-resource langs)** | `gpt-4.1` (env override) | Better on nuance, gendered forms, and rarer language pairs. Swap per-deployment via env; same code path. |
| **v2 speech-to-text** | `gpt-4o-transcribe` (env `OPENAI_TRANSCRIPTION_MODEL`, already defined) | Auto language detection, robust on noisy/multi-speaker audio, cross-browser. Removes the Web Speech limitation. |
| **Phase 3 speech output (TTS)** | `gpt-4o-mini-tts` / OpenAI TTS | Optional dubbed playback of translations. |

**Why an LLM over a dedicated MT API (DeepL / Google Cloud Translation / Azure Translator):**

- **One vendor, one key, one pattern.** We already call OpenAI for transcription, summaries, AI host, and AI objects. Adding DeepL/Google means a new key, SDK, billing, and failure mode.
- **Context-awareness.** LLMs accept surrounding lines and instructions (tone, "informal," glossary of names) — useful for conversational pronoun/gender/formality resolution that raw MT engines handle poorly.
- **Good-enough quality.** For conversational captions, `gpt-4.1-mini` quality is excellent and the latency is fine for the "read it a moment later" UX.

**When you'd add DeepL/Google instead:** if you need certified translation quality for specific European pairs, or the lowest possible per-character cost at very high volume. The endpoint in §4.2 abstracts the provider, so swapping is a server-only change. Recommend **staying on OpenAI for v1** and revisiting only if cost/quality metrics demand it.

> Model identifiers are **always env-driven** (like `OPENAI_SUMMARY_MODEL`) so we can track OpenAI's model releases without code changes.

---

## 6. Environment variables

Add to root `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` as appropriate:

```
# --- Verse Live Translation ---
ENABLE_TRANSLATION=false
NEXT_PUBLIC_ENABLE_TRANSLATION=false

# Reuses the existing OpenAI key.
OPENAI_API_KEY=
OPENAI_TRANSLATION_MODEL=gpt-4.1-mini
# Quality tier override:
# OPENAI_TRANSLATION_MODEL=gpt-4.1

# Per-user, per-room translate calls per minute (cache absorbs most repeats).
TRANSLATION_RATE_LIMIT_PER_MINUTE=240

# Max characters per translate request.
TRANSLATION_MAX_INPUT_CHARS=2000
```

Strict prod validation: if `ENABLE_TRANSLATION=true`, require `OPENAI_API_KEY` (mirror the Meeting Notes / AI-host check in `apps/api/src/config.ts`).

---

## 7. What we reuse (and from where)

| New piece | Copy/extend from |
|---|---|
| `useSpeechRecognition` (speech → text, `lang` param) | **Reused as-is** — `apps/web/lib/useSpeechRecognition.ts` (already generic; pass speaker's source lang). |
| `useTranslation` hook (publish/subscribe utterances, request translations, dock state) | `apps/web/lib/useLiveCaptions.ts` (interim/final publish, `handleRealtimeMessage`, contributor tracking, dock open/close). |
| `TranslationDock` render | `apps/web/components/LiveCaptionsDock.tsx` (ordering, speaker grouping, auto-scroll, copy, 2D parity). |
| `TranslationPanel` (right-HUD controls) | `apps/web/components/MeetingNotesPanel.tsx` + `HudCard` (`apps/web/components/HudCard.tsx`). |
| Realtime message union + reliability | `apps/web/lib/realtime.ts` (`RealtimeMessage`, `isRealtimeUnreliable`, publish/subscribe). |
| RoomClient gate + mount + handler ref | `apps/web/components/RoomClient.tsx` (`roomTypeFeatures`, `meetingNotesEnabled` gate at ~361, panel mount ~3424–3749, `handleMessage` chain ~1846). |
| Server route + availability guard | `apps/api/src/routes/meeting-notes.ts`, `apps/api/src/http/auth-guards.ts` (`assertMeetingNotesAvailable`), `register-routes.ts`. |
| OpenAI `fetch` + retry + no-key fallback | `apps/api/src/meeting-notes/service.ts` (`summarizeMeetingNotes`, `transcribeAudioChunk`) / `apps/api/src/ai-host/chat-service.ts`. |
| In-memory cache (LRU, lost on restart) | `apps/api/src/meeting-notes/audio-buffer.ts` (`MeetingNotesAudioStore` lifecycle pattern). |
| Feature flags (room-type + env + room settings) | `packages/contracts/src/index.ts` (`RoomTypeFeatureFlags`, `VERSE_ROOM_TYPE_FEATURE_FLAGS`), `apps/api/src/config.ts`, `apps/web/lib/config.ts` (`CLIENT_TUNING`). |
| Persisted user language (Phase 2) | `PATCH /v1/users/me/body` + `avatar.body.v1` (avatar bodies) as the template for `PATCH /v1/users/me/language` + `user.language.v1`. |

---

## 8. Gotchas to plan around

### 8.1 Speech-to-text needs a known source language (Web Speech API)
The Web Speech API requires `recognition.lang` up front and does **not** auto-detect. So each *speaker* must pick the language they speak ("I speak:"). You cannot run one recognizer that transcribes both Spanish and English from the same person. Default to `navigator.language`; let the user change it. (v2 server STT with `gpt-4o-transcribe` removes this by auto-detecting.)

### 8.2 Browser support for capture
Web Speech API speech recognition is Chrome/Edge only. Safari/Firefox users **cannot share speech** in v1 but **can read** everyone's translations. Surface this honestly with the same copy Live Captions uses ("Chrome or Edge required to share"). This is the single biggest v1 limitation and the main reason v2 server STT exists.

### 8.3 Translate finals, not interims
Translating every interim partial would (a) cost N× more, (b) produce flickering, half-translated nonsense, and (c) hammer rate limits. **Only translate `isFinal:true` utterances.** Render interim text dimmed/untranslated for the "live" feel, replaced by the translated final when it arrives (the captions hook already does interim→final replacement by `chunkId`).

### 8.4 Cost / fan-out blow-up
Naively, `listeners × utterances × duplicate-languages` model calls. Mitigations, all in the design: (1) skip when `sourceLang === targetLang`; (2) never translate your own speech; (3) server cache keyed by `(src,tgt,text)` so repeat sentences and same-language listeners are free; (4) finals-only; (5) rate limit. With cache, effective cost ≈ one call per (utterance × distinct target language).

### 8.5 Latency & ordering
A translated line appears slightly after the original utterance (one HTTP + model round-trip, typically sub-second for short text with mini models). Keep ordering stable by sorting on the utterance's `sentAt`/`startMs` (as the dock already does), not on translation-arrival time, so lines don't jump around as async translations resolve.

### 8.6 Context loss (pronouns, gender, formality, idioms)
Translating one short sentence in isolation loses context ("it", "they", formal vs informal "you"). Mitigate by passing the previous 1–3 finalized lines as `context` and instructing the model to translate only the latest line. Keep `temperature: 0` for determinism (also improves cache value).

### 8.7 No user-language concept exists yet
There is no locale/language field on `User` and no i18n anywhere in the app. v1 deliberately keeps language in `localStorage` to avoid a migration; Phase 2 persists it. Don't assume `navigator.language` is a clean BCP-47 the model loves — normalize (e.g. `en-US` → "English") before prompting; keep a small code→name map client-side.

### 8.8 Privacy / consent / minors
Verse rooms enable the classroom stack (`classroomState: true`) and may contain students/minors. Speech capture sends audio-derived text to OpenAI. Treat consent like Meeting Notes: explicit opt-in to share, a always-visible capture indicator, and ensure the OpenAI org key has zero-data-retention configured. Translation reading (no capture) sends only already-published caption text. Keep the feature default-off via flags; document the consent posture in the deployment checklist.

### 8.9 Self-echo and duplicates
Don't translate or double-render your own utterances (render your own in source). Dedupe incoming lines by `(participantId, utteranceId)` exactly as captions dedupe by `(participantId, chunkId)`.

### 8.10 Reliability channel
Publish final utterances on the **reliable** LiveKit channel (don't drop someone's sentence); interim partials can use the **unreliable** channel (it's fine to drop a partial). Register the new message types in `isRealtimeUnreliable` accordingly (`apps/web/lib/realtime.ts`).

### 8.11 2D analog requirement
The app mandates a 2D analog for every feature. The `TranslationDock` must render and function in 2D, not just 3D.

### 8.12 Language list & quality expectations
Offer a curated short list of well-supported languages first (the ~20 the LLM + Web Speech handle well) rather than 100+ codes; "Other" can accept a free BCP-47. Set expectations that capture quality varies by language/accent.

---

## 9. Phased implementation

| Phase | Deliverable | Gate |
|---|---|---|
| **1 — Contracts + flags** | `translation` on `RoomTypeFeatureFlags` (true for verse + FFA); `RoomSettings.translation`; `room.translation.utterance.v1` (+ interim) message schemas; error codes `translation-unavailable` / `translation-failed`; `CLIENT_TUNING.enableTranslation`; env templates; OpenAPI entry. | typecheck contracts/api |
| **2 — Server translate endpoint** | `POST /v1/rooms/:roomId/translate` + availability guard + LRU cache + same-lang short-circuit + no-key passthrough + rate limit + OpenAI call. API tests (member-only, disabled-room 403, cache hit, passthrough, short-circuit). | api tests green |
| **3 — Capture + broadcast** | `useTranslation` hook: reuse `useSpeechRecognition` for capture (source lang), publish `utterance.v1` finals (reliable) + interims (unreliable); subscribe + dedupe. | unit tests on hook reducer |
| **4 — Listener translate + dock** | On foreign final utterance, call `translateText()` API client, cache client-side too, render in `TranslationDock` in reader's language with "show original". Interim dimmed/untranslated. | manual two-tab QA |
| **5 — Right-HUD panel + wiring** | `TranslationPanel` (`HudCard`): "Show me / I speak" language selects, master toggle, share toggle, status. Gate + mount in `RoomClient` (`translationEnabled`), register realtime handler ref, top-bar capture chip, avatar sharing dot. | — |
| **6 — 2D parity + polish** | Dock in 2D layout; reduced-motion; copy; unsupported-browser + mic-off hints; curated language list. | — |
| **7 — Tests + rollout** | Playwright two-tab verse room: A shares speech in English, B set to French sees translated line; B "show original" reveals English. Status doc + memory. Staging behind `ENABLE_TRANSLATION`. | E2E green |
| **8 — (optional) persisted language** | `user.preferredLanguage` + `PATCH /v1/users/me/language` + `user.language.v1`; People-panel flags. | — |
| **9 — (optional) speaker fan-out** | `room.translation.lang.v1` presence + `POST /translate/batch` + `bundle.v1`. Cost optimization. | — |
| **10 — (optional) server STT (v2 capture)** | Swap Web Speech for `gpt-4o-transcribe` streaming (MediaRecorder chunks like Meeting Notes) to drop the browser/source-lang limits. | — |
| **11 — (optional) TTS / dubbed audio** | OpenAI TTS playback of translated lines (per-listener, opt-in, ducks original). | — |

v1 = Phases 1–7. Everything 8+ is additive and behind the same flags.

---

## 10. Privacy, consent, safeguards

1. **Opt-in capture.** Speech is only captured when a participant turns on "Share my speech." No silent transcription.
2. **Always-visible indicator.** A capture chip + per-avatar dot whenever anyone is sharing, in 3D and 2D, parallel to the Meeting Notes REC badge.
3. **Ephemeral.** v1 persists nothing — utterances and translations live only in the session dock; no transcript storage.
4. **Third-party hand-off.** Caption text (and, in v2, audio) goes to OpenAI for translation/transcription. Use an org key with zero data retention; document in the deployment checklist.
5. **Minors / classroom posture.** Verse rooms can include students; keep the feature default-off via flags and require the consent indicator before enabling per deployment.
6. **Reading is low-risk.** A listener who only reads translations transmits no new audio; only already-published caption text is sent for translation.

---

## 11. Relationship to existing features

```
Dream IXR Verse rooms
├── AI Meeting Notes        (on)  → durable transcript/summary (batch)   ── shares OpenAI + REST + realtime + HUD patterns
├── Live Captions           (off in verse today) → client STT → text     ── shares useSpeechRecognition + dock
└── Verse Live Translation  (THIS PLAN, default-off)
       ├── new RoomTypeFeatureFlags.translation (verse + FFA)
       ├── new RoomSettings.translation
       ├── new POST /v1/rooms/:id/translate (+ cache, guard, rate-limit)
       ├── new room.translation.utterance.v1 (+ interim) realtime messages
       ├── new useTranslation hook (reuses useSpeechRecognition)
       ├── new TranslationPanel (right HUD) + TranslationDock (3D+2D)
       └── reuses OpenAI key/pattern; no new vendor
```

Fully additive: no change to Meeting Notes, Live Captions, avatar movement, or the room manifest. The `translation` flag is independent of `liveCaptions` (which is `false` in verse today), so translation ships self-contained.

---

## 12. Open questions

1. Persist user language in v1 (cross-device) or keep it local until Phase 2? Plan defaults to **local** for the smallest first ship.
2. Should the dock be a translation-aware variant of the captions dock, or literally extend Live Captions (and flip `liveCaptions` on for verse)? Plan keeps them **separate** so translation doesn't depend on the captions flag.
3. Curated language list contents and default ordering?
4. Translate interims (with heavy debounce) for a snappier feel, or strictly finals-only in v1? Plan says **finals-only**.
5. Per-room max participant / language cap to bound cost in large verse rooms?
6. Do we want a combined "Meeting Notes in my language" mode (translated summary) as a cheap win that reuses both features?
7. Fan-out vs listener-pull as the *default* once persisted language exists — revisit with real room-size data.

