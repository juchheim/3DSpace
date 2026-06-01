import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractTextFromBuffer } from "../../src/ai-host/extract-text.js";

const require = createRequire(import.meta.url);

describe("extractTextFromBuffer", () => {
  it("extracts text from a PDF without loading pdf-parse debug entrypoint", async () => {
    const samplePath = require.resolve("pdf-parse/test/data/05-versions-space.pdf");
    const body = readFileSync(samplePath);
    const result = await extractTextFromBuffer("application/pdf", body);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.pageCount).toBe(1);
  });

  it("reads plain text and markdown", async () => {
    const txt = await extractTextFromBuffer("text/plain", Buffer.from("  hello  "));
    expect(txt.text).toBe("hello");
    const md = await extractTextFromBuffer("text/markdown", Buffer.from("# Title"));
    expect(md.text).toBe("# Title");
  });
});
