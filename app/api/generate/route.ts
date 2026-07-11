/**
 * One-click generate-all. Streams NDJSON progress events so the UI can show a
 * live checklist while the 60+ pieces are written.
 *
 * Events (one JSON object per line):
 *   {type:"status", message}
 *   {type:"brief", brief}
 *   {type:"start", slug, label, index, total}
 *   {type:"component", component}       // a finished component
 *   {type:"done", packageId}
 *   {type:"error", message}
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireAdmin } from "@/lib/hub-auth";
import { extractFile } from "@/lib/extract-text";
import { buildBrief } from "@/lib/build-brief";
import { loadMethodology } from "@/lib/brain-reader";
import { componentsForRun, type ComponentSpec } from "@/lib/components";
import { findActiveCatalysts } from "@/lib/catalysts";
import { generateComponent } from "@/lib/generate";
import { runPool } from "@/lib/pool";
import { savePackage, updateComponent, type StoredPackage } from "@/lib/package-store";

export const runtime = "nodejs";
export const maxDuration = 800;

const COMPONENT_CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const user = gate;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No promo file provided" }, { status: 400 });

  const title = (form.get("title") as string)?.trim() || file.name.replace(/\.[^.]+$/, "");
  const publisher = (form.get("publisher") as string) || null;
  const product = (form.get("product") as string) || null;
  const price = (form.get("price") as string) || null;
  const includeHotlist = form.get("includeHotlist") === "true";
  const eventName = (form.get("eventName") as string) || undefined;
  const eventDate = (form.get("eventDate") as string) || undefined;

  // Optional Advanced quantity overrides: JSON { slug: qty }
  let overrides: Record<string, number> = {};
  try {
    overrides = JSON.parse((form.get("quantities") as string) || "{}");
  } catch {
    /* ignore */
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = file.name;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        send({ type: "status", message: "Reading your promo…" });
        const extracted = await extractFile(bytes, filename);

        send({ type: "status", message: "Analyzing the promo and building the brief…" });
        const brief = await buildBrief(extracted, {
          title,
          publisher,
          product,
          price,
          isHotlist: includeHotlist,
          eventName,
          eventDate,
        });
        send({ type: "brief", brief });

        const corpus = await loadMethodology(brief.primaryGuru);

        // Best-effort: look up live, related market catalysts once for the run.
        // Lift notes and space ads may weave these in (tagged "active catalyst").
        send({ type: "status", message: "Scanning for live, related market catalysts…" });
        const catalysts = await findActiveCatalysts(brief);
        if (catalysts.hasCatalysts) {
          send({ type: "status", message: "Found live catalysts — weaving them into lifts & space ads." });
        }

        // Apply quantity overrides (clamped to each spec's min/max).
        const specs: ComponentSpec[] = componentsForRun(includeHotlist).map((c) => {
          const o = overrides[c.slug];
          if (typeof o === "number" && c.perItem) {
            const qty = Math.max(c.minQty, Math.min(c.maxQty, Math.round(o)));
            return { ...c, defaultQty: qty };
          }
          return c;
        });

        const pkg: StoredPackage = {
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          createdBy: { id: user.id, email: user.email },
          includeHotlist,
          brief,
          components: [],
        };
        savePackage(pkg);

        const total = specs.length;
        let completed = 0;

        await runPool(specs, COMPONENT_CONCURRENCY, async (spec, index) => {
          send({ type: "start", slug: spec.slug, label: spec.label, index, total });
          const component = await generateComponent(spec, brief, corpus, catalysts);
          pkg.components.push(component);
          updateComponent(pkg.id, component);
          completed++;
          send({ type: "component", component, completed, total });
        });

        savePackage(pkg);
        send({ type: "done", packageId: pkg.id });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Generation failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
