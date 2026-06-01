import { describe, expect, it } from "vitest";
import { chunkText } from "../../src/ai-host/chunker.js";

describe("chunkText", () => {
  it("returns empty for blank text", () => {
    expect(chunkText({ roomId: "r", fileId: "f", text: "   " })).toEqual([]);
  });

  it("splits long text into overlapping chunks", () => {
    const text = "word ".repeat(900).trim();
    const chunks = chunkText({ roomId: "room-1", fileId: "file-1", text });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.index).toBe(0);
    expect(chunks[0]?.roomId).toBe("room-1");
    expect(chunks[0]?.fileId).toBe("file-1");
  });
});
