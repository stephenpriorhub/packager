/**
 * OCR fallback for image-only / scanned PDFs.
 *
 * pdf-parse only reads a PDF's text layer, so designed/scanned promos (very
 * common for real MTA promos and component examples) came back empty and were
 * skipped by training ingest, RAG, and brief grounding. This hands the raw PDF
 * to Claude's native PDF vision and gets a verbatim transcription back, making
 * image PDFs first-class citizens everywhere text is needed.
 *
 * Soft: returns null on any failure (too big, API error, junk output) so
 * callers degrade exactly as they did before.
 */

import { getClient } from "./anthropic";
import { SONNET_MODEL } from "./models";

// Claude's PDF input limit is ~32MB / 100 pages; leave headroom for base64.
const MAX_PDF_BYTES = 22 * 1024 * 1024;
const MIN_USEFUL_CHARS = 100;

export async function ocrPdf(buffer: Buffer): Promise<string | null> {
  if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) return null;
  try {
    const client = getClient();
    const resp = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 32000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: buffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: "Transcribe this document's full text VERBATIM, in reading order. Preserve paragraph breaks, headlines, subject lines, sign-offs, and CTA lines as plain text. Do not summarize, fix, or comment — output ONLY the transcription.",
            },
          ],
        },
      ],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    return text.length >= MIN_USEFUL_CHARS ? text : null;
  } catch {
    return null;
  }
}
