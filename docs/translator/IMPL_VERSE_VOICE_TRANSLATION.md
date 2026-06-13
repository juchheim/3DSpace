# Implementation — Verse Voice-to-Voice Translation

Companion plan: [`PLAN_VERSE_VOICE_TRANSLATION.md`](./PLAN_VERSE_VOICE_TRANSLATION.md)
Builds on shipped text translation: [`IMPL_VERSE_TRANSLATION.md`](./IMPL_VERSE_TRANSLATION.md)
Branch target: `feature/verse-voice-translation`
Last updated: 2026-06-13

This maps the plan to concrete files. Voice-to-voice is the **TTS leg** of the existing STT→MT cascade plus **ducking** the original via the gain control already in `useSpatialAudio`. Almost nothing in the shipped text feature changes. Read the plan §0/§4 first.

Line anchors are at time of writing; confirm before editing.

---

## Architecture recap (one paragraph)

The shipped feature already turns speech into translated **text** per listener (`useTranslation` → `POST /v1/rooms/:id/translate`). For voice, when a listener has Voice mode on, the client sends the resolved translation to a new **`POST /v1/rooms/:id/translate/speech`** (server holds the OpenAI key, generates audio with `gpt-4o-mini-tts`, caches bytes by `hash(lang|voice|text)`), decodes it, and plays it as a clear local voiceover while **ducking** the original speaker's live mic (a new `duckedParticipantIds` input to `useSpatialAudio`). Dubs are local-only (never published), queued per listener, and dropped if stale. Gated by `translation` room-type flag (existing) + `ENABLE_TRANSLATION_VOICE` / `NEXT_PUBLIC_ENABLE_TRANSLATION_VOICE` + per-user Voice-mode (default Off).

---

## Phase 1 — Contracts + flags

### 1.1 `packages/contracts/src/index.ts`

**Error code.** Add to `ApiErrorCodeSchema` (next to `translation-failed`, ~line 1488): `"translation-voice-unavailable"`.

**Room settings.** Extend the existing `translation` block in `RoomSettingsSchema` (~line 1858):

```ts
translation: z.object({
  enabled: z.boolean().default(true),
  defaultTargetLanguage: z.string().optional(),
  voiceEnabled: z.boolean().default(true)   // NEW: room may allow/forbid spoken dubs
}).default({ enabled: true, voiceEnabled: true }),
```

**TTS REST schemas.** Add near `TranslateRequestSchema` (~line 3110):

```ts
export const TranslateSpeechRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  lang: z.string().min(2).max(20),
  voice: z.string().min(1).max(40).optional(),
});
export type TranslateSpeechRequest = z.infer<typeof TranslateSpeechRequestSchema>;
// Response is binary audio (audio/mpeg) — not a JSON schema. Documented in OpenAPI as a byte stream.

export const TRANSLATION_TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;

export function voiceForParticipant(participantId: string, voices: readonly string[] = TRANSLATION_TTS_VOICES): string {
  let h = 0;
  for (let i = 0; i < participantId.length; i++) h = (h * 31 + participantId.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % voices.length;
  return voices[idx] ?? voices[0]!;
}
```

**OpenAPI.** Add a `post /v1/rooms/{roomId}/translate/speech` entry to `apiRoutes` (after the `/translate` entry, ~line 4486). Mark the response as an audio byte stream (the codebase already notes non-JSON byte routes inline, e.g. world-skin assets); register request schema only, or add a short comment that the response is `audio/mpeg`.

### 1.2 `apps/web/lib/config.ts`

Add to `CLIENT_TUNING`:

```ts
enableTranslationVoice: process.env.NEXT_PUBLIC_ENABLE_TRANSLATION_VOICE === "true",
```

### 1.3 `apps/api/src/config.ts`

Add to `tuning` (next to the translation block, ~line 368):

```ts
enableTranslationVoice: envBoolean(raw, "ENABLE_TRANSLATION_VOICE", false),
translationTtsProvider: envString(raw, "TRANSLATION_TTS_PROVIDER") ?? "openai",   // openai | browser | off
openAiTtsModel: envString(raw, "OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts",
openAiTtsVoices: envStringList(raw, "OPENAI_TTS_VOICES", ["alloy","echo","fable","onyx","nova","shimmer"]),
openAiTtsFormat: envString(raw, "OPENAI_TTS_FORMAT") ?? "mp3",
translationTtsRateLimitPerMinute: envNumber(raw, "TRANSLATION_TTS_RATE_LIMIT_PER_MINUTE", 120),
```

