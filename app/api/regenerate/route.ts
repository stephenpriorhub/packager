/**
 * Regenerate a single component, optionally steered by copywriter feedback
 * (e.g. "more urgency"). Updates the stored package and returns the fresh
 * component.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/hub-auth";
import { getPackage, updateComponent } from "@/lib/package-store";
import { getComponent, usesCatalysts } from "@/lib/components";
import { loadMethodology } from "@/lib/brain-reader";
import { findActiveCatalysts, NO_CATALYSTS } from "@/lib/catalysts";
import { regenerateComponent } from "@/lib/generate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const { packageId, slug, feedback } = (await req.json()) as {
    packageId: string;
    slug: string;
    feedback?: string;
  };

  const pkg = getPackage(packageId);
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });

  const spec = getComponent(slug);
  if (!spec) return NextResponse.json({ error: "Unknown component" }, { status: 400 });

  // Preserve any Advanced quantity override this package used for the component.
  const prev = pkg.components.find((c) => c.slug === slug);
  const runSpec =
    prev && prev.perItem && prev.items.length > 0
      ? { ...spec, defaultQty: Math.max(spec.minQty, Math.min(spec.maxQty, prev.items.length)) }
      : spec;

  const corpus = await loadMethodology(pkg.brief.primaryGuru);
  const catalysts = usesCatalysts(runSpec) ? await findActiveCatalysts(pkg.brief) : NO_CATALYSTS;
  const component = await regenerateComponent(runSpec, pkg.brief, corpus, feedback ?? "", catalysts);
  updateComponent(packageId, component);

  return NextResponse.json({ component });
}
