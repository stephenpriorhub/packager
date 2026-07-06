/**
 * Past packages.
 *   GET /api/packages          → list (id, createdAt, brief, componentCount)
 *   GET /api/packages?id=X     → full package (brief + all components)
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/hub-auth";
import { getPackage, listPackages } from "@/lib/package-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const pkg = getPackage(id);
    if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });
    return NextResponse.json({ package: pkg });
  }

  return NextResponse.json({ packages: listPackages() });
}
