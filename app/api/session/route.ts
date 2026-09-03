/**
 * Who am I? — lets the client hide admin-only UI (the Training Library tab).
 * Purely cosmetic: the training routes enforce the same rule server-side.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getHubUser, isHubAdmin } from "@/lib/hub-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getHubUser(req);
  return NextResponse.json({
    authenticated: !!user,
    isAdmin: isHubAdmin(user),
    user: user ? { email: user.email, name: user.name, role: user.role } : null,
  });
}
