/**
 * Component registry — the single source of truth for what a "copy package" is.
 *
 * Each entry drives the whole pipeline: the upload-screen Advanced panel, the
 * generation orchestration (model tier, batch size, voice rule), the docx
 * export filename, and the brain component-guide slug. Add a component here and
 * it flows through the entire app.
 *
 * Voice rules (Stephen's call):
 *   - "third"     → always 3rd person (all short copy: ads, popups, cart-abandon).
 *   - "mixed"     → ~80% generic 3rd person (body ends with a "[Sign off]"
 *                   placeholder), ~20% in the specific guru's first-person voice.
 *                   Lift notes only.
 *   - "editorial" → editorial register (the editorial guide + hotlist warm-ups).
 */

import type { ModelTier } from "./models";

export type Voice = "third" | "mixed" | "editorial";
export type ComponentGroup = "Email" | "Ad" | "Page" | "Editorial";

export interface ComponentSpec {
  /** stable id — also the docx filename base and brain guide slug */
  slug: string;
  label: string;
  group: ComponentGroup;
  /** part of the Hotlist add-on (only generated when Hotlist is checked) */
  hotlist: boolean;
  defaultQty: number;
  minQty: number;
  maxQty: number;
  /** qty > 1 means produce that many independent variations; 1 means a single doc */
  perItem: boolean;
  /** variations generated per model call — keeps quality high and avoids truncation */
  batchSize: number;
  tier: ModelTier;
  voice: Voice;
  /** true = run a fresh web_search for recent topical articles (editorial guide) */
  usesWebSearch?: boolean;
  /** component-specific generation guidance injected into the prompt */
  instructions: string;
}

// ── Standard package ─────────────────────────────────────────────────────────

