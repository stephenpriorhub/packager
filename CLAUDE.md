# The Packager — Copy Package Generator

Standalone OxfordHub app (Next.js 16). A copywriter uploads an **unlaunched promo**
and gets the full **copy package** back — one downloadable `.docx` per component
(lift notes, space ads, text ads, cart-abandon, exit popup, FB/YT ads, order
form, upsell, plus an **Editorial Guide**, and an optional **Hotlist** asset set).

- **Prod:** `packager.oxfordhub.app` (Railway, Nixpacks)
- **Access:** admin/super-admin only (hub auth). Every route calls `requireAdmin`.
- **Repo:** `git@github.com:stephenpriorhub/packager.git`

## Flow
1. **Upload → brief-first.** `lib/build-brief.ts` extracts the promo (`lib/extract-text.ts`),
   runs Claude to build a shared `PackageBrief` (big idea, offer, guru, hooks, and a
   compliance-critical **claim inventory**), and best-effort registers the promo in the
   **Promo Analyzer** as a Draft (`source: "packager"` → shows a 📦 there) via
   `lib/analyzer-client.ts` → `POST {analyzer}/api/packager/register`.
2. **One-click generate-all.** `app/api/generate/route.ts` streams NDJSON progress.
   `lib/generate.ts` writes each component (tiered models, batched, RAG exemplars,
   web search for the editorial guide) and runs the **claims gate** (`lib/claims-gate.ts`).
3. **Results.** Preview / per-component Regenerate-with-feedback / Download (.docx) /
   Download-all (.zip) / opt-in **Attach to analyzer draft** (`app/api/attach/route.ts`)
   which feeds the learning loop.

## Key modules
- `lib/components.ts` — the component registry (source of truth: qty, voice, model tier, batch, instructions).
- `lib/models.ts` — tiered models: Opus for high-stakes copy, Sonnet for high-volume shorts.
- `lib/brain-reader.ts` — live reads of the brain: lift guides (`.docx` via mammoth), sales-letter
  frameworks, guru voice profiles, claims principles, per-component auto-guides, social-tactics note.
- `lib/prompts/build.ts` — layered prompt assembly + the item output contract (`===ITEM===`).
- `lib/rag.ts` — few-shot exemplars pulled from the analyzer's best-performing past components.
- `lib/package-store.ts` — JSON store on `$DATA_DIR` (Railway volume).

## Voice rules (do not change without Stephen)
- Short copy (ads, popups, cart-abandon) → **always 3rd person**.
- Lift notes → **mixed**: ~80% generic 3rd person (body ends with `[Sign off]`), ~20% guru first-person.

## Compliance (non-negotiable)
Every prompt injects the claims-integrity guardrail (live vs. backtested vs. opinion framing,
no guarantees, no advisor claims). The claims gate re-checks each finished component.

## Env
See `.env.local.example`: `ANTHROPIC_API_KEY`, `HUB_URL`, `HUB_API_TOKEN`, `GITHUB_TOKEN`,
`BRAIN_GITHUB_REPO`, `PROMO_ANALYZER_URL`, `DATA_DIR`.

## Local dev
`npm install && npm run dev` (port 3005). Needs the env vars above; hub auth resolves the
logged-in OxfordHub user server-side by forwarding the session cookie.
