/**
 * Hotlist Builder — one-click generate for a live-event campaign.
 *
 * Input: a hotlist SIGN-UP PAGE (required) + an optional promo, plus event
 * details. Builds an event-first brief (lib/build-hotlist-brief.ts) and streams
 * the selected hotlist assets (lift notes, space ads, text ads, and optionally
 * warm-up / reminder emails). Reuses the same generation engine, catalyst
 * lookup, package store, and NDJSON event contract as /api/generate — the
 * results/export/regenerate screens are identical.
 *
 * Events (one JSON object per line): status | brief | start | component | done | error
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireAdmin } from "@/lib/hub-auth";
import { extractFile } from "@/lib/extract-text";
import { buildHotlistBrief } from "@/lib/build-hotlist-brief";
import { loadMethodology } from "@/lib/brain-reader";
import { hotlistComponents, type ComponentSpec } from "@/lib/components";
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
  const signupFile = form.get("signup") as File | null;
  if (!signupFile) return NextResponse.json({ error: "No sign-up page provided" }, { status: 400 });
  const promoFile = form.get("promo") as File | null;

  const title =
    (form.get("title") as string)?.trim() || signupFile.name.replace(/\.[^.]+$/, "");
  const publisher = (form.get("publisher") as string) || null;
  const product = (form.get("product") as string) || null;
  const price = (form.get("price") as string) || null;
  const eventName = (form.get("eventName") as string) || undefined;
  const eventDate = (form.get("eventDate") as string) || undefined;

  // Which hotlist assets to generate.
  let assets: string[] = [];
  try {
    assets = JSON.parse((form.get("assets") as string) || "[]");
  } catch {
    /* ignore — hotlistComponents falls back to the defaults */
  }

  // Optional Advanced quantity overrides: JSON { slug: qty }
  let overrides: Record<string, number> = {};
  try {
    overrides = JSON.parse((form.get("quantities") as string) || "{}");
  } catch {
    /* ignore */
  }

  const signupBytes = Buffer.from(await signupFile.arrayBuffer());
  const signupName = signupFile.name;
  const promoBytes = promoFile ? Buffer.from(await promoFile.arrayBuffer()) : null;
  const promoName = promoFile?.name ?? null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        send({ type: "status", message: "Reading the sign-up page…" });
        const signup = await extractFile(signupBytes, signupName);
        const promo =
          promoBytes && promoName ? await extractFile(promoBytes, promoName) : null;

        send({ type: "status", message: "Analyzing the event and building the brief…" });
        const brief = await buildHotlistBrief(signup, promo, {
          title,
          publisher,
          product,
          price,
          eventName,
          eventDate,
        });
        send({ type: "brief", brief });

        const corpus = await loadMethodology(brief.primaryGuru);

        // Best-effort: live, related market catalysts. Hotlist lift notes and
        // space ads weave these in exactly like the VSL lift notes do.
        send({ type: "status", message: "Scanning for live, related market catalysts…" });
        const catalysts = await findActiveCatalysts(brief);
        if (catalysts.hasCatalysts) {
          send({ type: "status", message: "Found live catalysts — weaving them into lifts & space ads." });
        }

        // Selected assets, with quantity overrides clamped to each spec's min/max.
        const specs: ComponentSpec[] = hotlistComponents(assets).map((c) => {
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
          includeHotlist: true,
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