const STANDARD: ComponentSpec[] = [
  {
    slug: "vsl-lift-notes",
    label: "VSL Lift Notes",
    group: "Email",
    hotlist: false,
    defaultQty: 25,
    minQty: 5,
    maxQty: 40,
    perItem: true,
    batchSize: 5,
    tier: "opus",
    voice: "mixed",
    instructions: `Short teaser emails whose ONLY job is to drive the click to watch the VSL — a movie trailer, not the movie. Do NOT reveal the promo's big idea or "steal its thunder."
For EACH lift note produce:
- FOUR distinct subject-line options across different angles (curiosity, fear/warning, direct benefit, controversial/pattern-interrupt).
- ONE "SSL" (super subject line / preview text) that extends the intrigue without revealing.
- A body of ~200–300 words, 4th–7th grade reading level, active voice, conversational, using the D.I.C. method (Disrupt → Intrigue → Click) with 3+ click CTAs and a P.S.
Rotate through the classic MTA lift TYPES across the set — track record (brag about real gains), testimonial, secret/story, deadline/urgency, scarcity/exclusivity, direct benefit promise, news hook, quiz/survey, personal note from a publisher figure, and contrarian/counterintuitive. No two consecutive lifts should use the same type.
Format each like a real MTA lift: a "Dear [audience] Reader/Member," salutation, punchy 1–2 sentence paragraphs, CTAs written as natural "click here"-style sentences woven into the copy (never bare URLs, never repeated arrow lines), a sign-off from a named sender, and a P.S. that adds a bonus/urgency with one final click ask.`,
  },
  {
    slug: "space-ads",
    label: "Space Ads",
    group: "Ad",
    hotlist: false,
    defaultQty: 10,
    minQty: 1,
    maxQty: 20,
    perItem: true,
    batchSize: 10,
    tier: "sonnet",
    voice: "third",
    instructions: `Short display/space ads that drive a click to the promo. Each: a punchy headline, 2–4 lines of body building curiosity, and a clear CTA. Tease, don't reveal.
VARIETY IS CRITICAL: rotate across genuinely DIFFERENT angles across the set — curiosity/mystery, fear/warning, track-record/proof, direct-benefit, contrarian/pattern-interrupt, deadline/scarcity, story/secret, and (when a live catalyst is supplied) a timely news/catalyst hook. Never the same hook reworded; no two consecutive ads share an angle and no single angle dominates the set.`,
  },
  {
    slug: "short-text-ads",
    label: "Short Text Ads",
    group: "Ad",
    hotlist: false,
    defaultQty: 10,
    minQty: 1,
    maxQty: 20,
    perItem: true,
    batchSize: 10,
    tier: "sonnet",
    voice: "third",
    instructions: `Very short text ads (search/native style). Each: a headline (≤ ~60 chars) and 1–2 lines of description with a CTA. Punchy and curiosity-driven. Vary angles.`,
  },
  {
    slug: "cart-abandon-emails",
    label: "Cart Abandon Emails",
    group: "Email",
    hotlist: false,
    defaultQty: 3,
    minQty: 1,
    maxQty: 5,
    perItem: true,
    batchSize: 3,
    tier: "sonnet",
    voice: "third",
    instructions: `Emails sent to prospects who reached the order form but didn't buy. Each: a subject line, an SSL/preview line, and a body that overcomes hesitation (recap the offer, reinforce the guarantee, add urgency/scarcity where true) and drives back to checkout. Sequence them: #1 gentle nudge, #2 stronger urgency/objection-handling, #3 final/deadline. End bodies with "[Sign off]".`,
  },
  {
    slug: "exit-popup",
    label: "Exit Popup",
    group: "Page",
    hotlist: false,
    defaultQty: 1,
    minQty: 1,
    maxQty: 1,
    perItem: false,
    batchSize: 1,
    tier: "sonnet",
    voice: "third",
    instructions: `A single exit-intent popup shown when a prospect tries to leave. Include a headline, 1–2 lines of body, and a two-option CTA ("Yes, show me…" / "No thanks…"). Short, punchy, one clear reason to stay.`,
  },
  {
    slug: "facebook-video-ads",
    label: "Facebook Video Ad Copy",
    group: "Ad",
    hotlist: false,
    defaultQty: 10,
    minQty: 1,
    maxQty: 20,
    perItem: true,
    batchSize: 5,
    tier: "sonnet",
    voice: "third",
    instructions: `Facebook video ad scripts/copy. For each: a scroll-stopping hook (first 3 seconds), a short script body (spoken VO / on-screen beats), and the accompanying post primary text + headline + CTA. Reflect the current social tactics block if provided. Vary hooks.`,
  },
  {
    slug: "youtube-video-ads",
    label: "YouTube Video Ad Copy",
    group: "Ad",
    hotlist: false,
    defaultQty: 5,
    minQty: 1,
    maxQty: 15,
    perItem: true,
    batchSize: 5,
    tier: "sonnet",
    voice: "third",
    instructions: `YouTube (pre-roll/in-stream) video ad scripts. For each: a hook that survives the "skip" (first 5 seconds), a script body, and end-card CTA copy. Note pacing for spoken delivery. Vary hooks.`,
  },
  {
    slug: "facebook-text-ads",
    label: "Facebook Text Ad Copy",
    group: "Ad",
    hotlist: false,
    defaultQty: 10,
    minQty: 1,
    maxQty: 20,
    perItem: true,
    batchSize: 10,
    tier: "sonnet",
    voice: "third",
    instructions: `Facebook text (image/link) ads. For each: primary text (2–5 lines), a headline, a link description, and CTA. Curiosity-driven. Vary angles and lead lines.`,
  },
  {
    slug: "order-form",
    label: "Order Form",
    group: "Page",
    hotlist: false,
    defaultQty: 1,
    minQty: 1,
    maxQty: 1,
    perItem: false,
    batchSize: 1,
    tier: "opus",
    voice: "third",
    instructions: `The order-form / checkout page copy — the page where the sale actually closes. Build it section by section, in this order, mirroring the structure and rhythm of the proven examples:
1. HEADLINE that affirms the reader's decision and restates the big promise ("Yes! I want…" energy), plus a supporting subhead.
2. A short deck (2–4 sentences) re-selling the moment: what they're about to get and why now.
3. "HERE'S EVERYTHING YOU GET" value stack — the core subscription with its benefits itemized line by line, then EVERY bonus report/perk from the offer summary, each named with its own one-line benefit and stated value.
4. PRICE FRAMING: retail vs. today's price, what the discount saves them, cost-per-day/per-week math where it helps.
5. THE GUARANTEE (365-day money-back is the MTA norm — and they keep all the reports) presented as total risk-reversal, with its own subhead.
6. URGENCY to complete the order now (real reasons from the offer: deadline, limited spots, price going up).
7. FINAL CTA leading into the card fields, plus a one-line reassurance under the button.
Write real finished copy for every section — no placeholders, no summaries. Apply the sales-letter frameworks invisibly.
LENGTH & STRUCTURE: Order forms are long-form closes, not summaries. Study the proven examples below and MATCH their length AND section structure — the order of sections, how the value stack is laid out, where the guarantee and price framing sit, the rhythm of the close. If the examples run long and fully itemized, yours must too: name and sell every bonus/report/perk on its own line rather than compressing the offer. Do not cut the page short to save space.`,
  },
  {
    slug: "lifetime-upsell",
    label: "Lifetime / Unlimited Upsell",
    group: "Page",
    hotlist: false,
    defaultQty: 1,
    minQty: 1,
    maxQty: 1,
    perItem: false,
    batchSize: 1,
    tier: "opus",
    voice: "third",
    instructions: `The upsell page that moves a buyer from an ANNUAL subscription to LIFETIME/Unlimited access, shown immediately after purchase. Include: a congratulatory transition, the "upgrade now while you're here" logic, the value stack of going unlimited (never pay again, all future reports/upgrades), price framing (cost-per-year math), a one-time-offer urgency, guarantee, and a clear upgrade CTA + a "no thanks" decline line.`,
  },
  {
    slug: "editorial-guide",
    label: "Editorial Guide",
    group: "Editorial",
    hotlist: false,
    defaultQty: 1,
    minQty: 1,
    maxQty: 1,
    perItem: false,
    batchSize: 1,
    tier: "opus",
    voice: "editorial",
    usesWebSearch: true,
    instructions: `A 600–1000 word internal guide that helps EDITORIAL writers and assistants tie their editorial content into this promo. NOT reader-facing sales copy. Cover: the promo's core editorial themes & big idea, the emotional throughline, the guru's angle, 5–8 concrete editorial article/segment ideas that support (without spoiling) the promo, hooks tied to the current news cycle, and a short "recent coverage" section citing recent real web articles on the topic (use the web_search tool; include titles + sources/links).`,
  },
];

