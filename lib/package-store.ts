/**
 * Package persistence — a JSON file on the Railway volume ($DATA_DIR).
 *
 * Mirrors vsl-builder's projects-store pattern. Each package holds the brief and
 * every generated component, so the results screen survives reloads, regenerate
 * can reload the brief, and export can rebuild docs on demand.
 */

import fs from "fs";
import path from "path";
import { getEnv } from "./env";
import type { PackageBrief } from "./brief";
import type { GeneratedComponent } from "./generate";

const DATA_DIR = getEnv("DATA_DIR") ?? path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "packages.json");

export interface StoredPackage {
  id: string;
  createdAt: string;
  createdBy: { id: string; email: string } | null;
  includeHotlist: boolean;
  brief: PackageBrief;
  components: GeneratedComponent[];
}

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function readAll(): StoredPackage[] {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as StoredPackage[];
  } catch {
    return [];
  }
}

function writeAll(pkgs: StoredPackage[]) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(pkgs, null, 2));
}

export function savePackage(pkg: StoredPackage): void {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === pkg.id);
  if (idx === -1) all.push(pkg);
  else all[idx] = pkg;
  writeAll(all);
}

export function getPackage(id: string): StoredPackage | null {
  return readAll().find((p) => p.id === id) ?? null;
}

export function updateComponent(packageId: string, component: GeneratedComponent): void {
  const all = readAll();
  const pkg = all.find((p) => p.id === packageId);
  if (!pkg) return;
  const idx = pkg.components.findIndex((c) => c.slug === component.slug);
  if (idx === -1) pkg.components.push(component);
  else pkg.components[idx] = component;
  writeAll(all);
}

export function listPackages(): Array<Pick<StoredPackage, "id" | "createdAt" | "brief">> {
  return readAll()
    .map((p) => ({ id: p.id, createdAt: p.createdAt, brief: p.brief }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
