/**
 * Brain Reader (The Packager)
 *
 * Pulls the LIVE copy methodology from the MTA brain vault and assembles it into
 * blocks injected into each component-generation prompt. This is how The
 * Packager writes like MTA instead of like generic AI:
 *
 *   - Lift-note craft            → Areas/Copy/Lift Note (Email) Writing Guides/*.docx
 *   - Sales-letter frameworks    → Areas/Copy/Writing Promos (Sales Letters)/*.md
 *   - Guru voice profiles        → Resources/Experts/{Guru}.md
 *   - Claims-integrity rules     → Resources/Promo Analysis/Copywriting Principles.md
 *   - Per-component guides (auto-authored, may not exist yet)
 *                                → Areas/Copy/Component Guides/{slug}.md
 *   - Current social tactics     → Resources/Copy Tactics/Social Ad Tactics.md
 *
 * GitHub Contents API first (works on Railway where the vault isn't mounted),
 * local filesystem fallback for dev. Every read is soft — a missing file
 * degrades gracefully and never throws, so the brain can never break the product.
 * Guides are large and change rarely, so successful reads are cached in-process.
 */

import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { getEnv } from "./env";

const BRAIN_DIR =
  getEnv("BRAIN_DIR")?.replace(/\/(Areas|Resources)\/.*$/, "") ??
  "/Users/stephenprior/github/brain";

const BRAIN_GITHUB_REPO = getEnv("BRAIN_GITHUB_REPO") ?? "stephenpriorhub/brain";

// Guru display name → vault profile filename (Resources/Experts/{file}).
const GURU_MAP: Record<string, string> = {
  "Bryan Bottarelli": "Bryan Bottarelli.md",
  "Karim Rahemtulla": "Karim Rahemtulla.md",
  "Nate Bear": "Nate Bear.md",
  "Chris Johnson": "Chris Johnson.md",
};

const LIFT_GUIDE_DIR = "Areas/Copy/Lift Note (Email) Writing Guides";
const LIFT_GUIDES = [
  "AI Lift Prompt Guide.docx",
  "Conley's Lift Guide.docx",
  "Your Masterkey To Success -- How To... (1).docx",
];

const SALES_LETTER_DIR = "Areas/Copy/Writing Promos (Sales Letters)";
const SALES_LETTER_FILES = ["16-Word Sales Letter.md", "Copy-Boarding System.md"];

const PRINCIPLES_REL = "Resources/Promo Analysis/Copywriting Principles.md";
const SOCIAL_TACTICS_REL = "Resources/Copy Tactics/Social Ad Tactics.md";
const COMPONENT_GUIDE_DIR = "Areas/Copy/Component Guides";

// ── low-level reads ─────────────────────────────────────────────────────────

const cache = new Map<string, string | null>();

function localPathFor(relPath: string): string {
  return path.join(BRAIN_DIR, relPath);
}

