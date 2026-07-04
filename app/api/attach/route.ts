/**
 * Opt-in learning loop: attach the generated components back onto the analyzer
 * draft as supplemental files (one docx per component, tagged with its category).
 * Once the promo launches and gets performance data, the whole package becomes
 * labeled training data automatically — no extra work.
 *
 * Best-effort per component; reports how many attached.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/hub-auth";
import { getPackage } from "@/lib/package-store";
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

  const reviewId = pkg.brief.reviewId;
  const base = getEnv("PROMO_ANALYZER_URL");
  const token = getEnv("HUB_API_TOKEN");
  if (!reviewId) {
    return NextResponse.json(
      { error: "This promo wasn't registered in the analyzer, so there's nothing to attach to." },
      { status: 400 }
    );
  }
  if (!base || !token) {
    return NextResponse.json({ error: "Analyzer connection is not configured." }, { status: 500 });
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
