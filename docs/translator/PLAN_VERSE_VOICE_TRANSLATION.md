# Plan — Verse Voice-to-Voice Translation

Extends: [`PLAN_VERSE_TRANSLATION.md`](./PLAN_VERSE_TRANSLATION.md) (shipped text caption-relay, Phases 1–6)
Companion: [`IMPL_VERSE_VOICE_TRANSLATION.md`](./IMPL_VERSE_VOICE_TRANSLATION.md)
Branch target: `feature/verse-voice-translation` (additive on top of `feature/verse-translation`; default-off flags)
Last updated: 2026-06-13

---

## 0. The way we'll do this (read this first)

**We already do two-thirds of voice-to-voice.** The shipped translation feature is a cascade: **STT → MT → text**. Speech-to-speech is the *same cascade with one more leg bolted on the end*: **STT → MT → TTS → audio**. We do **not** rewrite anything; we add a text-to-speech stage and a small audio-playback path.

Recommended architecture: **listener-side text-to-speech with original-voice ducking.**

The end-to-end loop (new parts in **bold**):

1. **Capture (speaker).** Unchanged. The speaker's browser does on-device STT (`useSpeechRecognition`) and publishes each finalized utterance as `room.translation.utterance.v1` (original text + `sourceLang`) over LiveKit.
2. **Translate (listener).** Unchanged. Each listener calls `POST /v1/rooms/:id/translate` and gets the text in *their* language (cached server-side). This already happens today.
3. **Speak (listener) — NEW.** If the listener turned on **Voice mode**, the client takes that translated text and calls **`POST /v1/rooms/:id/translate/speech`**; the API generates spoken audio with a TTS model (server holds the key, caches by `hash(lang|voice|text)`), and returns audio bytes.
4. **Play + duck (listener) — NEW.** The client plays the dub as a clear voiceover and, while it plays, **ducks** (lowers) the original speaker's live mic for *that listener only*, then restores it. The dub is **played locally only — never published back to LiveKit** — so every listener hears their own language and there is no feedback loop.

**Why this is the right call:**

- **It reuses the entire shipped pipeline.** STT, the utterance broadcast, the translate endpoint + cache, the listener-pull model, the per-user language preference, and the right-HUD panel all stay exactly as they are. Voice is one new endpoint + one new client hook + a gain tweak.
- **Listener-side, per-user.** Only listeners who want audio pay for TTS; each gets exactly their language; a failure dubs nobody else. Identical fault-isolation story to the text feature.
- **Local-only playback** sidesteps the hardest problems in real-time dubbing: no re-publishing translated audio to the room, no N×N audio mixing, no echo/feedback, no server media egress.
- **Ducking, not replacing (default).** Lowering the original to ~15% instead of fully muting keeps the speaker's timing, emotion, and turn-taking cues audible under the dub. "Replace" (full mute) is offered as an option.

**The one honest limitation: latency / turn-taking.** Because Web Speech only emits *final* utterances and the cascade is STT-final → MT → TTS → play, the dub lands ~1.5–3 s **after** the speaker finishes a sentence. This is **consecutive interpretation** (hear, then translation), not simultaneous. That is the same trade-off Google Meet/Teams translated captions make, and it is acceptable and expected. A lower-latency **direct speech-to-speech** path (OpenAI Realtime API) is documented in §2 as a future option, not the v1 path.

**TTS model:** OpenAI `gpt-4o-mini-tts` (env `OPENAI_TTS_MODEL`), reusing the existing `OPENAI_API_KEY` and the same `fetch` pattern as the translate endpoint. A per-speaker deterministic voice assignment keeps each person sounding consistent. A zero-infra **browser `speechSynthesis`** fallback is documented in §5 with its caveats. See §5 for full rationale.

**Two-or-three new user controls, all in the existing Translation card:**

