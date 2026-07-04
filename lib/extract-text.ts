/**
 * Extract text from an uploaded promo file.
 *
 * Ported from promo-analyzer/lib/extract-text.ts. .docx via mammoth, .pdf via
 * pdf-parse (text layer) with a raw-buffer fallback for image/scanned PDFs so
 * the caller can hand the bytes to Claude's vision instead. .txt read directly.
 */

import mammoth from "mammoth";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  buf: Buffer,
  opts?: { max?: number }
) => Promise<{ text: string; numpages?: number }>;

export type ExtractedFile =
  | { type: "text"; content: string; pageNote?: string }
  | { type: "pdf_raw"; buffer: Buffer; textForFK?: string; pageNote?: string };

const SCANNED_THRESHOLD = 200;
const MAX_TEXT_PAGES = 80;

export async function extractFile(buffer: Buffer, filename: string): Promise<ExtractedFile> {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "docx" || ext === "doc") {
    const result = await mammoth.extractRawText({ buffer });
    return { type: "text", content: result.value };
  }

  if (ext === "txt" || ext === "md") {
    return { type: "text", content: buffer.toString("utf-8") };
  }

  if (ext === "pdf") {
    let textForFK: string | undefined;
    let totalPages = 0;
    let pageNote: string | undefined;

    try {
      const meta = await pdfParse(buffer, { max: 1 });
      totalPages = meta.numpages ?? 0;
    } catch {
      /* ignore */
    }

    try {
      const opts = totalPages > MAX_TEXT_PAGES ? { max: MAX_TEXT_PAGES } : undefined;
      const data = await pdfParse(buffer, opts);
      const text = data.text?.trim() ?? "";
      if (text.length >= SCANNED_THRESHOLD) {
        textForFK = text;
        if (totalPages > MAX_TEXT_PAGES) {
          pageNote = `Note: this PDF has ${totalPages} pages; only the first ${MAX_TEXT_PAGES} were read.`;
        }
      }
    } catch {
      /* image-based PDF — no text layer */
    }

    return { type: "pdf_raw", buffer, textForFK, pageNote };
  }

  throw new Error(`Unsupported file type: .${ext ?? "?"}. Upload a .docx, .pdf, or .txt.`);
}