Add to the `AppConfig.tuning` type (next to `enableTranslation`). Extend prod validation (~line 263): if `enableTranslationVoice && translationTtsProvider === "openai"`, push `"OPENAI_API_KEY"`.

### 1.4 Env templates

Add the plan §6 block to root `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`.

**Validation:** `npm run typecheck -w @3dspace/contracts -w @3dspace/api -w @3dspace/web`.

---

## Phase 2 — Server TTS endpoint

### 2.1 Byte cache — `apps/api/src/translation/speech-cache.ts` (new)

Sibling of `TranslationCache`, but stores `Buffer` and bounds by **total bytes** (audio is large):

```ts
export class TranslationSpeechCache {
  private map = new Map<string, Buffer>();
  private bytes = 0;
  private max = 32 * 1024 * 1024; // ~32 MB
  get(key: string): Buffer | undefined { /* LRU touch */ }
  set(key: string, buf: Buffer) { /* evict oldest until under max */ }
  static hashKey(lang: string, voice: string, text: string): string { return `${lang}|${voice}|${text}`; }
}
```

Instantiate in `apps/api/src/app.ts` next to `translationCache` (~line 63) and inject via `AppContext` (`apps/api/src/app-context.ts`), mirroring `translationCache`.

### 2.2 TTS service — `apps/api/src/translation/speech-service.ts` (new)

```ts
export interface SpeechInput { text: string; lang: string; voice: string; }
export interface SpeechResult { audio: Buffer; contentType: string; cached: boolean; voice: string; }

export async function synthesizeSpeech(config, input: SpeechInput, cache: TranslationSpeechCache): Promise<SpeechResult | null>
```

Behavior:
1. If `config.tuning.translationTtsProvider !== "openai"` or `!config.openAiApiKey` → return `null` (caller responds 204 → client falls back to subtitles / browser TTS).
2. `key = TranslationSpeechCache.hashKey(normalize(lang), voice, text)`; on hit return cached buffer (`cached:true`).
3. `POST https://api.openai.com/v1/audio/speech` with the same auth + 429-retry shape as `translateText` (`apps/api/src/translation/service.ts`):
   ```jsonc
   { "model": config.tuning.openAiTtsModel, "voice": input.voice, "input": input.text, "response_format": config.tuning.openAiTtsFormat }
   ```
   Read `response.arrayBuffer()` → `Buffer`. `contentType = format === "opus" ? "audio/ogg" : "audio/mpeg"`.
4. On non-OK → throw `HttpError(503, "...", "translation-voice-unavailable")`.
5. `cache.set(key, buf)`; return.

### 2.3 Route — extend `apps/api/src/routes/translation.ts`

```ts
app.post("/v1/rooms/:roomId/translate/speech", async (request, reply) => {
  const auth = await requireUser(request, ctx.config, ctx.repository);
  const { roomId } = parseParams(ParamsWithRoomId, request);
  const body = parseBody(TranslateSpeechRequestSchema, request);
  const room = await assertTranslationAvailable(ctx.repository, ctx.config, roomId, auth);
  if (!ctx.config.tuning.enableTranslationVoice || room.settings.translation?.voiceEnabled === false) {
    return reply.code(409).send({ error: { code: "translation-voice-unavailable", message: "Voice translation disabled" } });
  }
  enforceTranslationRateLimit(auth.userId, roomId, ctx.config.tuning.translationTtsRateLimitPerMinute);
  const voice = body.voice ?? ctx.config.tuning.openAiTtsVoices[0]!;
  const result = await synthesizeSpeech(ctx.config, { text: body.text, lang: body.lang, voice }, ctx.translationSpeechCache);
  if (!result) return reply.code(204).send();
  reply.header("content-type", result.contentType);
  reply.header("x-translation-cached", String(result.cached));
  reply.header("x-translation-voice", result.voice);
  reply.header("cache-control", "no-store");
  return reply.send(result.audio);
});
```

