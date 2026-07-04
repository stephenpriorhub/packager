/**
 * Export a package as .docx downloads.
 *   GET /api/export?packageId=X            → zip of every component
 *   GET /api/export?packageId=X&slug=Y     → a single component's .docx
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/hub-auth";
import { getPackage } from "@/lib/package-store";
import { buildComponentDocx, buildPackageZip, safeFilename } from "@/lib/export-docx";

export const runtime = "nodejs";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = new URL(req.url);
  const packageId = searchParams.get("packageId");
  const slug = searchParams.get("slug");
  if (!packageId) return NextResponse.json({ error: "packageId required" }, { status: 400 });

  const pkg = getPackage(packageId);
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });

  const title = pkg.brief.title;

  if (slug) {
    const component = pkg.components.find((c) => c.slug === slug);
    if (!component) return NextResponse.json({ error: "Component not found" }, { status: 404 });
    const bytes = await buildComponentDocx(component, title);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename="${safeFilename(component.label)}.docx"`,
      },
    });
  }

  const zip = await buildPackageZip(pkg.components, title);
  return new Response(zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeFilename(title) || "Copy Package"}.zip"`,
    },
  });
}
