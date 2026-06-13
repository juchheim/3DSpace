const MAX_BYTES = 32 * 1024 * 1024; // 32 MB

export class TranslationSpeechCache {
  private readonly map = new Map<string, Buffer>();
  private bytes = 0;

  get(key: string): Buffer | undefined {
    const buf = this.map.get(key);
    if (buf === undefined) return undefined;
    // LRU: move to end
    this.map.delete(key);
    this.map.set(key, buf);
    return buf;
  }

  set(key: string, buf: Buffer) {
    if (this.map.has(key)) {
      const existing = this.map.get(key)!;
      this.bytes -= existing.length;
      this.map.delete(key);
    }
    while (this.bytes + buf.length > MAX_BYTES && this.map.size > 0) {
      const firstKey = this.map.keys().next().value;
      if (firstKey === undefined) break;
      const firstBuf = this.map.get(firstKey)!;
      this.bytes -= firstBuf.length;
      this.map.delete(firstKey);
    }
    this.map.set(key, buf);
    this.bytes += buf.length;
  }

  static hashKey(lang: string, voice: string, text: string): string {
    return `${lang}|${voice}|${text}`;
  }
}
