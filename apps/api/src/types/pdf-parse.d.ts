type PdfParseResult = {
  text?: string;
  numpages?: number;
};

declare module "pdf-parse/lib/pdf-parse.js" {
  export default function pdfParse(data: Buffer): Promise<PdfParseResult>;
}