/** Fetch raw bytes for a vault file: GitHub Contents API first, local fallback. */
async function readVaultBuffer(relPath: string): Promise<Buffer | null> {
  const token = getEnv("GITHUB_TOKEN");
  if (token) {
    try {
      const url = `https://api.github.com/repos/${BRAIN_GITHUB_REPO}/contents/${relPath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "packager",
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as { content?: string };
        if (json.content) return Buffer.from(json.content, "base64");
      }
    } catch {
      /* fall through to local */
    }
  }
  try {
    const p = localPathFor(relPath);
    if (fs.existsSync(p)) return fs.readFileSync(p);
  } catch {
    /* ignore */
  }
  return null;
}

/** Read a vault file as text. `.docx` is parsed via mammoth; everything else utf-8. */
async function readVaultText(relPath: string): Promise<string | null> {
  if (cache.has(relPath)) return cache.get(relPath) ?? null;
  const buf = await readVaultBuffer(relPath);
  let text: string | null = null;
  if (buf) {
    try {
      if (relPath.toLowerCase().endsWith(".docx")) {
        const result = await mammoth.extractRawText({ buffer: buf });
        text = result.value?.trim() || null;
      } else {
        text = buf.toString("utf-8");
      }
    } catch {
      text = null;
    }
  }
  cache.set(relPath, text);
  return text;
}

function stripObsidianMarkup(text: string): string {
  return text
    .replace(/^---[\s\S]*?---\n/, "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/^>\s*\[!.*?\]\s*$/gm, "")
    .trim();
}

function clip(text: string, max = 6000): string {
  const cleaned = stripObsidianMarkup(text);
  return cleaned.length > max ? cleaned.slice(0, max) + "\n…(truncated)" : cleaned;
}

// ── guru detection ──────────────────────────────────────────────────────────

export function detectGuru(text: string): string | null {
  const hay = text.toLowerCase();
  for (const guru of Object.keys(GURU_MAP)) {
    const [first, last] = guru.split(" ");
    if (
      hay.includes(guru.toLowerCase()) ||
      hay.includes(last.toLowerCase()) ||
      hay.includes(first.toLowerCase())
    ) {
      return guru;
    }
  }
  return null;
}

// ── public corpus loaders ────────────────────────────────────────────────────

export interface MethodologyCorpus {
  principles: string | null; // claims-integrity + MTA copy principles
  liftGuides: string[]; // parsed lift-note guides
  salesLetterGuides: string[]; // 16-word / copy-boarding frameworks
  guru: string | null;
  guruProfile: string | null;
  socialTactics: string | null;
}

/**
 * Load the shared methodology corpus once per generation run. All reads run in
 * parallel; each is independently soft.
 */
export async function loadMethodology(guru: string | null): Promise<MethodologyCorpus> {
  const [principles, liftGuides, salesLetterGuides, guruProfile, socialTactics] =
    await Promise.all([
      readVaultText(PRINCIPLES_REL),
      Promise.all(LIFT_GUIDES.map((f) => readVaultText(`${LIFT_GUIDE_DIR}/${f}`))).then(
        (arr) => arr.filter((x): x is string => !!x)
      ),
      Promise.all(
        SALES_LETTER_FILES.map((f) => readVaultText(`${SALES_LETTER_DIR}/${f}`))
      ).then((arr) => arr.filter((x): x is string => !!x)),
      guru && GURU_MAP[guru]
        ? readVaultText(`Resources/Experts/${GURU_MAP[guru]}`)
        : Promise.resolve(null),
      readVaultText(SOCIAL_TACTICS_REL),
    ]);

  return { principles, liftGuides, salesLetterGuides, guru, guruProfile, socialTactics };
}

/** Auto-authored per-component guide, if one exists for this component slug. */
export async function loadComponentGuide(slug: string): Promise<string | null> {
  return readVaultText(`${COMPONENT_GUIDE_DIR}/${slug}.md`);
}

/**
 * The claims-integrity guardrail block. Injected into EVERY component prompt.
 * Falls back to a hard-coded rule set when the vault file can't be read, so
 * compliance guardrails are never silently dropped.
 */
export function buildClaimsGuardrail(principles: string | null): string {
  const base = [
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "CLAIMS INTEGRITY — NON-NEGOTIABLE (Monument Traders Alliance)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "MTA is a trading/newsletter PUBLISHER, not a registered financial advisor.",
    "Every generated component MUST obey:",
    "• Frame results by evidence tier: LIVE/VERIFIED results stated plainly;",
    "  BACKTESTED results labeled ('back-testing shows…', 'in simulations…');",
    "  FORWARD PROJECTIONS as opinion only ('could potentially…', 'there's every",
    "  chance I'm wrong…'). Never present backtested or projected numbers as real.",
    "• NO guarantee of gains or specific returns. NO 'financial advice' framing —",
    "  these are 'recommendations' / 'trade ideas'.",
    "• Include appropriate risk language where results are cited (past performance",
    "  ≠ future results; you could lose money).",
    "• Never invent track-record numbers, testimonials, or member results. Only use",
    "  claims that appear in the source promo / brief.",
  ];
  if (principles) {
    base.push(
      "",
      "Live curated principles from the MTA brain (supersede generic instinct):",
      clip(principles, 4000)
    );
  }
  return base.join("\n");
}

/** Assemble the lift-note craft block from the parsed guides. */
export function buildLiftCraftBlock(corpus: MethodologyCorpus): string {
  if (corpus.liftGuides.length === 0) return "";
  const joined = corpus.liftGuides.map((g) => clip(g, 4000)).join("\n\n---\n\n");
  return [
    "\n### LIFT-NOTE CRAFT (from the MTA brain lift guides)",
    "Apply these guides — the D.I.C. method (Disrupt → Intrigue → Click), curiosity",
    "gaps, the 4 U's for subject lines, and 'don't steal the promo's thunder':",
    "",
    joined,
  ].join("\n");
}

/** Assemble the sales-letter framework block (used for order form + upsell). */
export function buildSalesLetterBlock(corpus: MethodologyCorpus): string {
  if (corpus.salesLetterGuides.length === 0) return "";
  const joined = corpus.salesLetterGuides.map((g) => clip(g, 3500)).join("\n\n---\n\n");
  return ["\n### SALES-LETTER FRAMEWORKS (from the MTA brain)", "", joined].join("\n");
}

/** Guru voice block — used for the ~20% of lifts written in the guru's voice. */
export function buildGuruVoiceBlock(corpus: MethodologyCorpus): string {
  if (!corpus.guru || !corpus.guruProfile) return "";
  return [
    `\n### GURU VOICE — ${corpus.guru}`,
    "When a piece is written in the guru's first-person voice, match this profile",
    "(tone, origin story, signature phrases, what works / what to avoid):",
    "",
    clip(corpus.guruProfile, 4000),
  ].join("\n");
}
