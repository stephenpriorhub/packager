/**
 * Build the shared package brief from an uploaded promo.
 *
 * Runs the promo through Claude to extract the big idea, offer, guru(s), hooks,
 * and the promo's proof points (results/numbers/evidence) so every downstream
 * component pulls from the promo's own ammunition. Then best-effort registers
 * the promo as a Draft in the Promo Analyzer so it shows there with a 📦 and
 * becomes labeled training data once it launches.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { ExtractedFile } from "./extract-text";
import type { PackageBrief } from "./brief";
import { getClient } from "./anthropic";
import { OPUS_MODEL } from "./models";
import { detectGuru } from "./brain-reader";
import { registerDraft } from "./analyzer-client";
import { ocrPdf } from "./ocr";

const MAX_PROMO_CHARS = 60000;
const EXCERPT_CHARS = 12000;

export interface BriefHints {
  title: string;
  publisher?: string | null;
  product?: string | null;
  price?: string | null;
  isHotlist: boolean;
  eventName?: string;
  eventDate?: string;
}

interface ExtractedBriefJSON {
  bigIdea: string;
  publisher: string | null;
  gurus: string[];
  product: string | null;
  price: string | null;
  offer: string;
  hooks: string;
  claimsInventory: string;
  audience: string;
  promoType: string | null;
}

const EXTRACTION_SYSTEM = `You are a senior analyst for Monument Traders Alliance, a financial trading newsletter publisher. You read an unlaunched promo and produce a tight, structured brief that copywriters will use to generate every secondary component (lift notes, ads, order form, etc.). Be accurate and specific — ground everything in the actual promo. For the proof points, list every notable result, number, track-record claim, and piece of evidence the promo uses, quoted or closely paraphrased, so downstream copy can pull from the promo's own ammunition instead of inventing its own.`;

function parseJSON(text: string): ExtractedBriefJSON | null {
  try {
    const cleaned = text.replace(/```(?:json)?/gi, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}") + 1;
    if (start === -1 || end <= start) return null;
    return JSON.parse(cleaned.slice(start, end)) as ExtractedBriefJSON;
  } catch {
    return null;
  }
}

export async function buildBrief(
  extracted: ExtractedFile,
  hints: BriefHints
): Promise<PackageBrief> {
  const client = getClient();

  const instruction = `Analyze this promo and return ONLY a JSON object with these exact keys:
{
  "bigIdea": "the core promise / big idea in 2-4 sentences",
  "publisher": "publication name or null",
  "gurus": ["guru/analyst names presenting this"],
  "product": "product/service being sold or null",
  "price": "price point + terms if stated, else null",
  "offer": "what's included: subscription, bonuses, reports, guarantee, terms",
  "hooks": "the dominant emotional hooks & angles (fear/greed/curiosity/etc.) and why they work",
  "claimsInventory": "the promo's proof points: each notable result, number, track-record claim, and piece of evidence it uses",
  "audience": "who this targets",
  "promoType": "Front-end / Backend VSL / Mega-bundle / Hotlist, best guess, or null"
}
Return the JSON and nothing else.`;

  const content: Anthropic.MessageParam["content"] =
    extracted.type === "pdf_raw" && !extracted.textForFK
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: extracted.buffer.toString("base64"),
            },
          },
          { type: "text", text: instruction },
        ]
      : [
          {
            type: "text",
            text: `${instruction}\n\n━━━ PROMO ━━━\n${(
              extracted.type === "text" ? extracted.content : extracted.textForFK ?? ""
            ).slice(0, MAX_PROMO_CHARS)}`,
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

  // Promo text we keep for grounding + registration. Image-only PDFs have no
  // text layer, so transcribe via Claude vision — otherwise the excerpt every
  // component grounds itself in (and the analyzer registration) would be empty.
  let promoText =
    extracted.type === "text" ? extracted.content : extracted.textForFK ?? "";
  if (!promoText.trim() && extracted.type === "pdf_raw") {
    promoText = (await ocrPdf(extracted.buffer)) ?? "";
  }

  const gurus = parsed?.gurus?.length
    ? parsed.gurus
    : detectGuru(promoText)
    ? [detectGuru(promoText) as string]
    : [];
  const primaryGuru = detectGuru(gurus.join(" ") + " " + promoText) ?? gurus[0] ?? null;

  const brief: PackageBrief = {
    title: hints.title,
    bigIdea: parsed?.bigIdea ?? "(could not extract — see promo excerpt)",
    publisher: hints.publisher ?? parsed?.publisher ?? null,
    gurus,
    primaryGuru,
    product: hints.product ?? parsed?.product ?? null,
    price: hints.price ?? parsed?.price ?? null,
    offer: parsed?.offer ?? "",
    hooks: parsed?.hooks ?? "",
    claimsInventory:
      parsed?.claimsInventory ??
      "No proof points extracted — pull results and numbers directly from the promo excerpt.",
    audience: parsed?.audience ?? "Conservative male investors, ~50–70.",
    promoType: hints.isHotlist ? "Hotlist" : parsed?.promoType ?? null,
    promoExcerpt: promoText.slice(0, EXCERPT_CHARS),
    reviewId: null,
    isHotlist: hints.isHotlist,
    eventName: hints.eventName,
    eventDate: hints.eventDate,
  };

  // Best-effort: register as a Draft in the analyzer (adds the 📦 + training seed).
  brief.reviewId = await registerDraft({
    title: brief.title,
    promoText: promoText.slice(0, MAX_PROMO_CHARS),
    promoType: brief.promoType,
    publisher: brief.publisher,
    gurus: brief.gurus,
    product: brief.product,
    price: brief.price,
  });

  return brief;
}
