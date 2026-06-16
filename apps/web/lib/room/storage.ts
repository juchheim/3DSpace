import type { VoiceMode } from "../useTranslationVoice";

export const FINE_PLACEMENT_STORAGE_KEY = "3dspace-fine-placement";

export type TranslationPreferences = {
  readLang: string;
  speakLang: string;
  voiceMode: VoiceMode;
  voiceChoice: string;
};

function defaultLanguage(navigatorLanguage: string | undefined): string {
  return navigatorLanguage?.split("-")[0] ?? "en";
}

function parseStoredJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function readFinePlacement(storage: Pick<Storage, "getItem"> | undefined): boolean {
  return storage?.getItem(FINE_PLACEMENT_STORAGE_KEY) === "1";
}

export function writeFinePlacement(
  storage: Pick<Storage, "setItem"> | undefined,
  enabled: boolean
): boolean {
  storage?.setItem(FINE_PLACEMENT_STORAGE_KEY, enabled ? "1" : "0");
  return enabled;
}

export function readTranslationPreferences(input: {
  storage: Pick<Storage, "getItem"> | undefined;
  storageKey: string;
  navigatorLanguage: string | undefined;
}): TranslationPreferences {
  const stored = parseStoredJson(input.storage?.getItem(input.storageKey) ?? null);
  const fallback = defaultLanguage(input.navigatorLanguage);
  return {
    readLang:
      typeof stored.readLang === "string" && stored.readLang.length > 0
        ? stored.readLang
        : fallback,
    speakLang:
      typeof stored.speakLang === "string" && stored.speakLang.length > 0
        ? stored.speakLang
        : fallback,
    voiceMode:
      stored.voiceMode === "duck" ||
      stored.voiceMode === "replace" ||
      stored.voiceMode === "off"
        ? stored.voiceMode
        : "off",
    voiceChoice:
      typeof stored.voiceChoice === "string" && stored.voiceChoice.length > 0
        ? stored.voiceChoice
        : "auto"
  };
}

export function writeTranslationPreference(
  input: {
    storage: Pick<Storage, "getItem" | "setItem"> | undefined;
    storageKey: string;
  },
  patch: Partial<TranslationPreferences>
): TranslationPreferences {
  const current = readTranslationPreferences({
    storage: input.storage,
    storageKey: input.storageKey,
    navigatorLanguage: undefined
  });
  const next = { ...current, ...patch };
  input.storage?.setItem(input.storageKey, JSON.stringify(next));
  return next;
}