(Note: extend `assertTranslationAvailable` to **return the room** if it doesn't already, so the `voiceEnabled` check can read `room.settings`.)

### 2.4 Tests — `apps/api/tests/routes/translation-speech.test.ts` (new)

- non-member → 401/403; `enableTranslationVoice=false` → 409 `translation-voice-unavailable`; room `voiceEnabled:false` → 409.
- happy path (mock OpenAI `/audio/speech` returning fixture bytes) → `200`, `content-type: audio/mpeg`, body length > 0.
- second identical request → `x-translation-cached: true`, no second fetch.
- `translationTtsProvider=off` or no key → `204`.
- rate-limit exceeded → 429.

**Validation:** `npm run test -- apps/api/tests/routes/translation-speech.test.ts`.

---

## Phase 3 — Client voice hook

### 3.1 API client — `apps/web/lib/api.ts`

Add (near `translateText`):

```ts
export async function translateSpeech(
  identity: ApiIdentity, roomId: string, body: { text: string; lang: string; voice?: string }
): Promise<ArrayBuffer | null> {
  const res = await fetch(`${API_URL}/v1/rooms/${roomId}/translate/speech`, {
    method: "POST", headers: { "content-type": "application/json", ...authHeaders(identity) },
    body: JSON.stringify(body)
  });
  if (res.status === 204 || res.status === 409) return null; // fall back to subtitles / browser TTS
  if (!res.ok) throw await apiError(res);
  return res.arrayBuffer();
}
```

### 3.2 `useTranslation.ts` — add a resolved-translation callback

Add an optional input `onTranslationResolved?: (item: { participantId; utteranceId; sourceLang; targetLang; text; startMs }) => void`. Fire it inside the existing `cachedTranslate(...).then(translatedText => ...)` block (~line 268), right after updating the line, **only** for foreign (non-same-language) finals that aren't the user's own. No other change; text behavior is untouched.

### 3.3 `apps/web/lib/useTranslationVoice.ts` (new)

```ts
export type VoiceMode = "off" | "duck" | "replace";

export function useTranslationVoice(input: {
  identity: ApiIdentity;
  roomId?: string;
  enabled: boolean;            // translationEnabled && CLIENT_TUNING.enableTranslationVoice
  mode: VoiceMode;             // user choice
  voiceChoice: string;         // "auto" | named voice
  provider: "openai" | "browser";
}) {
  // queue: Array<{ participantId, utteranceId, text, lang, voice, enqueuedAt }>
  // duckedParticipantIds: Set<string>  (exposed)
  // enqueue(item): push, kick playback loop
  // playback loop: shift → fetch (translateSpeech) → decodeAudioData → AudioBufferSourceNode → destination
  //   set duckedParticipantIds = {participantId} on start; clear on ended + safety timeout
  //   drop items older than STALE_MS (8000) or beyond MAX_QUEUE (4)
  // browser provider: speechSynthesis.speak(utterance with lang); duck via the set still works
  // returns { enqueue, duckedParticipantIds, speaking, queueDepth, audioBlocked, resumeAudio }
}
```

Key points:
- **AudioContext:** v1 uses the hook's **own** `AudioContext` for dub playback (integration option B in plan §4.4); ducking is communicated to `useSpatialAudio` purely via `duckedParticipantIds`. (Option A — shared context for spatialized dubs — is Phase 8.)
- **Decode:** `ctx.decodeAudioData(arrayBuffer)`; cache decoded `AudioBuffer` by `(lang|voice|text)` in a module `Map`.
- **Voice:** `voiceChoice === "auto" ? voiceForParticipant(participantId) : voiceChoice`.
- **Autoplay:** if `ctx.state === "suspended"`, expose `audioBlocked=true` and `resumeAudio()` (called on the Voice-mode toggle gesture / a hint button); reuse the resume-on-gesture idiom from `useSpatialAudio`.
- **Safety restore:** always clear the participant from `duckedParticipantIds` on `onended`, on error, and via a `setTimeout(maxDubMs)` guard.
- **Browser fallback (`provider:"browser"`):** `const u = new SpeechSynthesisUtterance(text); u.lang = lang; speechSynthesis.speak(u);` — still drive `duckedParticipantIds` from `onstart`/`onend`. Note: non-spatial, no decode/cache.

**Validation:** unit-test the queue reducer (enqueue, stale-drop, dedupe by `(participantId,utteranceId)`, duck set add/remove).

---

## Phase 4 — Ducking integration (`useSpatialAudio`)

### 4.1 `apps/web/lib/useSpatialAudio.ts`

Add an optional input `duckedParticipantIds?: Set<string>` and a `duckMode?: "duck" | "replace"`. In the per-participant gain computation (~line 150) fold in a duck factor:

```ts
const duckFactor = input.duckedParticipantIds?.has(participant.id)
  ? (input.duckMode === "replace" ? 0 : 0.15)
  : 1;
const targetGain = micOn * whisperGain * podGain * duckFactor;
// use setTargetAtTime smoothing whenever ducking is active (like whisper/pods)
if (audioMode?.mode === "whisper" || input.pods?.enabled || input.duckedParticipantIds?.size) {
  node.gain.gain.setTargetAtTime(targetGain, context.currentTime, 0.1);
} else {
  node.gain.gain.value = micOn;
}
```

Add `input.duckedParticipantIds` and `input.duckMode` to the effect dependency array.

### 4.2 `apps/web/components/RoomClient.tsx`

- Gate (near `translationEnabled`, ~line 385):
  ```ts
  const translationVoiceEnabled = translationEnabled && CLIENT_TUNING.enableTranslationVoice;
  ```
- Voice-mode + voice state seeded from the existing `3dspace.translation:{userId}` localStorage (`voiceMode`, `voiceChoice`), persisted via the existing `set*` helpers.
- Instantiate the voice hook:
  ```ts
  const translationVoice = useTranslationVoice({
    identity, roomId: session?.room.id ?? roomId,
    enabled: translationVoiceEnabled,
    mode: voiceMode, voiceChoice, provider: ttsProvider
  });
  ```
- Wire the callback: pass `onTranslationResolved: translationVoice.enqueue` into the existing `useTranslation({ ... })` call (~line 419). Guard inside `enqueue` so it no-ops when `mode === "off"` or `!enabled`.
- Feed ducking into spatial audio (~line 2473):
  ```ts
  useSpatialAudio(session ? { ...existing,
    duckedParticipantIds: translationVoice.duckedParticipantIds,
    duckMode: voiceMode === "replace" ? "replace" : "duck"
  } : { participants: participantList });
  ```

**Validation:** `npm run typecheck -w @3dspace/web && npm run build -w @3dspace/web`.

---

## Phase 5 — Panel controls

### 5.1 `apps/web/components/TranslationPanel.tsx`

Below the existing language pickers, add (gated by `translationVoiceEnabled`):

- **Hear translations** `<select>` bound to `voiceMode`: `Off (subtitles only)` / `Duck original` / `Replace original`.
- **Voice** `<select>` bound to `voiceChoice`: `Auto (per speaker)` + `TRANSLATION_TTS_VOICES`.
- Status line from the hook: `speaking` → "Speaking <lang>… (<queueDepth> queued)"; `audioBlocked` → "Click to enable translation audio" (calls `resumeAudio`); provider unavailable → "Voice unavailable — showing subtitles".

Reuse `hud-btn` / select styles; no new CSS tokens needed beyond a `.translation-panel__voice*` rule if desired.

---

## Phase 6 — Polish + fallback

- Implement `provider:"browser"` path in `useTranslationVoice` (speechSynthesis) and select provider from `process.env.NEXT_PUBLIC_...` or a runtime hint mirroring `TRANSLATION_TTS_PROVIDER`. (Server already returns 204 when its provider is `off`/no-key, so the client can also try browser TTS as a second fallback.)
- Headphone recommendation copy; autoplay-blocked hint; voice-unavailable hint.
- Confirm subtitles still render in `TranslationDock` with Voice mode on (augment, not replace).
- 2D parity check (audio is view-independent; just confirm the panel + dock render in 2D).

---

## Phase 7 — Tests + rollout

### 7.1 Playwright — `apps/web/test/translation-voice.spec.ts` (new)

Real TTS/audio can't run headless, so:
- Stub `POST /translate/speech` (route interception) to return a tiny fixture audio buffer.
- Expose a debug hook like the text feature's `window.__translationHandleMessage`: e.g. `window.__translationVoiceState()` returning `{ speaking, queueDepth, ducked: [...] }`, and reuse `__translationHandleMessage` to inject a foreign utterance.
- Flow: Tab B sets read=Spanish, Voice mode=Duck; inject an English utterance from A; assert (a) `/translate` then `/translate/speech` were called, (b) `ducked` contains A's id while "playing", (c) ducked clears after. For Replace, assert duck factor path (can assert via an exposed gain probe or just the ducked-set + mode).
- Add `ENABLE_TRANSLATION_VOICE=true` / `NEXT_PUBLIC_ENABLE_TRANSLATION_VOICE=true` to `playwright.config.ts` webServer env (next to the existing `ENABLE_TRANSLATION`).

### 7.2 Rollout

- Ship behind `ENABLE_TRANSLATION_VOICE` (default off); enable in staging verse rooms after the text feature is validated there.
- Confirm OpenAI org key zero-data-retention before enabling with minors.
- Update `.cursor/memory.md`; `MVP_STATUS.md` if relevant.

---

## New / touched files

**New**
- `apps/api/src/translation/speech-service.ts`
- `apps/api/src/translation/speech-cache.ts`
- `apps/api/tests/routes/translation-speech.test.ts`
- `apps/web/lib/useTranslationVoice.ts`
- `apps/web/test/translation-voice.spec.ts`

**Touched**
- `packages/contracts/src/index.ts` (error code, `translation.voiceEnabled`, `TranslateSpeechRequestSchema`, `TRANSLATION_TTS_VOICES`, `voiceForParticipant`, OpenAPI)
- `apps/api/src/config.ts` (tuning + prod validation)
- `apps/api/src/app.ts` + `app-context.ts` (instantiate/inject `translationSpeechCache`)
- `apps/api/src/http/auth-guards.ts` (`assertTranslationAvailable` returns room; already does — confirm)
- `apps/api/src/routes/translation.ts` (add `/translate/speech`)
- `apps/web/lib/config.ts` (`enableTranslationVoice`)
- `apps/web/lib/api.ts` (`translateSpeech`)
- `apps/web/lib/useTranslation.ts` (`onTranslationResolved` callback)
- `apps/web/lib/useSpatialAudio.ts` (`duckedParticipantIds` + `duckMode` gain factor)
- `apps/web/components/RoomClient.tsx` (gate, state, voice hook, wire callback, feed ducking)
- `apps/web/components/TranslationPanel.tsx` (Voice-mode + voice selects, status)
- `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`
- `playwright.config.ts` (E2E flags)

---

## Testing checklist

**Unit / contract**
- Schemas parse; `voiceForParticipant` stable + within voice set.
- `useTranslationVoice` queue reducer: enqueue, dedupe `(participantId,utteranceId)`, stale-drop, max-queue, duck-set add/remove, safety-timeout restore.

**API**
- Guard (member / `enableTranslationVoice` / room `voiceEnabled`); cache hit header; no-key/`off` → 204; rate-limit 429; binary content-type + non-empty body; bad provider/error → `translation-voice-unavailable`.

**Web component**
- Panel Voice-mode + voice selects persist to localStorage; status line states (speaking/blocked/unavailable).
- `useSpatialAudio` lowers gain for ducked ids (Duck ×0.15, Replace ×0) and restores.

**Playwright**
- Stubbed `/translate/speech`: injected foreign utterance → `/translate` then `/translate/speech` called; speaker ducked during playback then restored; Replace path; same-language → no TTS call; own speech → no dub.

**Manual**
- Real mic Chrome: A speaks English, B (Spanish, Voice=Duck) hears Spanish dub a moment later with A's voice quieted then restored; Replace fully mutes A during dub; headphones avoid bleed; subtitles still show.

---

## Definition of Done (v1 = Phases 1–7)

- A listener with Voice mode on hears others' speech spoken in their own language, shortly after each sentence, with the original ducked (or replaced) and restored reliably.
- TTS runs server-side (key never exposed), cached + rate-limited, with clean 204/subtitle fallback when no key/provider.
- Dubs are local-only (never published); no feedback loop; queue drops stale audio.
- Subtitles remain available alongside voice; works in 3D and 2D.
- Gated by `ENABLE_TRANSLATION_VOICE` + room-type `translation` flag + per-user Voice-mode (default Off); existing text translation, spatial audio (whisper/pods), and avatar movement unchanged.
- Typecheck (contracts/api/web), API tests, and the stubbed Playwright voice flow pass.
- `.env.example` files and `.cursor/memory.md` updated.
