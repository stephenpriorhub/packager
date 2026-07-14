/**
 * Opt-in learning loop — triggered ONLY by the "Send to Analyzer" button on the
 * results screen, never automatically during generation.
 *
 * Two steps, both on demand:
 *   1. Register the promo as a Draft in the analyzer (if it isn't already), so it
 *      shows there with a 📦 and becomes labeled training data once it launches.
 *   2. Attach the generated components onto that draft as supplemental files
 *      (one docx per component, tagged with its category).
 *
 * Best-effort per component; reports how many attached.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/hub-auth";
import { getPackage, savePackage } from "@/lib/package-store";
import { registerDraft } from "@/lib/analyzer-client";
import { buildComponentDocx, safeFilename } from "@/lib/export-docx";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const { packageId } = (await req.json()) as { packageId: string };
  const pkg = getPackage(packageId);
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });

  const base = getEnv("PROMO_ANALYZER_URL");
  const token = getEnv("HUB_API_TOKEN");
  if (!base || !token) {
    return NextResponse.json({ error: "Analyzer connection is not configured." }, { status: 500 });
  }

  // Register the draft on demand if this package hasn't been sent yet.
  let reviewId = pkg.brief.reviewId;
  if (!reviewId) {
    reviewId = await registerDraft({
      title: pkg.brief.title,
      promoText: pkg.brief.promoFullText || pkg.brief.promoExcerpt,
      promoType: pkg.brief.promoType,
      publisher: pkg.brief.publisher,
      gurus: pkg.brief.gurus,
      product: pkg.brief.product,
      price: pkg.brief.price,
    });
    if (!reviewId) {
      return NextResponse.json(
        { error: "Couldn't register this package in the analyzer. Try again in a moment." },
        { status: 502 }
      );
    }
    pkg.brief.reviewId = reviewId;
    savePackage(pkg);
  }

  let attached = 0;
  const failed: string[] = [];

  for (const component of pkg.components) {
    if (component.error || component.items.length === 0) continue;
    try {
      const bytes = await buildComponentDocx(component, pkg.brief.title);
      const fd = new FormData();
      const blob = new Blob([bytes as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      fd.append("file", blob, `${safeFilename(component.label)}.docx`);
      fd.append("category", component.label);
      const res = await fetch(`${base}/api/files/${reviewId}/supplemental`, {
        method: "POST",
        headers: { "x-hub-token": token },
        body: fd,
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) attached++;
      else failed.push(component.label);
    } catch {
      failed.push(component.label);
    }
  }

  return NextResponse.json({ attached, failed, reviewId });
}
