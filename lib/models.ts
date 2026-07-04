/**
 * Model tiers for The Packager.
 *
 * Tiered by stakes (Stephen's call): Opus carries the launch (lift notes,
 * guru-voice copy, order form, upsell, editorial guide); Sonnet handles the
 * high-volume, lower-variance pieces (text ads, space ads, FB text). Big
 * cost/speed win with minimal quality loss on the low-stakes pieces.
 */

export const OPUS_MODEL = "claude-opus-4-8";
export const SONNET_MODEL = "claude-sonnet-5";

export type ModelTier = "opus" | "sonnet";

export function modelFor(tier: ModelTier): string {
  return tier === "opus" ? OPUS_MODEL : SONNET_MODEL;
}
