/**
 * Build the shared brief for the Hotlist Builder.
 *
 * The primary input is a hotlist SIGN-UP PAGE (the registration landing page for
 * a live event), NOT a full sales promo. An optional promo can be supplied for
 * extra context on the offer that will be revealed at the event. We run the
 * sign-up page through Claude to extract the event's promise, host/guru, what
 * registrants get, the emotional hooks, proof points, and audience — everything
 * the hotlist lift notes, space ads, and text ads pull from.
 *
 * Mirrors lib/build-brief.ts (same PackageBrief shape, same best-effort analyzer
 * registration for the learning loop) but is event-first instead of offer-first,
 * so isHotlist is always true and the CTAs stay registration-style.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { ExtractedFile } from "./extract-text";
import type { PackageBrief } from "./brief";
import { getClient } from "./anthropic";
import { OPUS_MODEL } from "./models";
import { detectGuru } from "./brain-reader";
import { ocrPdf } from "./ocr";

const MAX_CHARS = 60000;
const SIGNUP_EXCERPT_CHARS = 12000;
const PROMO_CONTEXT_CHARS = 6000;

export interface HotlistBriefHints {
  title: string;
  publisher?: string | null;
  product?: string | null;
  price?: string | null;
  eventName?: string;
  eventDate?: string;
}

interface ExtractedHotlistJSON {
  eventName: string | null;
  eventDate: string | null;
  bigIdea: string;
  publisher: string | null;
  gurus: string[];
  product: string | null;
  price: string | null;
  offer: string;
  hooks: string;
  proofPoints: string;
  audience: string;
}

const EXTRACTION_SYSTEM = `You are a senior analyst for Monument Traders Alliance, a financial trading newsletter publisher. You read a hotlist SIGN-UP PAGE for a live event (a webinar, summit, live reveal, or trading session) and produce a tight, structured brief that copywriters use to generate the registration-driving assets (lift notes, space ads, text ads). Be accurate and specific — ground everything in the actual page. Never spoil what will be revealed at the event; capture the PROMISE and the intrigue, not the secret. For the proof points, list every notable result, number, track-record claim, and piece of evidence the page uses so downstream copy pulls from real ammunition instead of inventing figures.`;

function parseJSON(text: string): ExtractedHotlistJSON | null {
  try {
    const cleaned = text.replace(/```(?:json)?/gi, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}") + 1;
    if (start === -1 || end <= start) return null;
    return JSON.parse(cleaned.slice(start, end)) as ExtractedHotlistJSON;
  } catch {
    return null;
  }
}

/** Best-effort plain text for an extracted file: text layer → OCR → "". */
async function resolveText(extracted: ExtractedFile | null): Promise<string> {
  if (!extracted) return "";
  if (extracted.type === "text") return extracted.content ?? "";
  let text = extracted.textForFK ?? "";
  if (!text.trim()) text = (await ocrPdf(extracted.buffer)) ?? "";
  return text;
}

export async function buildHotlistBrief(
  signup: ExtractedFile,
  promo: ExtractedFile | null,
  hints: HotlistBriefHints
): Promise<PackageBrief> {
  const client = getClient();

  const signupText = await resolveText(signup);
  const promoText = promo ? await resolveText(promo) : "";

  const instruction = `Analyze this hotlist SIGN-UP PAGE (and the related promo context, if provided) and return ONLY a JSON object with these exact keys:
{
  "eventName": "the live event's name, or null",
  "eventDate": "the event date/time if stated, or null",
  "bigIdea": "the event's core promise / why to attend, in 2-4 sentences — the payoff WITHOUT spoiling the reveal",
  "publisher": "publication name or null",
  "gurus": ["the analyst/guru names hosting or presenting the event"],
  "product": "the product/service that will be offered at or after the event, or null",
  "price": "any price/terms mentioned, or null",
  "offer": "what a registrant gets by attending: what they'll learn/see, any free bonuses for registering, the format",
  "hooks": "the dominant emotional hooks & angles (curiosity, fear/urgency, greed, FOMO of missing the live reveal) and why they work",
  "proofPoints": "the page's proof points: each notable result, number, track-record claim, and piece of evidence it uses",
  "audience": "who this targets"
}
Return the JSON and nothing else.`;

  // Prefer text; fall back to inline PDF vision only when the sign-up page has no
  // usable text layer (image/screenshot PDFs are common for landing pages).
  const promoContext = promoText.trim()
    ? `\n\n━━━ RELATED PROMO (context only — the offer revealed at the event) ━━━\n${promoText.slice(0, MAX_CHARS)}`
    : "";

  const content: Anthropic.MessageParam["content"] =
    !signupText.trim() && signup.type === "pdf_raw"
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: signup.buffer.toString("base64"),
            },
          },
          { type: "text", text: instruction + promoContext },
        ]
      : [
          {
            type: "text",
            text: `${instruction}\n\n━━━ HOTLIST SIGN-UP PAGE ━━━\n${signupText.slice(0, MAX_CHARS)}${promoContext}`,
          },
        ];

  const resp = await client.messages.create({
    model: OPUS_MODEL,
    max_tokens: 2500,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: "user", content }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = parseJSON(text);

  const groundingText = `${signupText}\n${promoText}`;
  const gurus = parsed?.gurus?.length
    ? parsed.gurus
    : detectGuru(groundingText)
    ? [detectGuru(groundingText) as string]
    : [];
  const primaryGuru = detectGuru(gurus.join(" ") + " " + groundingText) ?? gurus[0] ?? null;

  const eventName = hints.eventName?.trim() || parsed?.eventName || undefined;
  const eventDate = hints.eventDate?.trim() || parsed?.eventDate || undefined;

  // Grounding excerpt = the sign-up page (+ a trimmed promo context block). The
  // prompt's briefBlock treats this as the copy to stay faithful to.
  const promoExcerpt = [
    `SIGN-UP PAGE:\n${signupText.slice(0, SIGNUP_EXCERPT_CHARS)}`,
    promoText.trim()
      ? `\n\nRELATED PROMO (context for what's revealed at the event):\n${promoText.slice(0, PROMO_CONTEXT_CHARS)}`
      : "",
  ].join("");

  const brief: PackageBrief = {
    title: hints.title || eventName || "Hotlist",
    bigIdea: parsed?.bigIdea ?? "(could not extract — see sign-up page excerpt)",
    publisher: hints.publisher ?? parsed?.publisher ?? null,
    gurus,
    primaryGuru,
    product: hints.product ?? parsed?.product ?? null,
    price: hints.price ?? parsed?.price ?? null,
    offer: parsed?.offer ?? "",
    hooks: parsed?.hooks ?? "",
    claimsInventory:
      parsed?.proofPoints ??
      "No proof points extracted — pull results and numbers directly from the sign-up page excerpt.",
    audience: parsed?.audience ?? "Conservative male investors, ~50–70.",
    promoType: "Hotlist",
    promoExcerpt,
    promoFullText: groundingText.slice(0, MAX_CHARS),
    reviewId: null,
    isHotlist: true,
    eventName,
    eventDate,
  };

  // NOTE: no analyzer registration here — that's opt-in via the results screen.
  return brief;
}
