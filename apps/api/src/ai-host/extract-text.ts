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
    const pdfParse = (await import("pdf-parse")).default;
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
