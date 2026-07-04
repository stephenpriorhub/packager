/**
 * OxfordHub user identification for The Packager.
 *
 * The hub session cookie is domain-scoped to .oxfordhub.app, so the browser
 * sends it with every request to packager.oxfordhub.app. We forward it
 * server-side to the hub's /api/me (same pattern as promo-analyzer, vsl-builder,
 * mta-wiki) to resolve {id, email, name, role}.
 *
 * The Packager is ADMIN-ONLY for now: every mutating/generation route calls
 * requireAdmin(). Fail-closed — if the hub is unreachable, access is denied.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getEnv } from "./env";

const HUB_ME_URL =
  (getEnv("HUB_URL") ?? "https://oxfordhub.app") + "/api/me?projectId=packager";

export type HubRole = "super_admin" | "exec_admin" | "admin" | "user";

export interface HubUser {
  id: string;
  email: string;
  name: string | null;
  role: HubRole;
}

/** Server-to-server maintenance bypass (scripts / app-to-app send x-hub-token). */
function serviceUser(req: NextRequest): HubUser | null {
  const token = req.headers.get("x-hub-token");
  const expected = getEnv("HUB_API_TOKEN");
  if (!token || !expected || token !== expected) return null;
  return {
    id: "service",
    email: "service@oxfordhub.app",
    name: "Maintenance Script",
    role: "admin",
  };
}

/** Resolve the requesting user by forwarding their hub session cookie. */
export async function getHubUser(req: NextRequest): Promise<HubUser | null> {
  const svc = serviceUser(req);
  if (svc) return svc;
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  try {
    const res = await fetch(HUB_ME_URL, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      authenticated?: boolean;
      authorized?: boolean;
      user?: HubUser;
    };
    return data.authenticated && data.authorized && data.user ? data.user : null;
  } catch {
    return null;
  }
}

export function isHubAdmin(user: HubUser | null): boolean {
  return (
    !!user &&
    (user.role === "super_admin" || user.role === "exec_admin" || user.role === "admin")
  );
}

export function forbidden(
  message = "The Packager is restricted to OxfordHub admins."
): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Gate for every Packager route. Returns the admin user, or a 403 Response to
 * return directly. Usage:
 *   const gate = await requireAdmin(req);
 *   if (gate instanceof NextResponse) return gate;
 *   const user = gate;
 */
export async function requireAdmin(req: NextRequest): Promise<HubUser | NextResponse> {
  const user = await getHubUser(req);
  if (!isHubAdmin(user)) return forbidden();
  return user as HubUser;
}
