import type { CodesFeed, RedeemCode } from "../../../shared/codes.ts";
export function newCodes(
  feed: CodesFeed,
  seen: readonly string[],
  game: string,
): RedeemCode[] {
  const known = new Set(seen);
  return feed.codes.filter((c) => c.game === game && !known.has(c.id));
}
