/**
 * Training Library API.
 *
 *   GET    → the library view: every analyzer promo (live list) merged with its
 *            trained status, plus a coverage summary per component type.
 *   POST   → { reviewId } "Use for training": fetch + extract every attached
 *            component file once, cache in the training store.
 *   DELETE → ?reviewId=X  remove from the training pool.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/hub-auth";
import { listReviews, fetchSupplementalText } from "@/lib/analyzer-client";
import {
  listTrainingEntries,
  upsertTrainingEntry,
  removeTrainingEntry,
  type TrainedComponent,
} from "@/lib/training-store";
import { ALL_COMPONENTS } from "@/lib/components";
import { categoryMatchesSpec } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const [reviews, trained] = await Promise.all([
    listReviews(),
    Promise.resolve(listTrainingEntries()),
  ]);
  const trainedById = new Map(trained.map((e) => [e.reviewId, e]));

  const rows = reviews
    .map((r) => {
      const files = r.supplementalFiles ?? [];
      const entry = trainedById.get(r.id);
      return {
        reviewId: r.id,
        title: r.displayName || r.filename || r.id,
        publisher: r.publisher ?? null,
        gurus: r.gurus ?? [],
        promoType: r.promoType ?? null,
        promoStatus: r.promoStatus ?? null,
        fromPackager: r.source === "packager",
        hasPerformanceData: !!r.hasPerformanceData,
        performanceScore: r.training?.performanceScore ?? null,
        isBestPerformer: !!r.training?.isBestPerformer,
        effectivenessScore: r.effectivenessScore ?? null,
        componentCount: files.length,
        categories: [...new Set(files.map((f) => f.category))],
        trained: !!entry,
        trainedComponentCount: entry?.components.length ?? 0,
        ingestedAt: entry?.ingestedAt ?? null,
      };
    })
    // Promos with components first, then by performance signal.
    .sort((a, b) => {
      if (a.trained !== b.trained) return a.trained ? -1 : 1;
      if ((a.componentCount > 0) !== (b.componentCount > 0)) return a.componentCount > 0 ? -1 : 1;
      return (b.performanceScore ?? b.effectivenessScore ?? 0) - (a.performanceScore ?? a.effectivenessScore ?? 0);
    });

  // Coverage: for each component type, how many trained exemplars exist?
  const coverage = ALL_COMPONENTS.map((spec) => {
    let count = 0;
    for (const entry of trained) {
      count += entry.components.filter((c) => categoryMatchesSpec(c.category, spec)).length;
    }
    return { slug: spec.slug, label: spec.label, hotlist: spec.hotlist, exemplars: count };
  });

  return NextResponse.json({ rows, coverage });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const user = gate;

  const { reviewId } = (await req.json()) as { reviewId: string };
  if (!reviewId) return NextResponse.json({ error: "reviewId required" }, { status: 400 });

  const reviews = await listReviews();
  const review = reviews.find((r) => r.id === reviewId);
  if (!review) return NextResponse.json({ error: "Promo not found in the analyzer" }, { status: 404 });

  const files = review.supplementalFiles ?? [];
  if (files.length === 0) {
    return NextResponse.json(
      { error: "This promo has no components attached yet. Upload them in the analyzer's Documents tab first." },
      { status: 400 }
    );
  }

  // Extract every component's text now, once.
  const components: TrainedComponent[] = [];
  const failed: string[] = [];
  for (const f of files) {
    const text = await fetchSupplementalText(reviewId, f.id, f.filename);
    if (text && text.trim()) {
      components.push({ category: f.category, filename: f.filename, text: text.slice(0, 20000) });
    } else {
      failed.push(f.filename);
    }
  }

  if (components.length === 0) {
    return NextResponse.json(
      { error: `Couldn't read any of the ${files.length} attached file(s) — they may be image-only PDFs.` },
      { status: 422 }
    );
  }

  upsertTrainingEntry({
    reviewId,
    title: review.displayName || review.filename || reviewId,
    publisher: review.publisher ?? null,
    gurus: review.gurus ?? [],
    promoType: review.promoType ?? null,
    performanceScore: review.training?.performanceScore ?? null,
    effectivenessScore: review.effectivenessScore ?? null,
    isBestPerformer: !!review.training?.isBestPerformer,
    hasPerformanceData: !!review.hasPerformanceData,
    components,
    promoExcerpt: null,
    ingestedAt: new Date().toISOString(),
    ingestedBy: user.email,
  });

  return NextResponse.json({ ok: true, ingested: components.length, failed });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = new URL(req.url);
  const reviewId = searchParams.get("reviewId");
  if (!reviewId) return NextResponse.json({ error: "reviewId required" }, { status: 400 });
  const removed = removeTrainingEntry(reviewId);
  return NextResponse.json({ ok: removed });
}