// ── Hotlist add-on ────────────────────────────────────────────────────────────

const HOTLIST: ComponentSpec[] = [
  {
    slug: "hotlist-lift-notes",
    label: "Hotlist Lift Notes",
    group: "Email",
    hotlist: true,
    defaultQty: 25,
    minQty: 5,
    maxQty: 40,
    perItem: true,
    batchSize: 5,
    tier: "opus",
    voice: "mixed",
    instructions: `Teaser emails driving registration for the LIVE EVENT (not a VSL). The CTA is event-registration style ("Reserve Your Seat", "Register Now", "Save My Spot") pointing to the sign-up page, building toward the single event date. Same lift craft as VSL lift notes: FOUR subject lines + one SSL + a ~200–300 word D.I.C. body per note, but the payoff is "get on the list for {event} on {event date}", scarcity of seats, and FOMO of missing the live reveal. Do not give away what will be revealed at the event. Same MTA lift formatting too: rotate the lift types across the set, salutation + short punchy paragraphs + natural "click here"-style CTAs woven into sentences (no bare URLs or repeated arrow lines) + named sign-off + P.S.`,
  },
  {
    slug: "hotlist-space-ads",
    label: "Hotlist Space Ads",
    group: "Ad",
    hotlist: true,
    defaultQty: 10,
    minQty: 1,
    maxQty: 20,
    perItem: true,
    batchSize: 10,
    tier: "sonnet",
    voice: "third",
    instructions: `Short space/display ads driving event registration. Headline + curiosity body + registration CTA ("Reserve Your Seat"). Tie to the event date and seat scarcity.
VARIETY IS CRITICAL: rotate across genuinely DIFFERENT angles across the set — curiosity/mystery, fear/warning, track-record/proof, direct-benefit, contrarian/pattern-interrupt, deadline/seat-scarcity, story/secret, and (when a live catalyst is supplied) a timely news/catalyst hook. Never the same hook reworded; no two consecutive ads share an angle.`,
  },
  {
    slug: "hotlist-warmup-emails",
    label: "Hotlist Warm-Up Emails",
    group: "Editorial",
    hotlist: true,
    defaultQty: 5,
    minQty: 3,
    maxQty: 8,
    perItem: true,
    batchSize: 5,
    tier: "opus",
    voice: "editorial",
    instructions: `Longer editorial "warm-up" emails (each ~400–700 words) sent in the days BEFORE the event to keep registrants engaged and hungry — teaching, teasing, and building anticipation WITHOUT fully revealing the event's payoff. Sequence them as a build (education → intrigue → proof/credibility → near-term urgency). Each: subject line + SSL + editorial body ending with a soft reminder of the event date and "[Sign off]". These keep people warm without burning the reveal.`,
  },
  {
    slug: "hotlist-text-ads",
    label: "Hotlist Text Ads",
    group: "Ad",
    hotlist: true,
    defaultQty: 10,
    minQty: 1,
    maxQty: 20,
    perItem: true,
    batchSize: 10,
    tier: "sonnet",
    voice: "third",
    instructions: `Very short text ads driving event registration. Headline (≤ ~60 chars) + 1–2 line description + registration CTA. Emphasize the event date and limited seats. Vary angles.`,
  },
  {
    slug: "hotlist-reminder-emails",
    label: "Hotlist Reminder Emails",
    group: "Email",
    hotlist: true,
    defaultQty: 3,
    minQty: 1,
    maxQty: 5,
    perItem: true,
    batchSize: 3,
    tier: "sonnet",
    voice: "third",
    instructions: `Short "the event is coming up" reminder emails for people already registered. Sequence: e.g. "1 day to go", "starting in a few hours", "we're live now — join". Each: subject line + SSL + a short urgent body with the join CTA and event date/time. End with "[Sign off]".`,
  },
];

export const ALL_COMPONENTS: ComponentSpec[] = [...STANDARD, ...HOTLIST];

export function getComponent(slug: string): ComponentSpec | undefined {
  return ALL_COMPONENTS.find((c) => c.slug === slug);
}

/** The components to generate for a run, given the Hotlist toggle. */
export function componentsForRun(includeHotlist: boolean): ComponentSpec[] {
  return ALL_COMPONENTS.filter((c) => (c.hotlist ? includeHotlist : true));
}

/**
 * Whether a component may weave in a live "active catalyst" (Stephen, 2026-07-11).
 * Scoped to lift notes and space ads — the timely, high-variety pieces.
 */
export function usesCatalysts(spec: ComponentSpec): boolean {
  return spec.slug.includes("lift-notes") || spec.slug.includes("space-ads");
}
