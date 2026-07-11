/**
 * RAG over real past components.
 *
 * Two tiers:
 *   1. CURATED (preferred): the Training Library — components an admin explicitly
 *      ingested via "Use for training". Text is cached at ingest time, so reads
 *      are instant and generation never re-downloads/re-parses files.
 *   2. LIVE (fallback): auto-select from the analyzer's reviews that have a
 *      matching component attached, preferring best performers.
 *
 * Exemplars are ranked toward best-performers and matching guru/promo-type.
 * Entirely soft: with no training data and no analyzer, generation still runs.
 */

import type { ComponentSpec } from "./components";
import type { PackageBrief } from "./brief";
import {
  listReviews,
  fetchSupplementalText,
  type AnalyzerReviewSummary,
} from "./analyzer-client";
import { listTrainingEntries, componentItems, type TrainingEntry } from "./training-store";

const MAX_EXEMPLARS = 3;

/**
 * Per-item components (lifts, ads) are short — 1500 chars captures a whole
 * piece. Single-doc long-form pages (order form, upsell) need the full page
 * visible or the model never sees the structure it's meant to mirror.
 */
function exemplarChars(spec: ComponentSpec): number {
  return spec.perItem ? 1500 : 8000;
}

// Cache the live review list for the duration of a generation run.
let reviewCache: { at: number; reviews: AnalyzerReviewSummary[] } | null = null;
const CACHE_MS = 60_000;

async function getReviews(): Promise<AnalyzerReviewSummary[]> {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  if (reviewCache && now - reviewCache.at < CACHE_MS) return reviewCache.reviews;
  const reviews = await listReviews();
  reviewCache = { at: now, reviews };
  return reviews;
}

/** Does a supplemental-file category correspond to this component spec? */
export function categoryMatchesSpec(category: string, spec: ComponentSpec): boolean {
  const c = category.toLowerCase().trim();
  const label = spec.label.toLowerCase();
  if (c === label) return true;
  // "Exit Popup" spec ↔ "Exit Popup (VSL)" / "Exit Popup (Order Form)" categories
  if (spec.slug === "exit-popup" && c.startsWith("exit popup")) return true;
  // "Lifetime / Unlimited Upsell" tolerates spacing/slash variants + legacy "Upsell Page"
  if (spec.slug === "lifetime-upsell" && (c.includes("unlimited upsell") || c.includes("lifetime") || c === "upsell page"))
    return true;
  return false;
}

interface RankableSource {
  isBestPerformer: boolean;
  performanceScore: number | null;
  effectivenessScore: number | null;
  gurus: string[];
  publisher: string | null;
  promoType: string | null;
}

function rank(src: RankableSource, brief: PackageBrief): number {
  let s = 0;
  if (src.isBestPerformer) s += 5;
  s += (src.performanceScore ?? src.effectivenessScore ?? 0) / 2;
  if (brief.primaryGuru && src.gurus.some((g) => g === brief.primaryGuru)) s += 3;
  if (brief.publisher && src.publisher === brief.publisher) s += 2;
  if (brief.promoType && src.promoType === brief.promoType) s += 1;
  return s;
}

function formatExemplar(title: string, tierNote: string, gurus: string[], text: string, chars: number): string {
  return `— Example from "${title}" (${tierNote}${gurus.length ? `, ${gurus.join("/")}` : ""}):\n${text.slice(0, chars)}`;
}

/**
 * Curated exemplars from the Training Library (instant — cached text).
 *
 * Docs are stored as INDIVIDUAL items (one doc may hold 10 lifts), so we
 * round-robin across the ranked promos' item pools: exemplar #1 from the best
 * promo, #2 from the next, etc., cycling deeper if only one promo is trained.
 * That keeps the few-shot set diverse instead of three lifts from one doc.
 */
function curatedExemplars(spec: ComponentSpec, brief: PackageBrief): string[] {
  let entries: TrainingEntry[];
  try {
    entries = listTrainingEntries();
  } catch {
    return [];
  }
  const pools = entries
    .map((e) => ({
      entry: e,
      items: e.components
        .filter((c) => categoryMatchesSpec(c.category, spec))
        .flatMap((c) => componentItems(c)),
    }))
    .filter((x) => x.items.length > 0)
    .sort((a, b) => rank(b.entry, brief) - rank(a.entry, brief));

  const out: string[] = [];
  for (let round = 0; out.length < MAX_EXEMPLARS; round++) {
    let took = false;
    for (const { entry, items } of pools) {
      if (out.length >= MAX_EXEMPLARS) break;
      const item = items[round];
      if (item === undefined) continue;
      const tier = entry.isBestPerformer
        ? "best performer"
        : entry.hasPerformanceData
        ? "proven promo"
        : "trained example";
      out.push(formatExemplar(entry.title, tier, entry.gurus, item, exemplarChars(spec)));
      took = true;
    }
    if (!took) break; // all pools exhausted
  }
  return out;
}

