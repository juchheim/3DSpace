import type { AppConfig } from "../config.js";
import { HttpError } from "../errors.js";
import { TranslationCache } from "./cache.js";

export interface TranslateInput {
  text: string;
  sourceLang: string;
  targetLang: string;
  context?: string[] | undefined;
}

export interface TranslateResult {
  translatedText: string;
  cached: boolean;
  model: string;
}

function normalizeLang(code: string): string {
  return code.split("-")[0]?.toLowerCase() ?? code.toLowerCase();
}

const SYSTEM_PROMPT = (sourceLang: string, targetLang: string) =>
  `You are a translation engine. Translate the user's text from ${sourceLang} to ${targetLang}. Output ONLY the translation, with no quotes, notes, or commentary. Preserve names, numbers, and tone. If the text is already in ${targetLang}, return it unchanged.`;

export async function translateText(
  config: AppConfig,
  input: TranslateInput,
  cache: TranslationCache
): Promise<TranslateResult> {
  const normalizedSrc = normalizeLang(input.sourceLang);
  const normalizedTgt = normalizeLang(input.targetLang);

  if (normalizedSrc === normalizedTgt) {
    return { translatedText: input.text, cached: false, model: "identity" };
  }

  const cacheKey = TranslationCache.hashKey(normalizedSrc, normalizedTgt, input.text);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return { translatedText: cached, cached: true, model: config.tuning.openAiTranslationModel };
  }

  if (!config.openAiApiKey) {
    return { translatedText: input.text, cached: false, model: "passthrough" };
  }

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT(normalizedSrc, normalizedTgt) }
  ];

  if (input.context && input.context.length > 0) {
    for (const line of input.context) {
      messages.push({ role: "user", content: line });
      messages.push({ role: "assistant", content: "(prior context)" });
    }
  }

  messages.push({ role: "user", content: input.text });

  const MAX_RETRIES = 2;
  let attempt = 0;
  while (true) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.openAiApiKey}`
      },
      body: JSON.stringify({
        model: config.tuning.openAiTranslationModel,
        temperature: 0,
        max_tokens: Math.min(4096, input.text.length * 3 + 256),
        messages
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
      throw new HttpError(503, "Translation service failed", "translation-failed");
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const translatedText = payload.choices?.[0]?.message?.content?.trim();
    if (!translatedText) {
      throw new HttpError(503, "Translation service returned empty result", "translation-failed");
    }

    cache.set(cacheKey, translatedText);
    return { translatedText, cached: false, model: config.tuning.openAiTranslationModel };
  }
}
