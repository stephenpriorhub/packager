import fs from "fs";
import path from "path";

/**
 * Read an env var, falling back to a fresh read of .env.local on every call.
 * Ported from vsl-builder / promo-analyzer — avoids Turbopack module-init cwd
 * issues in dev. In production every value comes from process.env (Railway).
 */
export function getEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const content = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0 && line.slice(0, eq).trim() === key) {
        return line.slice(eq + 1).trim();
      }
    }
  } catch {}
  return undefined;
}
