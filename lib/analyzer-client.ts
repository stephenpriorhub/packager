/**
 * Server-to-server client for the Promo Analyzer.
 *
 * Two jobs:
 *   1. Register a Packager-uploaded promo as a Draft review (so it shows in the
 *      analyzer with a 📦 and becomes labeled training data once it launches).
 *   2. Pull past promos + their attached components for RAG (see lib/rag.ts).
 *
 * All calls are best-effort and soft: if the analyzer is unreachable the
 * Packager still generates — it just loses the round-trip and RAG for that run.
 * Authenticates with the shared HUB_API_TOKEN via the x-hub-token header.
 */

import { getEnv } from "./env";

function analyzerBase(): string | null {
  return getEnv("PROMO_ANALYZER_URL") ?? null;
}

function authHeaders(): Record<string, string> {
  const token = getEnv("HUB_API_TOKEN");
  return token ? { "x-hub-token": token } : {};
}

export interface RegisterDraftInput {
  title: string;
  promoText: string;
  promoType?: string | null;
  publisher?: string | null;
  gurus?: string[];
  product?: string | null;
  price?: string | null;
}

/** Register the promo as a Draft in the analyzer. Returns the reviewId, or null. */
export async function registerDraft(input: RegisterDraftInput): Promise<string | null> {
  const base = analyzerBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/packager/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { reviewId?: string };
    return json.reviewId ?? null;
  } catch {
    return null;
  }
}

// ── RAG source data ───────────────────────────────────────────────────────────

export interface AnalyzerReviewSummary {
  id: string;
  displayName?: string | null;
  filename?: string;
  publisher?: string | null;
  gurus?: string[];
  promoType?: string | null;
  promoStatus?: string | null;
  source?: "packager" | null;
  hasPerformanceData?: boolean;
  effectivenessScore?: number | null;
  training?: {
    performanceScore?: number | null;
    isBestPerformer?: boolean;
  } | null;
  supplementalFiles?: Array<{ id: string; filename: string; category: string }>;
}

/** List all analyzer reviews (best-effort). */
export async function listReviews(): Promise<AnalyzerReviewSummary[]> {
  const base = analyzerBase();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/reviews`, {
      headers: { ...authHeaders() },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { reviews?: AnalyzerReviewSummary[] } | AnalyzerReviewSummary[];
    return Array.isArray(json) ? json : json.reviews ?? [];
  } catch {
    return [];
  }
}

/** Download a supplemental component file's text (best-effort). */
export async function fetchSupplementalText(
  reviewId: string,
  fileId: string,
  filename: string
): Promise<string | null> {
  const base = analyzerBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/files/${reviewId}/supplemental/${fileId}`, {
      headers: { ...authHeaders() },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { extractFile } = await import("./extract-text");
    const extracted = await extractFile(buf, filename);
    return extracted.type === "text" ? extracted.content : extracted.textForFK ?? null;
  } catch {
    return null;
  }
}
