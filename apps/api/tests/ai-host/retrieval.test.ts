import { describe, expect, it } from "vitest";
import { retrieveTopChunks } from "../../src/ai-host/retrieval.js";

describe("retrieveTopChunks", () => {
  it("prefers chunks that contain query terms", () => {
    const chunks = [
      { id: "a", fileId: "f", roomId: "r", index: 0, text: "Photosynthesis uses chlorophyll in plants." },
      { id: "b", fileId: "f", roomId: "r", index: 1, text: "The cafeteria menu lists pizza on Fridays." }
    ];
    const hits = retrieveTopChunks(chunks, "What is photosynthesis?");
    expect(hits[0]?.id).toBe("a");
  });
});
