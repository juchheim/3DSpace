import type { RoomAiHostFileChunk } from "@3dspace/contracts";
import { newId } from "../repository.js";

/** ~800 tokens at ~4 chars/token. */
const CHUNK_CHARS = 3_200;
/** ~100-token overlap between chunks. */
const OVERLAP_CHARS = 400;

export function chunkText(input: { roomId: string; fileId: string; text: string }): RoomAiHostFileChunk[] {
  const normalized = input.text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chunks: RoomAiHostFileChunk[] = [];
  let index = 0;
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + CHUNK_CHARS);
    const slice = normalized.slice(start, end).trim();
    if (slice) {
      chunks.push({
        id: newId("aihostchunk"),
        fileId: input.fileId,
        roomId: input.roomId,
        index,
        text: slice
      });
      index += 1;
    }
    if (end >= normalized.length) break;
    start = Math.max(0, end - OVERLAP_CHARS);
  }

  return chunks;
}
