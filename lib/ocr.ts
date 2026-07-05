/**
 * OCR fallback for image-only / scanned PDFs.
 *
 * pdf-parse only reads a PDF's text layer, so designed/scanned promos (very
 * common for real MTA promos and component examples) came back empty and were
 * skipped by training ingest, RAG, and brief grounding. This uploads the PDF
 * to Anthropic's Files API (same proven path as promo-analyzer's corpus
 * vision extraction — inline base64 hits the API's request-size ceiling on
 * big scanned promos) and asks Claude for a verbatim transcription.
 *
 * Soft: returns null on any failure (too big, API error, junk output) so
 * callers degrade exactly as they did before.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { getClient } from "./anthropic";
import { SONNET_MODEL } from "./models";

const FILES_BETA = "files-api-2025-04-14";
// Keep in step with next.config.ts's 100mb request-body cap.
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MIN_USEFUL_CHARS = 100;

/** Upload a PDF to the Files API; returns the file id or null. */
export async function uploadPdf(buffer: Buffer): Promise<string | null> {
  if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) return null;
  try {
    const client = getClient();
    const uploaded = await client.beta.files.upload({
      file: new File([Uint8Array.from(buffer)], "document.pdf", {
        type: "application/pdf",
      }),
    });
    return uploaded.id;
  } catch {
    return null;
  }
}

export async function ocrPdf(buffer: Buffer): Promise<string | null> {
  const fileId = await uploadPdf(buffer);
  if (!fileId) return null;
  try {
    const client = getClient();
    // Streamed: the SDK refuses non-streaming calls with max_tokens this large
    // ("Streaming is required for operations that may take longer than 10
    // minutes") — that silent throw is exactly how OCR v1 failed in production.
    const stream = client.beta.messages.stream({
      model: SONNET_MODEL,
      betas: [FILES_BETA],
      max_tokens: 64000,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "file", file_id: fileId } },
            {
              type: "text",
              text: "Transcribe this document's full text VERBATIM, in reading order. Preserve paragraph breaks, headlines, subject lines, sign-offs, and CTA lines as plain text. Do not summarize, fix, or comment — output ONLY the transcription.",
            },
          ],
        },
      ],
    });
    const resp = await stream.finalMessage();
    const text = resp.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text.length >= MIN_USEFUL_CHARS ? text : null;
  } catch {
    return null;
  }
}
