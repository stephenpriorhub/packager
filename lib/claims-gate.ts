/**
 * Claims-integrity gate — the compliance backstop.
 *
 * The guardrail is already injected into every generation prompt, but the gate
 * is an independent second pass that re-reads finished copy and flags any
 * claims-integrity violations (guaranteed returns, financial-advice framing,
 * backtested/projected numbers stated as real results, invented track records).
 * Findings surface on the results screen; a copywriter can one-click Regenerate
 * feeding the findings back as fix instructions. Owned/QA'd by the Claims
 * Integrity Agent.
 *
 * Runs on Sonnet (cheap) — one call per component. Soft: on any error it
 * returns "no findings" rather than blocking the package.
 */

import { getClient } from "./anthropic";
import { SONNET_MODEL } from "./models";

export interface ClaimsFinding {
  severity: "high" | "medium" | "low";
  quote: string;
  issue: string;
  fix: string;
}

const GATE_SYSTEM = `You are the Claims Integrity reviewer for Monument Traders Alliance, a financial newsletter PUBLISHER (not a registered advisor). Review promotional copy for compliance ONLY. Flag:
- Guaranteed or promised specific returns / "you will make $X".
- Financial-advice framing (should be "recommendations"/"trade ideas").
- Backtested or projected/hypothetical numbers presented as real, live, or achieved results (must be labeled as backtested/simulation/opinion).
- Invented or unverifiable track records, testimonials, or member results not grounded in the source.
- Missing risk context where specific gains are cited.
Do NOT flag style, tone, or persuasiveness. Only real compliance risks.`;

function parseFindings(text: string): ClaimsFinding[] {
  try {
    const cleaned = text.replace(/```(?:json)?/gi, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]") + 1;
    if (start === -1 || end <= start) return [];
    const arr = JSON.parse(cleaned.slice(start, end));
    return Array.isArray(arr) ? (arr as ClaimsFinding[]) : [];
  } catch {
    return [];
  }
}

/** Review one component's text. Returns [] when clean or on any failure. */
export async function reviewClaims(label: string, text: string): Promise<ClaimsFinding[]> {
  if (!text.trim()) return [];
  try {
    const client = getClient();
    const resp = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 1500,
      system: GATE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Review this "${label}" copy. Return ONLY a JSON array of findings (empty [] if fully compliant). Each finding: {"severity":"high|medium|low","quote":"the exact offending phrase","issue":"what's wrong","fix":"how to fix it"}.\n\n━━━ COPY ━━━\n${text.slice(0, 12000)}`,
        },
      ],
    });
    const out = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    return parseFindings(out);
  } catch {
    return [];
  }
}
