/**
 * Split a multi-item training document into individual pieces.
 *
 * Real example docs usually hold MANY items — e.g. 10 lift notes in one Word
 * doc, 30 lifts across 3 docs. Storing them as one blob would mean RAG only
 * ever sees the first item, so at ingest time (one-time cost per doc) we have
 * Sonnet split the document into its individual items. Formats vary wildly
 * (numbered "Lift #3", "Email 7", subject-line headers, page breaks), which is
 * why this is an LLM pass rather than a regex. Falls back to the whole text as
 * a single item on any failure.
 */

import { getClient } from "./anthropic";
import { SONNET_MODEL } from "./models";

const MAX_DOC_CHARS = 60000;
const MAX_ITEM_CHARS = 5000;

const SPLIT_SYSTEM = `You split marketing-copy documents into their individual items. A document may contain one or many pieces of the same component type (e.g. 10 lift-note emails, 8 space ads). Return the items VERBATIM — do not rewrite, summarize, or fix anything. Include each item's own headers (subject lines, SSL, etc.) with that item. Drop only document-level furniture (title pages, TOCs, writer notes that belong to no item).`;

export async function splitItems(category: string, text: string): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const client = getClient();
    const resp = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 32000,
      system: SPLIT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `This document contains one or more individual "${category}" pieces. Split it into its individual items and return ONLY a JSON array of strings — each string is the complete verbatim text of one item. If it's really just a single item, return a one-element array.\n\n━━━ DOCUMENT ━━━\n${trimmed.slice(0, MAX_DOC_CHARS)}`,
        },
      ],
    });
    const out = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    const cleaned = out.replace(/```(?:json)?/gi, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]") + 1;
    if (start === -1 || end <= start) return [trimmed.slice(0, MAX_ITEM_CHARS)];
    const arr = JSON.parse(cleaned.slice(start, end));
    if (!Array.isArray(arr)) return [trimmed.slice(0, MAX_ITEM_CHARS)];
    const items = arr
      .filter((x): x is string => typeof x === "string" && x.trim().length > 40)
      .map((x) => x.trim().slice(0, MAX_ITEM_CHARS));
    return items.length > 0 ? items : [trimmed.slice(0, MAX_ITEM_CHARS)];
  } catch {
    return [trimmed.slice(0, MAX_ITEM_CHARS)];
  }
}
