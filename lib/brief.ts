/**
 * The shared "brief" every component is generated from.
 *
 * Built once per upload by running the promo through the Promo Analyzer's
 * extraction (see lib/build-brief.ts). Seeding all 60+ components from one brief
 * is what keeps the package internally consistent — same big idea, same offer,
 * same claim framing across every lift note, ad, and page.
 */

export interface PackageBrief {
  /** the promo / package name shown in the UI and docs */
  title: string;
  bigIdea: string;
  publisher: string | null;
  gurus: string[];
  /** the guru whose voice the ~20% of lifts should use */
  primaryGuru: string | null;
  product: string | null;
  price: string | null;
  /** offer summary: what's included, bonuses, guarantee, terms */
  offer: string;
  /** dominant emotional hooks / angles (fear, greed, curiosity, etc.) */
  hooks: string;
  /**
   * claim inventory: notable results/numbers in the promo and how each must be
   * framed (live-verified / backtested / forward-opinion). Drives compliance.
   */
  claimsInventory: string;
  audience: string;
  promoType: string | null;
  /** trimmed promo text, for grounding generation in the actual copy */
  promoExcerpt: string;
  /** the analyzer review id this promo was registered under (for round-trip) */
  reviewId: string | null;

  // ── Hotlist ────────────────────────────────────────────────────────────────
  isHotlist: boolean;
  eventName?: string;
  eventDate?: string;
}