/** Live fallback: auto-select from analyzer reviews with a matching component. */
async function liveExemplars(spec: ComponentSpec, brief: PackageBrief, needed: number): Promise<string[]> {
  let reviews: AnalyzerReviewSummary[];
  try {
    reviews = await getReviews();
  } catch {
    return [];
  }
  const candidates = reviews
    .filter((r) => (r.supplementalFiles ?? []).some((f) => categoryMatchesSpec(f.category, spec)))
    .sort(
      (a, b) =>
        rank(
          {
            isBestPerformer: !!b.training?.isBestPerformer,
            performanceScore: b.training?.performanceScore ?? null,
            effectivenessScore: b.effectivenessScore ?? null,
            gurus: b.gurus ?? [],
            publisher: b.publisher ?? null,
            promoType: b.promoType ?? null,
          },
          brief
        ) -
        rank(
          {
            isBestPerformer: !!a.training?.isBestPerformer,
            performanceScore: a.training?.performanceScore ?? null,
            effectivenessScore: a.effectivenessScore ?? null,
            gurus: a.gurus ?? [],
            publisher: a.publisher ?? null,
            promoType: a.promoType ?? null,
          },
          brief
        )
    );

  const out: string[] = [];
  for (const review of candidates) {
    if (out.length >= needed) break;
    const file = (review.supplementalFiles ?? []).find((f) => categoryMatchesSpec(f.category, spec));
    if (!file) continue;
    const text = await fetchSupplementalText(review.id, file.id, file.filename);
    if (!text) continue;
    const tier = review.training?.isBestPerformer ? "best performer" : "past promo";
    out.push(formatExemplar(review.displayName ?? review.filename ?? "a promo", tier, review.gurus ?? [], text, exemplarChars(spec)));
  }
  return out;
}

// ── Headline exemplars (Alternative Headlines) ─────────────────────────────────
//
// Different source from the component-doc RAG above: the analyzer already
// extracts every reviewed promo's eyebrow / main headline / subheadline (plus a
// 4 U's verdict) into `sections.headline`. We surface the best-performing ones
// FROM THE SAME PRICE TIER as the promo being packaged — Stephen's rule:
// frontends are cheap (< $500), backends are expensive. No separate training.

type PriceTier = "frontend" | "backend";

/** Stephen's threshold: frontends run under $500; everything pricier is a backend. */
const FRONTEND_MAX = 500;
const MAX_HEADLINE_EXEMPLARS = 5;

/** Lowest dollar figure in a price string — the ask price defines the tier. */
function parsePrice(s: string | null | undefined): number | null {
  if (!s) return null;
  const amts = [...s.matchAll(/\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
  return amts.length ? Math.min(...amts) : null;
}

/** Analyzer promo-type → tier (manual/curated type wins over a raw price guess). */
function tierFromType(promoType: string | null | undefined): PriceTier | null {
  if (!promoType) return null;
  const t = promoType.toLowerCase();
  if (t.includes("front")) return "frontend";
  if (t.includes("backend") || t.includes("mega")) return "backend";
  return null;
}

function tierOf(price: number | null, promoType: string | null | undefined): PriceTier | null {
  return tierFromType(promoType) ?? (price != null ? (price < FRONTEND_MAX ? "frontend" : "backend") : null);
}

function briefTier(brief: PackageBrief): PriceTier | null {
  return tierOf(parsePrice(brief.price), brief.promoType);
}

function headlineExemplars(brief: PackageBrief, reviews: AnalyzerReviewSummary[]): string[] {
  const want = briefTier(brief);
  const scored = reviews
    .filter((r) => (r.sections?.headline ?? "").trim().length > 0)
    .map((r) => ({
      r,
      tier: tierOf(r.pricePoint ?? null, r.promoType),
      score: rank(
        {
          isBestPerformer: !!r.training?.isBestPerformer,
          performanceScore: r.training?.performanceScore ?? null,
          effectivenessScore: r.effectivenessScore ?? null,
          gurus: r.gurus ?? [],
          publisher: r.publisher ?? null,
          promoType: r.promoType ?? null,
        },
        brief
      ),
    }));

  // Same-tier first; fall back to the whole pool so a thin analyzer still helps.
  const sameTier = want ? scored.filter((x) => x.tier === want) : [];
  const pool = (sameTier.length ? sameTier : scored).sort((a, b) => b.score - a.score);

  return pool.slice(0, MAX_HEADLINE_EXEMPLARS).map(({ r, tier }) => {
    const perf = r.training?.isBestPerformer
      ? "best performer"
      : r.hasPerformanceData
      ? "proven promo"
      : r.effectivenessScore != null
      ? `analyzer score ${r.effectivenessScore}`
      : "reviewed promo";
    const tierNote = tier ? `${tier} tier` : r.promoType ?? "tier n/a";
    const gurus = (r.gurus ?? []).length ? `, ${(r.gurus ?? []).join("/")}` : "";
    const name = r.displayName ?? r.filename ?? "a promo";
    return `— From "${name}" (${tierNote}, ${perf}${gurus}):\n${(r.sections?.headline ?? "").trim().slice(0, 1200)}`;
  });
}

/** Best-performing same-tier headline blocks from the analyzer. Empty if none. */
async function buildHeadlineRagBlock(brief: PackageBrief): Promise<string> {
  let reviews: AnalyzerReviewSummary[];
  try {
    reviews = await getReviews();
  } catch {
    return "";
  }
  return headlineExemplars(brief, reviews).join("\n\n");
}

/**
 * Build the few-shot exemplar block for one component. Curated pool first,
 * live auto-selection to fill remaining slots. Empty string when nothing found.
 */
export async function buildRagBlock(spec: ComponentSpec, brief: PackageBrief): Promise<string> {
  // Alternative Headlines learn from analyzer headline sections, not component docs.
  if (spec.slug === "alternative-headlines") return buildHeadlineRagBlock(brief);
  const curated = curatedExemplars(spec, brief);
  const exemplars = [...curated];
  if (exemplars.length < MAX_EXEMPLARS) {
    const live = await liveExemplars(spec, brief, MAX_EXEMPLARS - exemplars.length);
    exemplars.push(...live);
  }
  return exemplars.join("\n\n");
}
