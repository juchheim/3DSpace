const MAX_ENTRIES = 8_000;

export class TranslationCache {
  private readonly map = new Map<string, string>();

  get(key: string): string | undefined {
    return this.map.get(key);
  }

  set(key: string, value: string) {
    if (this.map.size >= MAX_ENTRIES) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }

  static hashKey(sourceLang: string, targetLang: string, text: string): string {
    return `${sourceLang}|${targetLang}|${text}`;
  }
}
