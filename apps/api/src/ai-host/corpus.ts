import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The world-building knowledge base injected into the Build Help system prompt.
 * Authored manually in `corpus/world-building-guide.md`; keep it in sync when build UX changes.
 * The markdown file is copied to `dist/ai-host/corpus/` by `scripts/copy-builtin-catalog.mjs`.
 */
const CORPUS_URL = new URL("./corpus/world-building-guide.md", import.meta.url);

let cached: string | null = null;

export function loadWorldBuildingCorpus(): string {
  if (cached !== null) return cached;
  cached = readFileSync(fileURLToPath(CORPUS_URL), "utf8").trim();
  return cached;
}

/** Rough token estimate (~4 chars/token) for budget checks and logging. */
export function estimateCorpusTokens(corpus = loadWorldBuildingCorpus()): number {
  return Math.ceil(corpus.length / 4);
}
