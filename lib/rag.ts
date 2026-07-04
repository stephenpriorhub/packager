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
import { listTrainingEntries, type TrainingEntry } from "./training-store";

const MAX_EXEMPLARS = 3;
const EXEMPLAR_CHARS = 1500;

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

function formatExemplar(title: string, tierNote: string, gurus: string[], text: string): string {
  return `— Example from "${title}" (${tierNote}${gurus.length ? `, ${gurus.join("/")}` : ""}):\n${text.slice(0, EXEMPLAR_CHARS)}`;
}

/** Curated exemplars from the Training Library (instant — cached text). */
function curatedExemplars(spec: ComponentSpec, brief: PackageBrief): string[] {
  let entries: TrainingEntry[];
  try {
    entries = listTrainingEntries();
  } catch {
    return [];
  }
  const withMatch = entries
    .map((e) => ({
      entry: e,
      matches: e.components.filter((c) => categoryMatchesSpec(c.category, spec)),
    }))
    .filter((x) => x.matches.length > 0)
    .sort(
      (a, b) =>
        rank(
          { ...b.entry, gurus: b.entry.gurus },
          brief
        ) -
        rank({ ...a.entry, gurus: a.entry.gurus }, brief)
    );

  const out: string[] = [];
  for (const { entry, matches } of withMatch) {
    for (const m of matches) {
      if (out.length >= MAX_EXEMPLARS) return out;
      const tier = entry.isBestPerformer
        ? "best performer"
        : entry.hasPerformanceData
        ? "proven promo"
        : "trained example";
      out.push(formatExemplar(entry.title, tier, entry.gurus, m.text));
    }
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
    out.push(formatExemplar(review.displayName ?? review.filename ?? "a promo", tier, review.gurus ?? [], text));
  }
  return out;
}

/**
 * Build the few-shot exemplar block for one component. Curated pool first,
 * live auto-selection to fill remaining slots. Empty string when nothing found.
 */
export async function buildRagBlock(spec: ComponentSpec, brief: PackageBrief): Promise<string> {
  const curated = curatedExemplars(spec, brief);
  const exemplars = [...curated];
  if (exemplars.length < MAX_EXEMPLARS) {
    const live = await liveExemplars(spec, brief, MAX_EXEMPLARS - exemplars.length);
    exemplars.push(...live);
  }
  return exemplars.join("\n\n");
}
