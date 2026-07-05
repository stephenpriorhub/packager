/**
 * Training library — the curated example pool The Packager learns from.
 *
 * When an admin clicks "Use for training" on an analyzer promo, we fetch every
 * attached component file, extract its text ONCE, and cache it here (JSON on
 * the Railway volume). Generation-time RAG then reads these cached exemplars
 * instantly — no re-downloading or re-parsing docx/PDFs per run — and prefers
 * this curated pool over the live auto-selected fallback.
 */

import fs from "fs";
import path from "path";
import { getEnv } from "./env";

const DATA_DIR = getEnv("DATA_DIR") ?? path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "training.json");

export interface TrainedComponent {
  category: string; // analyzer supplemental category (≈ component label)
  filename: string;
  /**
   * The individual pieces in this document. Real example docs usually hold
   * many items (e.g. 10 lifts in one Word doc) — they're split at ingest so
   * each lift/ad is its own retrievable training example.
   */
  items: string[];
  /** legacy single-blob field from pre-split entries */
  text?: string;
}

/** Individual items of a component, tolerating legacy pre-split entries. */
export function componentItems(c: TrainedComponent): string[] {
  if (c.items && c.items.length > 0) return c.items;
  return c.text ? [c.text] : [];
}

export interface TrainingEntry {
  reviewId: string;
  title: string;
  publisher: string | null;
  gurus: string[];
  promoType: string | null;
  performanceScore: number | null;
  effectivenessScore: number | null;
  isBestPerformer: boolean;
  hasPerformanceData: boolean;
  components: TrainedComponent[];
  promoExcerpt: string | null; // the promo's own copy, for context
  ingestedAt: string;
  ingestedBy: string | null;
}

function readAll(): TrainingEntry[] {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as TrainingEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: TrainingEntry[]) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(entries, null, 2));
}

export function listTrainingEntries(): TrainingEntry[] {
  return readAll();
}

export function getTrainingEntry(reviewId: string): TrainingEntry | null {
  return readAll().find((e) => e.reviewId === reviewId) ?? null;
}

export function upsertTrainingEntry(entry: TrainingEntry): void {
  const all = readAll();
  const idx = all.findIndex((e) => e.reviewId === entry.reviewId);
  if (idx === -1) all.push(entry);
  else all[idx] = entry;
  writeAll(all);
}

export function removeTrainingEntry(reviewId: string): boolean {
  const all = readAll();
  const next = all.filter((e) => e.reviewId !== reviewId);
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}
