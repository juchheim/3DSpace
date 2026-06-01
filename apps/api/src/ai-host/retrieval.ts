import type { RoomAiHostFileChunk } from "@3dspace/contracts";

const DEFAULT_TOP_K = 6;

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
}

function scoreChunk(chunk: RoomAiHostFileChunk, terms: string[]): number {
  if (terms.length === 0) return 0;
  const haystack = chunk.text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

/** Keyword-lite retrieval: top-k chunks by term overlap with the user question. */
export function retrieveTopChunks(
  chunks: RoomAiHostFileChunk[],
  query: string,
  topK = DEFAULT_TOP_K
): RoomAiHostFileChunk[] {
  if (chunks.length === 0) return [];
  const terms = tokenizeQuery(query);
  const ranked = [...chunks]
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
    .sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);

  const withHits = ranked.filter((entry) => entry.score > 0).map((entry) => entry.chunk);
  if (withHits.length > 0) {
    return withHits.slice(0, topK);
  }
  return ranked.slice(0, topK).map((entry) => entry.chunk);
}
