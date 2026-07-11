/**
 * Live "active catalyst" lookup.
 *
 * Once per package run we ask Claude (with the web_search tool) whether there
 * are big, CURRENT market catalysts genuinely related to this promo's subject —
 * earnings, FDA/regulatory decisions, product launches, macro/policy events,
 * major breaking news on the tickers / sector / theme. Findings become a block
 * that lift notes and space ads may build an angle around, tagged "ACTIVE
 * CATALYST". Entirely best-effort: any failure returns no catalysts and
 * generation proceeds on evergreen angles alone.
 *
 * Stephen's rule (2026-07-11): catalysts must be genuinely live and related —
 * never invented, never forced. The web_search grounding is what keeps a
 * catalyst line from becoming an unverifiable claim.
 */

import type { PackageBrief } from "./brief";
import { getClient } from "./anthropic";
import { SONNET_MODEL } from "./models";

export interface CatalystResult {
  /** formatted block for prompt injection; empty when nothing live + related */
  block: string;
  hasCatalysts: boolean;
}

export const NO_CATALYSTS: CatalystResult = { block: "", hasCatalysts: false };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function findActiveCatalysts(brief: PackageBrief): Promise<CatalystResult> {
  const subject = [brief.title, brief.product, brief.bigIdea, brief.hooks]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  if (!subject.trim()) return NO_CATALYSTS;

  const today = todayISO();

  const system = `You are a financial research assistant for Monument Traders Alliance. Using web search, you find CURRENT market catalysts (events happening now or imminently) that are genuinely related to a promo's subject: earnings dates, FDA/regulatory decisions, product/tech launches, court rulings, macro/policy events, index rebalances, or major breaking news on the specific tickers, companies, sector, or theme. Today is ${today}. Only surface catalysts that are recent (within the last ~2 weeks) or clearly upcoming (next ~4 weeks) AND that a reader would recognize as tied to the promo's theme. If nothing clearly qualifies, say so plainly — do NOT stretch to force a connection.`;

  const user = `Here is the promo's subject. Search the web for any big, currently-active or imminent catalysts related to it.

━━━ PROMO SUBJECT ━━━
${subject}

Return up to 4 catalysts, each in exactly this shape:
CATALYST: <one-line headline>
WHEN: <date or timeframe>
WHY IT MATTERS: <one sentence tying it to the promo's theme>
SOURCE: <publication/site>

If there are NO genuinely live, related catalysts, return exactly the single line: NONE`;

  try {
    const client = getClient();
    const resp = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (resp as any).content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();

    // Require the structured marker; anything else (incl. "NONE") = no catalysts.
    if (!text || /^\s*NONE\s*$/i.test(text) || !/CATALYST:/i.test(text)) return NO_CATALYSTS;
    return { block: text, hasCatalysts: true };
  } catch {
    return NO_CATALYSTS;
  }
}
