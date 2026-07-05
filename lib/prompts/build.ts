/**
 * Prompt assembly for a single component-generation call.
 *
 * Every prompt is layered: an MTA copywriter persona, the live methodology
 * corpus from the brain (lift craft, sales-letter frameworks, guru voice), any
 * RAG few-shot exemplars from real best-performing past components, the shared
 * brief, the component-specific instructions from the registry, and — always —
 * the claims-integrity guardrail. The output contract is a simple, robust
 * delimiter format the generate route parses back into items.
 */

import type { ComponentSpec } from "../components";
import type { PackageBrief } from "../brief";
import type { MethodologyCorpus } from "../brain-reader";
import {
  buildWritingRulesBlock,
  buildLiftCraftBlock,
  buildSalesLetterBlock,
  buildGuruVoiceBlock,
} from "../brain-reader";

export const ITEM_DELIM = "===ITEM===";

export interface BuiltPrompt {
  system: string;
  user: string;
  maxTokens: number;
}

/** Which brain blocks are relevant to this component. */
function methodologyFor(spec: ComponentSpec, corpus: MethodologyCorpus): string {
  const blocks: string[] = [];
  const isLift = spec.slug.includes("lift-notes");
  const isLongForm = spec.slug === "order-form" || spec.slug === "lifetime-upsell";
  if (isLift) {
    blocks.push(buildLiftCraftBlock(corpus));
    if (spec.voice === "mixed") blocks.push(buildGuruVoiceBlock(corpus));
  }
  if (isLongForm) blocks.push(buildSalesLetterBlock(corpus));
  if (
    (spec.group === "Ad" || spec.slug.includes("facebook") || spec.slug.includes("youtube")) &&
    corpus.socialTactics
  ) {
    blocks.push(
      `\n### CURRENT SOCIAL AD TACTICS (refreshed from the web)\n${corpus.socialTactics.slice(0, 3000)}`
    );
  }
  return blocks.filter(Boolean).join("\n");
}

function voiceRule(spec: ComponentSpec, brief: PackageBrief, guruCount: number, n: number): string {
  if (spec.voice === "third") {
    return `VOICE: Write in third person throughout. Do not write as the guru in first person. Where an email needs a signature, end the body with the literal placeholder "[Sign off]".`;
  }
  if (spec.voice === "editorial") {
    return `VOICE: Write in an editorial register (as the publication's editorial desk), third person. Where a sign-off is needed, end with "[Sign off]".`;
  }
  // mixed (lift notes) — ~80% third person, ~20% guru first-person
  const guru = brief.primaryGuru ?? "the guru";
  return `VOICE (mixed): Of the ${n} item(s) in this batch, write ${guruCount} in ${guru}'s first-person voice (label that item "VOICE: guru") and the remaining ${n - guruCount} in generic third person ending the body with the literal placeholder "[Sign off]" (label "VOICE: third"). Match ${guru}'s established voice for the guru items.`;
}

/**
 * Formatting discipline — Stephen's feedback (2026-07-05): generated lifts were
 * littered with repeated ">>>" lines; real MTA lifts use several distinct
 * formats and an arrow CTA appears once if at all. The exemplars are the format
 * authority, not the model's instincts.
 */
function formatRules(spec: ComponentSpec, hasExemplars: boolean): string {
  const rules: string[] = ["FORMATTING RULES:"];
  if (hasExemplars) {
    rules.push(
      `- The PROVEN EXAMPLES below show the real formats we use for this component — there are several distinct format types. Pick ONE example's format per item and mirror it faithfully (paragraph rhythm, line breaks, how the CTA link is presented, where the P.S. sits). Across the set, vary WHICH format you use so the batch reflects the same mix the examples do.`
    );
  }
  rules.push(
    `- Decorative symbols are seasoning, not structure: a ">>" or ">>>" CTA line may appear AT MOST ONCE per item (the main click line). Never repeat arrow lines, never use them as bullets or section dividers.`,
    `- No markdown syntax (no #, ##, **, or backticks) — write as the copy will actually appear in an email/page.`
  );
  if (spec.perItem) {
    rules.push(`- No two items in the set may open the same way or lean on the same crutch phrase.`);
  }
  return rules.join("\n");
}

