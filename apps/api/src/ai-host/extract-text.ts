export type ExtractedDocument = {
  text: string;
  pageCount?: number | undefined;
};

export async function extractTextFromBuffer(
  contentType: string,
  body: Buffer
): Promise<ExtractedDocument> {
  const baseType = contentType.split(";")[0]?.trim().toLowerCase() ?? contentType.toLowerCase();

  if (baseType === "text/plain" || baseType === "text/markdown") {
    const text = body.toString("utf8").trim();
    return { text };
  }

  if (baseType === "application/pdf") {
    // pdf-parse/index.js runs a debug read of ./test/data/05-versions-space.pdf when
    // loaded without a CJS parent (common under "type": "module" dynamic import).
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const result = await pdfParse(body);
    const text = (result.text ?? "").trim();
    const pageCount = typeof result.numpages === "number" ? result.numpages : undefined;
    if (!text) {
      throw new Error("No extractable text found in this PDF");
    }
    return { text, pageCount };
  }

  throw new Error(`Unsupported content type: ${contentType}`);
}
