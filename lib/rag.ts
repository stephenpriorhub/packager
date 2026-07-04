/**
 * RAG over the analyzer's real past components.
 *
 * For a given component, pull 1–3 examples of that SAME component type from real
 * past promos — preferring best-performers and matching guru/promo-type — and
 * format them as few-shot exemplars for the generation prompt. This is how The
 * Packager learns "what actually converted for MTA" instead of writing generic
 * copy. Entirely soft: if the analyzer is unreachable, generation still runs
 * (just without exemplars).
 */

import type { ComponentSpec } from "./components";
import type { PackageBrief } from "./brief";
import {
  listReviews,
  fetchSupplementalText,
  type AnalyzerReviewSummary,
} from "./analyzer-client";

const MAX_EXEMPLARS = 3;
const EXEMPLAR_CHARS = 1500;

// Cache the review list for the duration of a generation run (many components
// query it). Short in-process TTL.
let reviewCache: { at: number; reviews: AnalyzerReviewSummary[] } | null = null;
const CACHE_MS = 60_000;

async function getReviews(): Promise<AnalyzerReviewSummary[]> {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  if (reviewCache && now - reviewCache.at < CACHE_MS) return reviewCache.reviews;
  const reviews = await listReviews();
  reviewCache = { at: now, reviews };
  return reviews;
}

/** Does a supplemental file's category correspond to this component? */
function categoryMatches(category: string, spec: ComponentSpec): boolean {
  const c = category.toLowerCase();
  const label = spec.label.toLowerCase();
  if (c === label) return true;
  // "Exit Popup" spec ↔ "Exit Popup (VSL)" / "Exit Popup (Order Form)" categories
  if (spec.slug === "exit-popup" && c.startsWith("exit popup")) return true;
  return false;
}

/** Rank a review's relevance to this brief (higher = better exemplar source). */
function score(review: AnalyzerReviewSummary, brief: PackageBrief): number {
  let s = 0;
  if (review.training?.isBestPerformer) s += 5;
  const perf = review.training?.performanceScore ?? review.effectivenessScore ?? 0;
  s += (perf ?? 0) / 2;
  if (brief.primaryGuru && review.gurus?.some((g) => g === brief.primaryGuru)) s += 3;
  if (brief.publisher && review.publisher === brief.publisher) s += 2;
  if (brief.promoType && review.promoType === brief.promoType) s += 1;
  return s;
}

/**
 * Build a few-shot exemplar block for one component. Empty string when nothing
 * relevant is found.
 */
export async function buildRagBlock(spec: ComponentSpec, brief: PackageBrief): Promise<string> {
  let reviews: AnalyzerReviewSummary[];
  try {
    reviews = await getReviews();
  } catch {
    return "";
  }
  if (reviews.length === 0) return "";

  // Reviews that actually have a file of this component type, ranked.
  const candidates = reviews
    .filter((r) => (r.supplementalFiles ?? []).some((f) => categoryMatches(f.category, spec)))
    .sort((a, b) => score(b, brief) - score(a, brief));

  const exemplars: string[] = [];
  for (const review of candidates) {
    if (exemplars.length >= MAX_EXEMPLARS) break;
    const file = (review.supplementalFiles ?? []).find((f) => categoryMatches(f.category, spec));
    if (!file) continue;
    const text = await fetchSupplementalText(review.id, file.id, file.filename);
    if (!text) continue;
    const tier = review.training?.isBestPerformer ? "best performer" : "past promo";
    exemplars.push(
      `— Example from "${review.displayName ?? review.filename ?? "a"}" (${tier}${
        review.gurus?.length ? `, ${review.gurus.join("/")}` : ""
      }):\n${text.slice(0, EXEMPLAR_CHARS)}`
    );
  }

  return exemplars.join("\n\n");
}