function outputContract(spec: ComponentSpec, n: number): string {
  if (!spec.perItem) {
    return `OUTPUT: Return ONLY the finished document content — no preamble, no explanation, no markdown code fences. Use clear labels/sub-headings where the instructions call for structured fields.`;
  }
  return `OUTPUT: Return exactly ${n} distinct item(s). Separate each item with a line containing exactly "${ITEM_DELIM}" and nothing else. Put NO preamble before the first item and nothing after the last. Within each item, label the required fields (e.g. "SUBJECT A:", "SSL:", "BODY:") as described. Make the items genuinely different from one another.`;
}

function briefBlock(brief: PackageBrief): string {
  const lines = [
    `Title / package: ${brief.title}`,
    `Publisher: ${brief.publisher ?? "—"}`,
    `Guru(s): ${brief.gurus.join(", ") || "—"}${brief.primaryGuru ? ` (primary: ${brief.primaryGuru})` : ""}`,
    `Product: ${brief.product ?? "—"}`,
    `Price / offer terms: ${brief.price ?? "—"}`,
    `Promo type: ${brief.promoType ?? "—"}`,
    `Target audience: ${brief.audience}`,
    ``,
    `BIG IDEA:\n${brief.bigIdea}`,
    ``,
    `OFFER SUMMARY:\n${brief.offer}`,
    ``,
    `DOMINANT HOOKS / ANGLES:\n${brief.hooks}`,
    ``,
    `PROOF POINTS (real results/numbers from the promo — pull from these, don't invent new ones):\n${brief.claimsInventory}`,
  ];
  if (brief.isHotlist) {
    lines.push(
      ``,
      `HOTLIST EVENT: "${brief.eventName ?? "the event"}" on ${brief.eventDate ?? "the announced date"}. CTAs are event-registration style pointing to the sign-up page.`
    );
  }
  lines.push(``, `PROMO EXCERPT (ground your copy in this actual promo — do not contradict it):\n${brief.promoExcerpt}`);
  return lines.join("\n");
}

const PERSONA = `You are a senior direct-response copywriter for Monument Traders Alliance (MTA), a financial trading newsletter publisher. You write high-converting promotional copy for a conservative audience of male investors aged ~50–70. You write like MTA — applying the specific curated principles below, never generic AI marketing filler. You never expose internal frameworks (16-Word Sales Letter, Copy-Boarding, etc.) in reader-facing copy; you apply them invisibly.`;

/**
 * Build the prompt for one generation call.
 * @param n number of items requested in THIS call (batch)
 * @param guruCount for "mixed" voice: how many of the n items should be guru-voice
 * @param ragBlock optional few-shot exemplar block (from lib/rag.ts)
 */
export function buildComponentPrompt(
  spec: ComponentSpec,
  brief: PackageBrief,
  corpus: MethodologyCorpus,
  n: number,
  guruCount: number,
  ragBlock: string
): BuiltPrompt {
  const system = [
    PERSONA,
    methodologyFor(spec, corpus),
    buildWritingRulesBlock(corpus.principles),
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `COMPONENT TO WRITE: ${spec.label}`,
    spec.perItem ? `QUANTITY (this batch): ${n}` : `QUANTITY: 1 document`,
    ``,
    `WHAT THIS COMPONENT IS:\n${spec.instructions}`,
    ``,
    voiceRule(spec, brief, guruCount, n),
    ``,
    formatRules(spec, !!ragBlock),
    ``,
    `━━━ BRIEF ━━━`,
    briefBlock(brief),
    ragBlock
      ? `\n━━━ PROVEN EXAMPLES (real MTA winners — mirror their FORMAT and craft; do NOT copy their content) ━━━\n${ragBlock}`
      : ``,
    ``,
    outputContract(spec, n),
  ]
    .filter((l) => l !== ``)
    .join("\n");

  // Budget tokens by expected size.
  const maxTokens = spec.perItem
    ? Math.min(16000, Math.max(2500, n * 800 + 800))
    : spec.slug === "editorial-guide"
    ? 4000
    : 9000;

  return { system, user, maxTokens };
}
