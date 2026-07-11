/**
 * Generation engine — turns a brief + one component spec into finished copy.
 *
 * Handles: RAG exemplar lookup, batching high-count components to protect
 * quality, the mixed-voice 80/20 split for lift notes, the editorial guide's
 * live web search, and output parsing. Component generation is independent,
 * so the API route fans these out in parallel. No compliance pass — legal
 * review happens downstream by humans (Stephen's call, 2026-07-05).
 */

import type { ComponentSpec } from "./components";
import type { PackageBrief } from "./brief";
import type { MethodologyCorpus } from "./brain-reader";
import { type CatalystResult, NO_CATALYSTS } from "./catalysts";
import { getClient } from "./anthropic";
import { modelFor } from "./models";
import { buildComponentPrompt, ITEM_DELIM } from "./prompts/build";
import { buildRagBlock } from "./rag";

export interface GeneratedItem {
  text: string;
  voice?: "third" | "guru";
  /** set when this item is built around a live, related market catalyst */
  catalyst?: string;
}

export interface GeneratedComponent {
  slug: string;
  label: string;
  group: string;
  perItem: boolean;
  items: GeneratedItem[];
  error?: string;
}

/** Which item indices (0-based) are the guru-voice ones for a mixed component. */
function plannedVoices(spec: ComponentSpec, qty: number): ("third" | "guru")[] | null {
  if (spec.voice !== "mixed") return null;
  // ~20%, spread across the set (indices 2, 7, 12, …).
  return Array.from({ length: qty }, (_, i) => (i % 5 === 2 ? "guru" : "third"));
}

/** Strip a standalone "VOICE: xxx" line and report which voice it named. */
function extractVoice(text: string): { text: string; voice?: "third" | "guru" } {
  const m = text.match(/^\s*VOICE:\s*(guru|third)\s*$/im);
  const voice = m ? (m[1].toLowerCase() as "third" | "guru") : undefined;
  const cleaned = text.replace(/^\s*VOICE:\s*(guru|third)\s*$/im, "").trim();
  return { text: cleaned, voice };
}

/** Strip a standalone "ACTIVE CATALYST: xxx" tag and report which catalyst it named. */
function extractCatalyst(text: string): { text: string; catalyst?: string } {
  const m = text.match(/^\s*ACTIVE CATALYST:\s*(.+)$/im);
  const catalyst = m ? m[1].trim() : undefined;
  const cleaned = text.replace(/^\s*ACTIVE CATALYST:\s*.+$/im, "").trim();
  return { text: cleaned, catalyst };
}

function parseItems(raw: string): GeneratedItem[] {
  return raw
    .split(new RegExp(`^\\s*${ITEM_DELIM}\\s*$`, "m"))
    .map((s) => s.trim())
    .filter(Boolean)
    .map((block) => {
      const { text: v, voice } = extractVoice(block);
      const { text, catalyst } = extractCatalyst(v);
      return { text, voice, catalyst };
    });
}

async function callModel(
  system: string,
  user: string,
  maxTokens: number,
  model: string,
  useWebSearch: boolean
): Promise<string> {
  const client = getClient();
  const params: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (useWebSearch) {
    params.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = await client.messages.create(params as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (resp as any).content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n")
    .trim();
}

export async function generateComponent(
  spec: ComponentSpec,
  brief: PackageBrief,
  corpus: MethodologyCorpus,
  catalysts: CatalystResult = NO_CATALYSTS
): Promise<GeneratedComponent> {
  const base: Omit<GeneratedComponent, "items"> = {
    slug: spec.slug,
    label: spec.label,
    group: spec.group,
    perItem: spec.perItem,
  };

  try {
    const ragBlock = await buildRagBlock(spec, brief);
    const model = modelFor(spec.tier);

    let items: GeneratedItem[] = [];

    if (!spec.perItem) {
      const { system, user, maxTokens } = buildComponentPrompt(spec, brief, corpus, 1, 0, ragBlock, catalysts);
      const text = await callModel(system, user, maxTokens, model, !!spec.usesWebSearch);
      const { text: cleaned, voice } = extractVoice(text);
      items = [{ text: cleaned, voice }];
    } else {
      const qty = spec.defaultQty;
      const voices = plannedVoices(spec, qty);

      // Split into batches to protect quality / avoid truncation.
      const batches: { n: number; guruCount: number }[] = [];
      for (let start = 0; start < qty; start += spec.batchSize) {
        const n = Math.min(spec.batchSize, qty - start);
        const guruCount = voices
          ? voices.slice(start, start + n).filter((v) => v === "guru").length
          : 0;
        batches.push({ n, guruCount });
      }

      const results = await Promise.all(
        batches.map(({ n, guruCount }) => {
          const { system, user, maxTokens } = buildComponentPrompt(
            spec,
            brief,
            corpus,
            n,
            guruCount,
            ragBlock,
            catalysts
          );
          return callModel(system, user, maxTokens, model, !!spec.usesWebSearch).then(parseItems);
        })
      );
      items = results.flat();
    }

    return { ...base, items };
  } catch (err) {
    return {
      ...base,
      items: [],
      error: err instanceof Error ? err.message : "Generation failed",
    };
  }
}

/**
 * Regenerate a single component, optionally steered by copywriter feedback
 * (e.g. "more urgency").
 */
export async function regenerateComponent(
  spec: ComponentSpec,
  brief: PackageBrief,
  corpus: MethodologyCorpus,
  feedback: string,
  catalysts: CatalystResult = NO_CATALYSTS
): Promise<GeneratedComponent> {
  const steered: MethodologyCorpus = corpus;
  const briefWithFeedback: PackageBrief = feedback
    ? { ...brief, hooks: `${brief.hooks}\n\nCOPYWRITER FEEDBACK FOR THIS REGENERATION (apply it): ${feedback}` }
    : brief;
  return generateComponent(spec, briefWithFeedback, steered, catalysts);
}
