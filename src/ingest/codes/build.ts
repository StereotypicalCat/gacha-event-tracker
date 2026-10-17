import type { CodesFeed, RedeemCode } from "../../shared/codes.ts";
export function buildCodesFeed(
  previous: CodesFeed | null,
  parsed: readonly Omit<RedeemCode, "firstObservedAt">[],
  at: string,
): CodesFeed {
  const first = new Map(previous?.codes.map((c) => [c.id, c.firstObservedAt]));
  return {
    schemaVersion: 1,
    codes: parsed.map((c) => ({
      ...c,
      firstObservedAt: first.get(c.id) ?? at,
    })),
    sources: previous?.sources ?? [],
  };
}
