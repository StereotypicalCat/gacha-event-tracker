import type { CodesFeed, RedeemCode } from "../../../shared/codes.ts";
export function newCodes(
  feed: CodesFeed,
  seen: readonly string[],
  game: string,
): RedeemCode[] {
  const known = new Set(seen);
  return feed.codes.filter((c) => c.game === game && !known.has(c.id));
}
/**
 * Whether a code's stated expiry has passed. A date with no time ("Expires on
 * 2026-10-20") counts as passed only once that date has ended everywhere, at
 * 12:00 UTC the next day, so a code is never shown expired while it may
 * still redeem somewhere.
 */
export function codeExpired(code: RedeemCode, now: number): boolean {
  if (code.expiresAt) return Date.parse(code.expiresAt) <= now;
  if (code.expiresOn)
    return Date.parse(`${code.expiresOn}T00:00:00Z`) + 36 * 3600_000 <= now;
  return false;
}
/** Redeemed on every server the reader plays the game on. */
export function codeUsed(
  code: RedeemCode,
  accountIds: readonly string[],
  redeemed: Record<string, Record<string, unknown> | undefined>,
): boolean {
  return (
    accountIds.length > 0 &&
    accountIds.every((id) => Boolean(redeemed[id]?.[code.id]))
  );
}
/**
 * Codes the reader has not opened the game's Codes tab to see, and could
 * still use: the Settings games list marks a game with any.
 */
export function unseenUsableCodes(
  feed: CodesFeed,
  seen: readonly string[],
  game: string,
  accountIds: readonly string[],
  redeemed: Record<string, Record<string, unknown> | undefined>,
  now: number,
): RedeemCode[] {
  return newCodes(feed, seen, game).filter(
    (c) => !codeExpired(c, now) && !codeUsed(c, accountIds, redeemed),
  );
}
