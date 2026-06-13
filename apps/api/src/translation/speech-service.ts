import type { AppConfig } from "../config.js";
import { HttpError } from "../errors.js";
import { TranslationSpeechCache } from "./speech-cache.js";

export interface SpeechInput {
  text: string;
  lang: string;
  voice: string;
}

export interface SpeechResult {
  audio: Buffer;
  contentType: string;
  cached: boolean;
  voice: string;
}

function normalizeLang(code: string): string {
  return code.split("-")[0]?.toLowerCase() ?? code.toLowerCase();
}

export async function synthesizeSpeech(
  config: AppConfig,
  input: SpeechInput,
  cache: TranslationSpeechCache
): Promise<SpeechResult | null> {
  if (config.tuning.translationTtsProvider !== "openai" || !config.openAiApiKey) {
    return null;
  }

  const normalizedLang = normalizeLang(input.lang);
  const key = TranslationSpeechCache.hashKey(normalizedLang, input.voice, input.text);
  const cached = cache.get(key);
  if (cached !== undefined) {
    const contentType = config.tuning.openAiTtsFormat === "opus" ? "audio/ogg" : "audio/mpeg";
    return { audio: cached, contentType, cached: true, voice: input.voice };
  }

  const MAX_RETRIES = 2;
  let attempt = 0;
  while (true) {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.openAiApiKey}`
      },
      body: JSON.stringify({
        model: config.tuning.openAiTtsModel,
        voice: input.voice,
        input: input.text,
        response_format: config.tuning.openAiTtsFormat
      })
    });

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt++;
      continue;
    }

    if (!response.ok) {
      throw new HttpError(503, "TTS service failed", "translation-voice-unavailable");
    }

    const arrayBuf = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuf);
    cache.set(key, audio);

    const contentType = config.tuning.openAiTtsFormat === "opus" ? "audio/ogg" : "audio/mpeg";
    return { audio, contentType, cached: false, voice: input.voice };
  }
}
