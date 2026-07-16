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
import { usesCatalysts, usesAdCompliance, adCompliancePlatform } from "../components";
import type { PackageBrief } from "../brief";
import type { MethodologyCorpus } from "../brain-reader";
import { type CatalystResult, NO_CATALYSTS } from "../catalysts";
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
  const isHeadline = spec.slug === "alternative-headlines";
  if (isLift) {
    blocks.push(buildLiftCraftBlock(corpus));
    if (spec.voice === "mixed") blocks.push(buildGuruVoiceBlock(corpus));
  }
  // The 16-Word Sales Letter / Copy-Boarding frameworks are the brain's headline
  // & lead craft — route them to the long-form pages and to headline generation.
  if (isLongForm || isHeadline) blocks.push(buildSalesLetterBlock(corpus));
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
  // Angle-variety mandate for the high-variety pieces (Stephen, 2026-07-11).
  const wantsAngleVariety = spec.perItem && (spec.group === "Ad" || spec.slug.includes("lift-notes"));
  if (wantsAngleVariety) {
    rules.push(
      `- VARIETY MANDATE: the set must span genuinely DIFFERENT angles — not one hook reworded. Rotate across distinct angle families (curiosity/mystery, fear/warning, track-record/proof, direct-benefit, contrarian/pattern-interrupt, deadline/scarcity, story/secret, news/catalyst hook). Consecutive items must not share an angle, and no single angle should dominate the set.`
    );
  }
  return rules.join("\n");
}

/**
 * Live-catalyst block for the pieces that may use one (lift notes, space ads).
 * The catalysts are already web-verified; the model's only job is to decide
 * whether one is genuinely relevant and, if so, tag the items that use it.
 */
function catalystBlock(spec: ComponentSpec, catalysts: CatalystResult): string {
  if (!catalysts.hasCatalysts || !usesCatalysts(spec)) return "";
  return [
    `━━━ LIVE CATALYSTS (web-verified, current as of today) ━━━`,
    catalysts.block,
    ``,
    `USING CATALYSTS: If — and ONLY if — one of the catalysts above is genuinely relevant to this promo's theme, you MAY build 1–2 items in this set around it to add timeliness (this counts as the "news/catalyst" angle in the variety mix). For any item you do, add a final line exactly like "ACTIVE CATALYST: <which catalyst>" — this is an internal tag for the editor, NOT part of the reader-facing copy. Keep the rest of the set evergreen. Never force an unrelated catalyst and never invent one that isn't listed above.`,
  ].join("\n");
}

/**
 * Platform ad-policy compliance for paid video ads (Stephen, 2026-07-16, from
 * the "YouTube Financial Ads Do's & Don'ts" network guide). YouTube and Facebook
 * video ads run through Google Ads / Meta financial-products review; a single
 * "Misleading Representation" pattern can permanently ban the ad account. These
 * rules keep the COPY inside policy while staying persuasive.
 *
 * Scope note (Stephen's call): copy/scripting only. We do NOT add on-screen risk
 * warnings, visual disclaimers, or "investing involves risk" overlays — the
 * no-disclaimer-in-copy rule still holds. This block only shapes what the copy
 * SAYS (and what it must not say), never appends disclaimer language.
 */
function adComplianceBlock(spec: ComponentSpec): string {
  if (!usesAdCompliance(spec)) return "";
  const platform = adCompliancePlatform(spec);
  const network = platform === "Facebook" ? "Meta (Facebook) Advertising Policies" : "Google Ads financial-products policies";
  return [
    `━━━ ${platform} AD-POLICY COMPLIANCE (mandatory — keeps the ad account alive) ━━━`,
    `This copy will be scanned by ${network}. Policy reviewers read the transcript, audio, and on-screen text together; a "Misleading Representation" pattern can permanently suspend the ad account. Stay persuasive but keep every line defensible:`,
    ``,
    `NEVER (these trip automated financial-scam / misleading-claim flags):`,
    `- No outsized, unrealistic gain claims as the hook or promise — e.g. "3,000% gains", "turn $500 into $50,000", "overnight millionaire". Reference real results only as historically-verified exceptions, never as what a viewer should expect.`,
    `- No hyper-urgency clichés — e.g. "once this window closes it's gone forever", "act in the next 10 minutes or miss out". Urgency must be honest and specific, not manufactured doom.`,
    `- No false "free" claims — don't say "100% free, no email required" (or similar) when the offer needs an email, registration, or a card on file to access. Describe the real cost of entry.`,
    `- No fabricated authority or endorsement — never imply backing from public figures, agencies, or brands (e.g. Elon Musk, the CIA, a sitting President) the publisher isn't actually endorsed by.`,
    `- No direct private/pre-IPO access claims for retail — never tell ordinary viewers they can "buy directly into pre-IPO / private shares" of a company. Retail can't, and it flags as a scam.`,
    ``,
    `ALWAYS:`,
    `- Balanced framing: pair any big number with the reality that past results don't guarantee future returns — worked into the copy naturally (as framing, NOT a legal disclaimer line).`,
    `- Ad-to-landing-page congruency: whatever the hook offers (e.g. "the free report") must be exactly what the destination delivers, with no bait-and-switch. Only promise what the landing page actually gives.`,
    `- Honest CTA language: the CTA describes the true next step and destination — e.g. "Read the Full Free Article", "Request the Free Newsletter" — never a misleading label.`,
    `- Professional, informative pace and tone: build genuine curiosity; avoid frenetic, alarmist "URGENT WARNING" sensationalism that reviewers flag as scam-like.`,
    `- Pre-IPO "backdoor play" framing: when the promo is built around a hotly-anticipated private company (e.g. SpaceX, a private defense-tech startup), do NOT offer its shares. Instead teach the viewer to play publicly-traded proxies — an ETF, the parent company, or a listed supplier/partner — that captures that growth. This is both policy-safe and a strong retail hook.`,
  ].join("\n");
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
  ragBlock: string,
  catalysts: CatalystResult = NO_CATALYSTS
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
    adComplianceBlock(spec),
    ``,
    catalystBlock(spec, catalysts),
    `━━━ BRIEF ━━━`,
    briefBlock(brief),
    ragBlock
      ? spec.slug === "alternative-headlines"
        ? `\n━━━ WINNING HEADLINES FROM SIMILAR PROMOS (same price tier, best performers — each shows the promo's eyebrow / headline / subhead and a 4 U's read; study WHAT made them work and the range of shapes, do NOT reuse their wording or their specific claims) ━━━\n${ragBlock}`
        : `\n━━━ PROVEN EXAMPLES (real MTA winners — mirror their FORMAT and craft; do NOT copy their content) ━━━\n${ragBlock}`
      : ``,
    ``,
    outputContract(spec, n),
  ]
    .filter((l) => l !== ``)
    .join("\n");

  // Budget tokens by expected size. Order forms are long-form closes — give
  // them room to match proven-example length (kept < ~21k so the non-streaming
  // SDK call doesn't throw "Streaming is required").
  const maxTokens = spec.perItem
    ? Math.min(16000, Math.max(2500, n * 800 + 800))
    : spec.slug === "editorial-guide"
    ? 4000
    : spec.slug === "order-form"
    ? 16000
    : 9000;

  return { system, user, maxTokens };
}