- **Voice mode:** `Off (subtitles only)` · `Duck original` · `Replace original`. Default `Off` (text-only, exactly today's behavior).
- **Voice:** optional voice picker (or "auto per speaker").

Everything below expands this into UX, architecture, the TTS recommendation, gotchas, and phases.

---

## 1. Overview

Add **spoken translation** on top of the shipped text translation in Dream IXR verse rooms. When a listener turns on Voice mode, other participants' speech is not only shown as captions in the listener's language — it is **spoken aloud** in the listener's language while the original voice is ducked beneath it. Reachable from the same right-HUD **Translation** card.

### 1.1 Goals

1. A listener can hear others' speech translated into their own chosen language, as audio, hands-free.
2. The original speaker's voice is ducked (or replaced) under the dub so the translation is clearly audible.
3. Each person keeps a consistent synthesized voice.
4. Subtitles remain available simultaneously (voice augments, never removes, text).
5. Works in 3D and the required 2D analog (audio is view-independent; the text dock already has 2D parity).
6. Default off; rides on the existing `translation` room-type flag plus its own env/runtime gates.

### 1.2 Non-goals (v1)

- **Simultaneous (mid-sentence) interpretation.** v1 is consecutive (per finished utterance). 
- **Cloning the speaker's real voice / matching exact timbre or gender.** v1 uses a fixed set of synthetic voices mapped per speaker.
- **Publishing translated audio to the room / shared dub track.** Dubs are generated and played locally per listener.
- **Direct speech-to-speech models (S2ST).** Documented as a future path (§2), not built in v1.
- **Lip-sync / avatar mouth animation to the dub.**
- **New STT.** v1 voice rides on the existing Web Speech capture (Chrome/Edge speakers); server STT remains the shared future upgrade from the text plan.
- **Persisted/downloadable audio.** Dubs are ephemeral.

---

## 2. The standard pattern (background)

Spoken cross-language conversation is built one of two ways:

| Approach | How | Latency | Who uses it | Fit for us |
|---|---|---|---|---|
| **Cascade (STT → MT → TTS)** | Transcribe, translate text, synthesize speech. The dub plays after each finished utterance. | ~1.5–3 s after sentence end (consecutive). | Google Meet / Teams (translated captions + read-aloud), most "interpreter" features. | **Recommended.** We already have STT + MT shipped; only TTS is new. Reuses every existing piece, local-only playback, per-listener language. |
| **Direct speech-to-speech (S2ST)** | A streaming model takes audio in and emits translated audio out, preserving prosody, with partial/streaming output. | Lower (near-simultaneous), but never zero. | OpenAI Realtime API translation, Gemini Live, Meta SeamlessM4T demos, KUDO. | **Deferred.** Lower latency and nicer voice, but requires a persistent server↔model audio bridge (WebSocket) per speaking participant, much higher cost, and bypasses the shipped cascade. Revisit once cascade voice is in users' hands. |

**We adopt the cascade** because it is purely additive: STT and MT are done and tested; TTS is a single stateless endpoint with the same caching/rate-limit/key story as `/translate`. The cascade's consecutive latency is the accepted industry trade-off for this UX.

**Where TTS runs:** listener-side request to our API (server holds the key, caches audio, rate-limits), mirroring the listener-pull model of the text feature. The speaker does nothing new.

**Direct S2ST upgrade path (future):** add a server bridge that opens an OpenAI Realtime session per active speaker, streams their LiveKit audio in with a "translate to <lang>" instruction, and streams translated audio frames back to listeners. This is a separate, larger project (server media handling, per-listener language fan-out, cost controls) and is intentionally out of scope here; the cascade ships first and remains the fallback for unsupported browsers.

---

## 3. UX surface (plain and simple)

### 3.1 Additions to the right-HUD "Translation" card

The existing card (`TranslationPanel`) gains, below the language pickers:

| Control | Default | Notes |
|---|---|---|
| **Hear translations** (Voice mode) `<select>`: `Off (subtitles only)` · `Duck original` · `Replace original` | `Off` | The single new hero control. `Off` = today's text-only behavior. `Duck` = play dub, lower original to ~15%. `Replace` = play dub, mute original entirely while dubbing. |
| **Voice** `<select>`: `Auto (per speaker)` · named voices | `Auto` | Auto assigns each speaker a stable voice. Manual picks one voice for all dubs. |
| Status line | — | "Speaking French… (3 queued)", "Voice unavailable — showing subtitles", autoplay-blocked hint. |

That's it: **pick the language you read in** (existing) and **turn on Voice mode** (new). The captions keep working underneath, so a listener always has both modalities.

### 3.2 Playback behavior

- Dubs are a **clear voiceover**, played at normal level (not spatialized in v1 — see §8.2), so the translation is easy to follow.
- While a dub for speaker X plays, X's live mic is **ducked** for this listener (gain × ~0.15) or **muted** (`Replace`), then restored on dub end (with a safety timeout so gain always recovers).
- Dubs **queue** and play sequentially per listener; stale items (older than ~8 s, or superseded mid-conversation) are dropped so audio never lags far behind the room.
- Your **own** speech is never dubbed to you.

### 3.3 Indicator & consent

- The existing "🎙 sharing speech" indicator (capture) is unchanged.
- Voice mode is a **local listening preference** — it transmits nothing new and needs no room-wide indicator. The only audio that leaves a machine is already-published mic audio (for STT) and already-published text (for MT/TTS); the dub itself is local.

### 3.4 3D / 2D parity

Audio is view-independent, so Voice mode behaves identically in 3D and 2D. The subtitle dock (already 2D-parity) continues to render in both.

---

## 4. Architecture

### 4.1 Data flow (new parts in bold)

```
 Speaker (Chrome/Edge)                 Listener (Voice mode on)
 ─────────────────────                 ────────────────────────
 STT (useSpeechRecognition)            receive utterance.v1 (original text + sourceLang)
        │                                       │
 publish room.translation.utterance.v1 ───────► │ POST /translate  → translated text (cached)
        │                                       │        │
 (original text only, over LiveKit)             │        ▼  (Voice mode?)
                                                │  POST /translate/speech { text, lang, voice }
                                                │        │
                                                │  API: cache → OpenAI /v1/audio/speech (mp3)
                                                │        │  audio bytes
                                                │        ▼
                                                │  decode → enqueue dub
                                                │        │
                                                │  play voiceover  +  duck speaker's live mic
                                                │        │              (useSpatialAudio gain × 0.15)
                                                │        ▼
                                                │  on end → restore mic gain, play next in queue
```

- **No new realtime messages required.** Voice is a pure listener-side add-on to the resolved translation. (An optional `room.translation.lang.v1` already exists for future fan-out; not needed here.)
- **The dub never touches LiveKit.** It is fetched over HTTPS and played through the local audio graph only.

### 4.2 Server TTS endpoint + cache

A stateless route beside `/translate` (`apps/api/src/routes/translation.ts`):

```
POST /v1/rooms/:roomId/translate/speech
body:  { text: string(≤2000), lang: BCP47, voice?: string }
resp:  audio bytes (Content-Type: audio/mpeg) + headers X-Translation-Cached, X-Translation-Voice
```

- **Availability guard:** reuse `assertTranslationAvailable` **plus** `config.tuning.enableTranslationVoice`.
- **Cache:** in-process byte LRU keyed by `hash(normalize(lang)|voice|text)` (sibling of `TranslationCache`, bounded by total bytes, lost on restart — same posture). High hit rate because the same translated sentence + language + voice recurs.
- **No-key behavior:** if `OPENAI_API_KEY` is unset, return `204 No Content` (or `409 translation-voice-unavailable`) so the client cleanly falls back to subtitles (or browser `speechSynthesis` if that fallback is enabled).
- **Rate limit:** reuse `enforceTranslationRateLimit` with its own per-minute budget (`TRANSLATION_TTS_RATE_LIMIT_PER_MINUTE`, lower than text since audio is heavier; cache absorbs repeats).
- **Voice assignment:** if `voice` omitted, server picks deterministically from the speaker hint or the client supplies `voice` derived from `participantId` (so the same speaker is always the same voice). Voice list from `OPENAI_TTS_VOICES`.

### 4.3 TTS call shape

Single `POST https://api.openai.com/v1/audio/speech` (same auth/retry pattern as `translateText`):

```jsonc
{
  "model": "gpt-4o-mini-tts",      // config.tuning.openAiTtsModel
  "voice": "alloy",                 // resolved per speaker or user choice
  "input": "<translated text>",
  "response_format": "mp3"          // or "opus" for smaller payloads
}
```

Returns binary audio; stream straight into the cache + response.

### 4.4 Client playback + ducking

A new hook `useTranslationVoice` (sibling of `useTranslation`) owns:

- **Trigger:** `useTranslation` gains an optional `onTranslationResolved({ participantId, utteranceId, sourceLang, targetLang, text, startMs })` callback, fired when a *foreign* final translation resolves. RoomClient wires it to the voice hook's `enqueue(...)`. (No double-translate; the text already exists.)
- **Fetch + decode:** `enqueue` calls `POST /translate/speech`, decodes the audio into an `AudioBuffer` (client cache by the same key).
- **Queue:** a per-listener FIFO; play one dub at a time via an `AudioBufferSourceNode → destination` (clear voiceover). Track `currentlyDubbingParticipantId`.
- **Ducking:** expose `duckedParticipantIds: Set<string>` (the participant currently being dubbed). RoomClient passes it into `useSpatialAudio`, which multiplies that participant's mic gain by a duck factor (Duck) or 0 (Replace).
- **Freshness:** drop queued items older than ~8 s or when the queue exceeds a small cap, so dubbing can't fall behind the conversation.
- **Autoplay:** reuse the existing AudioContext "resume on first gesture" pattern (`useSpatialAudio` already does this); the Voice-mode toggle itself is a user gesture.

**Audio-context sharing:** the dub should play through the **same `AudioContext`** the spatial audio graph uses, so ducking and playback are coherent. Two integration options (decided in IMPL): (A) lift the `AudioContext` into a small shared ref both hooks read (cleaner); (B) give the voice hook its own context and only feed `duckedParticipantIds` back to `useSpatialAudio` (lowest-risk, slightly more resource use). Recommended: start with (B) for isolation, move to (A) if/when spatialized dubs (§8.2) are added.

### 4.5 Voice ↔ speaker mapping

Deterministic: `voiceForParticipant(participantId) = VOICES[hash(participantId) % VOICES.length]`. Stable per session, no coordination, and "Auto" in the UI. Manual override applies one chosen voice to all dubs.

---

## 5. TTS model recommendation

**Use OpenAI TTS; default `gpt-4o-mini-tts`.**

| Need | Model | Why |
|---|---|---|
| **Default dub voice** | `gpt-4o-mini-tts` (env `OPENAI_TTS_MODEL`) | Newest, cheapest, instructable (can hint tone/pace), good multilingual coverage, low latency. Same vendor/key/`fetch` pattern as the translate endpoint — no new dependency. |
| **Quality tier** | `tts-1-hd` (env override) | Higher-fidelity audio where bandwidth/cost allow. |
| **Lowest latency / cost** | `tts-1` | Slightly lower quality, fast. |
| **Zero-infra fallback** | Browser **`speechSynthesis`** (`TRANSLATION_TTS_PROVIDER=browser`) | Free, offline, no server. Caveats below. |

**Voices:** the standard OpenAI set (`alloy, echo, fable, onyx, nova, shimmer`, plus newer additions) via `OPENAI_TTS_VOICES`. Map per speaker (§4.5).

**Why OpenAI TTS over the browser `speechSynthesis` API as the primary:**

- **Consistent, natural quality across all browsers/OSes and languages.** `speechSynthesis` voice availability and quality vary wildly per platform; many languages have only a robotic voice or none.
- **Cacheable.** Server audio bytes are cached by `(lang, voice, text)`, so repeated phrases and multiple listeners are cheap. `speechSynthesis` output can't be cached or deduped.
- **Controllable + queueable.** We get discrete audio buffers we can queue, time, duck around, and (later) spatialize. `speechSynthesis` plays to the default output, is awkward to queue precisely, and **cannot be routed through the WebAudio graph** (so it can't be ducked-coherently or spatialized).

**Keep `speechSynthesis` as an opt-in fallback** for cost-free / no-key deployments, with the UI clearly flagging reduced quality and no spatialization. `TRANSLATION_TTS_PROVIDER = openai | browser | off`.

**Direct S2ST (future):** OpenAI Realtime API can do speech-in/speech-out translation with lower latency and prosody preservation. It is the eventual "simultaneous" upgrade but needs a per-speaker server audio bridge; out of scope for v1 (see §2).

> Model + voice identifiers are env-driven (like `OPENAI_TRANSLATION_MODEL`) so we track OpenAI releases without code changes.

---

## 6. Environment variables

Add to root `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`:

```
# --- Verse Voice Translation (TTS layer on top of text translation) ---
ENABLE_TRANSLATION_VOICE=false
NEXT_PUBLIC_ENABLE_TRANSLATION_VOICE=false

# Reuses OPENAI_API_KEY.
TRANSLATION_TTS_PROVIDER=openai           # openai | browser | off
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICES=alloy,echo,fable,onyx,nova,shimmer
OPENAI_TTS_FORMAT=mp3                      # mp3 | opus
TRANSLATION_TTS_RATE_LIMIT_PER_MINUTE=120
```

Prod validation: if `ENABLE_TRANSLATION_VOICE=true` **and** `TRANSLATION_TTS_PROVIDER=openai`, require `OPENAI_API_KEY` (mirror the existing translate/meeting-notes checks in `apps/api/src/config.ts`).

---

## 7. What we reuse (almost everything)

| Piece | Source — status |
|---|---|
| STT capture | `apps/web/lib/useSpeechRecognition.ts` — **unchanged**. |
| Utterance broadcast | `room.translation.utterance.v1` (`realtime.ts`, contracts) — **unchanged**. |
| Text translation + cache + rate-limit + guard | `apps/api/src/translation/{service,cache,rate-limit}.ts`, `routes/translation.ts`, `auth-guards.ts` — **extend** (sibling TTS endpoint, byte cache, guard flag). |
| Listener-pull + per-user language + localStorage | `useTranslation.ts`, RoomClient state — **add a resolved-translation callback**. |
| Right-HUD card | `TranslationPanel.tsx` — **add Voice-mode + voice selects**. |
| Subtitle dock | `TranslationDock.tsx` — **unchanged** (text remains). |
| Audio graph + gain control + autoplay-resume | `apps/web/lib/useSpatialAudio.ts` — **add `duckedParticipantIds` input**. |
| OpenAI `fetch` + retry | `apps/api/src/translation/service.ts` `translateText` — **copy shape for TTS**. |
| Feature gating (room-type + env + room settings) | contracts `translation` flag (verse+FFA), `config.ts`, `CLIENT_TUNING` — **add voice env gates**. |

New surface is intentionally tiny: one endpoint, one client hook, one gain input, two UI selects.

---

## 8. Gotchas to plan around

### 8.1 Latency / turn-taking (the big one)
Cascade dubbing is **consecutive**: the dub lands ~1.5–3 s after the speaker's sentence ends (STT only emits finals; then MT; then TTS; then play). Set expectations in copy ("translations are spoken just after each sentence"). Don't try to dub interim/partial text — it produces flickering, re-spoken nonsense and multiplies cost. Direct S2ST (§2) is the only way to materially cut this, and it's a separate project.

### 8.2 `speechSynthesis` can't be spatialized or ducked coherently
Browser TTS plays to the default output and is not a WebAudio node you can pan/duck in the same graph. That's the core reason server TTS (decodable audio bytes) is primary. v1 plays dubs as a **non-spatial clear voiceover** regardless of provider; spatializing the dub at the speaker's avatar position is a Phase-2 polish that requires server-TTS buffers routed through `useSpatialAudio` (integration option A in §4.4).

### 8.3 Ducking must always restore
If a dub errors, is dropped, or its `onended` never fires, the original mic gain must still recover. Use an explicit restore on end **and** a safety timeout (e.g. max dub length) so a participant's voice can never get stuck ducked/muted.

### 8.4 Queue & overlap
Multiple speakers talking over each other would otherwise produce overlapping dubs. Play sequentially per listener, cap the queue, and drop stale items so dubbing tracks the live conversation instead of lagging behind it.

### 8.5 Cost multiplier
TTS adds per-character cost on top of MT, plus audio bandwidth. Mitigations: only listeners in Voice mode incur it; server byte-cache dedupes repeats and same-language/voice listeners; finals-only; dedicated (lower) rate limit; `Off` is the default. Consider a per-room cap for very large rooms.

### 8.6 Autoplay policy
Browsers block audio without a user gesture. Reuse the AudioContext resume-on-gesture already in `useSpatialAudio`; treat the Voice-mode toggle as the unlocking gesture; show an "audio blocked — click to enable" hint if the context is still suspended.

### 8.7 No feedback loop (by design — keep it that way)
Dubs are **played locally only and never published** to LiveKit. This is what prevents echo and N×N audio chaos. Recommend headphones in copy so a listener's speakers don't bleed dub audio into their own mic (which is being transcribed). Do **not** ever route dubs back onto a published track.

### 8.8 Voice/gender mismatch
Synthetic voices won't match real timbre/gender; mapping is by `participantId` hash. Acceptable for v1; a future enhancement could let users pick their own "dub voice" and broadcast it (Phase-2, needs the persisted-language/preference work from the text plan's Phase 8).

### 8.9 Still Chrome/Edge for speaking
Voice rides on the existing Web Speech capture, so **speakers** still need Chrome/Edge. **Listeners** of any browser can hear dubs (playback is universal). Server STT (text plan Phase 10) removes the speaker-browser limit for both features at once.

### 8.10 Accessibility — keep subtitles
Voice mode augments captions; it must not hide them. Deaf/HoH users keep the dock; audio users get both. Honor `prefers-reduced-motion` for any UI animation (not audio).

### 8.11 Mobile / Safari
Playback works broadly but autoplay is stricter and background-tab audio may be throttled; degrade to subtitles when playback can't start.

---

## 9. Phased implementation

| Phase | Deliverable |
|---|---|
| **1 — Contracts + flags** | `TtsRequest` schema (REST), `RoomSettings.translation.voice` (or reuse `enabled` + env), error code `translation-voice-unavailable`, `ENABLE_TRANSLATION_VOICE` / `NEXT_PUBLIC_ENABLE_TRANSLATION_VOICE`, `CLIENT_TUNING.enableTranslationVoice`, env templates, OpenAPI entry. |
| **2 — Server TTS endpoint** | `POST /v1/rooms/:id/translate/speech` + byte LRU cache + guard (`enableTranslationVoice`) + rate limit + OpenAI `/audio/speech` call + no-key 204. API tests (guard, cache hit, no-key, rate limit, binary content-type). |
| **3 — Client voice hook** | `useTranslationVoice`: fetch+decode TTS, per-listener queue, freshness drop, `duckedParticipantIds`, autoplay resume. Client byte/buffer cache. `useTranslation` gains `onTranslationResolved` callback. |
| **4 — Ducking integration** | `useSpatialAudio` accepts `duckedParticipantIds`; multiply mic gain (Duck ×0.15 / Replace ×0). RoomClient wires voice hook ↔ spatial audio; safety-timeout restore. |
| **5 — Panel controls** | `TranslationPanel`: Voice-mode select (Off/Duck/Replace), Voice select (Auto/named). Persist to the existing `3dspace.translation:{userId}` localStorage. Status line. |
| **6 — Polish + fallback** | Browser `speechSynthesis` fallback path (`TRANSLATION_TTS_PROVIDER=browser`); autoplay-blocked + voice-unavailable hints; headphone recommendation; 2D check. |
| **7 — Tests + rollout** | Playwright: stub `/translate/speech` to return a tiny fixture clip; assert a dub plays and the speaker's gain ducks then restores; Replace mutes. Status doc + memory. Staging behind `ENABLE_TRANSLATION_VOICE`. |
| **8 — (optional) Spatialized dubs** | Route server-TTS buffers through `useSpatialAudio` at the speaker's position (integration option A). |
| **9 — (optional) Direct S2ST** | OpenAI Realtime per-speaker server bridge for near-simultaneous interpretation. Separate project. |
| **10 — (optional) Custom/own dub voice** | Per-user chosen voice broadcast via the persisted-language work (text plan Phase 8). |

v1 = Phases 1–7.

---

## 10. Privacy, consent, safeguards

1. **No new capture.** Voice mode adds no microphone capture; it consumes already-published mic audio (for STT) and already-translated text (for TTS). Consent posture is unchanged from the text feature.
2. **Local-only dubs.** Synthesized audio is generated for and played to one listener; nothing is broadcast.
3. **Third-party hand-off.** Translated text goes to OpenAI for TTS (same org key, zero-data-retention requirement as MT). Document in the deployment checklist.
4. **Default off.** Gated by `ENABLE_TRANSLATION_VOICE` + room-type `translation` flag + per-user Voice-mode (off by default).
5. **Minors/classroom posture** inherited from the text plan; verse rooms can include students — keep gated and reviewed per deployment.

---

## 11. Relationship to the text translation feature

```
Verse Live Translation (shipped, text)
├── STT (useSpeechRecognition)          ── reused as-is
├── utterance.v1 broadcast              ── reused as-is
├── POST /translate (+cache)            ── reused as-is
├── useTranslation + TranslationDock    ── + onTranslationResolved callback
└── Voice-to-Voice (THIS PLAN)
       ├── POST /translate/speech (+byte cache)   NEW
       ├── useTranslationVoice (queue, decode)    NEW
       ├── duckedParticipantIds → useSpatialAudio NEW input
       ├── TranslationPanel: Voice-mode + voice   NEW controls
       └── ENABLE_TRANSLATION_VOICE flags          NEW gates
```

Fully additive: text translation, captions, avatar movement, spatial audio (whisper/pods), and the room manifest are unchanged. Voice is gated independently so text-only can ship/stay while voice rolls out.

---

## 12. Open questions

1. Default Voice mode `Duck` factor — 0.15? Make it a setting?
2. Spatialize dubs at the speaker (immersive) or keep them as a clear flat voiceover (clearer)? Plan defaults to flat for v1.
3. Should `Replace` fully mute the original for the whole session, or only during each dub? Plan: only during each dub.
4. Per-room participant/cost cap for voice in large verse rooms?
5. Ship the browser `speechSynthesis` fallback in v1, or OpenAI-only first?
6. Combine with the persisted-language work so users can choose their own dub voice and have it follow them across rooms?
7. When do we invest in direct S2ST (§2) for true simultaneous interpretation?


